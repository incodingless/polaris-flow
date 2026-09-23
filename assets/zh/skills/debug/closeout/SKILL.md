---
name: polaris{{SKN_SPR}}debug{{SKN_SPR}}closeout
description: "缺陷修复通道的「关闭Bug」阶段：交付打包 + 收尾归档。生成交付报告（bugfix-report.md，根因节引用 rca-report 不重述）、标准化提交信息与评审要点，出口门禁自检，归档到 docs/troubleshooting/<issue_id>/ 并追加 INDEX.md 一行，回读校验后 git 收尾（bugfix 提交 worktree 并清理 / hotfix 回合主干）。用户要求：收尾这个缺陷修复、生成修复报告、归档修复记录、准备提交，或承接 debug:patch 时使用。不触发：改代码（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}patch）、定位根因（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose）。"
---

# 关闭Bug · 缺陷修复通道 · closeout

<HARD-GATE>
- **禁止**在上游门禁未过时进入（`patch` 未过）
- **禁止**未 `read_file ./templates/bugfix-report-template.md` 就生成交付报告
- **禁止**自行执行 `git push` / 远端 PR；本地 `commit`（worktree 收尾）与 `merge`（hotfix 回合主干）按本技能 Step 4「git 收尾」执行，`push` 仍交用户
- **禁止**归档回读校验未通过时宣告完成
- **禁止**交付物缺项时输出「修复完成」
- **生产通道（channel=hotfix）专属**：产出发布/灰度/回滚指引（`./templates/release-runbook.md`）并交人做**发布确认**（「发布与回滚方案就绪」）后方可收尾；技能不执行发布、不参与观测
- 产物契约与归档规则见 `./references/artifacts.md`；**停顿（暂停等用户选 / 信息索要 / 阻塞报告）见 `./policies/decision-point.md`**
- **H8**：进入与每个 Step 入口输出 `[polaris-flow 调试]缺陷修复 - closeout <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 调试]缺陷修复 - 进入关闭Bug：使用 polaris{{SKN_SPR}}debug{{SKN_SPR}}closeout 技能。`

## 进入协议

1. 复用 `$REPO_ROOT` / `$PLUGIN_ROOT`（缺失按 H12 阻断）。
2. 找任务：`get-active-changes --kind debug`；多条则**暂停等用户选**。
3. 读上游：`reviews/rca-report.md` + `tasks.md` + `verification.md` + `diagnose-brief.md`。
4. `task-state-entry enter-phase --kind debug --task-id <id> --phase closeout`。

## 流程

### Step 0：定位任务标识 + 入口校验

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind debug --skill closeout --repo-root "$REPO_ROOT" --phase closeout)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `task_id`
- **多个匹配**：**暂停等用户选**——列出候选让用户选择
- **零匹配**：阻断，提示「未找到 关闭 Bug 阶段的 active change，请先执行 /polaris{{SKN_SPR}}debug{{SKN_SPR}}patch」

> 若选择的任务已是 `phase=closeout`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。
> 若上次中断在“关单”中（`closeout.status=in_progress`），从中断点续跑；不得因「已是 closeout」而报零匹配。

**入口校验**（已完成 → 阻断重跑）：

| 检查 | 条件 |
|------|------|
| 实现与自验 已完成 | `state.yaml` 中 `patch.status=completed` |

输出：`[polaris-flow 调试]缺陷修复 - 进入关闭 Bug：问题单号=<task_id>`

执行：
1. 更新 `state.yaml`：`phase: closeout`，`closeout.status: in_progress`。

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase --repo-root "$REPO_ROOT" --task-id "$task_id" --kind debug --phase closeout
```

2. 设置语言

执行脚本：
```bash
LANG=$(bash "$PLUGIN_ROOT/scripts/get-language-name.sh")
LANG_EXIT=$?
```

- `LANG_EXIT != 0` → 使用当前用户请求语言
- `LANG_EXIT == 0` → 本阶段所有提问与澄清摘要均采用 $LANG。

### Step 1：生成交付报告 + 提交信息 + 评审要点

- 建立审查文档目录
```bash
mkdir -p "$REPO_ROOT/.polaris/tasks/<issue_id>/reviews"
```

必读 `read_file` `./templates/bugfix-report-template.md`，生成 `.polaris/tasks/<issue_id>/reviews/bugfix-report.md`（根因与证据链**引用** `rca-report.md`，不重述）
- 提交信息：`fix(<模块>): <一句话现象> (<issue_id>)` + 正文含根因与改动点；**只产出文本**，不代提交。团队强制 `#ID` 语法时按用户指定格式，两种格式不得混用
- 评审要点：按「根因 / 改动范围 / 风险点 / 测试覆盖 / 未覆盖项」五段输出

### Step 2：出口门禁自检

