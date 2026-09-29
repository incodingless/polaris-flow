---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}codereview
description: "对本次变更的 diff 做**独立**代码评审（生成与裁决分离）：派独立 subagent 按正确性/边界、安全、规格一致性、AI 幻觉模式、副作用与全局状态五个维度审查，产出 openspec/changes/<task_id>/reviews/code-review-report.md。由 polaris{{SKN_SPR}}coding{{SKN_SPR}}verify 按 runtime.build.review_mode 可选调用；用户显式要求「独立代码评审 / 换个 agent 审这段 diff / 让第三方走查代码」时也可直接使用。"
version: 0.1
---

# Polaris 工作流 - 服务技能：独立代码评审（codereview）

把「审代码」从生成方手里拿走，交给一个**独立 LLM context**，产出可审计的评审报告。

**启动时必须先输出**：`[polaris-flow 开发]代码评审 - 进入阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}codereview 技能。`

<HARD-GATE>
本 skill **仅**负责：对**已完成实现**的本次变更，派**独立 subagent** 做代码评审并落盘报告。它是 `verify` 的可选调用点，**不是阶段**——不写 `phase`、不写 workflow 游标、不写 metrics。

- **禁止**由主代理（生成方）在同会话内自审来替代独立裁判；无独立 subagent 能力时按「降级决策」走，**不得默认自审**
- **禁止**修改任何被审对象（代码 / 测试 / specs / detailed-design）；只评不改，修复一律回 build
- **禁止**跳过 Subagent Probe 直接派发（H10）；SessionStart 注入已给出能力的合法跳过见 Step 1
- **禁止**调用 `superpowers:subagent-driven-development` / `superpowers:executing-plans`（H13）
- **禁止**未落盘报告就报「评审完成」——自报告不是证据
- **禁止**把「降级同会话自审」的结果写成独立评审；报告必须如实标注
- **H8**（状态行）：每个 Step 入口输出 `[polaris-flow 开发]代码评审 - 进入 codereview Step <N>: <动作>`
</HARD-GATE>

---

## 定位与边界

| 维度 | codereview（本技能） | build Step 4 的最终审查 |
|---|---|---|
| 执行者 | **独立 subagent**（另一个 context） | apply 的同一代理（生成方自己） |
| 独立性 | 有（生成与裁决分离） | 无（等于自己给自己打分） |
| 触发 | `verify` 按 `review_mode` 可选调用；或用户直接触发 | build 按 `review_mode` 自行执行 |
| 产物 | `reviews/code-review-report.md` | 无独立报告（结论留在 build 过程中） |
| 能否改代码 | **否**（只评不改） | 是（属 build 职责） |
| 是否推进 phase | **否** | 否（phase 由 build 出口推进） |

**这是「可选调用点」，不是阶段**：审完把结论交回 `verify`，由 verify 决定是否阻断或推进 ship。

**刻意不做**（都有明确的归属，不在本技能重造）：

- **多模型交叉验证**——成本高、收益不确定，推迟 v2
- **变异测试 / 属性测试（L4）/ 性能压测**——属功能测试范畴，不在代码评审内
- **审规格文档**（proposal / design / specs / tasks 的合不合规）——那是 `plan` / `design` / `tasks` 主审的职责，审的是「规格」不是「代码」
- **修代码**——发现的问题回 `polaris{{SKN_SPR}}coding{{SKN_SPR}}build`

## 遵守的 Hard Stops

| ID | 在本 skill 的适用方式 |
|----|---------------------|
| H8 | 每个 Step 入口输出可见状态行 |
| H10 | **适用**：派发前必须完成能力探测。合法跳过：SessionStart 已注入 `SUPPORTS_SUBAGENT=true` 且 `PLATFORM_DEGRADATION` 为空、且本步只要默认通用 agent → 直接 `agent=null`，不调 probe（与 build Step 2 同口径） |
| H12 | **不触发**：本技能不写 `workflow.yaml`（不推进 phase） |
| H13 | 不调用两个 superpowers 派发驱动器；派发走 `subagent-probe` → `subagent-dispatch` → 宿主原生 Task / AgentTool |

## 标识约定

| 项 | 路径 / 值 |
|----|-----------|
| `task_id` | 与 verify 同值（调用方传入或本技能定位） |
| 运行态 | `.polaris/tasks/<task_id>/state.yaml`（读 `runtime.build.review_mode` / `worktree_path`） |
| 工作目录 | 若 `worktree_path` 非空 → 后续读 diff / 跑命令**以该 worktree 为仓库根**；否则用主仓 |
| diff 范围 | `<base-ref>...HEAD`（base-ref 优先取 `detailed-design.md` / plan 头信息的 `base-ref`；缺失用 `git merge-base` 与主干估算） |
| 评审报告 | `openspec/changes/<task_id>/reviews/code-review-report.md` |
| 评审口径 | 本文件「Step 3」的评审清单（**唯一出处**，不在调用方复制） |
| 决策点协议 | `./policies/decision-point.md` |
| 硬约束清单 | `./policies/hard-stops.md` |

