# 项目长期约定：polaris-flow 技能集

## 开发类链路三档（P01/P02/P03）

定义于 `assets/zh/commands/polaris-flow.md`，是开发类需求的正式分档：

| 档位 | 链路 | 特征 |
|---|---|---|
| P01 简单 | tweak（单入口 4 步）→ ship | 单模块、单文件级改动、无跨模块设计、风险低 |
| P02 常规 | normal（单入口 10 步）→ ship | 多模块协作，需规格契约，≤8 顶层任务 |
| P03 复杂 | specify → plan → design(可选) → **tasks** → build → verify → ship + retro | 跨服务/高风险，含专项设计与交付复盘 |

- 产物：P01 为 `change-brief.md` + `tasks.md`（ship 归档前补齐四件套）；P02 为 OpenSpec 四件套 + `intention.md`（design.md 常规深度：架构决策+模块划分+模块间接口契约+数据流，**不产** detailed-design）；P03 为四件套（+ `detailed-design.md` + 专项设计，**design 可选**：plan 完成时询问是否深化，跳过则 `design.status=skipped` 直接进 tasks，无 detailed-design/专项设计）
- 档位由入口用户选择；执行中三档可互转：tweak 升档信号 U1–U8 → normal（brief 映射转 intention）；normal 双向守门（规格定稿后、细计划前）降档门 D1′–D4′ → tweak（**保留四件套**）、升档门 D1–D7 → design（转交零成本）
- P02 评审压缩为 1 次合并主审（复用 `plan-reviewer`，对象=四件套+终版细计划+intention），无 OV、无 design 独立主审；确认预算 ~5 次；tasks 一次写成终版细计划（无 tasks 阶段覆写）
- P01/P02 的 TDD 策略均为**按任务性质自动判定**（`tdd_mode: auto_by_task_type`）：新功能/Bug修复/含分支 → TDD，配置/重命名/文档/依赖升级 → 非 TDD，无法判定 → 默认 TDD。不询问用户（Constitution 里 Test-First 是 NON-NEGOTIABLE，全局 prefer_direct 会撞 Critical）

## 8 阶段重构蓝图（gstack 思路，进行中）

目标链（P03）：`specify → plan(含可选 design) → tasks → build → review → test(可选) → ship → retro(可选)`

- [x] ① design 可选化（propose 内衔接，`design.status=skipped`，已完成）
- [ ] ② verify → review 职责切分
- [ ] ③ 新增 test 阶段（接口测试 / E2E）
- [ ] ④ P01/P02 同步改造

### ② verify→review（倾向方案 A：全替换）
- review 职责 = 单测覆盖率 + 代码质量 + 意图一致性（proposal/specs vs 实际实现）
- Constitution 审计 + 5 个 scorer 改为 review 的**前置 hook**（build 后自动跑，数据作 review 输入），不删机制
- 命名：`coding/verify/`→`coding/review/`；`verify-report.md`→`review-report.md`；`verify-review-agent`→`code-review-agent`（避开 `review-review-agent` 尴尬名）
- 备选 B：review 与 verify 并存（9 步，与 8 阶段计数对不齐）；备选 C：review 内 3 子任务（coverage/quality/intent-diff）

### ③ test 阶段（真·新，默认跳过、用户显式选）
- 入口 4 项决策：接口测试(1) / E2E(2) / 1+2 / 跳过
- 成本：接口测试中（各项目自带 pytest/httpx/JUnit+MockMvc）；E2E 高（`testing/` 目录空、需建 Playwright/Cypress 脚手架）
- 失败回流：E2E / 接口测试失败 → **回 build**（功能性缺陷=实现问题，非审查问题）
- 落地：新建 `coding/test/`，v1 只做接口测试，E2E 留 v2

### ④ P01/P02 改造（倾向 P01 不动、P02 轻调）
- P01 tweak 不变（单模块无需 review/test 拆分）
- P02 normal 轻调：出口检查拆为 mini-review（覆盖+质量）+ 跳 test + ship；报告并入 review-report.md

## 产物与状态布局

- 叙事文档与规格：`openspec/changes/<change_id>/`，评审/验收报告一律进 `reviews/`
- 运行态：`.polaris/tasks/<change_id>/state.yaml`；阶段游标：`.polaris/workflow.yaml`
- 度量：`.polaris/metrics/<UTC-YYYYMMDD-HHMMSS>-metrics.json`（时间戳叠加，不覆盖）
- 专项设计必须扁平放变更根目录、命名 `<slug>-design.md`，禁止叫 `design.md`、禁止建子目录
- **design 可选化的状态约定（2026-09 重构）**：跳过深化时写 `design.status: skipped` + `design.review_report: "skipped:<reason>"`（复用现有字段，未新增 TS 类型），plan 直接 `--set phase=tasks`；tasks/verify/build 一律识别 `design.status=skipped` 时允许 `detailed-design.md` 缺失、降级为"仅由四件套推导"。`state-next.ts` 的 `PHASE_TO_SKILL` 无需改（phase=plan 正确映射 plan skill）。

## 复用价值高的既有资产

