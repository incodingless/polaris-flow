---
name: polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose
description: "缺陷修复通道的「定性」阶段：把用户口述的缺陷/故障变成可核对的证据，并做场景分流。支持 Jira 问题单接入——用户提供 Jira 单号时优先用 Jira MCP 读取问题单内容，未接 MCP 或读取失败则要求手动补充；issue_id 直接用 Jira 单号（不做 LLM 推荐命名）。测试通道完成四要素校验、证据结构化提取、历史同类检索、诊断档案（diagnose-brief.md）落盘、运行态初始化、git 工作区准备（worktree / hotfix 分支）与最小稳定复现；生产通道完成现场保全、时间线/影响面/变更清单三对齐（复现降为可选）。用户要求：复现某个缺陷、确认某个报错、帮我复现测试环境的异常、这个 bug 的触发条件是什么、先别改代码先搞清楚现象、线上故障先保全现场、按 Jira 单号处理这个缺陷，或承接 debug:bugfix / debug:hotfix 通道的入口时使用。不触发：根因定位（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose）、设计修复方案（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}prescribe）、改代码（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}patch）、独立验证（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}prove）、收尾归档（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}closeout）。"
---

# 定性 · 缺陷修复通道 · diagnose

<HARD-GATE>
- **禁止**在未做场景分流前就动手；场景分流结果决定通道（测试→`bugfix`，生产→`hotfix`），**不得**默认某一通道
- **禁止**信息缺项时靠推测补齐——缺项走 `./policies/decision-point.md` 一次性问齐，仍缺则打回
- **禁止**改写、美化或转述用户给的证据；原始输出必须原样留存
- **禁止**测试通道复现失败仍继续——先补齐信息或补观测
- **禁止**「改代码试试」——那是赌博不是修复
- **禁止**把「根因其实是需求有误」当缺陷修（转 `coding/normal` / `coding/tweak`）
- **issue_id 优先用 Jira 单号**：用户提供 Jira 单号时**直接用单号**（不做 LLM 推荐命名、不追加日期前缀）；无单号才走 kebab-case 命名
- **Jira 读取兜底**：存在 Jira MCP 但读取失败、或未接入 Jira MCP → 明确告知用户并要求**手动补充问题单内容**，**禁止**凭空编造问题单字段
- **生产通道（channel=hotfix）专属**：进入即产出现场保全清单（`./templates/preservation-checklist.md`），**抢在止血/重启之前**；复现降为可选（成功加分、失败不阻塞）；出口以「时间线·影响面·变更清单三对齐」为准
- 场景分流与边界见 `./policies/scene-routing.md`；产物契约见 `./policies/artifacts.md`；能力分档见 `./policies/capability-tiers.md`
- **H8**：进入与每个 Step 入口输出 `[polaris-flow 调试]缺陷修复 - diagnose <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 调试]缺陷修复 - 进入定性：使用 polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose 技能。`

## 进入协议

1. 复用 SessionStart 注入的 `$REPO_ROOT` / `$PLUGIN_ROOT`；缺失按 `./policies/hard-stops.md` H12 阻断。

## 流程

### Step 0: 设置产物语言

读取 `.polaris/config.yaml` 的 `language`（规范化 ID，如 `en`、`zh`）；未配置时回退到当前用户请求语言。本技能所有提问与产出物均采用该语言。

### Step 1: 检查存量任务

```bash
if [ -z "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/scripts/workflow-entry.sh" ]; then
  echo "PLUGIN_ROOT unset or hooks missing — restart session to run SessionStart" >&2
  exit 2
fi

ACTIVE_RESULT=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind debug --repo-root "$REPO_ROOT")
ACTIVE_EXIT=$?
echo "ACTIVE_EXIT=$ACTIVE_EXIT ACTIVE_RESULT=$ACTIVE_RESULT"
```

**输出解读**（读 `ACTIVE_RESULT` JSON 数组，元素为 `task_id`）：

