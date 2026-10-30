#!/usr/bin/env bash
# Polaris Flow 一键安装脚本（用户侧分发入口）
#
# 用法:
#   sudo bash install.sh     # Linux 系统级 node（yum / apt 装的）
#   bash install.sh          # macOS / nvm 管理的 node（全局目录本来就属于当前用户）
#
# 默认从公司内网 Nexus 3 聚合仓库安装（npm-group：hosted 内部包 + proxy 公网代理）。
# 需要换源时用环境变量覆盖:
#   NPM_REGISTRY=https://registry.npmjs.org sudo bash install.sh
#
# 其它可选环境变量:
#   POLARIS_DRY_RUN=1    只打印将要执行的命令，不真正安装
#
# 只支持全局安装，不提供用户级安装 polaris 本体：
#   系统级 node 的全局目录是 /usr/lib/node_modules，普通用户无写权限。改装到
#   ~/.npm-global 虽然能装成功，但 polaris 不在系统 PATH 上，polaris update
#   升级自身时也仍要写那个目录 —— 等于装了个只能跑 --version 的残件。
#   所以这种情况直接拒绝，要求用 root 重跑（管理员装一次，所有用户共用）。
#
# 注意分工：sudo 只用在装 CLI 这一步。初始化项目必须由普通用户执行 ——
#   sudo polaris init 会让 .polaris/ 与平台目录归属 root，之后普通用户改不了文档。
#   伴生 CLI（openspec / codegraph）不需要手动 sudo：全局目录不可写时 polaris init
#   会自动装到 ~/.polaris/cli。
#
# 职责: 校验环境（node >= 20 + npm）→ 确认全局目录可写 → 安装 npm 包
#       polaris-flow → 打印版本号与下一步提示。
# 兼容 macOS / Linux / Windows Git Bash。

set -euo pipefail

PACKAGE_NAME="polaris-flow"
MIN_NODE_MAJOR=20
# 内网 Nexus 3 聚合仓库（Nexus 3 路径格式：/repository/<repoId>/）
DEFAULT_REGISTRY="http://192.168.103.96:8081/repository/npm-group/"
REGISTRY="${NPM_REGISTRY:-$DEFAULT_REGISTRY}"

info() { echo "==> $*"; }
warn() { echo "warn: $*" >&2; }
err() { echo "error: $*" >&2; }

usage() {
  cat <<'EOF'
用法:
  sudo bash install.sh     Linux 系统级 node（yum / apt 装的）。装到 /usr/lib/node_modules，所有用户可用
  bash install.sh          macOS / nvm 管理的 node。全局目录属于当前用户，不需要 sudo

只支持全局安装 polaris 本体：装到用户目录后 polaris 不在系统 PATH 上，polaris update
升级自身时也仍要写全局目录，因此脚本会直接拒绝。

sudo 只用在装 CLI 这一步。初始化项目必须由普通用户执行（sudo polaris init 会让
项目文件归属 root）。伴生 CLI 不需要手动 sudo：全局目录不可写时 polaris init
会自动装到 ~/.polaris/cli。

可选环境变量:
  NPM_REGISTRY=<url>   换源（默认公司 Nexus 3 聚合仓库）
  POLARIS_DRY_RUN=1    只打印将要执行的命令，不真正安装
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    --user-prefix|--prefix)
      err "已不再支持用户级安装（装到用户目录后即无效安装）。请改用：sudo bash install.sh"
      exit 2
      ;;
    *) err "未知参数: ${arg}"; usage >&2; exit 2 ;;
  esac
done

# 检查 node 版本是否 >= 最小要求（Major 比较，不依赖 sort -V 以兼容 Git Bash）
check_node_version() {
  local major
  major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  [ "$major" -ge "$MIN_NODE_MAJOR" ]
}

command -v node >/dev/null 2>&1 || {
  err "node not found. Install Node.js 20+ first: https://nodejs.org"
  exit 1
}

if ! check_node_version; then
  err "node $(node -v) is too old. Polaris Flow requires Node.js >= ${MIN_NODE_MAJOR}."
  exit 1
fi

command -v npm >/dev/null 2>&1 || {
  err "npm not found. It ships with Node.js; reinstall Node.js 20+ if it is missing."
  exit 1
}

