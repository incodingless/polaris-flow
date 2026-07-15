---
name: audit
description: "用户触发 /ezfl:audit 或要求审计实施产出时必须使用本 skill。执行 Constitution 合规检查（注入点 D）+ 5 项 scorer 脚本，结果写入 .polaris/metrics/<timestamp>-metrics.json。"
---

# Polaris Flow 阶段5：验证与收尾

<HARD-GATE>
禁止跳过任何 5 个 scorer 脚本。在 team 模式下，scorer 检出 blocking 违规时禁止把 audit 标记为通过。在审计结果写入 `.polaris/metrics/<timestamp>-metrics.json`（目录形式，每次 audit 一个新文件）之前禁止进入 ship。
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入阶段: audit — 使用 polaris-flow:audit skill。`

## 概述

审计 skill。两步审计流程：Constitution Compliance Audit + Scorer 评分。


**Metrics 存储约定**（贯穿 audit / reflect / scorer）：
- 目录：`.polaris/metrics/`（**当前工作目录的** `.polaris/`——若在 worktree 内即 worktree 的 metrics，ship 阶段会合回主仓）
- 文件名：`<timestamp>-metrics.json`，每次 audit 写一个新文件，**不覆盖**历史
- `<timestamp>` 推荐格式：`YYYYMMDD-HHMMSS`（UTC，例如 `20260525-074800`）
- **JSON 顶层必含 `change_id` 字段**（v0.3.7 起）：用于 reflect 按 change 维度归因；同一 worktree 内若先后跑过 A→B 两个 change 的 audit，可按 change_id 区分
- **稳定契约**：`.polaris/metrics/` 是**唯一存储位置**（不再拷贝到 archive）。reflect 通过 glob 聚合全局趋势；单 change 追溯通过 JSON 内的 `change_id` 字段从顶层过滤。**禁止把顶层 metrics 视为冗余而清理**——会破坏 reflect 全局视图
- reflect skill 通过主仓 `.polaris/metrics/*-metrics.json` glob 聚合所有历史（worktree 的 metrics 在 ship 阶段合回主仓后才进入 reflect 视野）
- 单个 scorer 也通过 `ls -t .polaris/metrics/*-metrics.json | head -1` 取最近一次结果

**State 写入约定**：
- 单 change 档案：`.polaris/changes/<change_id>/state.yaml`（worktree 路径下即 worktree 内的同名目录）
- audit 完成后写入 `audit.*` 段（`constitution_valid` / `overall_score` / `scorer_results` / `blocked`）
读取 `.harness/workflow.yaml: active_changes`，筛选 `phase=audit` 的 entry：
- **唯一匹配**：取其 `change_id`
- **多个匹配**：用 `ask_followup_question` 让用户选择
- **零匹配**：阻断，提示"未找到 design 阶段的 active change，请先执行 /ezfl:design"

## 前置条件

- 代码已提交（阶段 3 完成）
- tasks.md 全部任务已完成

## 流程

### Step 0：输出语言约束

验证报告和分支处理说明必须使用 `"$COMET_BASH" "$COMET_STATE" get <name> language` 读取到的 Comet 配置产物语言。

### Step 1：处理dirty worktree
验证开始前，按 `comet/reference/dirty-worktree.md` 协议检查并处理未提交改动。verify 阶段的特殊处理：

1. 若 dirty diff 属于当前 change 且涉及实现、测试、tasks、delta spec 或 design doc 变更，不在 verify 阶段直接修复或提交；报告失败项并进入 Step 1b 的验证失败决策阻塞点
2. 若 dirty diff 只是 verify 本阶段产物（例如验证报告草稿、分支处理记录），可继续在 verify 阶段完成并记录状态
3. 若 dirty diff 已实现但 tasks.md 未勾选，视为 build 状态滞后；报告失败项并进入 Step 1b，由用户决定回退修复或接受偏差

用户选择修复后，才允许回退到 build 阶段：

```bash
# 仅在用户确认修复后执行
node "$COMET_STATE" transition <change-name> verify-fail
```

注意：verify-fail 回退到 build 时 `branch_status` 不会被重置。如果首次 verify 已完成分支处理，修复后再次进入 verify 时跳过已完成的分支处理步骤，直接使用 `node "$COMET_STATE" set <change-name> branch_status handled` 保留原有分支处理结果。

### Step 2: Constitution Compliance Audit（注入点 D）

脚本驻留 plugin 内部，由 `.polaris/config.yaml`（SessionStart 写入）定位；若缺失或脚本不可执行，提示用户重启会话以触发重新写入。

```bash
CONFIG_FILE="$REPO_ROOT/.polaris/config.yaml"
PLUGIN_ROOT="$(cat "$CONFIG_FILE" | grep "plugin_root" | awk -F'"' '{print $2}')"
bash "$PLUGIN_ROOT/hooks/constitution-validity.sh"   # 0=有效 / 1=无效 / 2=不存在
```

判定后续：
- 有效：逐条核对 Core Principle —— NON-NEGOTIABLE 违规为 Critical，其余为 Important，有违规则停等用户三选项
- 无效：按 `constitution_required` 配置决定告警或阻断

### Step 3：Scorer 评分预检

#### 3.1 评分

5 个 scorer 脚本同样驻留 plugin 内（`$PLUGIN_ROOT/scorers/`），每个输出 0-100 分 + 理由：

```bash
CONFIG_FILE="$REPO_ROOT/.polaris/config.yaml"
PLUGIN_ROOT="$(cat "$CONFIG_FILE" | grep "plugin_root" | awk -F'"' '{print $2}')"
for s in audit-violation-rate constitution-violation-count test-coverage-scorer complexity-scorer doc-sync-scorer; do
  bash "$PLUGIN_ROOT/scorers/$s.sh"
done
```

每个脚本 stdout 输出一行 JSON：`{"scorer":"<name>","score":<0-100>,"reason":"<text>"}`。

**聚合写入约定**：
- 目录：`mkdir -p .polaris/metrics`
- 文件：`.polaris/metrics/<timestamp>-metrics.json`（`<timestamp>` 用 `date -u +%Y%m%d-%H%M%S`）
- `change_id` 取自 `hooks/change-locate.sh` 单匹配结果(与 SKILL.md "State 写入约定"节共享解析逻辑);若解析失败(如 trivial 路径无 entry)则填 `""`,reflect 按"未归因"分桶
- `overall_score` **加权聚合**(见下方"Overall Score 加权聚合")
- 单文件结构（数组形式，便于 reflect 直接遍历；同时保留 `audit` 嵌套段供 `audit-violation-rate.sh` 下次复用）：

```json
{
  "timestamp": "20260525-074800",
  "change_id": "refactor-sdk-api-0701c0",
  "mode": "solo",
  "audit": {
    "violations": 0,
    "total_checks": 12
  },
  "overall_score": 90,
  "scorers": [
    {"scorer":"audit-violation-rate","score":100,"reason":"无已知违规"},
    {"scorer":"constitution-violation-count","score":100,"reason":"..."},
    {"scorer":"test-coverage","score":85,"reason":"行覆盖 85% (source=istanbul:coverage/coverage-summary.json)"},
    {"scorer":"complexity","score":78,"reason":"..."},
    {"scorer":"doc-sync","score":92,"reason":"..."}
  ]
}
```

> `audit.violations` = Step 1 中累计的 Critical+Important 违规条数；`audit.total_checks` = 该次 audit 共核对的 Core Principle + 子检查项总数（无明确分母时填 1）。`audit-violation-rate.sh` 读取最新一次 metrics 计算违规率。

> **不要写到** `.polaris/metrics.json`（单文件形式）—— 那会破坏 scorer/reflect 的"按时间戳叠加历史"语义。

#### 3.2 Overall Score 加权聚合

5 个 scorer 的 score 通过加权平均聚合为 `overall_score`,用于 `thresholds.solo.warn_below` / `thresholds.team.block_below` 的阈值判定,同时写入 `metrics JSON` 顶层与 `state.yaml: audit.overall_score`。

**公式**:

```
overall_score = round( Σ(score_i × w_i) / Σ(w_i) )
```

其中 `w_i` 取自 `.polaris/harness.toml: [scorer.weights]` 中对应 scorer 名的值;**未配置 / 缺失 / 整个 [scorer.weights] 段不存在** → 全部默认 `1.0`(等权平均,与本特性引入前的行为完全一致)。

**特殊语义**:
- `w_i = 0` → 该 scorer 完全排除出 overall_score(其 score 仍写入 `scorers[]` 供溯源,但不参与计算)
- `Σ(w_i) = 0`(理论极端:所有权重为 0)→ overall_score 取 0,reason 提示"所有 scorer 权重为 0"
- 权重为负数 → 视为配置错误,该项按 1.0 处理并 stderr 警告

**降权常见用法**:`test-coverage` 在未接入标准覆盖率报告(lcov/cobertura/Istanbul JSON)时启发式估算不准,可降到 `0.3` 减少其对 overall_score 的影响。详见 `scorers/README.md`。

#### 3.3 Mode 分发
```bash
if mode == 'solo'
  score_level = (overall_score < $thresholds.solo.warn_below) ? "low" : "high"
else
  score_level = (overall_score < $thresholds.team.block_below) ? "low" : "high"
```
按以下情况分别分发：
- solo：低分（< `thresholds.solo.warn_below`）仅告警
- team：低分（< `thresholds.team.block_below`）阻塞，需 override

### Step 4：深入审查

#### 4.1 改动规模评估

执行规模评估：

```bash
node "$COMET_STATE" scale <change-name>
```

脚本自动统计任务数、增量规格数、变更文件数，判断使用 light 或 full 验证模式，并设置 verify_mode 字段。判定规则（满足任一即 full）：任务数 > 3、delta spec 能力数 > 1、变更文件数 > 8。

注意：如果 build 阶段每个任务都已提交，脚本基于工作区 diff 的文件数可能低估改动规模。此时必须读取 plan 文件头的 `base-ref` 并用提交区间复核：

```bash
PLAN=$(node "$COMET_STATE" get <change-name> plan)
BASE_REF=$(grep '^base-ref:' "$PLAN" 2>/dev/null | head -1 | sed 's/^base-ref: *//')
git diff --stat "$BASE_REF"...HEAD
```

若提交区间显示改动超过轻量阈值（> 8 个文件、跨模块协调、或 delta spec 超过 1 个 capability），手动设置为完整验证：

```bash
node "$COMET_STATE" set <change-name> verify_mode full
```

**覆盖机制**：如 agent 或用户认为自动评估结果不合适，可随时通过 `node "$COMET_STATE" set <change-name> verify_mode <light|full>` 手动覆盖。

#### 1b. 验证失败决策（阻塞点）

验证不通过时**必须按 `comet/reference/decision-point.md` 的协议暂停并等待用户决定修复或接受偏差**。不得自动运行 `node "$COMET_STATE" transition <change-name> verify-fail`，也不得自动调用 `/polaris-flow-build`。

暂停时必须列出：
- 失败项
- 是否属于 CRITICAL 或 IMPORTANT（构建失败、测试失败、安全问题、核心验收场景失败、简化代码审查发现的正确性/安全/边界问题）
- 推荐处理方式

**不确定性原则**：无法确定严重程度时，降级处理（SUGGESTION > WARNING > CRITICAL）。仅对构建失败、测试失败、安全问题使用 CRITICAL；模糊或不确定的问题标为 WARNING 或 SUGGESTION。

用户选择后按以下方式继续：
- **全部修复**：运行 `node "$COMET_STATE" transition <change-name> verify-fail`，然后调用 `/comet-build` 修复
- **逐项处理**：CRITICAL 或 IMPORTANT 失败项必须修复；WARNING/SUGGESTION 失败项可选择接受偏差，但必须在验证报告中记录接受原因和影响范围。若存在任何 CRITICAL 或 IMPORTANT 失败项，不允许跳过修复直接全部接受

**重试上限**：连续 3 次 verify-fail 循环后，第 4 次失败时代理不得自动选择继续修复；**必须使用当前平台可用的用户输入/确认机制暂停**，仅给出两个选项：「接受所有偏差并记录」或「继续修复」，由用户明确决定。

#### 4.2 执行细节审查

验证需要读取 OpenSpec 产物时，先检查产物是否自 design 阶段以来发生变化：

```bash
RECORDED_HASH=$(node "$COMET_STATE" get <change-name> handoff_hash)
CURRENT_HASH=$(node "$COMET_HANDOFF" <change-name> --hash-only 2>/dev/null || echo "")
```

- 若 `RECORDED_HASH` = `CURRENT_HASH` 且均非空且均非 `null`：OpenSpec 产物未变化，**tasks.md 无需重新读取全文**（用 `grep -c '\- \[ \]' tasks.md` 确认完成数即可）。proposal.md、design.md、delta spec 仍需读取用于对照检查。
- 若 `RECORDED_HASH` 为空、为 `null`、或与 `CURRENT_HASH` 不一致：产物已变化或 hash 未记录，正常读取所有所需文件全文。

此优化仅跳过 tasks.md 的重复全文读取。proposal.md 和 design.md 包含验证检查项所需的完整上下文，不得因 hash 匹配而跳过。

**立即执行：** 使用 Skill 工具加载 Superpowers `verification-before-completion` 技能。禁止跳过此步骤。

技能加载后，按以下规则分支执行：

- 若 verify_mode == "light" 且 score_level == "high"，执行“轻量验证”
- 若 verify_mode == "light" 且 score_level == "low"，执行“完整验证”
- 若 vefiry_mode == "full" 执行“完整验证”

#### 4.2a. 轻量验证

按以下 6 项进行检查：

1. tasks.md 全部任务已完成 `[x]`
2. 改动文件与 tasks.md 描述一致（`git diff --stat` / `git diff --cached --stat` / `git diff --stat <base-ref>...HEAD` 对照 tasks 内容）
3. 编译通过（执行项目对应的构建命令，如 `npm run build`、`mvn compile`、`cargo build` 等）
4. 相关测试通过
5. 无明显安全问题（无硬编码密钥、无新增 unsafe 操作）
6. 代码审查策略：当 `review_mode: standard` 或 `thorough` 时，必须使用 Skill 工具加载 Superpowers `requesting-code-review` 技能，请求只检查正确性、安全、边界条件的轻量代码审查；当 `review_mode: off` 时跳过自动代码审查，并在验证报告中记录跳过原因

简化代码审查的输入应限定为本次改动 diff、tasks.md 和必要的测试结果；审查范围只覆盖实现正确性、安全风险和边界条件，不执行 spec 覆盖率、Design Doc 一致性或漂移检查。若审查发现 CRITICAL 或 IMPORTANT 问题，按验证失败处理并进入 Step 1b。`review_mode: off` 只跳过自动 code review，不跳过构建、测试、安全检查或异常调试协议。

**与 build 阶段审查的去重**：若 build 阶段（`executing-plans` 或 `subagent-driven-development`）已按 `review_mode` 对同一 diff 完成最终代码审查，verify 的这次轻量审查聚焦「实现是否符合 spec/tasks 的正确性」与「build 之后新增的改动」，不重复评审 build 已审过且未变化的 diff。

**通过标准**：6 项全部 OK，无 CRITICAL 或 IMPORTANT 问题。

**不通过时**：报告失败项，进入 Step 1b 的验证失败决策阻塞点。用户选择修复后，才执行以下命令记录失败并回退到 build 阶段，然后调用 `/comet-build` 修复：

```bash
# 仅在用户确认修复后执行
node "$COMET_STATE" transition <change-name> verify-fail
```

**报告格式**：简表列出 6 项检查结果 + PASS/FAIL。

**跳过项**（不在轻量验证中检查）：
- spec scenario 覆盖率
- design doc 一致性深度比对
- 不影响正确性、安全、边界条件的 code pattern consistency 建议
- delta spec 与 design doc 漂移检测

#### 4.2b. 完整验证

**立即执行：** 使用 Skill 工具加载 `openspec-verify-change` 技能。禁止跳过此步骤。

技能加载后，按其指引验证。检查项：
1. tasks.md 全部任务已完成（`[x]`）
2. 实现符合 `openspec/changes/<name>/design.md` 高层设计决策
3. 实现符合 Design Doc（`docs/superpowers/specs/` 下的技术设计文档）
4. 能力规格场景全部通过
5. proposal.md 目标已满足
6. delta spec 与 design doc 无矛盾（若 Build 阶段有增量修改 spec，检查 design doc 是否有对应记录）
7. `docs/superpowers/specs/` 关联的设计文档可定位（文件存在且与当前 change 相关）

验证不通过时：报告缺失项，进入 Step 1b 的验证失败决策阻塞点。用户选择修复后，才执行以下命令记录失败并回退到 build 阶段，然后调用 `/comet-build` 补充：

```bash
# 仅在用户确认修复后执行
node "$COMET_STATE" transition <change-name> verify-fail
```

**Spec 漂移处理**（用户决策点）：
- 若检查项 6 发现矛盾（delta spec 有内容但 design doc 未体现），**必须使用当前平台可用的用户输入/确认机制以单选题形式暂停并等待用户选择处理方式**，不得自动选择。选项：
  - 选项 A：在 design doc 追加 "Implementation Divergence" 节记录偏差原因。选项 A 属于 verify 阶段允许产物；写入后不得因该 design doc 变更再次触发 Step 1b dirty-worktree 决策
  - 选项 B：用户选择 B 后，运行 `node "$COMET_STATE" transition <change-name> verify-fail`，然后调用 `/comet-build`；由 `/comet-build` 的 Spec 增量更新规则加载 Superpowers `brainstorming` 更新 Design Doc + delta spec
  - 选项 C：确认偏差可接受，继续验证（归档时 design doc 将标记为 `superseded-by-main-spec`）

#### 4.3 记录验证证据

验证报告必须落盘，并在 `.comet.yaml` 中记录；分支处理完成后也必须写入状态字段。不要手动设置 `verify_result: pass`，由阶段守卫 `--apply` 推进。

```bash
mkdir -p docs/superpowers/reports
# 将本次验证结论写入报告文件，例如：
# docs/superpowers/reports/YYYY-MM-DD-<change-name>-verify.md

