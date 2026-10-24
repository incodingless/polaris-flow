---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks
description: "把已锁定的需求/设计拆解为可执行任务清单 tasks.md（含 TDD 标注）。当用户要求写实施计划、拆解任务、细化 tasks.md 时使用。不要用于：澄清需求（走 specify）、生成提案四件套（走 plan）、写代码（走 build）。"
---

# Polaris 工作流 - 阶段：任务规划（tasks）

<HARD-GATE>
本 skill **仅**负责：以**本档的规划依据**为唯一输入，覆写可执行的 `openspec/changes/<task_id>/tasks.md`，
经校验（`normal` / `strict` 档另加独立主审）后放行 build。

**档位分叉**（读 `state.yaml` 的 `workflow.mode`；本技能是**档位消费者**，**只读不覆盖**）：

| 项 | `strict` | `normal` | `tweak` |
|---|---|---|---|
| 规划依据（Step 2） | 四件套 + `detailed-design.md`（若深化） | 四件套 | 🔻 **仅 `intention.md`** |
| design 状态前置（Step 1） | **必查** | ⛔ **不查**（`design` 不在本档序列） | ⛔ **不查** |
| TDD 策略（Step 3） | 用户决策点 | 用户决策点 | 🔻 **不询问**，按任务类型**自动标注** |
| 独立主审 + Outside Voice（Step 7） | **不可跳过** | **不可跳过** | 🔻 **本档豁免**（**非缺失**，勿补回） |

