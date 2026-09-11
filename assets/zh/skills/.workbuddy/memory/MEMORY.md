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

## 入口菜单（`assets/zh/commands/flow.md`）

共 11 项，4 类：开发 P01–P03（tweak / normal / specify）、维护 M01–M03（hotfix / codereview⚠️ / refactor⚠️）、需求 R01–R03（discovery / draft / **readiness**）、测试 T01–T02（case / acceptance）。

- 命令树（2026-09-11 起）：`commands/flow.md`（入口）+ `coding/{tweak,normal,sdd}.md` + `prd/readiness.md` + `maintance/hotfix.md`。**目录即命名空间、文件名即叶子名**，命令名由落盘相对路径推导
- 需求类的 R01 discovery / R02 draft **没有独立命令文件**，只能走菜单；R03 有独立命令 `/polaris:prd:readiness`
- **R03 · 需求就绪度评估**：菜单项 → `polaris{{SKN_SPR}}prd{{SKN_SPR}}readiness`；独立命令 `assets/zh/commands/prd/readiness.md`。是 `ship` Step 1 准出评估的独立入口，含免评 E1~E3 / 强制信号 F1~F5
- 加菜单项要同步改 5 处：状态字段行、第一步类别描述（如需）、第二步 options、第四步路由表、「需求类与测试类选项的前置依赖」表；另外 `test/ts/commands-install.test.ts` 的 `referencedSkills` + 编号断言 + 落盘路径断言、`adapters/command-registration.md` 的已注册命令表
- 新命令 frontmatter：`command_prefix: polaris` + `triggers: ["/polaris{{CMD_SPR}}<family>{{CMD_SPR}}<name>"]`（根级命令为 `/polaris{{CMD_SPR}}<name>`）；正文引**技能**用 `{{SKN_SPR}}`、引**命令**用 `{{CMD_SPR}}`，**两者都不写死**；安装器扫目录自动分发，无需改安装代码

## 编辑工具铁律

- **同一条消息里对同一个文件发两个 Edit 会丢更新**（并行写竞态：后写的覆盖先写的）。同一文件多处修改必须**串行**发，改完后再 Read/Grep 复核
- 本机 BSD grep **既不支持 `\b` 也不支持 `\|` 交替**（静默返回 0 匹配，极易误判为"无引用"）；Bash 里 `--include=*.md` 在 zsh 下报 no matches —— 一律改用 Grep 工具。注意 Grep 工具的 `head_limit` 会静默截断，判断"全仓有无引用"时不要设限或要复核

## 命令目录布局与命名空间（2026-09-11 实测 + 定案）

- 安装器行为：`commands.ts` → `collectContentPaths`（`walkFilesSafe` 递归**无过滤**）→ 按 `shortPath` 落盘 **子目录原样保留**，所有 `.md` 都会被注册成 slash command
- `Platform` 只有 `skillsLayout`，**没有 commandLayout**；命令树对所有平台一致拷贝，**不做扁平化**
- **命令子目录的平台支持（2026-09-11 官方文档取证，修正此前"只有 Claude 支持"的误判）**：
  - **Claude Code** ✅ 递归 `.claude/commands/**`，子目录 → `:` 命名空间（`frontend/component.md` → `/frontend:component`）；文档中唯一的"跳过"只针对保留名 `synced` 与名称冲突
  - **Trae** ✅ `.trae/commands` **支持最多 3 层嵌套**（v3.5.56 / 2026-05 起，官方文档有完整树示例）→ **此前据 `openspec.ts:267` 注释断言"Trae 走扁平"是错的/过时的**，OpenSpec 用扁平 `opsx-*` 是它自己的兼容选择
  - **Cursor** ⚠️ **IDE 递归扫子目录**（官方人员论坛 2026-03 确认）；**CLI 只读顶层 `.md`、完全跳过子目录** → 缺口仅在 Cursor CLI
  - 结论：分类子目录对 Claude / Trae / Cursor IDE 均可用；**Cursor CLI 读不到任何子目录** → 已由 `commandLayout: 'flat'` 解决（2026-09-11，见下）
- **命令名推导只认路径**；`_` / `.` 前缀**不是**任何平台的忽略约定（三平台官方文档均无此规则）
- **铁律：`commands/` 下不放非命令文件**。安装器无过滤（`walkFilesSafe` 纯递归；`layout.ts:50 shouldSkipAsset` 的跳过机制只服务 skills 域，commands 安装不调用）→ 任何 `.md` 都会落盘并注册。命令的伴生资料要么**内联进命令正文**，要么放语言包顶层 `policies/`（→ `plugin_root/policies/`，不进命令树）
  - 反例已修：`commands/policies/complexity-router.md` 会被注册成 `/polaris:policies:complexity-router`。2026-09-11 用户选**「内联进 flow.md」**，内容并入 `flow.md` 0.4 节（372 → 411 行），文件与目录已删；`README-zh` 与 `command-registration.md` 同步
  - **「改下划线前缀规避」不可行**：加过滤 = 不拷贝 = 删文件（宿主里「文件在 `commands/` 下」**就是**注册机制，无独立注册步骤），会连带打断 `flow.md` 对它的相对引用；平台侧也无下划线豁免
