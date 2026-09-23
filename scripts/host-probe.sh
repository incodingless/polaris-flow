#!/usr/bin/env bash
# host-probe.sh — 采集「宿主形态（IDE / CLI）」判定所需的信号。
#
# 用途：为 D6（宿主形态维度）的第 ② 级探测收集实测依据。
#       规范位置见 docs/specs/2026-09-22-context-boundary-and-compaction-design.md §5.6.4。
#       **未实测不进规范** —— 本脚本只采集，不做判定、不猜。
#
# 只读：不修改仓库、不写 .polaris/、不联网、不输出任何含密钥的变量值。
#
# 用法：
#   bash scripts/host-probe.sh --label "trae/ide"
#   bash scripts/host-probe.sh --label "trae/cli" --out /tmp/host-probe.md      # 追加
#   bash scripts/host-probe.sh --label "cursor/ide" --out /tmp/host-probe.md --overwrite
#
# 采集协议：同一平台请在**该形态自己的对话窗口内**各跑一次，--label 写「平台/形态」。
#          例：在 Trae 的面板里跑一次（trae/ide）、在 Trae 的终端里跑一次（trae/cli）。

set -u

LABEL="unlabeled"
OUT=""
OVERWRITE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="${2:-unlabeled}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --overwrite) OVERWRITE=1; shift ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

# ---------- 输出装配 ----------
emit() {
  if [ -n "$OUT" ]; then
    if [ "$OVERWRITE" = "1" ]; then
      printf '%s\n' "$*" > "$OUT"; OVERWRITE=0
    else
      printf '%s\n' "$*" >> "$OUT"
    fi
  else
    printf '%s\n' "$*"
  fi
}

# ---------- 采集 ----------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo '')"
NOW="$(date '+%Y-%m-%dT%H:%M:%S%z')"
HOST_NAME="$(uname -s)"
SELF_PID=$$
SELF_PPID="$(ps -o ppid= -p $$ 2>/dev/null | tr -d ' ')"

# ps 可用性预检：受限环境（agent 沙箱常见）下 ps 会被禁用，此时父链采集必然为空。
PS_OK=1
if ! ps -o pid= -p $$ >/dev/null 2>&1; then
  PS_OK=0
fi

emit ""
emit "================================================================================"
emit "host-probe | label=${LABEL} | ${NOW}"
emit "================================================================================"

# [0] 采集环境
emit ""
emit "[0] 采集环境"
emit "  cwd            : $(pwd)"
emit "  repo_root      : ${REPO_ROOT:-（不在 git 仓库内）}"
emit "  uname          : $(uname -s -m -r 2>/dev/null)"
emit "  bash           : ${BASH_VERSION:-未知}"
emit "  script pid     : ${SELF_PID}  parent: ${SELF_PPID:-（ps 不可用）}"
if [ "${PS_OK}" = "0" ]; then
  emit ""
  emit "  ⚠️  ps 在此环境不可用（受限沙箱）→ [2][3] 段必为空，本次采集**不完整**。"
  emit "      请改用可运行 ps 的终端重跑本脚本；否则父链判据无从获得。"
fi

# [1] tty 状态
emit ""
emit "[1] tty 状态（脚本进程）"
if [ -t 0 ]; then emit "  [ -t 0 ] stdin : yes"; else emit "  [ -t 0 ] stdin : no"; fi
if [ -t 1 ]; then emit "  [ -t 1 ] stdout: yes"; else emit "  [ -t 1 ] stdout: no"; fi
if [ -t 2 ]; then emit "  [ -t 2 ] stderr: yes"; else emit "  [ -t 2 ] stderr: no"; fi
emit "  TERM           : ${TERM:-（未设置）}"
emit "  注：agent 执行本脚本时通常会自行捕获 stdout（管道），故此段恒为 no 属正常，"
emit "      **不能**据此判形态；形态判据看 [2] 父链。"

# [2] 进程父链
emit ""
emit "[2] 进程父链（本脚本 → 顶层）"
emit "  pid      ppid     comm"
_pid="${SELF_PID}"
_depth=0
while [ -n "${_pid}" ] && [ "${_pid}" != "0" ] && [ "${_pid}" != "1" ] && [ "${_depth}" -lt 32 ]; do
  _line="$(ps -o pid=,ppid= -p "${_pid}" 2>/dev/null | sed 's/^ *//')"
  [ -z "${_line}" ] && break
  _p="$(echo "${_line}" | awk '{print $1}')"
  _pp="$(echo "${_line}" | awk '{print $2}')"
  _comm="$(ps -o comm= -p "${_pid}" 2>/dev/null | sed 's/^ *//' | cut -c1-110)"
  _args="$(ps -o args= -p "${_pid}" 2>/dev/null | sed 's/^ *//' | cut -c1-150)"
  emit "  ${_p}  ${_pp}  ${_comm}"
  emit "        args: ${_args}"
  _pid="${_pp}"
  _depth=$((_depth + 1))
done
emit "  （共 ${_depth} 层）"
if [ "${_depth}" = "0" ]; then
  emit "  ⚠️  父链为空 —— ps 不可用于本环境。**此段是形态判定的主判据，缺失则本次采集无效**，"
  emit "      请在不受限的终端里重跑。"
fi

# [3] 宿主进程全景
emit ""
emit "[3] 宿主进程全景（关键词匹配，看有哪些宿主在跑）"
if [ "${PS_OK}" = "1" ]; then
  _hosts="$(ps -axo pid=,ppid=,comm= 2>/dev/null \
    | grep -iE 'trae|cursor|qoder|claude|Code Helper|Electron|iTerm|Terminal|Warp|ghostty|kitty|alacritty' \
    | head -40 || true)"
  if [ -n "${_hosts}" ]; then
    emit "$(printf '%s\n' "${_hosts}" | sed 's/^/  /')"
  else
    emit "  （无匹配进程）"
  fi
