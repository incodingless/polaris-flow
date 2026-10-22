#!/usr/bin/env bash
# Polaris Flow 离线安装包打包脚本（维护者侧）。
#
# 产出 release/ 目录（安装介质），可整体 zip 后分发给内网用户：
#   release/
#   ├─ install.sh            # 与仓库根同源（构建时拷入，不 fork）
#   ├─ install.ps1
#   ├─ config.ini            # 扁平 KEY=VALUE（用户可编辑）
#   ├─ bundle-manifest.json  # 组件版本清单（install.sh 记录 plugins 段用）
#   └─ components/
#      ├─ openspec-<ver>.tgz   # npm pack 产物（离线免构建）
#      ├─ codegraph-<ver>.tgz  # npm pack 产物
#      └─ superpowers/         # 源码目录（钉 >= minVersion 的 tag）
#
# 适用边界：内网可达 Nexus、公网 GitHub 不可达。.tgz 的第三方依赖仍走 config.ini
# 里的 npm registry，所以 bundle 不是纯离线件。
#
# 组件来源（内置 vendor 优先，避免频繁打包反复从 GitHub/npm 拉取）：
#   devops/vendor/superpowers/   superpowers 完整仓库（含 skills/），提交进 git
#   devops/vendor/tgz/*.tgz      本地缓存，不提交 git（*.tgz 被 gitignore）
#
# 用法:
#   bash devops/package.sh                     # 全默认：superpowers 用内置 vendor，CLI 取 latest
#   bash devops/package.sh --openspec 1.14.3 --codegraph 1.6.2
#   bash devops/package.sh --refresh           # 忽略 vendor 缓存，强制重新拉取组件
#   bash devops/package.sh --zip               # 额外打 release.zip
#
# 可选参数:
#   --openspec <ver>     钉 OpenSpec 版本（默认 latest）
#   --codegraph <ver>    钉 Codegraph 版本（默认 latest）
#   --superpowers <ref>  superpowers 的 tag/分支（默认自动取 >= minVersion 的最新 tag）
#   --registry <url>     npm pack 拉包源，同时作为 config.ini 的默认 npm-registry
#   --out <dir>          输出目录（默认 release/）
#   --refresh            忽略 vendor 缓存，强制重新 clone superpowers + npm pack
#   --zip                打包完成后生成 <out>.zip

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SUPERPOWERS_REPO="https://github.com/obra/superpowers"
SUPERPOWERS_MIN_VERSION="4.0.0"
OPENSPEC_PACKAGE="@fission-ai/openspec"
CODEGRAPH_PACKAGE="@colbymchenry/codegraph"
DEFAULT_REGISTRY="http://192.168.103.96:8081/repository/npm-group/"

OPENSPEC_VERSION=""
CODEGRAPH_VERSION=""
SUPERPOWERS_REF=""
REGISTRY="${NPM_REGISTRY:-$DEFAULT_REGISTRY}"
OUT_DIR="release"
DO_ZIP=false
REFRESH=false

# 内置/缓存组件目录（superpowers 提交进 git，tgz 本地缓存不提交）
VENDOR_DIR="$ROOT/devops/vendor"
SUPERPOWERS_VENDOR="$VENDOR_DIR/superpowers"
TGZ_VENDOR="$VENDOR_DIR/tgz"

info() { echo "==> $*"; }
warn() { echo "warn: $*" >&2; }
die() { echo "error: $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
用法: bash devops/package.sh [选项]

  --openspec <ver>      钉 OpenSpec 版本（默认 latest）
  --codegraph <ver>     钉 Codegraph 版本（默认 latest）
  --superpowers <ref>   superpowers 的 tag/分支（默认自动取 >= minVersion 的最新 tag）
  --registry <url>      npm pack 拉包源 + config.ini 默认 npm-registry
  --out <dir>           输出目录（默认 release/）
  --refresh             忽略 vendor 缓存，强制重新拉取组件
  --zip                 打包完成后生成 <out>.zip
  -h|--help             显示帮助
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --openspec) OPENSPEC_VERSION="${2:?缺少版本号}"; shift 2 ;;
    --codegraph) CODEGRAPH_VERSION="${2:?缺少版本号}"; shift 2 ;;
    --superpowers) SUPERPOWERS_REF="${2:?缺少 ref}"; shift 2 ;;
    --registry) REGISTRY="${2:?缺少地址}"; shift 2 ;;
    --out) OUT_DIR="${2:?缺少目录}"; shift 2 ;;
    --refresh) REFRESH=true; shift ;;
    --zip) DO_ZIP=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: $1（--help 查看用法）" ;;
  esac
