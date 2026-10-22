# coding 工作流「入口与恢复」优化讨论稿

> **背景**：目标是「三条启动路径（flow 路由 / tweak·normal·sdd 直连 / specify 入口技能）在完成任一节点后，**新开会话都能正常恢复**」；
> 用户判断「把需求复杂度检测放在**命令层**不合适」。
> **性质**：讨论稿，**不含任何改动**。结论均给出证据（文件:行 / 实测命令），可直接复核。

---

## 一、先决事实：一个实测出来的断裂（必须先解决）

**coding 族的游标条目从来没有被创建过。**

| 核查 | 结果 |
|---|---|
| `task-init` 是否写游标 | **不写**。`src/core/hooks/task.ts` 的 `init()` 只建目录 + 写 `state.yaml`，无 `append-active`（与项目约定一致：append 是独立 op） |
| 谁调 `append-active` | 全仓 grep：仅 `debug/diagnose:147`、`prototype/blueprint:139`、`testing/discovery:145`、`prd/discovery:231`。**coding 族的 specify / tweak / normal 一处都没有** |
| 实测 `task-finalize` | **exit 3 失败**：`[workflow-entry] 阻断：rename-active 未找到 task_id=draft-xxx 的 entry（kind=coding）` |
| 实测补上 `append-active` 后 | `task-finalize` **exit 0**，游标正常写入 `coding_tasks: [{task_id, phase: specify, ...}]` |

**推论**：`specify` Step 2.2 的 `specify-finalize.sh`（`normal`/`tweak` 同）→ `task-finalize` → `rename-active` **必然 exit 3**，
按 H12 阻断；即便绕过，Step 5.5 的 `update-active --set phase=plan` 同样会因「未找到 entry」失败。

**旁证**：`specify/SKILL.md:80`、`normal/SKILL.md:110`、`tweak/SKILL.md:101` 的状态行都写着
`workflow: appended entry phase=specify` —— **文案声称已 append，但没有任何命令执行它**。文档与实现脱节。

**影响**：游标条目不存在 ⇒ `get-active-changes` 返回空、`state next` 无对象 ⇒ **目标 1/2/3 全部阻塞**。这是 P0，必须先修。

---

## 二、现状盘点

### 2.1 命令层（`assets/zh/commands/`）

| 命令 | 体量 | 实际职责 |
|---|---|---|
| `flow.md` | **肥路由**（11 条 HARD-STOP） | 零步：收集 `需求内容` + 3 要素预检 → 0.3 问「是否自动评估复杂度」→ **0.4 复杂度评估**（4 信号 / 3 档 / 强制升档）→ 菜单选类别 → 选 C01/C02/C03 → 前置校验 → 加载技能。**选择不持久化**（`:140`） |
| `coding/tweak.md` | 薄壳 | 正文一行：「使用 `polaris:coding:tweak` 技能」 |
| `coding/normal.md` | 薄壳 | 正文一行 |
| `coding/sdd.md` | 薄壳 + 说明 | 别名说明 + 「使用 `polaris:coding:specify` 技能」+ **要求先走完 flow 零步**（否则 H14 阻断） |

### 2.2 技能层（coding）

- **三条通道三个入口**：`tweak`（单体 7 步）/ `normal`（单体 10 步）/ `specify`（完整链路入口，后接 plan→design?→tasks→build→verify→ship）。
- **入口检测不对称**（关键）：
  - 分阶段技能（plan/design/tasks/build/verify/ship）Step 0 = `get-active-changes --phase <本阶段>` → **按游标定位，可跨会话续跑** ✓
  - 单体通道技能（`specify`/`tweak`/`normal`）Step 0 = `task-init --kind coding` → **只认 `draft-*` 目录，不查游标** ✗
- **技能层已有"复杂度/通道"判据**：`specify` Step 5.4（`complexity_level`/`risk_level`/`current_tier` 两轴）、`normal` Step 5（双向守门，升档 design / 降档 tweak）、`tweak` Step 3（升档检查）。

### 2.3 恢复机制

