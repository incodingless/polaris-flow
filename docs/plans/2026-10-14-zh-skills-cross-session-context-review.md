# `assets/zh/skills/` 跨会话上下文完整性审计

> **审计问题**：每个节点技能执行完成后，用户**新开会话**（历史归零）继续跑，是否会导致必要上下文丢失？
> **范围**：`assets/zh/skills/` 下 34 个 `SKILL.md`（含各自 `policies/`、`templates/`、`references/`）＋
> `assets/zh/policies/`（8 份共享策略）＋ `assets/zh/commands/`（13 个命令入口）。
> **排除**：`evals/`、`.work/`、`fixtures/`、`example/`、`PROVENANCE.md`；`assets/en/skills/` 为空（仅 `.gitkeep`），不在范围。
> **性质**：只读审计，不修改任何技能资产。结论以仓库现状为准。

---

## 一、判定口径

### 1.1 什么算「必要上下文丢失」

跨会话续跑依赖的**一切非环境态信息**，若只存在于会话历史、未落盘，则新会话即丢失。判定分五维：

| 维度 | 含义 | 通过标准 |
|---|---|---|
| **A 出口落盘** | 本阶段全部产物写入磁盘 | 有明确磁盘路径；无「产物只在会话回复里」 |
| **B 恢复清单** | 出口给出「新会话从哪继续」的最小读取集 | 含四件：任务身份 / 进度依据 / 上一段产出 / 起始步骤 |
| **C 游标推进** | 推进 `workflow.yaml` 游标，且角色正确 | 相位技能推进；服务型/旁路/终点不推进 |
| **D 隐性上下文** | 关键决策（人工确认、用户选择、探测结果）落盘 | 无「只靠会话记忆传递」的必要信息 |
| **E 入口读取** | 技能开头声明「进来先读什么恢复」 | 明确读上游产物 / 状态字段，不靠对话记忆 |

### 1.2 权威判据（来自仓库既有约定）

- **恢复清单四件**、**层级 C 提示语模板**、**「压缩上下文」vs「新开会话」用词** ——
  唯一源 `assets/zh/policies/auto-transition.md`（§「压缩时机与恢复清单」）。
- **进度唯一权威 = `.polaris/workflow.yaml` 游标**；`state.yaml.phase` 是**只写不读的镜像**，
  不得据以判断进度（`auto-transition.md` 首节、`src/core/config/task-kind-layout.ts`）。
- **阶段状态块命名空间**：`coding`/`debug` 用 `runtime.<phase>.*`（脚本 `resolveBlockStyle`：`src/core/hooks/task-state-entry.ts:166`）；
  `requirement`/`prototype`/`testcase` 用**顶层** `<phase>.*`（同文件 `:167-169`）。
- 权威阶段表 = `src/core/config/task-kind-layout.ts` 的 `TASK_KIND_LAYOUTS`（5 个 kind）；
  `codereview`/`constitution`/`subagent-*` **未登记**，非相位技能。

### 1.3 关键事实（本次回验所得，纠正一处常见误判）

`task-state-entry.sh complete-phase --phase <P>` 会由脚本按 phase 自动写 `<前缀>.<P>.status=completed`
（`src/core/hooks/task-state-entry.ts:270-284`，前缀由 `phaseBlockPrefix` 派生）。
**因此「上游技能没显式写状态字段」不等于「下游读到空」**——脚本兜底会补 `status`，但**不会补 `tdd_policy` 等自定义字段**。
本报告据此区分「真缺口」与「形式不一致」。

---

## 二、总览

| 族 | 技能数 | A 落盘 | B 恢复清单 | C 游标 | D 隐性上下文 | E 入口读取 |
|---|---:|---|---|---|---|---|
| coding（specify/plan/design/tasks/build/verify/ship/retro） | 8 | 7 ✅ 1 ⚠️ | 5 ✅ 2 ⚠️ **1 ❌** | 8 ✅ | 5 ✅ 3 ⚠️ | 8 ✅ |
| prd（discovery/draft/refine/ship/review/testability/readiness） | 7 | 5 ✅ 2 ⚠️ | 4 ✅ 3 ⚠️ | 7 ✅ | 5 ✅ 2 ⚠️ | 7 ✅ |
| testing（discovery/draft/refine/ship/review/acceptance） | 6 | 4 ✅ 2 ⚠️ | 3 ✅ 2 ⚠️ **1 ❌** | 6 ✅ | 4 ✅ 2 ⚠️ | 5 ✅ 1 ⚠️ |
| prototype（blueprint/build/review/ship） | 4 | 4 ✅ | 4 ✅ | 4 ✅ | 2 ✅ 2 ⚠️ | 4 ✅ |
| debug（diagnose/patch/closeout） | 3 | 3 ✅ | 3 ✅ | 3 ✅ | 2 ✅ 1 ⚠️ | 2 ✅ 1 ⚠️ |
| 独立技能＋策略＋命令（codereview/constitution/subagent×2/8 策略/13 命令） | 27 | 部分 ✅ | **系统性薄弱** | 全部 ✅ | 数处 ⚠️ | 命令普遍缺失 |

