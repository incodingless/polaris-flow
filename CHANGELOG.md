# Changelog

## What's Changed [0.1.1] - 2026-08-04

### Added

- **CLI 双入口分流**: `polaris` 仅暴露用户生命周期命令（init / status / dashboard / doctor / update / uninstall）；hooks/scripts 所用命令（workflow-entry、task-state-entry、worktree-* 等）仅挂在 `polaris-flow`；`uninstall` 仍为入口占位（尚未实现）
- **polaris dashboard**: Dashboard **实现在同级 `polaris-web`**；本仓只保留启动器 `src/dashboard/server.ts`（定位兄弟目录或 `POLARIS_WEB_PATH`，执行 `scripts/dev.sh` 拉起 Vue + polaris-cli API）；支持 `--port` / `--api-port` / `--open`；删除本仓过时 `src/dashboard/web/` 占位静态页
- **hotfix-branch-create / git-branch-merge**: 核心模块 `git-branch.ts`（原 hotfix-branch）；`polaris hotfix-branch-create` 基于主干建 `hotfix/<issue_id>`；新增 `polaris git-branch-merge` / `scripts/git-branch-merge.sh` 将指定分支以 `merge --no-ff` 合入主干（脏检查、冲突 abort、源分支保留）；`diagnose` Step 3.1.B / `closeout` 生产收尾分别调用创建与合并脚本
- **worktree-commit-remove**: 新增 `polaris worktree-commit-remove` / `scripts/worktree-commit-remove.sh`：在 worktree 内 `add -A`+`commit`（已干净则跳过），再 `git worktree remove`；`closeout` 测试通道 worktree 收尾改调该脚本
- **init Superpowers 网络逃逸**: 支持 `POLARIS_GITHUB_MIRROR` 改写 clone URL、`POLARIS_SUPERPOWERS_PATH` 本地目录安装；git 默认 `HTTP/1.1` 以规避 HTTP/2 framing 失败
- **init 物化 docs/tasks 目录**: `initializePolarisCommonLayout` 按 `config.example.yaml` 的 layout 创建 `.polaris/tasks`、`openspec`、`docs/{prd,prototype,architecture,design,testcases}`；`generatePolarisConfig` 继续将 `layout.tasks.root` / `layout.docs.root` 写成项目绝对路径，docs 子键保持相对名
- **SessionStart subagent agents 缓存**: SessionStart 按宿主 `platformId` 扫描项目级 agents（算法对齐 `platform-probe.md`），写入 `.polaris/.cache/subagent-probe.json`（与 `subagent-probe` 输出同构），并注入 `SUBAGENT_PROBE_CACHE`；core `scanSubagents` / `buildSubagentProbeSnapshot`；probe 契约改为优先读该缓存再做 `task_type`/`subagent_id` 过滤
- **SessionStart subagent 能力注入**: SessionStart 按宿主 `platformId` 解析并注入 `SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION`（与路径变量同渠道：additionalContext / Cursor env / `runtime-env` / `CLAUDE_ENV_FILE`）；能力来自 `Platform.supportsSubagent`；编排在仅用默认通用 Agent 时可跳过空转 probe
- **task-state-entry**: 新增 `polaris task-state-entry` / `scripts/task-state-entry.sh`，对 `.polaris/tasks/<id>/state.yaml` 做持锁 RMW；支持 `get`/`get-json`/`set`、`enter-phase`/`complete-phase`、`set-identity`/`get-identity`（身份字段均为顶层键，无 `naming` 块）；coding 走 `runtime.<phase>`，prd/prototype 走顶层阶段块
- **workflow `--kind prototype`**: `workflow.yaml` 新增 `prototype_tasks` 列表；`workflow-entry` / `task-init` / `draft-create` / `state next` / `status` 接受 `--kind prototype`（对齐 blueprint/build/ship 脚本调用）；原型任务不建 draft，须 `--task-id` 直建 `.polaris/tasks/<id>/`，初始 phase=`blueprint`
- **manifest ignoredFiles**: `assets/manifest.json` 的 `ignoredFiles` 在 `readAssets` 收集阶段生效；支持精确路径、`dir/name` 目录树同名、以及纯 basename（默认 `README.md` / `.DS_Store`）；skills 安装另有同名兜底跳过
- **polaris-flow 功能入口命令**: 新增 `assets/zh/commands/polaris-flow.md` 作为统一入口，让用户先选再做而非直接开工——按 `.polaris/config.yaml` 的 `platform` 查询问工具注册表确定工具名（不写死 `AskUserQuestion`），依次单选「功能类别（开发/维护/需求/测试）→ 具体功能（共 11 项）」，再收集附加上下文（文件/目录/文字说明），最后按选择路由到对应入口技能；命令本身只做选择与路由，不产出任何需求、设计、代码或测试产物
- **命令资产 `{{SKN_SPR}}` 展开**: `installPolarisCommandsForPlatform` 新增 `skillsLayout` 参数，落盘时把命令正文的 `{{SKN_SPR}}` 展开为 `:`（nested）或 `-`（flat），使命令内引用的技能名与落盘技能名一致；此前命令文件原样拷贝，跨布局必然引用失效
- **命令文件分步写出**: `install/commands.ts` 新增 `writeCommandFile`，按文件粒度处理 overwrite 跳过与占位符替换，替换 `runCopyJobs` 的整批拷贝
- **config get CLI**: 新增 `polaris-flow config get language [path]`，读取 `.polaris/config.yaml` 的 `language`（支持 `--json` 输出 `language_name`）
- **get-language-name.sh**: 共享脚本 `assets/shared/scripts/get-language-name.sh`，调用 `config get` 并将 `en`/`zh` 翻译为显示名称（English/中文），init 后位于 `PLUGIN_ROOT/scripts/`
- **SessionStart 路径注入**: core `runSessionStart` 返回 `paths`（repoRoot / platformId / pluginRoot）；commands 映射为 `PLUGIN_ROOT` 等，经 `additionalContext` / Cursor `env` / `CLAUDE_ENV_FILE` / `.polaris/.cache/runtime-env` 注入会话
- **宿主 hook stdout 协议**: 分发器按平台序列化 JSON（Claude/Trae `hookSpecificOutput`，Cursor `additional_context`/`env`）；过程日志改走 TTY，避免污染宿主 stdout
- **宿主 hook stdin 归一**: Claude/Cursor/Trae 字段别名与事件判别联合；`HostHookHandler` 为分发器（读 stdin / 写 stdout / 按 event 派发），事件实现为 `HostHookEventHandler`；宿主 `.sh` 统一 `polaris-flow host-hook`
- **工作流 hooks 调用说明**: 新增 `docs/workflow-hooks-call-order.md`，按 clarify→delivery 梳理 hooks 调用顺序、作用、内部依赖与命名债
- **平台安装布局**: 按平台 `skillsLayout`（nested / flat）将 polaris 资产装到正确目标目录；flat 叶技能为 `polaris-<family>-<skill>/`，nested 进 `skills/polaris/{family}/`
- **包内公共内容安装**: init/update 同步安装 adapters、policies、templates、hooks、scripts 到插件根
- **agents 安装**: 将 `assets/<lang>/agents/` 下评审 agent（含 `propose-review-agent`、`design-review-agent`、`plan-review-agent`、`openspec-review-agent`）写入 `.<platform>/agents/`；session-start 注入 `challenger.model`
- **outside-voice 协议与模板**: `policies/outside-voice.md`、`templates/outside-voice-prompt.tmpl.md`
- **propose 主审**: 新增 `propose-review-agent`；`polaris-flow-propose` Step 4.6 派发主审 + 询问 Outside Voice
- **Dashboard 并入本仓**: `polaris-web`（Vue 3 + Vite 前端）与 `polaris-cli` 的 Dashboard API 一并并入；前端落仓库根 `dashboard/`、API 落 `src/dashboard/`，两源仓退役。迁移由 `scripts/migrate-dashboard.js` 以复制方式完成（白名单驱动、源仓只读、默认预演）
- **polaris dashboard 单进程单端口**: 同一端口同时提供 `/api/*` 与前端静态资源（`dist/web/`），就绪后自动打开浏览器；新增 `--api-only` 供前端 HMR 开发、`--no-open` 关闭自动打开。`build.js` 在 tsc 之后追加 vite 步骤，前端产物与后端编译产物同级不混层
- **Dashboard API 契约**: 新增 `docs/specs/2026-09-18-dashboard-api-contract.md` 冻结 `/api/*` 的端点、字段名、错误形状与只读性 —— 前端纯 JS、后端 TS，无共享类型，契约是唯一形式化保证