| `ACTIVE_EXIT` | 含义 | 后续动作 |
| ------------- | ---- | -------- |
| 0 且数组非空 | 存在未完结原型任务 | 按决策点协议询问 A/B/C/D（见下） |
| 0 且数组为空 | 无活跃原型任务 | 进入 Step 2 开启新任务 |
| 非 0 | 参数/环境错误 | 按 H12 阻断 |

存在活跃任务时，**必须**按 `./policies/decision-point.md` 暂停询问：

- **A. 续写最新一个**：`task_id` = 列表最后一项 → 进入 Step 1.5
- **B. 选择一个**：列出所有 `task_id` 候选让用户选择之后，再发出以下询问：

  > 当前选择问题单 <task_id>，请确认以下操作：
  >
  > - **A. 续写当前任务**：进入 Step 1.5
  > - **B. 重新开始任务**：对当前目录执行下列命令后，进入 Step 2

  ```bash
  rm -rf "$REPO_ROOT/.polaris/tasks/$task_id"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind debug --skill triage --repo-root "$REPO_ROOT" --where-task-id "$task_id"
  ```
- **C. 丢弃所有**：对每个 id 执行下列命令后，进入 Step 2

```bash
for d in <ACTIVE_RESULT 列表>; do
  rm -rf "$REPO_ROOT/.polaris/tasks/$d"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind prototype --skill blueprint --repo-root "$REPO_ROOT" --where-task-id "$d"
done
```

- **D. 取消退出**：结束本 skill

### Step 2：收集问题单 + 初始化任务

#### Step 2.1 问题单接入（Jira 优先，手动兜底）

按 `./policies/decision-point.md` 要求用户输入 **Jira issue 单号**（如 `PROJ-123`）：

- **有单号**：
  1. **`issue_id` = Jira 单号**（直接用，不做 LLM 推荐命名、不追加日期前缀；仅对目录不安全字符做最小清洗，如空格→`-`，保留原单号可读性）
  2. 尝试调用 **Jira MCP** 读取问题单内容（标题 / 描述 / 复现步骤 / 预期结果 / 实际结果 / 环境 / 优先级 / 模块 / 附件等字段）：
     - **读取成功** → 把问题单内容结构化填入 Step 3 的四要素 / 三对齐**初始值**（原始内容原样保留，不转述、不摘要）
     - **未接入 Jira MCP 或读取失败** → 明确告知用户，要求**手动补充问题单内容**（标题 / 描述 / 复现 / 环境等），进入 Step 3 逐项补全
- **无单号**：
  - 要求用户手动补充问题单内容；`issue_id` 走 kebab-case + 日期前缀命名（`./policies/decision-point.md` 确认命名）

> 无论哪种路径，`issue_id` 在本步**定死**，后续 Step 5 初始化与下游各段直接复用，不再重新命名。

#### Step 2.2 场景分流（先于一切，决定通道）

按 `./policies/scene-routing.md` 判定，结果决定后续全流程走向：

- **判定为测试** → `channel=bugfix`，走测试版 triage（四要素 + 稳定复现）
- **判定为生产** → `channel=hotfix`，走生产版 triage（现场保全 + 三对齐，复现可选）

信号不足**必须询问**（`./policies/decision-point.md`），不得默认某一通道。

#### Step 2.3 信息校验（分通道）

**优先用 Step 2 已拉取 / 已补充的内容**，缺项再按 `./policies/decision-point.md` 一次问全、不逐条追问。

**测试通道（bugfix）· 四要素校验**——四项**全部就绪**才继续：
1. **复现步骤**（命令 / 输入 / 操作路径）
2. **实际结果**（报错信息、截图、异常栈、错误码）
3. **预期结果**
4. **环境版本**（分支 / commit、服务版本、配置、数据状态）

