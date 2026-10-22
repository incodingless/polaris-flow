# 项目长期约定：polaris-flow

## 链路与档位（`assets/zh/commands/flow.md`）

| 档位 | 链路 | 特征 |
|---|---|---|
| P01 简单 | tweak(4步) → ship | 单模块/单文件级改动 |
| P02 常规 | normal(10步) → ship | 多模块协作，需规格契约，≤8 顶层任务 |
| P03 复杂 | specify → plan → design(可选) → tasks → build → verify → ship + retro | 跨服务/高风险 |

- 产物：P01=`change-brief.md`+`tasks.md`；P02=OpenSpec 四件套+`intention.md`（design.md 常规深度，不产 detailed-design）；P03=四件套+`detailed-design.md`+专项设计
- 档位由入口用户选择，执行中三档可互转（tweak 升档 U1–U8；normal 双向守门，降档保留四件套）；P02 评审压缩为 1 次合并主审（复用 `plan-review-agent`），无 OV，tasks 一次写成终版细计划
- P01/P02 的 TDD 按任务性质自动判定（`tdd_mode: auto_by_task_type`），不询问用户

## 8 阶段重构蓝图（gstack 思路，进行中）

目标链（P03）：`specify → plan(含可选 design) → tasks → build → review → test(可选) → ship → retro(可选)`

- [x] ① design 可选化
- [ ] ② verify→review（倾向方案 A 全替换：review=覆盖率+代码质量+意图一致性；Constitution 审计与 5 scorer 改为 review 前置 hook；命名 `coding/review/`、`review-report.md`、`code-review-agent`）
- [ ] ③ 新增 test 阶段（默认跳过、用户显式选；失败回流 build；v1 只做接口测试）
- [ ] ④ P01/P02 同步改造（倾向 P01 不动、P02 轻调：出口 mini-review + 跳 test）

## 产物与状态布局

- 叙事文档与规格：`openspec/changes/<change_id>/`；评审/验收报告一律进 `reviews/`
- 运行态：`.polaris/tasks/<change_id>/state.yaml`；阶段游标 `.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.sh`）
- 度量：`.polaris/metrics/<UTC-YYYYMMDD-HHMMSS>-metrics.json`（时间戳叠加，不覆盖）
- 专项设计扁平放变更根目录、命名 `<slug>-design.md`；禁止叫 `design.md`、禁止建子目录
- design 跳过 → `design.status: skipped` + `design.review_report: "skipped:<reason>"`；下游识别 skipped 时允许 `detailed-design.md` 缺失

## 可复用资产

- 复杂度评分：业务 11 + 技术 15 + 合规 7 = 33 分制（简单 0-5 / 标准 6-12 / 复杂 13+），含高危强制升档 —— `prd/discovery/policies/complexity-assessment-policy.md`
- 规模判定：≤1 delta spec 且 ≤3 大任务 → 免拆分 —— `coding/specify/policies/task-split-precheck.md`
- 共享策略在 `assets/zh/policies/`（decision-point / ask-question-react / outside-voice / auto-transition / response-posture / hard-stops），技能目录内不存放，打包时注入

## 命名与引用铁律

- 引用其他技能 → 只用技能名占位符 `polaris{{SKN_SPR}}<域>{{SKN_SPR}}<skill>`，绝不写 `../`；引用共享策略/模板 → `./policies/`、`./templates/`
- 确需复用其他技能文件内容 → 复制内联（牺牲 DRY 换跨平台健壮性）
- 幽灵占位符 `{{SKILL_NAME_PREFIX}}` 禁止（源码只认 `{{SKN_SPR}}`）
- 安装器构建期 `validateSkillAssetsNoCrossSkillParentRefs` 阻断跨技能 `../` 残留
- `migrateLegacyShape` 仍读旧扁平 `parsed.clarify` 等 source 键，勿误删；`plan_review_status` 字段名保留旧名
- 历史改名：clarify→specify、plan→tasks、propose→plan（中文名保留）；P01 统一叫 `tweak`，不用 express
- 相邻改名撞键时用**特征字段**分流（如含 `tdd_policy` → `runtime.tasks`），不按键名分
- **新增技能族必须同步 `src/core/assets/layout.ts:23` 的 `SKILL_FAMILIES`**（现为 `coding` / `debug` / `prd` / `prototype` / `testing`）。未登记的族目录会被 `parseSkillAssetPath` 降级成「顶层叶技能 family=null」，族名退化为 skill 名、其下叶技能塌缩为同一技能根的普通文件、policies 注入层级错位——**静默错误，不报错**。族识别断言在 `test/ts/skills-install.test.ts`；族名禁用 `test`（与仓库根 `test/` 冲突），测试族固定 `testing`

## 入口菜单（`assets/zh/commands/flow.md`）

