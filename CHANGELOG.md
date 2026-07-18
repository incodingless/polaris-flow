# Changelog

## What's Changed [0.1.1] - 2026-07-15

### Added

- **平台安装布局**: 按平台 `skillsLayout`（nested / flat）将 polaris 资产装到正确目标目录；Trae 子 skill 扁平为 `polaris-flow-*`，其余平台嵌套进 `skills/polaris-flow/`
- **包内公共内容安装**: init/update 同步安装 adapters、policies、templates、hooks 脚本到插件根
- **agents 安装**: 将 `cross-review-agent` 等写入 `.<platform>/agents/`
- **config.yaml**: 写入 `platform` 与 `plugin_root` 字段

### Changed

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

### Fixed

- **hooks**: 从 `assets/shared/hooks` 扫描并拷贝脚本；settings 中命令指向 `skills/polaris-flow/hooks/`
- **rules**: 正确解析 `skills/hard-stops.md` 源路径

### Tests

- **install-layout / skills-install**: 覆盖 nested/flat 落盘、hooks 命令路径、agents 与 config 字段；skills 步骤不再隐式安装 agents

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
