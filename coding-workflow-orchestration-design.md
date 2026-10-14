# coding 工作流编排技能实现方案（先做 tweak 档）

> **性质**：实现方案，**不含改动**。所有事实均给出位置（文件:行 / 实测命令），可直接复核。
> **范围**：本文只详写 **tweak 档（简单需求）**；normal / strict 的扩展位见 §9。
> **前提**：`assets/tmp/skills/coding/{tweak,normal}` 是「独立实现、未做编排」的版本（用户已挪出安装目录），本文不沿用其实现，只参考其**档位裁剪口径**（哪些环节该省）。

---

## 0. 结论摘要

编排**不等于**把几个阶段的内容抄进一个技能。本方案把「编排」拆成三件事，各自只有一个落点：

| # | 编排内容 | 落点 | 为什么放这里 |
|---|----------|------|--------------|
| ① | **档位 → 阶段序列**（tweak 跑哪几段） | 代码表 `src/core/config/task-kind-layout.ts` | 用户既有裁定：配置归代码；且进度条 / 恢复分发 / 写 phase 校验三处都要读它 |
| ② | **阶段内的强度裁剪**（这一档要几成工序） | 各阶段技能读 `state.yaml` 的 `workflow.mode` | 技能是执行体，它自己知道哪一步能省；`verify` 已有同款先例 |
| ③ | **入口编排**（选任务 → 定档 → 交给第一段） | 三个薄编排技能（tweak / normal / strict，各约 40 行） | 档位必须由入口给出，技能调用没有传参机制 |

**tweak 档的序列（推荐）**：`specify → tasks → build → verify → ship`（跳过 `plan` 与 `design`）

**关键取舍**：**不做常驻编排器**。项目已有编排引擎（`state.yaml.phase` 游标 + `state next` + 技能 Step 0 的恢复分发）；再立一个"每段回来找我"的编排器会绕开游标语义，反而把恢复能力做没。

---

## 1. 问题：tmp 版为什么不算编排

| 现象 | 证据 | 后果 |
|------|------|------|
| 把 `specify → build → verify` 四段**重写进一个技能** | `assets/tmp/skills/coding/tweak/SKILL.md` 498 行，自带 `templates/change-brief-template.md`、`templates/tweak-tasks-template.md`、`policies/exit-check.md` | 与阶段技能**双向漂移**：改 `coding/verify` 的 metrics 口径不会同步到 tweak 的 exit-check |
| 产物另立一套 | tweak 用 `change-brief.md`，而 coding 族的规格产物是 `intention.md`（`task-kind-layout.ts:158`） | 同一件事两份模板 + 两种恢复路径 |
| 游标只走 `specify → plan → ship`，中途是黑盒 | `task-kind-layout.ts:140,146` 的 `channelSkill` 只登记 specify/plan；`coding-workflow-flows.md:62` 自述「全程只有出口那一次写入」 | 跨会话恢复**只能靠猜产物**，Dashboard 进度条不可信 |
| 阶段技能的入口校验写死了上游 | `coding/build/SKILL.md:99` 要求 `runtime.tasks.status=completed` | 想"用 tweak 复用 build 技能"时，校验直接拦死 |

外部实践把这件事写得很直接（见 §2.1）：**「一个 Skill 试图覆盖从开始到结束的所有阶段」是明确的反模式**，正确形态是「编排器只含阶段划分、决策点与子技能调用清单，不含执行逻辑」。

---

## 2. 调研结论

### 2.1 外部实践（编排模式）

| 原则 | 要点 | 对本案的含义 |
|------|------|-------------|
| **编排器模式** | 父技能只做「阶段划分 + 决策点 + 子技能调用清单」，**不实现阶段内容**；子技能各管一段 | 编排技能必须"薄" |
| **反模式** | 单个技能覆盖端到端全部阶段 | tmp 版正中此坑 |
| **阶段四要素** | 每个阶段必须有：编号、入口条件、编号动作、出口条件 | 项目阶段技能**已经**是这个形态，可直接当子技能用 |
| **状态外部化** | 把会话状态落到文件（`next-prompt.md` 等），不依赖上下文记忆 | 项目已有更强的版本：`state.yaml.phase` 游标 + `state next` |
| **反馈循环有上限** | 每个回环建议 3 次上限 | 项目已统一（3 轮收敛） |
| **顺序链** | 上一步产物即下一步输入 | 阶段技能的产物契约已满足 |
| **渐进式披露** | 组件靠 name + description 被选中，不读全文 | ⚠️ 项目是「同会话加载全文」，本例差异点，见 §8 D4 |