**生产通道（hotfix）· 故障信息聚合**——先拿三样再谈根因：
1. **时间线**（异常起始 / 扩散 / 峰值点）
2. **影响面**（受影响用户量 / 功能范围 / 损失等级）
3. **变更清单**（故障窗口内的代码发布 / 配置 / 依赖 / 数据变更）

用户只给「XX 功能坏了」这类描述时，先输出缺口清单再问。

#### Step 2.4  证据结构化 + 历史同类

- 从文本 / 日志 / 截图提取异常类型、报错文件、代码行、模块、触发请求；取不到的字段标 `未提供`，原始证据**原样保留**
- 历史同类：读 `$REPO_ROOT/docs/troubleshooting/INDEX.md`（不存在则跳过），按模块 / 异常类型 / 关键符号匹配；命中项作为后续 `diagnose` 的假设之一，**禁止**套用结论跳过根因定位

#### Step 2.5 运行态初始化

`issue_id` 已在 Step 2.1 确定（Jira 单号或手动命名），直接建目录与 state.yaml（`<channel>` 取 Step 2.2 判定结果 `bugfix` 或 `hotfix`）：

```bash
bash "$PLUGIN_ROOT/scripts/task-init.sh" "$REPO_ROOT" --kind debug --task-id "$issue_id"
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" append-active --kind debug --skill <channel> --channel <channel> --task-id "$issue_id" --phase triage --repo-root "$REPO_ROOT"
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set --repo-root "$REPO_ROOT" --kind debug --task-id "$issue_id" --set channel=<channel>
```

### Step 3：git 工作区准备（分通道）

产物（`.polaris/tasks/`、归档）始终落在**主仓库**；worktree / hotfix 分支只承载**代码改动**。

#### 3.1.A 测试通道（bugfix）· worktree（可选）

- 按 `./policies/decision-point.md` 询问：是否创建 worktree 隔离本次修复（避免污染当前开发工作区）？
  - **是**：`git worktree add "<path>" -b "fix/<issue_id>" HEAD`（基于当前开发分支；`<path>` 建议仓库同级目录，按 `./policies/decision-point.md` 确认），记录 `worktree_path` 到 `state.yaml`
  - **否**：跳过，直接在当前工作区修复
- 建 worktree 后，**后续代码改动**在 worktree 里执行；产物仍写主仓库

按 `./policies/decision-point.md` 询问：

> 是否为本次修复建立独立的隔离工作区（避免污染当前开发分支）？
>
> A. 是，创建隔离工作区
> B. 否，留在当前开发分支

##### 3.1.A.A 用户选 A — 创建 worktree

```bash
WT_RESULT=$(bash "$PLUGIN_ROOT/scripts/worktree-create.sh" "$task_id" "$REPO_ROOT")
WT_EXIT=$?
```

- exit 0 → `$WT_RESULT` 含 JSON（`target_path` / `target_branch` / `snapshot_path`）；继续下方同步
- exit 1 → **阻断**，stderr 有错误信息

创建成功后，确保 `.polaris/tasks/<task_id>/state.yaml`（worktree 内路径优先）写入：

- `worktree.created_by_polaris_flow: true`
- `worktree.path` / `branch` / `origin_repo` / `status: active`
- `phase: triage`

同步主仓 workflow.yaml（脚本内含锁 / 写后校验，见 H12）：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind debug --skill triage --where-task-id "$task_id" --set phase=triage --set worktree-path="$target_path"
```

在 `.polaris/tasks/<task_id>/state.yaml`（worktree 内路径优先）写入：

- `runtime.plan.worktree_decision: created`

输出 `[polaris-flow 调试]缺陷修复 - 隔离工作区已创建，基础分支：<target_branch>，工作区路径：<target_path>`。

##### 3.1.A.B 用户选 B — 留在主仓库

不动 git。更新主仓 `.polaris/tasks/<task_id>/state.yaml`：

- `worktree.created_by_polaris_flow: false`
- `runtime.plan.worktree_decision: declined`
- `phase: plan`

同步 workflow.yaml：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind debug --skill triage --where-task-id "$task_id" --set phase=triage
```

