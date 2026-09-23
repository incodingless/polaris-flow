---
name: polaris{{SKN_SPR}}debug{{SKN_SPR}}patch
description: "缺陷修复通道的「实现与自验」阶段：按 tasks.md 改到位，并由改代码的人自己证明改对了。先写复现用例（红）再写修复（绿）再补边界用例，跑回归、diff 范围校验、静态检查，产出 verification.md 的「自验」节。用户要求：按方案修这个 bug、写修复代码、补回归用例、做生产环境的独立验证，或承接 debug:diagnose 时使用。不触发：定位根因与设计方案（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose）、收尾归档（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}closeout）。"
---

# 实现与自验 · 缺陷修复通道 · patch

<HARD-GATE>
- **禁止**在方案未确认（存在分叉时）时进入（`diagnose` 未过门禁）
- **禁止**先写修复再写失败用例——**先红后绿**，顺序不可调换
- **禁止**新增用例失败时归因为「环境问题」「用例本身有问题」「与本次无关」
- **禁止**夹带格式化 / 重命名 / 重构 / 依赖升级 / 注释增删——`git diff` 必须逐文件落在改动点清单内，夹带即回退
- 核心边界用例 **≥2 条**；故障场景复现用例单独计数、不抵扣
- **生产通道（channel=hotfix）专属**：增加数据脚本（幂等自审 + 可回滚 + 前置校验）、埋点（异常路径全链路 + TraceId + 关键上下文）、特性开关（默认关闭 + 可灰度）；三者缺一不得过门禁
- 产物契约（verification.md 自验节）见 `./references/artifacts.md`；**停顿（暂停等用户选 / 信息索要 / 阻塞报告）见 `./policies/decision-point.md`**
- **H8**：进入与每个 Step 入口输出 `[polaris-flow 调试]缺陷修复 - patch <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 调试]缺陷修复 - 进入实现与自验：使用 polaris{{SKN_SPR}}debug{{SKN_SPR}}patch 技能。`

## 进入协议

1. 复用 `$REPO_ROOT` / `$PLUGIN_ROOT`（缺失按 H12 阻断）。
2. 找任务：`get-active-changes --kind debug`；多条则**暂停等用户选**。
3. 读上游：`.polaris/tasks/<issue_id>/tasks.md` + `reviews/rca-report.md`。缺失则提示先走 `debug:diagnose`。
4. `task-state-entry enter-phase --kind debug --task-id <id> --phase patch`。
5. 定位代码工作区：读 `state.yaml` 的 `worktree_path`（bugfix 建了 worktree 时）——**代码改动在该 worktree 里执行**；否则在主仓库当前工作区（bugfix 未建 worktree，或 hotfix 已在 hotfix 分支）。**产物（`verification.md`、`state.yaml`）始终写主仓库 `$REPO_ROOT`**。

## 流程

### Step 0：定位任务标识 + 入口校验

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind debug --skill patch --repo-root "$REPO_ROOT" --phase patch)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `task_id`
- **多个匹配**：**暂停等用户选**——列出候选让用户选择
- **零匹配**：阻断，提示「未找到 实现与自验 阶段的 active change，请先执行 /polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose」

> 若选择的任务已是 `phase=patch`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。
> 若上次中断在 “修复” 中（`patch.status=in_progress`），从中断点续跑；不得因「已是 patch」而报零匹配。

**入口校验**（已完成 → 阻断重跑）：

| 检查 | 条件 |
|------|------|
| 检测与定位 已完成 | `state.yaml` 中 `diagnose.status=completed` |

输出：`[polaris-flow 调试]缺陷修复 - 进入实现与自验：问题单号=<task_id>`

