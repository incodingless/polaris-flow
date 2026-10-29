# Polaris Flow — 项目长期记忆

## 引用与安装（最高优先，勿回退）
- 命令前缀 `psfl`（`POLARIS_COMMAND_PREFIX`）与技能插件名 `polaris`（`POLARIS_PLUGIN_NAME`）刻意解耦；改命令前缀必须先拆分。
- 引用形态仅两种，不得混用：技能名 = `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`（无斜杠）；命令名 = `/psfl{{CMD_SPR}}coding{{CMD_SPR}}tweak`（带斜杠）。「技能名加斜杠」是坏引用。
- 边界（2026-10-15）：正文里「转交/回退到某技能」是描述流程逻辑，合理；带斜杠只是措辞一致性问题，勿机械清理。
- 技能资产不得反向引用命令（`/psfl:*`、flow 菜单编号）；要表达档位用 `tweak`/`normal`/`strict`。
- 占位符仅 skills/commands 域展开；`install/skills.ts` 只替换 `{{SKN_SPR}}`；`{{CMD_SPR}}` 只在命令域。

## 三层架构（权威源 `src/core/config/task-kind-layout.ts`）
- 三层：入口层（tweak/normal/strict 薄编排，只声明档位）→ 调度层 `intake` → 执行层（specify→plan→design(可选)→tasks→build→verify→ship）+ 旁路 retro。
- 执行层唯一入口 = `intake`：不得被直接调用、不得互相调用；阶段出口的自动衔接也回 intake。
- 档位序列唯一真相 = `TaskKindLayout.modePhases`：tweak 跳 plan/design；normal 跳 design；strict 全序列。
- `workflow.mode` 三值 `tweak|normal|strict`（`full` 已删）。档位升降唯一位置 = `specify` 出口（Step 5.5），过即冻结。

## intake（调度层）
- `task-entry` 原语 = intake 专用（六出口 resume/handover/create/select/resolve-drafts/block）；恢复分发用只读 `get-active-changes`。
- Step1–4：恢复分发 → 入口判档（仅零个）→ 任务初始化 → 转交；上游已指定 `task_id` 则免提问。
- 执行层 Step1「接收 intake 交接」：必给 `task_id` + `worktree_path`（空=主仓）；没有则阻断。
- retro = 调度层唯一豁免：不进序列、不需 `task_id`、由用户直接调用。

## 值域（勿再动）
- `complexity_level`/`risk_level`/`current_tier` = `trivial|standard|critical`。
- 分级→档位映射单源（`risk-signals.md` §1）：trivial→tweak / standard→normal / critical→strict。

## 用户约定
- 配置归代码；写 `state.yaml` 一律走 `scripts/task-state-entry.sh`（禁直写 yaml 块）。
- 双语言：先写中文（`assets/zh/skills/`），确认后再同步英文。zh 资产变动就 bump 版本号 + Changelog（patch=修 Bug/文案/内部重构，minor=新增能力，major=破坏性）。
- 候选呈现（手定）：单行 `<task_id> (工作流：<mode_label>，阶段：<phase_label>，技能：<skill_label>)`。
- 每轮改动后跑 26/26 技能测试通过方可提交。

## state.yaml 写入（2026-10-16 审计）
- state 不套骨架：字段靠增量长出，「字段缺失」是常态，不是异常。
- ⚠️ `worktree.ts:141-158` 用 `appendFile` 追加顶层 `worktree:` 块 —— 全仓唯一绕过 task-state-entry 锁的写入；重复键会让 `yaml` 库抛错。
- 已落盘：23 处 AI 直写改为 `task-state-entry.sh`（范围仅 `assets/zh/skills/coding/**`）。
- 底线：涉及 `src/`、`assets/shared/templates/`、其它族的发现，不得顺手纳入修复范围。

## 测试与工具坑
- 测试族固定 `testing`；coding 族 12 技能。
- 本机 BSD grep 不支持 `\|`；用 Grep 工具。Typora 会静默覆盖 AI 写入，写前 `lsof` 查占用。
- `state.example.yaml` 混有用户手改，回退禁用 `git checkout`。
- `packageManager` 锁 `pnpm@10.18.3`（= 两处 workflow 的 `pnpm/action-setup`）。升 pnpm 12+ 须同步升 corepack 或独立安装 pnpm。
- 写 shell：变量后紧跟中文必须 `${VAR}`（全角字符首字节会被吃进变量名）。
- `git status --porcelain` 中文路径需 `git -c core.quotepath=false status`。
- `.workbuddy/memory/` 被 git 跟踪；「工作区干净」检查要 `:(exclude).workbuddy`。
- 发布：`release.sh`（通道 A）；`npm publish` 无 `--force`；验收判据 = tarball 可直接下载 + 全新缓存 `npm pack`/`npm i` 通过（`--cache <新目录> --prefer-online`）。细节单源《docs/releases/发布操作指南.md》。
- Nexus 3.90.1 @ `http://192.168.103.96:8081`（旧 2.15.1 已退役，结论作废）。三仓 npm-hosted/proxy/group；认证 `npm login --auth-type=legacy`（30 天）或 Basic `_auth`（永不过期）。

## 资产类别：bundled-skills vs skills
- `assets/shared/bundled-skills/` = 附带第三方技能，不进 `polaris/` 命名空间、不改 `{{SKN_SPR}}`、不做 policies 注入。
- 判据：是 Polaris 工作流的一个阶段？是 → `assets/<lang>/skills/`；只是工具 → `bundled-skills/`。
- 拷贝走目录级任务 + `copyDirContents` 的 `shouldCopy` 白名单（勿改「拷完再删」，沙箱拦 `fs.rm`）。

## 安装与平台护栏（Windows / root / 伴生 CLI）
- 安装判据 = 全局目录可写，不是「是否 root」。`polaris-flow` 本体禁 `--prefix` 绕开；伴生 CLI（openspec/codegraph）用 `--prefix ~/.polaris/cli` = 有效（定位走 `resolveCliExecutable()` 绝对路径）。
- `polaris init` 拒绝 root（`evaluateRootGuard`，容器/CI 用 `POLARIS_ALLOW_ROOT=1`）。git 缺失只提示不阻断。
- `install.ps1` 三约束：调 `npm.cmd`（非 `npm`）；UTF-8 BOM + CRLF；bash 缺失只警告。探测可写性时目录不存在则向上找最近已存在祖先。MAX_PATH 无风险（161 < 260）。

## state.yaml 双层字段语义（2026-10-19）
- workflow.tdd_mode/build_mode/signals = 全局决策字段（技能写入）；runtime 同名字段 = 运行细节记录，两层并存。
- 顶层 `verify_mode` 保留且必须写入（与 runtime.verify.verify_mode 成对）。

## Shell 边界（2026-10-24，勿回退）
- 运行时已 100% node 化（`.mjs`），不再依赖 bash；凡运行时脚本写 `.mjs`，禁止新增运行时 `.sh`。
- 保留 `.sh`：`install.sh` / `devops/*.sh` / `test/shell/*.sh` 三类非运行时链。权威源已同步 `AGENTS.md`。
