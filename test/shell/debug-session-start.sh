#!/usr/bin/env bash
# debug-session-start.sh — 本地模拟宿主 SessionStart，调试 host-hook / session-start.sh
#
# 用法：
#   bash test/shell/debug-session-start.sh
#   POLARIS_HOOK_DEBUG=1 bash test/shell/debug-session-start.sh --platform cursor
#   bash test/shell/debug-session-start.sh --via sh
#   bash test/shell/debug-session-start.sh --dry-run
#   echo '{"hook_event_name":"SessionStart","cwd":"."}' | bash test/shell/debug-session-start.sh --stdin -
#
# 依赖：仓库根目录已 pnpm build；或 PATH 中有 polaris-flow。
# handler 调试日志：POLARIS_HOOK_DEBUG=1（写 stderr，不污染宿主 stdout JSON）。
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLATFORM="claude"
PROJECT=""
VIA="cli"
DRY_RUN=0
STDIN_MODE="template" # template | - | file
STDIN_FILE=""

usage() {
  cat <<'EOF'
Usage: bash test/shell/debug-session-start.sh [options]

Options:
  --platform <claude|cursor|trae>  模拟平台（默认 claude；影响 stdin 形状与 stdout JSON）
  --project <path>                 项目根（默认当前目录；写入 stdin.cwd）
  --via <cli|sh>                   走 polaris-flow CLI 或 assets session-start.sh（默认 cli）
  --stdin <file|->                 使用自定义 JSON（- 表示从管道读）；默认用内置模板
  --dry-run                        只打印将注入的 stdin，不执行
  -h, --help                       帮助

Env:
  POLARIS_HOOK_DEBUG=1             打开 handler 调试日志（stderr）

Examples:
  POLARIS_HOOK_DEBUG=1 bash test/shell/debug-session-start.sh --platform trae
  bash test/shell/debug-session-start.sh --platform cursor --via sh --project "$PWD"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM="${2:?}"
      shift 2
      ;;
    --project)
      PROJECT="${2:?}"
      shift 2
      ;;
    --via)
      VIA="${2:?}"
      shift 2
      ;;
    --stdin)
      STDIN_FILE="${2:?}"
      STDIN_MODE="file"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$PLATFORM" in
  claude|cursor|trae) ;;
  *)
    echo "invalid --platform: $PLATFORM (claude|cursor|trae)" >&2
    exit 2
    ;;
esac

case "$VIA" in
  cli|sh) ;;
  *)
    echo "invalid --via: $VIA (cli|sh)" >&2
    exit 2
    ;;
esac

if [[ -z "$PROJECT" ]]; then
  PROJECT="$(pwd)"
fi
PROJECT="$(cd "$PROJECT" && pwd)"

SESSION_ID="debug-session-$(date -u +%Y%m%dT%H%M%SZ)"

# 按平台生成一份接近真实的 SessionStart stdin
build_stdin() {
  case "$PLATFORM" in
    claude)
      cat <<EOF
{
  "session_id": "${SESSION_ID}",
  "cwd": "${PROJECT}",
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "debug-model"
}
EOF
      ;;
    cursor)
      cat <<EOF
{
  "conversation_id": "${SESSION_ID}",
  "hook_event_name": "sessionStart",
  "workspace_roots": ["${PROJECT}"],
  "cwd": "${PROJECT}"
}
EOF
      ;;
    trae)
      cat <<EOF
{
  "session_id": "${SESSION_ID}",
  "cwd": "${PROJECT}",
  "hook_event_name": "SessionStart",
  "workspace_roots": ["${PROJECT}"]
}
EOF
      ;;
  esac
}

PAYLOAD=""
if [[ "$STDIN_MODE" == "file" ]]; then
  if [[ "$STDIN_FILE" == "-" ]]; then
    PAYLOAD="$(cat)"
  else
    PAYLOAD="$(cat "$STDIN_FILE")"
  fi
else
  PAYLOAD="$(build_stdin)"
fi

echo "=== debug SessionStart ===" >&2
echo "platform : $PLATFORM" >&2
echo "project  : $PROJECT" >&2
echo "via      : $VIA" >&2
echo "session  : $SESSION_ID" >&2
echo "--- stdin ---" >&2
printf '%s\n' "$PAYLOAD" >&2
echo "-------------" >&2

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '%s\n' "$PAYLOAD"
  exit 0