### 2.2 项目已有的可复用机制（不需要新造）

| 机制 | 位置 | 现状 |
|------|------|------|
| **阶段事实表** | `src/core/config/task-kind-layout.ts:115-335` | coding 已登记 7 阶段 + 旁路 retro，含 `optional`（design）与 `channelSkill` |
| **游标 + 自动衔接** | `assets/zh/policies/auto-transition.md`、`polaris-flow state next` | 每个阶段技能出口写 `phase`，下一跳由 `state next` 给出 |
| **入口原语** | `scripts/task-entry.sh` → `src/core/hooks/task-entry.ts` | 一次调用返回 `resume` / `handover` / `create` / `select` / `resolve-drafts` / `block` 六出口（`task-entry.ts:105-136`） |
| **写 phase 原语** | `scripts/task-state-entry.sh` 的 `enter-phase` / `complete-phase --next-phase` | ✅ **实测结论**：`--next-phase` 只做「是否合法阶段名」白名单校验（`task-state-entry.ts:289-290,417-424` + `isWritablePhase`），**不校验拓扑顺序** ⇒ 跳阶（`specify → tasks`）原语已支持 |
| **强度自派生先例** | `coding/verify/SKILL.md:468-519` | `verify_mode` 由「规模启发式 + `score_level` + `risk_level`」自动定，**不询问用户** ⇒ 「档位决定强度」在本项目已有落地样本 |
| **mode 已被消费** | `dashboard/src/components/TaskCardItem.vue:29,57` | 任务卡已显示"开发模式"标签，`mode` 在链路上是通的 |
| **产物补齐** | `coding/ship/policies/artifact-backfill.md` | 四件套缺失时由 ship 补齐，tweak 档可直接复用 |

**结论**：编排缺的不是机制，是**「档位 → 阶段序列」这一层声明**，以及**阶段技能的档位感知**。

### 2.3 本项目已记录的前置约束（改动前必读）

以下三条是从既有探查中核出的**硬约束**，直接决定方案形状：

| # | 约束 | 证据 | 对本案的影响 |
|---|------|------|-------------|
| ① | 🔴 **不删 `channelSkill` 必死循环** | `.workbuddy/memory/2026-10-14.md` 复核结论：`mode=tweak` + `phase=specify` 时 `skillForModePhase` 返回 `tweak` ⇒ 薄编排技能 Step 2 加载 `specify` 后，specify 的 Step 1 会把自己弹回 `tweak`，**无限转交** | **删 `channelSkill` 是本方案的必做前置**（§5.1），不是可选优化 |
| ② | 节点技能"轻量"的根基 = **砍掉其 HARD-GATE** | `specify/SKILL.md:8-17` 强制 ≥3 探索问题 + Reframe + Premise + Options；`plan` 强制 `artifact-batch-generation` | 本方案的**主要工作量在 specify / tasks 的硬门条件化**，不是写那三个 40 行薄技能 |
| ③ | **模板没有共享通道** | 包级 `assets/zh/templates/` 只落 `<pluginRoot>/skills/polaris/templates/`；跨技能 `../` 引用被安装期校验硬阻断 | 想复用 `intention-template.md` / `tasks-template.md`，**唯一途径就是由持有它的阶段技能自己产出** ⇒ 反向印证"复用阶段技能"比"另立模板"成本更低 |

---

## 3. 设计约束（不可违背）

1. **配置归代码**：禁止用 policy / yaml 承载「档位 → 阶段」映射（用户既有裁定，已写进 `coding-workflow-flows.md:78`）。
2. **`phase` 语义不变** = 「接下来要执行的阶段」；`workflow.yaml` 条目仍不含 phase（`.polaris/workflow.yaml` 只有 `task_id` / `worktree_path` / `started_at` / `channel`）。
3. **写 `state.yaml` 只走 `task-state-entry`**；写游标只走 `workflow-entry`（H12）。
4. **不新造产物名 / 目录**：tweak 复用 `intention.md` + `tasks.md`，不复活 `change-brief.md`。
5. **档位值域**：`workflow.mode ∈ tweak | normal | strict`（`task-kind-layout.ts` 的 `WORKFLOW_MODE_LABELS`）。
   ⚠️ `strict` 由旧名 `full` 更名而来（2026-10-14）—— 旧值**只在读取侧**归一（`normalizeMode`，与 `PHASE_ALIASES` 同构），写入白名单不含 `full`。
