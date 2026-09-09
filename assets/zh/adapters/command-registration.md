# Command Registration — 宿主中立命令注册

## 概述

polaris-flow 的命令文件是**宿主中立的 Markdown**：一份 `assets/{zh,en}/commands/*.md` 由 `init` / `update` 分发到各宿主的命令目录，不需要为宿主改写内容。

## 落盘位置

| 项目 | 值 |
|---|---|
| 源 | `assets/{zh,en}/commands/*.md` |
| 目标 | `<contextDir>/commands/polaris/<file>.md` |
| 命名 | 文件名即命令名，如 `polaris-flow.md` → `/polaris-flow` |

`<contextDir>` 由平台决定：Claude Code `.claude`、Cursor `.cursor`、Trae / Trae-CN `.trae`。

## 已注册平台

| 平台 id | 宿主 | 技能布局 | 命令目录 |
|---|---|---|---|
| `claude` | Claude Code | nested | `.claude/commands/polaris/` |
| `cursor` | Cursor | nested | `.cursor/commands/polaris/` |
| `trae` | Trae | flat | `.trae/commands/polaris/` |
| `trae-cn` | Trae 中文版 | flat | `.trae/commands/polaris/` |

## 命令文件内的技能名占位符

命令正文需要引用技能名，而技能名随布局变化（nested → `polaris:prd:discovery`，flat → `polaris-prd-discovery`）。
因此命令文件与技能共用 `{{SKN_SPR}}` 占位符，安装时按平台布局展开：

```markdown
引用 `polaris{{SKN_SPR}}prd{{SKN_SPR}}discovery`
```

- nested（Claude Code / Cursor）→ `polaris:prd:discovery`
- flat（Trae / Trae-CN）→ `polaris-prd-discovery`

**未展开的 `{{SKN_SPR}}` 落到用户项目里就是坏引用**，新增命令时务必用占位符而非写死技能名。

## 已注册命令

| 命令 | 作用 |
|---|---|
| `/polaris:flow` | 总入口：开发类路径走「前置需求预检 → 强制附需求 → 询问自动评估复杂度 → 按 4 档路由」；其他类直接菜单选择 |
| `/polaris:normal` | 常规需求（P02 单入口：四件套 + 双向守门 + 合并主审） |
| `/polaris:tweak` | 小改动（跳过 brainstorming 与完整 plan） |
| `/polaris:hotfix` | 快速修复 bug（跳过 brainstorming、constitution 审计、出口检查） |

## 退化路径

| 宿主能力 | 命令可用性 | 调用方式 |
|---|---|---|
| 完整命令支持 | `/polaris:flow` 可用 | 用户直接输入命令 |
| 仅 skill 加载 | 不可用 | 直接加载 `polaris:prd:discovery` 等技能 |
| 不支持 skill | 不可用 | polaris-flow 不可用 |

## 新增命令的操作清单

1. 在 `assets/zh/commands/` 写命令文件（frontmatter 含 `name` / `command_prefix` / `triggers` / `description`）
2. 正文引用技能时用 `{{SKN_SPR}}` 占位符
3. 中文版确认后，同步 `assets/en/commands/`
4. 无需改安装代码——`installPolarisCommandsForPlatform` 扫描目录自动分发
