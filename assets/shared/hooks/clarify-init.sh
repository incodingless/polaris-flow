#!/usr/bin/env bash
# hooks/task-init.sh — clarify Step 4.1 全流程一次性封装
#
# 用法：bash task-init.sh <repo_root>
#
# 退出码：
#   0  成功：stdout 输出 JSON {"status":"ok","task_name":"...","task_dir":"..."}
#   1  已有未完成任务：stdout 输出 JSON {"status":"existing","existing":[...]}
#      调用方通过 ask_followup_question 询问用户 A/B/C
#   2  参数/环境错误（stderr 含详情）
#   3  workflow entry 写入失败（stderr 含详情）

set -uo pipefail

REPO_ROOT="${1:-}"
if [ -z "$REPO_ROOT" ] || [ ! -d "$REPO_ROOT" ]; then
  echo "[task-init] 阻断：缺少或无效的 repo_root 参数" >&2
  exit 2
fi

CONFIG_FILE="$REPO_ROOT/.polaris/config.yaml"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "[task-init] 阻断：$CONFIG_FILE 不存在，请重启会话" >&2
  exit 2
fi

PLUGIN_ROOT="$(cat "$CONFIG_FILE" | grep "plugin_root" | awk -F'"' '{print $2}')"

# ===== 创建 draft 目录 =========================================================
DRAFT_RESULT=$(bash "$PLUGIN_ROOT/hooks/draft-create.sh" "$REPO_ROOT")
DRAFT_EXIT=$?

if [ "$DRAFT_EXIT" -eq 1 ]; then
  existing_json=$(echo "$DRAFT_RESULT" | sed 's/.*"existing":\(\[.*\]\).*/\1/')
  printf '{"status":"existing","existing":%s}\n' "$existing_json"
  exit 1
fi

if [ "$DRAFT_EXIT" -ne 0 ]; then
  echo "[design-init] 阻断：draft-create.sh 返回 exit $DRAFT_EXIT" >&2
  exit 2
fi

draft_name=$(echo "$DRAFT_RESULT" | sed 's/.*"draft_name":"\([^"]*\)".*/\1/')
draft_dir="$REPO_ROOT/.polaris/tasks/$draft_name"

# ===== 写 state.yaml ===========================================================
mkdir -p "$draft_dir"
cat > "$draft_dir/state.yaml" << STATE_EOF
change_id: "$draft_name"
current_verb: clarify
clarify:
  status: in_progress
  draft_dir: "$draft_name"
STATE_EOF

# ===== 追加 workflow entry =====================================================

#bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" append-active --skill clarify \
#  --repo-root "$REPO_ROOT" \
#  --change-id "$draft_name" --phase clarify --worktree-path "" \
#  --started-at "$(date -u +%FT%TZ)"
#wf_exit=$?
#if [ "$wf_exit" -ne 0 ]; then
#  echo "[task-init] 阻断：workflow-entry.sh 返回 exit $wf_exit（H12）" >&2
#  exit 3
#fi

printf '{"status":"ok","draft_name":"%s","draft_dir":"%s"}\n' "$draft_name" "$draft_dir"
exit 0