**总体结论**：跨会话续跑的**主干机制健全**——「产物即状态 + 游标 + 恢复清单四件 + 层级 C 模板」已在
34 个技能中系统落地，五族主链路（coding 8 / prd 4 / testing 4 / prototype 4 / debug 3）的续跑基本成立。
问题有两类：

1. **🔴 1 处确证的功能性缺陷**：`coding/tasks` 状态字段写错命名空间（详见 §3.1）。
2. **🟠 一批形式/边界缺口**：出口模板不规范、服务型技能无落盘契约、跨技能字段取值不一致、
   悬空步骤引用、命令层无恢复说明（详见 §4）。

---

## 三、确证缺陷（❌，需修复）

### 3.1 🔴 `coding/tasks` 状态字段写入命名空间错误 —— 本次审计最严重问题

**证据**

| 位置 | 内容 |
|---|---|
| `coding/tasks/SKILL.md:364-368`（Step 8 写入） | `--set runtime.**plan**.status=completed` / `runtime.plan.tdd_policy=` / `runtime.plan.tasks_path=` / `runtime.plan.review_report=` / `runtime.plan.outside_voice=` |
| `assets/shared/templates/state.example.yaml`（模板定义） | tasks 阶段的字段是 `runtime.**tasks**.{status, tdd_policy, tasks_path, review_report, outside_voice}` |
| `coding/tasks/SKILL.md:98,100,151,259,404,413,416`（本技能读取） | 一律读 `runtime.**tasks**.tdd_policy` / `runtime.tasks.status` |

**后果**

- 技能把 5 个字段**全部写进 `runtime.plan.*`**，导致 `runtime.tasks.tdd_policy` / `tasks_path` /
  `review_report` / `outside_voice` **永远为空**。
- **续跑判据失效**：Step 2 的「若 `runtime.tasks.tdd_policy` 已存在 → 展示当前值并询问是否沿用」（`:151`）
  恒为假 → 每次新会话续跑都会**重复询问 TDD 策略**。
- **退出条件形式化**：`:404`「用户已明确选择 `runtime.tasks.tdd_policy`」永不满足。
- **恢复提示指向空字段**：`:399`/`:413` 让新会话读 `runtime.tasks`，但该命名空间下只有 `status`
  （由脚本 `complete-phase` 兜底写入），没有 `tdd_policy` 等——恢复清单第 3 件「上一段产出」落空。
- **污染 plan 命名空间**：`runtime.plan.tdd_policy/tasks_path/review_report/outside_voice` 是凭空塞入
  plan 阶段的字段（plan 自身从未写这些键）。

**⚠️ 需纠正的误判**：这**不**导致 build 入口判零匹配。`coding/build/SKILL.md:71` 校验
`runtime.tasks.status=completed`，而 `tasks` Step 8 先调用 `complete-phase --phase tasks`，
脚本（`task-state-entry.ts:278`）会按 phase 自动写 `runtime.tasks.status=completed` → **build 能正常放行**。
真正的伤害是**自定义字段（tdd_policy 等）读不到**，不是状态位缺失。

**修复方向**：将 Step 8 的 5 个 `--set runtime.plan.*` 改为 `runtime.tasks.*`（与模板、与技能自身读取一致）。

### 3.2 🟠 `debug/diagnose` 引用不存在的 `Step 1.5`

**证据**：`debug/diagnose/SKILL.md:57`「**A. 继续最近任务** → 进入 **Step 1.5**」、`:62` 同；
但该文件步骤序列为 Step 0 / Step 1 / Step 2 … Step 6，**无任何 `Step 1.5` 定义**（标题扫描确认）。

**后果**：新会话从「继续最近任务」入口续跑时，落点悬空，只能靠 `:356`
「按 Step 1 的存量分支续跑」兜底——路径指引不闭环。

**修复方向**：新建真正的 Step 1.5（对齐 `prototype/blueprint` 的「Step 1.5：读取任务进展」），
或把两处指向改为实际存在的步骤。

### 3.3 🟠 `prd/review`、`prd/testability` 报告无落盘路径，却假设「报告已落盘」

**证据**

