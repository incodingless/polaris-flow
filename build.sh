#!/usr/bin/env bash
# 本地构建 Polaris Flow CLI（install + build，可选 lint/test）
#
# 用法:
#   ./scripts/build.sh           # 安装依赖并构建
#   ./scripts/build.sh --check   # 构建 + lint + test（提交前推荐）
#   ./scripts/build.sh --skip-install  # 跳过 pnpm install

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUN_CHECK=false
SKIP_INSTALL=false

for arg in "$@"; do
  case "$arg" in
    --check)
      RUN_CHECK=true
      ;;
    --skip-install)
      SKIP_INSTALL=true
      ;;
    -h | --help)
      echo "Usage: $0 [--check] [--skip-install]"
      echo ""
      echo "  --check         构建后运行 lint 与 test"
      echo "  --skip-install  跳过 pnpm install"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Run $0 --help" >&2
      exit 1
      ;;
  esac
done

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm not found. Install pnpm first." >&2
  exit 1
fi

echo "==> Polaris Flow build"
echo "    root: $ROOT"
echo ""

if [ "$SKIP_INSTALL" = false ]; then
  echo "==> pnpm install"
  pnpm install
  echo ""
fi

echo "==> pnpm build"
pnpm run build
echo ""

if [ "$RUN_CHECK" = true ]; then
  echo "==> pnpm lint"
  pnpm run lint
  echo ""

  echo "==> pnpm test"
  pnpm run test
  echo ""
fi

echo "==> Build OK"
node bin/polaris.js --version
echo ""
echo "提示: build 不会把 polaris 加入 PATH。在其他目录使用前请先 link 或直接用 node 调用："
echo "    npm link                              # 推荐（macOS/Homebrew 环境通常可用）"
echo "    pnpm link --global                    # 需先 pnpm setup 并配置 PNPM_HOME"
echo "    node $ROOT/bin/polaris.js init <path> # 无需 link，任意目录可用"