### Tests

- **CLI 双入口**: polaris 帮助仅生命周期六命令；polaris-flow 含 runtime；resolveCliEntry 识别 bin 名
- **dashboard 路径解析**: POLARIS_WEB_PATH / 包根兄弟 / cwd 兄弟
- **git-branch**: 覆盖 hotfix 创建（干净/脏/已存在/缺参）与合并进主干（成功保留源分支、脏阻断、分支不存在、源=主干）
- **worktree-commit-remove**: 覆盖有改动提交并 remove、已干净跳过提交仍 remove、缺 message
- **Superpowers 安装**: 覆盖 `trae-cn` agent id、GitHub 镜像 URL 改写、git HTTP/1.1 默认、init 摘要「Polaris 成功 + Superpowers 失败」

### Changed

- **Superpowers agent 映射**: `npx skills add` 使用平台 id（`trae-cn`）而非展示名（`Trae-CN`），与 skills CLI 注册键对齐
- **init 摘要**: Superpowers 失败单独标为组件失败，不再把已成功安装 Polaris 的平台只写成「失败：Trae-CN」
- **Superpowers 失败提示**: 明确 clone 与 npx 都依赖 GitHub，不再声称 npx 在国内更稳
- **Platform.supportsSubagent**: subagent 能力改由 `platforms.ts` 的 `Platform.supportsSubagent` + `resolveSubagentCapability` 表达，删除独立 `subagent-capability.ts`；`qoder` 重新登记且 `supportsSubagent=false`（inline）
- **命令注册文档**: `assets/zh/adapters/command-registration.md` 由「各宿主手动注册方式」（Trae 手动声明 / CodeBuddy `plugin.json`）重写为「宿主中立 Markdown + 落盘位置表 + 已注册平台表」，与 `init` / `update` 的实际分发行为对齐，去掉已失效的 `/pofl:*` 与旧平台描述
- **polaris-flow 维护类选项标注「暂不可用」**: M01/M02/M03 三项的入口技能均未落地（`maintance/hotfix` 与 `maintance/codereview` 无对应技能，`coding/` 族下也不存在 `refactor`），此前选中会直接撞上技能加载失败。现保留菜单，但在选项描述与路由表两处标注「⚠️ 暂不可用」，并在加载前拦截——照实告知用户缺的是哪个技能、询问是否改选其他功能；HARD-STOP 新增第 10 条，禁止对暂不可用选项直接开工或换用其他技能顶替，确保用户明确知道本次什么都没做而不是拿到一份错位产物
- **prd/discovery Step 2 重构为「需求组」统一流程**: 将原 2.3 分叉点（非拆分路径 / 拆分路径两套不对称步骤）重构为 2.3~2.6 四步串行——2.3 判断是否拆分 → 2.4 产出「需求组」（不拆分给需求内容 + 推荐名，拆分给子需求拆分建议 + 推荐名，归一为 1 或 N 个需求）→ 2.5 对每个需求建目录（`task-init`）、写需求内容初稿、登记 workflow 游标（`append-active`），形成可独立恢复的基础任务 → 2.6 扫描任务目录列出清单、让用户明确选中一个推进；命名由「独立阻塞点」降为「推荐名默认采用、用户可改名」；「都要做」「按建议来」「只确认清单」均判为未选择；未选中任务状态维持「未启动」，后续经 Step 1 的「B. 选择一个」恢复；任务多于 4 个时按业务系统分组两级串行询问；Step 1.5 补齐按 `state.yaml` 判断基础任务（直接进 Step 3）/续写/后续阶段的恢复映射
- **平台探测路径**: `detectionPaths` 改为相对用户主目录（`.claude` / `.cursor` / `.trae` / `.trae-cn`），去掉误提交的 `/Users/jason/...` 绝对路径；`detectPlatforms` 同时认项目 `contextDir` 与主目录标记
- **安装 config layout 路径物化**: `generatePolarisConfig` 写入 `layout.worktree` / `openspec` / `tasks.root` / `docs.root` 绝对路径；模板键 `platform` 改为 `platforms`
- **workflow 物化**: init 仅拷贝模板三列表，不再写入 `version` / `install-time`
- **插件根 polaris**: 落盘目录由 `skills/polaris-flow` 改为 `skills/polaris`；flat 叶技能为 `polaris-<family>-<skill>/`；`{{SKN_SPR}}` 仅为 `:`/`-` 分隔符；policies 注入叶技能；跳过 `backup/` 与 `requirements-engineering/`
- **task-init `--kind`**: 必填 `change|requirement|testcase`；change/testcase 建 `draft-*`；requirement **不建 draft**，须 `--task-id` 直接初始化 `.polaris/tasks/<task_id>/`；testcase 落 `.polaris/testcases/` + `testcase_plan.md`；`draft-create` 同步要求 `--kind`（拒绝 requirement）
- **workflow.yaml 多列表游标**: `active_changes` / `pending_triages` 替换为 `change_tasks` / `requirement_tasks` / `testcase_tasks`（字段 `task_id`）；`workflow-entry` 必填 `--kind`，身份旗标改为 `--task-id` / `--where-task-id`；删除 triage ops；无旧 schema 迁移（需重物化 / `polaris update`）
- **hooks/scripts 目录分离**: 宿主注册入口仅保留 `hooks/session-start.sh`；Skill 调用的薄包装与 `_polaris-cli.sh` 迁至 `scripts/`；Skill 路径改为 `$PLUGIN_ROOT/scripts/...`（无兼容包装，需 `polaris update`）；顺带将 `polaris-sync` 引用统一为 `harness-sync`
- **skills 安装流水线**: 源技能为 `family/skill` 两级（如 `coding/clarify`）+ `{{SKN_SPR}}`；nested 落 `skills/polaris/{family}/{skill}/`，flat 叶技能落 `polaris-<family>-<skill>/`；`{{SKN_SPR}}` 仅为 `:`/`-`；policies 注入叶技能 `policies/`；跳过 `backup/`、`requirements-engineering/`、`.workbuddy/`
- **agent 安装按平台改写**: init 安装 agents 时按 `Platform.agentToolMap` 改写 frontmatter `tools`，并用 `resolveReviewAgentModel` 写入 `model`；SessionStart 对全部已注册平台刷新 model
- **platform 解析**: 无效 `--platform` 回退 `.polaris/config.yaml`，不再把未知字符串当有效 id

