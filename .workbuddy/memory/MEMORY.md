# Polaris Flow — 项目长期记忆

## 资产分发
- **命令落盘**：nested → `<ctx>/commands/psfl/<相对路径>`（命令名 `/psfl:<路径，/→:>`）；flat → `<ctx>/commands/psfl-<路径，/→->.md`。**文件名/路径即命令名**。
- ⚠️ 命令前缀常量 `POLARIS_COMMAND_PREFIX='psfl'`（`core/config/polaris-constants.ts`）**与技能插件名 `POLARIS_PLUGIN_NAME='polaris'` 刻意解耦** —— 改命令前缀必须先拆分，否则技能目录连带改名。消费点：`install/commands.ts`、`install/layout.ts`、`update/prune.ts`。
- **技能落盘**：`<ctx>/skills/polaris/...`（nested）或 `<ctx>/skills/polaris-<族>-<技能>`（flat）。`{{SKN_SPR}}`/`{{CMD_SPR}}` → nested `:`、flat `-`。
- 平台：claude（技能+命令皆 nested）、cursor（命令 flat）、trae/trae-cn（技能 flat）、qoder。`init` 默认 `en`，但 `assets/en/skills/` 为空 → 验证必须 `--lang zh`。

## 技能资产（`assets/zh/skills/`）
- 族：coding 11（build/design/intake/normal/plan/retro/ship/specify/tasks/tweak/verify）、prd 7、testing 6、prototype 4、debug 3，另 constitution/、subagent-dispatch/、subagent-probe/、maintance/codereview/。
- ⚠️ 测试族固定 `testing`（不可改 `test`，与根 `test/` 冲突）；族名在 `layout.ts` 与 `install/skills.ts` 的 `SKILL_FAMILIES` 同步注册。写路由表前先 `ls` 核对。
- 不安装 `assets/zh/skills/requirements-engineering/`；测试用例命令定名 `create-testcase`（勿改）。

## 阶段（唯一存放处 = 任务自己的 `state.yaml` 顶层 `phase`）
- 权威源 `src/core/config/task-kind-layout.ts`。coding：specify(澄清)→plan(提案)→design(可选)→tasks→build→verify→ship(终点)，旁路 **retro**；requirement/testcase `discovery→draft→refine→ship`；prototype `blueprint→build→review(不落)→ship`；debug `diagnose→patch→closeout`（**无 build**；`triage` 勿再写）。
- 🔴 **0.1.2 落地**：`.polaris/workflow.yaml` 条目**不含 `phase`**，只剩 `task_id / worktree_path / started_at / channel?`（= 有哪些在途任务 + 在哪）。读位置由 `worktree_path` 决定（空=主仓；非空=worktree 内同名路径），唯一入口 **`resolveTaskStatePath()`**（`core/assets/polaris-paths.ts`）。
- `phase` 语义 = **「接下来要执行的阶段」**；`idle` **仅**任务初始化。出口写下一阶段（specify→plan、plan→design|tasks、design→tasks、tasks→build、build→verify、verify→ship、ship→ship、入口技能出口→ship；升降档写目标阶段）。
- 写入**只走 `task-state-entry`**（`enter-phase` / `complete-phase --next-phase`）：`update-active` 只剩 `--set worktree-path=`，`--set phase=`/`--force-phase`/`append-active --phase=` 已删；`checkPhaseWrite` 只挂 task-state-entry。表外阶段拒（exit 3）。
- ⚠️ 勿回退：`tweak`/`normal` 曾把**内部进度** `build` 写进顶层 `phase` → 会让 `skillForModePhase` 把 normal 任务转交 `build` 技能。修法 = 删那两处；进行中的事实归 `runtime.<阶段>.status`。
- ⚠️ **通道覆盖只登记 2 个阶段**：`channelSkill:{tweak:'tweak',normal:'normal'}` 只在 **specify / plan**。因此通道技能**必须**只走 `specify→plan→ship`（实测 tweak 写 `specify`(建) / `plan`(§4.1) / `ship`(§7)，normal 同）；若写了 `tasks`/`build`/`verify`，恢复分发会交给同名**节点技能**（隐式约定，代码无护栏）。
- 🟢 `--format full` 每行 = `task_id / worktree_path / state_path / phase / phase_label / mode / mode_label / skill / skill_label / state_readable`（phase+mode 同出 state.yaml）。`*_label` 由 `phaseLabel`/`modeLabel`/`skillLabel` 从**既有阶段表+工作流表**派生（不新增映射表），取不到→空串。
  ⚠️ `state_readable=false`（或 `phase` 空）**必须阻断**，不得当成「零个」新建。
