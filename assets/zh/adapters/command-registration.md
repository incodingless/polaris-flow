# Command Registration — 宿主中立命令注册

## 概述

polaris-flow 的命令文件是**宿主中立的 Markdown**：一份 `assets/{zh,en}/commands/` 由 `init` / `update` 分发到各宿主的命令目录。宿主差异（命令名分隔符、是否扁平化）由**安装器**在落盘时按平台能力展开，**源文件不改写**。

两个平台能力互相独立，**不要混用**：

| 能力 | 字段 | 取值 | 影响 |
| --- | --- | --- | --- |
| 技能布局 | `Platform.skillsLayout` | `nested`（默认）/ `flat` | 技能目录结构；`{{SKN_SPR}}` 展开为 `:` 或 `-` |
| 命令布局 | `Platform.commandLayout` | `nested`（默认）/ `flat` | 命令落盘路径；`{{CMD_SPR}}` 展开为 `:` 或 `-` |

当前配置：`claude` = 技能 nested / 命令 nested；`trae`、`trae-cn` = 技能 **flat** / 命令 nested；`cursor` = 技能 nested / 命令 **flat**。

## 落盘位置

| 命令布局 | 目标 |
| --- | --- |
| `nested` | `<contextDir>/commands/polaris/<相对路径>`，如 `commands/polaris/coding/normal.md` |
| `flat` | `<contextDir>/commands/polaris-<相对路径，`/` → `-`>.md`，如 `commands/polaris-coding-normal.md` |

源：`assets/{zh,en}/commands/**/*.md`（支持分类子目录）。
`<contextDir>` 由平台决定：Claude Code `.claude`、Cursor `.cursor`、Trae / Trae-CN `.trae`。

**`flat` 会连 `polaris/` 命名空间目录一起去掉**——不然等于没扁平化。命名空间改由 `polaris-` 文件名前缀承担（与 OpenSpec 的 `opsx-*.md` 同构）。

**命名推导示例**：

| 仓库内路径 | `nested` 落盘 → 命令名 | `flat` 落盘 → 命令名 |
| --- | --- | --- |
| `commands/flow.md` | `commands/polaris/flow.md` → `/polaris:flow` | `commands/polaris-flow.md` → `/polaris-flow` |
| `commands/coding/normal.md` | `commands/polaris/coding/normal.md` → `/polaris:coding:normal` | `commands/polaris-coding-normal.md` → `/polaris-coding-normal` |
| `commands/prd/readiness.md` | `commands/polaris/prd/readiness.md` → `/polaris:prd:readiness` | `commands/polaris-prd-readiness.md` → `/polaris-prd-readiness` |
| `commands/maintance/hotfix.md` | `commands/polaris/maintance/hotfix.md` → `/polaris:maintance:hotfix` | `commands/polaris-maintance-hotfix.md` → `/polaris-maintance-hotfix` |
| `commands/maintance/bugfix.md` | `commands/polaris/maintance/bugfix.md` → `/polaris:maintance:bugfix` | `commands/polaris-maintance-bugfix.md` → `/polaris-maintance-bugfix` |

> frontmatter 的 `name` 在 Claude Code 中**只是显示标签**，不参与命令名推导（对照 OpenSpec：`.claude/commands/opsx/explore.md` 的 `name` 为 `"OPSX: Explore"`，实际命令是 `/opsx:explore`）。因此**改文件名 / 改相对路径 = 改命令名，改错即破坏引用**。

## 命令布局的平台依据

`nested` / `flat` 不是随手定的，依据是各宿主的官方行为（2026-09-11 取证）：

| 平台 | 命令发现行为 | 采用 |
| --- | --- | --- |
| Claude Code | 递归 `.claude/commands/**`，子目录 → `:` 命名空间（`frontend/component.md` → `/frontend:component`） | `nested` ✅ |
| Trae / Trae-CN | `.trae/commands` **支持最多 3 层嵌套**（v3.5.56 / 2026-05 起，官方文档有完整目录树示例） | `nested` ✅ |
| Cursor | **IDE 递归扫描子目录；CLI 只读顶层 `.md`、跳过全部子目录** | `flat`（IDE + CLI 双通） |

> 历史旁证：`.claude/commands/opsx/*.md`（嵌套）vs `.cursor/commands/opsx-*.md`（扁平）——OpenSpec 正是按「Claude 嵌套 / Cursor 扁平」分开落盘的。
> **Trae 的已知不确定点**：官方文档只说明「支持 3 层嵌套」，**未明确子目录是否计入命令名**。若实测发现 Trae 侧命令名与 `/polaris:flow` 不符，把该平台的 `commandLayout` 改成 `flat` 即可（改一个字段，无需动源文件）。

## 命令文件内的占位符

两个占位符各管一件事，**互不替代**（Trae 就是「技能 flat、命令 nested」）：

