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

**先解析交付名**：读取 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml` 的 `naming` 块（`req_name_cn` 需求中文名、`req_prefix` 需求编号前缀）；缺失时回退读取 `req_baseline.md` 元数据区同名两项；仍缺失则向用户询问补齐（中文名由 AI 建议 3 个候选，编号前缀由用户输入），确认后补写 `state.yaml`。

交付文档名固定为：`{前缀}-{中文名}-需求终稿-v1.0.md`（如 `UAP-用户权限精细化-需求终稿-v1.0.md`）。

按 `./policies/ask-question-react.md` 询问：
> 是否交付产品需求文档？
> 在交付前必须经人工完整、仔细的审查 产品需求文档。
> 交付后文档名为：**{前缀}-{中文名}-需求终稿-v1.0.md**
> A. 确认
> B. 暂停回到 refine

仅 A 进入 Step 2。

## Step 2：执行交付

### 2.1 转移终稿至文档库

从 `state.yaml` 的 `naming` 解析出两个变量（无 `yq` 时读取文本手工赋值即可）：

```bash
REQ_PREFIX=$(grep -E '^\s+req_prefix:' "$REPO_ROOT/.polaris/tasks/$task_id/state.yaml" | head -1 | sed 's/.*: *//')
REQ_NAME_CN=$(grep -E '^\s+req_name_cn:' "$REPO_ROOT/.polaris/tasks/$task_id/state.yaml" | head -1 | sed 's/.*: *//')
```

再执行迁移：

```bash
PRD_DOC_DIR="${PRD_DOC_DIR:-$REPO_ROOT/docs/prd}"
mkdir -p "$PRD_DOC_DIR"
SRC="$REPO_ROOT/.polaris/tasks/$task_id/prd-final-v1.0.md"
DST="$PRD_DOC_DIR/${REQ_PREFIX}-${REQ_NAME_CN}-需求终稿-v1.0.md"
test -f "$SRC" || { echo "终稿缺失：$SRC，请先执行 /polaris{{SKN_SPR}}prd{{SKN_SPR}}refine" >&2; exit 2; }
if [ -e "$DST" ]; then echo "目标文件已存在，需人工决策是否覆盖：$DST" >&2; exit 3; fi
cp "$SRC" "$DST"
```

> `$PRD_DOC_DIR` 默认为 `$REPO_ROOT/docs/prd/`；用户可在 Step 1 确认交付时指定其它文档库位置覆盖。
> 任务内终稿固定名为 `prd-final-v1.0.md`（refine Step 4.1 产物）；带中文名与编号前缀的交付名**仅在迁移时生成**，便于从文档库文件名反查需求与编号命名空间。
> 目标文件已存在（exit 3）时**不得静默覆盖**：按 `./policies/decision-point.md` 回显冲突并询问「A. 覆盖 / B. 另存为 `-v1.1` / C. 取消交付」。

### 2.2 更新任务状态

1. 写 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml`：
   - `ship.status: completed`
   - `status: completed`
   - `finished_at: <ISO 时间>`
   - `delivered_to: <文档库目标路径>`
   - `naming.delivered_name: <交付文档名>`（命名快照，便于事后追溯）

2. 将任务移出活跃列表：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind requirement --skill ship --where-task-id "$task_id" --repo-root "$REPO_ROOT"
```

### 2.3 输出消息
输出：`[polaris-flow 需求工程] 交付PRD终稿 - 已经完成文档交付，当前任务成功完成。(⁎⚈᷀᷁ᴗ⚈᷀᷁⁎)`

并附上交付信息：需求中文名、需求编号前缀、交付文件名、文档库目标路径。