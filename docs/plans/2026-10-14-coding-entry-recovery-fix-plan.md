# coding 入口与跨会话恢复 — 详细修复方案（v3）

> **状态**：待裁定后落盘。本文件是方案，**未改任何资产、未改任何代码**。  
> **v3 修订**：依用户 2026-10-12 最终确定 —— ① 默认自动评估 ② 评估下沉技能  
> ③ **通道值域 = `tweak | normal | full`**（`sdd` 只是命令名，不再是 `mode` 的取值）  
> ④ **复杂度值域 = `simple | normal | complex`**；映射 `simple→tweak / normal→normal / complex→full`  
> ⑤ 通道落 `state.yaml` 既有 `workflow.mode`；模板默认值 `sdd` → `normal` 由**用户自行修改**  
> ⚠️ 用户正在实时编辑 `state.example.yaml` ⇒ 本方案对该文件**只列清单、不代改**  
> **前序**：`2026-10-14-zh-skills-cross-session-context-review.md`（审计）→ `2026-10-14-coding-entry-recovery-optimization.md`（讨论稿）

---

## 一、裁定 → 落地设计

| 裁定                                   | 落地方式                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| 默认自动评估                               | `flow` 开发类默认走「AI 判档 → 路由」；用户已知复杂度时走三命令直接表达                                   |
| 评估下沉到技能                              | 新建 `coding/intake` 承载「需求预检 + 复杂度评估 + 路由 + 恢复分发」；`flow.md` §0.3/§0.4 迁出       |
| **通道值域 = `tweak \| normal \| full`** | 三值 = 小修改通道 / 常规通道 / 全栈通道。**`sdd` 不再是 `mode` 的取值**（它只是命令名 `/psfl:coding:sdd`） |
| **复杂度 → 通道映射**                       | `simple → tweak`、`normal → normal`、`complex → full`（一一对应）                    |
| 通道落 `state.yaml`                     | **复用既有 `workflow.mode`**（不改游标 entry）                                         |

**通道承载 — 既有机制，非新增**

`state.yaml` 的 `workflow.mode` **已经是**通道的单一开关，且已被消费：

