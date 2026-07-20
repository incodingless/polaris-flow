#!/usr/bin/env bash
# session-start.sh — polaris-flow SessionStart hook
#
# Claude Code / Trae / CodeBuddy SessionStart hook 的输出契约：
#   - 退出码 0：stdout 喂给 AI（用户看不到）
#   - 退出码 ≠ 0：stderr 由宿主截获后"重新渲染"给用户——但宿主对多行/长文本有截断策略，
#     十几行的安装指引会被压成一两行，人看不到完整内容。
#   - 失败本身不会阻断会话启动。
#
# 关键问题：hook 不是直连用户终端的。它的 stdout/stderr 都先被宿主进程截获，
# 宿主再在自己的 UI 里重新渲染（并截断）。要把完整多行内容"原样展示给人看"，
# 必须绕开宿主捕获，直接写控制终端设备 /dev/tty（见 _tty）。
#
# 策略：
#   - [OK]   → stdout（成功摘要喂给 AI；用户看不到，成功路径默认静默）
#   - [WARN]/[FAIL]/[HINT]/标题/汇总 → _tty：优先直写 /dev/tty（人可原样看到，不被宿主截断），
#     无 TTY（CI 等）时回退 stderr。
#
# 仍保留"有 WARN/FAIL 即 exit 1"：一是兼容无 TTY 回退到 stderr 的展示路径，
# 二是让宿主把本次会话标记为"hook 有告警"。会话本身不会被 exit 1 阻断启动。

# === BEGIN CRLF self-heal（必须放在 set -euo pipefail 之前）===
# 防御层 2：即便 .gitattributes 漏网（用户手改 / IDE 错配 / 复制粘贴 / 企业代理改文件），
# 检测自身是否含 CR。若是则就地剥掉 hooks/ 与 scorers/ 下所有 *.sh 的 CR，
# 然后 re-exec 自己，避免 bash 把 `pipefail\r`、`fi\r` 等当作 invalid option / syntax error。
# 已是 LF 时 case 不命中，零开销。
case "$(head -c 200 "${BASH_SOURCE[0]}" 2>/dev/null)" in
  *$'\r'*)
    _selfheal_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    _selfheal_root="$(cd "$_selfheal_dir/.." && pwd)"
    # 用 tr 替代 sed -i，跨 Git Bash / macOS BSD sed 都稳
    for _f in $(find "$_selfheal_root/hooks" "$_selfheal_root/scorers" -type f -name '*.sh' 2>/dev/null); do
      tr -d '\r' < "$_f" > "$_f.lftmp" 2>/dev/null && mv "$_f.lftmp" "$_f" 2>/dev/null
    done
    echo "[easy-flow] CRLF detected in shell scripts — self-healed to LF and re-exec'd" >&2
    exec bash "${BASH_SOURCE[0]}" "$@"
    ;;
esac
# === END CRLF self-heal ===

set -euo pipefail

REPO_ROOT="$(pwd)" # 当前工作目录即为项目根目录
CONFIG_FILE="$REPO_ROOT/.polaris/config.yaml"

PLUGIN_ROOT="$(cat "$CONFIG_FILE" | grep "plugin_root" | awk -F'"' '{print $2}')"
SCRIPT_DIR= "$PLUGIN_ROOT/hooks"

# 输出辅助函数：明确通道，避免散落的 echo 误用
#
# _tty：面向人的内容。优先直写控制终端 /dev/tty（绕开宿主截获，原样完整展示给人），
#       无 TTY（CI / 无控制终端）时回退 stderr，保证不报错也不丢信息。
_tty() {
  if { true > /dev/tty; } 2>/dev/null; then
    printf '%s\n' "$*" > /dev/tty
  else
    printf '%s\n' "$*" >&2
  fi
}
_ok()   { echo "[OK] $*"; }                       # → stdout（喂 AI）
_warn() { _tty "[polaris-flow][WARN] $*"; }       # → /dev/tty（人可见，回退 stderr）
_fail() { _tty "[polaris-flow][FAIL] $*"; }       # → /dev/tty（人可见，回退 stderr）
_hint() { _tty "                  $*"; }          # → /dev/tty（紧跟 fail/warn 的提示行，缩进对齐）