| 占位符 | 管什么 | 展开依据 | nested | flat |
| --- | --- | --- | --- | --- |
| `{{SKN_SPR}}` | **技能名**分隔符 | `skillsLayout` | `:` | `-` |
| `{{CMD_SPR}}` | **命令名**分隔符 | `commandLayout` | `:` | `-` |

```markdown
引用技能      `polaris{{SKN_SPR}}prd{{SKN_SPR}}discovery`
引用命令      `/polaris{{CMD_SPR}}coding{{CMD_SPR}}normal`
frontmatter   triggers: ["/polaris{{CMD_SPR}}coding{{CMD_SPR}}normal"]
```

- **Claude Code**：技能名 → `polaris:prd:discovery`；命令名 → `/polaris:coding:normal`
- **Trae / Trae-CN**：技能名 → `polaris-prd-discovery`（skillsLayout=flat）；命令名 → `/polaris:coding:normal`（commandLayout=nested）
- **Cursor**：技能名 → `polaris:prd:discovery`（skillsLayout=nested）；命令名 → `/polaris-coding-normal`（commandLayout=flat）

**未展开的占位符落到用户项目里就是坏引用**。新增命令时：技能名前缀一律用 `{{SKN_SPR}}`，命令名前缀一律用 `{{CMD_SPR}}`，两者都不要写死。
（历史坑：正文里写死 `/polaris:*` 与 `{{SKN_SPR}}` 混用，导致脚本批量改名时容易漏改。）

## 已注册命令

命令名以 Claude Code（`nested`）为准。Cursor 侧把 `:` 换成 `-` 并去掉 `polaris` 内的命名空间层级（如 `/polaris:coding:normal` → `/polaris-coding-normal`）。

| 命令 | 作用 |
| --- | --- |
| `/polaris:flow` | 总入口：开发类路径走「前置需求预检 → 强制附需求 → 询问自动评估复杂度 → 按 3 档路由」；其他类直接菜单选择 |
| `/polaris:coding:tweak` | 小改动（跳过 brainstorming 与完整 plan） |
| `/polaris:coding:normal` | 常规需求（P02 单入口：四件套 + 双向守门 + 合并主审） |
| `/polaris:coding:sdd` | SDD 驱动开发（P03 完整链路的别名，等价 `/polaris:flow` 路由 `complex`） |
| `/polaris:maintance:hotfix` | 快速修复 bug（生产场景，根因已定位：跳过 brainstorming、constitution 审计、出口检查） |
| `/polaris:maintance:bugfix` | 测试缺陷标准化修复（五段：triage 定性 → diagnose 定位 → prescribe 方案 → patch 实现与自验 → closeout 关闭Bug + 自有收尾归档到 `docs/troubleshooting/`；**不使用 openspec**，不交 `coding/ship`；含两处人确认） |
| `/polaris:prd:readiness` | 需求就绪度评估（研发准出判定：五维度加权评分 + PASS/CONDITIONAL/FAIL；`ship` Step 1 的独立入口） |

## 退化路径

| 宿主能力 | 命令可用性 | 调用方式 |
| --- | --- | --- |
| 完整命令支持 | `/polaris:flow` 可用 | 用户直接输入命令 |
| 仅 skill 加载 | 不可用 | 直接加载 `polaris:prd:discovery` 等技能 |
| 不支持 skill | 不可用 | polaris-flow 不可用 |

## 新增命令的操作清单

1. 在 `assets/zh/commands/<family>/` 写命令文件（frontmatter 含 `name` / `command_prefix` / `triggers` / `description`）；`<family>` 与技能族同名（`coding` / `prd` / `maintance`），入口类命令直接放 `commands/` 根
2. `command_prefix` 固定 `polaris`；`triggers` 用占位符写（如 `["/polaris{{CMD_SPR}}coding{{CMD_SPR}}normal"]`），由安装器按 `commandLayout` 展开
3. 正文引用**技能**用 `{{SKN_SPR}}`、引用**命令**用 `{{CMD_SPR}}`，两者都不写死
4. 中文版确认后，同步 `assets/en/commands/`
5. 一般**无需改安装代码**——`installPolarisCommandsForPlatform` 扫描目录自动分发，落盘路径由 `resolveCommandDest` 按 `commandLayout` 推导；只有当新命令需要**新的平台能力**时才动 `Platform.commandLayout`
6. **不要放非命令文件进 `commands/`**：安装器无过滤（`walkFilesSafe` 纯递归，`assets/layout.ts` 的 `shouldSkipAsset` 只服务 skills 域），任何 `.md` 都会被落盘并注册成 slash command。命令的伴生资料请**内联进命令正文**，或放到语言包顶层 `policies/`（落 `plugin_root/policies/`，不进命令树）。**不要指望用 `_` 前缀规避**——三平台官方文档均无下划线豁免规则
