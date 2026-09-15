---
name: polaris{{SKN_SPR}}prototype{{SKN_SPR}}ship
description: "当原型已做完、要做交付收尾时使用。用户要求：交付原型 / 原型可以交了 / 走完原型交付 / 评审并归档原型 / 原型收尾 / 把原型归档 / build 完成后说「可以交了」。不触发：只评审不归档（走 polaris:prototype:review）、制作或修改原型（走 polaris:prototype:build）、先出原型制作思路（走 polaris:prototype:blueprint）、评审 PRD 或需求文档（走 polaris:prd:review）、只要技术方案或前端实现。"
version: 1.0.0
---

# 原型交付 · 独立评审 → 人工确认 → 归档收尾

用途：原型交付 / 独立评审派发 / 评审结论确认 / 原型归档 / 任务状态收尾

**前置**：`polaris{{SKN_SPR}}prototype{{SKN_SPR}}build` 已完成——原型 `.html` + `flow.json` + `page-structure.md` + `handoff.md` 已落盘。

本技能是交付链的**收尾段**，它自己不持有任何判据、不产出任何设计结论：

| 事项 | 归属 |
|---|---|
| 原型怎么做 | `build` |
| 什么算合格、问题分几级 | `review`（判据唯一来源） |
| **评审由谁执行** | 本技能**派发独立上下文**去执行，不在建造者的会话里自评 |
| 要不要返工 | 用户（本技能只呈现结论与依据） |

**四条不可协商的红线**：

1. **不改原型、不改蓝图、不改判据**——本技能只派发评审、搬运产物、登记状态；
2. **评审必须在独立上下文执行**——平台不支持 subagent 时降级 inline，但**必须在报告里标注「未独立执行」，且不放宽任何判据**；
3. **P0 未清零不得归档**——结论为「不得交付」时默认只提供返工选项；坚持归档须留风险接受理由；
4. **归档目标已存在时不静默覆盖**——必须回显冲突让人决策。

---

**启动时必须先输出**：`[polaris-flow 原型] 交付原型: 使用 polaris{{SKN_SPR}}prototype{{SKN_SPR}}ship 技能。`

## 流程

### Step 0：定位任务标识 + 入口校验

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind prototype --skill ship --repo-root "$REPO_ROOT" --phase ship)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `task_id`
- **多个匹配**：按 `./policies/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 ship 阶段的 active change，请先执行 /polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint」

> 若选择的任务已是 `phase=ship`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。

**入口校验**：

| 检查 | 条件 | 不满足时 |
|---|---|---|
| 建造 已完成 | `state.yaml` 中 `build.status=completed` | **阻断**：提示先完成 `build` |
| ship 已完成 | `ship.status=completed` | **阻断重跑** |

#### Step 0.5：读取任务进展

读 `state.yaml` 拿身份与指针（`task_id` / `phase` / `name` / `page_prefix` / `work_dir`），**进度按落盘产物判定**：

| 落盘产物状态 | 进入步骤 |
|---|---|
| 无原型 `.html` 或 `build.status != completed` | **阻断**：先完成 `build` |
| 有原型、无 `review_report.md` | 进入 **Step 1** |
| 有 `review_report.md`、归档未完成 | 进入 **Step 2** |
| 已归档（`delivered_to` 已写） | 提示本环节已完成 |
| 无法判定 | 按 `./policies/decision-point.md` 询问 |

### Step 1：派发独立评审

**为什么必须派发**：评审由建造者在**同一会话**内接着做时，评审者 = 建造者，独立性受限——只能靠报告如实标注来兜底。派到独立上下文执行，这个缺口从根上不成立。

**编排方式**：`subagent-probe` → 选定 agent → `subagent-dispatch` 三段式。

1. **探测**：调用 `polaris{{SKN_SPR}}subagent-probe`，传入 `platform`（从项目配置读）与 `task_type: doc_review`，取回 `matched_agents` 与 `platform_degradation`；
2. **选定**：取 `matched_agents` 第一项；**平台不支持 subagent**（`platform_degradation` 为 `inline` / `unsupported`）或 `matched_agents` 为空 → 转降级分支；
3. **派发**：调用 `polaris{{SKN_SPR}}subagent-dispatch` 执行 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}review`。

**派发材料**（`materials`）：

| 材料 | 必需性 |
|---|---|
| 原型 `.html`（评审对象） | **必需** |
| `<原型名>.flow.json`（黄金流链路验证要消费） | 强烈建议 |
| 需求文档 / PRD / 建设方案（取证源 E1） | 可选 |
| 蓝图四份 `blueprint.md` / `task-card.md` / `golden-flow.md` / `ia.md` / `page-list.md`（取证源 E2） | 强烈建议 |
| `page-structure.md` / `handoff.md`（取证源 E3） | 建议 |
| 设计系统 CSS（如有） | 可选 |
| `review` 技能 SKILL.md 路径、`templates/prototype_review_report_template.md` 路径 | **必需**（按技能名定位安装位置） |
| `build` 技能的 `scripts/verify.mjs` 路径 | **必需**（三层验证执行体在该技能，脚本不能"按技能名读"） |

**派发约束**（`constraints`）：

- 只评不改：不改动原型、蓝图与任何落盘产物；
- 判据只用 `§33` / `§34` / `§36`，问题按 P0–P3 分级，每条带可核对的定位证据；
- 三层验证**必须实际执行**（`verify.mjs`），跑不了就标「未执行 + 原因」，不得写成通过；
- 不得替产品经理决定范围与页面取舍，涉范围的事项进 P3 待确认；
- 报告落 `<work_dir>/review_report.md`，输出语言跟随主会话。

