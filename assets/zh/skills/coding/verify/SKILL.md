---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}verify
description: "对 build 产出做验证并按证据落盘：编译闸门 → 意图验收 → Constitution 审计与静态 scorer → 单元测试（含三级分叉与三段判读 + 基线红名单）→ 覆盖率打分与强度补强 → 按 verify_mode 探测并执行契约 / 集成 / 功能三条测试轨 → 收口清单（轻量 6 项 / 完整 7 项）→ 按 runtime.build.review_mode 可选派发独立 subagent 做独立代码评审（可含用户选定的可选 SonarQube 扫描与门禁判定）→ 人工业务语义确认；用户触发 /polaris{{SKN_SPR}}coding{{SKN_SPR}}verify，或在 build 完成后要求验收 / 审计实施产出 / 跑测试并落盘测试证据 / 跑 Constitution 合规与 scorer / 对照 specs 与深度设计做验证时必须使用本 skill。"
---

# Polaris 工作流 - 阶段：验证（verify）

<HARD-GATE>
本 skill **仅**负责：在 **build 已完成** 的前提下，按「编译闸门 → 意图验收 → 自动检查项 → 按强度分档跑测试 → 收口清单」做实现验证与测试证据落盘，另含 Constitution 合规审计（注入点 D）、scorer 评分、对照 OpenSpec 四件套（+ `detailed-design.md` 若已深化）的实现验证，以及**按 `review_mode` 可选派发独立 subagent 的独立代码评审**（Step 14）与**人工业务语义确认**（Step 15）；通过后推进到 ship。

- **禁止**跳过 5 个 scorer 脚本（脚本缺失见 Step 5 / Step 7 降级；不得假装已跑）
- **禁止**在 team 模式下，scorer / Constitution 形成 blocking 时把 `runtime.verify.blocked=false` 或标记通过
- **禁止**未写入 `.polaris/metrics/<timestamp>-metrics.json` 且未完成出口校验就把 `phase` 推到 ship
- **禁止**未过 Step 3 编译闸门而继续（探不到构建入口时按 `No-Verification` 记，不阻断）
- **禁止**从 `state.yaml` 顶层的 `verify_mode` 读取强度 —— 唯一来源是 `runtime.verify.verify_mode`（顶层那份是默认生成的历史遗留死值）
- **禁止**下调 `risk_level` —— 两轴复核**只升不降**（信号表唯一源：`./policies/risk-signals.md`）；确需下调**必须**由用户按 `./policies/decision-point.md` 显式确认后再改
- **禁止**本阶段做分支合并 / PR / worktree 合回 / `/opsx:archive`（那是 ship）
- **禁止**本阶段编写业务实现代码；用户确认修复后回 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`，不得在 verify 内静默改实现
- **禁止**未按 `./policies/decision-point.md` 获得用户对「验证失败 / override / 规格漂移」的明确选择就继续或接受偏差
- **禁止**用主代理（生成方）自审替代 Step 14 的**独立**代码评审；无独立 subagent 能力时按 Step 14 的「降级决策」走，不得默认自审、不得把降级结果写成独立评审
- **禁止**在 Step 14 的「评审判据 + 派发方式 + 能力探测 + 降级决策」之外自造评审口径（该四者以 Step 14 为唯一出处）
- **禁止把本技能的显式要求「自行加码」**：执行口径以各 Step 与 `test.commands.*` 为准 —— 例：`unit` 槽只跑单测命令（`mvn -B test`），**不得**擅自升格为 `mvn verify` / `gradlew check` 等含集成的命令；`build` 槽只跑编译（`gradlew assemble`），**不得**换成会连带跑测试的 `gradlew build`。技能没显式要求的，不跑
- **禁止冒充测试证据**：未真实调用测试命令、未拿到「命令 + 退出码 + 输出摘要 + commit SHA」时，不得声称测试通过；拿不到证据一律记 `No-Verification` 并写明原因
- **禁止默认跳过 Step 15 人工业务语义确认**：跳过**必须**由用户明确选择并留下原因（`semantics_review=skipped_by_user` + 原因），不得静默略过
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
| 代码评审报告（Step 14，可选） | `openspec/changes/<task_id>/reviews/code-review-report.md` |
| 测试证据（Step 6 / 10–12） | `openspec/changes/<task_id>/reviews/` 下随验证报告记录：命令 + 退出码 + 输出摘要 + commit SHA |
| 基线红名单快照（Step 6.3，可选） | `openspec/changes/<task_id>/reviews/baseline-tests.*` |
| 构建 / 测试执行配置 | `.polaris/config.yaml` 的 `test:` 段（模板见 `templates/config.example.yaml`） |
| 命令探测脚本 | `$PLUGIN_ROOT/scripts/detect-test-command.sh`（五槽：`build` / `unit` / `contract` / `integration` / `smoke`） |
| Metrics | `.polaris/metrics/<timestamp>-metrics.json`（顶层） |
| Constitution 规则 | `./policies/constitution-audit.md` |
| workflow 游标 | `.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.sh`） |

> **链路**：`specify → plan → (design 可选) → tasks → build → **verify** → ship`。
> Step 0–16 **按顺序执行，任一步未完成不得进入下一步**；两道硬闸门（Step 1 的 dirty 处置、Step 3 的编译闸门）不过即停。
> Step 14（独立代码评审）与 Step 15（人工验证）是内嵌的**子步，不是阶段** —— 不占游标、不写 `phase`。

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

## 流程

**顺序全景**（前置 ×2 + Step 2–16）：

| 段 | 步骤 | 强度 |
|----|------|------|
| 前置 | Step 0 定位任务 ID + 入口校验 · Step 1 处理 dirty worktree | always |
| 模式无关基底 | Step 2 命令获取（`build` + `unit`）· Step 3 编译 / 构建闸门 · Step 4 意图验收 · Step 5 自动检查项 · Step 6 单元测试 · Step 7 覆盖率打分 + 强度补强 | always |
| 强度分流后 | Step 8 确定 `verify_mode` · Step 9 命令获取（按强度）· Step 10 契约测试 · Step 11 集成测试 · Step 12 功能测试 · Step 13 收口清单 | 按 `verify_mode` 与触发条件 |
| 收口与人 | Step 14 独立代码评审 · Step 15 人工验证 · Step 16 落盘证据 + 出口推进 | Step 14 按 `review_mode`；Step 15 必现 |

**排序依据**（冲突时方向优先）：

1. **方向优先** —— 先确认「做的是要的东西」，再确认「做得对」（IEEE 1012：Validation 先于 Verification）。
2. **事实先于策略** —— 编译回答「这个仓库现在能不能跑」，`verify_mode` 回答「这次要验多深」。编译不过即停，**连分流都省掉**。
3. **先机器后人工** —— 代价低、可自动化的先跑完；人工只接机器覆盖不了的**判断性**工作（人工审查超 400 行有效性骤降，研究报告 §2.2 / §5.2）。
4. **机器侧内部按代价与归因递增** —— 零依赖的先跑、需要外部环境的靠后（单元 → 契约 → 集成 → 功能）。**契约测试是静态校验（基于源码 AST / schema），不需要真实环境，故排在需要 DB / 容器的集成之前**。

**边界**：「先机器后人工」**不是**「人工接机器剩下的全部」。机械性残留（环境没起、需手工跑一条命令）走 `No-Verification`，**不占人工注意力**。

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

> **中断续跑**：entry 停在 `phase=build` 或 `runtime.verify.status=in_progress` 时从中断点续跑，**不得**判成「零匹配」。

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

**分级读入**：读 `state.yaml` 顶层的 `complexity_level` / `risk_level` / `current_tier`（`specify` Step 5.4.1 初判值），供 Step 8 复核与 Step 12/13 的触发判定使用。

- 字段缺失（老任务 / 非 specify 入口）→ 按 `standard` 兜底并在报告中标注「无初判，按默认档」
- 本步**只读不判**；复核统一在 Step 8

### Step 1：处理dirty worktree（硬闸门）

验证开始前检查未提交改动（目标协议：`./policies/dirty-worktree.md`；若文件尚未安装，按下表内联执行）：

| 情况 | 动作 |
|------|------|
| dirty 属于当前 change 的实现 / 测试 / tasks / specs / design / detailed-design | **不**在 verify 内修复或提交；记失败项 → [验证失败决策](#验证失败决策阻塞点) |
| dirty 仅为本阶段产物（验证报告草稿等） | 可继续 |
| 已实现但 `tasks.md` 仍有未勾选 | 视为 build 状态滞后 → [验证失败决策](#验证失败决策阻塞点) |

用户选择「回 build 修复」后，才允许调用 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`；本 skill 只写 `runtime.verify.status: failed` 与失败原因，**不**改 `phase`（由用户确认后主代理再把 phase 设回 build，或由 build 入口接受「从 verify 回退」的显式选择）。

