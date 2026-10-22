# coding 工作流编排 —— tweak 档实现方案（v2，按 2026-10-14 裁定收敛）

> **性质**：实现方案，**不含改动**。所有事实均给出位置（文件:行），可直接复核。
> **范围**：本文详写 **tweak 档（简单需求）**；normal / strict 见 §9。
> **v2 变更**：按 Q1–Q10 的裁定重写。核心变化 = **新增「任务管理技能」层**（Q3）+ **档位判定收敛到 `specify` 出口**（Q6 → Q10）+ **tweak 档工作流定稿**（Q1）+ **需求预检移出**（N3）。裁定记录见 §8。
> **前提**：`assets/tmp/skills/coding/{tweak,normal}` 是「独立实现、未做编排」的版本（用户已挪出安装目录，**保留作参考、不处理**）；本文不沿用其实现，只参考其**档位裁剪口径**。

---

## 0. 结论摘要

编排**不等于**把几个阶段的内容抄进一个技能。裁定后，「编排」拆成 **四件事**，各只有一个落点：

| # | 编排内容 | 落点 | 为什么放这里 |
|---|----------|------|--------------|
| ① | **档位 → 阶段序列**（tweak 跑哪几段） | 代码表 `src/core/config/task-kind-layout.ts` | 用户既有裁定「配置归代码」；恢复分发 / 写 phase 校验 / （后置的）进度条三处都要读它 |
| ② | **阶段内的强度裁剪** | 各阶段技能读 `state.yaml` 的 `workflow.mode` | 技能是执行体，它自己知道哪一步能省；`verify` 的 `verify_mode` 已是同款先例 |
| ③ | **任务与调度**（恢复分发 / 建任务 / 入口定档 / 转交） | **任务管理技能**（= 现有 `intake` 升级，Q3） | 这是 `specify` 现在**不该有**的职能，必须剥出来；且要成为 coding 族**所有阶段技能的统一前置** |
| ④ | **档位声明**（用户显式说"这是简单改动"） | 三个薄编排技能（tweak / normal / strict） | 技能调用没有传参机制，档位只能由入口技能名承载 |

**架构三层**：

```
① 入口层   命令 /psfl:coding:{tweak,normal,sdd} → 薄编排技能（只定档）
                                    │
② 调度层   任务管理技能（intake 升级）：恢复分发 → 建任务+写 mode → 转交（不判档）
                                    ↑
                       档位判定只在 specify 出口（全流程唯一一处，Q10）
                                    │
③ 执行层   阶段技能：specify / tasks / build / verify / ship（只做本阶段，读 mode 决定强度）
```

**tweak 档序列**：`specify → tasks → build → verify → ship`（跳过 `plan` / `design`）

**关键取舍**：**不做常驻编排器**。项目已有编排引擎（`state.yaml.phase` 游标 + `state next`）；再立一个"每段回来找我"的编排器会绕开游标语义，把恢复能力做没。

---

## 1. 问题：tmp 版为什么不算编排

| 现象 | 证据 | 后果 |
|------|------|------|
| 把四段**重写进一个技能** | `assets/tmp/skills/coding/tweak/SKILL.md` 498 行，自带 `change-brief-template.md` / `tweak-tasks-template.md` / `exit-check.md` | 与阶段技能**双向漂移**：改 `coding/verify` 的 metrics 口径不会同步到 tweak 的 exit-check |
| 产物另立一套 | tweak 用 `change-brief.md`，而 coding 族的规格产物是 `intention.md` | 同一件事两份模板 + 两种恢复路径（**Q5 已裁定：废弃 change-brief**） |
| 游标只走 `specify → plan → ship`，中途是黑盒 | `channelSkill` 只登记 specify/plan；`coding-workflow-flows.md:62` 自述「全程只有出口那一次写入」 | 跨会话恢复**只能靠猜产物** |
| `specify` 承担了不属于它的职能 | `specify/SKILL.md:36-172` 的 Step 1 整段是"选任务 → 判阶段 → 转交" | **这正是 Q3 要剥出去的部分** |

外部实践把这件事写得很直接（§2.1）：**「一个 Skill 试图覆盖端到端全部阶段」是明确的反模式**。

---

## 2. 调研结论

### 2.1 外部实践（编排模式）

| 原则 | 要点 | 对本案的含义 |
|------|------|-------------|
| **编排器模式** | 父技能只做「阶段划分 + 决策点 + 子技能调用清单」，**不实现阶段内容** | 编排技能必须"薄"（④） |
| **反模式** | 单个技能覆盖端到端全部阶段 | tmp 版正中此坑 |
| **阶段四要素** | 每个阶段必须有：编号、入口条件、编号动作、出口条件 | 项目阶段技能**已经**是这形态，可直接当子技能用 |
| **状态外部化** | 把会话状态落到文件，不依赖上下文记忆 | 项目已有更强版本：`state.yaml.phase` 游标 + `state next` |
| **关注点分离** | 编排器不是巨无霸，而是"胶水" | 支持 ③④ 拆两层 |

### 2.2 项目已有的可复用机制（不需要新造）