fi

resolve_polaris_flow() {
  if command -v polaris-flow >/dev/null 2>&1; then
    command -v polaris-flow
    return 0
  fi
  local bin_js="$ROOT/bin/polaris-flow.js"
  if [[ -f "$bin_js" && -f "$ROOT/dist/cli/index.js" ]]; then
    # 返回可 exec 的包装：node bin
    printf 'node:%s' "$bin_js"
    return 0
  fi
  return 1
}

run_cli() {
  local pf
  if ! pf="$(resolve_polaris_flow)"; then
    echo "[FAIL] polaris-flow 不可用。请先: pnpm build，或 npm i -g @polaris/polaris-flow" >&2
    exit 1
  fi
  if [[ "$pf" == node:* ]]; then
    printf '%s' "$PAYLOAD" | node "${pf#node:}" host-hook \
      --fallback-event SessionStart \
      --platform "$PLATFORM" \
      "$PROJECT"
  else
    printf '%s' "$PAYLOAD" | "$pf" host-hook \
      --fallback-event SessionStart \
      --platform "$PLATFORM" \
      "$PROJECT"
  fi
}

run_sh() {
  local hooks_dir="$ROOT/assets/shared/hooks"
  local scripts_dir="$ROOT/assets/shared/scripts"
  local sh="$hooks_dir/session-start.sh"
  if [[ ! -f "$sh" ]]; then
    echo "[FAIL] missing $sh" >&2
    exit 1
  fi
  # 临时插件根布局：hooks/session-start + scripts/_polaris-cli（替换 @PLATFORM_ID@）
  local tmp
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/polaris-debug-ss.XXXXXX")"
  mkdir -p "$tmp/hooks" "$tmp/scripts"
  # shellcheck disable=SC2016
  awk -v pid="$PLATFORM" '{ gsub(/@PLATFORM_ID@/, pid); print }' \
    "$scripts_dir/_polaris-cli.sh" >"$tmp/scripts/_polaris-cli.sh"
  cp "$sh" "$tmp/hooks/session-start.sh"
  chmod +x "$tmp/scripts/_polaris-cli.sh" "$tmp/hooks/session-start.sh"

  # 保证能找到 polaris-flow：优先 PATH，否则用仓库 bin 包一层
  local path_prefix=""
  if ! command -v polaris-flow >/dev/null 2>&1; then
    if [[ -f "$ROOT/bin/polaris-flow.js" && -f "$ROOT/dist/cli/index.js" ]]; then
      path_prefix="$(mktemp -d "${TMPDIR:-/tmp}/polaris-debug-bin.XXXXXX")"
      cat >"$path_prefix/polaris-flow" <<EOF
#!/usr/bin/env bash
exec "$(command -v node)" "$ROOT/bin/polaris-flow.js" "\$@"
EOF
      chmod +x "$path_prefix/polaris-flow"
      export PATH="$path_prefix:$PATH"
    fi
  fi

  printf '%s' "$PAYLOAD" | bash "$tmp/hooks/session-start.sh" "$PROJECT"
  local ec=$?
  rm -rf "$tmp" ${path_prefix:+"$path_prefix"}
  return "$ec"
}

OUT_FILE="$(mktemp "${TMPDIR:-/tmp}/polaris-debug-out.XXXXXX")"
ERR_FILE="$(mktemp "${TMPDIR:-/tmp}/polaris-debug-err.XXXXXX")"
set +e
if [[ "$VIA" == "cli" ]]; then
  run_cli >"$OUT_FILE" 2>"$ERR_FILE"
else
  run_sh >"$OUT_FILE" 2>"$ERR_FILE"
fi
EC=$?
set -e

echo "=== exitCode: $EC ===" >&2
echo "--- stdout (宿主应解析的 JSON) ---" >&2
if [[ -s "$OUT_FILE" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    python3 -m json.tool <"$OUT_FILE" 2>/dev/null || cat "$OUT_FILE"
  else
    cat "$OUT_FILE"
  fi
  echo >&2
else
  echo "(empty)" >&2
fi
echo "--- stderr / tty 回退 ---" >&2
if [[ -s "$ERR_FILE" ]]; then
  cat "$ERR_FILE" >&2
else
  echo "(empty)" >&2
fi
echo "=== done ===" >&2

rm -f "$OUT_FILE" "$ERR_FILE"
exit "$EC"