- **intention-validate 分层**: 校验逻辑留在 core（返回 `missing` / `payload` / `message`，不写控制台）；`commands/hooks/intention-validate.ts` 薄包装负责 stdout JSON 与 stderr 阻断信息，与 task-init / draft-create 一致
- **SessionStart I/O 与平台边界**: stdin 解析、platform resolve、成功摘要均在 `commands/hooks`；core 只消费已归一的 `projectPath` / `sessionId` / `platformId`，经注入 `HookIo` 写过程日志
- **init 选择逻辑迁入 prompts**: `selectScope` / `selectLanguage` / `selectPlatforms` / `buildInstallPlans`（及 `PlatformPlan`）从 `init.ts` 迁入 `prompts.ts`；init 只保留安装编排与结果展示
- **hooks CLI 入口**: hooks 薄包装 `_polaris-cli.sh` 只调用 `polaris-flow`；用户侧 init/status 等仍用 `polaris`（package.json 双 bin）
- **getAssetsDir 归位**: 从 `assets/paths` 迁入 `config/polaris-paths`，安装与命令侧统一从此取包内 assets 路径
- **init 目录初始化**: 新增 `install/layout`（`initializeProjectLayout`）；按注释创建全局/项目 `.polaris` 文件、scope 区分 worktree、平台 skills/commands/agents/rules 与 polaris-flow 子目录；路径助手归并 `polaris-paths`；`installPolarisForPlatform` 第一步调用 layout；`copy-jobs` 并入 `file-system`
- **worktree 模块合并**: `worktree-create` / `worktree-merge-status` / `worktree-rebase-ff` 核心合并为 `src/core/hooks/worktree.ts`，导出 `create` / `merge` / `rebase`；CLI 与薄包装命令名不变
- **config 读写层复用**: 扩展 `polaris-config`（模板对齐 + kebab/snake 归一 + save/patch + 取值辅助）、新增 `task-state` / `polaris-paths`；hooks（session-start、task-init/finalize、constitution-validity、draft-create、workflow-cursor/lock）改为只调用 `src/core/config`，不再本地解析 RawConfig 或字符串改 state
- **workflow-state 合并**: 将 hooks `workflow-cursor`（`active_changes` / `pending_triages`）并入 `src/core/config/workflow-state.ts`；删除重复模块；`status` 改为展示 `.polaris/workflow.yaml` 游标字段
- **types 归并**: 删除 `src/core/types.ts`，`Language` / `InstallScope` 统一由 `polaris-config.ts` 导出
- **plugin 探测合并**: 将 hooks `plugin-presence`（global→project 详细探测与安装提示）并入 `integration/detect.ts`，与 `hasSkills` 共用 marker；session-start 改从 detect 导入
- **hooks 路径统一**: hooks 内 `.polaris` / `.worktrees` 路径一律经 `polaris-paths` 获取；`ship-cleanup` 清理目标为 `.polaris/tasks/<id>{,.snapshot}`
- **废除 .harness 路径**: `polaris-paths` / worktree / harness-sync / scorers 默认目录全部改为 `.polaris`（tasks、metrics、archive、overrides）
- **getPluginRoot**: 签名改为 `(projectPath, platform)`，落盘 `.<platform>/skills/polaris-flow`；新增相对路径 `getPluginRootRelPath`
- **task 模块合并**: `task-init` / `task-finalize` 核心合并为 `src/core/hooks/task.ts`，导出 `init` / `finalize`；CLI 命令名不变
- **主链路 hooks 迁 TypeScript**: 除 scorers 外，`workflow-entry`、`draft-create`、`task-init`/`task-finalize`、`tasks-lint`、`constitution-validity`、`worktree-*`、`harness-sync`、`ship-cleanup`、`intention-validate` 均迁入 `src/core/hooks/`，扁平 CLI `polaris <name>`；各 `.sh` 经 `_polaris-cli.sh` 薄包装转发；Skill 调用路径不变
- **intention-validate**: 原 `pre-design-validate` 重命名迁 TS；按 propose 必含节校验 `intention.md`（存在且非空）；`pre-design-validate.sh` 保留为别名
- **structure-create 别名化**: 废弃 `.harness/changes` 逻辑，薄包装转发 `draft-create`（`.polaris/tasks`）
- **session-start 迁 TypeScript**: 业务逻辑迁入 `src/core/hooks/`，经 `polaris session-start` 暴露；`session-start.sh` 改为薄包装（CRLF 自愈后转发 CLI）；宿主 `hooks.json` 命令不变；`plugin-check.sh` 语义移植到 `integration/detect.ts`（脚本文件保留为遗留）
- **plan 主审 agent 化**: 退役独立 `plan-review` skill；新建 `plan-review-agent`，由 `polaris-flow-plan` 派发一次性主审并落盘 `plan-review-report.md`（主审不可跳过）
- **Outside Voice 统一**: `openspec-review-agent` 专责挑战主审结论；design/plan 主审后均按 outside-voice 协议询问用户再派发
- **plan 评审标准归位**: 将 `scope-challenge` / `four-section-review` / `engineering-mindset` / `test-review-methodology` / `main-review-summary` 恢复到 `skills/plan/`；`plan-review-agent` 经 `StandardsRoot` 强制 `read_file` 后再评审
- **安装编排显式化**: `installPolarisForPlatform` 按 skills → commands → agents → rules → hooks 显式调用；`copyPolarisSkillsForPlatform` 不再顺带安装 commands/agents；init/update 统一走编排入口
- **core 目录重组**: 按安装域拆分 `src/core`——`install.ts` 为编排入口，`install/` 承载 skills/commands/hooks/rules/agents；`platform/`、`assets/`、`config/`、`deps/` 分域；`workflow.ts` 重命名为 `config/workflow-state.ts`
- **core 去重**: 合并 claude/gemini adapter；统一 `copyDirContents` / hooks JSON IO / `runCopyJobs`；`getNodeToolExecutable` 与 `compareVersions` 共用；删除死导出与孤儿注释
- **core 注释**: 补齐 `src/core` 模块文件头与关键导出 API 的中文说明
- **command-adapters 合并**: 将 `install/command-adapters/` 下 8 个文件（index/registry/types + 5 个 adapter）合并为单个 `adapters.ts`；提取 `rewriteColonTrigger` 与 `joinFrontmatter` 公共工具，消除 4 个 adapter 重复的 body 改写逻辑
- **hooks 合并**: 将 `install/hooks/` 下 4 个文件（index/command/json-io + formats/index）合并为单个 `install/hooks.ts`；JSON IO 工具上移到 `utils/json-io.ts` 供 hooks 与 Pi extension 共用，消除 `install/commands.ts` 跨层依赖 hooks 子目录
- **manifest-reader 合并**: 将 `install/manifest-reader.ts`（纯包装层）合并进 `assets/manifest.ts`，`Manifest` 类型与 `readManifest`/`getManifestSkills` 直接在 manifest 模块导出
- **working-dirs 合并**: 将 `install/working-dirs.ts`（3 行 ensureDir）合并进 `config/polaris-config.ts`，与 init 阶段其他项目结构准备同模块
- **死代码删除**: 删除 `4cb4d6d` 移动时遗留的 `src/core/manifest.ts` 与 `src/core/polaris-config.ts`（与 `assets/manifest.ts`、`config/polaris-config.ts` 完全重复，无人 import）
- **平台探测简化**: 删除 `getPlatformSkillsDirs`（`getPlatformSkillsDir` 的单元素数组包装），`detectPlatforms` 与 `hasSkills` 直接用单值调用
- **installSource 抽离**: 将 `installSource`（外部源 skills 拷贝执行器）从 `install/commands.ts` 抽到独立的 `install/source-installer.ts`，`deps/superpowers.ts` 改 import `../install/source-installer.js`，修复 deps 反向依赖 install/commands 的分层违反
- **Pi extension 拆分**: 将 Pi 平台 TS extension 生成（`createPiCommandExtension`/`renderPiCommandExtension`/`getTopLevelSkillNames`/`PI_COMMAND_EXTENSION_FILE`）从 `install/commands.ts` 拆到独立的 `install/pi-extension.ts`，`commands.ts` 仅保留分流调度，不再混入代码生成逻辑
- **init config 生成**: 从 `config.example.yaml` 生成带注释的 `.polaris/config.yaml`，覆盖语言/平台/作用域/路径等运行时字段；`--overwrite` 时整文件重写
- **init 覆盖策略**: `--overwrite` / `--skip-existing` 可组合——仅 overwrite 四者重装；仅 skip-existing 按组件跳过；两者都传时 OpenSpec/Superpowers/Codegraph 跳过、Polaris 重装
- **hooks 宿主配置安装**: Trae 写独立 `hooks.json`，Claude/Cursor 写 `settings*.json` 的 `hooks` 字段；已存在时按事件/matcher/command 合并，`--overwrite` 时覆盖 Polaris hooks（settings 其它键保留）
- **polaris-paths 职责拆分**: 平台/插件路径（`getPlugin*` / `getPlatform*` / 相关常量）迁入 `platforms.ts`；`getInstallSkillBase` / `resolveWorktreeRoot` 迁入 `install/layout`；合并重复的 `getPlatformContextDir`（调用方统一从 `platforms` 取）
- **assets/layout 相对路径**: 落盘映射改用平台 `contextDir`/`globalContextDir` 相对片段，不再依赖绝对路径的 `getPlatformContextDir`
- **发布包 assets 源路径**: `getAssetsDir` / `getShared*` / 各 template 源从 `polaris-paths` 迁入 `assets/manifest`；`polaris-paths` 只保留运行时 `.polaris` / worktree 路径；`assets/layout` 只负责落盘映射

