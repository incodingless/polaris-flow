---
name: polaris{{SKN_SPR}}prd{{SKN_SPR}}ship
description: "已经定稿的产品需求文档交付至指定的文档位置、任务收尾。用户触发 /polaris{{SKN_SPR}}prd{{SKN_SPR}}ship，或在 refine 完成后要求交付 / 合回 / 归档 / 完结一个任务时必须使用本 skill。"
version: 0.3
---

# 编写产品需求-交付PRD终稿

通过人工评审的产品需求终稿，转移至指定的文档库目录，同时修改任务状态为完成。

### Step 0：状态检查与中断恢复

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind requirement --skill ship --repo-root "$REPO_ROOT" --phase ship)
EXIT_CODE=$?
```

- `EXIT_CODE != 0` → **阻断**，按 stderr 处理
- `EXIT_CODE == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `task_id`
- **多个匹配**：按 `./policies/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 ship 阶段的活动任务，请先执行 /polaris{{SKN_SPR}}prd{{SKN_SPR}}refine」

> 若选择的任务已是 `phase=ship`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。
> 若上次中断在 ship 中（`ship.status=in_progress` / apply paused），从中断点续跑；不得因「已是 draft」而报零匹配。

**入口校验**（已完成 → 阻断重跑）：

| 检查 | 条件 |
|------|------|
| ship 已完成 | `state.yaml` 中 `ship.status=completed` |

## Step 1：确认交付

按 `./policies/ask-question-react.md` 询问：
> 是否交付产品需求文档？
> 在交付前必须经人工完整、仔细的审查 产品需求文档。
> A. 确认
> B. 暂停回到 refine

仅 A 进入 Step 2。

## Step 2：执行交付

### 2.1 转移终稿至文档库

```bash
PRD_DOC_DIR="${PRD_DOC_DIR:-$REPO_ROOT/docs/prd}"
mkdir -p "$PRD_DOC_DIR"
cp "$REPO_ROOT/.polaris/tasks/$task_id/prd_final_*.md "$PRD_DOC_DIR/"
```

> `$PRD_DOC_DIR` 默认为 `$REPO_ROOT/docs/prd/`；用户可在 Step 1 确认交付时指定其它文档库位置覆盖。

### 2.2 更新任务状态

1. 写 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml`：
   - `ship.status: completed`
   - `status: completed`
   - `finished_at: <ISO 时间>`
   - `delivered_to: <文档库目标路径>`

2. 将任务移出活跃列表：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind requirement --skill ship --where-task-id "$task_id" --repo-root "$REPO_ROOT"
```

### 2.3 输出消息
输出：`[polaris-flow 需求工程] 交付PRD终稿 - 已经完成文档交付，当前任务成功完成。(⁎⚈᷀᷁ᴗ⚈᷀᷁⁎)`