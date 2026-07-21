#!/usr/bin/env bash
# _polaris-cli.sh — hooks 薄包装共用：CRLF 自愈 + 查找 polaris CLI 并 exec
#
# 用法（由各 hook 薄包装 source）：
#   # 可选：对调用方脚本做 CRLF 自愈
#   _polaris_cli_selfheal "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}" "$@"
#   exec_polaris <subcommand> "$@"
#
# 不单独作为 hook 入口执行。

# === CRLF self-heal（对 hooks/ 与 scorers/ 下 *.sh）===
# 参数：$1=触发自愈的脚本路径；$2...=原 argv（re-exec 时转发）
_polaris_cli_selfheal() {
  local self="$1"
  shift
  case "$(head -c 200 "$self" 2>/dev/null)" in
    *$'\r'*)
      local dir root
      dir="$(cd "$(dirname "$self")" && pwd)"
      root="$(cd "$dir/.." && pwd)"
      local _f
      for _f in $(find "$root/hooks" "$root/scorers" -type f -name '*.sh' 2>/dev/null); do
        tr -d '\r' < "$_f" > "$_f.lftmp" 2>/dev/null && mv "$_f.lftmp" "$_f" 2>/dev/null
      done
      echo "[polaris-flow] CRLF detected in shell scripts — self-healed to LF and re-exec'd" >&2
      exec bash "$self" "$@"
      ;;
  esac
}

_polaris_cli_tty() {
  if { true > /dev/tty; } 2>/dev/null; then
    printf '%s\n' "$*" > /dev/tty
  else
    printf '%s\n' "$*" >&2
  fi
}

# 查找 polaris / polaris-flow 并 exec 子命令；找不到则提示并 exit 1
exec_polaris() {
  local subcmd="$1"
  shift
  if command -v polaris >/dev/null 2>&1; then
    exec polaris "$subcmd" "$@"
  fi
  if command -v polaris-flow >/dev/null 2>&1; then
    exec polaris-flow "$subcmd" "$@"
  fi
  _polaris_cli_tty "[polaris-flow][FAIL] polaris CLI not found — hook requires a global install"
  _polaris_cli_tty "                  Install: npm install -g @polaris/polaris-flow"
  _polaris_cli_tty "                  Then retry (or run: polaris ${subcmd} …)"
  exit 1
}
