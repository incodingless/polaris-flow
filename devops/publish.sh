#!/usr/bin/env bash
# Polaris Flow 手动发布脚本（维护者侧，固化《发布操作指南》通道 A）
#
# 用法:
#   ./devops/publish.sh                    # 完整流程：检查 → 干跑 → 确认 → 发布 → 验证
#   ./devops/publish.sh --dry-run          # 只检查到干跑为止，不发任何包
#   ./devops/publish.sh --yes              # 跳过交互确认
#   ./devops/publish.sh --allow-dirty      # 允许工作区有未提交改动
#   ./devops/publish.sh --force            # 该版本已存在时仍发布（Nexus Allow Redeploy 会覆盖）
#   ./devops/publish.sh --registry <url>   # 换发布目标，默认公司 Nexus npm-hosted
#
# 职责: 把「版本一致性 → git 状态 → 重复发布检测 → 认证检查 → 文件清单 → 发布 → 验证」
#       串成一条命令，任何一步不合格就停在发布之前。
#
# 注意: 凭据不在本脚本内，读的是 ~/.npmrc（npm login 或 Basic _auth 写入，见发布指南 A-1）。
# 兼容 macOS / Linux / Windows Git Bash。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PKG="polaris-flow"
DEFAULT_REGISTRY="http://192.168.103.96:8081/repository/npm-hosted/"
GROUP_REGISTRY="http://192.168.103.96:8081/repository/npm-group/"
MIN_NODE_MAJOR=20

DRY_RUN=false
ASSUME_YES=false
ALLOW_DIRTY=false
FORCE=false
REGISTRY="$DEFAULT_REGISTRY"
REGISTRY_OVERRIDDEN=false

info() { echo "==> $*"; }
step() { echo ""; echo "[$1/7] $2"; }
warn() { echo "  ! $*"; }
ok() { echo "  ✓ $*"; }
die() {
  echo "" >&2
  echo "error: $*" >&2
  exit 1
}
confirm() {
  [ "$ASSUME_YES" = true ] && return 0
  local ans
  read -r -p "  $1 [y/N] " ans || ans=""
  case "$ans" in
    y | Y | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}
have() { command -v "$1" >/dev/null 2>&1; }
host_of() { echo "$1" | sed -E 's#^https?://##' | cut -d/ -f1; }
usage() {
  sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed -E 's/^# ?//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --yes | -y) ASSUME_YES=true; shift ;;
    --allow-dirty) ALLOW_DIRTY=true; shift ;;
    --force) FORCE=true; shift ;;
    --registry)
      [ $# -ge 2 ] || die "--registry 需要跟一个地址"
      REGISTRY="$2"
      REGISTRY_OVERRIDDEN=true
      shift 2
      ;;
    -h | --help) usage; exit 0 ;;
    *) die "unknown option: $1（用 --help 查看用法）" ;;
  esac
done

# 去掉末尾斜杠，便于拼接包名
REGISTRY="${REGISTRY%/}"
GROUP_REGISTRY="${GROUP_REGISTRY%/}"
REG_HOST="$(host_of "$REGISTRY")"

info "Polaris Flow release"
echo "    root     : $ROOT"
echo "    registry : $REGISTRY"
[ "$DRY_RUN" = true ] && echo "    mode     : DRY RUN（不会发布）"

# ---------------------------------------------------------------- 1. 环境
step 1 "环境检查"

have node || die "node not found. Install Node.js ${MIN_NODE_MAJOR}+ first."
NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
[ "$NODE_MAJOR" -ge "$MIN_NODE_MAJOR" ] || die "node $(node -v) is too old; need >= ${MIN_NODE_MAJOR}."
ok "node $(node -v)"

have npm || die "npm not found."
ok "npm $(npm -v)"

# prepublishOnly 里是 `pnpm run build`，pnpm 缺失会让发布在构建阶段失败
have pnpm || die "pnpm not found (prepublishOnly runs 'pnpm run build'). Install: npm i -g pnpm"
ok "pnpm $(pnpm --version 2>/dev/null || echo '?')"

VERSION="$(node -e 'process.stdout.write(require("./package.json").version)')"
[ -n "$VERSION" ] || die "cannot read version from package.json."
ok "package $PKG@$VERSION"

# 新 checkout 的 tag 目录通常没有 node_modules，缺了会在构建阶段失败
if [ ! -d node_modules ]; then
  warn "node_modules 不存在（新 checkout），先装依赖"
  pnpm install --frozen-lockfile
  ok "依赖安装完成"
