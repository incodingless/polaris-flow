#!/usr/bin/env bash
# worktree-create.sh — easy-flow propose 阶段 worktree 创建脚本
#
# 由 propose Step 1.3.A 调用。确定性执行:
# 格式校验 → .gitignore → 冲突检查 → mkdir → git worktree add →
# cp changes → mv snapshot → 写 state.yaml
#
# 用法:
#   bash worktree-create.sh <change_id> <main_repo_root>
#
# 退出码:
#   0  成功(stdout JSON 含 target_path / target_branch)
#   1  阻断(stderr 有错误信息)
#
# stdout (exit 0):
#   {"target_path":"...","target_branch":"...","snapshot_path":"..."}

set -uo pipefail

CHANGE_ID="${1:-}"
MAIN_REPO_ROOT="${2:-}"

if [ -z "$CHANGE_ID" ] || [ -z "$MAIN_REPO_ROOT" ]; then
  echo "[easy-flow] 用法: worktree-create.sh <change_id> <main_repo_root>" >&2
  exit 1
fi

# --- 1. 格式校验 ---
if ! echo "$CHANGE_ID" | grep -qE '^[a-z][a-z0-9-]+-[0-9a-f]{6}$'; then
  echo "[easy-flow] 阻断：change_id 格式不合规：$CHANGE_ID (期望 ^[a-z][a-z0-9-]+-[0-9a-f]{6}\$)" >&2
  exit 1
fi

# Windows Git Bash 下将 POSIX 路径转为 Windows 原生路径，防止 git worktree 注册路径与物理路径分离
if command -v cygpath >/dev/null 2>&1; then
  MAIN_REPO_ROOT="$(cygpath -w "$MAIN_REPO_ROOT")"
fi
TARGET_PATH="$MAIN_REPO_ROOT/.worktrees/$CHANGE_ID"
TARGET_BRANCH="feature/$CHANGE_ID"
CHANGES_SRC="$MAIN_REPO_ROOT/.harness/changes/$CHANGE_ID"
SNAPSHOT_PATH="$MAIN_REPO_ROOT/.harness/changes/${CHANGE_ID}.snapshot"

# --- 2. 确保 .worktrees/ 在 .gitignore ---
cd "$MAIN_REPO_ROOT" || { echo "[easy-flow] 阻断：cd $MAIN_REPO_ROOT 失败" >&2; exit 1; }
if ! git check-ignore -q .worktrees 2>/dev/null; then
  echo ".worktrees/" >> .gitignore
  git add .gitignore
  git commit -m "chore: ignore .worktrees/ for easy-flow" --no-verify 2>/dev/null || true
fi

# --- 3. 冲突检查 ---
if [ -e "$TARGET_PATH" ]; then
  echo "[easy-flow] 阻断：worktree 路径 $TARGET_PATH 已存在，请先 git worktree remove 或回到 design 用新 slug 重做" >&2
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH" 2>/dev/null; then
  echo "[easy-flow] 阻断：分支 $TARGET_BRANCH 已存在" >&2
  exit 1
fi
if [ -e "$SNAPSHOT_PATH" ]; then
  echo "[easy-flow] 阻断：上次 propose 残留快照目录 $SNAPSHOT_PATH 存在，请人工确认后删除" >&2
  exit 1
fi

# --- 4. 创建 worktree ---
mkdir -p "$MAIN_REPO_ROOT/.worktrees"
if ! git worktree add "$TARGET_PATH" -b "$TARGET_BRANCH" 2>/dev/null; then
  echo "[easy-flow] 阻断：git worktree add 失败" >&2
  exit 1
fi

# --- 5. 拷贝 changes/<change_id>/ 到 worktree ---
if [ -d "$CHANGES_SRC" ]; then
  mkdir -p "$TARGET_PATH/.harness/changes"
  if ! cp -R "$CHANGES_SRC" "$TARGET_PATH/.harness/changes/$CHANGE_ID"; then
    echo "[easy-flow] 阻断：拷贝 changes/$CHANGE_ID 到 worktree 失败" >&2
    git worktree remove --force "$TARGET_PATH" 2>/dev/null
    exit 1
  fi
fi

# --- 6. 主仓 changes/<change_id>/ 重命名为 .snapshot ---
if [ -d "$CHANGES_SRC" ]; then
  mv "$CHANGES_SRC" "$SNAPSHOT_PATH"
fi

# --- 7. 写 worktree 内 state.yaml ---
STATE_FILE="$TARGET_PATH/.harness/changes/$CHANGE_ID/state.yaml"
if [ -f "$STATE_FILE" ]; then
  # 追加/覆盖 worktree 块和 current_verb
  # 用 cat 追加(state.yaml 已有 design 段,追加 worktree 段)
  CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)
  cat >> "$STATE_FILE" << EOF
worktree:
  created_by_easy_flow: true
  path: "$TARGET_PATH"
  branch: "$TARGET_BRANCH"
  origin_repo: "$MAIN_REPO_ROOT"
  created_at: "$CREATED_AT"
  status: active
current_verb: propose
EOF
fi

# --- 8. 输出 JSON ---
printf '{"target_path":"%s","target_branch":"%s","snapshot_path":"%s"}\n' \
  "$TARGET_PATH" "$TARGET_BRANCH" "$SNAPSHOT_PATH"
exit 0
