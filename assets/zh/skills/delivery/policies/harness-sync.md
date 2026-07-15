# harness-sync — worktree 产物合回 policy

> 由 `ship` skill 的 Step 3.4.5 调用。**实际执行由脚本 `hooks/harness-sync.sh` 确定性完成**——主代理只负责调用脚本 + 处理 exit 2 的用户交互,**禁止**在脚本之外做任何额外的文件拷贝动作。

## 脚本位置

```bash
PLUGIN_ROOT="$(cat .harness/.cache/.plugin_root)"
bash "$PLUGIN_ROOT/hooks/harness-sync.sh" <worktree_path> <origin_repo> <change_id> [--overwrite|--suffix|--skip]
```

## 触发条件

由 `ship` Step 3 触发，满足任一即执行：

- 3.3 用户选 A（已 PR 合并 / 不需本地合并）或 B（本地合并）
- 3.2 检测到 `ALREADY_MERGED=1`（`finishing-a-development-branch` 已合并过）

3.6 选项 C（保留 worktree）**跳过本 policy**——产物仍在 worktree 内，记录 `ship.harness_sync = "skipped_worktree_retained"`。

## 关键约束

本 policy 必须在 ship Step 3.5（`git worktree remove`）**之前**执行。worktree 一旦移除其内部 `.harness/` 即随之删除，`metrics` / `overrides.log` / `changes/<change_id>/state.yaml` 终态 / `pre_design.md` 修订**不可恢复**。

主代理**禁止**在脚本之外做任何额外的文件拷贝动作——合回范围已由脚本写死,无需 prompt 层重复约束。

## 退出码与主代理职责

| 退出码 | 含义 | 主代理动作 |
|---|---|---|
| `0` | 全部成功 | `harness_sync = "synced"`;读 stdout JSON 输出状态行 |
| `1` | 部分失败 | `harness_sync = "partial_failure"`;stderr 有失败项,ship 继续 3.5 |
| `2` | archive 冲突(目录已存在) | 弹 `ask_followup_question` 三选项 → 重新调用脚本(带 `--overwrite` / `--suffix` / `--skip`) |
| `3` | worktree `.harness/` 不存在 | `harness_sync = "skipped_no_source"`;跳到 3.5 |

## stdout JSON 格式

```json
{"metrics_files":3,"overrides_lines":12,"state_yaml":true,"pre_design":true}
```

`metrics_files` = 合回到**顶层** `.harness/metrics/` 的文件数(archive 不存 metrics 副本——单 change 追溯通过 JSON 内 `change_id` 字段从顶层查询)。

主代理用此 JSON 输出状态行:
```
[easy-flow] harness 产物合回完成：metrics=3 files → 顶层 / overrides=12 lines / state.yaml + pre_design → archive/<change_id>/
```

## archive 最终结构

```
.harness/archive/<change_id>/
  state.yaml
  pre_design.md
  overrides.log
```

不含 `metrics/` 子目录——metrics 只存顶层 `.harness/metrics/`。

## harness_sync 状态字段总览

| 值 | 触发场景 |
|---|---|
| `synced` | 脚本 exit 0 |
| `partial_failure` | 脚本 exit 1 |
| `skipped_no_source` | 脚本 exit 3 |
| `skipped_worktree_retained` | ship 3.6 选项 C,脚本未调用 |
| `deferred_archive_conflict` | 脚本 exit 2 + 用户选 C(skip) |
| `n/a` | 本次未创建 worktree(`worktree.created_by_easy_flow == false`) |