执行：
1. 更新 `state.yaml`：`phase: build`，`build.status: in_progress`。

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase --repo-root "$REPO_ROOT" --task-id "$task_id" --kind debug --phase patch
```

2. 设置语言

执行脚本：
```bash
LANG=$(bash "$PLUGIN_ROOT/scripts/get-language-name.sh")
LANG_EXIT=$?
```

- `LANG_EXIT != 0` → 使用当前用户请求语言
- `LANG_EXIT == 0` → 本阶段所有提问与澄清摘要均采用 $LANG。

### Step 1：修复问题

#### 1.1 先写复现用例（红）→ 修复（绿）

- 顺序固定：写复现用例（**红**）→ 写修复（**绿**）→ 补边界用例
- **生产通道（channel=hotfix）**：修复内容额外含三件——数据脚本（幂等自审 + 可回滚 + 前置校验）、埋点（异常路径全链路 + TraceId + 关键上下文）、特性开关（默认关闭 + 可灰度）；三者与 `diagnose` 的改动点清单一致，超范围即夹带
- 复杂缺陷可派发 subagent（**仅用户显式要求时**）：先读 SessionStart 注入；`SUPPORTS_SUBAGENT=true` 且只要默认通用 → 不调 probe 直接 dispatch；需选清单或缺注入 → `use_skill("polaris{{SKN_SPR}}subagent-probe")`。默认 inline 按 `tasks.md` 逐项执行

#### 1.2 补边界用例

- **≥2 条**核心边界用例；空值 / 极值 / 边界 / 异常时序 / 并发 / 超时 / 重复提交取适用项，不适用写明理由

#### 1.3 跑回归 + diff 校验 + 静态检查

- 跑 `tasks.md` 的回归范围 + 原复现用例
- `git diff` 逐文件核对：每处改动落在 `diagnose` 的改动点清单内；夹带即回退
- 执行仓库既有 lint / 类型检查；与本次无关的既有告警在报告标注为既有问题

#### 1.4 写自验节

1. 建立自栓文档目录

```bash
mkdir -p "$REPO_ROOT/.polaris/tasks/<task_id>/reviews"
```

在 `$REPO_ROOT/.polaris/tasks/<task_id>/reviews/verification.md`中 写「自验」节（命令 + 原始输出 + 结论，三件套）。

**技能自证**：原复现用例转绿 + 核心边界 ≥2 条全部通过 + 回归范围全通过 + `git diff` 无夹带 + 静态检查通过。

#### 1.5 独立验证（仅通道为“生产修复”）

> 当前步骤仅生产问题才执行

1. 输出验证清单

按缺陷性质列出五维验证项与各自执行人 / 环境，逐项标注能力档位（A 自跑 / B 环境依赖 / C 人执行）。环境与权限依赖的项，产出可执行的验证步骤 + 判定口径，交人执行。

2. 执行结果回复（**暂停等用户选**）
> 在预生产环境完成问题验证，确认问题已修复。
> 你是否已经完成问题修复验证，回填 `verification.md`「独立验证」节（结果 + 证据）？
> 
> A. 是，我验证后确认问题已经修复
> B. 否，问题未完全修复

- 用户选 A，检查回填内容：**五维通过（功能回归 / 数据兼容含脚本重复执行 / 性能无退化 / 边界异常 / **回滚演练有效**）。无法执行的项已在「未覆盖项」标注原因。

#### 1.6 修复收尾

1. 输出 `[polaris-flow 调试]缺陷修复 - 问题完成修复及验证：问题单号=<task_id>`

2. 推进阶段 —— 见「## 推进与回流」（`complete-phase` + `update-active --set phase=closeout`）


## 推进与回流

**过门禁**（两通道相同）→ 推进到 `closeout`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --kind debug --task-id "$task_id" \
  --phase patch --next-phase closeout

bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active \
  --kind debug --skill patch --repo-root "$REPO_ROOT" \
  --where-task-id "$task_id" --set phase=closeout
```

输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**）。
先按「自动衔接下一阶段」一节运行 `state next`，**下一步的技能名与括注均取自其输出**
—— `SKILL` 直填；括注按 `NEXT` 取（`manual` → 「建议新开会话」；`auto` → 「可同会话继续」）。**两者都不得写死**：

```text
[polaris-flow 调试]缺陷修复 - 阶段完成，状态已落盘。
下一步：/<SKILL>（建议新开会话 | 可同会话继续）。
恢复：先读 .polaris/tasks/<task_id>/reviews/verification.md 与 tasks.md 的勾选进度，再从下一步技能的 Step 0 开始。
```

**回流**（不是推进）：

- 用例失败、止于代码实现 → 段内重改
- 用例失败、方案本身不成立 → 回 `debug:diagnose`，并同步在 `regressions[]` 留痕：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active \
  --kind debug --skill patch --repo-root "$REPO_ROOT" \
  --where-task-id "$task_id" --set phase=diagnose
```

## 上下文压缩恢复

重载：`task_id`、`channel`、`worktree_path`、`tasks.md` 的勾选进度、`reviews/verification.md`（自验节 + 独立验证回填）、
`state.yaml` 的 `runtime.patch`、`regressions[]`、停在哪一步。

- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 **1.1–1.3（修复 / 边界 / 回归）** → 读 `tasks.md` 勾选与当前 diff，从未完成的改动续做；不重写已通过的用例
- 停在 **1.4（自验节）** → 只补 `reviews/verification.md` 的自验节
- 停在 **1.5（独立验证，仅生产通道）** → 回填未齐则重新发起询问，**不得**自行判定通过
- 停在 **1.6（修复收尾）** → 只补阶段推进，**不重做**修复
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```
