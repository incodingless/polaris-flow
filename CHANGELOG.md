# Changelog

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

### Changed

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