done

# 环境校验：git / npm / node 均为打包必需
command -v git >/dev/null 2>&1 || die "缺少 git"
command -v npm >/dev/null 2>&1 || die "缺少 npm"
command -v node >/dev/null 2>&1 || die "缺少 node"

# semver_ge a b → 退出码 0 表示 a >= b（用 node 做语义化比较，跨平台稳定）
semver_ge() {
  node -e '
    const [a, b] = process.argv.slice(1);
    const p = (s) => String(s).split(".").map((n) => parseInt(n, 10) || 0);
    const A = p(a), B = p(b);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const d = (A[i] || 0) - (B[i] || 0);
      if (d !== 0) process.exit(d > 0 ? 0 : 1);
    }
    process.exit(0);
  ' "$1" "$2"
}

# 解析 superpowers 版本：>= minVersion 的最新 tag；取不到则回退 HEAD
resolve_superpowers_version() {
  if [ -n "$SUPERPOWERS_REF" ]; then
    echo "$SUPERPOWERS_REF"
    return
  fi
  local latest
  latest="$(git ls-remote --tags --sort=-v:refname "$SUPERPOWERS_REPO" 2>/dev/null \
    | sed -nE 's#.*refs/tags/v?([0-9]+\.[0-9]+\.[0-9]+)$#\1#p' | head -n1)"
  if [ -n "$latest" ] && semver_ge "$latest" "$SUPERPOWERS_MIN_VERSION"; then
    echo "$latest"
  else
    echo ""
  fi
}

# npm pack 一个 CLI 包：优先用 vendor/tgz 缓存，无则 pack 并回填缓存；返回实际版本号
pack_cli() {
  local pkg="$1" pinned="$2" out_dir="$3" shortname="$4"
  local version="$pinned"
  if [ -z "$version" ]; then
    version="$(npm view "$pkg" version --registry "$REGISTRY" 2>/dev/null)" \
      || die "无法解析 $pkg 的 latest 版本（registry: ${REGISTRY}）"
  fi
  local cached="$TGZ_VENDOR/${shortname}-${version}.tgz"
  if [ -f "$cached" ] && [ "$REFRESH" != true ]; then
    info "复用缓存 ${shortname}-${version}.tgz" >&2
    cp "$cached" "$out_dir/"
  else
    info "npm pack ${pkg}@${version} ..." >&2
    mkdir -p "$TGZ_VENDOR"
    local packed
    packed="$(npm pack "$pkg@$version" --pack-destination "$TGZ_VENDOR" --registry "$REGISTRY" 2>/dev/null | tail -1)"
    [ -n "$packed" ] || die "npm pack $pkg 失败"
    mv "$TGZ_VENDOR/$packed" "$cached"
    cp "$cached" "$out_dir/"
  fi
  echo "$version"
}

# 主流程
info "输出目录: $OUT_DIR"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/components"

# --- 1. superpowers 源码（优先内置 vendor，无或 --refresh 则 clone 并回填 vendor） ---
superpowers_version=""
if [ "$REFRESH" = true ] || [ ! -d "$SUPERPOWERS_VENDOR/skills" ]; then
  mkdir -p "$VENDOR_DIR"
  rm -rf "$SUPERPOWERS_VENDOR"
  superpowers_version="$(resolve_superpowers_version)"
  if [ -n "$superpowers_version" ] && [[ "$superpowers_version" != HEAD* ]] && semver_ge "$superpowers_version" "$SUPERPOWERS_MIN_VERSION" 2>/dev/null; then
    info "git clone superpowers v${superpowers_version} ..."
    git clone --depth 1 --branch "v${superpowers_version}" "$SUPERPOWERS_REPO" "$SUPERPOWERS_VENDOR" >/dev/null 2>&1 \
      || git clone --depth 1 --branch "$superpowers_version" "$SUPERPOWERS_REPO" "$SUPERPOWERS_VENDOR" >/dev/null 2>&1 \
      || die "clone superpowers@$superpowers_version 失败"
  elif [ -n "$SUPERPOWERS_REF" ]; then
    info "git clone superpowers ${SUPERPOWERS_REF} ..."
    git clone --depth 1 --branch "$SUPERPOWERS_REF" "$SUPERPOWERS_REPO" "$SUPERPOWERS_VENDOR" >/dev/null 2>&1 \
      || die "clone superpowers@$SUPERPOWERS_REF 失败"
    superpowers_version="$SUPERPOWERS_REF"
  else
    warn "未取到 >= ${SUPERPOWERS_MIN_VERSION} 的 tag，clone 默认分支"
    info "git clone superpowers (HEAD) ..."
    git clone --depth 1 "$SUPERPOWERS_REPO" "$SUPERPOWERS_VENDOR" >/dev/null 2>&1 \
      || die "clone superpowers 失败"
    superpowers_version="HEAD"
  fi
  rm -rf "$SUPERPOWERS_VENDOR/.git"
  echo "$superpowers_version" > "$SUPERPOWERS_VENDOR/.polaris-version"