| 机制 | 位置 | 现状 |
|------|------|------|
| **阶段事实表** | `src/core/config/task-kind-layout.ts:115-335` | coding 已登记 7 阶段 + 旁路 retro，含 `optional`（design）与 `channelSkill` |
| **游标 + 自动衔接** | `assets/zh/policies/auto-transition.md`、`polaris-flow state next` | 阶段技能出口写 `phase`，下一跳由 `state next` 给出 |
| **入口原语** | `scripts/task-entry.sh` → `src/core/hooks/task-entry.ts` | 一次调用返回 `resume` / `handover` / `create` / `select` / `resolve-drafts` / `block` 六出口（`:105-136`）—— ③ 的**现成执行体** |
| **写 phase 原语** | `task-state-entry` 的 `enter-phase` / `complete-phase --next-phase` | ✅ **实测**：`--next-phase` 只做阶段名白名单校验（`task-state-entry.ts:289-290,417-424`），**不校验拓扑顺序** ⇒ 跳阶已支持 |
| **强度自派生先例** | `coding/verify/SKILL.md:468-519` | `verify_mode` 由「规模启发式 + `score_level` + `risk_level`」自动定，**不询问用户** ⇒ 「档位决定强度」已有落地样本 |
| **产物补齐** | `coding/ship/policies/artifact-backfill.md` | 四件套缺失时由 ship 补齐 |
| **`intake` 已存在** | `assets/zh/skills/coding/intake/SKILL.md` | 已做「恢复分发 + 需求预检 + 复杂度判档 + 路由」—— **③ 的现成一半** |

**结论**：编排缺的不是机制，是 ① 与 ③。

### 2.3 硬约束（改动前必读）

| # | 约束 | 证据 | 影响 |
|---|------|------|------|
| ① | 🔴 **不删 `channelSkill` 必死循环** | `mode=tweak` + `phase=specify` 时 `skillForModePhase` 返回 `tweak` ⇒ 编排技能加载 `specify` 后会被弹回自己 | **删 `channelSkill` 是必做前置**，不是优化 |
| ② | **`tasks` 技能的输入契约是四件套** | `tasks/SKILL.md:132-140` 要求 `runtime.design.status=completed\|skipped` + 四件套齐全；Step 2 **必读全文** `proposal.md` / `design.md` / `specs/**` | tweak 跳过 plan ⇒ 四件套不存在 ⇒ **该技能在 tweak 档必须换输入剖面**（不止放宽断言） |
| ③ | **`intention-validate` 强校验 9 节** | `src/core/hooks/intention-validate.ts:10-20`；且 `isSectionBodyNonEmpty` **剥掉 HTML 注释后须有内容** | tweak 档必须**写满 9 节**（Q4 裁定：内容极简） |
| ④ | **模板没有共享通道** | 包级 `assets/zh/templates/` 只落 `<pluginRoot>/skills/polaris/templates/`；跨技能 `../` 被安装期校验硬阻断 | 产物模板**只能由持有它的阶段技能自己产出** ⇒ 别再想"另立一份 tweak 模板" |
| ⑤ | **`intake` 现禁建任务** | `intake/SKILL.md:16-17`：「禁止在本技能内执行 `task-init`」「禁止代写 `workflow.mode`」 | 升级为任务管理技能必须**解除这两条禁令**（否则 ③ 无法落地） |

---

## 3. 设计约束（不可违背）

1. **配置归代码**：禁止用 policy / yaml 承载「档位 → 阶段」映射。
2. **`phase` 语义不变** = 「接下来要执行的阶段」；`workflow.yaml` 条目仍不含 phase。
3. **写 `state.yaml` 只走 `task-state-entry`**；写游标只走 `workflow-entry`（H12）。
4. **不新造产物名**：tweak 复用 `intention.md` + `tasks.md`，**废弃 `change-brief.md`**（Q5）。
5. **档位值域**：`workflow.mode ∈ tweak | normal | strict`。`strict` 由旧名 `full` 更名（2026-10-14），旧值**只在读取侧**归一（`normalizeMode`）。
6. **不做常驻编排器**：不得引入"每阶段回来找编排器"的回路。
7. **Dashboard 后置**（Q7）：本方案**不含**任何前端改动；进度条按 `phasesForMode` 渲染「已跳过」留到技能稳定后单独做。
8. **英文后置**（Q9）：`assets/en/**` 本次不动。

---

## 4. 目标架构

### 4.1 三层职责

| 层 | 技能 | 职责 | 明确不做 |
|---|------|------|----------|
| **① 入口** | `tweak` / `normal` / `strict`（薄，各约 30 行） | 声明档位；把控制权交给任务管理技能 | 任何任务判定、任何阶段内容 |
| **② 调度** | **任务管理技能**（`intake` 升级） | 恢复分发（在途任务）→ 任务初始化（建目录 + 写 `mode` + 注册游标）→ 转交阶段技能（**不判档**） | 任何需求/设计/代码产物 |
| **③ 执行** | `specify` / `tasks` / `build` / `verify` / `ship` | 只做本阶段；读 `workflow.mode` 决定工序强度 | 选任务、判阶段、转交 |

**⚠️ 层与层的调用方式（防死循环）**：**只有「① 入口层」加载 `intake` 技能**。
「③ 执行层」的各阶段技能在 Step 0 **调用 `task-entry` 原语**（`--as <自己的技能名>`）完成「选任务 / 判阶段 / 接手或转交」，
**不加载 `intake` 技能** —— 否则会形成 `阶段技能 → intake → 转交该阶段技能 → intake → …` 的**死循环**
（intake 判定 `skill = 该阶段技能` ⇒ 转交 ⇒ 又回到 intake）。

**`specify` 的定位变更（Q2）**：从「strict 档入口 + 主动覆盖 `mode=strict`」变为「**消费者**」—— 读 `mode`、按档分叉、**不覆盖**。规则精确化为：

```
workflow.mode 已有值 → 沿用（消费）
workflow.mode 为空   → 默认 strict（兜底，不再"覆盖"）
```

### 4.2 与 `intake` 的关系（不新造技能）

`intake` 现在做四件事，其中三件正是 ② 要的：