### Step 2：命令获取（模式无关）

**回路**（探测 → 展示 → 人工确认 → 落盘）：

```
读 config → [有 confirmed 值? 直接用，不再问]
         → 无 → 调用 detect-test-command.sh 探测 → 展示（含判定依据）→ 人工确认点
              → [确认 | 修正 → 按反馈类型分流] → 落盘 config → 可执行确认
```

**探测由脚本执行**（判定表的唯一可执行实现；本技能不内联副本）：

```bash
for slot in build unit; do
  bash "$PLUGIN_ROOT/scripts/detect-test-command.sh" --repo-root "$REPO_ROOT" --slot "$slot"
done
```

stdout 为 `key: value` 行：`framework` / `command` / `evidence`（含 `文件:行`）/ `confidence` / `excluded`（失败时另有 `reason`）。

| 退出码 | 含义 | 本步动作 |
|--------|------|----------|
| `0` | 探测到可用命令 | 展示给用户确认 |
| `1` | 项目无此层验证 | `build` → 记 `No-Verification: 无构建入口`（不阻断）；`unit` → 按 `6.1` 三级分叉第 1 级处置 |
| `2` | 探测到但不可执行 | 按 `6.1` 三级分叉第 2 级处置（**不得当作代码缺陷**） |

**单测边界（写死）**：`unit` 槽只执行**单测命令**（`mvn -B test` / `./gradlew test` …）；**不执行**需外部环境的集成测试（`mvn verify` / `*IT.java`）。脚本输出的 `excluded` 即该槽明确排除项。
**构建边界（写死）**：`build` 槽只执行**编译 / 打包**命令（`mvn -B package -DskipTests` / `./gradlew assemble` / `npm run build`）；**不执行**会连带跑测试的 `gradlew build` / `npm test` —— 否则编译闸门就不再是闸门。

**展示**：

```
槽位   : build
框架   : Node (npm)
命令   : npm run build
依据   : package.json:31 命中 scripts.build
置信度 : 高
排除   : test 脚本（编译闸门不跑测试）

槽位   : unit
框架   : Vitest
命令   : npx vitest run
依据   : AGENTS.md:69 命中 Testing 章节（权威来源）
置信度 : 高
排除   : e2e / integration 套件
```

**人工确认点**：按 `./policies/decision-point.md` 暂停询问：两槽**一次展示、一次确认**，不逐个问。

**修正按反馈类型分流**（不得一律重探）：

| 人工反馈 | 例 | 处置 |
|----------|-----|------|
| **明确命令** | 「就跑 `npm run test:unit`」 | **不再探测** → 校验后采用。再探测会让系统猜测**覆盖**人的明确指令 |
| **线索 / 纠错** | 「这是 monorepo」「包管理器用 pnpm」 | **必须重探**（人给的是不完整信息，系统负责落实到命令） |

**收敛条件**：重探 ≤ **2 轮**；超限则请人工直接给命令，或记 `No-Verification`。不得伪造选项。

**落盘**（`.polaris/config.yaml` 的 `test:` 段）：`test.commands.<slot>` + `test.source: probed|confirmed|corrected` + `test.confirmed_at`。

**可执行确认 4 项**：

1. 命令在 PATH —— 脚本已判（不通过即退出码 `2`）
2. 脚本 / target 存在 —— `npm pkg get scripts.test` 非 null；`make -n test` 不报错
3. **不是 watch 模式** —— 执行时**统一加 `CI=true` 前缀**（见 `6.1`）
4. 环境依赖 —— **探测不出来**，只能首跑暴露 → 按三级分叉第 2 级处置

### Step 3：编译 / 构建闸门（硬闸门）

```bash
CI=true <test.commands.build>
```

