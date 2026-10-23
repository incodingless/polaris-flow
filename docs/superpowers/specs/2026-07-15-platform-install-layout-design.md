# 平台差异化安装目标目录设计

> 日期：2026-07-15  
> 状态：Implemented  
> 结构参考：[file-structure.md](../../../file-structure.md)

## 背景与问题

`copyPolarisSkillsForPlatform` 曾对所有平台使用同一公式 `{skillsDir}/skills/{rel}`，与 file-structure 不符：

- 支持嵌套的平台应将 polaris 包落在 `skills/polaris-flow/`，子 skill 嵌套其内
- Trae 不支持 skill 目录嵌套，子 skill 须扁平为 `skills/polaris-flow-*`
- hooks 扫描路径错误、脚本未拷贝；adapters/policies/templates/agents 未正确落盘
- `config.yaml` 缺 `platform` / `plugin_root`

## 约束

| 项 | 决定 |
|----|------|
| 范围 | init 正确处理 commands / skills / hooks / agents；update 复用同一 core |
| 缺资产 | 不造 stub（无 constitution、scorers、主入口 SKILL.md 则跳过） |
| 方案 | 平台 `skillsLayout` + 统一 `resolveInstallDest` |
| assets 源树 | 不重构；仅安装时映射 |

## 布局模型

- `Platform.skillsLayout`: `nested` \| `flat`
  - `trae` → `flat`；其余 → `nested`
- 插件根（两种 layout 相同）：`{skillsDir}/skills/polaris-flow`

### 映射摘要

| 源 | nested | flat |
|----|--------|------|
| `skills/<name>/**` | `plugin_root/<name>/**` | `skills/polaris-flow-<name>/**` |
| adapters/policies/templates/hooks/hard-stops | `plugin_root/...` | 同左 |
| commands | 现有 command adapters | 同左 |
| agents | `.<platform>/agents/` | 同左 |

> **2026-09-11 勘误（后续演进，上方原表保留原貌）**
> - `command adapters` 已删除。命令安装现由 `install/commands.ts` 的 `installPolarisCommandsForPlatform` 承担，落盘路径由 `resolveCommandDest` 推导。
> - 命令布局拆出独立能力 **`Platform.commandLayout`**（`nested` | `flat`，默认 `nested`），**与 `skillsLayout` 互相独立**——Trae 就是「技能 flat、命令 nested」。`cursor` 设为 `flat`（其 **CLI 只读命令目录顶层 `.md`、跳过全部子目录**；IDE 才递归）。
> - 落盘：`nested` → `<contextDir>/commands/polaris/<相对路径>`；`flat` → `<contextDir>/commands/polaris-<相对路径，`/` → `->.md`（**连 `polaris/` 命名空间目录一起去掉**，命名空间由 `polaris-` 文件名前缀承担）。
> - 分隔符占位符因此一分为二：`{{SKN_SPR}}` 按 `skillsLayout`、`{{CMD_SPR}}` 按 `commandLayout`。
> - 完整约定见 `assets/zh/adapters/command-registration.md`。

## 模块

| 模块 | 职责 |
|------|------|
| `platform/platforms.ts` | `skillsLayout` |
| `platform/layout.ts` | `resolveInstallDest` / `getPluginRootRel` / agents 路径 |
| `install.ts` | 安装编排入口 |
| `install/skills.ts` 等 | 五域拷贝实现 |
| `install/hooks/` | hooks settings 按平台格式写入 |
| `assets/manifest.ts` | `shared/hooks` 扫描 |
| `config/polaris-config.ts` | `platform` + `plugin_root` |

## 非目标

- 不新建 constitution / scorers / 主入口 SKILL.md
- 不重构 assets 源树、不实现 uninstall
- lock 文件路径保持 `.polaris/skills-lock.json`
