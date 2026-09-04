#!/usr/bin/env bash
# get-language-name.sh — 通过 polaris-flow 读取 config.language，并返回语言显示名称
#
# 用法:
#   bash get-language-name.sh [repo_root]
#
# 输出: 语言名称（stdout），如 English / 中文
# 退出: 0 成功；1 CLI 不可用或读取失败；2 未知语言 ID

set -euo pipefail

REPO_ROOT="${1:-${REPO_ROOT:-$(pwd)}}"

# 查找 polaris-flow 运行时入口（与用户侧 polaris CLI 分离）
_polaris_flow() {
  if command -v polaris-flow >/dev/null 2>&1; then
    polaris-flow "$@"
    return 0
  fi
  echo "[get-language-name] polaris-flow CLI not found" >&2
  echo "[get-language-name] Install: npm install -g @polaris/polaris-flow" >&2
  return 1
}

LANG_ID="$(_polaris_flow config get language "$REPO_ROOT" 2>/dev/null | tr -d '\r' | head -n 1 || true)"
if [ -z "$LANG_ID" ]; then
  echo "[get-language-name] failed to read config.language from $REPO_ROOT" >&2
  exit 1
fi

case "$LANG_ID" in
  en)
    echo "English"
    ;;
  zh)
    echo "中文"
    ;;
  *)
    echo "[get-language-name] unknown language id: $LANG_ID" >&2
    exit 2
    ;;
esac