### Fixed

- **testing 技能族落盘路径**: `SKILL_FAMILIES`（`assets/layout.ts` 与 `install/skills.ts` 各一份）原为 `['coding','prd','test']`，与资产目录 `assets/<lang>/skills/testing/` 不一致——`testing` 不在族名集合内，`parseSkillAssetPath` 会把它判为独立技能，落盘成 `polaris/testing/`（含 `case/`、`acceptance/` 子目录）而非两个叶技能，导致 `polaris-flow` 菜单的 T01/T02 两项路由不到任何技能。现统一为 `['coding','prd','testing']`；族名**不可改回 `test`**，与仓库根 `test/`（单元测试）及保留目录冲突
- **decision-point 策略引用路径**: `assets/zh/policies/decision-point.md` 原指向 `polaris-flow/policies/ask-question-react-policy.md`（文件名与路径均不存在），修正为 `./policies/ask-question-react.md`；该文件是所有阻塞点的发问路由出口，坏引用会导致发问协议断链
- **OpenSpec 按平台目录落盘**: `installOpenSpec` 接收 Platform 列表；CLI 仍用 `openspecToolId`，init 后按 `contextDir`/`skillsDir`/`commandsDir` 迁入（如 trae-cn → `.trae-cn/skills`），不再把 toolId 当作平台目录
- **Superpowers 技能嵌套路径**: `installSource` 对已含 `baseDir` 的平台目录再次 `path.join(baseDir, …)`；Node `path.join` 不丢弃绝对段，会写出 `<project>/Users/.../<project>/.trae-cn/skills`。改为直接使用 `getPlatformSkillsDir`
- **平台探测双重 join**: `detectPlatforms` 对 `getPlatformContextDir` 结果不再二次 `path.join(projectPath, …)`
- **hook 返回 PLATFORM_ID**: 通用分发器在事件处理后将解析到的平台 id 写入 `HostHookEventResult.PLATFORM_ID` 与 `env.PLATFORM_ID`（Cursor SessionStart stdout 可见）
- **hook 跨平台参数**: CLI 统一接受 `--platform`；安装时替换 `_polaris-cli.sh` 的 `@PLATFORM_ID@`；SessionStart 读宿主 stdin JSON（cwd/session_id）；宿主 hooks command 改写为 `.<platform>/skills/polaris-flow/hooks/...`，不再依赖 `CLAUDE_PLUGIN_ROOT`
- **core 循环依赖**: 消除 `polaris-paths` ↔ `polaris-project-config` ↔ `platforms` 三文件 SCC；`InstallScope` 下沉为 `polaris-paths` 叶类型，config 再导出保持调用方兼容
- **core→commands 死引用**: 删除 `install.ts` 对 `commands/init` 的未使用 `PluginInstallResult` import
- **codegraph 导入路径**: `integration/codegraph.ts` 改为引用 `../command-error` 与 `../types`，修复构建失败
- **hooks**: 从 `assets/shared/hooks` 扫描并拷贝脚本；settings 中命令指向 `skills/polaris-flow/hooks/`
- **rules**: 正确解析 `skills/hard-stops.md` 源路径