| 位置                                                                | 事实                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/core/config/task-state.ts:169-187`                           | `WorkflowMode` 类型 + `TaskWorkflowState`，注释明说「**mode 是唯一通道开关**，不再按通道拆平行段」 |
| `src/core/config/task-state.ts:382-402`                           | mode 归一化逻辑（`tweak` / `sdd`）                                              |
| `src/dashboard/scan/state.ts:137,190`                             | Dashboard 读 `workflow.mode` → `base.mode` **已在消费**                       |
| `assets/shared/templates/state.example.yaml`                      | 模板默认 `workflow: mode: normal`（**用户已自行改**：注释三档化为 `tweak/normal/full`）     |
| `coding/tweak/SKILL.md:327-328`                                   | 已写 `mode: tweak` ✓ 无需改                                                   |
| `coding/normal/SKILL.md:372`、`normal/policies/tier-gate.md:43,99` | 现写 `mode: sdd` → **待改 `mode: normal`**                                   |
| `coding/specify/SKILL.md`                                         | 现**不写** mode → **待新增 `mode: strict`**                                      |

⇒ **通道不落游标 entry 的 `channel`**（那是 debug 族的 `bugfix\|hotfix` 专用，用于 `get-active-changes` 筛选）。  
coding 走 `state.yaml.workflow.mode` —— **单一源、Dashboard 已可见**。

---

## 二、现状诊断（全部经实测或逐行核实）

| 层      | 缺陷                 | 证据                                                                                                                                                                                                              |
| ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L0** | **游标条目从未创建**（地基空缺） | coding 全族**零 `append-active`**；`update-active`/`rename-active` 缺条目即 **exit 3**（`workflow-entry.ts:150-155`、`:173-178`）。实测：`task-init` 不写 `workflow.yaml`；直接 `task-finalize` → exit 3；补 `append-active` → exit 0 |
| **L1** | 单体通道技能无法跨会话续跑      | `normal:96`、`tweak:87` 只调 `task-init`；existing 判据**仅认 `draft-*` 前缀**（`draft-create.ts:80-88`），而 Step 2.2 finalize 已把目录改名                                                                                        |
| **L2** | 阶段技能不辨通道 → 会错档     | `plan:40` 等只用 `--phase` 筛；单体通道也把 phase 推成 `plan`（`normal:257`、`tweak:284`）→ 敲 `/psfl:coding:plan` **会误接 normal 任务**                                                                                             |
| **L3** | 评估在命令层且不落盘         | `flow.md:122-200`；`:140` 明说「单次会话有效，不持久化」                                                                                                                                                                        |
| **L4** | sdd 不能独立启动         | `assets/zh/commands/coding/sdd.md` 自述「flow 的**命令别名**」+「必须先走 flow 零步（H14）」                                                                                                                                       |
| **L5** | 文档声称已 append，但无实现  | `specify:80` / `normal:110` / `tweak:101` 状态行均写 `workflow: appended entry phase=specify`                                                                                                                        |

**结论**：三条目标当前**全部不通**，根因是**游标地基空缺 + 通道未落盘**，不是恢复逻辑本身。

---

## 三、恢复协议（方案核心 — 一张表定职责）

恢复判据 = **`state.yaml.workflow.mode`（走哪条通道）× 游标 `phase`（走到哪一步）**，两者缺一不可。

> **v4 修订（2026-10-12，用户裁定终稿）**：恢复判据仍为 `mode × phase`，但
> ① 动作由「**阻断 + 提示**」改为「**查表转交**」（同会话加载目标技能，不再要求用户另敲命令）；
> ② **配置归代码** —— 判据的唯一源是阶段表的派生函数
> `src/core/config/task-kind-layout.ts` 的 **`skillForModePhase(kind, phase, mode)`**，
> 由命令 `workflow-entry get-active-changes --format full` 输出到每行的 `skill` 字段。
> ⚠️ **本方案曾短暂用 `assets/zh/policies/coding-recovery-dispatch.md` 承载该表，已删除**（用户否决
> 「用 policy 文件当配置」）。

| 入口 | 判据 | 动作 |
|---|---|---|
| **任意 coding 技能** | `get-active-changes --kind coding`（**不带 `--phase`**）拿全部在途任务 → 读 `mode` + 游标 `phase` 查分发表 | 判定 = **本技能** → 接手，跳到「上下文压缩恢复」表里 `phase` 对应 Step；判定 = **他技能** → **转交**（同会话加载，上限 2 跳） |
| `/psfl:coding:tweak` | 判定 = `tweak`（`mode=tweak` 且 `phase ∈ {specify, plan}`） | decision-point：**A 续写 / B 新建 / C 取消** |
| `/psfl:coding:normal` | 判定 = `normal`（`mode=normal` 且 `phase ∈ {specify, plan}`） | 同上 |
| `/psfl:coding:sdd`（→specify） | 判定 = `specify`（`mode=strict` 且 `phase=specify`） | 同上 |
| `phase = ship` | **一律归 `ship`**（`mode` 不限，交付阶段三通道共用） | `ship` 接手（`mode=tweak` 时另跑产物补齐） |
| `/psfl:flow`（选开发类） | 存在任意 coding 在途任务 | 先问「**继续 X 任务 / 开始新任务**」；继续 → 按分发表转交；新建 → 进 intake 评估 |

**取 mode 的方式**：`get-active-changes --kind coding` 拿到 task_id 列表 → 逐个读 `.polaris/tasks/<id>/state.yaml` 的 `workflow.mode`。  
（技能本来就在读 state.yaml，例如 `plan:64` 读 `worktree.created_by_polaris_flow`。活跃任务通常 1–2 个，可接受。）

---

## 四、修复清单

### F1a（P0｜地基，必改）补齐游标注册 — 3 处

在 `task-init` 返回 `status=ok` 之后插入 `append-active`（**不传 `--channel`**，通道由 state.yaml 承载）：

| 文件                        | 插入位置                                      |
| ------------------------- | ----------------------------------------- |
| `coding/specify/SKILL.md` | Step 1 之后、Step 1.5 状态行前（`:76` 与 `:78` 之间） |
| `coding/normal/SKILL.md`  | Step 0 内、`task-init` 之后（`:99` 之后）         |
| `coding/tweak/SKILL.md`   | Step 0 内、`task-init` 之后（`:90` 之后）         |

```
append-active --kind coding --skill <specify|normal|tweak> --repo-root "$REPO_ROOT" \
  --task-id "$draft_name" --phase specify