else
  emit "  ⚠️  跳过 —— ps 不可用。"
fi
emit "  ---"

# [4] 终端与形态相关 env（前缀白名单 + 敏感键排除）
emit ""
emit "[4] 形态相关 env（白名单前缀）"
_env_dumped=0
while IFS= read -r _kv; do
  _k="${_kv%%=*}"
  case "${_k}" in
    *KEY*|*key*|*TOKEN*|*token*|*SECRET*|*secret*|*PASSWORD*|*password*|*PASSWD*|*CREDENTIAL*|*credential*|*AUTH*|*auth*|*API*|*api*)
      continue ;;
  esac
  for _p in TERM TERM_PROGRAM TERM_SESSION_ID ITERM SSH_TTY SSH_CONNECTION TMUX WT_SESSION WT_PROFILE_ID VSCODE CLAUDE CURSOR TRAE QODER POLARIS; do
    case "${_k}" in
      ${_p}*) emit "  ${_kv}"; _env_dumped=$((_env_dumped + 1)); break ;;
    esac
  done
done <<EOF
$(env 2>/dev/null | LC_ALL=C sort)
EOF
[ "${_env_dumped}" = "0" ] && emit "  （前缀无命中——本身即为信号：宿主未注入任何形态相关变量）"

# 精确键：客户端元信息里直接描述「宿主是谁 / 什么形态」的变量。
# 已实测确认这类命名约定存在（当前宿主即暴露 CLIENT_INFO_IDE_TYPE / CODEBUDDY_HOST），
# 故列为形态判据的首选候选。值为客户端标识，非凭证。
for _k in CLIENT_INFO_IDE_TYPE CLIENT_INFO_PLATFORM CLIENT_INFO_PRODUCT_NAME \
          CLIENT_INFO_PLUGIN_NAME CLIENT_INFO_USER_AGENT_EXTENSION CODEBUDDY_HOST \
          WORKBUDDY_APP_NAME; do
  _v="$(printenv "${_k}" 2>/dev/null || true)"
  if [ -n "${_v}" ]; then emit "  ${_k}=${_v}   ← 形态判据候选"; fi
done

# [5] 平台入口存在性（该平台有哪些形态的入口）
emit ""
emit "[5] 平台入口存在性（回答「该平台是否存在该形态」）"
for _c in claude cursor cursor-agent trae trae-cn qoder code; do
  _path="$(command -v "${_c}" 2>/dev/null || true)"
  if [ -n "${_path}" ]; then emit "  which ${_c}: ${_path}"; else emit "  which ${_c}: （未找到）"; fi
done
if [ "${HOST_NAME}" = "Darwin" ]; then
  for _a in "Claude.app" "Claude Code.app" "Cursor.app" "Trae.app" "Trae CN.app" "Trae-CN.app" "Qoder.app" "Visual Studio Code.app" "iTerm.app" "Warp.app"; do
    if [ -d "/Applications/${_a}" ]; then emit "  /Applications/${_a}: 存在"; fi
  done
fi

# [6] polaris config（确认显式声明未开启，否则会覆盖探测结论）
emit ""
emit "[6] polaris config 现状"
if [ -n "${REPO_ROOT}" ] && [ -f "${REPO_ROOT}/.polaris/config.yaml" ]; then
  emit "  config.yaml    : ${REPO_ROOT}/.polaris/config.yaml"
  emit "  host_form      : $(grep -E '^host[-_]form:' "${REPO_ROOT}/.polaris/config.yaml" 2>/dev/null | head -1 | sed 's/^ *//' || echo '（无该键）')"
  emit "  auto_transition    : $(grep -E '^auto[-_]transition:' "${REPO_ROOT}/.polaris/config.yaml" 2>/dev/null | head -1 | sed 's/^ *//' || echo '（无该键）')"
  emit "  context_compression: $(grep -E '^context[-_]compression:' "${REPO_ROOT}/.polaris/config.yaml" 2>/dev/null | head -1 | sed 's/^ *//' || echo '（无该键）')"
  emit "  注：host_form 非空时会**覆盖**探测结果（第 ① 级优先）。验证探测时应先留空。"
else
  emit "  （未找到 .polaris/config.yaml）"
fi

# [7] env 键名全集（只有键名，无值；用于挖未知信号）
emit ""
emit "[7a] 候选信号高亮（键名疑似与「宿主形态」相关 → 实测时优先看这段）"
_cand="$(env 2>/dev/null | awk -F= '{print $1}' | LC_ALL=C sort \
  | grep -iE 'IDE|HOST|CLIENT|EDITOR|PRODUCT|TERM_PROGRAM|SURFACE|MODE|APP|SHELL' || true)"
if [ -n "${_cand}" ]; then
  emit "$(printf '%s\n' "${_cand}" | sed 's/^/  * /')"
else
  emit "  （无命中 —— 本身即为信号：该宿主未暴露形态相关变量名）"
fi

emit ""
emit "[7b] env 键名全集（仅键名，无值）"
emit "$(env 2>/dev/null | awk -F= '{print $1}' | LC_ALL=C sort | sed 's/^/  /' || true)"

# [8] 人工判定（执行者填）
emit ""
emit "[8] 判定（人工填写后回填设计文档 §5.6.4）"
emit "  本次形态        : ____________   （ide / cli）"
emit "  关键判据        : ____________   （如「父链第 3 层是 Trae 主进程」）"
emit "  反例/干扰       : ____________   （如「内置终端与面板父链相同，无法区分」）"
emit ""
emit "================================================================================"
emit ""

if [ -n "$OUT" ]; then
  echo "已写入: ${OUT}"
fi
