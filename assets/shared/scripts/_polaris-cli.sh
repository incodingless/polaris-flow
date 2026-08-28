#!/usr/bin/env bash
# _polaris-cli.sh — hooks/scripts 薄包装共用：CRLF 自愈 + 查找 polaris-flow CLI 并 exec
#
# 双入口约定（package.json bin）：
#   - polaris       → 给人用的 CLI（init / status / update 等）
#   - polaris-flow  → 给 hooks/scripts 用的运行时入口（本脚本只查这个，避免与用户 CLI 混淆）
#
# 用法（由各薄包装 source）：
#   # 可选：对调用方脚本做 CRLF 自愈
#   _polaris_cli_selfheal "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}" "$@"
#   exec_polaris <subcommand> "$@"
#
# 本文件驻留 plugins/scripts/；不单独作为入口执行。
#
# @PLATFORM_ID@：安装期由 rewritePolarisCliPlatformId 替换为真实平台 id
# （claude / cursor / trae）。未替换时 CLI 会因无效 platform 失败。

# === CRLF self-heal（对 hooks/、scripts/ 与 scorers/ 下 *.sh）===
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
      for _f in $(find "$root/hooks" "$root/scripts" "$root/scorers" -type f -name '*.sh' 2>/dev/null); do
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

# 查找 polaris-flow 并 exec 子命令；找不到则提示并 exit 1
# PLATFORM_ID 在安装期由程序完成值的替换，如：claude、trae、cursor 等
exec_polaris() {
  local subcmd="$1"
  shift
  # 运行时入口：只用 polaris-flow（与用户侧 polaris CLI 分离）
  if command -v polaris-flow >/dev/null 2>&1; then
    exec polaris-flow "$subcmd" "$@" --platform @PLATFORM_ID@
  fi
  _polaris_cli_tty "[polaris-flow][FAIL] polaris-flow CLI not found — hook requires a global install"
  _polaris_cli_tty "                  Install: npm install -g @polaris/polaris-flow"
  _polaris_cli_tty "                  Then retry (or run: polaris-flow ${subcmd} …)"
  _polaris_cli_tty "                  Note: interactive CLI remains 'polaris' (init/status/…)"
  exit 1
}
