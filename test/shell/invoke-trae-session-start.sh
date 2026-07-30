#!/usr/bin/env bash
# invoke-trae-session-start.sh — 模拟 Trae 宿主 SessionStart 调用 polaris-flow host-hook
#
# 默认 stdin（与 Trae SessionStart 对齐）：
#   {
#     "session_id": "...",
#     "hook_event_name": "SessionStart",
#     "source": "startup"
#   }
#
# 用法：
#   bash test/shell/invoke-trae-session-start.sh
#   bash test/shell/invoke-trae-session-start.sh --project /path/to/proj
#   POLARIS_HOOK_DEBUG=1 bash test/shell/invoke-trae-session-start.sh
#   bash test/shell/invoke-trae-session-start.sh --session-id my-sess-1 --dry-run
#
# 依赖：仓库根已 pnpm build，或 PATH 中有 polaris-flow。
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT="$(pwd)"
SESSION_ID="trae-session-$(date -u +%Y%m%dT%H%M%SZ)"
DRY_RUN=0
VIA="cli" # cli | sh

usage() {
  cat <<'EOF'
Usage: bash test/shell/invoke-trae-session-start.sh [options]

模拟 Trae 平台 SessionStart：stdin 含 session_id / hook_event_name / source，
经 polaris-flow host-hook --platform trae 执行。

Options:
  --project <path>       项目根（传给 host-hook 位置参数；默认当前目录）
  --session-id <id>      stdin.session_id（默认自动生成）
  --via <cli|sh>         直接 CLI，或经 assets session-start.sh（默认 cli）
  --dry-run              只打印 stdin，不执行
  -h, --help             帮助

Env:
  POLARIS_HOOK_DEBUG=1   handler 调试日志（stderr）

Example:
  POLARIS_HOOK_DEBUG=1 bash test/shell/invoke-trae-session-start.sh --project "$PWD"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT="${2:?}"
      shift 2
      ;;
    --session-id)
      SESSION_ID="${2:?}"
      shift 2
      ;;
    --via)
      VIA="${2:?}"
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

case "$VIA" in
  cli|sh) ;;
  *)
    echo "invalid --via: $VIA" >&2
    exit 2
    ;;
esac

PROJECT="$(cd "$PROJECT" && pwd)"

# Trae SessionStart 请求体（按你给的字段）
PAYLOAD="$(cat <<EOF
{
  "session_id": "${SESSION_ID}",
  "hook_event_name": "SessionStart",
  "source": "startup"
}
EOF
)"

echo "=== Trae SessionStart invoke ===" >&2
echo "project    : $PROJECT" >&2
echo "session_id : $SESSION_ID" >&2
echo "via        : $VIA" >&2
echo "--- stdin ---" >&2
printf '%s\n' "$PAYLOAD" >&2
echo "-------------" >&2

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '%s\n' "$PAYLOAD"
  exit 0
fi

resolve_cli() {
  if command -v polaris-flow >/dev/null 2>&1; then
    echo "bin"
    return 0
  fi
  if [[ -f "$ROOT/bin/polaris-flow.js" && -f "$ROOT/dist/cli/index.js" ]]; then
    echo "node"
    return 0
  fi
  return 1
}

run_cli() {
  local mode
  if ! mode="$(resolve_cli)"; then
    echo "[FAIL] polaris-flow 不可用。请先: pnpm build" >&2
    exit 1
  fi
  if [[ "$mode" == "bin" ]]; then
    printf '%s' "$PAYLOAD" | polaris-flow host-hook \
      --fallback-event SessionStart \
      --platform trae \
      "$PROJECT"
  else
    printf '%s' "$PAYLOAD" | node "$ROOT/bin/polaris-flow.js" host-hook \
      --fallback-event SessionStart \
      --platform trae \
      "$PROJECT"
  fi
}

run_sh() {
  local hooks_dir="$ROOT/assets/shared/hooks"
  local tmp
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/polaris-trae-ss.XXXXXX")"
  awk -v pid="trae" '{ gsub(/@PLATFORM_ID@/, pid); print }' \
    "$hooks_dir/_polaris-cli.sh" >"$tmp/_polaris-cli.sh"
  cp "$hooks_dir/session-start.sh" "$tmp/session-start.sh"
  chmod +x "$tmp/_polaris-cli.sh" "$tmp/session-start.sh"

  local path_prefix=""
  if ! command -v polaris-flow >/dev/null 2>&1; then
    if [[ -f "$ROOT/bin/polaris-flow.js" && -f "$ROOT/dist/cli/index.js" ]]; then
      path_prefix="$(mktemp -d "${TMPDIR:-/tmp}/polaris-trae-bin.XXXXXX")"
      cat >"$path_prefix/polaris-flow" <<EOF
#!/usr/bin/env bash
exec "$(command -v node)" "$ROOT/bin/polaris-flow.js" "\$@"
EOF
      chmod +x "$path_prefix/polaris-flow"
      export PATH="$path_prefix:$PATH"
    fi
  fi

  printf '%s' "$PAYLOAD" | bash "$tmp/session-start.sh" "$PROJECT"
  local ec=$?
  rm -rf "$tmp" ${path_prefix:+"$path_prefix"}
  return "$ec"
}

OUT="$(mktemp "${TMPDIR:-/tmp}/polaris-trae-out.XXXXXX")"
ERR="$(mktemp "${TMPDIR:-/tmp}/polaris-trae-err.XXXXXX")"
set +e
if [[ "$VIA" == "cli" ]]; then
  run_cli >"$OUT" 2>"$ERR"
else
  run_sh >"$OUT" 2>"$ERR"
fi
EC=$?
set -e

echo "=== exitCode: $EC ===" >&2
echo "--- stdout (Trae/Claude 信封 JSON) ---" >&2
if [[ -s "$OUT" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    python3 -m json.tool <"$OUT" 2>/dev/null || cat "$OUT"
  else
    cat "$OUT"
  fi
  echo >&2
else
  echo "(empty)" >&2
fi
echo "--- stderr ---" >&2
if [[ -s "$ERR" ]]; then
  cat "$ERR" >&2
else
  echo "(empty)" >&2
fi

rm -f "$OUT" "$ERR"
exit "$EC"
