# Command Registration — 宿主中立命令注册

## 概述

polaris-flow 的命令文件是**宿主中立的 Markdown**：一份 `assets/{zh,en}/commands/` 由 `init` / `update` 分发到各宿主的命令目录。宿主差异由**安装器**在落盘时按平台能力展开，源文件不改写。

三个占位符各管一件事，**不要混用**：

| 占位符 | 管什么 | 展开依据 |
| --- | --- | --- |
| `{{SKN_SPR}}` | 技能名分隔符 | `Platform.skillsLayout`：nested → `:`；flat → `-` |
| `{{CMD_SPR}}` | 命令名分隔符 | `Platform.commandLayout`：nested / namespaced-flat → `:`；flat → `-` |
| `{{CMD_NS}}` | frontmatter `name` 的命名空间前缀 | `Platform.commandLayout`：仅 namespaced-flat 的分类命令 → `<分类>:`，其余 → 空 |

两个平台能力互相独立（`skillsLayout` 与 `commandLayout`），当前配置：

- `claude`、`qoder` = 技能 nested / 命令 nested
- `trae`、`trae-cn` = 技能 **flat** / 命令 **namespaced-flat**
- `cursor` = 技能 nested / 命令 **flat**

## 落盘位置

| 命令布局 | 落盘（相对 `<contextDir>`） | 命令名 |
| --- | --- | --- |
| `nested` | `commands/psfl/<相对路径>`，如 `commands/psfl/coding/normal.md` | `/psfl:coding:normal` |
| `flat` | `commands/psfl-<相对路径，`/` → `-`>.md`，如 `commands/psfl-coding-normal.md` | `/psfl-coding-normal` |
| `namespaced-flat` | `commands/psfl/<相对路径，`/` → `-`>.md`，如 `commands/psfl/coding-normal.md` | `/psfl:coding:normal` |

源：`assets/{zh,en}/commands/**/*.md`（支持分类子目录）。
`<contextDir>` 由平台决定：Claude Code `.claude`、Cursor `.cursor`、Trae / Trae-CN `.trae`、Qoder `.qoder`。

**`flat` 连命名空间目录一起去掉**（否则等于没扁平化），命名空间改由 `psfl-` 文件名前缀承担（与 OpenSpec 的 `opsx-*.md` 同构）。**`namespaced-flat` 保留 `psfl/` 目录但只留一层**：分类压进文件名，不建子目录。

## 命名推导示例

以 `commands/coding/normal.md` 为例，各平台落盘后的 frontmatter 与命令名：

| 平台 | 落盘 | `name` | `triggers` | 命令名 |
| --- | --- | --- | --- | --- |
| Claude Code / Qoder | `psfl/coding/normal.md` | `normal` | `["/psfl:coding:normal"]` | `/psfl:coding:normal` |
| Trae / Trae-CN | `psfl/coding-normal.md` | `coding:normal` | `["/psfl:coding:normal"]` | `/psfl:coding:normal` |
| Cursor | `psfl-coding-normal.md` | `normal` | `["/psfl-coding-normal"]` | `/psfl-coding-normal` |

三个平台的 `command_prefix` 恒为 `psfl`。

**为什么 Trae 的 `name` 带冒号**：一层平铺把分类压进了文件名（`coding-normal.md`），宿主不再能从路径读到 `coding` 这一层；因此用 `{{CMD_NS}}` 把分类命名空间写进 `name`，`command_prefix` + `name` 拼回 `/psfl:coding:normal`。文件名本身不含 `:`（Windows 禁止），跨平台安全。

> `name: coding:normal` 是合法 YAML 标量——`:` 后无空格，不触发键值解析。

顶层命令（`flow.md` / `prd.md` / `prototype.md`）没有分类目录，`{{CMD_NS}}` 在所有平台都展开为空。其余路径对照：

| 仓库内路径 | `nested` | `namespaced-flat` | `flat` |
| --- | --- | --- | --- |
| `commands/flow.md` | `psfl/flow.md` → `/psfl:flow` | `psfl/flow.md` → `/psfl:flow` | `psfl-flow.md` → `/psfl-flow` |
| `commands/prd/readiness.md` | `psfl/prd/readiness.md` → `/psfl:prd:readiness` | `psfl/prd-readiness.md` → `/psfl:prd:readiness` | `psfl-prd-readiness.md` → `/psfl-prd-readiness` |
| `commands/maintance/hotfix.md` | `psfl/maintance/hotfix.md` → `/psfl:maintance:hotfix` | `psfl/maintance-hotfix.md` → `/psfl:maintance:hotfix` | `psfl-maintance-hotfix.md` → `/psfl-maintance-hotfix` |

> Claude Code 中 `name` **只是显示标签**，命令名从相对路径推导（对照 OpenSpec：`.claude/commands/opsx/explore.md` 的 `name` 为 `"OPSX: Explore"`，实际命令是 `/opsx:explore`）。Cursor 命令名 = 文件名。只有 Trae / Trae-CN 由 `command_prefix` + `name` 共同决定命令名——故 `{{CMD_NS}}` 只对这两个平台生效。

## 命令布局的平台依据

| 平台 | 命令发现行为 | 采用 |
| --- | --- | --- |
| Claude Code / Qoder | 递归 `commands/**`，子目录 → `:` 命名空间（`frontend/component.md` → `/frontend:component`） | `nested` |
| Trae / Trae-CN | 命令文件需落在 `commands/psfl/` 下但不建子目录；命令名由 `command_prefix` + `name` 推导，`name` 可带 `:` 形成多段命名空间 | `namespaced-flat` |
| Cursor | **IDE 递归扫描子目录；CLI 只读顶层 `.md`、跳过全部子目录** | `flat`（IDE + CLI 双通） |

