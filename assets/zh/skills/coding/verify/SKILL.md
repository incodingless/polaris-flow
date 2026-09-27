---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}verify
description: "对 build 产出做前置验证与测试证据落盘（Step 4.0：意图验收 → 按项目探测到的命令跑单测/集成/主干功能三档测试 → 三级分叉判读）、Constitution 审计、scorer 评分与对照规格验证，另含按 runtime.build.review_mode 可选委派的独立代码评审（polaris{{SKN_SPR}}coding{{SKN_SPR}}codereview）与人工业务语义确认（Step 4.4）；用户触发 /polaris{{SKN_SPR}}coding{{SKN_SPR}}verify，或在 build 完成后要求验收 / 审计实施产出 / 跑测试并落盘测试证据 / 跑 Constitution 合规与 scorer / 对照 specs 与 深度设计做验证时必须使用本 skill。"
---

# Polaris 工作流 - 阶段：验证（verify）

<HARD-GATE>
本 skill **仅**负责：在 **build 已完成** 的前提下，对实施产出做**前置验证与测试证据落盘**（Step 4.0：意图验收 → 三档测试执行 → 三级分叉判读）、Constitution 合规审计（注入点 D）、scorer 评分、对照 OpenSpec 四件套（+ `detailed-design.md` 若已深化）的实现验证，以及**按 `review_mode` 可选委派的独立代码评审**（Step 4.3，委派 `polaris{{SKN_SPR}}coding{{SKN_SPR}}codereview`）与**人工业务语义确认**（Step 4.4）；通过后推进到 ship。