- 12 项 4 类：开发 P01–P03（tweak / normal / specify）、维护 M01–M04（hotfix / bugfix / codereview⚠️ / refactor⚠️）、需求 R01–R03（discovery / draft / readiness）、测试 T01–T02（case / acceptance）
- **M01 修复Bug（生产）→ `polaris{{SKN_SPR}}debug{{SKN_SPR}}hotfix`**（2026-09-17 由 `coding/hotfix` 改指；`coding/hotfix` 已废弃删除）。承接生产故障（根因通常未定位），装配 `triage→diagnose→prescribe→patch→prove→closeout` 全六段；止血 / 发布·灰度·回滚由人在环执行（技能只出指引）
- **M04 修复Bug（测试）→ `polaris{{SKN_SPR}}debug{{SKN_SPR}}bugfix`**（2026-09-16）。bugfix 承接根因**未**定位的测试缺陷，装配 `triage→diagnose→prescribe(可折叠)→patch→closeout` 五段（不装 `prove`）；产物落 `.polaris/tasks/<issue_id>/`（过程档案 `diagnose-brief.md` + RCA `rca-report.md` + `tasks.md` + `verification.md` + `bugfix-report.md`），**全程不使用 openspec、不交 ship**，`closeout` 归档到 `docs/troubleshooting/<issue_id>/` 并追加 `INDEX.md` 一行；归档回读校验 5 项（4 文件 + `INDEX.md`）
- H14 的「开发类」现为 **M01 / M04 / P01–P03 / M03**（2026-09-16 补齐 M04，此前只有 M01 / P01–P03 / M03，与 flow.md 零步清单不一致）；H12 适用 skill 已含 `bugfix` / `hotfix`
- **debug 族重构（2026-09-16 已全部落地，批 1–6 完成）**：契约 `docs/specs/2026-09-16-debug-workflow-design.md`。六阶段原子＝`triage`→`diagnose`→`prescribe`→`patch`（实现与自验）→`prove`（独立验证，仅生产）→`closeout`（中文「关闭Bug」；刻意避让 coding 等族占用的 `plan`/`tasks`/`design`/`build`/`verify`/`ship`）。装配：bugfix 五段（不装 `prove`，`prescribe` 可折叠）；hotfix 全六段（`prescribe` 不可折叠）+ 6 加严项（三对齐·复现可选 / 止血支路 / 回退路径硬门禁 / 数据脚本·埋点·开关 / 五维含回滚演练 / 发布确认）。8 叶技能＝6 阶段 + `bugfix`/`hotfix` 2 通道（通道技能禁阶段执行细节）+ `_shared/` 3 族级样板（capability-tiers/artifacts/scene-routing，经 `install/skills.ts` Step 3b 注入各叶技能 `policies/`）。生产通道＝同一套原子 + 3 人在环节点（现场保全/止血支路/发布·灰度·回滚，**不建技能**，只出 templates：`preservation-checklist.md`/`containment-options.md`/`release-runbook.md`）。门禁判定三类：技能自证 / 人确认 / **人回填+技能判定**（`prove` 用第三类）。运行机制：`WorkflowTaskEntry.channel` + `DEBUG_PHASE_TO_SKILL[channel][phase]`；phase 回退走 `update-active --set phase=X` + `regressions[]`；**新增 `debug` task kind**（`usesDraft:false` + 显式 `--task-id`，落 `.polaris/tasks/<issue_id>/`）。产物：`diagnose-brief.md`（过程档案）+ `rca-report.md`（九节 RCA，含发现路径+改进项只登记不执行）+ `tasks.md` + `verification.md`（自验/独立验证两节）+ `bugfix-report.md`；归档回读 5 项
- 场景切分口径：**hotfix = 生产问题修复，bugfix = 测试问题修复**（按场景并列，不按紧急度分流）。用户只说「修 bug」不分场景时，flow.md 要求按信号判定、信号不足必须询问，**不得默认 M01**
- M02 / M03 暂不可用（技能未提供）
- 命令树：`commands/flow.md`（入口）+ `coding/{tweak,normal,sdd}.md` + `prd/readiness.md` + `maintance/hotfix.md`。**目录即命名空间、文件名即叶子名**，命令名由落盘相对路径推导；R01 discovery / R02 draft 无独立命令文件，只能走菜单
- R03 需求就绪度：菜单项 + 独立命令 `/polaris:prd:readiness`；是 ship Step 1 准出评估的独立入口，含免评 E1~E3 / 强制信号 F1~F5
- 加菜单项同步改 5 处：状态字段行、第一步类别描述、第二步 options、第四步路由表、「需求类与测试类选项的前置依赖」表；另加 `test/ts/commands-install.test.ts`（referencedSkills + 编号断言 + 落盘路径断言）与 `adapters/command-registration.md` 的已注册命令表
- 新命令 frontmatter：`command_prefix: polaris` + `triggers: ["/polaris{{CMD_SPR}}<family>{{CMD_SPR}}<name>"]`（根级为 `/polaris{{CMD_SPR}}<name>`）；正文引**技能**用 `{{SKN_SPR}}`、引**命令**用 `{{CMD_SPR}}`，两者都不写死；安装器扫目录自动分发，无需改安装代码