6. **不做常驻编排器**：不得引入"每阶段回来找编排器"的回路（会绕开 `phase` 语义与恢复分发）。

---

## 4. 候选方案对比

| | **甲：纯表驱动（无编排技能）** | **乙：薄编排技能 + 表驱动（推荐）** | **丙：常驻编排器** |
|---|---|---|---|
| 档位入口 | 命令层把 mode 传下去，三档共用 `specify` 技能 | 三个薄编排技能（各约 40 行），只做入口与转交 | 编排技能在每段边界被重新进入 |
| 阶段序列 | 代码表 | 代码表 | 编排技能内部维护 |
| 阶段强度 | 阶段技能读 `mode` | 阶段技能读 `mode` | 编排器逐段下发参数 |
| 恢复语义 | ✅ 游标真实经过每段 | ✅ 同左 | ❌ 游标被绕开，需重设计 |
| Dashboard 进度 | ✅ 真实 | ✅ 真实 | ⚠️ 无进度 |
| 技能数量 | 最少（0 新增） | +3 个薄技能（tweak/normal/strict） | +1 个较厚技能 |
| 主要代价 | 档位靠命令层文本传递，可信度弱；`/psfl:coding:tweak` 的语义不在技能层 | 多一层空转（入口技能不干活） | 破坏既有 `phase` 语义 + 恢复分发全改 |
| 外部实践符合度 | 高 | 高（编排器模式的标准形态） | 低 |

**推荐 乙**。理由：
- 用户既有裁定要求「三档各有**可独立启动**的同级命令」，其自然对应物就是三个同级入口技能；
- 「六出口分派」这套逻辑已在 `assets/zh/policies/task-entry.md` 里，三个薄技能共用即可，不产生新知识；
- 甲方案里 `mode` 只能由命令正文"口述"给技能，**没有校验点**，与硬门禁取向冲突。

---

## 5. 推荐方案（乙）

### 5.1 档位 → 阶段序列（唯一真相 = 代码表）

在 `src/core/config/task-kind-layout.ts` 增加：

```ts
/** 各工作流的阶段子序列（按游标推进顺序）；缺省 = 该 kind 的全序列 */
const CODING_MODE_PHASES: Record<string, string[]> = {
  tweak:  ['specify', 'tasks', 'build', 'verify', 'ship'],
  normal: ['specify', 'plan', 'tasks', 'build', 'verify', 'ship'],
  strict:   ['specify', 'plan', 'design', 'tasks', 'build', 'verify', 'ship'],
};
```

派生函数（与既有 `skillForPhase` / `skillForModePhase` 并列，**不新增第二张表**）：

| 函数 | 作用 | 消费方 |
|------|------|--------|
| `phasesForMode(kind, mode)` | 该档的阶段序列 | Dashboard 进度条；`isWritablePhase` 的档位版校验 |
| `nextPhaseForMode(kind, mode, phase)` | 该阶段在该档的下一段（未定返回 `null`） | `complete-phase` 的缺省 `--next-phase` |
| `isPhaseInMode(kind, mode, phase)` | 该阶段是否属本档 | 阶段技能入口校验（"上游是否本该跑过"） |

**同时删除 `channelSkill`**（`task-kind-layout.ts:71,140,146`）。理由：
- 它是"单体通道技能"的配套设计，而本方案不再有单体通道技能；
- 删掉后 `skillForModePhase` 退化为纯同名映射（入口阶段也返回同名技能），**记忆里那条"通道技能必须只走 specify→plan→ship，否则被交给同名节点技能"的隐式陷阱一并消失**。

### 5.2 阶段技能的档位感知（②）

统一改写规则：**把"询问用户决定强度"改成"按 `workflow.mode` 派生"**——与 `verify` 的 `verify_mode` 同构。

tweak 档的裁剪口径（沿用 tmp 版已验证的"该省什么"，但**不复制其实现**）：

