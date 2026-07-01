# Polaris Flow

Polaris Flow 是面向 AI 编码环境的一站式工作流平台，覆盖**安装、工作流配置、Skills 分发、Dashboard 可视化**等全套能力，基于 OpenSpec + Superpowers + Spec-kit 体系，从项目初始化到 change 跟踪与状态展示完整闭环。

## 核心能力

| 能力 | 说明 | 主要目录 |
| --- | --- | --- |
| **安装** | 在用户项目及支持的 AI 平台中初始化工作流工具链 | `src/commands/init.ts`、`src/core/` |
| **工作流配置** | 内置并配置 OpenSpec schema（backend / frontend / test 等） | `assets/`、`src/core/` |
| **Skills** | 打包并向目标平台分发工作流 Skill（中英文） | `assets/skills/`、`assets/skills-zh/`、`assets/manifest.json` |
| **Dashboard** | 本地只读可视化 `openspec/changes/` 工作流状态 | `src/dashboard/` |
| **生命周期** | status、doctor、update、uninstall 等运维命令 | `src/commands/` |

## 环境要求

- Node.js >= 20
- pnpm 10.18.3

## 本地开发

```bash
pnpm install
pnpm run build
pnpm test
node bin/polaris.js --version
```

一键构建（install + build，可选 lint/test）见 [docs/build.sh.md](docs/build.sh.md)。

## 计划命令

- `polaris init` — 为项目初始化工作流，安装工作流、Harness环境
- `polaris status` — 展示当前change与工作流状态
- `polaris dashboard` — 启动本地Dashboard
- `polaris doctor` — 诊断环境、schema 与 skill 安装状态
- `polaris update` — 更新 schema、skills 与依赖
- `polaris uninstall` — 卸载已安装组件

## 许可证

MIT