**降级分支**（平台不支持 subagent）：主代理 inline 执行 `review` 技能，判据与流程不变，但**报告「评审对象与范围」一节必须标注「本轮未独立执行：平台不支持 subagent」**——降级的是执行方式，不是评审标准。

**产出**：`review_report.md`；写 `state.yaml`：

```yaml
ship:
  status: in_progress
  review: done            # done | degraded（降级执行）
  review_mode: subagent   # subagent | inline
  review_verdict: <可交付 | 修复后可交付 | 不得交付>
  review_p0_count: <N>
```

### Step 2：人工确认评审结论

按 `./policies/ask-question-react.md` 询问，**必须带上结论、P0 条数与报告路径**。

**「可交付」时**：

> 评审结论：**可交付**（P0 = 0）
> 评审报告：`<review_report.md 路径>`
> 归档后原型名为：**{前缀}-{原型名}-原型-v1.0.html**
> A. 确认并归档
> B. 回 `build` 继续调整

**「修复后可交付」时**：

> 评审结论：**修复后可交付**（P0 = {N}，P1 = {M}）
> 前 3 条待修：{问题} · {定位} · {等级} …
> 完整清单见 `<review_report.md 路径>`
> A. 确认并归档（遗留项随报告跟踪，不阻断交付）
> B. 回 `build` 修复后重新交付

**「不得交付」时（硬门禁）**：

> 评审结论：**不得交付**（P0 = {N}）
> 存在 P0 时不得归档——原型尚未达到研发交接标准。
> A. 回 `build` 修复后重新执行交付（**推荐**）
> B. 仍要归档（须填写风险接受理由，仅用于已决策的例外场景）

选 B 时记录 `ship.risk_acceptance: <理由>`，并在交付信息中标注「未通过评审，风险已接受」。

仅 A 进入 Step 3；选 B（回 build）时输出回退指引并结束本轮。

### Step 3：归档

从 `state.yaml` 取 `page_prefix` 与 `name`（`blueprint` 环节确认后写入，缺失时按 Step 0.5 的命名补齐流程处理）：

```bash
PREFIX=$(bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" get \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --path page_prefix)
NAME=$(bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" get \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --path name)

PROTOTYPE_DOC_DIR="${PROTOTYPE_DOC_DIR:-$REPO_ROOT/docs/prototype/$NAME}"
mkdir -p "$PROTOTYPE_DOC_DIR"
mv -R $REPO_ROOT/.polaris/tasks/$task_id/prototype $PROTOTYPE_DOC_DIR
```

| 归档内容 | 归档后文件名 |
|---|---|
| 原型（核心成果） | `{前缀}-{原型名}-原型-v1.0.html` |
| 黄金流 | `{前缀}-{原型名}-黄金流-v1.0.json` |
| 页面结构与状态 | `{前缀}-{原型名}-页面结构-v1.0.md` |
| 研发交接说明 | `{前缀}-{原型名}-研发交接-v1.0.md` |
| 《原型蓝图》 | `{前缀}-{原型名}-原型蓝图-v1.0.md` |
| 评审报告 | `{前缀}-{原型名}-评审报告-v1.0.md` |

> 归档目录默认 `$REPO_ROOT/docs/prototype/`；用户可在 Step 2 确认时指定其它位置覆盖（写进 `PROTOTYPE_DOC_DIR`）。
> **目标已存在时不得静默覆盖**：按 `./policies/decision-point.md` 回显冲突并询问「A. 覆盖 / B. 另存为 `-v1.1` / C. 取消归档」。
> 归档是**副本**：任务目录 `$REPO_ROOT/.polaris/tasks/$task_id/` 下的原始产物保留不动，便于事后回溯评审对象与交付对象是否一致（比对 `review_report.md` 里登记的 `sha256`）。

### Step 4：任务收尾

1. 更新 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind prototype --phase ship
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set-identity \
  --repo-root "$REPO_ROOT" --task-id "$task_id" \
  --delivered-name "<归档后的原型文件名>"
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" \
  --set status=completed \
  --set "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --set "delivered_to=<归档目录路径>" \
  --set "ship.archive_verdict=<最终结论；风险接受时记 不得交付(risk-accepted)>"
```

2. 将任务移出活跃列表：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind prototype --skill ship --where-task-id "$task_id" --repo-root "$REPO_ROOT"
```

3. 输出：`[polaris-flow 原型] 交付原型 - 已完成评审、确认与归档，当前任务成功完成。`

并附交付信息：原型名与编号前缀、归档目录与文件名、评审结论（含 P0 / P1 计数）、评审执行方式（独立 subagent / 降级 inline）、风险接受标注（如有）。

## 退出条件

1. 评审已实际执行（subagent 或降级 inline），`review_report.md` 已落盘且标注了执行方式；
2. 评审结论已经**用户明确确认**（Step 2 的 A；「不得交付」下的 B 须有风险接受理由）；
3. 归档产物已写入目标目录，目标冲突已按 A / B / C 决策处理，未静默覆盖；
4. `state.yaml` 已写 `status: completed` 与 `delivered_to`，任务已 `delete-active` 移出活跃列表。

未同时满足四条，不得宣告交付完成。

### 上下文压缩恢复

重载：`task_id`、原型路径、评审执行方式与结论、`review_report.md` 是否落盘、归档目录与文件名、是否已 `delete-active`。

- **恢复依据就是落盘产物**：`state.yaml` 只存身份与指针，进度以 `review_report.md` 与归档产物为准
- 停在 Step 1 → 重新派发评审（已落报告则跳过）；停在 Step 2 → 重读报告后重新询问；停在 Step 3 → 校验目标冲突后继续归档