| 阶段技能 | strict 档现状 | tweak 档行为 | 落的字段 / 依据 |
|---|---|---|---|
| `specify` | ≥3 问探索 + 拆分预检 + Reframe + Options + Premise + 任务名 + lint + 全文确认（`specify/SKILL.md:186-226`） | 只做：现场勘察 → **一次理解确认（6 项摘要）** → 任务名 → `intention.md`（精简节）→ 整体确认 | `specify/SKILL.md` 加"档位分支"；`complexity_level=trivial` |
| `plan` | 四件套 + 主审 + design/tasks 二分支 | **不参与**（不进序列） | §5.1 表 |
| `design` | 可选深化 | **不参与** | 同上 |
| `tasks` | TDD 策略询问 + 独立主审（`tasks/SKILL.md` Step 2 / Step 6） | 跳过 TDD 询问（按任务类型**自动标注**，规则见 `coding-workflow-flows.md:652-656`）；跳过独立主审；其余（覆盖表 / 文件结构 / Files-Interfaces / lint）保留 | 加档位分支；入口校验按 `isPhaseInMode` 放宽（见 §5.3） |
| `build` | Step 2 询问 `build_mode` + `review_mode`（`build/SKILL.md:111-143`） | 不询问，取 `inline` + `standard` | 写入 `runtime.build.*` 默认值 |
| `verify` | `verify_mode` 自动派生 | **不改** | 已有先例（`verify/SKILL.md:468-519`） |
| `ship` | 四件套缺失时补齐 | **不改** | `ship/policies/artifact-backfill.md` |

**入口校验的统一改法**（这是"组合阶段技能"能跑通的关键）：把"上游阶段必须 `status=completed`"改为：

```
上游阶段在 isPhaseInMode(kind, mode, <上游>) 为真时 → 必须 completed
上游阶段被本档跳过 → 不检查，且视为合法
```

例如 `coding/build/SKILL.md:99` 的 `runtime.tasks.status=completed` 不变（`tasks` 在 tweak 档也在序列里）；而 `coding/tasks/SKILL.md` 对 `design=completed|skipped` 的检查，在 tweak 档要改为"该阶段不属本档 ⇒ 跳过检查"。

### 5.3 编排技能（③）——薄编排器

三个技能**同构**，只有两处变量：`--as` 与 `--mode`。骨架（以 tweak 为例，约 40 行）：

```markdown
---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak
description: "简单需求工作流的编排入口：选任务 → 定档（tweak）→ 交给序列首段技能。
  用户触发 /psfl:coding:tweak、或明确是单模块单文件的轻量改动时使用。
  不要用于：需要跨模块设计或多 delta spec 的需求（走 sdd / normal）。"
---

# coding 工作流编排 - 简单需求（tweak）

<HARD-GATE>
本技能**只做编排**：选任务 → 进入任务（写 `mode=tweak`）→ 加载本档序列的**首段技能**。
- **禁止**在本技能内产出任何澄清 / 计划 / 代码 / 验证产物
- **禁止**内联档位→阶段序列表（唯一源 = `src/core/config/task-kind-layout.ts` 的 `phasesForMode`）
- **禁止**在本技能内跑升档判定（归属各阶段技能的档位分支，见 §5.5）
- H8：每个 Step 入口输出状态行
</HARD-GATE>

## 本档序列
`specify → tasks → build → verify → ship`（跳过 `plan` / `design`）
—— 取自代码表，本技能不复制；进入首段后由各阶段技能出口按同一张表推进。
**本技能不常驻**：段与段之间的衔接由 `state next` + 各阶段技能 Step 0 的恢复分发完成。

### Step 0 设置产物语言
`LANG=$(bash "$PLUGIN_ROOT/scripts/get-language-name.sh")`

### Step 1 进入任务
ENTRY=$(bash "$PLUGIN_ROOT/scripts/task-entry.sh" \
  --kind coding --as tweak --mode tweak --repo-root "$REPO_ROOT")
按 `./policies/task-entry.md` §2 的动作表分派：
- `create` → 任务已建 + `mode=tweak` 已落盘 → Step 2
- `handover` → 同会话加载 `polaris{{SKN_SPR}}coding{{SKN_SPR}}<skill>`，本技能结束
- `resume` / `select` / `resolve-drafts` / `block` → 按该 policy 对应节处理

### Step 2 交给序列首段
同会话加载 `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify`，并在交接中声明：
**本次工作流 = tweak（简单），序列见代码表 `phasesForMode('coding','tweak')`。**
本技能到此结束。
```