- 🟢 `append-active` **幂等**：同 `task_id` 已存在 → 视为成功且不改动已有条目。

## 恢复分发与入口（coding）
- 🟢 **`task-entry` 原语（用户裁定 B：`mode` 是入参，不是技能自证）**：`polaris-flow task-entry --kind coding --as <族内技能> --mode <tweak|normal|full>` → 一行 JSON。
  **六出口**：`resume`（`skill==--as`）/ `handover`（`skill` 非空且 ≠ `--as`）/ `create`（零候选；一步建目录+写 `workflow.mode`+幂等注册）/ `select`（多个，只列候选，带 `--task-id` 重跑）/ `resolve-drafts`（磁盘有未注册 draft 残留）/ `block`（读不到 state、`phase` 空、`skill=null`）。
  ⚠️ `--mode` **只在 `create` 时写入**；判定一律用任务自己 state 的 `mode`。⚠️ **不删任何东西**（破坏性/需裁决分支在 policy §5）。⚠️ 只读场景（`intake` 恢复分发）用 `get-active-changes`，**别调它**（零候选会建任务）。
- 🟢 共享 policy `assets/zh/policies/task-entry.md`：coding **三入口**共用（§1 取结论 / §2 action 表 / §3 select 候选格式 / §4 状态行 / §5 孤儿 draft A/B/C/D + 「丢弃并新建」）。开头已标「仅 coding 三入口适用」（顶层 policies 会注入**所有族**叶技能）。
- 🟢 **薄编排形态**：tweak Step 0 已落地（**154 → 23 行** = 引用 policy + 一条命令 + 按 `action` 分派 + 本档固定 `mode`）。⏳ `normal` / `specify` **未改造**。
- 判据表在代码里：`KindPhaseDef.channelSkill` + **`skillForModePhase(kind, phase, mode)`**（服务恢复分发；入口阶段返回**同名技能** + mode 覆盖，旁路 retro → `null`）。与 `skillForPhase` 分工勿混（后者服务出口 `state next`，**入口阶段返回 `null`**）。
- 10 个 coding 技能 Step 0 只调 `get-active-changes --format full` 读 `skill`。**候选查询不得带 `--phase`**（该参数按 state 过滤，prd/testing/prototype/debug 四族 10 处在用）；候选显示 `中文(英文)`。
- 🟢 **两层模型（入口技能）**：第一层只**选任务**（枚举游标：零个/唯一/多个；多个让用户选 1 个；**不做**阶段判定与丢弃新建）→ 零个走创建流程（`task-init`，draft 残留 A/B/C/D 降为其中的一步；`get-active-changes` 返回空 **≠** 没有在途任务）→ **注册无条件执行**；第二层**判阶段**：顺序固定「① 读得到吗 → ② 是不是本技能」→ 接手 / 转交（同会话加载，不建任务）/ 阻断。
  「丢弃并新建」只在第二层，标签用**字面词**（续写/丢弃并新建/取消），**不用 A/B/C**（会与创建流程 A/B/C/D 撞）。丢弃 = `delete-active` + `rm -rf .polaris/tasks/<id>`；⚠️ `worktree_path` 非空 → **阻断**（无「丢弃式拆除 worktree」脚本，不得自行 `git worktree remove`）。