_tty "=== polaris-flow SessionStart Check ==="


# 0. 读取当前平台，从项目根目录读取 .polaris/config.yaml 中的 platform 字段
PLATFORM_ID="$(cat "$CONFIG_FILE" | grep "platform" | awk -F'"' '{print $2}')"

# 1a 检查 superpowers 是否安装
#    缺失 → WARN（不阻断会话），用户必须自己去 marketplace 装；hook 不代为安装。
check_superpowers() {
  # 执行 plugin-check.sh 检查 superpowers 是否安装
  SP_CHECK_RESULT = $(bash "$PLUGIN_ROOT/hooks/plugin-check.sh" --platform "${PLATFORM_ID}" --plugin superpowers "${REPO_ROOT}" --quiet);
  echo "SP_CHECK_RESULT: $SP_CHECK_RESULT"
  # 从结果中读取“ok”字段
  SP_OK=$(echo "$SP_CHECK_RESULT" | grep "ok" | awk -F'"' '{print $2}')
  
  if [ "$SP_OK" == "true" ]; then
    _ok "superpowers found"
    return 0
  else
    _warn "superpowers plugin not found — polaris-flow 多数 skill 依赖 superpowers 的 subagent 派发能力"
    _hint "要求版本：superpowers >= 4.0.0"
    _hint "安装方式（宿主 plugin，hook 不代为安装）："
    _hint "  - Trae：执行 polaris install 选择 superpowers 插件"
    _hint "  - CodeBuddy：打开 Plugin Marketplace → 搜索 superpowers → Install"
    _hint "  - Claude Code：打开 plugin 设置 → Add plugin → superpowers"
    _hint "  - 详情：https://github.com/superpowers-ai/superpowers"
    _hint "（缺失不阻断会话，但 build/lock 等阶段的 subagent 派发将不可用）"
    return 1
}

# 1b. 检查 openspec CLI 是否安装（npm 全局包）
#     缺失 → WARN（不阻断会话），告知用户安装命令。
#     接受两个上游：
#       - @fission-ai/openspec     → 二进制名 `openspec`
#       - @studyzy/openspec-cn     → 二进制名 `openspec-cn`（社区中文版/镜像）
#     任一存在即视为通过。注意：下游 skill 当前硬编码调用 `openspec ...`，
#     若用户只装了 cn 版，需要自行把 `openspec-cn` 软链/别名为 `openspec`，
#     否则 hook 通过但 skill 仍会失败（hook 已在告警里提示这一点）。
check_openspec() {
  # 执行 plugin-check.sh 检查 superpowers 是否安装
  OS_CHECK_RESULT = $(bash "$PLUGIN_ROOT/hooks/plugin-check.sh" --platform "${PLATFORM_ID}" --plugin openspec "${REPO_ROOT}" --quiet);
  echo "OS_CHECK_RESULT: $OS_CHECK_RESULT"
  # 从结果中读取“ok”字段
  OS_OK=$(echo "$OS_CHECK_RESULT" | grep "ok" | awk -F'"' '{print $2}')
  
  if [ "$SP_OK" == "true" ]; then
    _ok "openspec found"
    return 0
  else
    _warn "openspec CLI not found — polaris-flow 的 propose/design/build/ship 依赖 openspec 命令"
    _hint "接受以下任一上游（任一存在即视为通过）："
    _hint "  - 官方版：@fission-ai/openspec   → 二进制 'openspec'"
    _hint "  - 社区版：@studyzy/openspec-cn   → 二进制 'openspec-cn'（中文/镜像）"
    _hint "要求 Node.js >= 20.19.0"
    _hint "安装方式（任选其一）："
    _hint "  - 官方全局：     npm install -g @fission-ai/openspec@latest"
    _hint "  - 社区全局：     npm install -g @studyzy/openspec-cn"
    _hint "  - pnpm 全局：    pnpm add -g @fission-ai/openspec   # 或 @studyzy/openspec-cn"
    _hint "  - 临时使用：     npx -y @fission-ai/openspec <subcommand>"
    _hint "安装后用 'openspec --version' 或 'openspec-cn --version' 验证"
    _hint "详情：https://github.com/Fission-AI/OpenSpec  /  https://www.npmjs.com/package/@studyzy/openspec-cn"
    _hint "（缺失不阻断会话，但 openspec 相关阶段会失败）"
    return 1
}