## 命令目录布局与命名空间

- 安装器行为：`commands.ts` → `collectContentPaths`（`walkFilesSafe` 递归**无过滤**）→ 子目录原样保留，**任何 `.md` 都会被注册成 slash command**
- **铁律：`commands/` 下不放非命令文件**。伴生资料要么内联进命令正文，要么放语言包顶层 `policies/`（→ `plugin_root/policies/`，不进命令树）。加 `_`/`.` 前缀规避不可行 —— 安装器无过滤机制，平台侧也无豁免约定
- 命令布局 = 独立能力 `Platform.commandLayout`，**不可由 `skillsLayout` 推导**（Trae 就是技能 flat、命令 nested）：`nested` → 落 `<contextDir>/commands/polaris/<相对路径>`，命令名 `/polaris:coding:normal`；`flat` → 落 `<contextDir>/commands/polaris-<相对路径，/ → ->.md`（**连 `polaris/` 命名空间目录一起去掉**，命名空间由 `polaris-` 文件名前缀承担）。当前 claude / trae / trae-cn = nested，**cursor = flat**（其 CLI 只读顶层 `.md`，IDE 才递归）。实现：`install/layout.ts` 算命令根 → `install/commands.ts` 的 `resolveCommandDest()`
- **占位符一分为二**：`{{SKN_SPR}}` 按 `skillsLayout`、**`{{CMD_SPR}}` 按 `commandLayout`** 展开。写死 `/polaris:*` 会在 flat 平台产生不存在的命令名；多段名须逐段拆（`/polaris:coding:sdd` → `/polaris{{CMD_SPR}}coding{{CMD_SPR}}sdd`）
- Claude Code 的 frontmatter `name` 只是显示标签，不参与命令名推导 → **改文件名 = 改命令名**
- `command_prefix` / `triggers` 是**无消费者的声明性元数据**（生成 triggers 的 `install/command-adapters/` 已删除）

## 编辑工具铁律

- **同一条消息里对同一个文件发两个 Edit 会丢更新**（并行写竞态：后写的覆盖先写的）。同一文件多处修改必须**串行**发，改完后再 Read/Grep 复核
- 本机 BSD grep **既不支持 `\b` 也不支持 `\|` 交替**（静默返回 0 匹配，极易误判"无引用"）；zsh 下 `--include=*.md` 报 no matches —— 一律改用 Grep 工具。Grep 工具的 `head_limit` 会静默截断，判断"全仓有无引用"时不要设限

## 已知未修的不一致

- `skills/README.md` 写 `delivery`，实际目录 `ship`（代码层 src/ 仍用 `delivery` / `TaskDeliveryState` / `runDeliveryCleanup`，功能自洽、风险高暂不动）；L21 仍写「命令入口一般为 `/polaris-flow-<阶段>`」（实际 `/polaris:flow` + `use_skill`）
- 幽灵 policy：`subagent-delegate-policy.md` 被 tasks/design/plan 引用但文件不存在（normal 已内联 D-1/D-2 判定规避）
- plan 的 `design-template.md` 节名为中文，与其 Step 4.1 的英文节名校验不匹配（normal 副本已改英文规避）
- `assets/en/commands/` 比 zh 薄且无分类目录（en 的 `flow.md` 只是入口 stub，未做翻译对齐）
- prd 链与 coding 链无正式输入契约：`coding/specify`、`coding/plan` 全文无 PRD 字样
- **`test/ts/command-adapters.test.ts` 已坏**（import 不存在的 `src/core/install/command-adapters/...`）：既有失败基线，跑全量 vitest 时先排除，别误判为本次改动引入
- **Trae 命令名推导未验证**：官方文档只说明 `.trae/commands` 支持 3 层嵌套，未明确子目录是否计入命令名。若实测 Trae 侧不是 `/polaris:flow`，把 `platforms.ts` 里 trae / trae-cn 的 `commandLayout` 改成 `flat` 即可
- **tasks-lint 的真实校验项**（`src/core/hooks/tasks-lint.ts`）：DocSync 末位组 / TDD 后 ≥3 条 `N.M.K` / 无 Constitution Audit / DocSync 前无 `git commit`·`add` / 无 superpowers header / 代码块 ≤40%。**「任务数上限」「路径相对」lint 不校验**，是各 skill 自定规则