> 历史旁证：`.claude/commands/opsx/*.md`（嵌套）vs `.cursor/commands/opsx-*.md`（扁平）——OpenSpec 正是按「Claude 嵌套 / Cursor 扁平」分开落盘的。

## 命令文件内的占位符

```markdown
---
name: {{CMD_NS}}normal
command_prefix: psfl
triggers: ["/psfl{{CMD_SPR}}coding{{CMD_SPR}}normal"]
description: ...
---

引用技能  `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal`
引用命令  `/psfl{{CMD_SPR}}flow`
```

| 平台 | 技能名 | 命令名 | `name` |
| --- | --- | --- | --- |
| Claude Code / Qoder | `polaris:coding:normal` | `/psfl:coding:normal` | `normal` |
| Trae / Trae-CN | `polaris-coding-normal` | `/psfl:coding:normal` | `coding:normal` |
| Cursor | `polaris:coding:normal` | `/psfl-coding-normal` | `normal` |

- `{{CMD_SPR}}` 是**全文常量替换**；`{{CMD_NS}}` 按**该命令是否有分类目录**展开。两者都由 `install/commands.ts` 的 `expandCommandNames` / `resolveCommandNamespace` 在落盘时求值。
- **未展开的占位符落到用户项目里就是坏引用**。新增命令时：技能名用 `{{SKN_SPR}}`、命令名用 `{{CMD_SPR}}`、`name` 用 `{{CMD_NS}}<文件名 stem>`，都不要写死。写成字面量 `/psfl:*` 会与占位符混用，脚本批量改名时漏改即留坏引用。
- `{{CMD_NS}}` 只在 `commands` 域展开，技能域不消费它。

## 已注册命令

命令名以 Claude Code（`nested`）为准；**Trae / Trae-CN 完全一致**，Cursor 把 `:` 全换成 `-` 并去掉命名空间层级（如 `/psfl:coding:normal` → `/psfl-coding-normal`）。

| 命令 | 作用 |
| --- | --- |
| `/psfl:flow` | 总入口：按「类别 → 具体功能」两级菜单选择，收集附加上下文后加载对应技能。**受理期不做需求预检、不做档位判定**（分别归 `intake` 的准入检查与 `specify` 出口的权威判档） |
| `/psfl:coding:tweak` | 开发入口 · **简单档**：加载薄编排技能 `tweak`（**只声明档位**）→ 由 `intake` 建任务并转交 `specify`；序列 `specify → tasks → build → verify → ship` |
| `/psfl:coding:normal` | 开发入口 · **常规档**：加载薄编排技能 `normal` → `workflow.mode=normal`；序列 `specify → plan → tasks → build → verify → ship` |
| `/psfl:coding:strict` | 开发入口 · **复杂档**：加载薄编排技能 **`strict`** → `workflow.mode=strict`；序列含 `design`（可选） |
| `/psfl:coding:resume` | 接续未完成的 coding 任务（**不声明档位**，加载 `intake` 恢复在途任务并按当前 `phase` / `skill` 转交） |
| `/psfl:maintance:hotfix` | 生产故障修复入口（预声明通道 `hotfix`，交出到 `debug:diagnose`；三段通道 diagnose → patch → closeout，发布 / 灰度 / 回滚由人在环执行） |
| `/psfl:maintance:bugfix` | 测试缺陷修复入口（预声明通道 `bugfix`，交出到 `debug:diagnose`；三段通道 diagnose → patch → closeout + **自有收尾**归档到 `docs/troubleshooting/`；**不使用 openspec**，不交 `coding/ship`） |
| `/psfl:prd:readiness` | 需求就绪度评估（研发准出判定：五维度加权评分 + PASS/CONDITIONAL/FAIL；`ship` Step 1 的独立入口） |

## 退化路径

| 宿主能力 | 命令可用性 | 调用方式 |
| --- | --- | --- |
| 完整命令支持 | `/psfl:flow` 可用 | 用户直接输入命令 |
| 仅 skill 加载 | 不可用 | 直接加载 `polaris:prd:discovery` 等技能 |
| 不支持 skill | 不可用 | polaris-flow 不可用 |

## 新增命令的操作清单

1. 在 `assets/zh/commands/<family>/` 写命令文件（frontmatter 含 `name` / `command_prefix` / `triggers` / `description`）；`<family>` 与技能族同名（`coding` / `prd` / `maintance`），入口类命令直接放 `commands/` 根
2. `name` 写 `{{CMD_NS}}<文件名 stem>`；`command_prefix` 固定 `psfl`；`triggers` 用 `{{CMD_SPR}}` 占位符（如 `["/psfl{{CMD_SPR}}coding{{CMD_SPR}}normal"]`）
3. 正文引用**技能**用 `{{SKN_SPR}}`、引用**命令**用 `{{CMD_SPR}}`，两者都不写死
4. 按项目约定**只维护中文版**（`assets/zh/commands/`）；英文版暂无维护义务
5. 一般**无需改安装代码**——`installPolarisCommandsForPlatform` 扫描目录自动分发，落盘路径由 `resolveCommandDest` 按 `commandLayout` 推导；只有当新命令需要**新的平台能力**时才动 `Platform.commandLayout`
6. **不要放非命令文件进 `commands/`**：安装器无过滤（`walkFilesSafe` 纯递归，`assets/layout.ts` 的 `shouldSkipAsset` 只服务 skills 域），任何 `.md` 都会被落盘并注册成 slash command。命令的伴生资料请**内联进命令正文**，或放到语言包顶层 `policies/`（落 `plugin_root/policies/`，不进命令树）。**不要指望用 `_` 前缀规避**——官方文档均无下划线豁免规则