- **禁止**跳过 5 个 scorer 脚本（脚本缺失见 Step 3 降级；不得假装已跑）
- **禁止**在 team 模式下，scorer / Constitution 形成 blocking 时把 `runtime.verify.blocked=false` 或标记通过
- **禁止**未写入 `.polaris/metrics/<timestamp>-metrics.json` 且未完成出口校验就把 `phase` 推到 ship
- **禁止**本阶段做分支合并 / PR / worktree 合回 / `/opsx:archive`（那是 ship）
- **禁止**本阶段编写业务实现代码；用户确认修复后回 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`，不得在 verify 内静默改实现
- **禁止**未按 `./policies/decision-point.md` 获得用户对「验证失败 / override / 规格漂移」的明确选择就继续或接受偏差
- **禁止**用主代理（生成方）自审替代 Step 4.3 的**独立**代码评审；无独立 subagent 能力时按 `polaris{{SKN_SPR}}coding{{SKN_SPR}}codereview` 的「降级决策」走，不得默认自审、不得把降级结果写成独立评审
- **禁止把本技能的显式要求「自行加码」**：执行口径以 Step 4.0 与 `test.commands.*` 为准 —— 例：`unit` 槽只跑单测命令（`mvn -B test`），**不得**擅自升格为 `mvn verify` / `gradlew check` 等含集成的命令。技能没显式要求的，不跑
- **禁止冒充测试证据**：未真实调用测试命令、未拿到「命令 + 退出码 + 输出摘要 + commit SHA」时，不得声称测试通过；拿不到证据一律记 `No-Verification` 并写明原因
- **禁止默认跳过 Step 4.4 人工业务语义确认**：跳过**必须**由用户明确选择并留下原因（`semantics_review=skipped_by_user` + 原因），不得静默略过
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
| 代码评审报告（Step 4.3，可选） | `openspec/changes/<task_id>/reviews/code-review-report.md` |
| 测试证据（Step 4.0） | `openspec/changes/<task_id>/reviews/` 下随验证报告记录：命令 + 退出码 + 输出摘要 + commit SHA |
| 基线红名单快照（Step 4.0.5，可选） | `openspec/changes/<task_id>/reviews/baseline-tests.*` |
| 测试执行配置 | `.polaris/config.yaml` 的 `test:` 段（模板见 `templates/config.example.yaml`） |
| 测试命令探测脚本 | `$PLUGIN_ROOT/scripts/detect-test-command.sh` |
| Metrics | `.polaris/metrics/<timestamp>-metrics.json`（顶层） |
| Constitution 规则 | `./policies/constitution-audit.md` |
| workflow 游标 | `.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.sh`） |

> **链路**：`specify → plan → (design 可选) → tasks → build → **verify** → ship`。
> 本阶段验证是否可交付；不交付、不归档。
> Step 4.0（前置验证与测试执行）是本阶段**必经**入口；Step 4.3 的独立代码评审是本阶段内嵌的**可选调用点，不是阶段**（不占游标、不写 `phase`）；Step 4.4 是**人工验证**落点（见下）。
> Step 4.3 / 4.4 均为**本阶段内的子步**，不占游标、不写 `phase`。

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
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase verify
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --set runtime.verify.blocked=false
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

### Step 4：前置验证 + 规模评估 + 实现验证

#### 4.0 前置验证（意图验收 → 命令获取 → 三档执行 → 三级分叉 → 三段判读）

**位置与依据**：排在 `4.1 决定 verify_mode` **之前** —— 先验方向，再定规模。方向错了，后面所有测试与评审都是白费（IEEE 1012：Validation 先于 Verification）。

**不受 `runtime.build.review_mode` 控制**：单测执行**总是**发生；`review_mode` 只决定 `4.3` 的独立代码评审是否执行。两者是不同层的东西，不复用同一个开关。

##### 4.0.0 总闸

> **技能显式要求的必须跑；没显式要求的不许自行扩张。**
> 反例（2026-09-25 实测）：技能只说「跑测试」，AI 自行扩张成 `mvn verify`，把集成层拉进了本阶段。
> 本阶段**只执行单测命令**；集成 / 主干功能各走自己的槽位（见 `4.0.3`），**不得由 agent 自行升格**。

##### 4.0.1 意图验收

把 `4.2b` 的 #2–#6 五项在此**先行**核验（内容零增删，仅前移）：

| # | 内容 |
|---|------|
| 1 | 实现符合高层 `openspec/changes/<task_id>/design.md` |
| 2 | 实现符合 `openspec/changes/<task_id>/detailed-design.md`（**仅 `runtime.design.status=completed` 时检查**） |
| 3 | 能力规格场景可追溯通过（或明确记录未自动化项与手工结论） |
| 4 | `proposal.md` 目标已满足 |
| 5 | specs / detailed-design（若有）无未记录矛盾（Build 中改过 spec 的，detailed-design 须有对应记录） |

**不满足 → 立即进 [验证失败决策](#验证失败决策阻塞点)**，**不得进入 4.0.2**（不浪费一次全量测试）。

产出**意图基线**（供 `4.4` 复用）：本次 change 声明的目标 + 验收场景 + 关键业务术语清单。

##### 4.0.2 测试命令获取（探测 → 展示 → 人工确认 → 落盘）

```
读 config → [有 confirmed 值? 直接用，不再问]
         → 无 → 调用 detect-test-command.sh 探测 → 展示（含判定依据）→ 人工确认点
              → [确认 | 修正 → 按反馈类型分流] → 落盘 config → 可执行确认
