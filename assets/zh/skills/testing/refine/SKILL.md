---
name: polaris{{SKN_SPR}}testing{{SKN_SPR}}refine
description: 触发场景：用户已有功能用例集 test-cases.md，需要在功能用例之外做三类增量拓展——非功能（性能 / 安全）、接口与自动化转化，并在出口派发独立评审（如「完善测试用例」「补非功能用例」「补接口用例」「转自动化用例」「测试用例定稿」）。本技能覆盖单个阶段：三类增量拓展 + 必走的独立评审派发。硬性约束：性能用例必须带指标阈值；安全清单只引用不重写；未清零 Critical（阻塞级）不得推进 ship。
version: 0.1
---

# 测试用例-完善与独立评审

<HARD-STOP>
1. ❌ 禁止在本技能内**自审**——评审必须派发**独立上下文**执行（见 Step 6）；平台不支持 subagent 时降级 inline，但**必须在报告里标注「未独立执行」**，且不放宽任何判据
2. ❌ 禁止编造性能阈值——PRD 未声明指标时记入待确认清单并不做该项
3. ❌ 禁止复制安全清单内容——只按技能名引用 `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 `references/security-checklist.md`
4. ❌ 禁止在本族内定义测试**执行**口径（探测 / 判定 / 覆盖率 / 基线）——唯一源在 `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`
5. ❌ 禁止跳过 Step 6：**未派发评审、或评审未清零 Critical（阻塞级）时，不得推进 `phase=ship`**
6. ❌ 禁止在评审前留未落盘的缺口——功能用例集与三类增量**均已落盘**才允许开始评审
</HARD-STOP>

**启动时必须先输出**：`[polaris-flow 测试用例] 进入阶段: 完善与独立评审 — 使用 polaris{{SKN_SPR}}testing{{SKN_SPR}}refine 技能。`

> **本技能与 `review` 的关系**：`review` 是**服务型技能**——不进相位表、不占游标，由本技能 **Step 6 以 subagent 派发**（主路径），也可由用户**独立触发**去评审既有用例集。二者关系与 `polaris{{SKN_SPR}}prd{{SKN_SPR}}refine` ↔ `polaris{{SKN_SPR}}prd{{SKN_SPR}}review`、`polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` Step 14 完全同构。

## 判据（唯一源，本技能不复制）

| 判据 | 唯一源 |
|---|---|
| 性能 / 安全 / 接口 / 自动化四类增量 | `./references/01-nonfunctional-interface-automation.md`（本技能自带） |
| **三份增量用例的文档结构** | `./templates/test-cases-nonfunctional-template.md` / `./templates/test-cases-interface-template.md` / `./templates/test-cases-automation-template.md`（各 Step 落盘时**必读**） |
| 用例集评审方法（覆盖 / 追溯 / 可执行 / 无歧义 / 分级 / 数据独立 / 自动化就绪） | `polaris{{SKN_SPR}}testing{{SKN_SPR}}review` 的 `references/01-review-criteria.md` |
| 评审技能的形态（派发链 / 只评不改 / 门禁语义） | `polaris{{SKN_SPR}}prd{{SKN_SPR}}review` + `polaris{{SKN_SPR}}prd{{SKN_SPR}}refine` Step 4 |
| 派发机制（probe / dispatch / 降级） | `polaris{{SKN_SPR}}subagent-probe` + `polaris{{SKN_SPR}}subagent-dispatch` |
| 安全清单 | `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 `references/security-checklist.md` |
| 执行口径（五槽 / 三级分叉 / 覆盖率 / 基线红名单） | `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` |

## 流程

> **压缩上下文通用规则**：每个 Step 收尾时释放中间草稿与冗余对话，仅保留已确认结论与落盘产物指针。
>
> **用词与模板的唯一来源**：`./policies/auto-transition.md` 的「压缩时机与恢复清单」。

### Step 0：定位任务标识 + 入口校验

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind testcase --skill refine --repo-root "$REPO_ROOT" --phase refine)
EXIT_CODE=$?
```

解读同 `draft`（唯一匹配直接取 / 多个匹配按 `./policies/decision-point.md` 选择 / 零匹配阻断，提示先执行 T01）。

**入口校验**：

| 检查 | 条件 | 不满足时 |
|---|---|---|
| draft 已完成 | `state.yaml` 中 `draft.status=completed` | **阻断**：提示先完成 `draft` |
| refine 已完成 | `state.yaml` 中 `refine.status=completed` | **阻断重跑** |

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind testcase --phase refine
```

输出：`[polaris-flow 测试用例] 完善与评审: task_id=<task_id>`

### Step 1：加载功能用例集

读取 `$REPO_ROOT/.polaris/testcases/<task_id>/test-cases.md`（含追溯矩阵与分类覆盖声明）。

- 缺失 → 阻断，提示先完成 `draft`
- 读其「No-Input 清单」与「待补清单」，作为本阶段三项拓展的输入边界

### Step 2：非功能拓展（性能 + 安全）

按 `./references/01-nonfunctional-interface-automation.md` §一 执行：