- `prd/review/SKILL.md:234`「**必须** `read_file ./templates/review_report_template.md`，按报告模板输出」
  —— 全文**未定义**报告落盘路径；但 `:317` 的恢复逻辑「报告已落盘、且被评 PRD 指纹未变 → 不重跑」**假设了落盘**。
- `prd/testability/SKILL.md:186` 同构（按模板输出，无路径）；`:214` 同「报告已落盘…→ 不重跑」。

**后果**：被 `prd/refine` 以 subagent 调用时由 `output_path` 约束兜底；
**独立触发时**（命令 `prd/readiness` 之外的场景）报告只存在于会话回复 → 产物丢失。

**对照组**：`prd/readiness/SKILL.md:204-208` 显式给出 `final/readiness_report.md`，是正例。

**修复方向**：为两者补默认落盘路径（或显式声明「落盘由调用方 `output_path` 决定，独立触发时必须落盘」）。

### 3.4 🟠 `testing/acceptance` 完全缺失恢复机制与读盘入口

**证据**：`testing/acceptance/SKILL.md` 全文**无**「上下文压缩恢复」节、无层级 C 模板、
无 task_id / `state.yaml` 读取说明；落盘优先级第 3 档（`:135`）为「**在对话中输出全文**」。

**后果**：独立调用且无任务上下文时，产物与评审范围**全部只存会话**，
新会话无法恢复（对比同族 `testing/review/SKILL.md:161` 显式声明服务型、`:152-158` 有恢复依据）。

**修复方向**：补「上下文压缩恢复」节与读盘入口；或显式声明服务型边界（不落盘即无恢复点，需用户自持）。

### 3.5 🟠 `prototype/blueprint` 状态字段取值自相矛盾

**证据**（同一文件内三处冲突）

| 位置 | 取值 |
|---|---|
| `prototype/blueprint/SKILL.md:99`（续跑判定） | `blueprint.status != **confirmed**` → 进入 Step 4 |
| `prototype/blueprint/SKILL.md:306`（出口写入） | `blueprint.status: **completed**` |
| `prototype/build/SKILL.md:57`（下游入口校验） | `blueprint.status=**completed**` |
| `prototype/build/SKILL.md:109`（硬门禁） | 「`blueprint.md` 有**确认记录**」（文档内记录，非 state 字段） |

**后果**：blueprint 自己写 `completed`，却用 `!= confirmed` 判断是否需重做确认 → 续跑时**恒进入 Step 4**
（重新人工确认）。且「确认态」载体在 `state.yaml` 字段与 `blueprint.md` 文档记录之间摇摆，
新会话可能误判「已确认/未确认」。

**修复方向**：统一取值（并固定确认态的载体位置），三处判据对齐。

---

## 四、风险项（⚠️，形式/边界缺口）

### 4.1 恢复清单不完全符合「四件」

| # | 技能 | 缺口 | 证据 |
|---|---|---|---|
| 1 | `prd/discovery` | 出口恢复提示**漏**本阶段第二主产物 `req_clarify_summary.md`（仅在「上下文压缩恢复」节出现） | `SKILL.md:630` vs `:637` |
| 2 | `coding/ship` | 出口 Step 6 摘要**未套层级 C 模板**（无「恢复：先读…」行），恢复信息另置他节 | `SKILL.md:254-270` vs `:295-305` |
| 3 | `prd/ship` | 仅一句非标准「中断恢复」，未给任务身份/产出目录 | `SKILL.md:47` |
| 4 | `prd/review`/`testability`/`readiness` | 服务型技能用「原子流程、中断即从 Step X 重跑」替代四件（功能可用，格式不合规） | 各技能末尾「上下文压缩恢复」节 |
| 5 | `testing/ship`、`prototype/*`、`debug/*` | 终点/服务型技能不产层级 C 模板（**合理**，非缺陷） | — |

### 4.2 隐性会话上下文未落盘

| # | 技能 | 未落盘信息 | 证据 |
|---|---|---|---|
| 1 | `prd/draft` | 逐章「confirmed」状态**无独立落盘文件**，靠回读 `sessions/` 推断（对比 `prd/refine` 有 `chapter_state.md`，`:215`「唯一依据」） | `draft:188`「标记该章 confirmed」未指定位置；`draft:290` |
| 2 | `prd/refine` | Step 1.5 的「逐章/全量生成」用户选择未落盘；恢复表（`:567`）只依据 `chapter_state.md`，未覆盖 | `refine:171-172,187` |
| 3 | `coding/design` | 「设计方案确认态」未落盘为字段（已由 `:283` 要求重问兜底） | `design:283` |
| 4 | `coding/build` | apply 的 **pause 原因**未落盘；恢复节（`:267`）要求重载但无字段承载 | `build:176,267` |
| 5 | `debug/diagnose` | Step 5.6「根因确认」与 Step 6.5「方案确认」两个**无条件必停**的人工门禁，结果未要求落盘（同技能止血/现场保全都明确「回填」） | `diagnose:287,319-321` |
| 6 | `subagent-dispatch` | `task_spec`／`dispatch.*` **只在会话内**，落盘的只有子代理 `artifact_path`；委派中断后「谁被派发、派了什么、卡在哪」不可恢复。另 `:106` 字段名 `output` 与 `:69` `artifact_path` 不一致 | `dispatch/SKILL.md:36-41,63-73,106` |
| 7 | `constitution`（AMEND） | `Sync Impact Report` 无独立落盘路径 | `constitution-amend.md:29-40` |
| 8 | `constitution-audit.md` | 违规清单只给输出格式，未给落盘路径 | `:34-41` |