- **禁止**未完整阅读**本档的规划依据**就开始写计划（禁止凭对话记忆 / 口头一句话 / 只看粗骨架 tasks 拆任务）
- **禁止**未确认 design 状态就开始写计划 —— ⚠️ **仅 `strict` 档适用**：须满足其一——`runtime.design.status=completed` 且 `detailed-design.md` 存在（已深化），或 `runtime.design.status=skipped`（plan 已确认跳过深化）。`normal` / `tweak` 档**没有 design 阶段**，本条不适用
- **禁止**跳过 Superpowers `writing-plans`（不可用则阻断；加载后必须按下方「骨架模式」落地，禁止原样照抄每步贴完整实现代码 / 每任务 commit）
- **禁止**主代理在覆写 `tasks.md` 前未 `read_file templates/tasks-template.md`
- **禁止**另写 `docs/superpowers/plans/*.md` 或 `.polaris/tasks/*/implementation-plan.md` 作为主产物——**唯一**实施计划是 `openspec/changes/<task_id>/tasks.md`（覆写，不是并列第二份）
- **禁止**跳过 `tasks-lint.sh` 或脑补核对
- **禁止**跳过 Step 7 主审：必须派发 `tasks-review-agent`，并注入本 skill 的 `StandardsRoot`（agent 须读完 `policies/` + `references/` 标准文档；禁止主代理自审冒充）—— ⚠️ **仅 `normal` / `strict` 档**；`tweak` 档**本档豁免**（见 Step 7）
- **禁止**跳过 Step 7 Outside Voice **询问**（按 `./policies/outside-voice.md`；用户可选跳过 OV，但不得由 AI 代决）—— ⚠️ 随 Step 7 一并仅在 `normal` / `strict` 档适用
- **禁止**在本阶段编写业务实现代码 / 调用 `/opsx:apply`（那是 build）
- **禁止**借机重写 `proposal.md` / 高层 `design.md` 的范围与架构结论；缺口只进 review 消化或回 design，不在 plan 静默改 Scope
- **禁止**写出规划依据中不存在的需求 / 模块 / 验收场景（YAGNI；多出来的任务 = 失败）
- **禁止**未按 `./policies/decision-point.md` 获得用户对 **TDD 策略**（Step 3）的明确选择，就进入 Step 5 覆写 `tasks.md` —— ⚠️ **仅 `normal` / `strict` 档**（`tweak` 档由档位**自动标注**，不询问）
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]任务规划- 进入阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks 技能。`

## 标识约定

### 规划依据（只读；细计划必须从中推导）

**先看本档读哪些**（"档位 → 读法与强度"是本技能的核心分叉）：

| 档（`workflow.mode`） | 规划依据 |
|---|---|
| `tweak` | 🔻 **仅 `openspec/changes/<task_id>/intention.md`**（**必读全文**）。⚠️ 本档**没有 `plan`** ⇒ 四件套**不存在**，不要去找 |
| `normal` / `strict` | 下表全部 |

| 来源 | 路径 | 提供什么 |
|------|------|----------|
| OpenSpec 四件套 | `openspec/changes/<task_id>/proposal.md` | Why / Scope / 非目标 |
| | `openspec/changes/<task_id>/design.md` | 高层架构与选型 |
| | `openspec/changes/<task_id>/specs/**/*.md` | 需求与验收场景（任务覆盖的主清单） |
| | `openspec/changes/<task_id>/tasks.md` | plan **粗骨架**（结构参考；**不是**范围真理，将被覆写） |
| 深度设计 | `openspec/changes/<task_id>/detailed-design.md` | 实现方案、风险、测试策略、边界、模块/接口细节（**仅 `runtime.design.status=completed` 时存在**；`skipped` 时无此依据，细计划仅由四件套推导） |

冲突裁决：**specs 定「做什么」；detailed-design 定「怎么拆怎么测」（`runtime.design.status=skipped` 时由四件套 `design.md` 推导）；高层 design.md / proposal 定边界。** 粗骨架 tasks 与三者冲突时，以三者为准并覆写 tasks。
`tweak` 档：**`intention.md` 是唯一范围真理** —— 它的「目标 / 任务范围 / 验收场景及标准」即任务覆盖的主清单。

### 其它

- 设计评审（只读，若有）：`openspec/changes/<task_id>/reviews/design-review-report.md`
- **主产物（覆写）**：`openspec/changes/<task_id>/tasks.md`
- 计划主审报告：`openspec/changes/<task_id>/reviews/tasks-review-report.md`（由 Step 7 落盘）
- Outside Voice 报告（若运行）：`openspec/changes/<task_id>/reviews/openspec-review-report.md`
- workflow 游标：`.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.mjs`）
- 运行态：`.polaris/tasks/<task_id>/state.yaml`

> **链路**：`tweak`：`specify → **tasks** → build → verify → ship`（**无 plan / design**）；
> `normal`：`specify → plan → **tasks** → …`；`strict`：`specify → plan → design(可选) → **tasks** → …`。
> 细计划 = f(四件套, detailed-design 若有)；plan 的 tasks 只是输入粗骨架。主审走 `tasks-review-agent`；可选 Outside Voice 走 `openspec-review-agent`。

## 有效 vs 无效（写计划前默念）

| 有效做法 | 无效做法 | 为什么 |
|----------|----------|--------|
| 每步含可复制命令 + 期望失败/成功信号 | 「实现认证」「补边界」 | Agent 会填空猜 |
| 任务边界 = 可独立验收的交付物 | 按层拆（先全写 model 再全写 API） | 中间态不可测、难回滚 |
| 先问清 TDD 策略，再按策略给每条任务标 `<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->` | 不询问就一律 TDD / 一律非 TDD / 到 build 再选 | 计划形态与执行节奏脱节；配置伪 TDD 或逻辑跳 RED |
| 禁止 TBD / TODO /「类似 Task N」 | 占位符计划 | 执行会话零上下文会瞎编 |
| **派 `tasks-review-agent`** 独立主审 | 主代理写完自夸「看起来完整」 | 写计划的人看不见自己的洞 |
| 脚手架/文档折进消费它的任务 | 单独「搭脚手架」无验收 | 无独立可测交付 |
| **Interfaces** 写清 Consumes/Produces | 后任务引用未定义符号 | 跨任务类型漂移 |

---

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：设置产物语言

**执行**：`LANG=$(node "$PLUGIN_ROOT/scripts/get-language-name.mjs")`（输出语言显示名，如 `中文` / `English`）；退出码 `≠ 0` 时回退到当前用户请求语言。

本技能所有提问与产出物均采用 `$LANG`。

每个阶段的"做什么"在对应 policy 文件，本 SKILL.md 仅承载入口、HARD-GATE 锚点与跨阶段衔接。

### Step 1：接收 `intake` 交接

**前置**：根据交接中是否存在 `task_id`（由 `intake` 的 Step 4 给出；阶段出口的自动衔接同样会带），做以下操作：

| 情形 | 动作 |
| ---- | ---- |
| 有 | **采纳**；`worktree_path` 一并取（空 = 主仓；非空 ⇒ 后续读产物 / 跑命令一律以该 worktree 为仓库根）。中断续跑时按文末「上下文压缩恢复」表定位断点 |
| 没有 | **阻断**：告知「本技能须经 `intake` 进入，请从入口技能（`tweak` / `normal` / `strict`）重新开始」。|

**入口校验**（失败 → 阻断；**「适用档」列必看** —— 本技能的每一项校验都带档位条件）：

| 检查 | 适用档 | 条件 |
|------|--------|------|
| 深度设计状态 | **仅 `strict`** | 二选一：`runtime.design.status=completed` 且 `detailed-design.md` 非空（frontmatter 含 `role: technical-design`）；或 `runtime.design.status=skipped`（plan 已确认跳过深化）。⚠️ `normal` 档**虽走 `plan`**，但 `design` **不在其序列** ⇒ 本条**不适用**（也不该存在 `detailed-design.md`） |
| 四件套存在 | **`normal` / `strict`** | `openspec/changes/<task_id>/` 下 `proposal.md`、`design.md`、`tasks.md` 非空，`specs/` 至少一非空文件。⚠️ `tweak` 档**不要求** —— 四件套不在本档序列内（由 `ship` 的 artifact-backfill 事后补齐） |
| 设计评审 | 任意档（**存在才查**） | 若存在 `reviews/design-review-report.md` 且 Verdict=`BLOCK` / 未消化 Critical → 阻断，回 design |
| 已有细计划 | 任意档 | 若 `runtime.tasks.status=completed` 且 `tasks.md` 已细计划 → 询问 A 修订覆写 / B 退出（禁止静默覆盖） |

通过后更新 `state.yaml`：`phase: tasks`，`runtime.tasks.status: in_progress`。

```bash
node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" enter-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase tasks
```
输出：`[polaris-flow 开发]任务规划: task_id=<task_id> ; phase=tasks`

### Step 2：读取规划依据（**按档**）

#### 2.0 准备变更目录（🔻 **仅 `tweak` 档**）

`tweak` 档**没有 `plan`** ⇒ `openspec/changes/<task_id>/` **还没被创建**（`normal` / `strict` 档由 `plan` 的 Step 3.5 建目录并迁入 `intention.md`，本子步**跳过**）。本档在此补做**同一件事**：

```bash
mkdir -p "$REPO_ROOT/openspec/changes/<task_id>/reviews"
mv "$REPO_ROOT/.polaris/tasks/<task_id>/intention.md" \
   "$REPO_ROOT/openspec/changes/<task_id>/intention.md"