```

**探测由脚本执行**（判定表的唯一可执行实现；本技能不内联副本）：

```bash
bash "$PLUGIN_ROOT/scripts/detect-test-command.sh" --repo-root "$REPO_ROOT" --slot unit
```

stdout 为 `key: value` 行：`framework` / `command` / `evidence`（含 `文件:行`）/ `confidence` / `excluded`（失败时另有 `reason`）。

| 退出码 | 含义 | 本步动作 |
|--------|------|----------|
| `0` | 探测到可用命令 | 展示给用户确认 |
| `1` | 项目无此层验证 | 按 `4.0.4` 第 1 级处置 |
| `2` | 探测到但不可执行 | 按 `4.0.4` 第 2 级处置（**不得当作代码缺陷**） |

**单测边界（写死）**：本阶段只执行**单测命令**（`mvn -B test` / `./gradlew test` …）；**不执行**需外部环境的集成测试（`mvn verify` / `*IT.java`）。脚本输出的 `excluded` 即本档明确排除项。

**展示**（给机器看结论，**给人看依据**）：

```
框架   : Maven (Surefire)
命令   : mvn -B test
依据   : pom.xml:34 命中 maven-surefire-plugin
置信度 : 高
排除   : mvn verify（Failsafe *IT.java = 集成，本阶段不跑）
```

**人工确认点**：走 `./policies/decision-point.md` 停顿 + `./policies/ask-question-react.md`（选项上限 10）。

**修正按反馈类型分流**（不得一律重探）：

| 人工反馈 | 例 | 处置 |
|----------|-----|------|
| **明确命令** | 「就跑 `npm run test:unit`」 | **不再探测** → 校验后采用。再探测会让系统猜测**覆盖**人的明确指令 |
| **线索 / 纠错** | 「这是 monorepo」「包管理器用 pnpm」 | **必须重探**（人给的是不完整信息，系统负责落实到命令） |

**收敛条件**：重探 ≤ **2 轮**；超限则请人工直接给命令，或记 `No-Verification`。不得伪造选项。

**落盘**（`.polaris/config.yaml` 的 `test:` 段）：`test.commands.<slot>` + `test.source: probed|confirmed|corrected` + `test.confirmed_at`。

- **不靠手填** —— 值 = 探测结果 + 人工确认的产物
- **确认一次长期有效**：已有 confirmed 值 → 直接读、不再问（否则高频变更每轮都要停一次）
- **冲突时 config 优先**：项目换了框架、探测结果与之不符 → 不打断，仅在报告记一行提示

**可执行确认 4 项**：

1. 命令在 PATH —— 脚本已判（不通过即退出码 `2`）
2. 脚本 / target 存在 —— `npm pkg get scripts.test` 非 null；`make -n test` 不报错
3. **不是 watch 模式** —— 执行时**统一加 `CI=true` 前缀**（多数框架据此从 watch 转单次运行）
4. 环境依赖 —— **探测不出来**，只能首跑暴露 → 按 `4.0.4` 第 2 级处置

##### 4.0.3 三档执行

| 轨 | 命令槽（`test.commands.*`） | 触发条件 | 环境 | 超时默认 |
|----|------------------------------|----------|------|----------|
| 1 单元 | `unit` | **总是跑**（`light` / `full` 都要） | 零依赖 | 300s（JVM 生态 600s） |
| 2 集成 | `integration` | 改动跨模块边界 / DAO / 外部接口 | 需 DB / 容器 | 600s |
| 3 主干功能 | `smoke` | `verify_mode=full` **且**该槽位存在 | 完整运行环境 | 900s |

- 三档**共用 `4.0.2` 的同一套回路**（探测 → 展示 → 人工确认 → 落盘），只是多两个槽位；**一次展示、一次确认**，不逐个问
- **槽位缺失 → 记 `No-Verification: 无 … 入口`** + 报告声明，**不阻断**（技能不自己拼装环境）
- **环境由项目负责**：技能只调用「一条命令跑通、自带环境准备」的项目入口，**不自己起容器、不灌数据**
- **v1 范围**：三档**接口**进 v1；集成 / 功能档**按项目可用性降级**（无入口 → `No-Verification`），避免无环境的项目卡死

**超时**（`test.timeout.*`，config 可覆盖）：

- **首次超时自动放宽 1 次**（×2）—— 冷缓存 / 依赖首次下载 / 首次编译是常见假超时
- **仍超时** → 按 `4.0.4` 第 2 级处置。**但须保留已产生的部分输出**：若已有「执行 N 用例」摘要后卡在某条，证据留档供人看 —— 它可能是**死锁类真缺陷**（并发 / 未释放锁）。判定仍按第 2 级（不自动回 build），但报告须写明「卡在第 N 条」

##### 4.0.4 三级分叉判读

「环境由项目负责」使「**入口存在但环境没起好**」成为高频情形。若只写「非零退出码 → 回 build」，则 **Docker 没起 / DB 连不上**会被误判为**代码缺陷** → agent 会去 build 里找一个不存在的 bug。

| 级 | 现象 | 性质 | 处置 |
|----|------|------|------|
| 1 | **探测不到入口**（脚本退出码 `1`） | **项目属性** | `light` → 记 `No-Verification` 放行 + 声明；`full` → **阻断**（`test.no_framework_policy: by_mode`） |
| 2 | 入口存在但**无测试结果摘要**（脚本退出码 `2` / 0 用例 / 进程异常退出 / 超时） | **环境 / 基础设施** | 重试 1 次 → 仍失败记 `No-Verification: 环境不可用`；**不当作代码缺陷、不回 build**；超时若已有部分摘要须留档（见 `4.0.3`） |
| 3 | 跑起来且**有测试结果摘要**（执行 N 用例 / M 失败） | **真实验证失败** | 进 `4.0.5` 三段判读 |

**判据**：*有没有测试结果摘要* —— 测试框架跑起来必输出「执行 N 个用例」；环境问题通常连收集都没开始。**可机械判定，不硬编码任何错误消息。**

**第 1 级的声明复用既有措辞**：`项目无测试框架，建议先引入`（出处：`polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks` 技能的 `references/test-review-methodology.md`，那是计划期的同一句话）。**不得**为同一现象新造第二套术语。

**防滥用**：「环境由项目负责」**≠**「技能可预判环境不可用而跳过」。**必须真调用一次让失败暴露** —— 否则会冒出逃避路径（自判「环境估计不行」→ 静默放行）。

##### 4.0.5 三段判读 + 基线红名单

**一次执行、三段判读**（**不跑两遍** —— 增量轨是全量的**子集**，跑两遍等于把子集测两次）。

**前置：flaky 处置**（`test.flaky_policy`，默认 `retry_and_mark`）—— 任一条红**先自动重试 1 次**再判读：

| 重试结果 | 判定 | 报告 |
|----------|------|------|
| 通过 | **算通过**（不阻断），但**强制标注** `首次失败 · 重试通过` | 必须写入报告「flaky」段 |
| 仍失败 | 进下方三段判读，按真失败处置 | 正常记录 |

- **强制标注是这个选项的全部价值**：重试解决「偶发抖动卡流程」，标注解决「flaky 被静默掩盖 → 永远没人修」
- 同一 change 内**同一用例两次重试才过** → 升级 **CRITICAL**（不是抖动，是设计问题）
- 与研究报告 §5.4 的偏差**已登记**：报告倾向「不重试」（「一个无法失败的测试比没有测试更糟」）；本设计取重试是**工程折中**，用**强制标注**换回可观测性。`test.flaky_policy` 可改回 `fail_on_flake`

三段判读：

| 判读段 | 规则 |
|--------|------|
| a **增量轨** | 本次新写的测试有红 → **回 build**（**本次新增的测试必须绿**，属 build 的欠账）。**不比对红名单** |
| b **存量轨** | 红且**不在**红名单 → 回 build（**回归**）；红且**在**红名单 → 记 `No-Verification: 历史欠债` 放行 |
| c **清单增删** | 测试文件**删除 / 加 skip**（`@skip` / `xfail` / `.only` / 注释掉断言）且无理由 → **CRITICAL** |

判读 c 的依据：研究报告 §5.4「一个无法失败的测试比没有测试更糟，因为它制造虚假信心」。报告须写清：新增 N / 修改 M / **删除必须为 0**（或逐条显式声明理由）—— 「全绿」报告对删测试 / 加 skip 完全无感。

**证据落盘**：每轨执行必须留「**命令 + 退出码 + 输出摘要 + commit SHA**」。

**基线红名单**（定义：**本次改动开始之前（base commit）本来就失败的测试清单**；其唯一作用是**归因** —— 没有它，每条红都无法归属，`4.3` 独立裁判的每条 CRITICAL 都无法归因）—— **默认走 A（全绿才放行）**，红名单为可选逃生门：

| 序 | 来源 | 成本 | 前提 |
|----|------|------|------|
| 1 | 项目提供的命令 / CI artifact（`test.baseline.command` / `test.baseline.file`） | 零 | 需项目提供 |
| 2 | **人工确认一次** → 落盘快照，绑定本 change | 低（一次性） | 无 |
| 3 | 跑 base commit（临时 worktree + 可能重装依赖） | **分钟级重操作** | base SHA 可得 |
| 4 | 降级 **A（全绿）** + 报告显式标注 | 零 | 兜底 |

> **为什么默认 A 就够了**：红名单只对「CI 本身有红」的项目有意义。项目 CI 全绿时红名单 = 空集，健康项目**零额外成本**；只有存量有红的项目才付出红名单代价 —— 而它们本来就需要。

**人工确认的交互形态**（复用「探测 → 展示 → 确认 → 落盘」回路）：

1. `4.0` 跑完全量 → 有红 → 无基线可用
2. **先按影响面启发式预填**：失败的测试所覆盖的代码**是否落在本次 diff 内**？命中 → 倾向「本次回归」；未命中 → 倾向「历史欠债」。**预填而非空白**
3. 展示「红列表 + 预判」+ 三选项（[A] 预判正确 · [B] 修正 · [C] 全部按严格处理）→ 人工勾选
4. 落盘 `openspec/changes/<task_id>/reviews/baseline-tests.*`（**绑定本 change 的一次性快照**）

**三条防滥用**：

- **「不确定」默认按严格处理**（当作回归）—— 防随手全选放行真回归
- **每个 change 只问一次**，落盘后复用，不再重复问
- **新增测试红了不问** —— 新测试本来就该绿，直接回 build

**实现细节**：

- 粒度取**用例级**（文件级太粗：一个文件里 3 个用例红，把整个文件列进名单会连带放行另外那些没人看过的失败）
- 采集时机：**verify 首次执行时采集一次、落盘缓存**，后续复用，不每次重跑 base
- ⚠️ **polaris 未记录 base commit**（`state.yaml` 的 `worktree` 段无 `base_commit`）→ 第 3 序需用 git 推导（`merge-base(<worktree.branch>, 主仓库当前分支)` 或 `@{upstream}`），**推导可行但脆弱** —— 这正是把人工确认（第 2 序）排在它前面的理由

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
4. 测试执行与判读：由 **Step 4.0** 执行（探测命令 → 三档执行 → 三级分叉 → 三段判读）。本项 = 「4.0 已处理完毕」，**不在此重复展开命令获取与判读规则**（口径唯一出处是 4.0）
5. 无明显安全问题（无硬编码密钥、无新增 unsafe）
6. 代码审查：由 **Step 4.3** 执行（`review_mode` 为 `standard`/`thorough` 时派**独立**评审；`off` 则跳过并在报告记录原因）。本项 = 「4.3 已按 `review_mode` 处理完毕」，**不在此重复展开范围与降级**（口径唯一出处是 4.3）

**与 build 去重**：build Step 4 已审过且未再改动的 diff，本步聚焦「是否符合 spec/tasks」与「build 之后新增改动」，不整份重审。

**跳过项**（轻量不做）：spec scenario 全覆盖、detailed-design 深度比对、纯 style 一致性、delta 与设计漂移检测。

**通过**：6 项全 OK，无 CRITICAL / IMPORTANT。  
**不通过** → [验证失败决策](#验证失败决策阻塞点)。

报告：简表 6 项 + PASS/FAIL，写入 `reviews/verify-report.md`（先确保 `openspec/changes/<task_id>/reviews/` 存在）。

#### 4.2b 完整验证

若宿主提供 `openspec-verify-change`（或等价 OpenSpec 验证 skill）→ **必须**加载并按其指引执行；不可用则按下列清单内联验证（不得假装已加载）。

检查项：

1. `tasks.md` 全部 `[x]`
2. 实现符合高层 `openspec/changes/<task_id>/design.md` —— **结论见 `4.0.1`**，此处不重复展开
3. 实现符合 `openspec/changes/<task_id>/detailed-design.md`（**仅 `runtime.design.status=completed` 时检查；`skipped` 时跳过本项**）—— **结论见 `4.0.1`**，此处不重复展开
4. 能力规格场景可追溯通过（或明确记录未自动化项与手工结论）—— **结论见 `4.0.1`**，此处不重复展开
5. `proposal.md` 目标已满足 —— **结论见 `4.0.1`**，此处不重复展开
6. specs / detailed-design（若有）无未记录矛盾（Build 中改过 spec 的，detailed-design 须有对应记录）—— **结论见 `4.0.1`**，此处不重复展开
7. `detailed-design.md` 可定位且与当前 change 相关（**仅 `runtime.design.status=completed` 时检查**）

> **#2–#6 已前移到 `4.0.1`（意图验收）**：本清单**原位保留编号与项数**，正文只指向结论 —— 于是 4.2b 仍是「7 项」、Step 编号不变，`polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` 与 `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` 的 `policies/exit-check.md` 所引用的两处跨技能契约（**`verify Step 3.2`** 与 **「7 项完整验证」**）同时不断。前移理由：方向错了，后面所有测试与评审都是白费，故先于 `4.0.2` 判定。

> **代码评审不在本 7 项内**：无论 `light` / `full`，统一由 **Step 4.3** 按 `runtime.build.review_mode` 执行
> —— 修掉此前「只有轻量路径提代码评审、完整路径反而没有」的倒挂。

**不通过** → [验证失败决策](#验证失败决策阻塞点)。

**规格漂移（检查项 6；判定见 `4.0.1`）** — decision-point 单选，不得自动选：

| 选项 | 动作 |
|------|------|
| A | 在 `detailed-design.md` 追加 `## Implementation Divergence` 记录原因（本阶段允许产物；不得因此再触发 Step 1 dirty 失败环）；**`runtime.design.status=skipped` 时无此文件，改为在 `reviews/verify-report.md` 记录偏差** |
| B | 用户确认后回 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`（或回 design/tasks，由用户选），更新设计与 specs |
| C | 确认偏差可接受，继续；报告中记录接受原因与影响 |

#### 4.3 独立代码评审（可选）

**触发**：`runtime.build.review_mode` ∈ `{standard, thorough}` → 执行；`off` → 跳过并记原因。**`light` / `full` 两条路径都适用**，不受 4.1 分流与 4.2a/4.2b 影响。

**入口条件**：**不存在未归因的红** —— `4.0.5` 三段判读必须已全部结清（所有红要么已回 build 修掉、要么已记入 `No-Verification`）。有未归因的红时**不得开始**独立评审：评审结论无法归因即作废，等于白审。

**执行**：调用 `polaris{{SKN_SPR}}coding{{SKN_SPR}}codereview`（`use_skill`），传入 `task_id` 并声明「用途 = 验证阶段的独立代码评审、范围 = 本次 diff（build 之后的新增改动为主）」。评审清单、派发方式、能力探测与降级决策**以该技能为唯一出处，本技能不内联副本**。

**回报消费**（`codereview.status`）：

| 回报 | 本步动作 |
|------|----------|
| `done`（`independent=true`） | 正常；按下方「判定」处理 |
| `degraded_inline`（`independent=false`） | **不阻断**，但报告中必须如实标注「降级 · 非独立裁判」；team 模式下按 `./policies/decision-point.md` 让用户确认是否接受 |
| `skipped:no_independent_reviewer` | 记入报告，非 blocking |
| `skipped:off` | 无需处理（Step 0 已判 `review_mode=off`） |
| `blocked` | **阻断** → [验证失败决策](#验证失败决策阻塞点) |

**判定**：

- 报告含 **CRITICAL** → **阻断** → [验证失败决策](#验证失败决策阻塞点)；不得自动接受
- 仅 **IMPORTANT** → 逐条进 [验证失败决策](#验证失败决策阻塞点)
- 仅 **WARNING / SUGGESTION** → 记入报告，不阻断

**与 build Step 4 不是重复，是分工**：build 的审查由**生成方**执行（自己给自己打分）；本步由**独立裁判**执行。build 已审过且本阶段未再改动的 diff，本步聚焦「build 之后的新增改动 + 独立视角复核」，不整份重审。

#### 4.4 人工验证（业务语义确认）

**性质**：本阶段**唯一的「人工验证者」**落点。位置在 `4.3` **之后**、[验证失败决策](#验证失败决策阻塞点)**之前**。

> 人工在 verify 里共三个角色：**配置确认者**（`4.0.2` 命令、`4.0.5` 红名单）、**验证者**（本步）、**裁决者**（验证失败 / override / 规格漂移）。
> 本步与 `4.0.1` 同在方向轴，一前一后不矛盾：`4.0.1` 是最前的**粗粒度方向闸门**（决定要不要往下验），本步是最后的**细粒度方向复核**（决定能否放行）。放最后两条理由：① 需要机器侧结论作输入；② 人工注意力稀缺（研究报告 §5.2 / §5.5），必须先让机器把噪声清掉。

**输入（给人看这三样，不给人看原始 diff）**：

| # | 输入 | 来源 |
|---|------|------|
| 1 | 意图基线 | `4.0.1` 产出 |
| 2 | **术语 → 实现**映射清单（逐条列「业务术语 → 落到哪个实现」） | 从 specs + diff 提取 |
| 3 | 机器侧结论摘要 | `4.0.4/4.0.5` 的轨结果 + `4.3` 的 CRITICAL / IMPORTANT 列表 + `No-Verification` 清单 |

**人只判一件事**：*AI 是否正确理解了业务术语，实现是否符合业务规则的真实意图*。

典型误读三类：

| 误读类型 | 例 |
|----------|-----|
| **作用域错** | 本客群 / 本租户的校验用到了别处的数据（券商跨客群额度复用案例） |
| **口径错** | 「逾期」的起算点、「金额」含税与否、「有效期」是否含当天 |
| **同名不同义** | 代码里的 `User` / `Account` 与需求文档里的同名术语不是一回事 |

**聚焦边界**：**不做机械性检查** —— 不让人跑命令、对行号、查格式、核编译（那些属 `4.0.3` / `4.2`；环境类问题走 `4.0.4` 第 2 级）。理由：人工审查有效性超 400 行骤降，**把机械性残留派给人会当场清空这一档的效用**。

**触发**：`light` / `full` **都必现** —— 业务语义误读与改动规模无关，改 3 行一样可能把「逾期」理解错。

**输出与处置**：

| 人的结论 | 落盘 | 后续 |
|----------|------|------|
| 确认无误 | `runtime.verify.semantics_review=confirmed` | 进决策点 |
| **发现偏** | 记入报告「业务语义确认」段 | 进 [验证失败决策](#验证失败决策阻塞点) |
| **明确跳过** | `semantics_review=skipped_by_user` + **原因必填** | `full` 下记 `No-Verification: 用户跳过业务语义确认`；不额外阻断 |

- **不得默认跳过**（与 `polaris{{SKN_SPR}}coding{{SKN_SPR}}codereview` 的降级三选项同构：**可降级、必须标**）。允许跳过是因为人是稀缺资源、可能不在场；要求留原因是因为这一步一旦静默消失，报告会看起来「全绿」而这层根本没做
- **与 `4.3` 不可互相替代**：`4.3` 是机器（独立 subagent）审「**代码写得对不对**」，本步是人审「**写的业务含义对不对**」。`4.3` 做不出业务语义判断（没有业务上下文），本步不做逐行代码审查（那是 `4.3` 的活）
- **落盘**：`reviews/verify-report.md` 的「业务语义确认」段 + `runtime.verify.semantics_review`

### Step 5：落盘证据 + 出口推进

验证通过后：

1. 确保 `openspec/changes/<task_id>/reviews/verify-report.md` 已写完整结论（含 Constitution 摘要、overall_score、light/full、各检查项、**Step 4.0 的测试证据链（命令 + 退出码 + 输出摘要 + commit SHA + 三段判读结论 + flaky 标注 + 各项 `No-Verification`）**、**Step 4.3 代码评审的回报状态与 CRITICAL/IMPORTANT 计数**、**Step 4.4 业务语义确认结论**）
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
  --set runtime.verify.codereview_status=<done|degraded_inline|skipped:off|skipped:no_independent_reviewer> \
  --set runtime.verify.codereview_report=openspec/changes/<task_id>/reviews/code-review-report.md \
  --set runtime.verify.test_command=<探测/确认后的命令，如 "mvn -B test"> \
  --set runtime.verify.test_result=<passed|failed|no_verification> \
  --set runtime.verify.test_slots=<实际执行的槽位，逗号分隔，如 unit,integration> \
  --set runtime.verify.semantics_review=<confirmed|skipped_by_user> \
  --set phase=idle
# scorer_results 等复杂对象可用 get-json 读出后由 Agent 合并，或多次 --set 扁平键
# semantics_review=skipped_by_user 时另记 runtime.verify.semantics_skip_reason=<原因>
```