| intake 现状 | 归入 ② 后 |
|---|---|
| Step 1 恢复分发 | ✅ 保留 |
| Step 2 需求预检（三要素 + 4 条判定 + 2 轮追问） | ❌ **移出**（N3）—— 属**澄清**职责，交给 `specify`；intake 只保留一条"需求内容为空则不建任务"的**准入检查** |
| Step 3 复杂度判档 | ✅ 保留为**入口粗判**（只为"选哪个入口技能"）；权威判定移到 `specify` 出口（§5.7） |
| Step 4 路由 | ✅ 保留 → 改为「交给指定阶段技能」 |
| — | ➕ 新增：任务初始化（建目录 + 写 `mode` + `append-active`）—— **解除 §2.3 ⑤ 的两条禁令** |

**为什么需求预检不该在 intake（N3）**：

| 论据 | 说明 |
|---|---|
| **职责不同** | intake 管**任务生命周期**（有哪些任务 / 该谁接手 / 在哪）；"需求够不够详细"是**内容质量**判断，属澄清 |
| **信息最少时做最重的判断** | 受理时手上只有用户一句话；澄清时已读过代码、问过问题。凭什么在信息最少时判"这个需求不合格" |
| **现状兜底逻辑是错的** | `intake/SKILL.md:95`：「仍为空则按 `critical` 处理」—— 把"需求说不清"等同于"复杂度高"，会让一句"优化一下"直接进 `strict`（最重流程），恰好是最差的选择 |
| **与澄清重复** | `specify` Step 3.0 已要求 ≥3 个探索性问题 + 推回模糊回答，做的正是同一件事，且更专业（它读得到代码） |

**移出后会不会破？不会**：用户说"优化一下" → 判档信息不足 → 落默认档 `normal` → `specify` 常规澄清用 ≥3 问把需求问清。**不清楚的需求在澄清期被问清，而不是在受理期被猜复杂度。**

**唯一例外必须处理**：`tweak` 档走轻量调研（不探索），若需求太碎会硬撑 ⇒ 见 §5.4 的 tweak 分支规则。

⇒ **升级 `intake`，不新建技能**（避免新造名字与安装路径）。若你后续觉得 "intake（受理）" 这个名字不再达义，可另议改名 —— 那会牵动命令与安装路径，属独立决定。

### 4.3 已选形态与备选（决策记录）

| | **甲：纯表驱动（无编排技能）** | **乙：薄编排技能 + 调度技能（已选）** | **丙：常驻编排器** |
|---|---|---|---|
| 档位声明 | 命令层文本口述，**无校验点** | 入口技能名承载 | 编排器内部维护 |
| 恢复语义 | ✅ | ✅ | ❌ 游标被绕开 |
| 技能数量 | 最少 | +3 薄技能（tweak/normal/strict） | +1 厚技能 |

选乙：甲方案档位靠命令正文"口述"，没有校验点；丙破坏 `phase` 语义。

---

## 5. tweak 档详细设计

### 5.1 档位 → 阶段序列（唯一真相 = 代码表）

```ts
/** 各工作流的阶段子序列（按游标推进顺序）；缺省 = 该 kind 的全序列 */
const CODING_MODE_PHASES: Record<string, string[]> = {
  tweak:  ['specify', 'tasks', 'build', 'verify', 'ship'],
  normal: ['specify', 'plan', 'tasks', 'build', 'verify', 'ship'],
  strict: ['specify', 'plan', 'design', 'tasks', 'build', 'verify', 'ship'],
};
```

派生函数（与既有 `skillForPhase` / `skillForModePhase` 并列，**不新增第二张表**）：

| 函数 | 作用 | 消费方 |
|------|------|--------|
| `phasesForMode(kind, mode)` | 该档的阶段序列 | 阶段技能入口校验；Dashboard（后置） |
| `nextPhaseForMode(kind, mode, phase)` | 该阶段在该档的下一段 | `complete-phase` 的缺省 `--next-phase` |
| `isPhaseInMode(kind, mode, phase)` | 该阶段是否属本档 | 阶段技能入口校验（"上游是否本该跑过"） |

**同时删除 `channelSkill`**：它是"单体通道技能"的配套设计，本方案不再有；删掉后 `skillForModePhase` 退化为纯同名映射，**"通道技能必须只走 specify→plan→ship"那条隐式陷阱一并消失**。

### 5.2 任务管理技能（②，`intake` 升级）

新流程（*斜体* = 新增，其余沿用现有 intake）：

```
Step 0 设置产物语言
Step 1 恢复分发 → 读 get-active-changes --format full 的 skill 字段
        零个 → Step 2   ｜  多个 → 列候选选 1 个  ｜  唯一 → 判阶段
Step 2 入口判档（仅「零个在途任务」时）：
        按 ./policies/risk-signals.md **粗判**（依据 = 需求原文；信息不足落默认档 normal）
        —— 只为"选哪个入口技能"服务；**权威判定在 `specify` 出口**（§5.7）
Step 3 *任务初始化*（仅「零个在途任务」时）：
        前置：需求内容非空（空 → 不建任务，要求用户先说明要做什么）—— 这是**准入检查**，不是预检
        task-init（建目录 + state.yaml）→ task-state-entry set workflow.mode=<粗判档>
        → workflow-entry append-active（幂等）→ 落 draft_name 供 finalize
Step 4 转交：同会话加载 `skill` 字段给出的目标技能（**不判档、不改 mode**）
        —— 唯一例外：目标是 `specify` 时，它会在**出口**判档（§5.7）
```

**关键**：`Step 3` 是新增职责（含"解除两条禁令"）；判档**不再"每次转交都做"** —— 只有两处：**入口粗判**（Step 2，为选入口）+ **`specify` 出口**（§5.7，权威）。转交判定**只读 `skill` 字段**（代码算好的），技能不内联映射表。

> **移出 Step 2 需求预检的连带改动**：`hard-stops.md` 的 **H14 现在明确写「该判定由 `intake` 的 Step 2 执行」** ⇒ 必须同步改为「由 `specify` 澄清阶段把关」，并把"阻断"语义改为"追问"（澄清期是要求补充，不是停止）。