输出 `[polaris-flow 调试]缺陷修复 - 未创建隔离工作区，用户选择留在主仓库。工作路径为: $REPO_ROOT`。

#### 3.1.B 生产通道（hotfix）· hotfix 分支（必建）

1. 尝试创建修复分支
```bash
GIT_CHECK = xxxx
GCD_EXIT = $?
```

- `GCD_EXIT != 0` → **阻断**，按 `./policies/decision-point.md` 询问：
  > 当前分支（$currentBranch.name）中存在未提交的变动，请提交/放弃变动。
  >
  > 你是否已经完成变动操作了？
  > A. 是，可以继续创建修复分支
  > B. 否，我还没有操作

  - 用户选择 “A”或 “B”，再次尝试创建修复分支

- `GCD_EXIT == 0` → 输出`[polaris-flow 调试]缺陷修复 - 已基于主干创建修复分支，分支名：$branch`

### Step 4：诊断档案落盘

#### 4.1 落盘问题档案

必读 `read_file` `./templates/diagnose-brief-template.md`，按骨架写 `$REPO_ROOT/.polaris/tasks/<issue_id>/diagnose-brief.md`（缺陷信息 + 四要素/三对齐 + 证据提取 + 复现段/现场保全段）。`issue_id` 为 Jira 单号时，在「缺陷信息」节记录单号与 Step 2 的读取来源。

#### 4.2 按通道收尾

**测试通道（bugfix）· 最小复现 + 稳定复现**
- 优先落成**可执行**形态：单测 > 独立脚本 > 接口请求；最小化到单点，逐步剥掉无关输入与依赖
- 执行并把**原始输出**（含栈、错误码、时间戳）原样粘入 `diagnose-brief.md`「复现」段
- 连续 **≥3 次**同结果 → 稳定复现；不一致 → 偶发，**不得**继续
- 复现失败 → 输出**信息缺口清单**（数据状态 / 并发时序 / 配置 / 特定输入）回 Step 3；偶发且无证据 → 停止修复，建议补观测后重新提单

**生产通道（hotfix）· 现场保全 + 三对齐（复现可选）**
- 必读 `./templates/preservation-checklist.md`，产出保全清单交人执行；人回填「现场保全」段
- 核对**时间线 / 影响面 / 变更清单三对齐**（三者能互相印证）
- 复现**可选**：类生产 / 预发布能稳定复现 → 加分项写入「复现」段；无法复现 → 标注「未复现 + 原因」，**不阻塞**（靠证据充分性兜底，见 `diagnose` 段）

#### 4.3 出口门禁

**测试通道（技能自证）**：四要素齐全 + 场景判定为测试 + `diagnose-brief.md` 落盘 + `state.yaml` 初始化 + 稳定复现（≥3 次同结果）。

**生产通道（技能自证）**：故障信息聚合齐全 + 时间线/影响面/变更清单**三对齐** + 现场保全清单已产出（回填结果记入档案）+ `diagnose-brief.md` 落盘 + `state.yaml` 初始化（`channel=hotfix`）。复现为可选加分项，缺失不阻塞。

### Step 5：根因分析

#### 5.0 止血确认（仅生产通道 channel=hotfix，定位前）

定位根因前，先按 `./policies/decision-point.md` 询问止血状态：

- **A 已完成止血**（已回滚变更 / 关闭开关 / 限流降级，业务已恢复或止损）→ 继续 Step 1
- **B 未完成止血** → 暂停定位，用户先执行止血（技能不代执行、不指导），完成后回来继续
- **C 无需止血**（影响面已停止扩散、无持续损害）→ 继续 Step 1

止血结果回填 `diagnose-brief.md`「止血确认」段。止血**不替代**根因定位——确认后照常走 Step 1–5。