逐项核对报告模板第 8 节的清单。**不得被跳过的硬项**：修复代码、新增用例、交付报告。缺任一项 → 补齐，不允许输出「修复完成」。

### Step 3：归档 + 索引 + 回读校验

- 归档文档

```bash
ARCHIVE="$REPO_ROOT/docs/troubleshooting/$issue_id"
TASK="$REPO_ROOT/.polaris/tasks/$issue_id"
mkdir -p "$ARCHIVE"
cp "$TASK/diagnose-brief.md" "$ARCHIVE/"
cp "$TASK/reviews/rca-report.md" "$ARCHIVE/"
cp "$TASK/tasks.md" "$ARCHIVE/"
cp "$TASK/reviews/bugfix-report.md" "$ARCHIVE/"
```

- 在 `$REPO_ROOT/docs/troubleshooting/INDEX.md` **追加一行**（`issue_id | 日期 | 模块 | 异常类型 | 根因一句话 | 修复一句话`），只追加不改写历史行

- **回读校验 5 项**（4 文件 + INDEX.md 均存在且非空）——任一失败不得宣告完成

### Step 4：git 收尾（分通道）

**测试通道（bugfix）**
- 建了 worktree 时（读 `state.yaml` 的 `worktree.path`）：

```bash
WT_RESULT=$(bash "$PLUGIN_ROOT/scripts/worktree-commit-remove.sh" "$worktree_path" --message "$COMMIT_MSG")
WT_EXIT=$?
```

  - `WT_EXIT != 0` → **阻断**，stderr 有原因；不得宣告收尾完成
  - `WT_EXIT == 0` → `$WT_RESULT` 含 JSON（`worktree_path` / `branch` / `committed` / `removed`）；`committed=false` 表示提交前已干净（仅做了 remove）
- 未建 worktree 时：**暂停等用户选**提交方式（**A 我自己提交** / **B 代 `git add`+`commit`（不 push）** / **C 先放着**）

**生产通道（hotfix）· 回合主干**

```bash
MERGE_RESULT=$(bash "$PLUGIN_ROOT/scripts/git-branch-merge.sh" "hotfix/$issue_id" "$REPO_ROOT")
MERGE_EXIT=$?
```

- `MERGE_EXIT != 0` → **阻断**，stderr 有原因（脏工作区 / 冲突已 abort / 分支不存在等），不得宣告收尾完成
- `MERGE_EXIT == 0` → `$MERGE_RESULT` 含 JSON（`main_branch` / `source_branch`）；hotfix 分支保留（历史可追溯）；如用户要求可再删除

> 仅本地 git 操作（`commit` / `merge` / worktree 清理）；`push` / 远端 PR 一律不代执行，交用户。

### Step 5：生产通道专属：发布确认（仅 channel=hotfix）

必读 `./templates/release-runbook.md`，产出发布/灰度/回滚指引交人执行；**发布确认暂停等用户选**（「发布与回滚方案就绪」→ 才允许上线）。技能不执行发布、不参与观测窗口；不得把「建议回滚」写成「已回滚」。

## 出口门禁

**技能自证**：交付物齐全 + 归档回读 5 项通过 + 提交信息与评审要点已产出 + **本任务已 `delete-active` 移出活跃列表**。

## 收尾

1. 更新 `state.yaml`（`complete-phase` 无 `--next-phase` —— 本阶段是链路终点）：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --kind debug --task-id "$task_id" --phase closeout

bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind debug \
  --set runtime.closeout.status=completed
```

2. **移出活跃列表**（链路终点必做）：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind debug --skill closeout \
  --repo-root "$REPO_ROOT" --where-task-id "$task_id"
```

3. 状态行：`[polaris-flow 调试]缺陷修复 - closeout 完成，归档于 docs/troubleshooting/<issue_id>/`

- 发现结论错 → 回 `debug:diagnose`；缺项 → 原地补齐重校

## 上下文压缩恢复

重载：`task_id`、`.polaris/tasks/<issue_id>/reviews/bugfix-report.md` 是否落盘、归档目录与回读校验结果、
`state.yaml` 的 `runtime.patch` / `runtime.closeout`、git 收尾（提交 / 合并 / worktree 清理）是否完成、是否已 `delete-active`。

- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 **Step 1–2** → 核对报告模板第 8 节清单，缺哪补哪
- 停在 **Step 3（归档）** → 重跑回读校验 5 项，未过则该步重做
- 停在 **Step 4（git 收尾）** → 先确认提交状态再续；**禁止**在未确认时直接清理 worktree
- 停在 **Step 5（生产通道发布确认）** → 只补发布确认，**不重做** Step 3/4
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

本技能是**链路终点**，因此**不调用** `polaris-flow state next`：收尾步已 `delete-active` 移除本任务的
`debug_tasks[]` 条目，调用只会得到 `NEXT: done`。

调试链路 `diagnose → patch → closeout` **到此结束**，没有后续阶段技能。