### 5.3 薄编排技能（①）

三个同构，变量只有 `--as` / `--mode`。骨架（约 30 行）：

```markdown
---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak
description: "简单需求工作流的入口：声明档位（tweak）后交给任务管理技能。
  用户触发 /psfl:coding:tweak、或明确是单模块单文件的轻量改动时使用。
  不要用于：需要跨模块设计或多 delta spec 的需求（走 normal / sdd）。"
---

# coding 工作流入口 - 简单需求（tweak）

<HARD-GATE>
本技能**只声明档位**，然后把控制权交给任务管理技能。
- **禁止**在本技能内做任何任务判定、建任务、或产出任何阶段产物
- **禁止**内联档位→阶段序列表（唯一源 = `task-kind-layout.ts` 的 `phasesForMode`）
- H8：Step 入口输出状态行
</HARD-GATE>

## 本档序列
`specify → tasks → build → verify → ship`（跳过 plan / design）—— 取自代码表，不在此复制。

### Step 0 设置产物语言
### Step 1 交给任务管理技能
ENTRY=$(bash "$PLUGIN_ROOT/scripts/task-entry.sh" \
  --kind coding --as <任务管理技能> --mode tweak --repo-root "$REPO_ROOT")
按返回值：`create` → 本档工作流已落盘，进入首段；`handover` / `resume` / `select` /
`resolve-drafts` / `block` → 全部交给任务管理技能按 `./policies/task-entry.md` 处理。
本技能到此结束。
```

**注**：`--as` 填**任务管理技能**而非本技能名 —— 因为"选任务 / 判阶段 / 转交"现在都归它。

### 5.4 阶段技能的档位感知（③ 的执行侧）

统一规则：**把"询问用户决定强度"改成"按 `workflow.mode` 派生"**（与 `verify_mode` 同构）。

| 阶段技能 | strict 档现状 | **tweak 档行为** | 手段 |
|---|---|---|---|
| `specify` 澄清 | 强制 `openspec-explore` + ≥3 问 / ≥3 类 + Reframe + Options + Premise（`:186-226`） | 轻量调研：现场勘察 → **一次理解确认（6 项摘要）**；**信息不足时**先做一次聚焦追问（≤2 轮），仍不足 → 在**出口判档**时升到 `normal`（N3 的 tweak 例外） | Step 3 改"档位分支"；HARD-GATE 的 4 条禁令**按档条件化**，并注明"本档豁免" |
| `specify` 落盘 | `intention.md` 9 节 + `intention-validate` + 全文确认 | **同**（9 节全写、内容极简，Q4） | 不改 lint、不改确认 |
| `specify` 分级初判 | Step 5.4.1 判 `complexity_level` / `risk_level` / `current_tier` | **同**（它是 `specify` 出口判档的输入，Q10） | 不改 |
| `specify` 入口 | **自己选任务 / 判阶段 / 转交** | **移除整段，改为调用任务管理技能**（Q2/Q3） | Step 1 换成一次调用 |
| `tasks` 输入 | 读四件套 + `detailed-design.md`（Step 2 必读全文） | **换输入剖面：只读 `intention.md`** | 入口校验 + Step 2 按档分叉 |
| `tasks` 入口校验 | 要求 `design=completed\|skipped` + 四件套齐全 | 按 `isPhaseInMode`：跳过的上游**不检查**；四件套改为"tweak 档不要求" | 档位分叉 |
| `tasks` 策略 | Step 2 询问 TDD 策略（阻塞点） | 不询问，按任务类型**自动标注** | 档位派生 |
| `tasks` 主审 | Step 6 独立主审（不可跳过） | **跳过**（并在正文注明"本档豁免，非缺失"） | 档位派生 |
| `build` 模式询问 | Step 2 询问 `build_mode` + `review_mode`（`:111-143`） | 不询问，取 `inline` + `standard` | 档位派生 |
| `verify` | `verify_mode` 自动派生 | **不改** | 已有先例 |
| `ship` | 四件套缺失时补齐 | **不改** | `artifact-backfill` |

### 5.5 产物（Q1 / Q4 / Q5 裁定）

| 产物 | 路径 | tweak 档做法 |
|------|------|-------------|
| 意图 | `openspec/changes/<id>/intention.md` | **9 节全写、内容极简**（Q4）；`intention-validate` 照跑 |
| **实施计划** | `openspec/changes/<id>/tasks.md` | **必须**（Q1）：明确"改什么范围、做哪些动作"；节结构沿用 tasks 模板，内容极简 |
| 验证报告 | `openspec/changes/<id>/reviews/verify-report.md` | 复用 |
| metrics | `.polaris/metrics/<ts>-metrics.json` | 复用（retro 趋势不断档） |
| 四件套 | `proposal.md` / `design.md` / `specs/` | ⛔ 不在序列内 → 由 `ship` 的 artifact-backfill 补齐 |
| 详细设计 | `detailed-design.md` | ⛔ 不产出 |
| ~~变更简报~~ | ~~`change-brief.md`~~ | ⛔ **废弃**（Q5） |

### 5.6 门禁（人工确认）裁剪

tweak 档合计 **3 次**：

| # | 位置 | 内容 |
|---|------|------|
| 1 | `specify` 轻量调研末尾 | 理解摘要（6 项）整体确认 |
| 2 | `specify` 命名 | 任务名 |
| 3 | `tasks` 出口前 | `tasks.md` 定稿确认 |

另计：`verify` Step 15「人工业务语义确认」保留（质量底线）。
**裁剪原则**：只保留"会改变产物内容"的确认；"只是选个强度/模式"的询问一律改由档位派生。