#### 5.1 栈溯源

从报错点向上追完整调用链，定位**最早引入异常**的节点；区分「直接报错点」与「根本原因」，二者分开写清。

#### 5.2 变更关联

- `git log` / `git blame` 定位相关文件近期变更、配置变更、依赖升级
- 必须能说明「这次变更如何导致该现象」，否则只是线索

#### 5.3 排除与反证

- 至少提出 **1 个替代假设**并给出排除依据
- 无法排除的如实写「未能排除」并说明影响
- 若在 `triage` 检索到历史同类，把其根因作为假设之一，**独立取证**，不得套用结论

#### 5.4 全现象解释校验

根因必须能解释 `triage` 记录的**全部**现象；解释不了的残留现象显式列出、标注归因未知。

#### 5.5 产出

1. 回填 `.polaris/tasks/<issue_id>/diagnose-brief.md`「根因」「修复方向（影响面 / 回归范围）」段
2. 必读 `./templates/rca-report-template.md`，`mkdir -p ".polaris/tasks/<issue_id>/reviews"` 后生成 `.polaris/tasks/<issue_id>/reviews/rca-report.md`（九节）

#### 5.6 出口门禁

**技能自证 + 人确认**：报错点 ≠ 根因 + 解释全部现象 + ≥1 排除记录 + 报告中每项结论可在档案中找到对应证据；然后**人确认「根因正确」**（`./policies/decision-point.md`，选项：A 正确进入方案 / B 存疑回 triage 补证据 / C 场景有误改走其他通道）。


### Step 6：设计修复方案

#### 6.1 最小修复方案 + 影响面

- 只改与缺陷直接相关的代码路径，明确「改 / 加 / 删」与「**不做什么**」
- 影响面逐项判断：上游调用方、下游依赖、关联模块、对外接口、共享数据结构
- **生产通道（channel=hotfix）**：同步设计**回退路径**（代码回滚 + 数据回滚 + 特性开关）并写进方案；不具备回滚条件 → 本段不过

#### 6.2 回归范围

按影响面列出必须复跑的既有用例 / 场景；回归范围**只增不减**，用户要求缩小范围时在报告记录该决定与风险。

#### 6.3 方案对比（存在 2 条以上可行路径时）

列出 2–3 方案 + 各自代价（改动面 / 风险 / 回归成本），按 `./policies/ask-question-react.md` 让用户选；未选方案与拒绝理由写进报告。唯一路径 → 跳过本步。

#### 6.4 生成 tasks.md + tasks-lint

- 必读 `./templates/tasks-template.md`
- 任务数 ≤5；TDD 标注规则：写回归/写修复/跑回归 → `<!-- TDD 任务 -->`；简报补全/报告整理/归档 → `<!-- 非 TDD 任务 -->`；至少 1 个 TDD 任务
- 回填 `diagnose-brief.md`「修复方向」段（定稿）

```bash
bash "$PLUGIN_ROOT/scripts/tasks-lint.sh" ".polaris/tasks/<issue_id>/tasks.md"
```

- lint 真实校验项见 `./templates/tasks-template.md` 末节；「任务数 ≤5」「路径相对」lint 不校验，须自行核对
- 不通过 → 修 `tasks.md`；仍不通过则阻塞

#### 6.5 用户确认修复方案（阻塞点）

**技能自证 + 人确认（仅分叉时）**：方案符合最小变更 + 影响面与回归范围已列 + tasks-lint 通过。存在分叉时**人确认「方案可接受」**（`./policies/decision-point.md`，A 开始修复 / B 换方案 / C 范围过大转 normal）。

## 推进与回流

- 过门禁 → `complete-phase --phase triage --next-phase diagnose`，然后 `update-active --set phase=diagnose`，提示走 `polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose`
- 复现不稳 / 三对齐缺项 → 原地补信息，**不**推进；无证据偶发 → 停止，不推进