```

- `task_id` 用 `draft_name`（finalize 的 `rename-active` 会改成正式名，已实测走通）。
- **只在 `status=ok` 分支执行**；`existing` 分支不动。
- 顺带修正 L5：三处状态行的 `workflow: appended entry phase=specify` 从此名副其实。

### F1b（P1）单体通道恢复检测 — 3 处（与 F1a 同处改造）

`specify` / `normal` / `tweak` 的入口段由「只调 task-init」改**三段式**：

```
1 定位：get-active-changes --kind coding → 逐个读 state.yaml 的 workflow.mode
        筛出 mode == 本技能 的在途任务
2 命中：decision-point  A 续写（沿用现有 task_id）/ B 丢弃并新建 / C 取消
3 未命中：task-init 新建 → append-active（F1a）
```

### F1c（P1.5）各技能 Step 0 查表转交 — 9 处（v4：判据改为调命令）

原写法（`mode ∈ {tweak, normal}` → **阻断**）已**废弃**。现改为 Step 0 调一条命令、只读 `skill` 字段：

```bash
ROWS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind coding --repo-root "$REPO_ROOT" --format full)
```

- 命令输出每行 `task_id` / `phase` / `mode` / **`skill`（= 应执行技能）** / `worktree_path`。
- 候选查询**不带 `--phase`**（**必须覆盖全部在途任务**，否则他阶段任务被误判成「零匹配」）。
- `skill == 本技能` → 接手并跳到恢复表对应 Step；否则 → **转交**（同会话内加载目标技能）。
- 涉及技能：`specify` / `plan` / `design` / `tasks` / `build` / `verify` / `ship` / `tweak` / `normal`。

**v3/v4 修正理由（三处确证缺陷 + 一条裁定）**：

1. `<task_id>` 是分支**输出**，原写法却在取到它之前就用它去读 `state.yaml`（循环定义）。
2. **判据失准（根因）**：`mode` 在通道迁移时**不改写** ⇒ `normal` 升档后 `mode` 仍是 `normal`，任务却要沿
   `design → tasks → build → verify` 走完 ⇒ 原「阻断」会**打断合法链路**；反向亦然 —— `tweak` 升档后
   `normal` 技能按 `mode=normal` 找不到它，会误建新任务。**修法 = 迁移时改写 `mode`**（见 F1d）。
3. **对称性缺失**：三入口写了「取到 id → 跳到恢复表对应 Step」，五阶段没有 ⇒ 即便取到 id 也不知道跳哪一步。
4. **配置归代码**：判据表不进 Markdown（policy 曾被否决），落到阶段表的 `channelSkill` 字段 + 派生函数
   `skillForModePhase`，由命令输出 —— 技能里只留「读 `skill` → 接手 / 转交」。

### F1d（P0｜与 F1c 配套）通道迁移改写 `mode` — 3 处

- `tweak/policies/upgrade-check.md` §3.3：`mode: tweak` → **`mode: normal`**
- `normal/policies/tier-gate.md` §2.3：`mode: normal` → **`mode: strict`**
- `normal/policies/tier-gate.md` §1.3：`mode: normal` → **`mode: tweak`**

`mode` 恒等于「当前通道」，F1c 的分发表才成立；原档由 `workflow.status` +
`upgrade_target` / `downgrade_target` 保留。

### F2（P2）sdd 独立化 — 1 处

`assets/zh/commands/coding/sdd.md` 改为与 tweak/normal 同级的 complex 独立入口：

- 删「flow 别名」与「必须先走 flow 零步（H14）」两段。
- 正文说明完整链路 `specify → plan → design(可选) → tasks → build → verify → ship`。
- **H14 无需改**（`hard-stops.md:21` 的 H14 约束对象是 `psfl:flow`，sdd 的零步依赖是自加的）。

### F3（P3）评估下沉 — 新建 1 技能 + 改 flow ✅ 已落盘

**新建 `assets/zh/skills/coding/intake/SKILL.md`**（备选名 `route` / `assess`；避与 debug 废弃阶段 `triage` 重名）

| Step | 职责                                                                       | 来源                            |
| ---- | ------------------------------------------------------------------------ | ----------------------------- |
| 0    | **恢复分发**：按 §三 表分发（有在途任务时）                                                | 新增                            |
| 1    | **需求预检**：三要素校验 + 强制收集                                                    | 迁自 `flow.md` §0.1/§0.2        |
| 2    | **复杂度评估**：3 档 + 评分 + 强制升档 + 输出格式                                         | 迁自 `flow.md` §0.4（`:145-200`） |
| 3    | **路由**：展示判定 → 用户确认/上调一档 → 加载 tweak/normal/specify **并写 `workflow.mode`** | 迁自 §0.4④（`:181-189`）          |

**改 `flow.md`**：删 §0.3（`:122-143`）与 §0.4（`:145-200`）；第四步开发类三行（`:375-377`）改为先进 `polaris:coding:intake`。

### F4（P4）新增"入口复杂度判定"字段 — 见 §五

---

## 五、新增字段：入口复杂度判定

用户裁定「在 `state.yaml` 中增加需求的复杂度判定值」。

**既有先例（全仓已有同名同义字段）**  
`prd-state.example.yaml:84-86` 与 `prototype-state.example.yaml:84-86` 都写着：

```yaml
    # 复杂度
    # 可选值: simple-简单 | standard-标准 | complex-复杂
    complexity: ""