### 5.7 档位变更的唯一位置 = `specify` 出口（Q6 + N4 修正）

**裁定（用户，2026-10-14）**：升档**仅限 `specify` 阶段**；过了 `specify` 就**不再判档、不再改 `mode`**。

**理由（硬）**：`specify` 出口时本任务的产物**只有 `intention.md`** ⇒ 改档**零返工**。一旦进入 `tasks` 及以后，改档就意味着"已产出的四件套 / `tasks.md` / 代码 / 验证报告全部要按新档重做"。

| 时机 | 触发 | 判定输入 | 可动 |
|---|---|---|---|
| **入口判档** | 新建任务时（零个在途任务） | 需求原文 + 用户消息（**粗判**，只为"选哪个入口技能"） | 任意档 |
| **出口判档** | 🔴 **仅 `specify` 出口** | `intention.md`（目标 / 范围 / 验收 / 下游约束）+ Step 5.4.1 的 `complexity_level` / `risk_level` | 任意档（**升 / 降都行**） |
| **其余阶段的转交** | `tasks` / `build` / `verify` / `ship` 出口 | — | ⛔ **不判档**，纯按 `skill` 字段转交 |

**统一动作**（`specify` 出口，无论升还是降）：

```
① 按 decision-point 问用户确认
② task-state-entry set --set workflow.mode=<目标档>
③ complete-phase --phase specify --next-phase <nextPhaseForMode(kind, 新档, 'specify')>
```

⇒ `tweak → normal` / `tweak → strict` / `normal → strict` 全部落在 **`next-phase = plan`**；不升档的 tweak 落 `tasks`。机制完全一致，**不需要第二张表**。

**两条配套规则**：

1. 🔴 **判定依据只能是落盘产物**（`intention.md` + `state.yaml` 的分级字段），**不得依赖会话记忆** —— 新会话里"用户当初怎么说的"已经不在上下文里。
2. 🔴 **恢复已有任务时不写 `mode`**（与 `task-entry` 既有约定一致：`--mode` 只在 `create` 时写入）。任务停在 `specify` → 跑澄清 → 出口判档（**允许**改）；任务停在 `tasks` 及以后 → **档位冻结**，只转交。

#### N4（修正）：降档不取消，但与升档同址

上一版我建议"取消降档"，理由是"`plan` 之后降档省不下工序"—— ⚠️ **该理由基于"复核点散落在各阶段"的前提，现在前提变了**：既然档位变更只在 `specify` 出口，就**不会出现"`plan` 之后降档"**，降档同样零返工。

⇒ **保留双向守门**（升档门 + 降档门，口径与 tmp 版 `tier-gate.md` 一致），只是**位置固定在 `specify` 出口**。

**降档门的意义**：入口判档只能凭用户一句话（容易判高），`specify` 出口有 `intention.md` 可细判 ⇒ 判高了在这里降回来。

### 5.8 恢复语义

| 场景 | 结果 |
|------|------|
| 重进 `/psfl:coding:tweak`，任务停在 `build` | 任务管理技能读 `skill=build` → 转交 `build`（**不重问档位**） |
| **任务已到 `design`，新会话重启入口** | **不重复预检、不重复判档** —— 见下方专段 |
| **任务已过 `specify`，再次进入（任意入口）** | 🔴 **档位冻结** —— 只按 `skill` 字段转交，不判档、不改 `mode`（§5.7） |
| 断在 `specify` 轻量调研中途 | `skill=specify` → 转交 `specify`，它读 `mode=tweak` 走轻量分支 + 「上下文压缩恢复」表定位断点 |
| 阶段技能被独立调用（不用命令） | 它的 Step 0 就**是**调用任务管理技能 ⇒ 行为一致 |

**"做到 design 后重开会话，会不会再走一遍需求预检？"** —— **不会**，两层保证：

| 层 | 保证 |
|---|---|
| **现状（未改也一样）** | `intake/SKILL.md:69-70` 写着：恢复分发命中在途任务、用户选「A 继续」→ **转交，「**不**进 Step 2、**不**建任务」。Step 2 需求预检只在「零个在途任务」或用户选「B 新建」时才跑 |
| **移出预检后（N3）** | 那条路径干脆不存在了；且 `specify` 的澄清只在 `phase=specify` 时执行，跑到 `design` 的任务**不会回到澄清** |

⇒ 恢复路径上**没有任何判档动作** —— 除非任务正停在 `specify`（那是它自身的正常出口判定）。其余阶段一律**纯按 `skill` 转交**，档位冻结。

---

## 6. tweak 档端到端流程

```
[/psfl:coding:tweak]
        ▼
① 薄编排技能 tweak（约 30 行，不实现任何阶段内容）
    声明档位 → 调用任务管理技能
        ▼
② 任务管理技能（intake 升级）
    恢复分发 → 零个则建任务（目录 + state.yaml + workflow.mode=tweak + 注册游标）
    → 转交指定阶段技能（**不判档**）
        ▼
③ specify（消费者：读 mode=tweak 走轻量分支）
    现场勘察 → 一次理解确认(6 项) → 任务名 → intention.md（9 节极简）→ lint → 全文确认
    finalize（draft → task_id）
    ★ 出口判档（全流程唯一一处）：按 intention.md 复核档位 → 需升/降则问用户并改 mode
    出口 → complete-phase --next-phase <nextPhaseForMode(kind, 现档, 'specify')>
        ▼
③ tasks（tweak 档：输入剖面 = intention.md）
    任务范围 / 修改动作 → 覆写 tasks.md → 定稿确认 → tasks-lint
    （不问 TDD 策略、不派独立主审）
    出口 → phase=build（纯转交，**档位已冻结**）
        ▼
③ build（档位派生：inline + standard，不询问）
    /opsx:apply → 最终代码审查 → 出口校验 → phase=verify
        ▼
③ verify（不改：verify_mode 自然落 light）
    → phase=ship
        ▼
③ ship（不改）
    分支收尾 → artifact-backfill 补四件套 → 归档 → 清游标
```