### Tests

- **commands-install**: 覆盖 claude（nested）与 trae（flat）下命令落盘路径，以及菜单命令中 5 个技能引用 `{{SKN_SPR}}` 分别展开为 `polaris:<family>:<skill>` 与 `polaris-<family>-<skill>`；新增 testing 族叶技能落盘断言（`polaris/testing/case/SKILL.md` 且 `name: polaris:testing:case`）。此前测试断言族名为 `test`，与资产目录 `testing/` 不符，3 项全部失败（命令引用断言不匹配 + 落盘路径 ENOENT），族名统一后转为全通过
- **agents-install**: 覆盖 `mapAgentTools`（trae 恒等、claude/cursor 映射去重）、安装落盘 tools/model、overwrite 跳过
- **openspec relocate**: 覆盖 trae-cn 迁入 `.trae-cn`、trae 不迁入、trae+trae-cn 双保留
- **install/layout**: 覆盖 `resolveWorktreeRoot` / `getInstallSkillBase` / `initializePolarisCommonLayout` / `initializeProjectLayout`
- **hooks TS**: `workflow-entry`（锁/RMW/op）、`draft-create`/`task-init`/`task-finalize`、`tasks-lint`、`constitution-validity`、`harness-sync`/`ship-cleanup`、`intention-validate`（缺文件/缺节/空节/通过，断言 `message`/`payload`）；session-start / detect plugin 既有覆盖保留
- **config / task-state**: 覆盖 kebab↔snake 归一、旧 `lang` 兼容、`patchPolarisConfig` / `patchTaskState` 不丢字段、constitution 读 config.path
- **session-start / detect**: 覆盖 hook IO 通道、依赖探测（可注入 HOME/PATH）、缺 `.polaris` FAIL、gitignore/workflow/session 物化、agent model 注入、WARN/FAIL exit 语义
- **install-layout / skills-install**: 覆盖 nested/flat 落盘、hooks 命令路径、agents 与 config 字段；skills 步骤不再隐式安装 agents；断言 `plan-review-agent` / `openspec-review-agent` 落盘
- **skills-install / agents-install 超时修复**: 给调用 `installPolarisForPlatform` 的 5 个用例加 `INSTALL_TIMEOUT=60s`——该调用拷贝 200+ 文件实测约 15s，默认 5s 必然超时，这些用例此前长期失败且与业务逻辑无关；顺带修正 `skills-install` 的遗留断言 `polaris:flow:clarify` → `polaris:coding:clarify`、`polaris-flow-clarify` → `polaris-coding-clarify`（资产从 `flow` 族重组为 `coding`/`prd` 族后未同步，此前被超时掩盖）；nested/flat 两处补上 testing 族叶技能落盘断言
- **generatePolarisConfig**: 覆盖从模板首次生成、已存在跳过、`--overwrite` 整文件重写，以及模板注释保留
- **hooks-install**: Trae/Claude 六场景（不存在写入、合并保留用户配置、overwrite 替换 hooks）
- **hook-platform-params**: platform 解析优先级、stdin JSON、`_polaris-cli` 占位替换、hooks command 路径改写、SessionStart session_id
- **session-start.sh 集成**: 薄包装无 CLI 失败提示；stdin cwd/session_id 全链路落盘；CLI 路径优先于 stdin.cwd

