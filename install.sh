#!/usr/bin/env bash
# Polaris Flow 一键安装脚本（用户侧分发入口）
#
# 用法:
#   bash install.sh
#
# 默认从公司内网 Nexus 聚合仓库安装（npm-group：内部包 + 公网 npm 代理）。
# 需要换源时用环境变量覆盖:
#   NPM_REGISTRY=https://registry.npmjs.org bash install.sh
#
# 职责: 校验环境（node >= 20 + npm）→ 全局安装 npm 包 polaris-flow → 引导 polaris init。
# 兼容 macOS / Linux / Windows Git Bash。

set -euo pipefail

PACKAGE_NAME="polaris-flow"
MIN_NODE_MAJOR=20
# 内网 Nexus 聚合仓库（Nexus 2 路径格式：/nexus/content/groups/<repoId>/）
DEFAULT_REGISTRY="http://192.168.2.96:8081/nexus/content/groups/npm-group/"
REGISTRY="${NPM_REGISTRY:-$DEFAULT_REGISTRY}"

info() { echo "==> $*"; }
err() { echo "error: $*" >&2; }

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

info "Installing ${PACKAGE_NAME} via npm"
info "Using registry: ${REGISTRY}"
npm install -g "$PACKAGE_NAME" --registry "$REGISTRY"

info "Installed:"
polaris --version

echo ""
echo "Next steps:"
echo "    polaris init <path>   # 在目标项目中初始化 Polaris Flow 工作流"
echo "    polaris --help        # 查看全部命令"