---

## 7. 改动清单（按依赖顺序）

| # | 文件 | 改动 | 风险 |
|---|------|------|------|
| 1 | `src/core/config/task-kind-layout.ts` | 增 `TaskKindLayout.modePhases` + 3 派生函数；**删** `channelSkill`（`skillForModePhase` 3 参 → 2 参） | ✅ 批 1 |
| 2 | `src/core/hooks/task-state-entry.ts` | `--next-phase` 变**可选**，缺省按 `(kind, mode, phase)` 派生 | ✅ 批 1 |
| 3 | `src/core/hooks/task-entry.ts` | 改为 **`intake` 专用**：删 `--no-create`；出口语义重排；锁写者标识改 `intake` | ✅ 批 4f |
| 4 | `assets/zh/skills/coding/intake/SKILL.md` | **升级为任务管理与调度层**：Step 1 恢复分发（新增「上游已指定 `task_id`」免提问分支）、Step 2 入口粗判、Step 3 **一次 `task-entry` 建任务**、Step 4 转交（交接必带 `task_id` + `worktree_path`）。⚠️ **不含权威档位判定**（那在 `specify` 出口，Q10） | ✅ 批 2 / 4e / 4f |
| 5 | **新增** `assets/zh/skills/coding/{tweak,normal,strict}/SKILL.md` | 三个薄编排技能（各 35 行，只声明档位 → 加载 `intake`） | ✅ 批 3 |
| 6 | `assets/zh/skills/coding/specify/SKILL.md` | **Step 1 改为「接收 `intake` 交接」**；HARD-GATE 按档条件化；Step 3 档位分派（`tweak` → `policies/lite-clarify.md`）；**Step 5.5 = 出口判档 + 推进阶段** | ✅ 批 4c / 4d / 4e |
| 7 | `assets/zh/skills/coding/tasks/SKILL.md` | HARD-GATE 档位分叉表；入口校验加「适用档」列；**Step 2.0 补建变更目录**（`tweak` 无 `plan`）+ 按档必读；TDD 按档；**Step 7/8 本档豁免**；**Step 9.0 `tasks.md` 定稿确认**（`tweak` 专属） | ✅ 批 5 |
| 8 | `assets/zh/skills/coding/{build,plan,design,verify,ship}/SKILL.md` | Step 1 统一为**「接收 `intake` 交接」**（不得自查 —— 执行层只有一个入口）；另：`plan` 的 design 决策点**档位门**、`build` 的 Step 2 **档位派生** | ✅ 批 4e / 4c / 5b |
| 9 | `assets/zh/policies/task-entry.md` | `git mv` 入 `coding/intake/policies/`（**intake 私有**，不再注入其他技能）；改为「`intake` 专用原语细则」—— 单一调用形态、`--no-create` 已删 | ✅ 批 4f |
| 10 | `assets/zh/policies/hard-stops.md` | **H14 收窄**：新口径 = 「`需求内容` 为空则禁止建任务/加载技能」的**准入检查**，判定点在 **`intake` Step 3**；并明写**本条不管"输入够不够详细"**（归 `specify` 澄清期，形式是**追问**不是阻断）。另清 H8 / H12 的命令引用 | ✅ 批 4c（文档侧） |
| 11 | `assets/zh/commands/flow.md` | 同步：intake 四步、C01–C03 的阶段链与产物、`HARD-STOP #11`、第五步的衔接落点改为 `intake` | ✅ 批 7 |
| 12 | `assets/zh/adapters/command-registration.md` | 同步：命令表四行（`flow` / 三个开发入口）改写 | ✅ 批 7 |
| 13 | `assets/zh/commands/coding/{tweak,normal,sdd}.md` | 指向新入口技能；`sdd` → `strict` | ✅ 批 3 |
| 14 | `docs/architecture/coding-workflow-flows.md` | **按三层架构重写**：§1 三层 + 三条工作流传记、§3 入口层/调度层/档位派生（**删除已退役的单体技能流程**）、§4–§6 的入口标签与游标约定同步、「通道」→「工作流」 | ✅ 批 7 |
| 15 | `CHANGELOG.md` | ⏳ **部分**：两条**事实错误**已就地更正（`task-entry` 三入口共用 / `full→strict` 的"存量无需迁移"）；**新增段落待裁定**（见 §8 的 Q9 口径：中英文未同步前不写 Changelog） | 🟢 |
| 16 | `assets/zh/skills/coding/retro/SKILL.md` | **Q11 落地**：入口口径改为「三条豁免」（不经 `intake` / 不被自动转交 / 不需要 `task_id`）；HARD-GATE 加「禁止加载 `intake` 或任何技能、禁止作衔接目标」；清掉全篇**不存在**的命令引用（`/polaris…:retro`）。连带：`intake`（链外技能说明 + `skill=null` 分支拆两种）、`ship`（收尾提示的 retro 调用方式）、`coding-workflow-flows.md`（§4.8 四点差异 / §7 唯一例外）、`skills-install.test.ts`（守卫） | ✅ |

> ⚠️ **Dashboard / 英文均不在本次范围**（Q7 / Q9）。

---

## 8. 裁定记录（2026-10-14）