### Removed

- **polaris 命令桩**: 删除 `assets/zh/commands/polaris.md`（正文仅一行 `Use the polaris:polaris skill.`），入口职责由 `polaris-flow` 命令承接；旧命令未做功能选择，会把用户直接丢进单一技能
- **plan-review skill**: 整目录（含 policies/references/prompts/`cross-review-agent`）移除，职责下沉到 agents + 父 skill
- **平台支持收窄**: 仅保留 claude / cursor / trae 三个目标平台，删除其余平台（codex / opencode / windsurf / qwen / qoder / gemini / copilot / kiro / cline / pi / lingma 等）的元数据、命令适配器、hook installer、规则格式、Superpowers agent 映射、OpenSpec 迁移与探测逻辑；`hookFormat` 类型从 7 值收窄到 `'claude-code'`，`rulesFormat` 从 `'md' | 'mdc' | 'copilot'` 收窄到 `'md' | 'mdc'`
- **Pi extension**: 删除 `install/pi-extension.ts` 与 `installCommands` 内 Pi 分流，Pi 平台不再走 TS extension 生成
- **死代码**: 删除无外部 import 的 `hasCodexPluginSuperpowers` / `hasOpenCodePluginSuperpowers` / `hasPluginSuperpowers` 及其辅助函数（`hasSuperpowersInPluginCache` / `hasOpenCodePolarisCommands`）
- **旧 Dashboard 启动链**: 移除 `--api-port`、`POLARIS_WEB_PATH`、`resolvePolarisWebRoot`（定位同级仓库）与 `startDashboard` 的子进程 spawn 逻辑，命令描述改为「单进程工作台」
- **绕过锁的 Dashboard 写路由**: 删除 `POST /api/changes/:name/tasks/:id`（直改 `tasks.md`）、`PUT /api/configs/:path`（直写配置文件）、`POST /api/changes/:name/steps/:stepId/operations` 与 `POST /api/changes/:name/validate`（依赖外部 `openspec` CLI）、`POST /api/compose` 与 `GET /api/schemas`。面板在 M1/M2 为只读，写操作推迟到 M3 并落到 CLI 原语
- **失效测试**: 删除 `test/ts/dashboard-resolve.test.ts`（被测的 `resolvePolarisWebRoot` 已移除）