## 两种入口

- **入口 A · `verify` 调用**：调用方已定位 `task_id`、已判定 `review_mode ∈ {standard, thorough}`，并已声明「用途 = 验证阶段的独立代码评审、范围 = 本次 diff」。据此**不再询问**用途与范围，直接进 Step 1。**不重复筛选任务**（verify 已筛过）。
- **入口 B · 用户直接触发**：需自行定位任务（Step 0 全走），并确认范围。

> **不重复询问原则**：调用方/用户已声明或已提供的信息，不再问第二遍。

---

## 流程

### Step 0 — 定位任务 + 入参校验（**入口 A 只做 2.1**）

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind coding --skill verify --repo-root "$REPO_ROOT" --phase verify)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- **唯一匹配** → 直接取 `task_id`；**多个匹配** → 按 `./policies/decision-point.md` 列出候选让用户选；**零匹配** → 阻断，提示「未找到处于验收(verify)阶段的活动任务，请先执行 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`」

**入参校验**（失败 → 阻断）：

| 检查 | 条件 |
|------|------|
| build 已完成 | `state.yaml` 中 `runtime.build.status=completed` |
| tasks 已勾完 | `openspec/changes/<task_id>/tasks.md` 中不存在 `- [ ]` |
| review_mode 已知 | `runtime.build.review_mode` ∈ `{standard, thorough}`；为 `off` → 记录 `skipped:off` 并**直接结束**（不派发） |
| reviews 目录 | `openspec/changes/<task_id>/reviews/` 存在（不存在则 `mkdir -p`） |

输出：`[polaris-flow 开发]代码评审: 任务ID=<task_id> ; worktree=<path|main> ; review_mode=<standard|thorough>`

### Step 1 — 能力探测（H10）

1. 读 SessionStart 注入：`PLATFORM_DEGRADATION=inline|unsupported` → **直接进入「降级决策」**（不派发、不探测）
2. 若本步只要默认通用 agent 且 `SUPPORTS_SUBAGENT=true`（degradation 空）→ **不调 probe**，记 `agent=null`，进 Step 2
3. 否则 `use_skill("polaris{{SKN_SPR}}subagent-probe")`（传 `platform` / `PLATFORM_ID`），按返回结构取 `agents`；`agents=[]` 且平台支持默认 subagent → `agent=null`；`agents=[]` 且平台不支持 → 进入「降级决策」

**禁止**在缺能力结论时假设宿主有独立 subagent。

### Step 2 — 圈定 diff 范围（最小改动原则）

```bash
git diff --stat <base-ref>...HEAD
git diff <base-ref>...HEAD
```

- 产出**变更文件清单**（路径 + 增删行数），作为 subagent 的 `materials`
- **越界检测**：改动若越出 `tasks.md` / `specs` 声明的范围（无关重构、无关文件）→ 记为一条 **IMPORTANT**（最小改动原则），带 `文件:行`
- 变更文件数为 0 → 阻断（没有可审的 diff），回报调用方

### Step 3 — 派独立 subagent 评审

`use_skill("polaris{{SKN_SPR}}subagent-dispatch")`，传入：

| 参数 | 值 |
|------|-----|
| `platform` | 宿主平台 id |
| `agent` | Step 1 结果（`null` = 宿主默认 subagent） |
| `task_spec.task_type` | `code_review` |
| `task_spec.task_description` | 对本次变更的 diff 做独立代码评审，找缺陷不找风格偏好 |
| `task_spec.materials` | diff 内容 / 变更文件清单 / `tasks.md` / `specs/` 验收场景 / `detailed-design.md`（若存在） |
| `task_spec.constraints.output_path` | `openspec/changes/<task_id>/reviews/code-review-report.md` |
| `task_spec.constraints`（评审清单） | 见下 |
| `task_spec.language` | 跟随主会话 |

**评审清单（本步即判据唯一出处；调用方不复制）**：

1. **正确性 + 边界**——逻辑错误；`null` / 空 / 0 / 极大值 / off-by-one / 溢出；异常路径与错误处理
2. **安全**——注入（SQL / OS 命令）、越权、硬编码密钥、新增 `unsafe` / 关闭校验
3. **规格一致性**——实现是否覆盖 `specs` 验收场景与 `tasks.md` 描述；是否有 tasks 范围外的改动（最小改动原则）
4. **AI 幻觉模式**——幽灵导入（引用不存在的模块 / 符号）、缺失 `await`、永真 / 永假分支、重复条件、空 `catch`
5. **副作用与全局状态**——未声明的 I/O、隐式全局写入、跨模块的隐式耦合

**约束（必须写进 `constraints`）**：

- 严重度只用 **CRITICAL / IMPORTANT / WARNING / SUGGESTION**（与 `verify` 的失败决策口径一致；**覆盖** `dispatch-execute.md` 里 `code_review` 模板的 `MINOR` 默认）
- **每条发现必须带 `文件:行`**（自报告不是证据）；给不出定位的观察进「证据不足」，不写成缺陷
- **禁止修改任何文件**；只输出报告
- 报告须含：`task_id` / base-ref / 变更文件数 / 按严重度分组的发现 / 未覆盖的检查项（若有）

派发后按 `dispatch.status` 消费（`dispatched` / `degraded_default` / `degraded_inline` / `unsupported`）。`degraded_inline` = 主代理在本会话执行 → **这是降级，必须标注**（见「降级决策」）。`unsupported` → 降级决策。

### Step 4 — 回读校验 + 落盘

1. **回读校验**（派发成功时必做）：报告文件存在 + 含 `task_id` + 每条发现带行号。不完整 → 允许**重派一次**并附上缺什么；仍不完整 → 记 `NEEDS_CONTEXT`，走降级决策
2. **报告头部补齐执行者信息**：`执行者` = `独立 subagent` | `降级 · 非独立裁判`；`平台`；`agent`；`base-ref`
3. 落盘路径固定 `openspec/changes/<task_id>/reviews/code-review-report.md`（不另起文件名、不落 `.polaris/`）

### Step 5 — 判定 + 回报调用方

| 报告结论 | 动作 |
|---|---|
| 存在 **CRITICAL** | **阻断**本步 → `./policies/decision-point.md`：A 回 build 修复 / B 用户接受风险并记 override（须显式确认）/ C 放弃。**不得**自行接受 |
| 仅 **IMPORTANT** | 不阻断本步；交 `verify` 的「验证失败决策」逐条决策 |
| 仅 **WARNING / SUGGESTION** | 记入报告，不阻断 |
| 报告未落盘 / 子代理 `FAILED` | 走降级决策 |

**回报结构**（交回调用方）：

```text
codereview:
  status: done | degraded_inline | skipped:off | skipped:no_independent_reviewer | blocked
  report: openspec/changes/<task_id>/reviews/code-review-report.md
  critical: <N>
  important: <N>
  independent: <true|false>
  reason: <短说明>