| # | 问题 | 裁定 | 本文落点 |
|---|------|------|----------|
| **Q1** | tweak 序列要不要含 `tasks` 段 | **产物必须有 `tasks.md`**（确认修改范围与动作）；Dashboard 不考虑 | §5.1 序列含 `tasks`；§5.5 产物表 |
| **Q2** | `specify` 定位 | **变成消费者**（读 mode、不覆盖） | §4.1、§5.4 |
| **Q3** | 恢复/路由/初始化的归属 | **独立成一个技能**；编排技能先调它，再由它按条件调 specify | §4.2（升级 `intake`，不新建）、§5.2、§5.3 |
| **Q4** | tweak 档的 `intention.md` | **章节都有，内容极简** | §5.4、§5.5 |
| **Q5** | `change-brief.md` | **废弃** | §5.5、§3.4 |
| **Q6** | 升档判定放哪 | **不放 specify 的澄清过程**；入口判档由 `intake` 承担，**权威判定收敛到 `specify` 出口** | §5.7（Q10 已进一步收敛） |
| **Q7** | Dashboard | **后置**，待技能稳定后按其设计同步 | §3.7；本文不含前端改动 |
| **Q8** | `assets/tmp/` 的 tweak/normal | **弃用不处理**，可作参考资料 | 前提；§2.3 ① 的 `channelSkill` 照删 |
| **Q9** | 英文版 | **暂不处理** | §3.8（已写入项目记忆） |
| **Q10** | 档位变更（升 / 降）的位置与方向 | **升档仅限 `specify` 阶段**，过了 `specify` 不再判档（否则产出物全要按新档重做）；降档同址（保留双向守门） | §5.7（含 N4 修正） |
| **Q11** | `retro` 与新入口不变式的关系 | **豁免**：`retro` **不自动转交、也不由 `intake` 转接，由人工直接调用** —— 它是链外的服务型只读技能（不进任何档序列、不需要 `task_id`、只读主仓全局 metrics） | §4.1 入口不变式的"唯一例外"；`retro/SKILL.md` 入口口径三条豁免 |

### 裁定补充（N1 / N2 / N3，用户已确认 2026-10-14）

| 编号 | 结论 | 本文落点 |
|------|------|----------|
| **N1** | ✅ **保留 `tasks` 段** —— `tasks.md` 仍由 `tasks` 技能产出，但它换输入剖面（tweak 档只读 `intention.md`，不读四件套） | §5.1、§5.4、§7 #7 |
| **N2** | ✅ **任务管理技能沿用 `intake` 名字**（不新造名字、不动安装路径）；其 SKILL.md 的定位段改写为「任务管理与调度」 | §4.2、§7 #4 |
| **N3** | ✅ **需求预检移出 `intake`** —— 只保留"需求内容为空则不建任务"的准入检查；质量判断交给 `specify` 澄清。连带改 `hard-stops.md` 的 H14 | §4.2、§5.2、§7 #10 |

> **N4 已随 Q10 定案**（升档仅限 `specify`，降档同址）—— 上一版"取消降档"的建议基于"复核点散落各阶段"的前提，该前提已被 Q10 推翻，详见 §5.7 的 N4 修正段。

**至此设计冻结**：Q1–Q10 + N1–N3 全部有结论，可以开工。

---

## 9. normal / strict 扩展位（本方案不展开）

| 档 | 序列 | 与 tweak 的差异 |
|----|------|-----------------|
| **tweak** | `specify → tasks → build → verify → ship` | 无 plan / design；`specify` 轻量调研；`tasks` 换输入剖面 + 免询问免主审 |
| **normal** | `specify → plan → tasks → build → verify → ship` | 有 plan（四件套 + 一次合并主审）；`specify` 常规澄清；`tasks` 恢复主审 |
| **strict** | `specify → plan → design → tasks → build → verify → ship` | 全部保留 + `design` 深化 + Outside Voice |

`strict` 档 = 现状行为，**改造后应逐字等价** —— 这是回归验证的基线（先跑通 strict，再用同一套表切 tweak）。

---

## 10. 风险

| 风险 | 说明 | 缓解 |
|------|------|------|
| 🔴 **档位条件化被后人当"缺失"补回** | 每处豁免（Reframe / 主审 / TDD 询问）都可能被下次审计当成漏洞修掉 | 每处必须写明"本档豁免 + 依据 `workflow.mode`"；可抽共享 policy（原 D4）集中登记 |
| 🟠 **`tasks` 技能出现两套输入契约** | strict / normal 读四件套，tweak 读 `intention.md` —— 同一技能两种剖面，易漂移 | 在 `tasks/SKILL.md` 顶部用一张表显式声明两剖面 |
| 🟠 **任务管理技能被所有技能 Step 0 加载，context 成本** | 渐进式披露下，每次进入阶段都要读它的 SKILL.md | 把它写薄：正文只做分派，细则留 `policies/task-entry.md` |
| 🟡 **改 `intake` 会波及它现有的 flow 入口** | `/psfl:flow` → `intake` 的既有链路要一并验证 | 改动清单 #4 之后跑一次 flow 链路回归 |
| 🟠 **需求预检移出后 H14 会变成"空指针"** | H14 的判定点**写死**在「`intake` Step 2」，移出后它指向一个不存在的步骤，且"阻断"语义与澄清期的"追问"不符 | 改动清单 #4 与 #10 必须**同批**做，不能只做一半 |

---

## 11. 实施顺序（分批，按依赖与风险）

原则：**先地基、后上层；每批可独立验证**。

