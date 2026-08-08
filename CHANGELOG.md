# Changelog

## What's Changed [0.1.1] - 2026-08-04

### Added

- **SessionStart 路径注入**: core `runSessionStart` 返回 `paths`（repoRoot / platformId / pluginRoot）；commands 映射为 `PLUGIN_ROOT` 等，经 `additionalContext` / Cursor `env` / `CLAUDE_ENV_FILE` / `.polaris/.cache/runtime-env` 注入会话
- **宿主 hook stdout 协议**: 分发器按平台序列化 JSON（Claude/Trae `hookSpecificOutput`，Cursor `additional_context`/`env`）；过程日志改走 TTY，避免污染宿主 stdout
- **宿主 hook stdin 归一**: Claude/Cursor/Trae 字段别名与事件判别联合；`HostHookHandler` 为分发器（读 stdin / 写 stdout / 按 event 派发），事件实现为 `HostHookEventHandler`；宿主 `.sh` 统一 `polaris-flow host-hook`
- **工作流 hooks 调用说明**: 新增 `docs/workflow-hooks-call-order.md`，按 clarify→delivery 梳理 hooks 调用顺序、作用、内部依赖与命名债
- **平台安装布局**: 按平台 `skillsLayout`（nested / flat）将 polaris 资产装到正确目标目录；Trae 子 skill 扁平为 `polaris-flow-*`，其余平台嵌套进 `skills/polaris-flow/`
- **包内公共内容安装**: init/update 同步安装 adapters、policies、templates、hooks 脚本到插件根
- **agents 安装**: 将 `assets/<lang>/agents/` 下评审 agent（含 `propose-review-agent`、`design-review-agent`、`plan-review-agent`、`openspec-review-agent`）写入 `.<platform>/agents/`；session-start 注入 `challenger.model`
- **outside-voice 协议与模板**: `policies/outside-voice.md`、`templates/outside-voice-prompt.tmpl.md`
- **propose 主审**: 新增 `propose-review-agent`；`polaris-flow-propose` Step 4.6 派发主审 + 询问 Outside Voice

### Changed

- **skills 安装流水线**: 源技能保持短目录名 + `{{SKILL_NAME_PREFIX}}`；安装时 nested 替换为 `polaris-flow:`、flat 替换为 `polaris-flow-`；flat 落盘为 `polaris-flow-<skill>/`；语言包顶层 `policies/` 注入每个子技能的 `policies/`（同名覆盖）；`skills/README.md` 等根下裸文件始终装到 `skills/polaris-flow/`，不按 flat 重命名
- **agent 安装按平台改写**: init 安装 agents 时按 `Platform.agentToolMap` 改写 frontmatter `tools`，并用 `resolveReviewAgentModel` 写入 `model`；SessionStart 对全部已注册平台刷新 model
- **platform 解析**: 无效 `--platform` 回退 `.polaris/config.yaml`，不再把未知字符串当有效 id

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

- **agents-install**: 覆盖 `mapAgentTools`（trae 恒等、claude/cursor 映射去重）、安装落盘 tools/model、overwrite 跳过
- **openspec relocate**: 覆盖 trae-cn 迁入 `.trae-cn`、trae 不迁入、trae+trae-cn 双保留
- **install/layout**: 覆盖 `resolveWorktreeRoot` / `getInstallSkillBase` / `initializePolarisCommonLayout` / `initializeProjectLayout`
- **hooks TS**: `workflow-entry`（锁/RMW/op）、`draft-create`/`task-init`/`task-finalize`、`tasks-lint`、`constitution-validity`、`harness-sync`/`ship-cleanup`、`intention-validate`（缺文件/缺节/空节/通过）；session-start / detect plugin 既有覆盖保留
- **config / task-state**: 覆盖 kebab↔snake 归一、旧 `lang` 兼容、`patchPolarisConfig` / `patchTaskState` 不丢字段、constitution 读 config.path
- **session-start / detect**: 覆盖 hook IO 通道、依赖探测（可注入 HOME/PATH）、缺 `.polaris` FAIL、gitignore/workflow/session 物化、agent model 注入、WARN/FAIL exit 语义
- **install-layout / skills-install**: 覆盖 nested/flat 落盘、hooks 命令路径、agents 与 config 字段；skills 步骤不再隐式安装 agents；断言 `plan-review-agent` / `openspec-review-agent` 落盘
- **generatePolarisConfig**: 覆盖从模板首次生成、已存在跳过、`--overwrite` 整文件重写，以及模板注释保留
- **hooks-install**: Trae/Claude 六场景（不存在写入、合并保留用户配置、overwrite 替换 hooks）
- **hook-platform-params**: platform 解析优先级、stdin JSON、`_polaris-cli` 占位替换、hooks command 路径改写、SessionStart session_id
- **session-start.sh 集成**: 薄包装无 CLI 失败提示；stdin cwd/session_id 全链路落盘；CLI 路径优先于 stdin.cwd

### Removed

- **plan-review skill**: 整目录（含 policies/references/prompts/`cross-review-agent`）移除，职责下沉到 agents + 父 skill
- **平台支持收窄**: 仅保留 claude / cursor / trae 三个目标平台，删除其余平台（codex / opencode / windsurf / qwen / qoder / gemini / copilot / kiro / cline / pi / lingma 等）的元数据、命令适配器、hook installer、规则格式、Superpowers agent 映射、OpenSpec 迁移与探测逻辑；`hookFormat` 类型从 7 值收窄到 `'claude-code'`，`rulesFormat` 从 `'md' | 'mdc' | 'copilot'` 收窄到 `'md' | 'mdc'`
- **Pi extension**: 删除 `install/pi-extension.ts` 与 `installCommands` 内 Pi 分流，Pi 平台不再走 TS extension 生成
- **死代码**: 删除无外部 import 的 `hasCodexPluginSuperpowers` / `hasOpenCodePluginSuperpowers` / `hasPluginSuperpowers` 及其辅助函数（`hasSuperpowersInPluginCache` / `hasOpenCodePolarisCommands`）

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
