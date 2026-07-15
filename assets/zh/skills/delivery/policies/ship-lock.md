# ship-lock — ship 阶段串行互斥锁 policy

> 由 `ship` skill 的 Step 0 调用。承载完整的锁获取 / 释放 / stale 恢复流程；SKILL.md 中只保留入口引用与 HARD-GATE 锚点。

## 目的

ship 是 easy-flow 中唯一会**写主仓共享资源**的阶段（`workflow.yaml` 全文重写、`.harness/metrics/` 目录合回、`.harness/overrides.log` 追加、`/opsx:archive` 移动 `openspec/changes/`、`git rebase` + `git merge --ff-only` 主分支 HEAD）。多 worktree 同时 ship 会让上述资源出现 read-modify-write 竞争或 git 引用冲突。本 policy 用文件锁把整个 ship 流程串行化：**同一台机器同一时刻只允许一个 ship 在跑**。

跨机器并发不在本 policy scope（lock 文件不入仓，仅本机生效）；多人协作通过 git 分支 + PR 处理。

## 锁文件契约

- 路径：`<main_repo_root>/.harness/.locks/ship.lock`
- `<main_repo_root>` 解析：优先取 `.harness/changes/<change_id>/state.yaml: worktree.origin_repo`，缺失则 `git rev-parse --show-toplevel`
- 内容（单行，空格分隔）：`<change_id> <PID> <unix_ts> <ISO_8601_UTC>`
  - 例：`refactor-sdk-api-0701c0 12345 1717000000 2026-05-28T19:00:00Z`
- 不入仓：`.harness/.gitignore` 已包含 `.locks/`（由 SessionStart 维护）

## Step 0 流程（在 ship Step 1 之前执行）

### 0.1 解析 main_repo_root 与 change_id

通过 `hooks/change-locate.sh`(无 phase 限定)定位本会话 active_changes entry,取 `change_id`(及 `worktree_path` 用于解析 main_repo_root)。零/多匹配按脚本退出码阻断,**不获取锁**——脚本 stderr 已含统一阻断话术。

### 0.2 检测既有锁

```bash
LOCK_DIR="$ORIGIN_REPO/.harness/.locks"
LOCK_FILE="$LOCK_DIR/ship.lock"
mkdir -p "$LOCK_DIR"

if [ -e "$LOCK_FILE" ]; then
  lock_content=$(cat "$LOCK_FILE" 2>/dev/null || echo "<unreadable>")
  lock_mtime=$(stat -c %Y "$LOCK_FILE" 2>/dev/null || stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0)
  lock_age=$(( $(date +%s) - lock_mtime ))

  if [ "$lock_age" -lt 1800 ]; then
    # < 30min：视为活跃 ship，阻断
    echo "[easy-flow] 阻断：另一个 change 正在 ship（HARD STOP H11）"
    echo "  lock 内容: $lock_content"
    echo "  持有时长: ${lock_age}s"
    echo "  请等待对方 ship 完成；或确认对方进程已死后手动 rm $LOCK_FILE"
    exit 1
  fi

  # >= 30min：视为可能 stale，交还用户判断
  ask_followup_question:
    标题: "ship.lock 可能已 stale（持有 ${lock_age}s ≥ 30min）"
    内容: |
      锁文件: $LOCK_FILE
      锁内容: $lock_content   # 含 change_id / PID / 启动时间

      可执行 ps -p <PID> 检查持锁进程是否仍存活。
    选项:
      A. 强制清理 lock 并继续 ship（推荐：若持锁进程已不存在）
      B. 取消本次 ship（推荐：若持锁进程仍存活，等其完成）

  # 用户选 A：
  rm -f "$LOCK_FILE"
  # 用户选 B：
  exit 1
fi
```

### 0.3 获取锁 + 注册自动释放

```bash
printf '%s %s %s %s\n' "$change_id" "$$" "$(date +%s)" "$(date -u +%FT%TZ)" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT INT TERM HUP
```

`trap` 覆盖正常 exit + Ctrl+C(INT) + kill(TERM) + 终端关闭(HUP)；SIGKILL / 断电不可拦截，由下次 ship 的 0.2 stale 检测兜底。

### 0.4 状态行输出

```
[easy-flow] ship lock 已获取：change_id=<change_id> pid=<PID>，进入 Step 1
```

## 失败处理

| 场景 | 行为 |
|---|---|
| `mkdir -p .locks` 失败（权限） | 输出 `[easy-flow] 阻断：无法创建 .harness/.locks/`，exit 1；不带病前进 |
| `cat $LOCK_FILE` 失败（损坏） | lock_content 设为 `<unreadable>`，仍按 mtime 判 age；含义不变 |
| `stat` 在不同平台不可用 | Linux 用 `stat -c %Y`，macOS/BSD 用 `stat -f %m`，两者都失败时 lock_age=0 强制走 stale 路径让用户决策 |
| 写 lock 失败 | exit 1，提示用户检查磁盘 |
| trap 执行 `rm` 失败 | 不阻断 ship 退出码；下次 ship 用 stale 阈值兜底 |

## 不变量

- 一次 ship 流程恰好持有一次锁（Step 0 获取 → trap 释放）
- 锁内容字段顺序固定：`change_id PID unix_ts ISO`，便于运维 grep
- 锁文件不进入 git（`.locks/` 在 `.harness/.gitignore` 中）
- 30min 阈值是**双倍正常 ship 上限**的兜底，不是性能目标——ship 本身应在 5-15min 完成

## 与 SKILL.md 的关系

- HARD-GATE：禁止跳过 Step 0 直接进入 Step 1
- Step 0 一句引用本 policy
- 解析 change_id 的逻辑当前**与 SKILL.md Step 1 共享**——后续如抽公共 policy（`resolve-change-id.md`），两处同步替换
