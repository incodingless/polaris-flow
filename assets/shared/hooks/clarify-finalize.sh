#!/usr/bin/env bash
# hooks/task-finalize.sh — clarify Step 4.4 全流程一次性封装
#
# 用法：
#   bash task-finalize.sh <repo_root> <draft_name> <change_id>
#
# 功能：
#   1. 校验目标目录不存在
#   2. mv draft 目录 → 正式 change_id 目录
#   3. 更新 state.yaml（change_id / clarify.status / clarify.path → 暂存 intention 路径）
#      注：intention 在 propose Step 4.5 迁入 openspec 后，须由 propose 更新路径字段；本脚本只写暂存路径
#   4. 回填 intention.md 首行 "# intention: <TBD>" → "# intention: <change_id>"
#   5. 执行 workflow-entry.sh rename-active
#
# 退出码：
#   0  成功：stdout 输出单行 JSON
#      {"status":"ok","change_id":"...","change_dir":"...","intention_path":"..."}
#   1  目标目录已存在（HARD STOP）
#   2  参数/环境错误
#   3  workflow rename 失败

set -uo pipefail

REPO_ROOT="${1:-}"
DRAFT_NAME="${2:-}"
CHANGE_ID="${3:-}"

if [ -z "$REPO_ROOT" ] || [ -z "$DRAFT_NAME" ] || [ -z "$CHANGE_ID" ]; then
  echo "[task-finalize] 阻断：用法 task-finalize.sh <repo_root> <draft_name> <change_id>" >&2
  exit 2
fi
if [ ! -d "$REPO_ROOT" ]; then
  echo "[task-finalize] 阻断：repo_root 不存在: $REPO_ROOT" >&2
  exit 2
fi

PLUGIN_ROOT_FILE="$REPO_ROOT/.polaris/config.yaml"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "[task-finalize] 阻断：$CONFIG_FILE 不存在" >&2
  exit 2
fi
PLUGIN_ROOT="$(cat "$CONFIG_FILE" | grep "plugin_root" | awk -F'"' '{print $2}')"

DRAFT_DIR="$REPO_ROOT/.polaris/tasks/$DRAFT_NAME"
TARGET_DIR="$REPO_ROOT/.polaris/tasks/$CHANGE_ID"
INTENTION="$TARGET_DIR/intention.md"
STATE_YAML="$TARGET_DIR/state.yaml"

# ===== 1. 校验目标目录不存在 ==================================================
if [ -e "$TARGET_DIR" ]; then
  echo "[task-finalize] 阻断：目标目录已存在 $TARGET_DIR" >&2
  exit 1
fi

if [ ! -d "$DRAFT_DIR" ]; then
  echo "[task-finalize] 阻断：draft 目录不存在 $DRAFT_DIR" >&2
  exit 2
fi

# ===== 2. 重命名目录 ===========================================================
mv "$DRAFT_DIR" "$TARGET_DIR"

# ===== 3. 更新 state.yaml ======================================================
if [ -f "$STATE_YAML" ]; then
  # 用 sed 原地替换各字段（兼容 macOS BSD sed）
  sed -i.bak \
    -e "s|^task_id:.*|task_id: \"$CHANGE_ID\"|" \
    -e "s|^  draft_dir:.*|  draft_dir: \"\"|" \
    "$STATE_YAML"
  # 追加/更新 clarify 块的 status 和 path
  # 若已有 status: in_progress 则替换，否则在 clarify: 行后追加
  if grep -q "^  status:" "$STATE_YAML"; then
    sed -i.bak \
      -e "s|^  status:.*|  status: completed|" \
      "$STATE_YAML"
  fi
  # 追加 path 字段（幂等：先删再加）
  grep -v "^  path:" "$STATE_YAML" > "$STATE_YAML.tmp" && mv "$STATE_YAML.tmp" "$STATE_YAML"
  sed -i.bak "/^  status: completed/a\\
  path: .polaris/tasks/$CHANGE_ID/intention.md" "$STATE_YAML"
  rm -f "$STATE_YAML.bak"
fi

# ===== 4. 回填 intention.md 首行 =============================================
if [ -f "$INTENTION" ]; then
  sed -i.bak "s|^# intention:.*|# intention: $CHANGE_ID|" "$INTENTION"
  rm -f "$INTENTION.bak"
fi

# ===== 5. workflow rename-active ==============================================
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" rename-active --skill clarify \
  --repo-root "$REPO_ROOT" \
  --from "$DRAFT_NAME" --to "$CHANGE_ID"
wf_exit=$?
if [ "$wf_exit" -ne 0 ]; then
  echo "[task-finalize] 阻断：workflow rename-active 返回 exit $wf_exit" >&2
  exit 3
fi

printf '{"status":"ok","change_id":"%s","change_dir":"%s","intention_path":"%s"}\n' \
  "$CHANGE_ID" "$TARGET_DIR" "$INTENTION"
exit 0
