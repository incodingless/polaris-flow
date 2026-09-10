# 项目长期约定：polaris-flow 技能集

## 开发类链路三档（P01/P02/P03）

定义于 `assets/zh/commands/polaris-flow.md`：

| 档位 | 链路 | 特征 |
|---|---|---|
| P01 简单 | tweak(4步) → ship | 单模块/单文件级改动 |
| P02 常规 | normal(10步) → ship | 多模块协作，需规格契约，≤8 顶层任务 |
| P03 复杂 | specify → plan → design(可选) → tasks → build → verify → ship + retro | 跨服务/高风险 |

- 产物：P01=`change-brief.md`+`tasks.md`；P02=OpenSpec 四件套+`intention.md`（design.md 常规深度，不产 detailed-design）；P03=四件套+`detailed-design.md`+专项设计（design 可跳过，写 `design.status=skipped`）
- 档位由入口用户选择，执行中三档可互转（tweak 升档 U1–U8；normal 双向守门，降档保留四件套）
- P02 评审压缩为 1 次合并主审（复用 `plan-reviewer`），无 OV；tasks 一次写成终版细计划
- P01/P02 的 TDD 按任务性质自动判定（`tdd_mode: auto_by_task_type`），不询问用户

## 8 阶段重构蓝图（gstack 思路，进行中）

目标链（P03）：`specify → plan(含可选 design) → tasks → build → review → test(可选) → ship → retro(可选)`

- [x] ① design 可选化
- [ ] ② verify→review 职责切分（倾向方案 A 全替换：review=覆盖率+代码质量+意图一致性；Constitution 审计与 5 scorer 改为 review 前置 hook；命名 `coding/review/`、`review-report.md`、`code-review-agent`）
- [ ] ③ 新增 test 阶段（接口测试 / E2E；默认跳过、用户显式选；失败回流 build；v1 只做接口测试）
- [ ] ④ P01/P02 同步改造（倾向 P01 不动、P02 轻调：出口 mini-review + 跳 test）

## 产物与状态布局

- 叙事文档与规格：`openspec/changes/<change_id>/`；评审/验收报告一律进 `reviews/`
- 运行态：`.polaris/tasks/<change_id>/state.yaml`；阶段游标：`.polaris/workflow.yaml`
- 度量：`.polaris/metrics/<UTC-YYYYMMDD-HHMMSS>-metrics.json`（时间戳叠加，不覆盖）
- 专项设计扁平放变更根目录、命名 `<slug>-design.md`，禁止叫 `design.md`、禁止建子目录
- design 跳过时写 `design.status: skipped` + `design.review_report: "skipped:<reason>"`（复用现有字段）；下游识别 skipped 时允许 `detailed-design.md` 缺失

## 复用价值高的既有资产

- 复杂度评分：业务 11 + 技术 15 + 合规 7 = 33 分制，简单 0-5 / 标准 6-12 / 复杂 13+，含高危强制升档（`prd/discovery/policies/complexity-assessment-policy.md`）
- 规模判定：≤1 delta spec 且 ≤3 大任务 → 免拆分（`coding/specify/policies/task-split-precheck.md`）
- 入口复杂度路由 3 档（`commands/policies/complexity-router.md`）；`needs_split` 已并入 complex，入口不 STOP
- 共享策略来自 `assets/zh/policies/`（decision-point / ask-question-react / outside-voice / auto-transition / response-posture / hard-stops），技能目录内不存放，打包时注入

## 技能命名与文档引用铁律

- P01 统一命名 `tweak`（不再用 express）；2026-09-08 三次改名：clarify→specify、plan→tasks、propose→plan（中文名保留）
- 引用其他技能 → 只用技能名占位符 `polaris{{SKN_SPR}}coding{{SKN_SPR}}<skill>`，绝不写 `../`
- 引用共享策略/模板 → `./policies/`、`./templates/`
- 确需复用其他技能文件内容 → 复制内联（牺牲 DRY 换跨平台健壮性）
- 幽灵占位符 `{{SKILL_NAME_PREFIX}}` 禁止（源码只认 `{{SKN_SPR}}`）
- 安装器构建期校验 `validateSkillAssetsNoCrossSkillParentRefs` 会阻断跨技能 `../` 残留
- `migrateLegacyShape` 仍读旧扁平 `parsed.clarify` 等 source 键，勿误删；`plan_review_status` 字段名保留旧名

## 阶段改名 SOP

完整版见 `.workbuddy/memory/2026-09-08.md`。要点：
1. 摸清 5 层引用（技能本体 / 跨技能调用 / 代码与运行态 / 伴生资源 / 文档测试）
2. 先列黑名单（`superpowers:writing-plans`、`docs/plans/`、`testcase_plan.md`、`buildInstallPlans` 等），绝不裸替换
3. 脚本做上下文替换 + 逐轮 grep 残留（**加粗阶段名**、`→ x →`、mermaid `x["x\n中文"]` 第一轮必漏）
4. 旧状态兼容：`migrateLegacyShape` 加 legacy 分支，放 stage 数组循环之前；字段名保留旧名
5. 收尾：tsc → vitest（先确认失败基线）→ build → grep 归零 → `git add -A` 让 git 识别 rename
6. 坑：陈旧 `.git/index.lock` 导致 `git mv` 假失败；vitest 4.x 不支持 `--reporter=basic`；**本机 BSD grep 不支持 `\b`**（用 `grep -w` 或 `-E "(^|[^a-zA-Z])x([^a-zA-Z]|$)"`）；行级保护规则整行跳过会漏改同行的其他目标
7. 相邻改名撞键时用**特征字段**分流（如含 `tdd_policy` → `runtime.tasks`），不按键名分

## 已知未修的不一致

- `skills/README.md` 写 `delivery`，实际目录 `ship`；代码层（src/）仍用 `delivery`（`TaskDeliveryState`/`runDeliveryCleanup`），功能自洽、风险高暂不动
- 幽灵 policy：`subagent-delegate-policy.md` 被 tasks/design/plan 引用但文件不存在（normal 已内联 D-1/D-2 判定规避）
- plan 的 `design-template.md` 节名为中文，与其 Step 4.1 的英文节名校验不匹配（normal 副本已改英文规避）
- `assets/zh/skills/README.md` L21 仍写「命令入口一般为 `/polaris-flow-<阶段>`」（实际是 `/polaris:flow` + `use_skill`）
- en/commands/flow.md 比 zh/polaris-flow.md 薄（前者是入口 stub，未做翻译对齐）
- **prd 链与 coding 链无正式输入契约**：`coding/specify`、`coding/plan` 全文无任何 PRD 字样（2026-09-10 核查）