node "$COMET_STATE" set <change-name> verification_report docs/superpowers/reports/YYYY-MM-DD-<change-name>-verify.md
node "$COMET_STATE" set <change-name> branch_status handled
```

## 退出条件

- 验证报告通过
- 分支已处理
- `.comet.yaml` 中 `verification_report` 指向已存在的验证报告文件
- `.comet.yaml` 中 `branch_status: handled`
- **阶段守卫**：运行 `node "$COMET_GUARD" <change-name> verify --apply`，全部 PASS 后由守卫通过 `comet-state transition verify-pass` 推进到 `phase: archive`（此步骤更新 `phase` 字段，与 `auto_transition` 无关）

验证和分支处理均完成后，运行阶段守卫推进 phase（此步骤与 `auto_transition` 无关）：

```bash
node "$COMET_GUARD" <change-name> verify --apply
```

状态文件自动更新为 `phase: archive`、`verify_result: pass`、`verified_at: YYYY-MM-DD`。

## 上下文压缩恢复

按 `comet/reference/context-recovery.md` 执行，phase 参数为 `verify`。

## 自动衔接下一阶段

按 `comet/reference/auto-transition.md` 执行。关键命令：

```bash
node "$COMET_STATE" next <change-name>
```

- `NEXT: auto` → 调用 `SKILL` 指向的 skill 进入下一阶段
- `NEXT: manual` → 不要调用下一 skill，按 `HINT` 提示用户手动运行 `/<SKILL>`
- `NEXT: done` → 流程已完成，无需继续

注意：无论 `NEXT` 为 `auto` 还是 `manual`，`comet-archive` 进入后必须先执行归档前最终确认阻塞点，等待用户明确选择「确认归档」后才允许运行归档脚本。不得因为验证已通过就自动归档。

## Policy

| Policy | 文件 | 作用 |
|--------|------|------|
| Constitution Audit | `./policies/constitution-audit.md` | 详细审计规则 |