- 权威 = `.polaris/workflow.yaml` 游标（`<kind>_tasks[]`，字段仅 `task_id`/`phase`/`worktree_path`/`started_at`/`channel`——**无 `skill`/`mode` 字段**）。
- 驱动 = `polaris-flow state next <change>` → `NEXT: auto|manual|done` + `SKILL`（对入口阶段 `specify` 返回 `done`，设计如此）。
- **debug 族先例**：`WorkflowTaskEntry.channel`（`bugfix|hotfix`）已用于区分两条通道，由 `append-active --channel` 写入游标。→ **coding 复用/新增同类字段在架构上有先例**。

---

## 三、问题清单

| # | 级别 | 问题 | 证据 |
|---|---|---|---|
| **P0** | 🔴 | **coding 游标条目从未创建** → finalize 必失败 → 恢复机制全然失效 | §一（实测） |
| **P1** | 🟠 | **normal / tweak 跨会话重进即重开**：Step 0 只认 `draft-*`；Step 2.2 finalize 后目录是正式 `<task_id>` → 重进新建 draft、从 Step 1 重跑 | `normal/SKILL.md:96-108`、`draft-create.ts:80-88` |
| **P2** | 🟠 | **`specify`（及 `sdd` 命令）同样断**：specify Step 0 也只认 `draft-*` → 完整链路跑到 plan 后重进重开 | `specify/SKILL.md:49`、`sdd.md` 链到 specify |
| **P3** | 🟡 | **复杂度检测在命令层**：① **时机错位**——0.4 只凭用户口述的三要素评估，此时**还没读代码库**（技能加载后才读）；② **双处判据**——命令层粗判选通道 vs 技能层 `current_tier` + 双向守门细判，可能互相打脸；③ **结果不落盘** | `flow.md:145-163`（0.4）vs `specify:5.4` / `normal:Step 5` / `tweak:Step 3` |
| **P4** | 🟡 | **flow 选择不持久化**：`:140` 明说「单次会话有效、下次重问」→ 新开会话重进 flow 要重走零步问需求，且**可能选到与在途任务不符的通道** | `flow.md:140` |
| **P5** | 🟠 | **三条通道命令不同级、口径不一致**：`tweak.md`/`normal.md` 是一行薄壳、**不提**零步 → 可独立启动；`sdd.md` 自述「是 flow 0.4 路由到 complex 的**命令别名**」且「**必须先走完 flow 零步**，否则按 H14 阻断」→ **不能独立启动**。同一个族的三个入口，一个是独立命令、一个是 flow 的从属别名 | `tweak.md` / `normal.md` / `sdd.md`（全文）；`flow.md:377`（C03 入口技能 = specify） |

> 关键事实：**H14 的「适用 skill」列明确是 `psfl:flow`（零步）**（`hard-stops.md:21`）——它约束的是 **flow 内部**；
> `tweak.md`/`normal.md` 并未声明该约束，`sdd.md` 的零步依赖是**自加**的。⇒ 「sdd 不能独立启动」是**命令文档层**的设定，**不是** H14 的硬约束。

> P0 是所有恢复问题的**共同前置**；P1/P2/P3/P4 是**结构性**问题。

---

## 四、优化方向（待讨论）

**共同内核**：「通道选择」与「进度」都是**任务的属性**，应当**落盘到游标条目**；命令层不应持有它们。

### 方案 A — 命令层只管「恢复 + 启动」，复杂度下沉到统一入口技能

1. 所有 coding 命令（`flow`/`tweak`/`normal`/`sdd`）第一步统一：`get-active-changes --kind coding`
   - **有在途任务** → 列出让用户选 → 直接加载「该任务当前阶段对应的技能」（**不重问通道**）
   - **无** → 继续启动
2. `flow` **删掉 0.4 复杂度评估**，零步只收集 `需求内容` → 加载**统一入口技能** `specify`，由 specify 读需求 + 探代码 → 判 tier → **分流**到 tweak / normal / 完整链路。
3. 通道选择写入游标条目（新增 `mode` 字段，或复用 `channel`）。