fi

# ------------------------------------------------------ 2. 版本与 Changelog
step 2 "版本一致性"

CHANGELOG_VERSION="$(grep -m1 -oE '\[[0-9]+\.[0-9]+\.[0-9]+[^]]*\]' CHANGELOG.md 2>/dev/null | tr -d '[]' || true)"
if [ -z "$CHANGELOG_VERSION" ]; then
  warn "CHANGELOG.md 顶部没找到形如 [x.y.z] 的版本标题"
  confirm "仍要继续？" || die "已取消"
else
  [ "$CHANGELOG_VERSION" = "$VERSION" ] ||
    die "版本不一致：package.json=${VERSION}，CHANGELOG 顶部=${CHANGELOG_VERSION}。先对齐再发。"
  ok "package.json 与 CHANGELOG 顶部一致（${VERSION}）"
fi

# ------------------------------------------------------------ 3. git 状态
step 3 "git 状态"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
HEAD_TAG="$(git describe --tags --exact-match 2>/dev/null || true)"
if [ -n "$HEAD_TAG" ]; then
  ok "HEAD 处于 tag $HEAD_TAG"
else
  echo "  分支: ${BRANCH}（未处于任何 tag 上）"
  [ "$BRANCH" = "main" ] || warn "非 main 分支发版；确认这是你要发的代码"
fi

# .workbuddy/ 是 AI 工作记忆，不属于发布内容，排除后避免每次都误报脏
# quotepath=false 让中文文件名正常显示，而不是 \345\217... 转义
DIRTY="$(git -c core.quotepath=false status --porcelain -- . ':(exclude).workbuddy' 2>/dev/null | head -20 || true)"
if [ -n "$DIRTY" ]; then
  warn "工作区有未提交改动："
  echo "$DIRTY" | sed 's/^/      /'
  if [ "$ALLOW_DIRTY" = false ]; then
    confirm "带着这些改动继续发布？" || die "已取消（提交后再发，或用 --allow-dirty）"
  fi
else
  ok "工作区干净（.workbuddy 已排除）"
fi

# ------------------------------------------------- 4. 重复发布检测
step 4 "重复发布检测"

ALREADY=false
if have curl; then
  TMP_PACKUMENT="$(mktemp)"
  if curl -sf --max-time 10 "$REGISTRY/$PKG" -o "$TMP_PACKUMENT" 2>/dev/null; then
    if node -e '
      const fs = require("fs");
      try {
        const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        process.exit(d.versions && d.versions[process.argv[2]] ? 0 : 1);
      } catch { process.exit(2); }
    ' "$TMP_PACKUMENT" "$VERSION"; then
      ALREADY=true
    fi
  fi
  rm -f "$TMP_PACKUMENT"
else
  warn "curl 不可用，跳过重复发布检测"
fi

if [ "$ALREADY" = true ]; then
  warn "$PKG@$VERSION 已存在于 $REGISTRY"
  if [ "$FORCE" = false ]; then
    die "该版本已发布。若 Nexus 开了 Allow Redeploy，重发会静默覆盖旧版本（同版本号内容不一致）。
     确需覆盖请加 --force；正常发版请先升版本号。"
  fi
  warn "已指定 --force：将覆盖已发布的 $VERSION"
else
  ok "$VERSION 在 registry 上不存在，可以发布"
fi

# ------------------------------------------------------------ 5. 认证
step 5 "认证检查"

NPMRC="${HOME}/.npmrc"
if [ -f "$NPMRC" ] && grep -q "$REG_HOST" "$NPMRC" 2>/dev/null &&
  grep -qE '(_auth|_authToken)' "$NPMRC" 2>/dev/null; then
  ok "~/.npmrc 中检测到 $REG_HOST 的认证配置"
else
  REG_NOPROTO="${REGISTRY#http://}"
  warn "~/.npmrc 里没找到 $REG_HOST 的 _auth / _authToken"
  echo "     方式一 长期有效（推荐，发布指南 A-1）："
  echo "       AUTH=\$(printf '%s' '用户名:密码' | base64 | tr -d '\\n')"
  echo "       echo \"//${REG_NOPROTO}/:_auth=\$AUTH\" >> ~/.npmrc"
  echo "     方式二 临时登录（会过期）：npm login --registry \"${REGISTRY}/\" --auth-type=legacy"
  confirm "仍要继续（可能因 401 失败）？" || die "已取消"