3. 推进：
```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind coding --skill verify --where-task-id "$task_id" --set phase=ship
```

4. 输出：

```
验证阶段完成：
  task_id : <task_id>
  mode      : <light|full>
  score     : <overall_score> (<score_level>)
  测试      : <test_result>（<test_command>；已跑槽位 <test_slots>）
  代码评审  : <done|degraded_inline|skipped:off|skipped:no_independent_reviewer>
  业务语义  : <confirmed|skipped_by_user>
  report    : openspec/changes/<task_id>/reviews/verify-report.md
```

输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**）。
先按「自动衔接下一阶段」一节运行 `state next`，**下一步的技能名与括注均取自其输出**
—— `SKILL` 直填；括注按 `NEXT` 取（`manual` → 「建议新开会话」；`auto` → 「可同会话继续」）。**两者都不得写死**：

```text
[polaris-flow 开发]验证 - 阶段完成，状态已落盘。
下一步：/<SKILL>（建议新开会话 | 可同会话继续）。
恢复：先读 .polaris/metrics/<timestamp>-metrics.json 与 openspec/changes/<task_id>/reviews/verify-report.md，再从下一步技能的 Step 0 开始。
```

**硬阻断（不得推进 phase）**：

- `runtime.verify.blocked=true` 且用户未 override
- 存在未解决的 CRITICAL / IMPORTANT
- **存在未归因的红**（`4.0.5` 三段判读未结清）
- `4.0.4` 第 1 级命中（探测不到测试入口）且 `verify_mode=full`
- `runtime.verify.semantics_review` 未写入（`4.4` 未处理，含未留原因的静默跳过）
- metrics 文件未写入
- 验证报告未落盘
- Step 4.3 回报 `blocked`（独立代码评审被阻断），或存在未处理的代码评审 CRITICAL

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
- **`4.0` 已结清**：所有红已归因（回 build 修掉，或记 `No-Verification`），测试证据链（命令 + 退出码 + 输出摘要 + commit SHA）已落盘
- 代码评审已按 `review_mode` 处理完毕（`runtime.verify.codereview_status` 已写）；`done` 时 `reviews/code-review-report.md` 已落盘
- **`4.4` 已处理**：`runtime.verify.semantics_review` ∈ `{confirmed, skipped_by_user}`（跳过时原因已记入 `semantics_skip_reason`）
- `runtime.verify.status=completed`，且 `phase=ship`

