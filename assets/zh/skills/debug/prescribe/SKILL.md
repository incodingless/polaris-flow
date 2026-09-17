---
name: polaris{{SKN_SPR}}debug{{SKN_SPR}}prescribe
description: "缺陷修复通道的「方案」阶段：确定修复边界与回退路径，产出可执行的 tasks.md。完成最小变更方案、影响面分析、回归范围、方案对比（存在分叉时）、生成 tasks.md 并跑 tasks-lint，交人确认方案（仅存在分叉时）。用户要求：这个 bug 怎么改、设计修复方案、评估改动影响面、确定回归范围，或承接 debug:diagnose 时使用。不触发：定位根因（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose）、改代码（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}patch）。"
---

# 方案 · 缺陷修复通道 · prescribe

<HARD-GATE>
- **禁止**在根因未获人确认时进入（`diagnose` 未过门禁）
- **禁止**把「顺手整理 / 重构 / 格式化」包进方案；只改与缺陷**直接相关**的路径
- **禁止**未 `read_file ./templates/tasks-template.md` 就生成 `tasks.md`
- **禁止**跳过 `bash "$PLUGIN_ROOT/scripts/tasks-lint.sh" ".polaris/tasks/<issue_id>/tasks.md"`
- 改动跨 3+ 模块 / schema 变更 / 数据迁移 / 对外 API breaking → 停止，转 `coding/normal`
- **生产通道（channel=hotfix）专属**：回退路径可行是**硬门禁**——方案必须同步设计代码回滚 / 数据回滚 / 特性开关，不具备回滚条件的方案**禁止**进入 `patch`
- 产物契约见 `./policies/artifacts.md`；方案对比提问用 `./policies/ask-question-react.md`
- **H8**：进入与每个 Step 入口输出 `[polaris-flow 调试]缺陷修复 - prescribe <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 调试]缺陷修复 - 进入方案：使用 polaris{{SKN_SPR}}debug{{SKN_SPR}}prescribe 技能。`

## 进入协议

1. 复用 `$REPO_ROOT` / `$PLUGIN_ROOT`（缺失按 H12 阻断）。
2. 找任务：`get-active-changes --kind debug`；多条则按 `./policies/decision-point.md` 选。
3. 读上游：`.polaris/tasks/<issue_id>/reviews/rca-report.md`（根因、影响面、发现路径）+ `diagnose-brief.md`（排除记录明细）。缺失则提示先走 `debug:diagnose`。
4. `task-state-entry enter-phase --kind debug --task-id <id> --phase prescribe`。

## 流程

### Step 1：最小修复方案 + 影响面

- 只改与缺陷直接相关的代码路径，明确「改 / 加 / 删」与「**不做什么**」
- 影响面逐项判断：上游调用方、下游依赖、关联模块、对外接口、共享数据结构
- **生产通道（channel=hotfix）**：同步设计**回退路径**（代码回滚 + 数据回滚 + 特性开关）并写进方案；不具备回滚条件 → 本段不过

### Step 2：回归范围

按影响面列出必须复跑的既有用例 / 场景；回归范围**只增不减**，用户要求缩小范围时在报告记录该决定与风险。

### Step 3：方案对比（存在 2 条以上可行路径时）

列出 2–3 方案 + 各自代价（改动面 / 风险 / 回归成本），按 `./policies/ask-question-react.md` 让用户选；未选方案与拒绝理由写进报告。唯一路径 → 跳过本步。

### Step 4：生成 tasks.md + tasks-lint

- 必读 `./templates/tasks-template.md`
- 任务数 ≤5；TDD 标注规则：写回归/写修复/跑回归 → `<!-- TDD 任务 -->`；简报补全/报告整理/归档 → `<!-- 非 TDD 任务 -->`；至少 1 个 TDD 任务
- 回填 `diagnose-brief.md`「修复方向」段（定稿）

```bash
bash "$PLUGIN_ROOT/scripts/tasks-lint.sh" ".polaris/tasks/<issue_id>/tasks.md"
```

- lint 真实校验项见 `./templates/tasks-template.md` 末节；「任务数 ≤5」「路径相对」lint 不校验，须自行核对
- 不通过 → 修 `tasks.md`；仍不通过则阻塞

## 出口门禁

**技能自证 + 人确认（仅分叉时）**：方案符合最小变更 + 影响面与回归范围已列 + tasks-lint 通过。存在分叉时**人确认「方案可接受」**（`./policies/decision-point.md`，A 开始修复 / B 换方案 / C 范围过大转 normal）。

## 推进与回流

- 过门禁 → `complete-phase --phase prescribe --next-phase patch` + `update-active --set phase=patch`，提示走 `debug:patch`
- 范围超界 → 停止，转 `coding/normal`（保留 rca-report 与 tasks.md 作输入）
- 折叠情况（测试通道唯一路径）：本技能仍产出 tasks.md 并过 lint，只是不额外停一次人确认