```

- 与 `plan` Step 3.5 **同构**：迁入后 `.polaris` 侧**不再保留副本**，避免两份漂移
- 用脚本同步 intention 路径字段（与 `plan` Step 4.5 同构）；`--set` 与上面 `mv` **成对执行，不得只做其一**：

  ```bash
  node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" set \
    --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
    --set runtime.specify.intention_path=openspec/changes/<task_id>/intention.md
  ```

  执行后核对：state 中 `runtime.specify.intention_path` 已为 openspec 新路径。
- 输出：`[polaris-flow 开发]任务规划: intention moved to openspec/changes/<task_id>/intention.md（tweak 档无 plan，本步补建目录）`

#### 2.1 必读全文（勿用摘要替代；读完再进入 Step 3）

| 档 | 必读 |
|----|------|
| **`normal` / `strict`** | ① `openspec/changes/<task_id>/proposal.md`　② `.../design.md`　③ `.../specs/**/*.md`（目录下每个非空 spec）　④ `.../tasks.md`（粗骨架，仅作结构参考）　⑤ `.../detailed-design.md`（**仅 `strict` 且 `runtime.design.status=completed` 时**；`skipped` 时此文件不存在，跳过） |
| **`tweak`** | 🔻 **`openspec/changes/<task_id>/intention.md`**（即 2.0 迁入的那份）—— **必读全文**。它是本档**唯一**范围真理 |

**禁止**凭对话记忆或只读粗骨架 `tasks.md` 开写。读完输出：

`[polaris-flow 开发]任务规划: 规划依据已读 — <本档依据清单>`

#### 2.2 可选只读参考（**存在才读**）

- `openspec/changes/<task_id>/reviews/design-review-report.md`（`strict` 档）
- `openspec/changes/<task_id>/*-design.md`（专项设计，如有；排除四件套 `design.md`）
- `openspec/changes/<task_id>/intention.md`（**`normal` / `strict` 档**：只读参考，冲突以四件套 + `detailed-design` 若有为准）
- `openspec/changes/<task_id>/proposal.md` / `design.md` / `specs/**`（**`tweak` 档**下通常**不存在**；
  若 `ship` 已补齐则**只读**作参考，冲突时**仍以 `intention.md` 为准**）

### Step 3：TDD 策略（**按档**）

🔻 **`tweak` 档：不询问** —— 按任务类型**自动标注**（沿用下表 A 的规则：新功能 / Bug 修复 / 含分支逻辑 →
`<!-- TDD 任务 -->`；配置 / 重命名 / 文档 / 依赖升级 / 纯脚手架 → `<!-- 非 TDD 任务 -->`；无法判断 → **默认 TDD**），
并把 `tdd_policy` 写为 **`prefer_tdd`**（**记录为"档位派生"，非用户选择**），随后**直接进 Step 4**。
**不要**发起 decision-point 询问 —— 「只是选个强度」的询问一律改由档位派生（见 `./policies/auto-transition.md` 同级原则）。

`normal` / `strict` 档：在加载 `writing-plans`、拆任务、覆写 `tasks.md` **之前**，必须按
`./policies/decision-point.md` 暂停，询问本次 change 的 TDD 策略。
**推荐只能说明，不能代选。** 选定前禁止进入 Step 4。

向用户说明：TDD 决定的是 **tasks.md 里每条顶层任务的子步骤形态**（TDD=用例清单 + 5 步 / 非 TDD=3 步），不是 build 阶段再选的全局开关；build 将严格按标注执行。

| 选项 | 写入值 | 含义 | 适用 |
|------|--------|------|------|
| **A**（默认推荐） | `prefer_tdd` | **按任务类型标注**：新功能 / Bug 修复 / 含分支逻辑 → `<!-- TDD 任务 -->`；配置 / 重命名 / 文档 / 依赖升级 / 纯脚手架 → `<!-- 非 TDD 任务 -->`；无法判断 → **默认 TDD** | 大多数标准变更 |
| **B** | `require_tdd` | **从紧**：凡含行为或接口变更的任务一律 TDD；仅纯文档 / 纯文案可标非 TDD | 高风险、核心业务、安全相关 |
| **C** | `prefer_direct` | **从宽**：默认非 TDD（三步）；仅当 `detailed-design` 测试策略点名（若已深化）、或用户在本决策中另行指定的任务标 TDD | hotfix、探索性小改、明确不要求测试覆盖时 |

写入（走脚本，**禁止**直接编辑 `state.yaml`；本处就地落盘是为让**续跑**读得到，Step 9.1 会再写一次，幂等）：

```bash
node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.tasks.tdd_policy=<prefer_tdd|require_tdd|prefer_direct> \
  --set workflow.tdd_mode=<同 tdd_policy 值>
```

- ⚠️ `workflow.tdd_mode` = 全局决策记录（本步为**唯一写点**，与 `runtime.tasks.tdd_policy` 单向同步）；build 及后续阶段**只写不读**，每个 task 是否 TDD 仍由 `tasks.md` HTML 注释决定。

输出：`[polaris-flow 开发]任务规划: tdd_policy=<值>`

**续跑**：若 `runtime.tasks.tdd_policy` 已存在 → **`normal` / `strict` 档**展示当前值并按 decision-point 问是否沿用（沿用跳过改写，不沿用更新后再进 Step 4）；**`tweak` 档直接沿用**（档位派生值，不询问）。

> 用户若要改**个别**任务的 TDD/非 TDD：在本步选 A/B/C 定总策略后，可在 Step 5 覆写前用 decision-point 追加例外清单；例外必须写进 tasks 标注，并在自审中可追溯。禁止留到 build 再改策略。

### Step 4：加载 writing-plans + tasks 模板

#### 4.1 Superpowers `writing-plans`

**立即执行：** 加载 Superpowers `writing-plans`。不可用 → 阻断并提示安装 superpowers。

输出：`[polaris-flow 开发]任务规划 plan: 已加载 writing-plans（将按骨架模式落地）`

**骨架模式（相对原 skill 的强制改写——违反即计划不合格）：**

| writing-plans 原要求 | 本阶段落地 |
|----------------------|------------|
| 每步贴完整实现代码 | **禁止**大段实现代码；子步骤只写「改哪些路径 / 测什么行为 / 跑什么命令」 |
| 每任务 `git commit` | **禁止**（commit 交给 ship） |
| 存 `docs/superpowers/plans/...` | **禁止**；只覆写 `openspec/.../tasks.md` |
| 自审后直接给执行选项 | 自审后必须先经 `tasks-review-agent`（及 OV 询问），再提示进入 build |
| 假设执行者零上下文 | **保留**：路径、命令、期望输出、Interfaces 必须自洽 |
| TDD 五步节奏 | **保留**（当 `tdd_policy` 允许该任务为 TDD 时），映射为 `<!-- TDD 任务 -->` 的 1.x.1–1.x.5；用例清单作为内容块前置，不在子步骤编号内 |
| 配置/文档类 | 映射为 `<!-- 非 TDD 任务 -->` 三步，勿伪造成 RED/GREEN |

骨架模式须服从 Step 3 的 `tdd_policy`：`prefer_direct` 下不得把配置类以外的任务强行全部打成 TDD；`require_tdd` 下不得把含行为变更的任务标成非 TDD。

#### 4.2 强制重读模板

```text
read_file ./templates/tasks-template.md
```

输出：`[polaris-flow plan] 已读取任务模板(tasks-template.md)`

### Step 5：文件地图 → 任务分解 → 覆写 tasks.md

#### 5.1 从规划依据推导（先覆盖，再拆步）

写 checkbox 前必须完成覆盖表（可写在对话中，不必落盘）：

| 依据条目 | 来源节/路径 | 对应将写入的顶层任务 |
|----------|-------------|----------------------|
| 每条 spec requirement / 验收场景 | `specs/` | Task … |
| detailed-design 实现方案中的模块/接口 | `detailed-design.md`（仅 `runtime.design.status=completed`；`skipped` 时跳过此行） | Task … |
| 测试策略与关键边界 | `detailed-design.md`（仅 `runtime.design.status=completed`；`skipped` 时由四件套 `design.md` 推导） | 落在相关 TDD 任务的用例清单 / RED 步或独立验证步 |
| proposal 非目标 | `proposal.md` | **不得**出现对应任务 |

任一 spec 需求或 detailed-design 必做模块（若有）无对应任务 → 先补行，再写 tasks.md。

#### 5.2 文件结构地图

在覆盖表之后，锁定：

- 将创建 / 修改 / 测试的**精确路径**（优先采用 detailed-design 已点名的路径；`skipped` 时以四件套 `design.md` 为准）
- 模块边界与依赖方向（与 detailed-design（若有）+ 高层 design.md 一致）
- 哪些任务 TDD、哪些非 TDD——**必须服从 Step 3 的 `tdd_policy`**（见下表）；用户声明的例外优先于默认规则
- **执行批次**：按依赖拓扑分层（Consumes 为空 → 最早批）+ 文件关联聚类，把顶层任务归入 `## N.` 批次；单批顶层任务 **≤ 8**，超限按依赖序拆成两个连续批次；TDD 任务的用例清单 + 五步**整体归本批、不跨批**

| `tdd_policy` | 标注规则 |
|--------------|----------|
| `prefer_tdd` | 逻辑/API/bugfix → TDD；配置/文档/脚手架 → 非 TDD；无法判断 → **默认 TDD** |
| `require_tdd` | 含行为或接口变更 → **必须 TDD**；仅纯文档/文案 → 非 TDD |
| `prefer_direct` | **默认非 TDD**；仅 detailed-design 测试策略点名（若已深化）或用户例外清单中的任务 → TDD |

#### 5.3 任务粒度

沿用 writing-plans 的 Task Right-Sizing：

- 一个顶层任务 = 带自身验证环、值得独立评审的最小交付
- 脚手架 / 配置 / 文档同步：**折进**需要它的交付任务；禁止无验收的「纯脚手架」顶层任务
- 子步骤：TDD=用例清单 + 5 步 / 非 TDD=3 步（见模板）；每步约 2–5 分钟量级的**一个动作**
- **不要**按 plan 粗骨架原样加细——粗骨架可拆可并，以 specs + detailed-design（若有）覆盖为准
- 单批顶层任务 **≤ 8**：超过就按依赖序拆成两个连续批次，别让一个 subagent 一次扛太多（见 5.2 的「执行批次」）

#### 5.4 每条顶层任务必须含

```markdown
- [ ] N.M {{TASK_NAME}}  <!-- TDD 任务 | 非 TDD 任务 -->

  **Files:**
  - Create / Modify: `exact/path`
  - Test: `exact/test/path`   # 非 TDD 可省略 Test 行，但必须有验证命令

  **Interfaces:**
  - Consumes: [先前任务已产生的符号 / 路径 / 行为——写全签名或约定]
  - Produces: [后续任务依赖的符号 / 路径 / 行为]

  - [ ] N.M.1 ...
  - [ ] N.M.2 ...   # 含可复制命令与期望输出
```

**禁止出现的计划失败标志**（写入即不合格，自审必须清掉）：

- `TBD` / `TODO` / `implement later` / `类似 Task N` / `<placeholder>`
- 「补充适当错误处理」「写测试覆盖上述内容」（无具体路径与命令）
- 引用从未在任何任务 Produces 中出现的类型 / 函数名

#### 5.5 覆写落盘

将完整计划写入（**覆写**）`openspec/changes/<task_id>/tasks.md`。  
`## N.` 的 N 就是**执行批次号**，按依赖拓扑连续编号——这是 build 逐批派发 subagent 的边界。  
最后一组必须是 Documentation Sync（见模板）。  
输出：`[polaris-flow 开发]任务规划: 已写 openspec/changes/<task_id>/tasks.md`

### Step 6：自审 + tasks-lint

#### 6.1 自审（主代理，writing-plans Self-Review）

1. **规划依据覆盖**：`proposal` Scope、每条 `specs` 需求/场景、`detailed-design` 实现模块与测试策略（若已深化）——能否指出对应任务？非目标是否被误写入？缺口列出并补任务。
2. **占位符扫描**：全文搜失败标志，清零。
3. **类型/接口一致**：后任务 Consumes 与前任务 Produces 同名同义。
4. **TDD 标注**：每条顶层任务有且仅有一种 HTML 注释类型；标注与 `runtime.tasks.tdd_policy` + 例外清单一致（`require_tdd` 下不得把行为变更标成非 TDD；`prefer_direct` 下不得无依据地把任务全打成 TDD）。
5. **用例清单覆盖**：每个 TDD 任务含 6 大类场景的用例清单（内容块，按 `./references/test-case-checklist.md`），枚举维度与被测对象类型匹配（纯函数至少 正常/边界/异常）；P0 覆盖全部核心路径与核心异常。

#### 6.2 脚本校验（禁止脑补）

```bash
LINT_RESULT=$(node "$PLUGIN_ROOT/scripts/tasks-lint.mjs" "openspec/changes/$task_id/tasks.md")
LINT_EXIT=$?
```

- exit 0 → 通过
- exit 1 → **阻断**，输出 `$LINT_RESULT`，修正后重跑本步

### Step 7：独立主审 — `tasks-review-agent`（阻塞点 · **仅 `normal` / `strict` 档**）

> 🔻 **`tweak` 档：本档豁免（非缺失，审计勿补回）** —— 简单改动的 `tasks.md` 由 `intention.md` 直接推导、
> 内容极简，独立主审的代价大于收益。
> **本档跳过 Step 7 全部**（含 7.2 Outside Voice），**直接进 Step 8**（无评审结论可消化 → 直接进 Step 9）。
> 本档的 `tasks.md` 质量由 **6.1 自审 + 6.2 `tasks-lint.sh` + Step 5 的任务定稿确认**三道保证。
> 豁免依据见 `HARD-GATE` 的档位分叉表。

本步**只负责派发**主审 subagent；评审标准在 `tasks-review-agent` 内。**禁止**主代理用「自检清单」冒充。

#### 7.1 主审

1. **能力**：读 SessionStart 注入（`SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION`；全量清单在 `$SUBAGENT_PROBE_CACHE`，勿假定 additionalContext 含 agents）。
   - `PLATFORM_DEGRADATION=inline|unsupported` → **阻断**（计划无独立主审不得进 build；与 design 可跳过主审不同）。不得 inline 假评审。**不派发 → 不涉及 probe**。
   - `SUPPORTS_SUBAGENT=true`（degradation 空）→ **仍须 probe（H10）**：调用 `polaris{{SKN_SPR}}subagent-probe`（传 `platform`），随后进 Step 7.1.2 派发固定 `tasks-review-agent`。
   - **缺注入** → 调用 `polaris{{SKN_SPR}}subagent-probe`（传入 `platform`；**优先读** `$SUBAGENT_PROBE_CACHE`，勿重复扫盘）。`inline` / `unsupported` → 同上阻断。
2. **解析 StandardsRoot**：本 skill 安装根目录（含 `policies/`、`references/`、`prompts/`）。例：`$PLUGIN_ROOT/tasks`（nested）或项目 skills 下的 `polaris{{SKN_SPR}}flow{{SKN_SPR}}tasks`（flat）。目录缺失 → 阻断，提示 `polaris init/update`。
3. **派发**：注册名 / `subagent_type` = `tasks-review-agent`（init 已装到 `.<platform>/agents/`）。文件缺失 → 阻断。

   调用 `use_skill("polaris{{SKN_SPR}}subagent-dispatch")` 执行派发（D-0 工具判定 → D-1 路径引用型 / D-2 内容注入型，见该技能 `references/dispatch-execute.md`）。传入 `platform`、`agent`（probe 结果中 `id=tasks-review-agent` 的项）、`task_spec`：

   - `task_type`: `doc_review`
   - `task_description`:
     ```text
     tdd_policy: <prefer_tdd|require_tdd|prefer_direct>
     StandardsRoot: <本 skill 安装绝对或仓库相对根路径>
     ```
   - `materials`（按以下顺序构造）：
     1. `./policies/scope-challenge.md`
     2. `./policies/four-section-review.md`
     3. `./references/engineering-mindset.md`
     4. `./references/test-review-methodology.md`
     5. `./references/test-case-checklist.md`
     6. `./templates/review-report-template.md`
     7. `openspec/changes/<task_id>/tasks.md`
     8. `openspec/changes/<task_id>/proposal.md`
     9. `openspec/changes/<task_id>/design.md`
     10. `openspec/changes/<task_id>/specs/**/*.md`（每个非空文件）
     11. 若有（`runtime.design.status=completed`）：`openspec/changes/<task_id>/detailed-design.md`
     12. 若有：`openspec/changes/<task_id>/reviews/design-review-report.md`
     13. 若有：`openspec/changes/<task_id>/*-design.md`（专项设计；排除四件套 `design.md`）
     14. 若有：`openspec/changes/<task_id>/intention.md`
   - `constraints`:
     - `output_path: openspec/changes/<task_id>/reviews/tasks-review-report.md`（报告写入该文件后只回报路径）
     - 只评审，**禁止**修改任何文件
   - `language`: 跟随主会话语言

4. **落盘**：确保 `openspec/changes/<task_id>/reviews/` 存在；将完整 **Plan Review Report** 写入 `openspec/changes/<task_id>/reviews/tasks-review-report.md`。

输出：`[polaris-flow 开发]任务规划: tasks-review-agent 已完成，报告已落盘`

#### 7.2 Outside Voice（询问后可选）

1. `read_file` `./policies/outside-voice.md` 并按其执行。
2. 按复杂度给出建议，decision-point：**A 启动** / **B 跳过**（AI 不得代决）。
3. 用户选 A → 填充本 skill 的 `prompts/main-review-summary.tmpl.md`，派发 `openspec-review-agent`。

   调用 `use_skill("polaris{{SKN_SPR}}subagent-dispatch")` 执行派发（D-0 判定 → D-1 路径引用型 / D-2 内容注入型，见该技能 `references/dispatch-execute.md`）。传入 `platform`、`agent`（probe 结果中 `id=openspec-review-agent` 的项）、`task_spec`：

   - `task_type`: `doc_review`
   - `task_description`: 填充后的 `prompts/main-review-summary.tmpl.md`（`Change` / `Stage` / `PrimaryReport` + 主审 findings 五类摘录；摘录从刚落盘的 `tasks-review-report.md` 提取，**不含**用户对 findings 的采纳决策）
   - `materials`:
     1. `openspec/changes/<task_id>/proposal.md`
     2. `openspec/changes/<task_id>/design.md`
     3. `openspec/changes/<task_id>/specs/**/*.md`（每个非空文件）
     4. `openspec/changes/<task_id>/tasks.md`
     5. 若有（`runtime.design.status=completed`）：`openspec/changes/<task_id>/detailed-design.md`
   - `constraints`:
     - `output_path: openspec/changes/<task_id>/reviews/openspec-review-report.md`（报告写入该文件后只回报路径）
     - 只评审，**禁止**修改任何文件；挑战标准在 `openspec-review-agent` 定义内（frontmatter 已载入）
   - `language`: 跟随主会话语言

4. 通过可信度门禁后写入 `openspec/changes/<task_id>/reviews/openspec-review-report.md`。
5. 宿主无 subagent 时主审已在 6.1 阻断，不会到达本步的「无 subagent 自动跳过 OV」。

### Step 8：消化评审结论（**仅 `normal` / `strict` 档**）

> 🔻 `tweak` 档无评审报告（Step 7 已豁免）⇒ **直接进 Step 9**，本步不执行。

读取 `reviews/tasks-review-report.md` 的 **STATUS**：

| STATUS | 处理 |
|--------|------|
| `DONE` | 处理 OV（若有）后进 Step 9 |
| `DONE_WITH_CONCERNS` | decision-point 逐条决策；需改 tasks → 改写 → 5.2 lint →（触及测试/依赖）重跑 Step 7.1，再询 OV |
| `BLOCKED` / `NEEDS_CONTEXT` | **禁止**进 Step 9。按 Failure modes / 测试缺口改 `tasks.md` → 5.2 → **必须重跑 6.1**（最多 3 轮；第 3 轮仍 BLOCKED → 升级用户：回 design 或缩 Scope） |

报告中「建议加入 tasks 的测试缺口」：**由本 skill 写入 `tasks.md`**，再 lint；TDD/非 TDD 仍服从 `tdd_policy`。

若有 OV：与主审 tension / P0/P1 按 outside-voice 用户主权逐条决策；**禁止**自动改 tasks。

未消化的 Critical / Important → 不得标记 plan 完成。

### Step 9：完成 tasks 阶段

#### 9.0 🔻 `tweak` 档专属：`tasks.md` 定稿确认（阻塞点）

本档**没有独立主审**（Step 7 豁免）⇒ 那道确认由**人**承担。覆写完成后、推进阶段前，按
`./policies/decision-point.md` 暂停，展示 `tasks.md` 的**关键节**（任务清单 + 每条的 Files / 验证命令），
请用户确认「范围与动作是不是就是要做的」：

| 用户回复 | 判定 | 后续 |
|---|---|---|
| 明确确认 | 完成 | 进入 9.1 |
| 仅对某条反馈 | **不算确认** | 改写 → 重跑 6.2 `tasks-lint.sh` → **重新确认** |
| 模糊回复 / 沉默 | **不算确认** | 必须再问一次明确确认 |

> `normal` / `strict` 档**不加**此步 —— 那道确认由 Step 7 的独立主审 + Step 8 的 findings 消化承担。

#### 9.1 落盘与推进

更新 `state.yaml`：

```bash
node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase tasks --next-phase build
node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.tasks.status=completed \
  --set runtime.tasks.tdd_policy=<prefer_tdd|require_tdd|prefer_direct> \
  --set workflow.tdd_mode=<同 tdd_policy 值> \
  --set runtime.tasks.tasks_path=openspec/changes/<task_id>/tasks.md \
  --set runtime.tasks.review_report=openspec/changes/<task_id>/reviews/tasks-review-report.md \
  --set runtime.tasks.plan_review_status=<completed|skipped:<reason>> \
  --set "runtime.tasks.outside_voice=<ran|skipped:<reason>>" \
  --set runtime.tasks.outside_voice_report=openspec/changes/<task_id>/reviews/openspec-review-report.md