1. **性能**：从 PRD 非功能需求取指标 → 设计基准 / 并发 / 压力 / 稳定性四类场景；**每条必须带指标阈值**；指标缺失 → 记入待确认清单，**不做该项、不编造阈值**
2. **安全**：按 基础安全 + 业务安全 两维度，把验证点嵌进功能流程；清单**只引用** `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 `references/security-checklist.md`，按功能模块梳理风险点

**落盘**：**必读**（强制前置）`read_file ./templates/test-cases-nonfunctional-template.md`，按其结构写入 `$REPO_ROOT/.polaris/testcases/<task_id>/test-cases-nonfunctional.md`。

### Step 3：接口拓展

按同一 references §二执行：

1. 定位接口清单（可选输入）：无 → 记 `No-Input`，本项声明「本版不适用」并跳过
2. **单接口用例**：正向 / 参数异常 / 边界 / 权限
3. **业务场景串**：按 L1–L2 链路串联多接口，验证数据传递与流转
4. 遵守设计原则：入参可配置、断言明确可量化（四层：状态码 / 业务响应码 / 返回字段 / 落库）、数据可自动清理

**落盘**：**必读**（强制前置）`read_file ./templates/test-cases-interface-template.md`，按其结构写入 `$REPO_ROOT/.polaris/testcases/<task_id>/test-cases-interface.md`。

> 接口用例对应 `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` 的 **`contract` 槽**语义；本技能只产出用例，**不定义执行方式**。

### Step 4：自动化转化

按同一 references §三执行：

1. 按批次排序转化：**第 1 批 L1 主流程 → 第 2 批 L2 核心功能 → 第 3 批 高频回归的 L3 异常**（先核心后边缘、先正向后反向）
2. 转化要点：保留业务语义、补齐元素定位 / 数据驱动 / 断言、结果自动校验、可重复执行
3. 产出自动化用例清单与报告模板结构

**落盘**：**必读**（强制前置）`read_file ./templates/test-cases-automation-template.md`，按其结构写入 `$REPO_ROOT/.polaris/testcases/<task_id>/test-cases-automation.md`。

### Step 5：用例集完整性核对（评审入口条件）

**在开始评审前**核对四份产物**均已落盘**：`test-cases.md` + `test-cases-nonfunctional.md` + `test-cases-interface.md` + `test-cases-automation.md`。

- 任一份缺失 → **不得开始评审**，回到对应 Step 补落盘
- 因输入缺失（如无接口清单）而「本版不适用」的**必须在文件内显式声明**，不得以「文件为空」代替声明

**压缩上下文**：释放三类增量写作过程中的中间稿；保留四份产物路径、No-Input 清单、待确认清单。

### Step 6：派发独立评审（必走子步）

> **本子步是「内嵌的独立评审」，不是阶段** —— 不占游标、不写 `phase`。形态对齐 `polaris{{SKN_SPR}}prd{{SKN_SPR}}refine` Step 4 与 `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` Step 14。

#### 6.0 能力探测（一次探测，全程复用）

读 SessionStart 注入的 `PLATFORM_DEGRADATION` / `SUPPORTS_SUBAGENT` / `$SUBAGENT_PROBE_CACHE`：

- `PLATFORM_DEGRADATION=inline|unsupported` → **跳过 probe**，直接进 6.3 的降级分支
- `SUPPORTS_SUBAGENT=true` 且 degradation 空，或**缺注入** → 本子步需要 `task_type=doc_review` 预筛 → **必须**调用 `use_skill("polaris{{SKN_SPR}}subagent-probe")`（传 `platform` + `task_type: doc_review`）
- probe 结果：`matched_agents` 非空 → 取 `matched_agents[0]`；`matched_agents` 与 `agents` 均为空 → 记 `agent=null` 并在 `constraints` 加 `"dispatch_mode_hint: default_subagent"`

#### 6.1 派发

调用 `use_skill("polaris{{SKN_SPR}}subagent-dispatch")`，传入：

| 参数 | 值 |
|---|---|
| `platform` | 宿主平台 id（与 probe 同源） |
| `agent` | probe 结果（`matched_agents[0]`，或 `null` = 宿主默认 subagent） |
| `task_spec.task_type` | `doc_review` |
| `task_spec.task_description` | 对测试用例集做独立评审。加载并遵循 `polaris{{SKN_SPR}}testing{{SKN_SPR}}review` 技能的评审方法与报告格式，产出含分级问题清单与可核对定位的完整评审报告 |
| `task_spec.materials` | ① 用例集四份全文（`test-cases.md` + 三份增量）；② `testcase_plan.md`（意图清单 / 需求条目编号，覆盖判据）；③ 定稿 PRD（覆盖取证源，可选）；④ **`polaris{{SKN_SPR}}testing{{SKN_SPR}}review` 技能 SKILL.md 路径**（供 subagent 加载评审方法） |
| `task_spec.constraints.output_path` | `$REPO_ROOT/.polaris/testcases/<task_id>/testcase-review-report.md` —— **subagent 必须把报告写入该文件，回报只给路径；禁止把报告正文贴回** |
| `task_spec.constraints` | 只评审、**禁止修改任何文件**；问题必须分级（Critical/Major/Minor/Nit）；Critical（阻塞）必须明确标注；不得臆测；不得跳过维度；输出语言跟随主会话 |
| `task_spec.language` | 跟随主会话语言 |

#### 6.2 消费

按 `dispatch.status` 分支：

| `dispatch.status` | 处理 |
|---|---|
| `dispatched` | 已按选定 agent 派发；消费 `result` |
| `degraded_default` | 已派默认 subagent（独立上下文，**不是** inline 降级）；消费 `result` |
| `degraded_inline` | 主代理在**本会话**内执行 = **降级**；消费 `result`，并在报告中标注「由主代理内联评审」 |
| `unsupported` | 派发失败 → 进入 6.3 降级决策 |

再按 `result.status` 处理：

- `DONE` / `DONE_WITH_CONCERNS` → **只读 `result.artifact_path`**（报告已落盘，不要求 subagent 贴回正文）
- `BLOCKED` → 记录 `result.concerns`，向用户报告阻塞原因，暂停本阶段
- `NEEDS_CONTEXT` → 按 `concerns` 补充材料后重新派发（同一 agent）
- `FAILED` → 进入降级决策

**降级决策**（`./policies/decision-point.md`，**不得默认自审**）：

> 独立评审未能执行（原因：<平台不支持 subagent / 派发失败 / 子代理执行失败>）。
> A. 由主代理在本会话内联评审（**降级**，判据不变，报告须标注「未独立执行」）
> B. 暂停，待环境具备后重新派发
> C. 放弃本次评审（须记录理由；**选择 C 后不得推进 ship**）

#### 6.3 判定

读 `testcase-review-report.md` 的分级结论（级别定义以 `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 `references/review-rubric.md` 为唯一源；本族把 **Critical 视为阻塞级**）：