- 复杂度评分：业务 11 + 技术 15 + 合规 7 = 33 分制，简单 0-5 / 标准 6-12 / 复杂 13+，含高危强制升档（`prd/discovery/policies/complexity-assessment-policy.md`）
- 规模判定：≤1 delta spec 且 ≤3 大任务 → 免拆分（`coding/specify/policies/task-split-precheck.md`）
- **polaris-flow 入口复杂度路由为 3 档**（simple/standard/complex，`commands/policies/complexity-router.md`）；`needs_split` 已并入 complex——「需要拆分 / 分多期 / 跨季度」判 complex 走 specify，由 `task-split-precheck` 接手拆分，入口不 STOP（2026-09-09 拍板）
- 共享策略来自 `assets/zh/policies/`（decision-point / ask-question-react / outside-voice / auto-transition / response-posture / hard-stops），技能目录内不存放，打包时注入

## 技能命名与文档引用铁律

- **P01 统一命名 `tweak`**：目录 `coding/tweak/`、name `polaris:coding:tweak`、state `mode: tweak`；ship/命令/README 全部对齐 tweak（不再用 express）。
- **2026-09-08：coding/clarify → coding/specify**（全链路一致改名，用户拍板：全链路深度 / 预发布不做旧状态兼容 / 中文保留「澄清」只动英文 token）。改动范围、有意保留的 clarify 残留（PRD `req_clarify_*`、legacy 读取键、tmp 审计等）详见当日日志。`migrateLegacyShape` 仍读旧扁平 `parsed.clarify` 等 source 键，勿误删。
- **三条铁律（跨平台文档引用治本方案，安装器强制校验）**：
  1. 引用其他技能 → 只用技能名占位符 `polaris{{SKN_SPR}}coding{{SKN_SPR}}<skill>`（或顶层 `polaris{{SKN_SPR}}<skill>`），走 `use_skill`/`/命令`，绝不写 `../` 相对路径。
  2. 引用共享策略/模板 → 一律 `./policies/`、`./templates/`、技能内 `../references/`（安装器会把 `assets/zh/policies/` 平铺注入每个技能的 `policies/`）。
  3. 确需复用其他技能文件内容 → 复制内联到本技能（牺牲 DRY 换跨平台健壮性）。
- **幽灵占位符 `{{SKILL_NAME_PREFIX}}` 禁止**：源码只定义 `{{SKN_SPR}}`，无代码替换 `{{SKILL_NAME_PREFIX}}`，会原样残留。一律展开为 `polaris{{SKN_SPR}}coding{{SKN_SPR}}<skill>` 或顶层 `polaris{{SKN_SPR}}<skill>`。
- **安装器构建期校验**：`src/core/install/skills.ts` 的 `validateSkillAssetsNoCrossSkillParentRefs` 在 `copyPolarisSkillsForPlatform` 入口阻断——产物残留跨技能 `../` 或幽灵占位符即 `throw` 禁止安装。

- **2026-09-08：`coding/plan` → `coding/tasks`**（全链路改名）。已知撞名代价：阶段名 `tasks` 与产物 `tasks.md`、运行态目录 `.polaris/tasks/`、hook `tasks-lint`、`tasks-template.md` 同名，grep 噪音大，用户已确认接受。改名后伴生资源为 `tasks-review-agent` / `reviews/tasks-review-report.md`；**`plan_review_status` 字段名保留旧名**。

## 阶段改名 SOP（已执行三次：clarify→specify、plan→tasks、propose→plan）

1. **摸面**：先 grep 出 5 层引用——技能本体 / 跨技能调用（技能名占位符、`--skill X`、`--set phase=X`、`--phase X`）/ 代码与运行态（TS 类型、`runtime.X`、PHASE_TO_SKILL、phase 枚举、state.example.yaml）/ 伴生资源（review-agent、review-report.md）/ 文档与测试。
2. **先列黑名单**：`superpowers:writing-plans`、`executing-plans`、`subagent-driven-development`、`docs/plans/`、`testcase_plan.md`、`buildInstallPlans`、tweak 的「skip brainstorming and full plan」、CHANGELOG。绝不能裸替换 `plan` → 新名。
3. **用脚本做上下文替换**（`phase=plan`、`runtime.plan`、`coding/plan`、`plan 阶段`…），再 grep 残留逐个手工处理（mermaid 节点、markdown 标签、标题括号、变量声明易漏）。
4. **旧状态兼容**：`migrateLegacyShape` 加 legacy 分支（旧顶层键 → 新 `runtime.*`），分支放在 stage 数组循环**之前**；数组内的阶段名改新名。**字段名（如 `plan_review_status`）保留旧名**，避免牵扯迁移源键。
5. **收尾**：`npx tsc --noEmit` → `npx vitest run`（先确认既有失败基线）→ `npm run build` 重建 dist → 全量 grep 残留归零 → `git add -A <旧路径> <新路径>` 让 git 识别 rename（不代提交）。
6. **坑**：`.git/index.lock` 陈旧会让 `git mv` 报失败但 worktree 已改（假失败），先 `rm -f` 再操作；vitest 4.x 不支持 `--reporter=basic`；**本机是 BSD grep，不支持 `\b`**（用 `grep -w` 或 `grep -E "(^|[^a-zA-Z])x([^a-zA-Z]|$)"`，否则残留检查会静默漏掉所有裸词）；行级保护规则会**整行跳过**，导致同一行里的其他目标被漏改（必须复查"被 guard 掩盖"的行，如 description 里同时含 `proposal` 和 `propose`）；链路里的 `**阶段名**`（加粗）、`→ x →`、`x["x\n中文"]`（mermaid）形式第一轮脚本普遍覆盖不到，需单独一轮。
7. **相邻两次改名会撞键**：若 A→B 后又有 C→A，旧状态文件的顶层 `A:` 出现歧义。解法：用**特征字段**分流（如含 `tdd_policy` 判为旧细计划阶段 → `runtime.tasks`，否则 → `runtime.plan`），并把该键从 stage 数组移除改为显式分支。