| 批 | 范围（§7 编号） | 产出 | 验证方式 | 风险 |
|---|---|---|---|---|
| **批 1 · 代码表 + 原语** ✅ **已完成** | #1 #2 #3 | `TaskKindLayout.modePhases` + `phasesForMode` / `nextPhaseForMode` / `isPhaseInMode`；`complete-phase --next-phase` 变可选（缺省派生）；**删 `channelSkill`**（`skillForModePhase` 3 参 → 2 参） | ✅ `tsc` exit 0；7 个测试文件 133 passed；新增 7 个 it | 🟠 牵动既有断言，但**不动任何技能** ⇒ 现状行为不变 |
| **批 2 · 任务管理技能** ✅ **已完成** | #4 #9 | `intake` 重写为**调度层**（三层定位 + 防死循环说明；HARD-GATE 改写；Step 2 改「入口判档 / 复核」并**删需求预检**；Step 3 新增**任务初始化**；Step 4 由代码表派生首段）+ `task-entry.md` `git mv` 入 `intake/policies/` | ✅ `tsc` exit 0；`skills-install` 13 passed；⚠️ `flow.md` 的悬空引用留批 7 | 🔴 |
| **批 3 · 入口层** ✅ **已完成** | #5 #13 | 三个薄编排技能（各约 35 行，只声明档位并加载 `intake`）+ `tweak.md` / `normal.md` 描述更新 + `sdd.md` 重写（入口改为 `strict` 技能） | ✅ `skills-install` + `commands-install` 19 passed；⚠️ `flow.md` 仍指向旧入口（批 7） | 🟢 |
| **批 4a · 卸载节点技能调度** ✅ **已完成** | #8（提前）+ 新增原语能力 | 新增 **`task-entry --no-create`**（零候选返回 `block`，不建任务）；`policies/task-entry.md` **移回顶层**（服务调度层 + 执行层）；**7 个节点技能的 Step 1 统一为「一次原语调用 + 4 行 `action` 分派」**，`specify` 另删掉整个创建/注册段 | ✅ `tsc` 0；task-entry 13 / task-kind-phases 47 / commands-install 6 / skills-install 13（**均单跑**） | 🔴 |
| **批 4c · `specify` 档位分支** ✅ **已完成** | #6 | Step 3 加**档位分派**（`tweak` → 新 policy `./policies/lite-clarify.md` 轻量调研；`normal`/`strict` → 3.0–3.4 完整探索）；HARD-GATE 的 **4 条探索类禁令按档条件化**；4.2 映射表补 tweak 来源；**`plan` 的 design 决策点加档位门**（`normal` 不提供，避免 `phase` 落到本档外） | ✅ `skills-install` 14 passed（含新守卫） | 🔴 |
| **批 4d · `specify` 出口判档** ✅ **已完成** | #6 | Step 5.5 改为 **「出口判档 + 推进阶段」**（全流程唯一档位变更点）：判 level → 折算目标档 → 变档需用户确认 → `set workflow.mode` → `complete-phase`（**不传 `--next-phase`**，按新 `mode` 派生）；`risk-signals.md` §1 加**分级→档位的单源映射**、§2 消费切片重写为四个判定点、§7 重写 | ✅ 同上 | 🔴 |
| **批 5 · `tasks` 改造** ✅ **已完成** | #7 | HARD-GATE 加**档位分叉表**；Step 1 入口校验加**适用档**列（design 状态仅 `strict`、四件套仅 `normal`/`strict`）；Step 2 拆 **2.0 准备变更目录**（`tweak` 档补建 `openspec/changes/<id>/` 并迁入 `intention.md` —— 无 `plan` 则没人建）+ 2.1 按档必读 + 2.2 可选参考；Step 3 TDD **按档**（`tweak` 不询问、自动标注）；**Step 7/8 本档豁免**；Step 9 加 **9.0 `tweak` 档专属「`tasks.md` 定稿确认」**（替代被豁免的独立主审）；退出条件 / 恢复表按档 | ✅ `skills-install` 14 passed | 🔴 |
| **批 5b · `build` 档位派生** ✅ **已完成** | #8 余项 | Step 2 加档位分派：**`tweak` 不问** ⇒ 直接取 `inline` + `standard`；HARD-GATE 的「plan 已完成」前提改为**按档**（`tweak` = `tasks` 完成） | ✅ 同上 | 🟠 |
| ~~**批 6 · 其余阶段技能**~~ ✅ **已并入批 4a** | #8 | `plan` / `design` / `verify` / `ship` 的 Step 1 已与 `specify` 一起统一为「接收 `intake` 交接」；**另加**：`plan` 的 design 决策点**档位门**（见批 4c）、`build` 的 Step 2 **档位派生**（见批 5b） | ✅ 批 4e / 4c / 5b | 🟠 |
| **批 7 · 文档与 CHANGELOG** ✅ **大部分完成** | #10–#15 | `flow.md`（intake 四步 / C01–C03 阶段链与产物 / HARD-STOP #11 / 第五步衔接落点）、`command-registration.md` 命令表、`coding-workflow-flows.md` **按三层架构重写**（§1 三层、§3 入口层+调度层+档位派生、§6 两个文件分工；**删除**已退役的单体技能流程；「通道」→「工作流」）、设计文档 §7/§11 收口。⏳ **仅 `CHANGELOG` 的新增段落待裁定**（两条事实错误已就地更正） | ✅ `commands-install` 6 passed；设计文档与 flows 文档人工复核 | 🟡 |

**为什么批 1 必须先做**：

1. 它是唯一"**纯代码 + 可单测 + 完全不碰技能**"的一批 ⇒ 风险可控；
2. 它**顺手修好一个现存缺陷** —— 当前 `mode=tweak` + `phase=specify` 时 `skillForModePhase` 返回 `tweak`，而该技能已被挪到 `assets/tmp/`（不在安装范围）⇒ 判据指向不存在的技能。删 `channelSkill` 后回落到 `specify`，恢复正常；
3. 后续 6 批全部依赖它（技能要引用 `phasesForMode` / 依赖派生出的 `--next-phase`）。

**批 4 / 5 是主战场**（两处 🔴）：`specify` 与 `tasks` 的档位条件化，也是"会不会把现状改坏"的主要风险区 —— 每批之后都要跑 **strict 档逐字等价回归**。