**编排技能不实现任何阶段内容** —— 这正是外部实践里的"编排器模式"。

> 注：`resume` 分支在改完 §5.1（删 `channelSkill`）后**不会出现**于编排技能 —— 因为 `skillForModePhase` 只会算出真实阶段技能名（`specify` / `build` / …），编排技能名不在其中，命中的必然是 `handover`。

### 5.4 门禁（人工确认）裁剪

tweak 档合计 **3 次**确认（与 tmp 版口径一致）：

| # | 位置 | 内容 |
|---|------|------|
| 1 | `specify` 轻量澄清末尾 | 理解摘要（6 项）整体确认 |
| 2 | `specify` 命名 | 任务名 |
| 3 | `tasks` 出口前 | `tasks.md` 定稿确认 |

另计：`verify` Step 15「人工业务语义确认」保留（质量底线，不属档位裁剪范围）。

**裁剪原则**（可作为后续 normal / strict 的统一判据）：**只保留"会改变产物内容"的确认；凡是"只是选个强度/模式"的询问，一律改由档位派生。**

### 5.5 升降档

| 方向 | 触发位置 | 动作 |
|------|----------|------|
| tweak → normal | `specify` 轻量澄清阶段（发现跨模块 / 多 delta spec）；或 `tasks` 阶段（顶层任务 > 3） | ① `task-state-entry set --set workflow.mode=normal`；② 游标 `phase` 前移到 `plan`（`complete-phase --phase specify --next-phase plan`）；③ 转交 `plan` |
| tweak → strict | 同上，但命中 critical 信号 | 同上，写 `strict`，前移到 `plan`，由 plan 的 `risk_level=critical` 分支强制深化 design |
| normal → strict | `plan` 出口 | 写 `mode=strict`，`--next-phase design` |
| normal → tweak | `plan` 出口 | 写 `mode=tweak`，`--next-phase tasks`（已产出的四件套保留，只影响后续分段） |

**关键点**：升降档只需「改 `mode` + 前移 `phase`」两步，**不需要拆目录、不需要重跑已完成阶段** —— 因为三档的阶段**同名**，只是参与集合不同。这是表驱动相对"单体通道技能"最大的收益。

### 5.6 恢复语义

| 问题 | 答案 |
|------|------|
| 重进 `/psfl:coding:tweak`，任务停在 `build` | `task-entry` → `skill=build` ≠ `tweak` → `handover` → 同会话加载 `build` |
| 重进 `sdd`，任务其实是 tweak 档 | 同上，按游标实际位置转交，**不重问档位** |
| 断在 `specify` 轻量澄清中途 | `skill=specify` → `handover` → `specify` 读 `mode=tweak` 走轻量分支 + 「上下文压缩恢复」表定位断点 |
| Dashboard 显示 | 进度条按 `phasesForMode` 渲染，`plan` / `design` 在 tweak 档显示「已跳过」（复用 `KindPhaseDef.optional` 的既有渲染规则，`task-kind-layout.ts:40-44`） |

### 5.7 主要工作量与风险：硬门条件化

本方案的**成本不在编排技能，而在阶段技能的硬门条件化**（约束 ②）。按改动量排序：

| 目标 | 现状（strict 档硬门） | tweak 档需成立的行为 | 手段 |
|------|---------------------|---------------------|------|
| `specify` 澄清 | 强制 `openspec-explore` + ≥3 问 / ≥3 类 + Reframe + Options + Premise（`specify/SKILL.md:186-226`） | 一次理解确认（6 项）即进落盘 | 把 Step 3 整体改为"档位分支"：tweak 走轻量勘察 + 单次确认；strict / normal 保持原样 |
| `specify` 落盘 | 强制 `intention-validate.sh` + 全文确认 | 同（保留，属"改变产物内容"的确认） | 不改 |
| `specify` 分级初判 | Step 5.4.1 判 `complexity_level` / `risk_level` / `current_tier` | 同（保留，它是升档判定的输入） | 不改 |
| `tasks` 入口 | 要求 `design=completed\|skipped` | tweak 档无 design 阶段 ⇒ 该检查不适用 | 用 `isPhaseInMode` 判"上游是否本该跑过" |
| `tasks` 策略 | Step 2 询问 TDD 策略（阻塞点） | 不询问，按任务类型自动标注 | 档位派生 |
| `tasks` 主审 | Step 6 独立主审（不可跳过，`coding-workflow-flows.md:377`） | 跳过 | 档位派生；但需**在文档里明确它是档位豁免**，不是被误删 |
| `build` 模式询问 | Step 2 询问 `build_mode` + `review_mode` | 取 `inline` + `standard` | 档位派生 |

