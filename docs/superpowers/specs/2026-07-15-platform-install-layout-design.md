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
