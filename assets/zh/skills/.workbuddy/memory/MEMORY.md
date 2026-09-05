# 项目长期约定：polaris-flow 技能集

## 开发类链路三档（P01/P02/P03）

定义于 `assets/zh/commands/polaris-flow.md`，是开发类需求的正式分档：

| 档位 | 链路 | 特征 |
|---|---|---|
| P01 简单 | tweak（单入口 4 步）→ ship | 单模块、单文件级改动、无跨模块设计、风险低 |
| P02 常规 | normal（单入口 10 步）→ ship | 多模块协作，需规格契约，≤8 顶层任务 |
| P03 复杂 | clarify → propose → design(可选) → plan → build → verify → ship + retro | 跨服务/高风险，含专项设计与交付复盘 |

- 产物：P01 为 `change-brief.md` + `tasks.md`（ship 归档前补齐四件套）；P02 为 OpenSpec 四件套 + `intention.md`（design.md 常规深度：架构决策+模块划分+模块间接口契约+数据流，**不产** detailed-design）；P03 为四件套（+ `detailed-design.md` + 专项设计，**design 可选**：propose 完成时询问是否深化，跳过则 `design.status=skipped` 直接进 plan，无 detailed-design/专项设计）
- 档位由入口用户选择；执行中三档可互转：tweak 升档信号 U1–U8 → normal（brief 映射转 intention）；normal 双向守门（规格定稿后、细计划前）降档门 D1′–D4′ → tweak（**保留四件套**）、升档门 D1–D7 → design（转交零成本）
- P02 评审压缩为 1 次合并主审（复用 propose-reviewer，对象=四件套+终版细计划+intention），无 OV、无 design/plan 独立主审；确认预算 ~5 次；tasks 一次写成终版细计划（无 plan 覆写）
- P01/P02 的 TDD 策略均为**按任务性质自动判定**（`tdd_mode: auto_by_task_type`）：新功能/Bug修复/含分支 → TDD，配置/重命名/文档/依赖升级 → 非 TDD，无法判定 → 默认 TDD。不询问用户（Constitution 里 Test-First 是 NON-NEGOTIABLE，全局 prefer_direct 会撞 Critical）

## 8 阶段重构蓝图（gstack 思路，进行中）

目标链（P03）：`clarify → propose(含可选 design) → plan → build → review → test(可选) → ship → retro(可选)`

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
- **design 可选化的状态约定（2026-09 重构）**：跳过深化时写 `design.status: skipped` + `design.review_report: "skipped:<reason>"`（复用现有字段，未新增 TS 类型），propose 直接 `--set phase=plan`；plan/verify/build 一律识别 `design.status=skipped` 时允许 `detailed-design.md` 缺失、降级为"仅由四件套推导"。`state-next.ts` 的 `PHASE_TO_SKILL` 无需改（phase=plan 正确映射 plan skill）。

## 复用价值高的既有资产

- 复杂度评分：业务 11 + 技术 15 + 合规 7 = 33 分制，简单 0-5 / 标准 6-12 / 复杂 13+，含高危强制升档（`prd/discovery/policies/complexity-assessment-policy.md`）
- 规模判定：≤1 delta spec 且 ≤3 大任务 → 免拆分（`coding/clarify/policies/task-split-precheck.md`）
- 共享策略来自 `assets/zh/policies/`（decision-point / ask-question-react / outside-voice / auto-transition / response-posture / hard-stops），技能目录内不存放，打包时注入

## 技能命名与文档引用铁律

- **P01 统一命名 `tweak`**：目录 `coding/tweak/`、name `polaris:coding:tweak`、state `mode: tweak`；ship/命令/README 全部对齐 tweak（不再用 express）。
- **三条铁律（跨平台文档引用治本方案，安装器强制校验）**：
  1. 引用其他技能 → 只用技能名占位符 `polaris{{SKN_SPR}}coding{{SKN_SPR}}<skill>`（或顶层 `polaris{{SKN_SPR}}<skill>`），走 `use_skill`/`/命令`，绝不写 `../` 相对路径。
  2. 引用共享策略/模板 → 一律 `./policies/`、`./templates/`、技能内 `../references/`（安装器会把 `assets/zh/policies/` 平铺注入每个技能的 `policies/`）。
  3. 确需复用其他技能文件内容 → 复制内联到本技能（牺牲 DRY 换跨平台健壮性）。
- **幽灵占位符 `{{SKILL_NAME_PREFIX}}` 禁止**：源码只定义 `{{SKN_SPR}}`，无代码替换 `{{SKILL_NAME_PREFIX}}`，会原样残留。一律展开为 `polaris{{SKN_SPR}}coding{{SKN_SPR}}<skill>` 或顶层 `polaris{{SKN_SPR}}<skill>`。
- **安装器构建期校验**：`src/core/install/skills.ts` 的 `validateSkillAssetsNoCrossSkillParentRefs` 在 `copyPolarisSkillsForPlatform` 入口阻断——产物残留跨技能 `../` 或幽灵占位符即 `throw` 禁止安装。

## 已知未修的不一致

- `skills/README.md` 写 `delivery`，实际目录为 `ship`
- `commands/hotfix.md` / `tweak.md` 指向的 skill 未实现，`skills/maintance/` 为空
- 代码层（src/）仍用 `delivery` 命名（`TaskDeliveryState` / `runDeliveryCleanup` / `delivery-cleanup.ts`），文档层已迁 `ship`；功能自洽（代码不读 state 的 delivery.*/ship.* 子块），重构风险高暂不动
- **幽灵 policy 引用**：`subagent-delegate-policy.md` 被 plan/design/propose 的 SKILL.md 及 `propose/policies/artifact-batch-generation.md` 引用，但文件不存在（normal 已规避：Step 7.2 内联 D-1/D-2 判定）
- propose 的 `design-template.md` 节名为中文（宪法对齐/未选方案），与其 Step 4.1 机械终检的英文节名校验（`## Constitution Alignment` 等）不匹配；normal 的副本已改为英文节名规避
- `commands/tweak.md` 用字面量 trigger `/polaris:tweak`，与 polaris-flow.md 的 `{{SKN_SPR}}` 占位符风格不一致（normal.md 已按占位符风格写）