```

（挂在 `draft.gate` 段下。）`flow.md:147` 的 3 档同为 `simple / standard / complex`。

**口径（用户 2026-10-12 最终确定）**

| 需求复杂度     | 工作流类型（`mode`） | 命令入口                  |
| --------- | ------------- | --------------------- |
| `simple`  | `tweak`       | `/psfl:coding:tweak`  |
| `normal`  | `normal`      | `/psfl:coding:normal` |
| `complex` | `strict`        | `/psfl:coding:sdd`    |

**字段形态**

```yaml
workflow:
  mode: normal
  # 入口复杂度判定（flow / coding:intake 评估产出）
  # 与 workflow.mode 的映射: simple→tweak | normal→normal | complex→full
  # 可选值: simple-简单 | normal-常规 | complex-复杂
  entry_complexity: ""
```

**⚠️ 落点（用户裁定 Q1）= 既有的顶层 `complexity_level`**，**不新增字段**。

- `complexity_level` 现值域 `trivial|standard|critical`（`state.example.yaml:51`），由 specify Step 5.4 写入，并与 `risk_level` 合成 `current_tier`。
- ⇒ 「入口判定」与「specify 细判」**共用同一字段**；值域与两轴 `max` 需一并处理（见下方约束）。

**⚠️ 全仓值域不一致（仅记录，未强改）**：`prd-state.example.yaml:85` / `prototype-state.example.yaml:85` 的 `draft.gate.complexity` 用 `simple | standard | complex`；coding 定为 `simple | normal | complex`。


**⚠️ 与 `mode` 存在信息冗余**：两者由映射表一一对应。保留两份的**唯一理由**是「判定值（AI 判）」与「执行值（可被用户上调一档 / 被升降档改写）」可能不同 —— 须在 intake 技能里写明这条边界，否则就是双写。

### ⚠️ Q1 落地约束（裁定落 `complexity_level` 后浮现，待定子问题）

`complexity_level` **不是独立字段** —— 它与 `risk_level` 构成两轴，由 `current_tier = max(两轴)` 合成  
（`assets/zh/policies/risk-signals.md:4,68`），且档位方向**写死** `critical > standard > trivial`（`:5`）。

⇒ 若 `complexity_level` 改 `simple|normal|complex` 而 `risk_level` 仍 `trivial|standard|critical`，**`max` 无法比较**。

| 选项        | 做法                                                                                                                                                                                                                          | 代价                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **甲（推荐）** | `complexity_level` 改 `simple \| normal \| complex`；`risk_level` / `current_tier` **保持** `trivial \| standard \| critical`；`risk-signals.md` 补一条**两轴序号映射**（simple/trivial=0、normal/standard=1、complex/critical=2），`max` 按序号比 | 两轴值域不同，需一条映射规则                         |
| **乙**     | 两轴值域**都不动**；入口判定**映射**写入 `complexity_level`（`simple→trivial` / `normal→standard` / `complex→critical`）                                                                                                                      | 零结构改动，但字段值不是 `simple\|normal\|complex` |
| **丙**     | 两轴**都**改 `simple \| normal \| complex`（含 `risk_level`、`current_tier`）                                                                                                                                                       | 风险轴用 "simple / complex" 表述别扭           |

**受影响消费点（任选其一后都要同步）**：`risk-signals.md:4-13,63-69`、`specify/SKILL.md:236-242`、  
`verify/SKILL.md:462,480,916`、`plan/SKILL.md:191,201`、`ship/SKILL.md:258`、`state.example.yaml:46-59`。

**待落盘的连带修改**

| 文件                                                         | 改动                                       | 状态                                      |
| ---------------------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| `state.example.yaml`                                       | 加 `workflow.entry_complexity`；mode 注释三档化 | mode 注释**用户已自行改**；`entry_complexity` 待补 |
| `normal/SKILL.md:372`、`normal/policies/tier-gate.md:43,99` | `mode: sdd` → `mode: normal`             | 待落盘                                     |
| `specify/SKILL.md`                                         | **新增**写 `mode: strict`                     | 待落盘                                     |
| `tweak/SKILL.md:328`、`tweak/policies/upgrade-check.md:76`  | `mode: tweak` 已正确                        | 不动                                      |

---

## 六、src 触点：1 处（不是零）

v1 曾需要给 `get-active-changes` 加 `--format full`（把通道放游标 entry）；裁定改回 `state.yaml.workflow.mode` 后，  
**那项不再需要**。但模板默认值由 `sdd` 改为 `normal` 后，暴露**一处真实触点**：

| 位置                                  | 现状                                                                | 为什么要动                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/core/config/task-state.ts:395` | `if (!mode \|\| mode === 'sdd') { workflow.mode = 'tweak'; }`     | 该行语义 = 「**父 mode 还是模板默认值** ⇒ 视为未决策」。模板默认已变 `normal` ⇒ 需补 `\|\| mode === 'normal'`，否则**新任务**走旧格式折叠路径时不会被纠正为 tweak |
| `src/core/config/task-state.ts:401` | `if (!mode) { workflow.mode = 'sdd'; }`                           | 折叠 `normal` 段时写入的默认值，按新口径应为 `'normal'`。**无测试断言**（`task-state.test.ts:200-207` 只断言 tweak 路径）                      |
| `src/core/config/task-state.ts:170` | `WorkflowMode = 'sdd' \| 'tweak' \| 'bugfix' \| 'full' \| string` | 建议收敛为 `'tweak' \| 'normal' \| 'full' \| string`（**纯类型/注释**，无功能影响，因联合已含 `\| string`）                              |

