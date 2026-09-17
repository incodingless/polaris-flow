---
name: polaris{{SKN_SPR}}debug{{SKN_SPR}}closeout
description: "缺陷修复通道的「关闭Bug」阶段：交付打包 + 收尾归档。生成交付报告（bugfix-report.md，根因节引用 rca-report 不重述）、标准化提交信息与评审要点，出口门禁自检，归档到 docs/troubleshooting/<issue_id>/ 并追加 INDEX.md 一行，回读校验后 git 收尾（bugfix 提交 worktree 并清理 / hotfix 回合主干）。用户要求：收尾这个缺陷修复、生成修复报告、归档修复记录、准备提交，或承接 debug:patch / debug:prove 时使用。不触发：改代码（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}patch）、定位根因（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose）。"
---

# 关闭Bug · 缺陷修复通道 · closeout

<HARD-GATE>
- **禁止**在上游门禁未过时进入（`patch` / `prove` 未过）
- **禁止**未 `read_file ./templates/bugfix-report-template.md` 就生成交付报告
- **禁止**自行执行 `git push` / 远端 PR；本地 `commit`（worktree 收尾）与 `merge`（hotfix 回合主干）按本技能 Step 4「git 收尾」执行，`push` 仍交用户
- **禁止**归档回读校验未通过时宣告完成
- **禁止**交付物缺项时输出「修复完成」
- **生产通道（channel=hotfix）专属**：产出发布/灰度/回滚指引（`./templates/release-runbook.md`）并交人做**发布确认**（「发布与回滚方案就绪」）后方可收尾；技能不执行发布、不参与观测
- 产物契约与归档规则见 `./policies/artifacts.md`
- **H8**：进入与每个 Step 入口输出 `[polaris-flow 调试]缺陷修复 - closeout <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 调试]缺陷修复 - 进入关闭Bug：使用 polaris{{SKN_SPR}}debug{{SKN_SPR}}closeout 技能。`

## 进入协议

1. 复用 `$REPO_ROOT` / `$PLUGIN_ROOT`（缺失按 H12 阻断）。
2. 找任务：`get-active-changes --kind debug`；多条则按 `./policies/decision-point.md` 选。
3. 读上游：`reviews/rca-report.md` + `tasks.md` + `verification.md` + `diagnose-brief.md`。
4. `task-state-entry enter-phase --kind debug --task-id <id> --phase closeout`。

## 流程

### Step 1：生成交付报告 + 提交信息 + 评审要点

- `mkdir -p ".polaris/tasks/<issue_id>/reviews"`，必读 `./templates/bugfix-report-template.md`，生成 `.polaris/tasks/<issue_id>/reviews/bugfix-report.md`（根因与证据链**引用** `rca-report.md`，不重述）
- 提交信息：`fix(<模块>): <一句话现象> (<issue_id>)` + 正文含根因与改动点；**只产出文本**，不代提交。团队强制 `#ID` 语法时按用户指定格式，两种格式不得混用
- 评审要点：按「根因 / 改动范围 / 风险点 / 测试覆盖 / 未覆盖项」五段输出

### Step 2：出口门禁自检

逐项核对报告模板第 8 节的清单。**不得被跳过的硬项**：修复代码、新增用例、交付报告。缺任一项 → 补齐，不允许输出「修复完成」。

### Step 3：归档 + 索引 + 回读校验

- `mkdir -p "$REPO_ROOT/docs/troubleshooting/<issue_id>"`，**复制不移动**四份：`diagnose-brief.md` / `rca-report.md`（从 reviews 提升）/ `tasks.md` / `bugfix-report.md`
- 在 `docs/troubleshooting/INDEX.md` **追加一行**（`issue_id | 日期 | 模块 | 异常类型 | 根因一句话 | 修复一句话`），只追加不改写历史行
- **回读校验 5 项**（4 文件 + INDEX.md 均存在且非空）——任一失败不得宣告完成

### Step 4：git 收尾（分通道）

**测试通道（bugfix）**
- 建了 worktree 时：在 worktree 里 `git add -A && git commit -m "<标准提交信息>"`，然后 `git worktree remove <worktree_path>` 清理
- 未建 worktree 时：按 `./policies/decision-point.md` 询问提交方式（**A 我自己提交** / **B 代 `git add`+`commit`（不 push）** / **C 先放着**）

**生产通道（hotfix）· 回合主干**
- `git checkout <主干> && git merge --no-ff "hotfix/<issue_id>"` 回合 hotfix 分支至主干
- 回合后 hotfix 分支保留（历史可追溯）；如用户要求可删除

> 仅本地 git 操作（`commit` / `merge` / worktree 清理）；`push` / 远端 PR 一律不代执行，交用户。

### Step 5：生产通道专属：发布确认（仅 channel=hotfix）

必读 `./templates/release-runbook.md`，产出发布/灰度/回滚指引交人执行；按 `./policies/decision-point.md` 交人做**发布确认**（「发布与回滚方案就绪」→ 才允许上线）。技能不执行发布、不参与观测窗口；不得把「建议回滚」写成「已回滚」。

## 出口门禁

**技能自证**：交付物齐全 + 归档回读 5 项通过 + 提交信息与评审要点已产出。

## 收尾

- `complete-phase --phase closeout`（无 next-phase）+ `runtime.closeout.status = completed`
- 状态行：`[polaris-flow 调试]缺陷修复 - closeout 完成，归档于 docs/troubleshooting/<issue_id>/`
- 发现结论错 → 回 `debug:diagnose`；缺项 → 原地补齐重校