- **张力**：`specify` 目前定位是「完整链路入口」，要它承担**三通道分流**需扩容其定位；且需明确「specify 判 simple 时如何把控制权交给 tweak」的转交协议（normal/tweak 现在是自足单体）。
- **收益**：一处判断、一处落盘、恢复天然可达；`flow` 瘦身。

### 方案 B — 保留三通道独立入口，只补「恢复优先」

1. 三命令（`tweak`/`normal`/`sdd`）薄壳不变；`flow` 保留复杂度评估。
2. `specify`/`tweak`/`normal` 的 Step 0 **增补** `get-active-changes` 检测：命中在途任务 → 询问「续写 / 新建」。

- **张力**：**不解决 P3**（复杂度仍在命令层，仍是用户要去掉的那块）；`flow` 的选择仍不落盘（P4 残留）。
- **收益**：改动最小、风险最低；恢复问题解决。

### 方案 C — 游标承载「通道」，`state next` 统一驱动（最彻底）

1. 游标条目扩 `mode`（`tweak|normal|sdd`），启动时由**入口技能**写入。
2. 命令层退化为「查游标 → 按 `state next` 给出的 `SKILL` 加载」+ 无任务时启动。
3. `state next` 的「入口阶段返回 done」需要扩展为「按 `mode` 给出下一技能」，从而覆盖单体通道内部的中断点。

- **张力**：动 `WorkflowTaskEntry` 字段 → 牵动 Dashboard 契约（`docs/specs/2026-09-18-dashboard-api-contract.md`）与 `task-kind-phases.test.ts` 等断言；单体通道内部（normal Step 3-9）目前**不按阶段推游标**，要支持"精确恢复到 Step N"需重新设计其游标语义。
- **收益**：三条路径收敛到**同一套**游标驱动，恢复语义唯一。

---

## 五、我的建议（供讨论）

分两步走，**先把地基补齐，再谈结构**：

- **第一步（无条件，立刻可做）**：修 **P0** —— 给 `specify`/`tweak`/`normal` 补 `append-active`
  （位置：Step 0 `task-init` 成功之后，`--phase specify`；与 prd/testing/prototype/debug 的既有做法对齐）。
  顺带修 `specify:80` / `normal:110` / `tweak:101` 三处「声称已 append」的文案，让文档与实现一致。
- **第二步（需你先拍方案）**：在 **A / C** 之间选。
  - 若你最在意「**复杂度检测不该在命令层**」→ **A**（判断权交给技能，命令层瘦身）。
  - 若你最在意「**三路径恢复语义统一**」→ **C**（游标承载 `mode`，`state next` 统一驱动），但需接受契约与测试的连带改动。

**不建议只做 B**：它解决不了 P3，你明确指出的「复杂度检测位置不当」会原样保留。

---

## 六、待你裁定的决策点

| 编号 | 决策点 | 选项 |
|---|---|---|
| **D1** | 统一入口是谁 | ① `specify` 扩容为唯一入口 ② 新建 router 技能 ③ 保留 `flow` 命令但把判断交给技能 |
| **D2** | 通道是否落盘到游标 | ① 新增 `mode` 字段 ② 复用 `channel` ③ 不落盘（靠 phase 推） |
| **D3** | 命令层恢复职责 | ① 命令自己查游标并直连阶段技能 ② 命令纯加载技能、由技能查游标 |
| **D4** | `tweak`/`normal`/`sdd` 三命令 | ① 保留（用户已知复杂度的快捷入口）② 收敛为单一 `coding` 入口。**用户主张**：三条通道应各有**可独立启动**的同级命令（simple→tweak / standard→normal / complex→sdd），sdd 必须去掉 flow 零步依赖 |
| **D5** | P0 修复方式 | ① 在三个技能补 `append-active`（推荐）② 改为 `task-init` 自动 append（违背「append 是独立 op」的既有约定） |

> 建议先定 **D5**（地基）与 **D1**（入口），其余三项多数可由这两项推导。