`task-state.test.ts:177,190,197` 的 fixture 用 `mode: sdd` 触发折叠 → **只要 `:395` 保留 `sdd` 判定（只增不删）就仍通过**。

⇒ 其余全部为 `assets/**` 改动（技能 + 命令 + 模板）。

---

## 七、待裁定（剩余 4 项）

| #      | 问题                                                                           | 我的建议                                                        | 状态  |
| ------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | --- |
| **Q1** | 落点：`workflow.entry_complexity` 还是顶层 `complexity`？                            | **`workflow.entry_complexity`**（避与顶层 `complexity_level` 撞名） | 待确认 |
| **Q2** | 评估承载者：新建 `coding/intake`？                                                    | 确认（备选名 `route` / `assess`，避与 debug 废弃 `triage` 重名）          | 待确认 |
| **Q3** | 全仓值域是否统一？（prd/prototype 的 `gate.complexity` 用 `standard`，coding 定为 `normal`） | 暂不统一，各自沿用                                                   | 待确认 |
| **Q4** | 允许动 `task-state.ts:395` 这 1 行吗？（补 `\|\| mode === 'normal'`）                  | 允许，否则新任务的旧格式折叠失效                                            | 待确认 |

**已由你确定，无需再议**：通道值域 `tweak|normal|full`；复杂度值域 `simple|normal|complex`；映射 `simple→tweak / normal→normal / complex→full`；通道落 `state.yaml.workflow.mode`。