fi

# ------------------------------------------------------- 6. 文件清单干跑
step 6 "文件清单（npm pack --dry-run）"

# dist 是发布物主体；缺失时 --ignore-scripts 的清单会不完整
if [ ! -f "dist/cli/index.js" ]; then
  warn "dist/cli/index.js 不存在，先构建一次"
  pnpm run build >/dev/null
  ok "构建完成"
fi

PACK_OUT="$(npm pack --dry-run --ignore-scripts 2>&1 || true)"
PACK_SUMMARY="$(echo "$PACK_OUT" | grep -iE 'total files|package size|unpacked size' | tr -s ' ' || true)"
if [ -z "$PACK_SUMMARY" ]; then
  echo "$PACK_OUT" | tail -15
  die "npm pack --dry-run 失败，上面是原始输出"
fi
echo "$PACK_SUMMARY" | sed 's/^/    /'

for p in bin/polaris.js dist/cli/index.js assets/zh/skills package.json; do
  if echo "$PACK_OUT" | grep -q "$p"; then
    ok "$p"
  else
    warn "$p 不在包内（检查 package.json 的 files 字段）"
  fi
done
echo "  注: 实际发布时 prepublishOnly 会跑密钥扫描 + 重新构建，清单以那次为准。"

if [ "$DRY_RUN" = true ]; then
  echo ""
  info "DRY RUN 结束，未发布任何包。去掉 --dry-run 即真正发布。"
  exit 0
fi

# ------------------------------------------------------------- 7. 发布
step 7 "发布到 $REGISTRY"

confirm "确认发布 $PKG@$VERSION 到上面这个 registry？" || die "已取消"

info "npm publish（prepublishOnly 会跑密钥扫描 + build，耗时几分钟属正常）"
# 覆盖已存在版本靠 Nexus 的 Allow Redeploy，不是 npm 参数，故 --force 只影响本脚本的前置检查
npm publish --registry "${REGISTRY}/"

# ----------------------------------------------------------- 发布后验证
echo ""
info "发布后验证"

verify_retry() {
  local desc="$1" cmd="$2" attempt
  for attempt in 1 2 3; do
    if eval "$cmd" >/dev/null 2>&1; then
      ok "$desc"
      return 0
    fi
    sleep 2
  done
  warn "$desc 失败（重试 3 次）"
  return 1
}

FAILED=0
verify_retry "hosted 可读: $REGISTRY/$PKG" \
  "curl -sf --max-time 8 -o /dev/null '$REGISTRY/$PKG'" || FAILED=1

if [ "$REGISTRY_OVERRIDDEN" = false ]; then
  verify_retry "group 可读: $GROUP_REGISTRY/$PKG" \
    "curl -sf --max-time 8 -o /dev/null '$GROUP_REGISTRY/$PKG'" || FAILED=1
  VIEW_CMD="npm view $PKG version --registry $GROUP_REGISTRY"
else
  VIEW_CMD="npm view $PKG version --registry $REGISTRY"
fi
verify_retry "registry 上版本为 $VERSION" "$VIEW_CMD 2>/dev/null | grep -qx '$VERSION'" || FAILED=1

# 关键判据：tarball 必须能真实下载。只有元数据 200 不代表可安装。
if [ "$REGISTRY_OVERRIDDEN" = false ]; then
  DIST_URL="$GROUP_REGISTRY/$PKG/-/$PKG-$VERSION.tgz"
else
  DIST_URL="$REGISTRY/$PKG/-/$PKG-$VERSION.tgz"
fi
verify_retry "tarball 可下载: $PKG-$VERSION.tgz" \
  "curl -sf --max-time 10 -o /dev/null -r 0-0 '$DIST_URL'" || FAILED=1

echo ""
if [ "$FAILED" = 0 ]; then
  info "发布完成: $PKG@$VERSION"
  echo ""
  echo "使用者安装（内网）: bash install.sh"
  echo "自行核对: $VIEW_CMD"
  if [ -z "$HEAD_TAG" ]; then
    echo ""
    echo "提示: 当前不在 tag 上 —— 记得把版本号与 CHANGELOG 的提交推到远端，并打 v$VERSION tag。"
  fi
else
  info "包已发布，但有验证项未通过（Nexus 索引可能延迟，稍后手动重跑验证）"
  echo "    $VIEW_CMD"
  exit 1
fi
