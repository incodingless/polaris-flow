## 通用认知
- Do not preserve backward compatibility. Removeobsolete paths instead of adding compatibility layers, fallbacks, or migrations
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on topof a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the projedct before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentatiion and types.
- Make architectural decisions for the long term.Do not accept a stopgap that only works for now and is meant to be replaaced later


## 项目定位

Polaris Flow 是一站式工作流平台，不是单纯的 CLI 壳。本仓库同时承载：

- **安装**：`init` / `doctor` / `update` / `uninstall` 命令及平台检测逻辑
- **工作流 schema**：OpenSpec schema 模板与配置（`assets/` + `src/core/`）
- **Skills**：中英文 Skill 包与 `manifest.json` 安装清单
- **Dashboard**：本地工作台，单进程单端口。传输层在 `src/dashboard/`，前端子工程在 `dashboard/`，前端产物构建到 `dist/web/`

## 架构分层

```
src/cli/        → Commander 入口，只做命令注册
src/commands/   → 命令编排（交互、选项解析、输出格式化）
src/core/       → 平台无关业务逻辑（可单测）
src/utils/      → 文件 I/O 等通用工具
src/dashboard/  → Dashboard API（传输层：路由、静态托管；业务语义一律下沉 src/core/）
dashboard/      → Dashboard 前端子工程（Vue + Vite，自带 package.json/lockfile，不参与 pnpm workspace）
assets/         → 发布到 npm 的 skills、hooks等资产，由 init 分发到用户项目
```

仓库结构（单仓）：

```
polaris-flow/
├── src/            # CLI、命令编排、core、Dashboard API
├── dashboard/      # Dashboard 前端子工程；由 build.js 构建到 dist/web
├── assets/         # 发布到 npm 的 skills / hooks 等资产
└── dist/           # 构建产物：dist/*（后端 tsc）、dist/web（前端 vite）
```

`polaris-web` 与 `polaris-cli` 两仓已于 2026-09-18 并入本仓，不再单独存在。前端**不得**放进 `src/` 下 —— `lint-staged` / `format:check` / `lint` 三条 glob 均以仓库根锚定且只覆盖 `src/**`，放进去会被 prettier 重排（本仓 `semi: true`，前端风格是不写分号）。

依赖方向：`cli → commands → core → utils`，禁止反向依赖。

## 命名约定

- TypeScript 文件：kebab-case（如 `file-system.ts`）
- 命令模块：动词（如 `init.ts`、`status.ts`）
- 导出函数：camelCase + `Command` 后缀（如 `initCommand`）
- Skill 目录：kebab-case，入口固定为 `SKILL.md`

## 编码
- 必须为代码文件添加文件注释用于说明代码用途及定位
- 必须为函数或方法添加注释用于说明函数用途

## 测试

- 单元测试放在 `test/ts/`，文件命名 `*.test.ts`
- Shell 脚本测试放在 `test/shell/`，使用 Bats
- `src/cli/` 与 `src/commands/` 以 E2E 为主，单元测试覆盖 `src/core/`

## 文档

- 用户文档：README.md / README-zh.md
- 专题文档：docs/
- Skill 参考：assets/en/skills/reference/, assets/zh/skills/reference

## 测试

```bash
npx vitest run test/ts/cli.test.ts   # shell 脚本测试
npx vitest run                       # 全量测试
```

## 提交前检查

仓库已配置 Git pre-commit 钩子（husky + lint-staged），每次 `git commit` 会自动对 `src/` 下的暂存源文件运行 `prettier --write`（与 CI `format:check` 范围一致），编辑器无关，所有贡献者生效。

提交前建议手动确认（CI 会强制检查）：

```bash
pnpm format:check   # Prettier 格式检查
pnpm lint           # ESLint
pnpm build          # TypeScript 构建
pnpm test           # 单元测试
```
注：本地 Windows 若 `core.autocrlf=true`，未改动的旧文件可能因 CRLF 被 `prettier --check` 误报；钩子只处理暂存文件，不受影响，旧文件下次编辑时会自动转为 LF。

使用 Conventional Commits：`feat:`、`fix:`、`docs:`、`test:`、`chore:`、`ci:`、`refactor:`

## Shell 脚本规范

脚本必须跨平台兼容（macOS / Linux / Windows Git Bash）：

- **禁止** `sed -i`（GNU/BSD 不兼容），用 `awk` 做字段替换
- 必须兼容 `sha256sum`（GNU）和 `shasum -a 256`（BSD/macOS）
- 所有可选 grep 结果加 `|| true` 防止 `pipefail` 误杀
- 新增脚本必须加入 `beforeEach` 的拷贝列表和 manifest.json

脚本位置：
 - 

## 脚本依赖关系

```

```

新增共享工具函数时（如 hash、yaml 解析），如果两个脚本都需要，允许在各自脚本中独立实现，不强制抽共享文件。

## 双语言 Skill

skill 优化时先写中文版本（`assets/zh/skills/`），用户确认后再修改英文版本（`assets/en/skills/`）。

不能够直接修改Superpowers和OpenSpec的原始Skill

## 中文术语翻译规范

中文文档不得把英文 “gate” 直译为“门”（如“压缩门”“调试门”“确认门”），这种译法在中文语境下不自然。应按实际含义翻译：

- `gate`（阶段性检查/阻塞点）→ 根据语境用“协议”“阶段”“检查”“阻塞点”等，如 `debug gate` → “异常调试协议”
- 修饰词性质的 `proactive/active` → “主动式”，如 `proactive context compression` → “主动式上下文压缩”，不写作“主动压缩门”
- 英文版保持原术语（如 Debug Gate），仅中文版需要遵循本规范

## Changelog 规范

每次代码产生变更你都应该在完成后写Changelog，并确定是否需要升级版本号，版本号只会比master分支的版本号大一个版本，你需要确定一下当前master的版本号后做决定

如果当前已经有了一个比master大的版本Changelog，则应该追加到同一个版本的Changelog条目下

如果修改的是Skill内容，则需要等中英文完全同步之后再写Changelog

文件：`CHANGELOG.md`，新版本条目置顶。

```
## What's Changed [x.y.z] - YYYY-MM-DD

### Added / Changed / Fixed / Tests / Removed / Security

- **功能名**: 描述做了什么以及为什么
```

要点：
- 版本号与 `package.json` 的 `version` 字段一致
- 每条以 `- **粗体关键词**: ` 开头，后接具体变更内容
- 按类型分组：Added → Changed → Fixed → Tests → Removed → Security
- 描述侧重 **行为变更**（what + why），不是实现细节
- `### Tests` 条目汇总新增测试覆盖的场景，不逐条列出测试用例