else
  superpowers_version="$(cat "$SUPERPOWERS_VENDOR/.polaris-version" 2>/dev/null || echo vendor)"
  info "复用内置 superpowers（${superpowers_version}）"
fi
cp -R "$SUPERPOWERS_VENDOR" "$OUT_DIR/components/superpowers"
rm -f "$OUT_DIR/components/superpowers/.polaris-version"

# --- 2/3. openspec / codegraph tarball ---
openspec_version="$(pack_cli "$OPENSPEC_PACKAGE" "$OPENSPEC_VERSION" "$OUT_DIR/components" "openspec")"
codegraph_version="$(pack_cli "$CODEGRAPH_PACKAGE" "$CODEGRAPH_VERSION" "$OUT_DIR/components" "codegraph")"

# --- 4. 组装 install.sh / install.ps1 / 预种脚本 ---
cp "$ROOT/install.sh" "$OUT_DIR/install.sh"
cp "$ROOT/install.ps1" "$OUT_DIR/install.ps1"
cp "$ROOT/devops/polaris-preseed.cjs" "$OUT_DIR/polaris-preseed.cjs"

# --- 5. config.ini（扁平 KEY=VALUE，用户可编辑） ---
cat > "$OUT_DIR/config.ini" <<EOF
# Polaris 离线安装包配置（KEY = VALUE，# 开头为注释，留空 = 使用默认值）
# 用户可编辑；install.sh 会在安装时读取并写入 ~/.polaris/polaris.yaml 的 install: 段

# GitHub 镜像基址（git clone 通道用）；留空 = 直连 github.com
POLARIS_GITHUB_MIRROR =

# npm registry（npm 通道用）；留空 = 使用机器默认 ~/.npmrc
POLARIS_NPM_REGISTRY = $REGISTRY
EOF

# --- 6. bundle-manifest.json（版本清单） ---
pkg_version="$(node -p "require('./package.json').version")"
MANIFEST="$OUT_DIR/bundle-manifest.json" \
PKG_VERSION="$pkg_version" \
OPENSPEC_VERSION="$openspec_version" \
CODEGRAPH_VERSION="$codegraph_version" \
SUPERPOWERS_VERSION="$superpowers_version" \
node -e '
const fs = require("fs");
const m = {
  generated: new Date().toISOString(),
  "polaris-flow": process.env.PKG_VERSION,
  components: {
    openspec: { version: process.env.OPENSPEC_VERSION, type: "tgz" },
    codegraph: { version: process.env.CODEGRAPH_VERSION, type: "tgz" },
    superpowers: { version: process.env.SUPERPOWERS_VERSION, type: "source" },
  },
};
fs.writeFileSync(process.env.MANIFEST, JSON.stringify(m, null, 2) + "\n");
'

# --- 7. 可选 zip ---
if [ "$DO_ZIP" = true ]; then
  info "打包 ${OUT_DIR}.zip ..."
  rm -f "${OUT_DIR}.zip"
  (cd "$OUT_DIR" && zip -rq "../${OUT_DIR}.zip" .) || die "zip 打包失败"
fi

info "完成:"
echo "  install.sh/install.ps1/polaris-preseed.cjs"
echo "  config.ini（npm-registry 默认 ${REGISTRY}）"
echo "  bundle-manifest.json"
echo "  components/superpowers@${superpowers_version}"
echo "  components/openspec@${openspec_version}（tgz）"
echo "  components/codegraph@${codegraph_version}（tgz）"
if [ "$DO_ZIP" = true ]; then
  echo "  ${OUT_DIR}.zip"
fi