# 2. 检查 .polaris/ —— 项目运行时状态（用户配置 + 缓存 + 产物索引）
#    - .polaris/ 不存在 → 提示初始化
#    - config.yaml 不存在 → 提示初始化
#    - .gitignore 缺条目 → 追加
#    plugin 的 hooks/scorers 不再镜像到 .polaris/，由 .plugin_root 探针文件定位（见 §3.1）
check_config() {
  # 2.1 确保 .polaris/ 目录
  if [ ! -d ".polaris" ]; then
    _fail ".polaris/ directory not found, please run 'polaris init' to create it"
    return 1
  else
    _ok ".polaris/ directory found"
  fi

  # 2.2 检查 config.yaml 是否存在
  if [ ! -f ".polaris/config.yaml" ]; then
    _fail ".polaris/config.yaml not found, please run 'polaris init' to create it"
    return 1
  else
    _ok "config.yaml found"
  fi

  # 2.3 .polaris/.gitignore 屏蔽运行时产物
  # 使用 workflow.yaml（游标）+ tasks/<id>/state.yaml（单 change 档案）
  # 新增 .locks/，承载 ship.lock 等进程级互斥锁（不入仓，仅本机生效）
  local gitignore=".polaris/.gitignore"
  local needed_entries=(".cache/" ".locks/" "deepreads/" "metrics/" "workflow.yaml" "tasks/" "archive/" "overrides.log")
  local entry
  for entry in "${needed_entries[@]}"; do
    if [ ! -f "$gitignore" ] || ! grep -qxF "$entry" "$gitignore" 2>/dev/null; then
      echo "$entry" >> "$gitignore" 2>/dev/null || _warn "could not append '$entry' to $gitignore"
    fi
  done

  # 2.4 物化 workflow.yaml 骨架（仅首次；空 active_changes 数组）
  local workflow_src="$PLUGIN_ROOT/templates/workflow-template.yaml"
  local workflow_dst=".polaris/workflow.yaml"
  if [ ! -f "$workflow_dst" ]; then
    if [ -f "$workflow_src" ]; then
      if cp "$workflow_src" "$workflow_dst" 2>/dev/null; then
        _ok "materialized .polaris/workflow.yaml (from template)"
      else
        _warn "failed to write $workflow_dst (skills will lazily create it on first write)"
      fi
    else
      _warn "plugin template missing: $workflow_src"
    fi
  fi

  # 2.5 .polaris/.locks/ —— 进程级互斥锁目录（ship.lock 等；不入仓，仅本机生效）
  mkdir -p ".polaris/.locks" 2>/dev/null || _warn "could not create .polaris/.locks (ship lock will fail)"
}

# 3. 维护 .polaris/sessions/ —— session_id
init_session_id() {
  local sessions_dir=".polaris/sessions"
  if ! mkdir -p "$sessions_dir" 2>/dev/null; then
    _fail "failed to create $sessions_dir (permission denied?)"
    return 1
  fi

  # 3.1 session_id：ISO 时间戳 + 6 位随机后缀
  local timestamp random_suffix
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%S)"
  if command -v xxd >/dev/null 2>&1; then
    random_suffix="$(head -c 3 /dev/urandom | xxd -p | head -c 6)"
  elif command -v od >/dev/null 2>&1; then
    random_suffix="$(head -c 3 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 6)"
  else
    random_suffix="$(printf '%06x' $(( (RANDOM << 8) ^ RANDOM )))"
  fi
  
  local session_id="${timestamp}-${random_suffix}"

  # 写入按 PPID 隔离的专属文件（多 session 并发安全）
  if ! echo "$session_id" > "$sessions_dir/$PPID.id" 2>/dev/null; then
    _fail "failed to write $sessions_dir/$PPID.id"
    return 1
  fi
  _ok "subagent-probe session_id: $session_id (PPID=$PPID)"
}