- 命令来源见 Step 2（`build` 槽）；证据按 `6.1` 落盘（命令 + 退出码 + 输出摘要 + commit SHA）
- **通过 → 进 Step 4**
- **不通过 → 立即进 [验证失败决策](#验证失败决策阻塞点)**，不得进入后续任何步
- **探不到构建入口**（Step 2 退出码 `1`）→ 记 `No-Verification: 无构建入口` + 报告声明，**不阻断** —— 纯脚本 / 文档项目合法

### Step 4：意图验收

> **性质**：本阶段最前的**粗粒度方向闸门**（方向优先，见「流程」排序依据）。

> **无条件执行**：固定清单，**不读 `score_level`、不受 `verify_mode` 控制**。

检查清单：

| # | 内容 |
|---|------|
| 1 | 实现符合高层 `openspec/changes/<task_id>/design.md` |
| 2 | 实现符合 `openspec/changes/<task_id>/detailed-design.md`（**仅 `runtime.design.status=completed` 时检查**） |
| 3 | 能力规格场景可追溯通过（或明确记录未自动化项与手工结论） |
| 4 | `proposal.md` 目标已满足 |
| 5 | specs / detailed-design（若有）无未记录矛盾（Build 中改过 spec 的，detailed-design 须有对应记录） |

**不满足 → 立即进 [验证失败决策](#验证失败决策阻塞点)**，**不得进入 Step 5**（不浪费后续任何机器检查）。

产出**意图基线**（供 Step 15 复用）：本次 change 声明的目标 + 验收场景 + 关键业务术语清单。

### Step 5：自动检查项

> `audit.violations` 要进 metrics（Step 7.2），故本步必须排在 Step 6 之前。

#### 5.1 Constitution Compliance Audit（注入点 D）

`read_file "./policies/constitution-audit.md"` 并按其执行。

脚本定位（若缺失或不可执行 → 提示用户重启会话以触发 SessionStart 重写 `plugin_root`；仍不可用则 decision-point：A 阻断 / B 用户接受跳过并记 override）：

```bash
bash "$PLUGIN_ROOT/scripts/constitution-validity.sh"   # 0=有效 / 1=无效 / 2=不存在
```

判定：

- **有效**：逐条核对 Core Principle —— `NON-NEGOTIABLE` 违规为 Critical，其余为 Major；有 Critical/Major → 停等用户三选项（自己修复 / 接受并记 overrides.log / 重做任务组）
- **无效**：按配置 `constitution_required`（来自 `.polaris/config.yaml` 或项目约定）告警或阻断

将累计的 Critical+Major 条数记为后续 metrics 的 `audit.violations`；核对项总数记为 `audit.total_checks`（无明确分母时填 1）。
写入 `state.yaml`：`runtime.verify.constitution_valid: <true|false>`。

#### 5.2 静态 scorer（4 个）

```bash
for s in audit-violation-rate constitution-violation-count complexity-scorer doc-sync-scorer; do
  bash "$PLUGIN_ROOT/scorers/$s.sh"
done
```

每个脚本 stdout 一行 JSON：`{"scorer":"<name>","score":<0-100>,"reason":"<text>"}`。

**脚本缺失**：不得伪造分数。decision-point：A 阻断并提示补齐 scorers / B 用户接受「scorer 跳过」且仅当 mode≠team blocking 策略要求时方可继续（team + 强制 scorer 时只允许 A）。

### Step 6：单元测试

#### 6.1 共用执行规则（Step 6 / 10 / 11 / 12 同用）

| 规则 | 内容 |
|------|------|
| **环境由项目负责** | 技能只调用「一条命令跑通、自带环境准备」的项目入口，**不自己起容器、不灌数据** |
| **防滥用** | 「环境由项目负责」**≠**「技能可预判环境不可用而跳过」。**必须真调用一次让失败暴露** —— 否则会冒出逃避路径（自判「环境估计不行」→ 静默放行） |
| **槽位缺失** | 记 `No-Verification: 无 … 入口` + 报告声明，**不阻断** |
| **执行前缀** | 统一加 `CI=true`（多数框架据此从 watch 转单次运行） |
| **证据** | 每轨必须留「**命令 + 退出码 + 输出摘要 + commit SHA**」 |
| **越权边界** | 技能显式要求的必须跑；没显式要求的不许自行扩张（反例：技能只说「跑测试」，agent 自行扩张成 `mvn verify`，把集成层拉进了本阶段） |

**超时**（`test.timeout.*`，config 可覆盖）：

- **首次超时自动放宽 1 次**（×2）—— 冷缓存 / 依赖首次下载 / 首次编译是常见假超时
- **仍超时** → 按下方三级分叉第 2 级处置。**但须保留已产生的部分输出**：若已有「执行 N 用例」摘要后卡在某条，证据留档供人看 —— 它可能是**死锁类真缺陷**（并发 / 未释放锁）。判定仍按第 2 级（不自动回 build），但报告须写明「卡在第 N 条」

**flaky 处置**（`test.flaky_policy`，默认 `retry_and_mark`）—— 任一条红**先自动重试 1 次**再判读：

| 重试结果 | 判定 | 报告 |
|----------|------|------|
| 通过 | **算通过**（不阻断），但**强制标注** `首次失败 · 重试通过` | 必须写入报告「flaky」段 |
| 仍失败 | 进三段判读（仅单元轨），按真失败处置 | 正常记录 |

- **强制标注不可省**：重试解决偶发抖动，标注防「flaky 被静默掩盖」
- 同一 change 内**同一用例两次重试才过** → 升级 **Critical**（不是抖动，是设计问题）
- `test.flaky_policy` 可改回 `fail_on_flake`（关闭重试）

**三级分叉判读**（四轨共用）：因「环境由项目负责」，「入口存在但环境没起好」是高频情形 —— 只按「非零退出码 → 回 build」会把环境问题误判成代码缺陷。

| 级 | 现象 | 性质 | 处置 |
|----|------|------|------|
| 1 | **探测不到入口**（脚本退出码 `1`） | **项目属性** | `light` → 记 `No-Verification` 放行 + 声明；`full` → **阻断**（`test.no_framework_policy: by_mode`） |
| 2 | 入口存在但**无测试结果摘要**（脚本退出码 `2` / 0 用例 / 进程异常退出 / 超时） | **环境 / 基础设施** | 重试 1 次 → 仍失败记 `No-Verification: 环境不可用`；**不当作代码缺陷、不回 build**；超时若已有部分摘要须留档（见上） |
| 3 | 跑起来且**有测试结果摘要**（执行 N 用例 / M 失败） | **真实验证失败** | 单元轨 → 进 `6.2` 三段判读；其余轨 → 回 build |

**判据**：*有没有测试结果摘要* —— 测试框架跑起来必输出「执行 N 个用例」；环境问题通常连收集都没开始。**可机械判定，不硬编码任何错误消息。**

**第 1 级的声明复用既有措辞**：`项目无测试框架，建议先引入`（出处：`polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks` 的 `references/test-review-methodology.md`）。**不得**为同一现象新造第二套术语。

#### 6.2 单元轨执行 + 三段判读 + 基线红名单

```bash
CI=true <test.commands.unit>
```

**一次执行、三段判读**（不跑两遍）。三段判读**只作用于单元轨**：红名单是单元级概念，挂到功能测试上无意义。

| 判读段 | 规则 |
|--------|------|
| a **增量轨** | 本次新写的测试有红 → **回 build**（**本次新增的测试必须绿**，属 build 的欠账）。**不比对红名单** |
| b **存量轨** | 红且**不在**红名单 → 回 build（**回归**）；红且**在**红名单 → 记 `No-Verification: 历史欠债` 放行 |
| c **清单增删** | 测试文件**删除 / 加 skip**（`@skip` / `xfail` / `.only` / 注释掉断言）且无理由 → **Critical** |

报告须写清：新增 N / 修改 M / **删除必须为 0**（或逐条显式声明理由）—— 否则「全绿」报告对删测试 / 加 skip 完全无感。

**基线红名单**＝本次改动开始之前（base commit）本来就失败的测试清单，唯一作用是**归因** —— **默认走 A（全绿才放行）**，红名单为可选逃生门：

| 序 | 来源 | 成本 | 前提 |
|----|------|------|------|
| 1 | 项目提供的命令 / CI artifact（`test.baseline.command` / `test.baseline.file`） | 零 | 需项目提供 |
| 2 | **人工确认一次** → 落盘快照，绑定本 change | 低（一次性） | 无 |
| 3 | 跑 base commit（临时 worktree + 可能重装依赖） | **分钟级重操作** | base SHA 可得 |
| 4 | 降级 **A（全绿）** + 报告显式标注 | 零 | 兜底 |

**人工确认的交互形态**（复用「探测 → 展示 → 确认 → 落盘」回路）：

1. 单元轨跑完 → 有红 → 无基线可用
2. **先按影响面启发式预填**：失败的测试所覆盖的代码**是否落在本次 diff 内**？命中 → 倾向「本次回归」；未命中 → 倾向「历史欠债」。**预填而非空白**
3. 展示「红列表 + 预判」+ 三选项（[A] 预判正确 · [B] 修正 · [C] 全部按严格处理）→ 人工勾选
4. 落盘 `openspec/changes/<task_id>/reviews/baseline-tests.*`（**绑定本 change 的一次性快照**）

**三条防滥用**：

- **「不确定」默认按严格处理**（当作回归）—— 防随手全选放行真回归
- **每个 change 只问一次**，落盘后复用，不再重复问
- **新增测试红了不问** —— 新测试本来就该绿，直接回 build

**实现细节**：

- 粒度取**用例级**，不取文件级
- 采集时机：**verify 首次执行时采集一次、落盘缓存**，后续复用，不每次重跑 base
- ⚠️ **polaris 未记录 base commit**（`state.yaml` 的 `worktree` 段无 `base_commit`）→ 第 3 序需用 git 推导（`merge-base(<worktree.branch>, 主仓库当前分支)` 或 `@{upstream}`），**推导可行但脆弱** —— 这正是把人工确认（第 2 序）排在它前面的理由

### Step 7：覆盖率打分 + 强度补强

> `test-coverage-scorer` **只读**覆盖率产物、自己不跑测试，而覆盖率由 Step 6 产生 → 必须紧跟单元测试。

#### 7.1 覆盖率打分

```bash
bash "$PLUGIN_ROOT/scorers/test-coverage-scorer.sh"
```

**覆盖率产物缺失**（项目的单测命令没开覆盖率）：记 `reason: 无覆盖率产物`，该维按缺失写入报告 —— **不得伪造分数**，也**不为它改项目的单测命令**（开不开覆盖率是项目侧决定）。

#### 7.2 聚合写入 metrics

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

> `audit.violations` / `audit.total_checks` 来自 **Step 5.1** Constitution 审计。
> 本步的 `scorers[]` 由**两块**拼成：Step 5.2 的 4 个 + 本步 7.1 的 `test-coverage`。

#### 7.3 Overall Score 加权聚合

```
overall_score = round( Σ(score_i × w_i) / Σ(w_i) )
```

- `w_i` 取自配置 `[scorer.weights]`（`.polaris/config.yaml` 或项目约定文件）；整段缺失 → 全部 `1.0`
- `w_i = 0` → 该 scorer 不参与 overall，但仍写入 `scorers[]`
- `Σ(w_i) = 0` → `overall_score = 0`，reason 注明「所有 scorer 权重为 0」
- 负权重 → 按 `1.0` 处理并警告

写入 `state.yaml`：`runtime.verify.overall_score`、`runtime.verify.scorer_results`。

#### 7.4 得分等级

```
if kind == solo:
  score_level = (overall_score < thresholds.solo.warn_below) ? "low" : "high"
else:  # team
  score_level = (overall_score < thresholds.team.block_below) ? "low" : "high"
```

- **solo**：低分仅告警，可继续验证（完整验证倾向）
- **team**：低分 → `runtime.verify.blocked: true`，需用户 override（记 overrides.log）后才可继续；未 override 禁止出口通过

写入 `runtime.verify.score_level: <high|low>`。

**本步只产出 `score_level`** —— 「规模小但得分低 → 升格」的判定在 Step 8 消费它（不在此处改模式）。

> ⚠️ **`mode` 的来源是 `.polaris/config.yaml` 的 `kind`**（取值 `solo | team`），**不是** `state.yaml` 的 `mode`（取值 `sdd|tweak|normal|bugfix|full`，**永不等于 `solo`**）—— 按它读会永远走 team 分支。

### Step 8：确定 `verify_mode`

**强度的唯一出口**（输入 = 规模启发式 + `score_level` + 风险轴复核，见下）—— 影响面：Step 9 探哪些槽位 / Step 12 是否跑功能测试 / `no_framework_policy` 的处置 / Step 13 选哪份收口清单。一处定、后面全用。

**启发式基础档**（满足任一 → `full`，否则 `light`）：

| 信号 | 阈值 |
|------|------|
| `tasks.md` 任务条数（`- [x]` / `- [ ]`） | > 3 |
| delta / specs 下 capability 目录数 | > 1 |
| 相对 base 的变更文件数 | > 8 |

变更文件数优先用 build 以来的提交区间；若任务均已提交导致工作区 diff 低估，用 `detailed-design.md` / plan 头信息中的 `base-ref`（若有）或 `git merge-base` 与主干估算：

```bash
git diff --stat <base-ref>...HEAD
```

**强度补强（一）—— 消费 Step 7 的 `score_level`**：

| 基础档（规模启发式） | `score_level` | 最终 `verify_mode` |
|---|---|---|
| 未命中（小改动 → `light`） | `low` | **`full`**（升格） |
| 未命中（小改动 → `light`） | `high` | `light` |
| 命中 → `full` | 任意 | `full` |

**两轴复核（两段式的第二段）—— 只升不降**

用 build 以来的 diff 复核**风险轴**：按 `./policies/risk-signals.md` **§5** 的 glob 扫改动路径，并按 **§4** 的实现侧信号（`D1` / `D3` / `D4` / `D7`）做语义判断。
取 `risk_level' = max(Step 0 读入的 risk_level, 本次复核值)` —— **只升不降**（下调须用户按 `./policies/decision-point.md` 显式确认）。`complexity_level` 本步**不重判**（实现侧不改需求复杂度）。

**强度补强（二）—— 消费复核后的 `risk_level'`**：

| `risk_level'` | 最终 `verify_mode` |
|---|---|
| `critical` | **`full`**（一票覆盖基础档） |
| `standard` / `trivial` | 沿用「补强（一）」的结果 |

> 必须在此处定格：Step 9 要按**最终**模式决定探不探 `smoke` 槽。

**写回**（这一处定、后面全用）：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.verify.verify_mode=<light|full> \
  --set risk_level=<risk_level'> \
  --set current_tier=<max(complexity_level, risk_level')> \
  --set runtime.verify.risk_escalation_reason=<上调时记命中的信号编号 / glob 片段；未上调留空>
```

- `runtime.verify.verify_mode` —— **强度的唯一读取来源**
- `risk_level` / `current_tier` —— 复核后的最终档，Step 12 / 13 直接消费

> **覆盖**：agent 或用户仍可随时按 decision-point 改为 `light|full`。

**立即执行：** 加载 Superpowers `verification-before-completion`。禁止跳过。

### Step 9：命令获取（按强度）

探 `contract` / `integration` / `smoke` 三槽。**按 Step 8 的结果决定探哪些**：

| 槽 | 探不探 | 触发条件 |
|---|---|---|
| `contract` | 探 | 项目存在接口契约源（OpenAPI / Protobuf / Pact / GraphQL schema …） |
| `integration` | 探 | 改动跨模块边界 / DAO / 外部接口 |
| `smoke` | **仅 `full` 探** | `verify_mode=full` 且槽位存在 |

**回路同 Step 2**（探测 → 展示 → 人工确认 → 落盘，重探 ≤ 2 轮），只是换了槽位：

```bash
for slot in contract integration; do
  bash "$PLUGIN_ROOT/scripts/detect-test-command.sh" --repo-root "$REPO_ROOT" --slot "$slot"
done
[ "$verify_mode" = "full" ] && bash "$PLUGIN_ROOT/scripts/detect-test-command.sh" --repo-root "$REPO_ROOT" --slot smoke
```

**一次展示、一次确认**（不逐个问）。落盘同 Step 2：`test.commands.<slot>` + `source` + `confirmed_at`。

**本段明确排除项**（脚本输出另给 `excluded`）：

| 槽 | 不得执行 |
|---|---|
| `contract` | 单测 / 集成 / E2E 各档命令（本槽只跑契约测试） |
| `integration` | `mvn -B test`（只跑单测）等 |
| `smoke` | 单元 / 集成档命令 |

**两轨同源检测**：若 `integration` 与 `smoke` 探到**同一条命令** → 报告标「两轨同源」，Step 12 只跑一次、判读合并（否则同一条命令会被跑两遍）。

### Step 10：契约测试

**性质**：**静态契约校验**（基于源码 AST / schema 的一致性验证），不是运行时断言 —— 故**不需要真实环境**，排在需要 DB / 容器的集成之前。

**验什么**：接口契约 —— 函数签名 / 请求响应结构 与 OpenAPI Schema / Protobuf / Pact 契约文件是否一致；字段增删、类型变更、必填性变化。

**触发**：Step 9 探到 `contract` 槽。

**执行与判读**：共用规则见 `6.1`；本轨**不做三段判读、不比对红名单**（那是单元轨专属），只做三分：

| 结果 | 处置 |
|------|------|
| 通过（有结果摘要） | 记证据，进 Step 11 |
| **未通过**（有结果摘要） | 回 build（契约不一致是代码缺陷） |
| 探不到槽位 / 无结果摘要 | 记 `No-Verification: 有契约源无测试入口`，**不阻断** |

**不新增重型工具**：技能不引入契约测试框架，只用项目自己的入口（探测脚本「注 3」：只认显式声明，不做工具依赖推断）。**有契约源但无测试入口**时记 `No-Verification` 并写明，不替项目臆造命令。

### Step 11：集成测试

**性质**：验**接缝** —— 模块之间的接口、数据流、事务边界、序列化。可以完全不涉及业务流程。

**触发**：改动**跨模块边界 / DAO / 外部接口** 。

**执行与判读**：共用规则见 `6.1`；判读同 Step 10 的三分（通过 / 未通过回 build / 无摘要记 `No-Verification`）。本轨**不做**三段判读与红名单比对。

**需 DB / 容器**：环境由项目负责 —— 技能只调用「一条命令跑通、自带环境准备」的项目入口。

### Step 12：功能测试（主干功能 / E2E / 冒烟）

**性质**：验**链路** —— 从入口到出口的整条业务链路跑通（库存扣了没、消息发了没、落库对不对）。

> **与集成测试不是同一件事**：集成验**接缝**（2–3 个组件之间），功能验**链路**（入口到出口）；集成可以完全不涉及业务流程。
> **判定归属的简易规则**：断言「响应字段 / 状态码 / SQL 结果」→ 集成；断言「业务后置状态」→ 功能。

**触发**（满足任一）：

- `verify_mode=full` **且** `smoke` 槽存在
- `risk_level=critical`（风险轴闸门）—— 即便 `verify_mode` 被人工覆盖为 `light`，高危变更仍强制探并跑功能轨

两者皆不满足 → 不探不跑。

**执行与判读**：共用规则见 `6.1`；判读同 Step 10 的三分。

**两轨同源时只跑一次**：若 Step 9 探测到 `integration` 与 `smoke` 是**同一条命令** → 本步不重复执行，复用集成轨的结果并在报告标「两轨同源」。

> **缺口已闭合**（原「小改动碰高危路径两头落空」）：风险轴由 Step 8 复核，`risk_level=critical` 时一票强制 `full`（见 Step 8「补强（二）」），本步的第二个触发条件再兜一层人工覆盖的例外。信号表唯一源：`./policies/risk-signals.md` §5。

### Step 13：收口清单

按 Step 8 的结果选择清单（自上而下取首个命中）：

| 条件 | 清单 |
|------|------|
| `risk_level=critical` | `13.2` 完整清单（**7 项**）—— 风险轴闸门，优先于 `verify_mode`（人工覆盖为 `light` 时仍成立） |
| `verify_mode=light` | `13.1` 轻量清单（**6 项**） |
| `verify_mode=full` | `13.2` 完整清单（**7 项**） |

#### 13.1 轻量验证（6 项）

1. `tasks.md` 全部 `[x]`
2. 改动文件与 tasks 描述一致（`git diff --stat` / cached / `<base-ref>...HEAD` 对照）
3. 编译 / 构建通过 —— **结论见 Step 3**，此处不重复展开
4. 测试执行与判读 —— **结论见 Step 6 / 10 / 11 / 12**，此处不重复展开命令获取与判读规则（口径唯一出处是那几步）
5. 无明显安全问题（无硬编码密钥、无新增 unsafe）
6. 代码审查 —— **结论见 Step 14**。本项 = 「Step 14 已按 `review_mode` 处理完毕」，**不在此重复展开范围与降级**（口径唯一出处是 Step 14）

**与 build 去重**：build Step 4 已审过且未再改动的 diff，本步聚焦「是否符合 spec/tasks」与「build 之后新增改动」，不整份重审。

**跳过项**（轻量不做）：spec scenario 全覆盖、detailed-design 深度比对、纯 style 一致性、delta 与设计漂移检测。

**通过**：6 项全 OK，无 Critical / Major。
**不通过** → [验证失败决策](#验证失败决策阻塞点)。

报告：简表 6 项 + PASS/FAIL，写入 `reviews/verify-report.md`（先确保 `openspec/changes/<task_id>/reviews/` 存在）。

#### 13.2 完整验证（7 项）

若宿主提供 `openspec-verify-change`（或等价 OpenSpec 验证 skill）→ **必须**加载并按其指引执行；不可用则按下列清单内联验证（不得假装已加载）。

检查项：

1. `tasks.md` 全部 `[x]`
2. 实现符合高层 `openspec/changes/<task_id>/design.md` —— **结论见 Step 4**，此处不重复展开
3. 实现符合 `openspec/changes/<task_id>/detailed-design.md`（**仅 `runtime.design.status=completed` 时检查；`skipped` 时跳过本项**）—— **结论见 Step 4**，此处不重复展开
4. 能力规格场景可追溯通过（或明确记录未自动化项与手工结论）—— **结论见 Step 4**，此处不重复展开
5. `proposal.md` 目标已满足 —— **结论见 Step 4**，此处不重复展开
6. specs / detailed-design（若有）无未记录矛盾（Build 中改过 spec 的，detailed-design 须有对应记录）—— **结论见 Step 4**，此处不重复展开
7. `detailed-design.md` 可定位且与当前 change 相关（**仅 `runtime.design.status=completed` 时检查**）

> **项数不得改**：「7 项完整验证」被 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` 与 `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` 的 `policies/exit-check.md` 引用，改项数会破坏该跨技能契约。#2–#6 的结论见 Step 4。
> **本 7 项之外**：编译见 Step 3（模式无关）、安全见 `13.1` #5、测试见 Step 10–12、代码评审见 Step 14。

**不通过** → [验证失败决策](#验证失败决策阻塞点)。

**规格漂移（检查项 6；判定见 Step 4）** — decision-point 单选，不得自动选：

| 选项 | 动作 |
|------|------|
| A | 在 `detailed-design.md` 追加 `## Implementation Divergence` 记录原因（本阶段允许产物；不得因此再触发 Step 1 dirty 失败环）；**`runtime.design.status=skipped` 时无此文件，改为在 `reviews/verify-report.md` 记录偏差** |
| B | 用户确认后回 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`（或回 design/tasks，由用户选），更新设计与 specs |
| C | 确认偏差可接受，继续；报告中记录接受原因与影响 |

### Step 14：独立代码评审（派独立 subagent）

**触发**：`runtime.build.review_mode` ∈ `{standard, thorough}` → 执行；`off` → 跳过并记原因。

> **本步必须跑在独立 subagent（独立上下文）里**（H10 / H13）—— 评审者拿不到 build 的自述推理，只拿 diff 与规格，以此实现「生成与裁决分离」。主代理（生成方）自审**不是**本步的等价物，只能作为「降级决策」里的显式降级项并如实标注。

**范围**：build 的审查由**生成方**执行，本步是**独立裁判** —— 聚焦「build 之后的新增改动 + 独立视角复核」，build 已审过且未再改动的 diff 不整份重审。

**入口条件**：**不存在未归因的红** —— `6.1` / `6.2` 的判读必须已全部结清（所有红要么已回 build 修掉、要么已记入 `No-Verification`）。有未归因的红时**不得开始**独立评审：评审结论无法归因即作废，等于白审。

#### 14.1 能力探测（H10）

1. 读 SessionStart 注入：`PLATFORM_DEGRADATION=inline|unsupported` → **直接进入「降级决策」**（不派发、不探测）
2. 若本步只要默认通用 agent 且 `SUPPORTS_SUBAGENT=true`（degradation 空）→ **不调** probe，记 `agent=null`，进 `14.2`
3. 否则 `use_skill("polaris{{SKN_SPR}}subagent-probe")`（传 `platform` / `PLATFORM_ID`），按返回结构取 `agents`；`agents=[]` 且平台支持默认 subagent → `agent=null`；`agents=[]` 且平台不支持 → 进入「降级决策」

**禁止**在缺能力结论时假设宿主有独立 subagent。

#### 14.2 圈定 diff 范围（最小改动原则）

```bash
git diff --stat <base-ref>...HEAD
git diff <base-ref>...HEAD
```

- `base-ref` 优先取 `detailed-design.md` / plan 头信息里的 `base-ref`；缺失用 `git merge-base` 与主干估算
- 产出**变更文件清单**（路径 + 增删行数），作为 subagent 的 `materials`
- **越界检测**：改动越出 `tasks.md` / `specs` 声明的范围（无关重构、无关文件）→ 记为一条 **Major**，带 `文件:行`
- 变更文件数为 0 → 阻断（没有可审的 diff）

#### 14.3 可选 SonarQube 扫描（用户决策点，派发前）

**为什么在这里问**：subagent 是**非交互**的（H13），问不出用户；扫描又会写目标仓构建产物（`mvn sonar:sonar` 写 `target/`、`sonar-scanner` 写 `.scannerwork/`），不该让「只读评审者」自行决定跑不跑。因此**决策由主代理在派发前完成**，结论作为 flag 随 `constraints` 下传，由执行者在报告内一并给出扫描结果与门禁判定。

**决策点**（按 `./policies/decision-point.md` 暂停，不得自动选）：

| 序 | 问题 | 选项 |
|---|---|---|
| 1 | 本次代码评审是否追加 SonarQube 扫描？ | A **不启用**（默认）→ 跳过，报告记「SonarQube 未执行（用户跳过）」/ B 启用 |
| 2 | （仅选 B 追问）门禁规则 | A 质量门禁 FAILED（**默认**）/ B 存在 Blocker/Critical 问题 / C 仅新增问题 / D 仅记录，不改结论 |

> 门禁规则的**语义与默认值以 `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 Step 2「决策点 2/2」为唯一出处**——本步只传名、不复制定义；该处默认值变更时此处随之生效。

**选 B 时**在下游注入 `constraints`：

```yaml
sonarqube: { enabled: true, gate_rule: "<quality_gate | blocker_critical | new_only | record_only>" }
```

并附执行口径**指针**（不复制）：通道探测顺序（`mvn -B sonar:sonar` → `./gradlew sonar` → `sonar-scanner`）、凭据读取（`SONAR_TOKEN` 缺失即该通道不可用；地址读 `SONAR_HOST_URL` 或既有 `sonar.host.url`，**不索要 token 明文、不新增配置文件**）、范围收窄（`-Dsonar.inclusions=` 对齐 `14.2` 的变更文件清单，**不整仓全扫**）、结果读取（`/api/qualitygates/project_status` + `/api/issues/search`）——全部按该技能 **Step 2**。

**副作用留痕**：扫描产生构建产物。执行者仍**不得修改任何源码或被审文件**；产物须在报告记一行（路径 + 是否已被 `.gitignore` 忽略），未被忽略的进 `verify-report.md` 的审查覆盖，本步不清理。

**三项都探不到**（缺命令 / 缺 token / 缺服务端地址）→ 按 `decision-point.md` 的停止条件报阻塞原因与恢复条件；**不得伪造扫描结果，也不得把 `scripts/analyze.*` 的结论冒名为 SonarQube 结论**。

**何时不问**：`14.1` 判定宿主无独立裁判能力、直接进入「降级决策」时，本子步随之跳过——降级路径不叠加外部扫描，保持最简。

#### 14.4 派独立 subagent

`use_skill("polaris{{SKN_SPR}}subagent-dispatch")`，传入：

| 参数 | 值 |
|------|-----|
| `platform` | 宿主平台 id |
| `agent` | `14.1` 结果（`null` = 宿主默认 subagent） |
| `task_spec.task_type` | `code_review` |
| `task_spec.task_description` | 对本次变更的 diff 做独立代码评审，找缺陷不找风格偏好 |
| `task_spec.materials` | diff 内容 / 变更文件清单 / `tasks.md` / `specs/` 验收场景 / `detailed-design.md`（若存在） |
| `task_spec.constraints.output_path` | `openspec/changes/<task_id>/reviews/code-review-report.md` |
| `task_spec.constraints` | 见下方「评审判据」与「硬约束」 |
| `task_spec.language` | 跟随主会话 |

**评审判据（本步唯一出处）**：

1. **正确性 + 边界** —— 逻辑错误；`null` / 空 / 0 / 极大值 / off-by-one / 溢出；异常路径与错误处理
2. **安全** —— 注入（SQL / OS 命令）、越权、硬编码密钥、新增 `unsafe` / 关闭校验
3. **规格一致性** —— 实现是否覆盖 `specs` 验收场景与 `tasks.md` 描述；是否有 tasks 范围外的改动
4. **AI 幻觉模式** —— 幽灵导入（引用不存在的模块 / 符号）、缺失 `await`、永真 / 永假分支、重复条件、空 `catch`
5. **副作用与全局状态** —— 未声明的 I/O、隐式全局写入、跨模块的隐式耦合

> 需要更深的清单（Java/Spring 专项、OWASP 安全、代码异味）时，由 subagent 加载 `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 `references/`（清单与 rubric）；**报告结构同样按该技能的 `templates/review-report.md`（唯一源，本节不复制其字段清单）**；**SonarQube 扫描的实现在该技能的 `SKILL.md` Step 2**（`references/` 不含实现），开关与门禁规则由 `14.3` 传入。均**不在此复制**。

**写进 `constraints` 的硬约束**：

- 严重度只用 **Critical / Major / Minor / Nit**（rubric 口径，源头见 `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 `references/review-rubric.md` §严重级别定义）
- **每条发现必须带 `文件:行`**（自报告不是证据）；给不出定位的观察进「证据不足」，不写成缺陷
- **禁止修改任何源码与被审文件**；只输出报告（`14.3` 选 B 时允许扫描产生构建产物，按 `14.3` 留痕）
- **报告按 `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 `templates/review-report.md` 输出**（结构、字段、分级详略一律以该模板为唯一源）；模板中标注 **★ 的两行在本步必须填**：`评审标识`＝`task_id`、`执行者`＝`独立 subagent`，且「审查范围」行须写 base-ref 与变更文件数；`14.3` 选 B 时另在模板 §3「静态扫描门禁」节给出扫描结果与门禁判定
- 未覆盖的检查项（若有）写进模板「审查概览 · 审查覆盖」的未下结论项，**不写成缺陷**

派发后按 `dispatch.status` 消费（`dispatched` / `degraded_default` / `degraded_inline` / `unsupported`）。`degraded_inline` = 主代理在本会话执行 → **这是降级，必须标注**。`unsupported` → 进入「降级决策」。派发走 `subagent-probe` → `subagent-dispatch` → 宿主原生 Task / AgentTool；**禁止**回退到 superpowers 派发驱动器（H13）。

#### 14.5 回读校验 + 落盘

1. **回读校验**（派发成功时必做）：报告文件存在 + 模板 ★ 两行已填 + 每条发现带 `文件:行`。不完整 → 允许**重派一次**并附上缺什么；仍不完整 → 记 `NEEDS_CONTEXT`，走降级决策
2. **校订 ★ 行**（内容由主代理按 `14.1` / `14.2` / `14.3` 的真实执行情况填，subagent 有误或缺失时照实改正）：`评审标识`＝`task_id`；`审查范围`＝base-ref + 变更文件数；`执行者`＝`独立 subagent（平台 / agent）` 或 `降级 · 非独立裁判`——**降级标记不得省略，也不得把降级写成独立评审**
3. 落盘路径固定 `openspec/changes/<task_id>/reviews/code-review-report.md`（不另起文件名、不落 `.polaris/`）
4. **SonarQube 回读**（`14.3` 选 B 时）：报告须含扫描结果与门禁判定；缺失 → 按第 1 条的不完整处理（重派一次 → 仍缺则走降级决策）

#### 14.6 判定 + 写入 state

| 报告结论 | 动作 |
|---|---|
| 存在 **Critical** | **阻断**本步 → `./policies/decision-point.md`：A 回 build 修复 / B 用户接受风险并记 override（须显式确认）/ C 放弃。**不得**自行接受 |
| `14.3` 启用且**门禁未过** | **阻断**本步 → 同上三选项；报告「合并建议」钉 `❌ 不建议合并`（不得被其他维度的高分抵消），「风险摘要」首句写出门禁未过与所用规则 |
| 仅 **Major** | 不阻断本步；交 [验证失败决策](#验证失败决策阻塞点) 逐条决策 |
| 仅 **Minor / Nit** | 记入报告，不阻断 |
| 报告未落盘 / 子代理 `FAILED` | 走降级决策 |

**`runtime.verify.codereview_status` 取值与处理**（Step 16 写入）：

| 值 | 产生条件 | 处理 |
|---|---|---|
| `done` | 独立 subagent 派发成功且报告完整 | 正常；按上表判定 |
| `degraded_inline` | 降级决策选 A（同会话自审） | **不阻断**，但 `code-review-report.md`（模板 ★ 行 `执行者` ＝ `降级 · 非独立裁判`）与 `verify-report.md` 必须标注「降级 · 非独立裁判」；team 模式下按 `./policies/decision-point.md` 让用户确认是否接受 |
| `skipped:off` | Step 0 已判 `review_mode=off` | 无需处理 |
| `skipped:no_independent_reviewer` | 降级决策选 B（跳过） | 记入报告，非 blocking |
| `blocked` | 存在未解决的 Critical，或启用的 SonarQube 门禁未过 | **阻断** → [验证失败决策](#验证失败决策阻塞点) |

**降级决策（无独立裁判能力时）** —— 触发：`PLATFORM_DEGRADATION=inline|unsupported`、`14.1` 后宿主无可用 subagent、或派发返回 `unsupported`。

**必须**按 `./policies/decision-point.md` 暂停，不得自动选：

| 选项 | 动作 | 记录 |
|------|------|------|
| **A. 降级同会话自审** | 主代理按 `14.4` 的评审判据逐项自审 | 模板 ★ 行 `执行者` 写「**降级 · 非独立裁判**」；`independent: false`，供 retro 识别 |
| **B. 跳过本次代码评审** | 不产出报告 | 记 `skipped:no_independent_reviewer`，在 `verify-report.md` 与 state 留痕 |
| **C. 阻断回 build** | 停止，报阻塞原因与恢复条件 | 不得伪造「已评审」 |

- **禁止**默认选 A（A 是降级不是等价物）
- **禁止**把 A 的结果描述成独立评审
- 用户选 B 时**不阻断**（本步可选）；但 `13.1` #6 / `13.2` 与 Step 16 的出口校验须能读到该跳过状态

### Step 15：人工验证（业务语义确认）

**性质**：本阶段**唯一的「人工验证者」**落点。位置在 **Step 14 之后**、[验证失败决策](#验证失败决策阻塞点)**之前**。

> 人工在 verify 里共三个角色：**配置确认者**（Step 2 / 9 的命令、`6.2` 的红名单）、**验证者**（本步）、**裁决者**（验证失败 / override / 规格漂移）。

**输入（给人看这三样，不给人看原始 diff）**：

| # | 输入 | 来源 |
|---|------|------|
| 1 | 意图基线 | Step 4 产出 |
| 2 | **术语 → 实现**映射清单（逐条列「业务术语 → 落到哪个实现」） | 从 specs + diff 提取 |
| 3 | 机器侧结论摘要 | `6.1` / `6.2` 的轨结果 + Step 10–12 的结论 + Step 14 的 Critical / Major 列表 + `No-Verification` 清单 |

**人只判一件事**：*AI 是否正确理解了业务术语，实现是否符合业务规则的真实意图*。

典型误读三类：

| 误读类型 | 例 |
|----------|-----|
| **作用域错** | 本客群 / 本租户的校验用到了别处的数据（券商跨客群额度复用案例） |
| **口径错** | 「逾期」的起算点、「金额」含税与否、「有效期」是否含当天 |
| **同名不同义** | 代码里的 `User` / `Account` 与需求文档里的同名术语不是一回事 |

**聚焦边界**：**不做机械性检查** —— 不让人跑命令、对行号、查格式、核编译（那些属 Step 3 / 6 / 13；环境类问题走三级分叉第 2 级）。

**触发**：`light` / `full` **都必现** —— 业务语义误读与改动规模无关，改 3 行一样可能把「逾期」理解错。

**输出与处置**：

| 人的结论 | 落盘 | 后续 |
|----------|------|------|
| 确认无误 | `runtime.verify.semantics_review=confirmed` | 进决策点 |
| **发现偏** | 记入报告「业务语义确认」段 | 进 [验证失败决策](#验证失败决策阻塞点) |
| **明确跳过** | `semantics_review=skipped_by_user` + **原因必填** | `full` 下记 `No-Verification: 用户跳过业务语义确认`；不额外阻断 |

- **不得默认跳过**（与 Step 14 的降级三选项同构：**可降级、必须标**）；跳过必须留原因 —— 否则报告会看起来「全绿」而这层根本没做
- **与 Step 14 不可互相替代**：Step 14 是机器（独立 subagent）审「**代码写得对不对**」，本步是人审「**写的业务含义对不对**」—— Step 14 没有业务上下文，本步不做逐行代码审查
- **落盘**：`reviews/verify-report.md` 的「业务语义确认」段 + `runtime.verify.semantics_review`

### Step 16：落盘证据 + 出口推进

验证通过后：

1. 确保 `openspec/changes/<task_id>/reviews/verify-report.md` 已写完整结论（含 **两轴分级（`complexity_level` / `risk_level`（含复核结论与升档理由）/ `current_tier`）**、Constitution 摘要、overall_score、light/full、各检查项、**Step 3 编译闸门结论**、**Step 6 / 10–12 的测试证据链（命令 + 退出码 + 输出摘要 + commit SHA + 三段判读结论 + flaky 标注 + 各项 `No-Verification`）**、**Step 14 代码评审的回报状态与 Critical/Major 计数**、**Step 15 业务语义确认结论**）
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
  --set runtime.verify.build_command=<探测/确认后的构建命令，如 "npm run build"> \
  --set runtime.verify.test_command=<探测/确认后的单测命令，如 "mvn -B test"> \
  --set runtime.verify.test_result=<passed|failed|no_verification> \
  --set runtime.verify.test_slots=<实际执行的槽位，逗号分隔，如 unit,contract,integration> \
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
  tier      : <current_tier>（complexity=<...> / risk=<...>；复核升档: <risk_escalation_reason|无>）
  mode      : <light|full>
  score     : <overall_score> (<score_level>)
  编译      : <passed|no_verification>（<build_command>）
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
- 存在未解决的 Critical / Major
- **存在未归因的红**（`6.2` 三段判读未结清）
- **Step 3 编译闸门未通过**，或已探到 `build` 槽但命令非零退出且未处置
- `6.1` 三级分叉第 1 级命中（探测不到测试入口）且 `verify_mode=full`
- `runtime.verify.semantics_review` 未写入（Step 15 未处理，含未留原因的静默跳过）
- metrics 文件未写入
- 验证报告未落盘
- Step 14 回报 `blocked`（独立代码评审被阻断），或存在未处理的代码评审 Critical；或 `14.3` 启用的 SonarQube 门禁未过

---

## 验证失败决策（阻塞点）

验证不通过时**必须**按 `./policies/decision-point.md` 暂停。不得自动调用 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`，不得自动把失败标成通过。

暂停时必须列出：

- 失败项
- 严重程度：Critical / Major / Minor / Nit
- 推荐处理方式

**不确定性原则**：无法确定严重程度时，**宁可标轻**（Nit 或 Minor），**禁止**在不确定时标 Critical。仅对构建失败、测试失败、已确认安全问题使用 Critical。

用户选择后：

| 选择 | 动作 |
|------|------|
| 全部修复 | 写 `runtime.verify.status: failed`；调用 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build` 修复（用户确认后） |
| 逐项处理 | Critical / Major 必须修；Minor / Nit 可接受偏差但须写入报告；存在任一 Critical/Major 时禁止「全部接受」 |
| 接受偏差（仅非 blocking） | 记 overrides.log + 报告；team blocking 场景除外 |

**重试上限**：连续 3 次 verify→build→verify 失败循环后，第 4 次失败时**必须** decision-point 仅两选项：「接受所有偏差并记录」或「继续修复」——代理不得自行选择继续修。

---

## Constitution 注入点 D

- 原则来源：`openspec/memory/constitution.md`（路径以仓库约定为准）
- 详细规则：`policies/constitution-audit.md`
- 输出格式见该 policy；结果进入 metrics 的 `audit.*` 嵌套段与 `runtime.verify.constitution_valid`（执行位置：Step 5.1）

## 退出条件

- 轻量或完整清单通过（无未解决 Critical / Major）
- Step 3 编译闸门已通过（或探不到构建入口并已记 `No-Verification`）
- `runtime.verify.blocked=false`（或已合法 override）
- `.polaris/metrics/<timestamp>-metrics.json`（**顶层**，勿写进 `tasks/<task_id>/`——ship 合回只扫顶层，写错会随 worktree 移除丢失）已写入且含 `task_id`
- `verify-report.md` 存在且 `runtime.verify.verification_report` 指向它
- **测试轨已结清**：所有红已归因（回 build 修掉，或记 `No-Verification`），测试证据链（命令 + 退出码 + 输出摘要 + commit SHA）已落盘
- 代码评审已按 `review_mode` 处理完毕（`runtime.verify.codereview_status` 已写）；`done` 时 `reviews/code-review-report.md` 已落盘且**结构符合** `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 `templates/review-report.md`（★ 行已填）；`14.3` 启用 SonarQube 时其扫描结论与门禁判定已记入该报告
- **Step 15 已处理**：`runtime.verify.semantics_review` ∈ `{confirmed, skipped_by_user}`（跳过时原因已记入 `semantics_skip_reason`）
- `runtime.verify.status=completed`，且 `phase=ship`

## 上下文压缩恢复

重载：`task_id`、`worktree_path`、**分级三字段 `complexity_level` / `risk_level` / `current_tier`**、`verify.*`（status / verify_mode / score_level / blocked / build_command / test_command / test_result / test_slots / semantics_review / risk_escalation_reason）、最新 metrics 文件、本 skill 停在哪一步、失败项清单（若有）、`test.*` 配置（`.polaris/config.yaml`）。
- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 Step 2 命令确认 → 从该回路续；`test.commands.build` / `commands.unit` 已有 confirmed 值则**直接读、勿重新探测**（否则会把用户否定的答案再探一遍）
- 停在 Step 3 编译闸门 → 重跑闸门命令；**勿从 `state.yaml` 顶层读 `verify_mode`**（唯一来源是 `runtime.verify.verify_mode`）
- 停在 Step 4 / 5 → 从该步续，勿重复已写入的 metrics（可追加新 timestamp 文件）
- 停在 Step 6 → 勿重复已产生证据的轨；三级分叉的判定看**有无测试结果摘要**，不看退出码记忆
- 停在 `6.2` 红名单确认 → 从决策点续，**勿重跑全量**；`baseline-tests.*` 已在则复用
- 停在 Step 7 → 覆盖率产物已在则直接打分；`overall_score` 已写入 metrics 则勿重算
- 停在 Step 8 → `runtime.verify.verify_mode` 已写则直接用（含升格结果），勿重新启发式；`risk_level` / `current_tier` 与 `risk_escalation_reason` 已写则视为**复核已完成**（只升不降，勿重判下调）
- 停在 Step 9 命令确认 → 同 Step 2 的规则（已有 confirmed 值直接读）
- 停在 Step 10–12 → 勿重复已产生证据的轨；「两轨同源」已标记则复用
- 停在 Step 14 → 代码评审报告在则从回报消费续，不在则重派；**勿把 `degraded_inline` 当独立评审**
- 停在 Step 15 → 从人工确认续；`runtime.verify.semantics_review` 未写即视为**未处理**（不得因「上次好像确认过」而放行）
- 停在失败决策 → 从决策点续，勿重跑已通过的检查项（除非用户要求全量重跑）
- 勿重新跑 build apply；勿进入 ship 直到出口校验通过
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```
