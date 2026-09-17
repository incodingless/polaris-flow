---
name: polaris{{SKN_SPR}}debug{{SKN_SPR}}patch
description: "缺陷修复通道的「实现与自验」阶段：按 tasks.md 改到位，并由改代码的人自己证明改对了。先写复现用例（红）再写修复（绿）再补边界用例，跑回归、diff 范围校验、静态检查，产出 verification.md 的「自验」节。用户要求：按方案修这个 bug、写修复代码、补回归用例，或承接 debug:prescribe 时使用。不触发：定位根因（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose）、设计方案（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}prescribe）、跨环境独立验证（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}prove）、收尾归档（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}closeout）。"
---

# 实现与自验 · 缺陷修复通道 · patch

<HARD-GATE>
- **禁止**在方案未确认（存在分叉时）时进入（`prescribe` 未过门禁）
- **禁止**先写修复再写失败用例——**先红后绿**，顺序不可调换
- **禁止**新增用例失败时归因为「环境问题」「用例本身有问题」「与本次无关」
- **禁止**夹带格式化 / 重命名 / 重构 / 依赖升级 / 注释增删——`git diff` 必须逐文件落在改动点清单内，夹带即回退
- 核心边界用例 **≥2 条**；故障场景复现用例单独计数、不抵扣
- **生产通道（channel=hotfix）专属**：增加数据脚本（幂等自审 + 可回滚 + 前置校验）、埋点（异常路径全链路 + TraceId + 关键上下文）、特性开关（默认关闭 + 可灰度）；三者缺一不得过门禁
- 产物契约（verification.md 自验节）见 `./policies/artifacts.md`
- **H8**：进入与每个 Step 入口输出 `[polaris-flow 调试]缺陷修复 - patch <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 调试]缺陷修复 - 进入实现与自验：使用 polaris{{SKN_SPR}}debug{{SKN_SPR}}patch 技能。`

## 进入协议

1. 复用 `$REPO_ROOT` / `$PLUGIN_ROOT`（缺失按 H12 阻断）。
2. 找任务：`get-active-changes --kind debug`；多条则按 `./policies/decision-point.md` 选。
3. 读上游：`.polaris/tasks/<issue_id>/tasks.md` + `reviews/rca-report.md`。缺失则提示先走 `debug:prescribe`。
4. `task-state-entry enter-phase --kind debug --task-id <id> --phase patch`。
5. 定位代码工作区：读 `state.yaml` 的 `worktree_path`（bugfix 建了 worktree 时）——**代码改动在该 worktree 里执行**；否则在主仓库当前工作区（bugfix 未建 worktree，或 hotfix 已在 hotfix 分支）。**产物（`verification.md`、`state.yaml`）始终写主仓库 `$REPO_ROOT`**。

## 流程

### Step 1：先写复现用例（红）→ 修复（绿）

- 顺序固定：写复现用例（**红**）→ 写修复（**绿**）→ 补边界用例
- **生产通道（channel=hotfix）**：修复内容额外含三件——数据脚本（幂等自审 + 可回滚 + 前置校验）、埋点（异常路径全链路 + TraceId + 关键上下文）、特性开关（默认关闭 + 可灰度）；三者与 `prescribe` 改动点清单一致，超范围即夹带
- 复杂缺陷可派发 subagent（**仅用户显式要求时**）：先读 SessionStart 注入；`SUPPORTS_SUBAGENT=true` 且只要默认通用 → 不调 probe 直接 dispatch；需选清单或缺注入 → `use_skill("polaris{{SKN_SPR}}subagent-probe")`。默认 inline 按 `tasks.md` 逐项执行

### Step 2：补边界用例

- **≥2 条**核心边界用例；空值 / 极值 / 边界 / 异常时序 / 并发 / 超时 / 重复提交取适用项，不适用写明理由

### Step 3：跑回归 + diff 校验 + 静态检查

- 跑 `tasks.md` 的回归范围 + 原复现用例
- `git diff` 逐文件核对：每处改动落在 `prescribe` 的改动点清单内；夹带即回退
- 执行仓库既有 lint / 类型检查；与本次无关的既有告警在报告标注为既有问题

### Step 4：写自验节

`mkdir -p ".polaris/tasks/<issue_id>/reviews"` 后，在 `.polaris/tasks/<issue_id>/verification.md` 写「自验」节（命令 + 原始输出 + 结论，三件套）。

## 出口门禁

**技能自证**：原复现用例转绿 + 核心边界 ≥2 条全部通过 + 回归范围全通过 + `git diff` 无夹带 + 静态检查通过。

## 推进与回流

- 过门禁 → `complete-phase --phase patch --next-phase <closeout|prove>`（测试通道 → closeout；生产通道 → prove）+ `update-active --set phase=<同上>`，提示走对应技能
- 用例失败、止于代码实现 → 段内重改
- 用例失败、方案本身不成立 → 回 `debug:prescribe`（`update-active --set phase=prescribe` + `regressions[]` 留痕）