---

## 八、执行顺序与验证

1. **批 1（地基）** F1a —— 3 技能补 append（纯 assets）
2. **批 2（恢复）** F1b + F1c + F1d —— 三入口三段式 + 各技能 Step 0 查表转交 + 通道迁移改写 mode
3. **批 3（入口）** F2 —— sdd 独立化
4. **批 4（字段）** F4 —— `workflow.mode` 三档化 + 三入口建任务后**显式写** `workflow.mode`。
   ⚠️ **`entry_complexity` / `req_complexity` 均已作废**：方案 A 决定需求复杂度**复用** `complexity_level`，且用户已删除临时加的 `req_complexity`
5. **批 5（下沉）** F3 —— 新建 intake + flow 瘦身
6. **批 6（收口）** 同步 `docs/architecture/coding-workflow-flows.md`（记忆标注「改流程后须同步」）

**每批后必跑**

- `npx vitest run test/ts/skills-install.test.ts -t "当前 zh 技能资产无跨技能"`
- 端到端冒烟（临时 repo）：`task-init → append-active → task-finalize → get-active-changes → state next` 全链 exit 0

**验收（对应三条目标）**

- 目标 1：`normal` 跑到 Step 4 中断 → 新会话 `/psfl:coding:normal` → 读 `mode=normal` 命中 → 续写 ✓
- 目标 2：同上中断后敲 `/psfl:coding:plan` → 读 `mode=normal` → **被拒并提示正确入口** ✓
- 目标 3：`specify` 完成 → 游标 `phase=plan`、`mode=strict` → `/psfl:coding:plan` 续跑 ✓

---

## 九、附：本方案不改的东西

- **不改 `runDraftCreate` 的 existing 判据**（`draft-create.ts:80-88`，多 kind 共用）。
- **不改 `task-kind-layout.ts` 的相位表**（通道靠 `workflow.mode`，不新增阶段）。
- **不让 `task-init` 自动 append**（「append 是独立 op」是既有约定）。
- **不回填历史在途任务**。
- **不动游标 entry 的 `channel`**（那是 debug 族 `bugfix\|hotfix` 专用）。