## 上下文压缩恢复

重载：`task_id`、`worktree_path`、`verify.*`（status / mode / score_level / blocked / test_result / test_slots / semantics_review）、最新 metrics 文件、本 skill 停在哪一步、失败项清单（若有）、`test.*` 配置（`.polaris/config.yaml`）。  
- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 Step 2/3 → 从该步续，勿重复已写入的 metrics（可追加新 timestamp 文件）  
- 停在 `4.0.2` 命令确认 → 从该回路续；`test.commands.*` 已有 confirmed 值则**直接读、勿重新探测**（否则会把用户否定的答案再探一遍）
- 停在 `4.0.3` / `4.0.4` → 勿重复已产生证据的轨；三级分叉的判定看**有无测试结果摘要**，不看退出码记忆
- 停在 `4.0.5` 红名单确认 → 从决策点续，**勿重跑全量**；`baseline-tests.*` 已在则复用
- 停在 Step 4.3 → 代码评审报告在则从回报消费续，不在则重派；**勿把 `degraded_inline` 当独立评审**  
- 停在 Step 4.4 → 从人工确认续；`runtime.verify.semantics_review` 未写即视为**未处理**（不得因「上次好像确认过」而放行）
- 停在 Step 4 失败决策 → 从决策点续，勿重跑已通过的检查项（除非用户要求全量重跑）  
- 勿重新跑 build apply；勿进入 ship 直到出口校验通过
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```