## 0.1.0

- Initial project scaffold
- Project positioned as all-in-one platform: install, workflow schema, skills, dashboard
- CLI entry with `--version` and `--help`
- Directory structure aligned with comet (src/cli, commands, core, dashboard, assets, test)
- Build, lint, test, and CI pipeline
- **i18n**: 安装引导文案外置至 src/commands/i18n/messages.yaml，CLI 启动时加载缓存
- **CLI**: 实现 init / update / doctor / status 命令
- **Core**: 补全 file-system、manifest 加载、workflow/doctor 模块
- **Changed**: 项目配置目录统一为 `.polaris/`

### Added

- **init**: project scope 初始化时写入 `.polaris/config.yaml`，记录 lang、created_at、workflow、phase、auto_transition 及现有功能开关

### Changed

- **plugin-check**: 增加必填 `--plugin`（openspec / superpowers），每次调用只检测单个插件；`--platform` 必填，按「先全局、后项目」回落
- **init**: 对齐 easyflow 安装流程——Plan/Install 两阶段、按平台/组件冲突策略、进度符号与汇总输出，并写入 `.polaris/skills-lock.json`
- **命令适配器**: 新增 `src/core/command-adapters/` 注册表（default/claude/codex/windsurf/gemini/pi），init 经 adapter 安装 `assets/{zh,en}/commands/`
- **Superpowers**: 改为 GitHub shallow clone + `installSource` 复制（替代 `npx skills add`）
- **OpenSpec**: CLI 改为始终 `npm install -g`，不再在目标项目目录产生 `node_modules`；init 时自动清理旧版误装产物
- **检测**: `hasSkills` 在 project scope 下只检查项目目录，不再因 `~/.trae/skills` 等主目录已有 Superpowers 误报「已存在」
- **Superpowers 克隆**: 增加 git clone 进度提示与超时错误信息，避免 OpenSpec 完成后长时间无输出被误认为卡死
- **Superpowers 回退**: GitHub clone 失败时自动回退 `npx skills add obra/superpowers`（适配国内网络/git HTTP2 问题）
- **构建**: 新增 `scripts/build.sh` 本地一键构建脚本；构建完成后提示 link / node 调用方式，避免 `command not found: polaris`

### Docs

- **build.sh**: 新增 [docs/build.sh.md](docs/build.sh.md) 本地构建脚本使用说明
- **i18n**: messages.yaml 改为键优先结构（en/zh 并列）；CLI 在 parse 前加载 YAML，TRANSLATION_KEYS 由加载结果动态导出，消除手写键列表