### 4.3 命令入口（`assets/zh/commands/`）

- **全部 13 个命令**均未说明「重新进入该流程时如何恢复」（读哪个产物 / 看哪个游标）。
  多数为薄壳（`coding/normal.md` 正文仅一句「使用 …技能」），恢复语义**下沉到被加载技能**——
  按本次口径属「未明示」，但对薄壳命令可接受。
- **正例**：`prototype/review.md:16` 给出「进度以评审对象 `sha256` 与报告为准」——命令中唯一合格样例。
- **`flow.md:140`** 显式声明「选择单次会话有效、不持久化」→ 重进即重选菜单，收集的路由上下文丢失
  （属设计取舍，但无明文恢复说明）。

### 4.4 附带发现（与进度判据相关，非上下文丢失）

- `testing/discovery/SKILL.md:113`、`testing/draft/SKILL.md:51` 等处**仍以 `state.yaml.phase` 判断进度**，
  与 `auto-transition.md`「`state.yaml.phase` 只写不读、不得据以判断进度」口径冲突（**待逐处回验**）。

---

## 五、各族健康度小结

| 族 | 结论 |
|---|---|
| **coding** | 主链最强：specify/plan/design/build/verify 五维全绿；**`tasks` 命名空间写错为唯一 ❌**；`ship`/`retro` 形态合规（终点/旁路正确不推进）。 |
| **prd** | 主干（discovery/draft/refine/ship）续跑成立；三处风险集中在**服务型技能落盘契约**（review/testability）与 **draft 章节确认态载体**。 |
| **testing** | 主干四阶段闭环；**`acceptance` 无恢复机制为 ❌**；`review`/`acceptance` 有「会话输出」白名单。 |
| **prototype** | 四技能 A/B/C/E 基本全绿；`blueprint` 状态字段自相矛盾（⚠️）、`build` 原型文件名非字面绑定（见原分族报告）。 |
| **debug** | 产物契约（`references/artifacts.md` 三副本）最规范；`diagnose` 悬空 Step 1.5（❌）＋两处人工确认未落盘（⚠️）。 |
| **独立技能/策略/命令** | 游标语义全对（无一自行推进）；**恢复清单系统性薄弱**；`subagent-dispatch` 委派动作不可恢复。 |

---

## 六、整改优先级建议

**P0（功能性缺陷，直接导致续跑信息缺失）**

1. `coding/tasks`：Step 8 的 5 个 `--set runtime.plan.*` → `runtime.tasks.*`（`SKILL.md:364-368`）。

**P1（断链 / 落盘契约缺失）**

2. `debug/diagnose`：补全或删除悬空的 `Step 1.5`（`SKILL.md:57,62`）。
3. `prd/review`、`prd/testability`：补报告默认落盘路径。
4. `testing/acceptance`：补「上下文压缩恢复」节与读盘入口。
5. `prototype/blueprint`：统一 `blueprint.status` 取值与「确认态」载体（`SKILL.md:99,306`；`build:57,109`）。

**P2（形式统一与边界补齐）**

6. `prd/discovery:630` 恢复行补 `req_clarify_summary.md`。
7. `prd/draft` 增补章节状态落盘文件（对齐 `refine` 的 `chapter_state.md`）。
8. `prd/refine` Step 1.5 生成方式落盘。
9. `debug/diagnose` 两个人确认门禁结果落盘。
10. `coding/build` apply pause 原因落盘；`coding/ship` 出口补恢复行。
11. `subagent-dispatch` 统一 `output`/`artifact_path` 字段名。
12. 命令层补「重进如何恢复」统一说明（或明确「下沉到技能」为约定）。
13. 回验 `testing/discovery:113`、`draft:51` 残留的 `state.yaml.phase` 读取。

---

> 本报告为只读审计结论，未修改任何技能资产；所列证据均指向仓库现状（文件 + 行号），可直接复核。
