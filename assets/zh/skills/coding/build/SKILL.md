---
name: {{SKILL_NAME_PREFIX}}build
description: "按已评审的 tasks.md 调用 /opsx:apply 实施编码。用户触发 /{{SKILL_NAME_PREFIX}}build，或要求按已评审的 tasks.md 实施 / 执行 /opsx:apply 时必须使用本 skill。优先由 implementer subagent 执行 apply；仅当 subagent-probe 退化为 inline 或用户选 inline 时主代理才可执行 apply。"
---

# Polaris 工作流 - 阶段：构建（build）

<HARD-GATE>
本 skill **仅**负责：在 **plan 已完成** 的前提下，按 `openspec/changes/<change_id>/tasks.md` 调用 `/opsx:apply` 完成实现，并做出口校验与阶段推进。

- **禁止**在 Step 2（`subagent-probe`，且仅当 `build_mode=subagent_dispatch`）完成之前调用 `/opsx:apply`
- **禁止**跳过 Constitution 注入点 C（subagent 启动 prompt 必须含 C；inline 时由主代理按 task 输出 C）
- **禁止**主代理在 `/opsx:apply` 之外直接编写业务实现代码（补丁、新模块、改 API 等）
- **禁止**调用 `superpowers:subagent-driven-development` / `superpowers:executing-plans`（H13）
- **禁止**未完成出口校验（Step 5）就写 `build.status: completed` 或把 `phase` 推到 verify
- **禁止**本阶段强制 `git commit`（提交策略交 delivery/ship；apply 过程产生的未提交改动保留在工作区 / worktree）
- **禁止**重写 `proposal.md` / 高层 `design.md` / `detailed-design.md` / 覆写整份 `tasks.md` 范围；发现计划缺陷 → pause 回 plan，不在 build 静默改 Scope
- **禁止**用全局开关覆盖 tasks.md 内已有的 `<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->` 标注（要改标注回 plan）
- **H8**（状态行输出）：每个 Step 入口输出`[polaris-flow] 进入 build Step <N>: <动作>` 等可见状态行
**允许的例外**：`build_mode=inline`，或 probe 返回 `degradation=inline|unsupported` 时，主代理**可以**在本会话执行 `/opsx:apply`（仍须注入点 C，仍禁止在 apply 之外手写实现）。
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入阶段: build — 使用 {{SKILL_NAME_PREFIX}}build 技能。`

## 标识约定

| 项 | 路径 / 值 |
|----|-----------|
| `change_id` | 与 clarify / propose / design / plan 同值 |
| 实施计划（唯一） | `openspec/changes/<change_id>/tasks.md` |
| 评审报告（`plan-review-agent` 写入） | `openspec/changes/<change_id>/reviews/plan-review-report.md` |
| 深度设计（只读） | `openspec/changes/<change_id>/detailed-design.md` |
| 业务档案 | `.polaris/tasks/<change_id>/state.yaml` |
| workflow 游标 | `.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.sh`） |
| implementer prompt 模板 | `./assets/implementer-prompt.md` |

> **链路**：`clarify → propose → design → plan → **build** → verify → delivery`。  
> 本阶段不写计划、不审设计；只执行已评审的 `tasks.md`。  
> 若本阶段落盘代码评审报告，写入 `openspec/changes/<change_id>/reviews/code-review-report.md`（无流程则不强造）。

## 前置条件

- Design Doc 已创建（阶段 2 完成）
- 活跃 change 存在


## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：定位 change_id + 入口校验
```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --skill build --repo-root "$REPO_ROOT" --phase build)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `change_id`
- **多个匹配**：按 `./reference/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 plan 阶段的 active change，请先执行 /{{SKILL_NAME_PREFIX}}plan」

> 若 选择的任务已是 `phase=plan`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。
> 若上次中断在 plan 中（`plan.status=in_progress` / apply paused），从中断点续跑；不得因「已是 build」而报零匹配。

**入口校验**（失败 → 阻断）：

| 检查 | 条件 |
|------|------|
| plan 已完成 | `state.yaml` 中 `plan.status=completed`（或用户明示接受续跑且 `tasks.md` 已是可执行细计划） |
| tasks 可执行 | `openspec/changes/<change_id>/tasks.md` 非空，且含至少一个 `- [ ]` 或（续跑时）未完成项可定位 |
| 工作目录 | 若 `worktree_path` 非空 → 后续 apply / 读 tasks **以该 worktree 为仓库根**；否则用主仓 |

通过后更新 `state.yaml`：`current_verb: build`，`build.status: in_progress`。
输出：`[polaris-flow] build: change_id=<change_id> ; worktree=<path|main>`

### Step 1：选择执行方式与审查模式（用户决策点）

**一次性**按 `./reference/decision-point.md` 询问两项（可同一轮多问）。推荐规则**只能说明，不能代选**。

#### 1.1 执行方式 `build_mode`

| 选项 | 值 | 含义 |
|------|-----|------|
| **A**（推荐多数情况） | `subagent_dispatch` | 主代理只编排；`/opsx:apply` 在 implementer subagent 会话内执行 |
| **B** | `inline` | 主代理在本会话执行 `/opsx:apply`（仍须注入点 C） |

**推荐规则**（附在选项旁）：

- 未完成任务数 ≥ 3 → 推荐 **A**
- 未完成任务数 ≤ 2 且无跨模块依赖 → 推荐 **B**
- hotfix / 极小改动路径 → 推荐 **B**

写入 `state.yaml`：`build.build_mode: <subagent_dispatch|inline>`。

#### 1.2 代码审查模式 `review_mode`

| 选项 | 含义 | 适用 |
|------|------|------|
| `off` | Step 4 不自动做代码审查 | 文档、配置、文案、低风险小改 |
| `standard`（默认推荐） | apply 全部完成后做**一次**轻量最终审查（正确性 / 安全 / 边界） | 大多数普通改动 |
| `thorough` | apply 全部完成后做**一次**完整最终审查（覆盖面更宽：含与 tasks/spec 一致性关注点） | 高风险、多模块、架构或安全相关 |

写入 `state.yaml`：`build.review_mode: <off|standard|thorough>`。

> **刻意不做**：全局 `tdd_mode`。每个 task 是否 TDD 已由 plan 写在 `tasks.md` HTML 注释里；`/opsx:apply` / implementer 必须遵守注释，不得用 build 级开关覆盖。  
> **刻意不做**：apply 循环内的「每任务 reviewer」——与「implementer 唯一动作是 `/opsx:apply`」冲突；需要更密审查时选 `thorough`，或事后在 verify 再审。

若续跑且 `build.build_mode` / `build.review_mode` 已存在 → 展示当前值，问是否沿用（沿用则跳过写入）。

### Step 2：Subagent Probe（仅 `build_mode=subagent_dispatch`）

若 `build_mode=inline` → 输出 `[polaris-flow] build Step 2: 跳过 probe（inline）`，直接进入 Step 3.3。

若 `build_mode=subagent_dispatch`：

1. **必须** `use_skill("{{SKILL_NAME_PREFIX}}subagent-probe")`，传入 `platform="$PLATFORM"`
2. 按 `subagent-probe` 的返回结构消费（`platform_degradation` + `agents`）：

| probe 返回 | 动作 |
|---------------|------|
| `platform_degradation=null` 且 `agents` 非空 | 从 `agents` 选一项：路径型 → 记 `dispatch=path` + `subagent_path`；builtin → 记 `dispatch=builtin` + `subagent_type=id`。多项时按 decision-point 让用户选，或取第一项并告知用户 |
| `platform_degradation=null` 且 `agents=[]` | 记 `dispatch=default`（宿主默认 subagent，不绑 path） |
| `platform_degradation=inline` / `unsupported` | **强制**改为本会话 inline 执行 apply；输出原因；进入 Step 3.3（不违反 HARD-GATE 例外） |

禁止跳过 probe 直接假设宿主有某 agent。禁止回退到 superpowers 派发驱动器。

### Step 3：执行 `/opsx:apply`

**组装启动 prompt**（subagent 分支必做；inline 可把同一约束当作自检清单）：

1. `read_file "./assets/implementer-prompt.md"`
2. 将 `<change_id 或省略>` 替换为 Step 0 的 `change_id`（方括号命令写成 `/opsx:apply <change_id>`）
3. 运行时自填占位符（如 `<N.M>`）**保持原样**
4. 在 prompt 末尾追加（若模板未含）：

```text
Change: <change_id>
Tasks: openspec/changes/<change_id>/tasks.md
TDD: 严格遵守 tasks.md 内每个 task 的 <!-- TDD 任务 --> / <!-- 非 TDD 任务 -->；禁止全局跳过 RED。
Review mode (final, by parent): <off|standard|thorough> — 你不必在 apply 循环内派发 reviewer。
Working directory: <worktree_path 或 main repo root>
```

#### 3.1 — `dispatch=path`

主代理用宿主 Task / AgentTool：`subagent_path` = 选定 path，`prompt` = 组装结果。  
运行期间**不得干预**，只收最终汇报。

#### 3.2 — `dispatch=builtin` 或 `dispatch=default`

- builtin：`subagent_type` = 选定 `id`，`prompt` = 组装结果  
- default：不指定 path / 不绑项目 agent 文件，`prompt` = 组装结果  

运行期间**不得干预**，只收最终汇报。

#### 3.3 — inline（用户选 B，或 probe 退化）

主代理在本会话：

1. 执行 apply **前**输出本次 build 适用的 Constitution 原则清单（一行摘要即可）
2. 调用 `/opsx:apply <change_id>`
3. 每开始一个 task 前输出：`[Constitution C] Task <N.M>: 适用原则 = ...`
4. **禁止**在 apply 流程外另写业务实现

#### apply 中途 pause / error

- **paused**：按 apply 给出的原因与选项，用 decision-point 问用户；用户选继续 → 同模式再次 `/opsx:apply`（不要重跑 Step 1，除非用户要求改模式）
- **errored**：阻断，报告错误；不写 `build.status=completed`

### Step 4：最终代码审查（按 `review_mode`）

仅当 Step 3 汇报状态为 **completed**（或 inline apply 正常结束）后执行：

| `review_mode` | 动作 |
|---------------|------|
| `off` | 跳过；在 state 记 `build.final_review: skipped:off` |
| `standard` | 加载 Superpowers `requesting-code-review`，范围：本次 diff + `tasks.md` + 必要测试结果；只查正确性 / 安全 / 边界 |
| `thorough` | 同上，并额外要求对照 `tasks.md` 与相关 specs 做覆盖与一致性关注（仍是一次最终审查，不是每任务审查） |

- 审查发现 **CRITICAL / IMPORTANT** → **阻断**完成；decision-point：A 回 Step 3 修复 / B 用户接受风险并记录 override（须显式确认） / C 放弃
- `requesting-code-review` 不可用 → 标注跳过原因，decision-point：A 接受跳过 / B 阻断

> 与 verify 去重：本步已审过且未再改动的 diff，verify 侧应聚焦「是否符合 spec/tasks」与「build 之后新增改动」，避免整份重审。

### Step 5：出口校验 + 推进阶段

校验（全部通过才能完成）：

1. `tasks.md` 中**不存在** `- [ ]`（任意未勾选 → 未完成）
2. apply 输出含 `Implementation Complete` 类摘要（或 subagent 汇报 `status=completed` 且完成数 = 总数）
3. 未违反 HARD-GATE（未在 apply 外手写实现；`subagent_dispatch` 时已做过 probe，除非已退化 inline）
4. Step 4 已处理（执行完毕 / 合法跳过 / 用户已确认接受风险）

**硬阻断**：

- 校验 1 失败 → `[polaris-flow] 阻断：tasks.md 存在未完成任务，禁止标记 build 完成。` + 列出未完成编号；等待用户（继续实施 / 手动勾选并说明理由 / 放弃）
- 校验 2 失败（paused/errored）→ 呈现原因与可选项，等待用户
- 校验 3 失败 → 流程失败，不推进 phase
- 校验 4 失败 → 不推进 phase

**全部通过**：

```yaml
# state.yaml
build:
  status: completed
  build_mode: <subagent_dispatch|inline>
  review_mode: <off|standard|thorough>
  final_review: <done|skipped:off|skipped:<reason>|accepted_risk>
  completed_tasks: <N>
  total_tasks: <N>
  finished_at: "<ISO>"