# ---------------------------------------------------------------- bundle 模式
# 检测同目录 config.ini / components/，存在则进入离线安装包模式：
# 读 config.ini 覆盖 registry，并把组件预种进 ~/.polaris/（本地目录通道 + install: 段）。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_MODE=false
[ -f "$SCRIPT_DIR/config.ini" ] && BUNDLE_MODE=true
[ -d "$SCRIPT_DIR/components" ] && BUNDLE_MODE=true

# 从 config.ini（扁平 KEY=VALUE）读单个值；无则空串
get_config_value() {
  sed -nE "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*(.*)$/\1/p" "$SCRIPT_DIR/config.ini" 2>/dev/null \
    | head -n1 | sed -E 's/[[:space:]]*$//'
}

# 确保 ~/.npmrc 记录 Nexus registry：无则生成，有则校验，不匹配则提示并覆盖。
# 约定：更新与维护均在 root 下操作，直接写 $HOME/.npmrc（root 场景即 root 家目录）。
ensure_npmrc_registry() {
  local npmrc="$HOME/.npmrc"
  local target="${REGISTRY%/}"
  local current

  if [ ! -f "$npmrc" ]; then
    printf 'registry=%s\n' "$REGISTRY" > "$npmrc"
    info "已生成 ${npmrc}（registry = ${REGISTRY}）"
    return 0
  fi

  current="$(sed -nE 's/^[[:space:]]*registry[[:space:]]*=[[:space:]]*([^[:space:]#;]+).*/\1/p' "$npmrc" | tail -n1)"
  current="${current%/}"

  if [ "$current" = "$target" ]; then
    return 0
  fi

  if [ -z "$current" ]; then
    printf 'registry=%s\n' "$REGISTRY" >> "$npmrc"
    info "已向 ${npmrc} 追加 registry = ${REGISTRY}"
    return 0
  fi

  warn "检测到 ${npmrc} 中 registry = ${current}，与 Nexus（${target}）不一致，覆盖为 ${REGISTRY}"
  sed -E "s#^[[:space:]]*registry[[:space:]]*=.*#registry=${REGISTRY}#" "$npmrc" > "$npmrc.tmp" \
    && mv "$npmrc.tmp" "$npmrc"
  info "已覆盖 ${npmrc} 的 registry 为 ${REGISTRY}"
}

if [ "$BUNDLE_MODE" = true ]; then
  info "检测到离线安装包（bundle 模式）"
  CFG_REGISTRY="$(get_config_value POLARIS_NPM_REGISTRY)"
  if [ -n "$CFG_REGISTRY" ]; then
    REGISTRY="$CFG_REGISTRY"
  fi
  if [ -f "$SCRIPT_DIR/polaris-preseed.cjs" ]; then
    node "$SCRIPT_DIR/polaris-preseed.cjs" "$SCRIPT_DIR" \
      || warn "预种 ~/.polaris 失败（不影响本机包安装；polaris init 时仍可用 env/CLI 覆盖）"
  fi
fi

# ---------------------------------------------------------------- 安装目录检查
npm_global_root() { npm root -g 2>/dev/null || true; }
npm_global_prefix() { npm prefix -g 2>/dev/null || true; }

# 全局安装目录是否可写（目录还不存在时看父目录）
global_dir_writable() {
  local root parent
  root="$(npm_global_root)"
  [ -n "$root" ] || return 1
  if [ -d "$root" ]; then
    [ -w "$root" ]
  else
    parent="$(dirname "$root")"
    [ -d "$parent" ] && [ -w "$parent" ]
  fi
}

# 在给定 prefix 下定位可执行文件（Unix 在 bin/，Windows/Git Bash 可能在根下）
resolve_bin() {
  local prefix="$1" p
  for p in "$prefix/bin/$PACKAGE_NAME" "$prefix/$PACKAGE_NAME" \
           "$prefix/bin/$PACKAGE_NAME.cmd" "$prefix/$PACKAGE_NAME.cmd"; do
    [ -f "$p" ] && { echo "$p"; return 0; }
  done
  return 1
}

GLOBAL_ROOT="$(npm_global_root)"
INSTALL_PREFIX="$(npm_global_prefix)"