```

**本技能不写** workflow 游标、不写 `phase`、不写 metrics、不推进 ship——那些是 `verify` 的职责。

---

## 降级决策（无独立裁判能力时）

触发条件：`PLATFORM_DEGRADATION=inline|unsupported`、或 probe 后宿主无可用 subagent、或派发返回 `unsupported`。

**必须**按 `./policies/decision-point.md` 暂停，不得自动选：

| 选项 | 动作 | 记录 |
|------|------|------|
| **A. 降级同会话自审** | 主代理按 Step 3 清单逐项自审 | 报告头标注「**降级 · 非独立裁判**」；`independent: false`，供 verify / retro 识别 |
| **B. 跳过本次代码评审** | 不产出报告 | 回报 `skipped:no_independent_reviewer`；由 verify 记入其报告与 state |
| **C. 阻断回 build** | 停止，报阻塞原因与恢复条件 | 不得伪造「已评审」 |

- **禁止**默认选 A（A 是降级不是等价物）
- **禁止**把 A 的结果描述成独立评审
- 用户选 B 时**不阻断**（本技能是可选的）；但 verify 侧须在报告里留痕

---

## 退出条件

- 报告落盘于 `openspec/changes/<task_id>/reviews/code-review-report.md`（或按降级决策如实记 `skipped`）
- 已按「回报结构」交回调用方
- 未修改任何被审文件（代码 / 测试 / specs）
- 未写 workflow 游标 / `phase` / metrics

## 上下文压缩恢复

重载：`task_id`、`worktree_path`、`runtime.build.review_mode`、报告是否已落盘、停在哪个 Step。

- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 **Step 1** → 重新探测能力（环境可能已变），勿沿用旧结论
- 停在 **Step 2** → 从圈定 diff 范围续，勿重派
- 停在 **Step 3** → 报告不在则重派；报告在但缺执行者信息 → 补 Step 4.2 后继续
- 停在 **降级决策** → 从决策点续，勿默认替用户选 A
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」