- 🔴 曾存在的真缺陷（已修，勿回退）：`existing` 分支 adopt 一个**游标里没有**的 draft 却跳过注册 ⇒ 永远进不了游标 + `finalize`/`rename-active` exit 3 + 每次重进再问一遍。修法 = `append-active` 幂等 + 注册/工作流写入**无条件执行**。
- 中段技能（plan/build/design/tasks/verify/ship）+ `intake` 的 Step 0 同构：零个 → 阻断（不建任务）；唯一/多个 → 上表三出口。
- ⚠️ `--skill` 已由 `requiredOption` 降为 `option`（只读不需；写 op 仍校验 → exit 3）。coding 的 `getTaskKindStatePath(root,'coding',id)` == `getTaskStatePath`。
- **工作流迁移必须改写 `mode`**：tweak 升→`normal`、normal 升→`full`、normal 降→`tweak`。
- 入口事实：`/psfl:coding:tweak|normal|sdd` 三个命令**无参数**（只回答加载哪个技能）；`specify` **没有**同名命令（入口叫 `sdd`）。`intake` 唯一显式入口 = `/psfl:flow` 开发类项；它判出的档位**只用于选技能，不落盘**（`mode` 仍由被加载的技能写）。

## 用户约定
- **配置归代码**：用户明确否决「用 policy 承载配置 / 映射表」→ 优先扩充 `src/core/config/*` 既有表 + 派生函数 + 命令输出。
- **术语（2026-10-13 裁定）：`workflow.mode` 的中文名 = 「工作流」**（已统一 26 文件）。⚠️ 两个「通道」不是这个概念，勿一起改：① debug 族的 `channel`；② SonarQube 的「探测通道」。⚠️ `docs/**` 仍有 mode 语义的「通道」（`coding-workflow-flows.md` 等），随该文档同步时一并改。
- **候选呈现格式（用户手定）**：单行 `<task_id> (工作流：<mode_label>(<mode>)，阶段：<phase_label>(<phase>)，技能：<skill_label>(<skill>))`；中文取不到只显英文。
- **产物说明理由用 `<!-- -->` 注释降级**；⚠️ 注释**不减 AI 上下文**（SKILL.md 原文加载），想省 token 必须真删。

## 安装注入机制（改引用前必查）
- `assets/zh/policies/*` 注入每个叶技能 `policies/`（subagent-probe/dispatch 除外）→ 策略唯一源放顶层；**禁跨技能相对路径**（`../x/...`）；包级 `assets/zh/templates/` 只落 `skills/polaris/templates/`。
- ⚠️ **占位符只在 skills / commands 域展开**（`applySkillNamePrefix` 只被 `install/skills.ts`、`install/commands.ts` 调用），且 **`skills.ts` 只替换 `{{SKN_SPR}}`** —— 技能资产**无法引用命令名**，指路一律用技能名。
- **agent 正文禁用占位符**（`install/agents.ts` 只改 frontmatter tools/model）。
- **命令不能引用 `./policies/`**（插件根无 policies）→ 需发问时内联精简注册表。`assets/**/README.md` 不入仓也不安装。

## 值域约定（2026-10-12 裁定，勿再动）
- 分级档位 `complexity_level` / `risk_level` / `current_tier` = **`trivial | standard | critical`**，方向 `critical > standard > trivial`（唯一源 `assets/zh/policies/risk-signals.md:5`）；**代码已写死，用户明确不改**；`simple|normal|complex` 无落点。
- `state.yaml.workflow.mode` = **`tweak | normal | full`**（Dashboard 已消费）；`sdd` 只是命令名。
- ⚠️ **`state.example.yaml` 的 diff 长期混有用户手改** ⇒ **回退绝不能用 `git checkout`**，只能定点 Edit。