**风险点**：
1. **条件化会被后人当成"缺失"补回去** —— 每处条件化必须写明"本档豁免 + 依据 `workflow.mode`"，否则下次审计会当漏洞修掉。
2. **`strict` 档必须逐字等价**（§9）—— 条件化的正确性只能靠"strict 档回归"验证。
3. **档位分支的重复** —— 若每个技能各写一份 `if tweak`，三档 × 5 技能 = 15 处重复 ⇒ 建议按 §8 D4 抽共享 policy。

---

## 6. tweak 档端到端流程（逐段）

```
[/psfl:coding:tweak]  ← 命令薄壳：使用 polaris:coding:tweak 技能
        │
        ▼
  tweak 编排技能（40 行，不实现阶段内容）
    Step 1  task-entry --as tweak --mode tweak
             零候选 → create：建目录 + 写 workflow.mode=tweak + 注册游标（phase=specify）
             有在途 → handover：按游标实际位置转交
    Step 2  同会话加载 specify
        │
        ▼
  specify（档位分支：轻量澄清）
    现场勘察 → 一次理解确认(6 项) → 任务名 → intention.md（精简节）→ lint → 全文确认
    finalize（draft → task_id）
    出口：complete-phase --phase specify            ← 缺省 next 由代码表派生 = tasks（strict 档则是 plan）
    state next → tasks
        │
        ▼
  tasks（档位分支：不询问 TDD、不派独立主审）
    覆盖表 → 文件结构 → Files/Interfaces → 覆写 tasks.md → self-review → tasks-lint
    出口：complete-phase --phase tasks → build
        │
        ▼
  build（档位派生：inline + standard，不询问）
    /opsx:apply → 最终代码审查 → 出口校验
    出口：complete-phase --phase build → verify
        │
        ▼
  verify（不改：verify_mode 自动派生，tweak 档自然落 light）
    出口：complete-phase --phase verify → ship
        │
        ▼
  ship（不改）
    分支收尾 → artifact-backfill 补四件套 → 归档 → 清游标
```

**产物**（与 strict 档同一套路径，只是少了四件套与详细设计）：

| 产物 | 路径 | 与本档关系 |
|------|------|-----------|
| 意图 | `openspec/changes/<id>/intention.md` | ✅ 复用 specify 模板（精简节） |
| 实施计划 | `openspec/changes/<id>/tasks.md` | ✅ 复用 tasks 模板 |
| 验证报告 | `openspec/changes/<id>/reviews/verify-report.md` | ✅ 复用 |
| metrics | `.polaris/metrics/<ts>-metrics.json` | ✅ 复用（retro 趋势不断档） |
| 四件套 | `proposal.md` / `design.md` / `specs/` | ⛔ 不在序列内 → 由 `ship` 的 artifact-backfill 补齐 |
| 详细设计 | `detailed-design.md` | ⛔ 不产出 |

---

## 7. 改动清单（按依赖顺序）

