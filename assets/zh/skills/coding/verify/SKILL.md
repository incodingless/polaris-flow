---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}verify
description: "对 build 产出做 Constitution 审计、scorer 评分与对照规格验证；用户触发 /polaris{{SKN_SPR}}coding{{SKN_SPR}}verify，或在 build 完成后要求验收 / 审计实施产出 / 跑 Constitution 合规与 scorer / 对照 specs 与 深度设计做验证时必须使用本 skill。"
---

# Polaris 工作流 - 阶段：验证（verify）

<HARD-GATE>
本 skill **仅**负责：在 **build 已完成** 的前提下，对实施产出做 Constitution 合规审计（注入点 D）、scorer 评分、以及对照 OpenSpec 四件套（+ `detailed-design.md` 若已深化）的实现验证；通过后推进到 ship。

- **禁止**跳过 5 个 scorer 脚本（脚本缺失见 Step 3 降级；不得假装已跑）
- **禁止**在 team 模式下，scorer / Constitution 形成 blocking 时把 `runtime.verify.blocked=false` 或标记通过
- **禁止**未写入 `.polaris/metrics/<timestamp>-metrics.json` 且未完成出口校验就把 `phase` 推到 ship
- **禁止**本阶段做分支合并 / PR / worktree 合回 / `/opsx:archive`（那是 ship）
- **禁止**本阶段编写业务实现代码；用户确认修复后回 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`，不得在 verify 内静默改实现
- **禁止**未按 `./policies/decision-point.md` 获得用户对「验证失败 / override / 规格漂移」的明确选择就继续或接受偏差
- **H8**（状态行）：每个 Step 入口输出 `[polaris-flow 开发]验证 - 进入 verify Step <N>: <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]验证 - 进入阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}verify 技能。`

## 标识约定

| 项 | 路径 / 值 |
|----|-----------|
| `task_id` | 与 specify → build 同值 |
| OpenSpec 四件套 | `openspec/changes/<task_id>/`（proposal / design / specs / tasks） |
| 深度设计（只读，`runtime.design.status=skipped` 时不存在） | `openspec/changes/<task_id>/detailed-design.md` |
| 业务档案 | `.polaris/tasks/<task_id>/state.yaml` |
| 验证报告 | `openspec/changes/<task_id>/reviews/verify-report.md` |
| Metrics | `.polaris/metrics/<timestamp>-metrics.json`（顶层） |
| Constitution 规则 | `./policies/constitution-audit.md` |
| workflow 游标 | `.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.sh`） |

> **链路**：`specify → plan → (design 可选) → tasks → build → **verify** → ship`。
> 本阶段验证是否可交付；不交付、不归档。

## 前置条件

- 代码已提交（阶段 3 完成）
- tasks.md 全部任务已完成

## Metrics 存储约定

- 目录：`.polaris/metrics/`（**当前工作目录**的 `.polaris/`——若在 worktree 内即 worktree 的 metrics；ship 合回主仓）
- 文件名：`<timestamp>-metrics.json`，每次 verify 写一个新文件，**不覆盖**历史，`<timestamp>`格式：`date -u +%Y%m%d-%H%M%S`（UTC）
- JSON 顶层**必含** `task_id`
- **禁止**写到 `.polaris/metrics.json`（单文件形式）——会破坏按时间戳叠加语义
- **禁止**把顶层 metrics 当冗余清理——retro 靠全局 glob
- 单个 scorer 也通过 `ls -t .polaris/metrics/*-metrics.json | head -1` 取最近一次结果

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：定位任务ID + 入口校验

用 bash 读取工作流配置中有效变更的`task_id`：

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind coding --skill verify --repo-root "$REPO_ROOT" --phase verify)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `task_id`
- **多个匹配**：按 `./policies/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到构建(build)阶段的活动任务，请先执行 /polaris{{SKN_SPR}}coding{{SKN_SPR}}build」

> 若 entry 已是 `phase=build`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。
> 若上次中断在 verify（`runtime.verify.status=in_progress`），从中断点续跑；不得因「已是 verify」而报零匹配。

**入口校验**（失败 → 阻断）：

| 检查 | 条件 |
|------|------|
| build 已完成 | `state.yaml` 中 `runtime.build.status=completed`（或用户明示接受续跑） |
| tasks 已勾完 | `openspec/changes/<task_id>/tasks.md` 中不存在 `- [ ]` |
| 四件套 + 深度设计 | `proposal.md` / `design.md` / `tasks.md` 非空，`specs/` 至少一非空文件；`detailed-design.md` 存在（**或 `runtime.design.status=skipped`，此时缺失合法**） |
| 工作目录 | 若 `worktree_path` 非空 → 后续读产物 / 跑命令 **以该 worktree 为仓库根**；否则用主仓 |

通过后更新 `state.yaml`：`phase: verify`，`runtime.verify.status: in_progress`，`runtime.verify.blocked: false`（本轮重新判定）。

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase verify
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.verify.blocked=false
```
输出：`[polaris-flow 开发]验证: 任务ID=<task_id> ; worktree=<path|main>`

### Step 1：处理dirty worktree

验证开始前检查未提交改动（目标协议：`./policies/dirty-worktree.md`；若文件尚未安装，按下表内联执行）：

| 情况 | 动作 |
|------|------|
| dirty 属于当前 change 的实现 / 测试 / tasks / specs / design / detailed-design | **不**在 verify 内修复或提交；记失败项 → [验证失败决策](#验证失败决策阻塞点) |
| dirty 仅为本阶段产物（验证报告草稿等） | 可继续 |
| 已实现但 `tasks.md` 仍有未勾选 | 视为 build 状态滞后 → [验证失败决策](#验证失败决策阻塞点) |

用户选择「回 build 修复」后，才允许调用 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`；本 skill 只写 `runtime.verify.status: failed` 与失败原因，**不**改 `phase`（由用户确认后主代理再把 phase 设回 build，或由 build 入口接受「从 verify 回退」的显式选择）。

### Step 2：Constitution Compliance Audit（注入点 D）

`read_file "./policies/constitution-audit.md"` 并按其执行。

脚本定位（若缺失或不可执行 → 提示用户重启会话以触发 SessionStart 重写 `plugin_root`；仍不可用则 decision-point：A 阻断 / B 用户接受跳过并记 override）：

```bash
bash "$PLUGIN_ROOT/scripts/constitution-validity.sh"   # 0=有效 / 1=无效 / 2=不存在
```

判定：

- **有效**：逐条核对 Core Principle —— `NON-NEGOTIABLE` 违规为 Critical，其余为 Important；有 Critical/Important → 停等用户三选项（自己修复 / 接受并记 overrides.log / 重做任务组）
- **无效**：按配置 `constitution_required`（来自 `.polaris/config.yaml` 或项目约定）告警或阻断

将累计的 Critical+Important 条数记为后续 metrics 的 `audit.violations`；核对项总数记为 `audit.total_checks`（无明确分母时填 1）。  
写入 `state.yaml`：`runtime.verify.constitution_valid: <true|false>`。

### Step 3：Scorer 评分

#### 3.1 跑 5 个 scorer

```bash
for s in audit-violation-rate constitution-violation-count test-coverage-scorer complexity-scorer doc-sync-scorer; do
  bash "$PLUGIN_ROOT/scorers/$s.sh"
done
```

每个脚本 stdout 一行 JSON：`{"scorer":"<name>","score":<0-100>,"reason":"<text>"}`。

**脚本缺失**：不得伪造分数。decision-point：A 阻断并提示补齐 scorers / B 用户接受「scorer 跳过」且仅当 mode≠team blocking 策略要求时方可继续（team + 强制 scorer 时只允许 A）。

#### 3.2 聚合写入 metrics

```bash
mkdir -p .polaris/metrics
TS=$(date -u +%Y%m%d-%H%M%S)
# 写入 .polaris/metrics/${TS}-metrics.json
```

单文件结构：

```json
{
  "timestamp": "20260525-074800",
  "task_id": "<task_id>",
  "mode": "solo",
  "audit": {
    "violations": 0,
    "total_checks": 12
  },
  "overall_score": 90,
  "scorers": [
    {"scorer":"audit-violation-rate","score":100,"reason":"..."},
    {"scorer":"constitution-violation-count","score":100,"reason":"..."},
    {"scorer":"test-coverage","score":85,"reason":"..."},
    {"scorer":"complexity","score":78,"reason":"..."},
    {"scorer":"doc-sync","score":92,"reason":"..."}
  ]
}
```

> `audit.violations` / `audit.total_checks` 来自 **Step 2** Constitution 审计（JSON 字段名历史兼容，不等于阶段名 audit）。

#### 3.3 Overall Score 加权聚合

```
overall_score = round( Σ(score_i × w_i) / Σ(w_i) )
```

- `w_i` 取自配置 `[scorer.weights]`（`.polaris/config.yaml` 或项目约定文件）；整段缺失 → 全部 `1.0`
- `w_i = 0` → 该 scorer 不参与 overall，但仍写入 `scorers[]`
- `Σ(w_i) = 0` → `overall_score = 0`，reason 注明「所有 scorer 权重为 0」
- 负权重 → 按 `1.0` 处理并警告

写入 `state.yaml`：`runtime.verify.overall_score`、`runtime.verify.scorer_results`。

#### 3.4 Mode 分发

```
if mode == solo:
  score_level = (overall_score < thresholds.solo.warn_below) ? "low" : "high"
else:  # team
  score_level = (overall_score < thresholds.team.block_below) ? "low" : "high"
```

- **solo**：低分仅告警，可继续验证（完整验证倾向）
- **team**：低分 → `runtime.verify.blocked: true`，需用户 override（记 overrides.log）后才可继续；未 override 禁止出口通过

写入 `runtime.verify.score_level: <high|low>`。

### Step 4：规模评估 + 实现验证

#### 4.1 决定 `verify_mode`

启发式（满足任一 → `full`，否则 `light`）：

| 信号 | 阈值 |
|------|------|
| `tasks.md` 任务条数（`- [x]` / `- [ ]`） | > 3 |
| delta / specs 下 capability 目录数 | > 1 |
| 相对 base 的变更文件数 | > 8 |

变更文件数优先用 build 以来的提交区间；若任务均已提交导致工作区 diff 低估，用 `detailed-design.md` / plan 头信息中的 `base-ref`（若有）或 `git merge-base` 与主干估算：

```bash
git diff --stat <base-ref>...HEAD
```

写入 `runtime.verify.verify_mode: <light|full>`。  
**覆盖**：agent 或用户可随时按 decision-point 改为 `light|full`。

分流：

| 条件 | 执行 |
|------|------|
| `verify_mode=light` 且 `score_level=high` | 轻量验证（4.2a） |
| `verify_mode=light` 且 `score_level=low` | 完整验证（4.2b） |
| `verify_mode=full` | 完整验证（4.2b） |

**立即执行：** 加载 Superpowers `verification-before-completion`。禁止跳过。

#### 4.2a 轻量验证

检查 6 项：

1. `tasks.md` 全部 `[x]`
2. 改动文件与 tasks 描述一致（`git diff --stat` / cached / `<base-ref>...HEAD` 对照）
3. 编译 / 构建通过（项目对应命令）
4. 相关测试通过
5. 无明显安全问题（无硬编码密钥、无新增 unsafe）
6. 代码审查：若 `runtime.build.review_mode` 为 `standard`/`thorough`，加载 Superpowers `requesting-code-review`，**只**查正确性 / 安全 / 边界；`off` 则跳过并在报告记录原因

**与 build 去重**：build Step 4 已审过且未再改动的 diff，本步聚焦「是否符合 spec/tasks」与「build 之后新增改动」，不整份重审。

**跳过项**（轻量不做）：spec scenario 全覆盖、detailed-design 深度比对、纯 style 一致性、delta 与设计漂移检测。

**通过**：6 项全 OK，无 CRITICAL / IMPORTANT。  
**不通过** → [验证失败决策](#验证失败决策阻塞点)。

报告：简表 6 项 + PASS/FAIL，写入 `reviews/verify-report.md`（先确保 `openspec/changes/<task_id>/reviews/` 存在）。

#### 4.2b 完整验证

若宿主提供 `openspec-verify-change`（或等价 OpenSpec 验证 skill）→ **必须**加载并按其指引执行；不可用则按下列清单内联验证（不得假装已加载）。

检查项：

1. `tasks.md` 全部 `[x]`
2. 实现符合高层 `openspec/changes/<task_id>/design.md`
3. 实现符合 `openspec/changes/<task_id>/detailed-design.md`（**仅 `runtime.design.status=completed` 时检查；`skipped` 时跳过本项**）
4. 能力规格场景可追溯通过（或明确记录未自动化项与手工结论）
5. `proposal.md` 目标已满足
6. specs / detailed-design（若有）无未记录矛盾（Build 中改过 spec 的，detailed-design 须有对应记录）
7. `detailed-design.md` 可定位且与当前 change 相关（**仅 `runtime.design.status=completed` 时检查**）

**不通过** → [验证失败决策](#验证失败决策阻塞点)。

**规格漂移（检查项 6）** — decision-point 单选，不得自动选：

| 选项 | 动作 |
|------|------|
| A | 在 `detailed-design.md` 追加 `## Implementation Divergence` 记录原因（本阶段允许产物；不得因此再触发 Step 1 dirty 失败环）；**`runtime.design.status=skipped` 时无此文件，改为在 `reviews/verify-report.md` 记录偏差** |
| B | 用户确认后回 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`（或回 design/tasks，由用户选），更新设计与 specs |
| C | 确认偏差可接受，继续；报告中记录接受原因与影响 |

### Step 5：落盘证据 + 出口推进

验证通过后：

1. 确保 `openspec/changes/<task_id>/reviews/verify-report.md` 已写完整结论（含 Constitution 摘要、overall_score、light/full、各检查项）
2. 更新 `state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase verify
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.verify.constitution_valid=<true|false> \
  --set runtime.verify.overall_score=<N> \
  --set runtime.verify.score_level=<high|low> \
  --set runtime.verify.verify_mode=<light|full> \
  --set runtime.verify.blocked=false \
  --set runtime.verify.verification_report=openspec/changes/<task_id>/reviews/verify-report.md \
  --set phase=idle
# scorer_results 等复杂对象可用 get-json 读出后由 Agent 合并，或多次 --set 扁平键
```

4. 推进：
```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind coding --skill verify --where-task-id "$task_id" --set phase=ship
```

3. 输出：

```
验证阶段完成：
  task_id : <task_id>
  mode      : <light|full>
  score     : <overall_score> (<score_level>)
  report    : openspec/changes/<task_id>/reviews/verify-report.md
下一步建议 /polaris{{SKN_SPR}}coding{{SKN_SPR}}ship。
```

**硬阻断（不得推进 phase）**：

- `runtime.verify.blocked=true` 且用户未 override
- 存在未解决的 CRITICAL / IMPORTANT
- metrics 文件未写入
- 验证报告未落盘

---

## 验证失败决策（阻塞点）

验证不通过时**必须**按 `./policies/decision-point.md` 暂停。不得自动调用 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`，不得自动把失败标成通过。

暂停时必须列出：

- 失败项
- 严重程度：CRITICAL / IMPORTANT / WARNING / SUGGESTION
- 推荐处理方式

**不确定性原则**：无法确定严重程度时，**宁可标轻**（SUGGESTION 或 WARNING），**禁止**在不确定时标 CRITICAL。仅对构建失败、测试失败、已确认安全问题使用 CRITICAL。

用户选择后：

| 选择 | 动作 |
|------|------|
| 全部修复 | 写 `runtime.verify.status: failed`；调用 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build` 修复（用户确认后） |
| 逐项处理 | CRITICAL / IMPORTANT 必须修；WARNING / SUGGESTION 可接受偏差但须写入报告；存在任一 CRITICAL/IMPORTANT 时禁止「全部接受」 |
| 接受偏差（仅非 blocking） | 记 overrides.log + 报告；team blocking 场景除外 |

**重试上限**：连续 3 次 verify→build→verify 失败循环后，第 4 次失败时**必须** decision-point 仅两选项：「接受所有偏差并记录」或「继续修复」——代理不得自行选择继续修。

---

## Constitution 注入点 D

- 原则来源：`openspec/memory/constitution.md`（路径以仓库约定为准）
- 详细规则：`policies/constitution-audit.md`
- 输出格式见该 policy；结果进入 metrics 的 `audit.*` 嵌套段与 `runtime.verify.constitution_valid`

## 退出条件

- 轻量或完整验证通过（无未解决 CRITICAL / IMPORTANT）
- `runtime.verify.blocked=false`（或已合法 override）
- `.polaris/metrics/<timestamp>-metrics.json`（**顶层**，勿写进 `tasks/<task_id>/`——ship 合回只扫顶层，写错会随 worktree 移除丢失）已写入且含 `task_id`
- `verify-report.md` 存在且 `runtime.verify.verification_report` 指向它
- `runtime.verify.status=completed`，且 `phase=ship`

## 上下文压缩恢复

重载：`task_id`、`worktree_path`、`verify.*`（status / mode / score_level / blocked）、最新 metrics 文件、本 skill 停在哪一步、失败项清单（若有）。  
- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 Step 2/3 → 从该步续，勿重复已写入的 metrics（可追加新 timestamp 文件）  
- 停在 Step 4 失败决策 → 从决策点续，勿重跑已通过的检查项（除非用户要求全量重跑）  
- 勿重新跑 build apply；勿进入 ship 直到出口校验通过
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```