## Hook 与平台
- 只有 1 个 hook：SessionStart；资产 `assets/shared/hooks/`，模板 `assets/shared/hooks.json`，逻辑 `src/commands/hooks/`；落盘 `src/core/install/hooks.ts`（claude/cursor→settings*.json、trae→hooks.json、trae-cn→`~/.trae-cn/hooks.json`、qoder 不支持）。⚠️ `hookFormat` 与平台 id **不同名**（trae→`claude-code`、trae-cn→`trae`）。**不是 hook**：`constitution-validity.sh`、`scorers/*.sh`。
- 平台仅 claude/cursor/trae/trae-cn/qoder（**代码里无 codebuddy**；`qoder` 是受支持平台，别误删）。

## 发问与命令资产约定
- **禁在 SKILL 写死 `AskUserQuestion`**；按 config `platform` 查注册表；单次选项上限 4/5。
- 让用户选择须给「判定规则」表，区分**明确选择**与不算选择。multi-turn 询问类命令：每轮各占一级标题 + 完整可复制 payload + 「执行状态」小节；HARD-STOP 禁跳步。
- 路由型命令在「选完做什么」与「加载技能」间插入**上下文收集步骤**。

## 阻塞点审计（唯一源 = `zh-skills-blocking-points-review.md`）
- 34 技能 / 578 条阻塞点、四档判定、17 条核验清单 → 见报告。
- ⚠️ **未裁定**：`coding/verify:329` 基线口径 A vs B（勿单方改）；`deepread` 死功能。
- **已落盘（勿回退）**：H10 **硬约束、无跳过分支**（degradation/inline = 不派发 → 不涉及 probe）；H12 只管 workflow.yaml 加锁/写后校验；H11 限 `coding:ship`；`artifact-backfill.md` 保持两份副本（tweak §2 / ship §3）；`constitution-audit.md` 已迁共享 policy；`debug/*/references/artifacts.md` 保持 3 份；`ezfl` 全仓清零。
- ✅ `assets/zh/adapters/hook-registration.md` 已对齐 `install/hooks.ts` + `platforms.ts`（本就无 `codebuddy`）。

## 已知陈旧项
- ✅ `codebuddy` 已清零；`qoder` 不是残留。✅ `commands/maintance/hotfix.md` 是正式正文（非死链桩）。✅ `skills/README.md` 陈旧引用已不成立。
- 🟡 安装类测试 timeout 债：调 `installPolarisForPlatform` / `copyPolarisSkillsForPlatform` 的用例需 `{ timeout: 60_000 }`；**本机高负载时全量测试大量 timeout（非断言失败），单跑即过**。
- 🟡 `src/core` 有存量 prettier/eslint 未过文件，提交前别被 CI 误伤。
- 🟡 `docs/architecture/prd-workflow-flows.md` §8 登记 **12 项未修**不一致（2 条高危：draft 产物路径、索引名不一致）→ **改 draft/refine 前先读该节**。
- ⏳ `docs/architecture/coding-workflow-flows.md` **欠一次同步**（流程已变；内含大量「通道」需改「工作流」）。权威源 = `task-kind-layout.ts` 的 `kind:'coding'` + 各 SKILL.md。

## 工具环境坑
- 本机 BSD grep **不支持 `\|` 交替**（静默假阴性）→ 一律用 Grep 工具；`rg` 不在 PATH。
- 大范围审计可并行 subagent 分族深读，但**必须逐条回验**。
- ⚠️ 用户会用 **Typora** 打开 docs 下 md：外部变更后会**静默覆盖 AI 写入**。写前 `lsof` 查占用；写后复查 size/mtime 稳定。

## 流程约定
- 双语言：技能先写中文，用户确认后再同步英文；**中英文未同步前不写 Changelog**。
- `task-init` 只建目录 + `state.yaml`，**不写 workflow 游标**（`append-active` 是独立 op）。
- 落盘：测试族一律 `$REPO_ROOT/.polaris/testcases/<task_id>/`。