| # | 文件 | 改动 | 风险 |
|---|------|------|------|
| 1 | `src/core/config/task-kind-layout.ts` | 增 `CODING_MODE_PHASES` + 3 个派生函数；**删** `channelSkill` 与相关注释 | 🟠 牵动 `skillForModePhase` 的既有断言 |
| 2 | `src/core/hooks/task-state-entry.ts` | `complete-phase` 的 `--next-phase` 变**可选**，缺省走 `nextPhaseForMode` | 🟠 需保留显式传入（plan 的二分支仍要显式） |
| 3 | `src/core/hooks/phase-validation.ts` | 档位版合法值（可选：写 `phase` 时校验"是否属本档"） | 🟡 |
| 4 | `src/core/hooks/task-entry.ts` | 注释与断言随 #1 更新；`--as` 语义不变 | 🟡 |
| 5 | `dashboard/`（进度条 / 任务卡） | 按 `phasesForMode` 渲染，跳过段标「已跳过」 | 🟡 前端消费 `mode` 已通 |
| 6 | `assets/zh/skills/coding/specify/SKILL.md` | 加档位分支（轻量澄清路径） | 🟠 改动最大的一段 |
| 7 | `assets/zh/skills/coding/tasks/SKILL.md` | 加档位分支 + 入口校验按 `isPhaseInMode` 放宽 | 🟠 |
| 8 | `assets/zh/skills/coding/build/SKILL.md` | 档位派生 `build_mode` / `review_mode` | 🟡 |
| 9 | **新增** `assets/zh/skills/coding/{tweak,normal,strict}/SKILL.md` | 三个薄编排技能（各约 40 行） | 🟢 纯新增 |
| 10 | `assets/zh/skills/coding/intake/SKILL.md` | 路由表由"tweak/normal/specify"改为"tweak/normal/strict"；恢复判据段删除 `channelSkill` 相关表述 | 🟡 |
| 11 | `assets/zh/commands/coding/{tweak,normal,sdd}.md` | 指向新技能名；`sdd` → `strict` | 🟢 |
| 12 | `assets/zh/policies/task-entry.md` | 适用范围从"tweak/normal/specify"改为"tweak/normal/strict 三入口" | 🟢 |
| 13 | `docs/architecture/coding-workflow-flows.md` | 同步（该文档已欠一次同步，且含"通道"旧词需改"工作流"） | 🟡 |
| 14 | 中英同步 + `CHANGELOG.md` | 按项目约定：中文定稿 → 英文 → 再写 Changelog | 🟢 |

---

## 8. 待裁定决策点

| 编号 | 决策点 | 选项 | 我的建议 |
|------|--------|------|----------|
| **D1** | 编排技能是否要独立实体 | ① 三个薄编排技能（方案乙）② 无编排技能，命令层传 mode（方案甲）③ 常驻编排器（方案丙） | **①**；理由见 §4 |
| **D2** | tweak 档是否保留 `tasks` 段 | ① 保留（`specify → tasks → build → …`）② 与 specify 合并（specify 直接产出 `tasks.md`） | **①**；阶段职责单一，且 `tasks-lint` / 模板 / 恢复步骤全部现成 |
| **D3** | `plan` 被跳过后，四件套谁补 | ① 由 `ship` 的 artifact-backfill 补（现状机制）② tweak 档允许无四件套交付 | **①**；不动 ship 的既有契约 |
| **D4** | 阶段技能"档位分支"如何写才不膨胀 | ① 各技能内联 `if mode == tweak` 分支 ② 抽一份共享 policy `mode-profiles.md`（列每档每段的裁剪口径），技能引用 | **②**；符合"唯一源"取向，且与 `task-entry.md` / `auto-transition.md` 的既有做法一致 |
| **D5** | `verify` 是否按档位额外裁剪 | ① 不动（`verify_mode` 已自动，tweak 自然落 light）② Step 15 人工确认在 tweak 档降为"可选" | **①**；人工语义确认是质量底线，且它是"改变产物内容"的确认 |
| **D6** | 是否保留 `change-brief.md` 产物名 | ① 取消，统一 `intention.md` ② 保留（tweak 专用精简模板） | **①**；两份模板必然漂移，这是 tmp 版的教训 |

---

## 9. normal / strict 的扩展位（本方案不展开）

按同一套三件事推导，只需填表：

| 档 | 序列 | 与 tweak 的差异 |
|----|------|-----------------|
| **tweak** | `specify → tasks → build → verify → ship` | 无 plan / design；`specify` 轻量澄清；`tasks` 免询问免主审 |
| **normal** | `specify → plan → tasks → build → verify → ship` | 有 plan（产四件套 + 一次合并主审）；`specify` 走常规澄清（不跳 Reframe / Premise）；`tasks` 恢复主审 |
| **strict** | `specify → plan → design → tasks → build → verify → ship` | 全部保留 + `design` 深化 + Outside Voice；`specify` 全流程（含 5.4.1 分级初判） |

`strict` 档 = 现状行为，**改造后应保持逐字等价** —— 这是回归验证的基线（第一步先跑通 `strict` 档再用同一套表切 tweak）。