```

- ⚠️ `outside_voice` 与 `outside_voice_report` **成对写入**（与 plan Step 6 / design Step 5 同构）：`outside_voice=ran` 时 report 必须为实际报告路径，不得留空。
- ⚠️ **`tweak` 档**：`review_report` 写 `—`、`plan_review_status` 写 `skipped:tweak 档豁免独立主审`、`outside_voice` 写 `skipped:tweak 档豁免独立主审`、`outside_voice_report` 写 `—`（Step 7 本档豁免）；
  `STATUS` 恒为 `DONE`（无评审结论）。

输出：

```
任务规划阶段完成：
  task_id     : <task_id>
  tdd_policy    : <prefer_tdd|require_tdd|prefer_direct>（tweak 档=prefer_tdd，档位派生）
  tasks.md      : openspec/changes/<task_id>/tasks.md（已覆写）
  review-report : openspec/changes/<task_id>/reviews/tasks-review-report.md（tweak 档：—）
  outside-voice : <ran | skipped:...>（tweak 档：skipped:tweak 档豁免独立主审）
  STATUS        : <DONE | DONE_WITH_CONCERNS>
```

执行方式：按 `tasks.md` 由 implementer 执行 `/opsx:apply`。

输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**，`NEXT` 取 manual/auto 对应一套）。
先按「自动衔接下一阶段」一节运行 `state next`，`<SKILL>` 与 `<mode>` 均取自其输出，**不得写死**。
本技能填写的状态行与「恢复」行（「下一步」「操作」两行以模板为准，不在此复制）：

```text
[polaris-flow 开发]任务规划 - 阶段完成，状态已落盘。
恢复：先读 openspec/changes/<task_id>/tasks.md、reviews/tasks-review-report.md 与 .polaris/tasks/<task_id>/state.yaml 的 runtime.tasks，再从下一步技能的 Step 0 开始。
```

## 退出条件

- `runtime.tasks.tdd_policy` 已确定：**`normal` / `strict` 档** = 用户明确选择（Step 3）；**`tweak` 档** = 档位派生
- `tasks.md` 已按模板覆写，含与 `tdd_policy` 一致的 TDD/非TDD 标注、Files、Interfaces、可复制验证命令
- `tasks-lint.sh` exit 0
- **`normal` / `strict` 档**：`tasks-review-agent` 已跑完且 STATUS 为 `DONE` 或用户已消化完的 `DONE_WITH_CONCERNS`
- **`normal` / `strict` 档**：Outside Voice 已询问并完成（ran / 用户跳过）
- **`tweak` 档**：Step 7 / 8 **豁免**（不得据此判为"退出条件未满足"）
- `phase=build`

## 上下文压缩恢复

重载：`task_id`、`workflow.mode`、`runtime.tasks.tdd_policy`、`detailed-design.md`（`strict` 档若有）、
当前 `tasks.md`、`reviews/tasks-review-report.md`（`normal` / `strict` 档）、
`reviews/openspec-review-report.md`（若有）、本 skill 停在哪一步。
- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 **Step 2.0 未迁入**（`tweak` 档）→ 先补齐目录与 `intention.md` 迁入，再读依据
- 停在 **Step 3 未选定**（`normal` / `strict` 档）→ 先完成 TDD 策略再写 tasks；`tweak` 档沿用档位派生值，不询问
- 停在 **`runtime.tasks.status=in_progress` 且 tasks 已写未评审** → `normal` / `strict` 档从 Step 6.2 / Step 7 续；`tweak` 档跳过 Step 7 直接从 Step 9 续。勿无故重写全部任务（除非用户要求改 `tdd_policy`，则须重跑 Step 3→4）。
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```
