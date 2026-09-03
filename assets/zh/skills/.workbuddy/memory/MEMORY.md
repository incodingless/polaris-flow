# 项目长期约定：polaris-flow 技能集

## 开发类链路三档（P01/P02/P03）

定义于 `assets/zh/commands/polaris-flow.md`，是开发类需求的正式分档：

| 档位 | 链路 | 特征 |
|---|---|---|
| P01 简单 | tweak（单入口 4 步）→ ship | 单模块、单文件级改动、无跨模块设计、风险低 |
| P02 常规 | clarify → propose → design → plan → build → verify → ship | 多模块协作，需详细设计与任务拆分 |
| P03 复杂 | P02 全链路 + retro | 跨服务/高风险，含专项设计与交付复盘 |

- 产物：P01 为 `change-brief.md` + `tasks.md`；P02/P03 为 OpenSpec 四件套 + `detailed-design.md`
- 档位由入口用户选择，执行中命中升档信号（跨模块 / >1 delta spec / >3 大任务 / 新增数据实体 / 触碰核心链路）可升到 P02，检查点在 brief 定稿后、生成 tasks 前
- P01 的 TDD 策略为**按任务性质自动判定**（`tdd_mode: auto_by_task_type`）：新功能/Bug修复/含分支 → TDD，配置/重命名/文档/依赖升级 → 非 TDD，无法判定 → 默认 TDD。不询问用户（Constitution 里 Test-First 是 NON-NEGOTIABLE，全局 prefer_direct 会撞 Critical）

## 产物与状态布局

- 叙事文档与规格：`openspec/changes/<change_id>/`，评审/验收报告一律进 `reviews/`
- 运行态：`.polaris/tasks/<change_id>/state.yaml`；阶段游标：`.polaris/workflow.yaml`
- 度量：`.polaris/metrics/<UTC-YYYYMMDD-HHMMSS>-metrics.json`（时间戳叠加，不覆盖）
- 专项设计必须扁平放变更根目录、命名 `<slug>-design.md`，禁止叫 `design.md`、禁止建子目录

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