if ! global_dir_writable; then
  err "全局安装目录 ${GLOBAL_ROOT} 当前用户不可写，无法完成有效安装。"
  echo "" >&2
  echo "  polaris 本体只支持全局安装：装到用户目录后它不在系统 PATH 上，" >&2
  echo "  polaris update 升级自身时也仍要写全局目录 —— 装出来只能跑 --version。" >&2
  echo "" >&2
  echo "  用 root 重跑（管理员装一次，所有用户共用）：" >&2
  echo "      sudo bash install.sh" >&2
  echo "" >&2
  echo "  装完之后，初始化项目请切回普通用户执行 polaris init，不要 sudo。" >&2
  exit 1
fi

# root 但用的是 root 自己的 nvm：目录虽然可写，却只有 root 看得见
if [ "$(id -u)" = "0" ] && [ -n "${HOME:-}" ]; then
  case "${INSTALL_PREFIX}/" in
    "${HOME}"/*)
      err "当前 root 的全局目录在 ${INSTALL_PREFIX}（root 自己 nvm 管理的 node），其它用户看不到。"
      echo "  请改用系统 node 安装：" >&2
      echo "      sudo /usr/bin/npm install -g ${PACKAGE_NAME} --registry ${REGISTRY}" >&2
      echo "  或退出 nvm 环境后重跑 sudo bash install.sh" >&2
      exit 1
      ;;
  esac
fi

info "Installing ${PACKAGE_NAME} via npm (global prefix: ${INSTALL_PREFIX})"
info "Using registry: ${REGISTRY}"

if [ -n "${POLARIS_DRY_RUN:-}" ]; then
  info "[dry-run] 将执行: npm install -g ${PACKAGE_NAME} --registry ${REGISTRY}"
  exit 0
fi

INSTALL_FAILED=0
npm install -g "$PACKAGE_NAME" --registry "$REGISTRY" || INSTALL_FAILED=1

if [ "$INSTALL_FAILED" = "1" ]; then
  err "npm install failed."
  echo "   常见原因：" >&2
  echo "   - EACCES：忘了用 sudo，或 sudo 后的 npm 不是系统 node" >&2
  echo "   - E401/E403：Nexus 未开放匿名读，或发布账号无权限（找维护者）" >&2
  echo "   - E404：包未发布，或 npm-hosted 未加入 npm-group 聚合成员" >&2
  echo "   - ETIMEDOUT：不在公司内网 / 未连 VPN" >&2
  exit 1
fi

BIN="$(resolve_bin "$INSTALL_PREFIX" || command -v "$PACKAGE_NAME" || true)"
if [ -z "$BIN" ]; then
  err "安装完成但找不到 ${PACKAGE_NAME} 可执行文件，请检查 ${INSTALL_PREFIX}/bin"
  exit 1
fi

info "Installed:"
"$BIN" --version

# 持久化 Nexus registry 到 ~/.npmrc，供后续 polaris init / update 复用
ensure_npmrc_registry

echo ""
echo "Next steps:"
echo "    polaris init <path>   # 在目标项目中初始化 Polaris Flow 工作流"
echo "    polaris --help        # 查看全部命令"

# 当前 shell 可能还缓存着旧的命令位置
if ! command -v "$PACKAGE_NAME" >/dev/null 2>&1; then
  warn "当前终端还没识别到 ${PACKAGE_NAME}，执行 hash -r 或重开终端后再用"
fi

# 伴生 CLI 建议由管理员一次预装：省掉每个使用者首次 init 时的下载等待。
# 不装也能用 —— polaris init 会自动装，全局目录不可写时装到 ~/.polaris/cli。
if [ "$(id -u)" = "0" ]; then
  MISSING_DEPS=""
  command -v openspec >/dev/null 2>&1 || MISSING_DEPS="${MISSING_DEPS} @fission-ai/openspec@latest"
  command -v codegraph >/dev/null 2>&1 || MISSING_DEPS="${MISSING_DEPS} @colbymchenry/codegraph@latest"
  if [ -n "$MISSING_DEPS" ]; then
    echo ""
    echo "可选：顺手预装伴生 CLI（不装也行，polaris init 会自动装到用户目录）："
    echo "    npm install -g${MISSING_DEPS} --registry ${REGISTRY}"
    echo ""
    echo "注意：初始化项目必须由普通用户执行，不要 sudo。"
    echo "      sudo polaris init 会让 .polaris/ 等项目文件归属 root，之后普通用户改不了。"
  fi
fi