current_verb: idle
```

workflow阶段推进至验收阶段：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --skill build --where-change-id "$task_id" --set phase=verify
```

输出：

```
[polaris-flow] build 阶段完成：
  change_id : <change_id>
  tasks.md  : openspec/changes/<change_id>/tasks.md（全部 [x]）
  review    : <final_review 值>
下一步建议 /polaris-flow-verify。
```

## Constitution 注入点 C

- **subagent（3.1 / 3.2）**：约束已在启动 prompt 中；implementer 在**每个** task 实施前必须输出  
  `[Constitution C] Task <N.M>: 适用原则 = ...`
- **inline（3.3）**：主代理在 apply 前输出原则清单，并在每个 task 前补输同上格式
- 原则来源：`openspec/memory/constitution.md`（若项目约定路径不同，以仓库内 constitution 为准）

## 退出条件

- `tasks.md` 全部 checkbox 为 `- [x]`
- apply 已 completed（非 pause/error 未解决）
- `build.status=completed`，且 `phase=verify`
- Step 4 审查已按 `review_mode` 处理完毕

## 上下文压缩恢复

重载：`change_id`、`worktree_path`、`build.build_mode` / `review_mode`、当前 `tasks.md` 勾选进度、apply 上次 pause 原因（若有）、本 skill 停在哪一步。  
- 停在 apply pause → 从 Step 3 续，勿重选模式（除非用户要求）  
- 停在 Step 4 审查未完成 → 从 Step 4 续  
- 勿重新跑 plan / 勿调用 `writing-plans`