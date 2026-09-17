---
name: polaris{{SKN_SPR}}debug{{SKN_SPR}}hotfix
description: "生产故障修复通道（装配入口）。按「triage → diagnose → prescribe → patch → prove → closeout」六段装配缺陷修复：定性（含现场保全与三对齐）→ 定位（含止血支路）→ 方案（含回退路径硬门禁）→ 实现与自验（含数据脚本/埋点/开关）→ 独立验证（五维，他人/类生产环境）→ 关闭Bug（含发布确认）。本技能只做场景分流与装配编排，不承载阶段执行细节。用户触发 /polaris{{SKN_SPR}}debug{{SKN_SPR}}hotfix、报告线上/生产/灰度故障、或从 bugfix 通道命中生产信号转来时使用。注意：本通道独立验证（prove）由不同角色/另开会话执行；止血/发布/灰度/回滚全部由人执行，技能只出指引。"
---

# 生产故障修复通道 · hotfix（装配）

<HARD-GATE>
- 本技能**只做装配**：场景分流 + 装配顺序 + 档位加严 + 人确认点。**禁止出现阶段执行细节**
- 阶段执行逻辑一律在各阶段技能内：`triage` / `diagnose` / `prescribe` / `patch` / `prove` / `closeout`
- 生产通道：`prescribe` **不可折叠**（回退路径是硬门禁）；`prove` 为独立阶段
- 人在环节点（现场保全 / 止血 / 发布·灰度·回滚）**只由人执行**，技能只出 `templates/` 指引，不执行、不声称已执行、不自行判定「业务已恢复」
- 场景分流与边界见 `./policies/scene-routing.md`；能力分档见 `./policies/capability-tiers.md`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 调试]缺陷修复 - 进入生产通道：使用 polaris{{SKN_SPR}}debug{{SKN_SPR}}hotfix 技能。`

## 装配表（生产通道）

```
triage → diagnose → prescribe → patch → prove → closeout
```

- `prove` **必装**：独立验证由不同角色 / 另开会话在类生产环境执行。
- `prescribe` **不可折叠**：回退路径可行是硬门禁。

## 加严项（相对测试通道，共 6 项）

| # | 段 | 加严 |
|---|----|------|
| 1 | `triage` | 出口改为「时间线·影响面·变更清单三对齐」；复现降为可选；增加现场保全清单 |
| 2 | `diagnose` | 增加止血支路，可任意时点插入 |
| 3 | `prescribe` | **不可折叠**；「回退路径可行」为硬门禁（代码回滚 + 数据回滚 + 特性开关） |
| 4 | `patch` | 增加数据脚本（幂等自审）、埋点、特性开关 |
| 5 | `prove` | 独立阶段，五维（功能/数据/性能/边界/**回滚演练**），人回填 + 技能判定 |
| 6 | `closeout` | 增加发布确认 |

> 加严项的执行细节**不在本技能**，见对应阶段技能的 HARD-GATE 与流程。

## 人确认点（本通道 3 处）

1. **根因确认**：`diagnose` 出口（`reviews/rca-report.md`）。
2. **方案确认**：`prescribe` 出口（含风险与回退路径）。
3. **发布确认**：`closeout` 之后，人在环（「发布与回滚方案就绪」）。

## 人在环节点（不建技能，只出指引）

| 节点 | 位置 | 技能侧产物 | 模板 |
|------|------|-----------|------|
| 现场保全执行 | `triage` 段内 | 保全清单 | `triage/templates/preservation-checklist.md` |
| 止血执行（支路） | `diagnose` 之后任意时点 | 止血选项卡 + 恢复判定口径 | `diagnose/templates/containment-options.md` |
| 发布 / 灰度 / 回滚执行 | `closeout` 之后 | 发布前置检查 + 回滚触发条件 + 灰度放量 + 观测阈值 | `closeout/templates/release-runbook.md` |

> 以上三处**只由人执行**；技能不执行、不声称已执行、不自行判定「业务已恢复」。

## 各阶段技能

与测试通道共用：`triage` / `diagnose` / `prescribe` / `patch` / `prove` / `closeout`。差异在档位加严项（见各技能 HARD-GATE 与 `./policies/capability-tiers.md`）。

## 工作区策略

- `triage` 段创建 **hotfix 分支**（基于 main/master 主干）；`closeout` 段回合主干（`merge --no-ff`）（执行细节见 `triage` / `closeout` 技能）

## 运行态

- 任务游标：`workflow-entry append-active --kind debug --channel hotfix ...`（`channel` 固定 `hotfix`）
- 阶段推进：每段 `complete-phase --phase <cur> --next-phase <next>` + `update-active --set phase=<next>`；`patch` 的下一段是 `prove`
- 产物契约见 `./policies/artifacts.md`

## 分流出口

- 根因其实是需求有误 / 跨 3+ 模块 / schema 或数据迁移 / 对外 API breaking → `coding/normal`
- 无法复现且无证据 → 补观测后重新提单