## 已知未修的不一致

- `skills/README.md` 写 `delivery`，实际目录为 `ship`
- 代码层（src/）仍用 `delivery` 命名（`TaskDeliveryState` / `runDeliveryCleanup` / `delivery-cleanup.ts`），文档层已迁 `ship`；功能自洽（代码不读 state 的 delivery.*/ship.* 子块），重构风险高暂不动
- **幽灵 policy 引用**：`subagent-delegate-policy.md` 被 tasks/design/plan 的 SKILL.md 及 `plan/policies/artifact-batch-generation.md` 引用，但文件不存在（normal 已规避：Step 7.2 内联 D-1/D-2 判定）
- plan 的 `design-template.md` 节名为中文（宪法对齐/未选方案），与其 Step 4.1 机械终检的英文节名校验（`## Constitution Alignment` 等）不匹配；normal 的副本已改为英文节名规避

## 2026-09-08 已修

- `commands/hotfix.md` 指向的 skill 已实装：`assets/zh/skills/coding/hotfix/SKILL.md`（轻量壳，4 步 brief→tasks→fix→ship，跳过 constitution/split-precheck/exit-check，保留 ship 守门）。配套 `policies/incident-recap-template.md`（5 Whys ≥3 层 + 后续行动 ≥1 条）与 `templates/hotfix-tasks-template.md`（≤3 task、强 TDD 标注、incident 复盘任务可选）。
- 触发前缀全量统一为 `polaris:`（zh 4 份 + en 4 份，从 `pofol:` 全部迁移）。`commands/en/polaris.md` 改名为 `flow.md`（与 zh/polaris-flow.md 对称），trigger `/polaris:flow`；en 端补齐 `normal.md`（P02 主路径之前缺镜像）。
- 命令文件内的 skill 引用统一用 `{{SKN_SPR}}` 占位符：hotfix 4 份 + en 端 tweak/hotfix 共 6 处。
- `assets/zh/adapters/command-registration.md`「已注册命令」表更新（4 命令、trigger 全部 `/polaris:<x>`），旧的「/polaris 启动完整工作流（brainstorm → plan → implement）」一行删除。
- `assets/shared/templates/constitution-template.md` 修正错误的 `/pofol:constitution amend` 描述为 `polaris{{SKN_SPR}}constitution` 技能路径。
- `assets/zh/policies/hard-stops.md` 2 处 pofol 残留清零（H8 行的 `/pofol:*` 与 H3 注脚的 `/pofol:propose`→`/polaris:plan`）。

**有意保留的不一致**（不强制改）：
- `assets/zh/skills/README.md` L21 仍写「命令入口一般为 `/polaris-flow-<阶段>`」——老描述，实际是 `/polaris:flow` + `use_skill` 加载阶段技能。
- en/commands/flow.md 的描述比 zh/polaris-flow.md 薄——前者是入口 stub，后者是完整 11 项功能菜单。语义对应，厚度未做翻译对齐。

## 阶段名沿革（2026-09-08 三次连续改名）

clarify→specify（保留中文「澄清」）→ plan→tasks（保留中文「任务规划」）→ propose→plan（保留中文「提案」）。

执行细节与黑名单清单见当日日志 `.workbuddy/memory/2026-09-08.md`（**完整 SOP，下次阶段改名可直接复用**）。

要点：
1. **方向锁定**：原计划方案里 `proposal.md`（四件套产物名）不动；`polaris:coding:propose` → `polaris:coding:plan`；`opsx_propose_status` 字段名保留。
2. **撞名与歧义**：`tasks` 与产物 `tasks.md`/`.polaris/tasks/`/hook `tasks-lint`/模板 `tasks-template.md` 同名（代码层无冲突，grep 与口语会撞）。相邻两次改名还会让旧 state 的同名键出现歧义——必须用特征字段分流（`plan:` 含 `tdd_policy` → `runtime.tasks`，否则 → `runtime.plan`）而非按键名分。
3. **顺手修了的旧 bug**：原 `session-start.ts` REVIEW_AGENTS 列 `propose-review-agent`，但文件实际名 `propose-reviewer`，导致 SessionStart 恒定告警"未安装"——这次改名时已修正为 `plan-reviewer`。
