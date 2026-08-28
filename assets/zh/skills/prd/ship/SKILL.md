---
name: polaris-flow{{SKILL_NAME_SPLITTER}}prd{{SKILL_NAME_SPLITTER}}ship
description: "已经定稿的产品需求文档交付至指定的文档位置、任务收尾。用户触发 /polaris-flow{{SKILL_NAME_SPLITTER}}prd{{SKILL_NAME_SPLITTER}}ship，或在 refine 完成后要求交付 / 合回 / 归档 / 完结一个任务时必须使用本 skill。" 
---

# 编写产品需求-交付PRD终稿

通过人工评审的产品需求终稿，转移至指定的文档库目录，同时修改任务状态为完成。

### Step 0：状态检查与中断恢复

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --skill build --repo-root "$REPO_ROOT" --phase build)
EXIT_CODE=$?
```

- `EXIT_CODE != 0` → **阻断**，按 stderr 处理
- `EXIT_CODE == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `change_id`
- **多个匹配**：按 `./policies/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 refine 阶段的活动任务，请先执行 /polaris-flow{{SKILL_NAME_SPLITTER}}prd{{SKILL_NAME_SPLITTER}}refine」

> 若选择的任务已是 `phase=ship`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。
> 若上次中断在 refine 中（`ship.status=in_progress` / apply paused），从中断点续跑；不得因「已是 draft」而报零匹配。

**入口校验**（失败 → 阻断）：

| 检查 | 条件 |
|------|------|
| plan 已完成 | `state.yaml` 中 `plan.status=completed`（或用户明示接受续跑且 `tasks.md` 已是可执行细计划） |
| tasks 可执行 | `openspec/changes/<change_id>/tasks.md` 非空，且含至少一个 `- [ ]` 或（续跑时）未完成项可定位 |
| 工作目录 | 若 `worktree_path` 非空 → 后续 apply / 读 tasks **以该 worktree 为仓库根**；否则用主仓 |

## Step 1：确认交付

按 `./policies/ask-question-react.md` 询问：
> 是否交付产品需求文档？
> 在交付前必须经人工完整、仔细的审查 产品需求文档。
> A. 确认
> B. 暂停回到 refine`

仅 A 进入 Step 2。

## Step 2：执行交付

### 2.1 转移产品需求文档至指定位置

```bash
MV_DOC=`bash mv "$REPO_ROOT\xxx\" "$PRD_DOC_DIR"`
```

### 2.2 更新任务状态



### 2.3 输出消息
输出：`[polaris-flow 需求工程] 交付PRD终稿 - 已经完成文档交付，当前任务成功完成。(⁎⚈᷀᷁ᴗ⚈᷀᷁⁎)`