# 4. 把评审类 agent 复制到 平台专属目录/agents/ 并注入模型
#    让宿主能按注册名 Task(subagent_type=…) 直派；
#    模型取 config.yaml: challenger.model，留空 = inherit（复用主 agent 模型）。
#    支持 Claude Code、Trae；其它宿主静默跳过。
#    源文件由 init 从 assets/<lang>/agents/ 装到 .${PLATFORM}/agents/；
#    session-start 仅在已存在时注入 challenger.model。
inject_review_agent_model() {
  local name="$1"
  local dst_dir=".${PLATFORM_ID}/agents"
  local dst="$dst_dir/${name}.md"

  if [ ! -f "$dst" ]; then
    _warn "$name 未安装到 $dst（请先 polaris-flow init/update）"
    return 1
  fi

  local model="inherit"
  if [ -f "config.yaml" ]; then
    local cfg
    cfg="$(sed -n -E 's/^[[:space:]]+model:[[:space:]]*"?([^"#]*)"?.*/\1/p' config.yaml 2>/dev/null | head -n1 | sed -E 's/[[:space:]]+$//')"
    [ -n "$cfg" ] && model="$cfg"
  fi

  if sed "s/^model:.*/model: $model/" "$dst" > "${dst}.tmp" 2>/dev/null && mv "${dst}.tmp" "$dst"; then
    _ok "$name model → $model ($dst)"
  else
    rm -f "${dst}.tmp" 2>/dev/null || true
    _warn "注入 $name model 失败"
    return 1
  fi
}

sync_review_agent() {
  case "$PLATFORM_ID" in
    "claude") ;;
    "trae") ;;
    *) return 0 ;;
  esac

  local rc=0
  inject_review_agent_model "propose-review-agent" || rc=1
  inject_review_agent_model "design-review-agent" || rc=1
  inject_review_agent_model "plan-review-agent" || rc=1
  inject_review_agent_model "openspec-review-agent" || rc=1
  return "$rc"
}
# Execute checks
# 两类计数：
#   - WARN_COUNT：依赖缺失等"用户可纠正"问题（如 superpowers/openspec 未装）
#   - FAIL_COUNT：hook 自身/写盘失败等"非用户问题"
# 任意非零 → exit 1，让 stderr 真正显示给用户（SessionStart hook 输出契约：仅在 exit≠0 时 stderr 才会给用户看）
WARN_COUNT=0
FAIL_COUNT=0
run_warn_step() {
  if ! "$@"; then
    WARN_COUNT=$((WARN_COUNT + 1))
  fi
}
run_fail_step() {
  if ! "$@"; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# 临时关闭 errexit 以便累计失败（每个 step 自己用 return 1 表达失败）
set +e
run_warn_step check_superpowers
run_warn_step check_openspec
run_fail_step check_config
run_fail_step init_session_id
run_warn_step sync_review_agent

set -e

if [ "$FAIL_COUNT" -gt 0 ] || [ "$WARN_COUNT" -gt 0 ]; then
  _tty ""
  if [ "$FAIL_COUNT" -gt 0 ]; then
    _fail "polaris-flow SessionStart finished with $FAIL_COUNT failure(s), $WARN_COUNT warning(s) — 见上方信息"
  else
    _warn "polaris-flow SessionStart finished with $WARN_COUNT dependency warning(s) — 见上方安装指引；会话可继续，但相关阶段可能失败"
  fi
  exit 1
fi

echo ""
echo "=== polaris-flow ready ==="
