---
name: polaris{{SKN_SPR}}debug{{SKN_SPR}}prove
description: "缺陷修复通道的「独立验证」阶段（仅生产通道装配）：由独立环境或他人证明修复有效、且退得回去。五维验证（功能 / 数据兼容 / 性能 / 边界 / 回滚演练），大量项由人在类生产或预发布环境执行后回填，技能据此判定。用户要求：在生产发布前做独立验证、验证回滚可行、在类生产环境验证这个修复，或承接 debug:patch（生产通道）时使用。不触发：测试通道的缺陷修复（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}closeout 收尾）、改代码（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}patch）。"
---

# 独立验证 · 缺陷修复通道 · prove

<HARD-GATE>
- **仅生产通道装配**；测试通道不进入本技能（测试环境没有「类生产」这一层，自验即终验）
- **禁止**在 `patch` 自验未过时进入
- **禁止**声称已执行未实际执行的验证；无法执行的项目必须标注「未验证 + 原因」
- **禁止**把「人回填」写成「技能自证」——判定依据是**人回填 + 技能判定**
- 产物契约（verification.md 独立验证节）见 `./policies/artifacts.md`；能力分档见 `./policies/capability-tiers.md`
- **H8**：进入与每个 Step 入口输出 `[polaris-flow 调试]缺陷修复 - prove <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 调试]缺陷修复 - 进入独立验证：使用 polaris{{SKN_SPR}}debug{{SKN_SPR}}prove 技能。`

## 进入协议

1. 复用 `$REPO_ROOT` / `$PLUGIN_ROOT`（缺失按 H12 阻断）。
2. 找任务：`get-active-changes --kind debug`；确认 `channel=hotfix` 且 `phase=patch` 已完成。
3. 读上游：`.polaris/tasks/<issue_id>/verification.md`（自验节）+ `reviews/rca-report.md` + 修复代码。
4. `task-state-entry enter-phase --kind debug --task-id <id> --phase prove`。

## 流程

### Step 1：出验证清单

按缺陷性质列出五维验证项与各自执行人 / 环境，逐项标注能力档位（A 自跑 / B 环境依赖 / C 人执行）。环境与权限依赖的项，产出可执行的验证步骤 + 判定口径，交人执行。

### Step 2：人执行并回填

人按清单在类生产 / 预发布执行，回填 `verification.md`「独立验证」节（结果 + 证据）。技能不代执行、不声称已执行。

### Step 3：判定

技能逐项判定：全部通过 → 过门禁；有未通过项 → 按回流规则回退。

## 出口门禁

**人回填 + 技能判定**：五维通过（功能回归 / 数据兼容含脚本重复执行 / 性能无退化 / 边界异常 / **回滚演练有效**）。无法执行的项已在「未覆盖项」标注原因。

## 推进与回流

- 过门禁 → `complete-phase --phase prove --next-phase closeout` + `update-active --set phase=closeout`，提示走 `debug:closeout`
- 止于实现 → 回 `debug:patch`；方案不成立（含回滚无效）→ 回 `debug:prescribe`；与根因结论不符 → 回 `debug:diagnose`（均 `update-active --set phase=<目标>` + `regressions[]` 留痕）