- **命令布局 = 独立能力 `Platform.commandLayout`（2026-09-11 新增）**，**不可由 `skillsLayout` 推导**（Trae 就是「技能 flat、命令 nested」）：
  - `nested`（默认）：`<contextDir>/commands/polaris/<相对路径>` → 命令名 `/polaris:coding:normal`
  - `flat`：`<contextDir>/commands/polaris-<相对路径，/ → ->.md` → 命令名 `/polaris-coding-normal`。**连 `polaris/` 命名空间目录一起去掉**（Cursor CLI 连这层都不递归），命名空间由 `polaris-` 文件名前缀承担
  - 当前：`claude` nested / `trae`+`trae-cn` nested / **`cursor` flat**（其 CLI 只读顶层 `.md`，IDE 才递归）
  - 实现：`install/layout.ts` 算命令根 → `install/commands.ts` 的 `resolveCommandDest()` 算相对路径。**换平台只改一个字段，源文件不动**
- **占位符一分为二**：`{{SKN_SPR}}` 按 `skillsLayout` 展开、**`{{CMD_SPR}}` 按 `commandLayout` 展开**（同为 `:` 或 `-`）。命令正文与 frontmatter `triggers` 都必须用占位符，写死 `/polaris:*` 会在 flat 平台产生不存在的命令名
  - 批量替换注意：多段名要逐段拆（`/polaris:coding:sdd` → `/polaris{{CMD_SPR}}coding{{CMD_SPR}}sdd`），**不能简单把 `/polaris:` 换成 `/polaris{{CMD_SPR}}`**
- **定案（用户 2026-09-11 决策）**：保留分类子目录 + 命名空间统一为 `/polaris:*` + en 不建分类目录（en 仍扁平，命令名为 `/polaris:<name>`）。**决策时误以为「Cursor/Trae 全面缺口」，实为仅 Cursor CLI**（见上）
- Claude Code 的 frontmatter `name` **只是显示标签**，不参与命令名推导（证据：`.claude/commands/opsx/explore.md` 的 `name: "OPSX: Explore"`，实际命令 `/opsx:explore`）→ **改文件名 = 改命令名**
- `command_prefix` / `triggers` 是**无消费者的声明性元数据**（生成 triggers 的 `install/command-adapters/` 已删除）
- `pofol` 前缀来自 `5b309eb 调整命名配置`（2026-09-04，把 `polaris` 改 `pofol`），但落盘目录始终是 `commands/polaris/` → 已统一回 `polaris`（2026-09-11）
- **连带改名**：`commands/polaris-flow.md` → `commands/flow.md`（否则路径推导出 `/polaris:polaris-flow`，与文档宣称的 `/polaris:flow` 不符）

## 已知未修的不一致

- `skills/README.md` 写 `delivery`，实际目录 `ship`；代码层（src/）仍用 `delivery`（`TaskDeliveryState`/`runDeliveryCleanup`），功能自洽、风险高暂不动
- 幽灵 policy：`subagent-delegate-policy.md` 被 tasks/design/plan 引用但文件不存在（normal 已内联 D-1/D-2 判定规避）
- plan 的 `design-template.md` 节名为中文，与其 Step 4.1 的英文节名校验不匹配（normal 副本已改英文规避）
- `assets/zh/skills/README.md` L21 仍写「命令入口一般为 `/polaris-flow-<阶段>`」（实际是 `/polaris:flow` + `use_skill`）
- `assets/en/commands/` 比 zh 薄且无分类目录（en 的 `flow.md` 只是入口 stub，未做翻译对齐）
- **prd 链与 coding 链无正式输入契约**：`coding/specify`、`coding/plan` 全文无任何 PRD 字样（2026-09-10 核查）
- **`test/ts/command-adapters.test.ts` 已坏**：import `src/core/install/command-adapters/command-adapters.js` 不存在（`Cannot find module`）。这是**既有失败基线**，跑全量 vitest 时先排除，别误判为本次改动引入（2026-09-11 确认）
- **Trae 命令名推导未验证**：Trae 官方文档只说明 `.trae/commands` 支持 3 层嵌套，**未明确子目录是否计入命令名**（Claude 会计入 → `/polaris:flow`）。若实测 Trae 侧不是 `/polaris:flow`，把 `platforms.ts` 里 trae / trae-cn 的 `commandLayout` 改成 `flat` 即可（2026-09-11 记）
