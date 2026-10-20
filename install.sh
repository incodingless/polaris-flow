#!/usr/bin/env bash
# Polaris Flow 一键安装脚本（用户侧分发入口）
#
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/incodingless/polaris-flow/main/install.sh | bash
#
# 内网私服场景（脚本内容与托管平台解耦，同一份脚本两端通用）:
#   NPM_REGISTRY=https://nexus.example.com/repository/npm-public/ bash install.sh
#
# 职责: 校验环境（node >= 20 + npm）→ 全局安装 npm 包 polaris-flow → 引导 polaris init。
# 兼容 macOS / Linux / Windows Git Bash。

set -euo pipefail

PACKAGE_NAME="polaris-flow"
MIN_NODE_MAJOR=20

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
if [ -n "${NPM_REGISTRY:-}" ]; then
  info "Using registry: ${NPM_REGISTRY}"
  npm install -g "$PACKAGE_NAME" --registry "$NPM_REGISTRY"
else
  npm install -g "$PACKAGE_NAME"
fi

info "Installed:"
polaris --version

echo ""
echo "Next steps:"
echo "    polaris init <path>   # 在目标项目中初始化 Polaris Flow 工作流"
echo "    polaris --help        # 查看全部命令"