| 报告结论 | 动作 |
|---|---|
| 存在 **Critical** | **阻断** → 按 `./policies/decision-point.md`：A 回 `draft` / `refine` 补正后**重评审**（只重评修复项及其关联内容）/ B 用户接受风险并记 override（须显式确认）/ C 放弃（不得推进 ship）。**不得自行接受** |
| 仅 **Major** | 建议修复；不修复需在报告记录风险与接受理由 |
| 仅 **Minor / Nit** | 记入报告，不阻断 |
| 报告未落盘 / 子代理 `FAILED` | 走 6.2 的降级决策 |

#### 6.4 评审记录落盘

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" \
  --set "refine.review_verdict=<通过|有条件通过|不通过>" \
  --set "refine.review_blocking_count=<N>" \
  --set "refine.review_mode=<subagent|inline>"
```

> 回退语义：本族是**服务型派发**，不通过时的「回退」由**本技能的 Step 内部循环**表达（改文件 → 重新派发 6.1 评审同一批产物），**不是相位回退**——与 `polaris{{SKN_SPR}}prd{{SKN_SPR}}refine` Step 4.3「迭代直到阻塞问题清零」完全一致。

### Step 7：完成 refine 阶段

**出口门禁**：`refine.review_blocking_count=0`，或用户显式选择风险接受（记 override）。**未满足时禁止推进。**

1. 推进 workflow 阶段至 ship

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind testcase --skill refine --repo-root "$REPO_ROOT" --where-task-id "$task_id" --set phase=ship
```

2. 更新 `state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind testcase \
  --phase refine --next-phase ship
```

3. 输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**）。先按「自动衔接下一阶段」运行 `state next`，**技能名与括注均取自其输出**，**不得写死**：

```text
[polaris-flow 测试用例] 完善与独立评审 - 阶段完成，状态已落盘。
下一步：/<SKILL>（建议新开会话 | 可同会话继续）。
恢复：先读 .polaris/testcases/<task_id>/testcase-review-report.md 与三份增量用例，再从下一步技能的 Step 0 开始。
```

## 退出条件

1. 三类增量（非功能 / 接口 / 自动化）已按判据落盘，或已显式声明「本版不适用」；
2. 四份用例产物**均已落盘**（Step 5 完整性核对通过）；
3. 独立评审**已实际执行**（subagent 或标注了降级的 inline），`testcase-review-report.md` 已落盘；
4. 评审结论已判定：**Critical 清零**，或已有用户显式的风险接受记录；
5. `state.yaml` 已推进 `phase=ship` 且 `refine.status=completed`，并写入 `refine.review_*`。

未同时满足五条，不得宣告本阶段完成。

## 上下文压缩恢复

重载：`task_id`、四份用例产物是否落盘、`testcase-review-report.md` 是否落盘与结论、`state.yaml` 的 `refine.status` 与 `refine.review_*`。

- **恢复依据就是落盘产物** —— 不靠 `phase` 回推
- 停在 **Step 2–4** → 按落盘的增量文件判断已完成项，从未落盘的那类继续
- 停在 **Step 6**（评审）→ 报告已落盘则直接进 6.3 判定；未落盘则重新执行 6.0–6.2
- 停在 **Step 7** → 只补阶段推进与提示语，**不重做**前面的拓展与评审
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```
