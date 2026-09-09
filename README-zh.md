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

## 阶段工作流

Polaris Flow 把「开发类需求」按复杂度拆成三档；三档之外另有紧急 Bug 修复变体。每个阶段名是中英双轨：英文 token 用于 `phase` / `runtime.<x>` / `use_skill`，中文保留原有的语义称谓。

> **沿革**：本项目 2026-09 完成三次阶段改名——clarify→specify（中文保留「澄清」）、plan→tasks（「任务规划」）、propose→plan（「提案」）。代码、状态块、skill 命名空间与本文档已统一对齐。

### 1. SDD 工作流（P03 完整链路 — 跨服务 / 高风险）

入口：`/pofol:sdd` 或 `/pofol:flow` 自动评估路由 `complex` 档。

```
specify   →   plan   →   design (可选)  →   tasks  →   build  →   verify  →   ship  →   retro (可选)
(澄清)        (提案)     (深度设计)         (任务规划) (编码构建)  (验收)      (交付)    (复盘)
```

产物：OpenSpec 四件套 + `detailed-design.md`（design 命中时）+ 专项设计文档。

### 2. 常规需求工作流（P02 — 多模块协作、需规格契约）

入口：`/pofol:normal` 或 `/pofol:flow` 自动评估路由 `standard` 档。

```
specify   →   plan   →   design   →   tasks  →   build  →   verify  →   ship
(澄清)        (提案)     (深度设计)  (任务规划) (编码构建)  (验收)      (交付)
```

P02 评测压缩：1 次合并主审（复用 `polaris:coding:tasks-review-agent`），不含独立 OV；tasks 一次写成终版细计划（无覆写阶段）。

### 3. 小改动工作流（P01 — 单模块、快速变更）

入口：`/pofol:tweak` 或 `/pofol:flow` 自动评估路由 `simple` 档。

```
brief  →  tasks  →  build  →  ship
(简报)    (任务规划) (编码构建) (交付)
```

跳过 brainstorming 与完整 plan；产物为 `change-brief.md` + `tasks.md`（ship 归档前补齐四件套）。

### 4. 紧急 Bug 修复（P01 变体）

入口：`/pofol:hotfix`。

```
bug  →  tasks  →  build  →  ship
(根因) (任务规划) (编码构建) (交付)
```

**省略项**：exit-check、constitution 审计、task-split-precheck、artifact-backfill。

**硬约束**：根因未定位 / 跨 3+ 模块 / schema 变更 / 对外 API breaking change → **强制回 `/pofol:normal`**。

**强 TDD**：bug 修复必须含 `<!-- TDD 任务 -->` 标记的回归测试用例。

### 入口路由策略（`/pofol:flow`）

`/pofol:flow` 在第一步类别询问之前会做：

1. **前置需求预检**：识别开发意图（4 选 1：动作+目标+2 项 / 关键字 ≥ 80 字 / 附加文件含需求要素 / 引用 PRD·OpenSpec 制品目录）；开发类若无要求附带，最多 2 轮强制后仍空 → 强制 `complex` 档（让复杂度评估兜底）。
2. **可选复杂度评估**：复用 idea-discovery 3 档；按评估结果自动路由：

| 评估档 | 入口技能 | 链路 |
|---|---|---|
| `simple` | `polaris:coding:tweak` | brief → tasks → build → ship |
| `standard` | `polaris:coding:normal` | specify → plan → design → tasks → build → verify → ship |
| `complex` | `polaris:coding:specify`（`/pofol:sdd` 别名） | specify → plan → design(可选) → tasks → build → verify → ship → retro(可选) |

需要拆分的需求并入 `complex`：由 specify 阶段的 `task-split-precheck` 接手拆分（规模检测 → 候选拆分清单 → 决策点 → 批量模式），入口不 STOP。

复杂度评估仅对开发类强制；`/pofol:tweak` / `/pofol:normal` / `/pofol:sdd` / `/pofol:hotfix` 直达技能命令不受此预检约束。

具体见 `assets/zh/commands/polaris-flow.md` 与 `assets/zh/commands/policies/complexity-router.md`。


## 许可证

MIT
