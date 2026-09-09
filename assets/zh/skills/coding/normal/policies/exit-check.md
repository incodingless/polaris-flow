# 出口检查 — normal 收尾校验

> 由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` Step 9 引用。目标是让常规通道在**不接独立 verify 阶段**的前提下，仍然产出与完整链路同构的证据（metrics + 验证报告），保证 retro 的趋势数据不断档。
>
> 与 `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` 的差异：`verify_mode` 固定 `light`；不做 detailed-design 深度比对（normal 没有该产物）；C6 对照 **specs 验收场景**（P02 有真实规格，比 tweak 的 change-brief 对照更强）；代码审查已在 Step 8.5 做过，本步不重审。

## 执行顺序

**6 项检查 → Constitution 审计 → scorer + metrics → 写报告**。前一步未完成不得进入下一步。

---

## 1. 六项检查

| # | 检查项 | 通过条件 | 失败级别 |
|---|--------|----------|----------|
| C1 | tasks 已勾完 | `openspec/changes/<change_id>/tasks.md` 中不存在 `- [ ]` | CRITICAL |
| C2 | 改动与 tasks 一致 | `git diff --stat` / cached / `<base-ref>...HEAD` 对照，改动文件落在 tasks 声明的 Files 内；超出部分须有解释 | IMPORTANT |
| C3 | 构建 / 编译通过 | 运行项目对应命令，exit 0 | CRITICAL |
| C4 | 相关测试通过 | 运行 tasks 内的测试 / 验证命令，exit 0 | CRITICAL |
| C5 | 无明显安全问题 | 无硬编码密钥、无新增 `unsafe` / 无危险默认放开；人工审视 | CRITICAL（仅确认存在时） |
| C6 | specs 验收场景可追溯 | `specs/<capability>/spec.md` 的 Requirements + Scenarios（GWT）逐条能对应到实现或测试；未覆盖项须写明原因 | IMPORTANT |

### 1.1 dirty worktree 处理

检查前先看未提交改动：

| 情况 | 动作 |
|------|------|
| dirty 属于本次变更的实现 / 测试 / tasks / 四件套同步 | **不**在本步修复或提交，记 C2 失败 → 失败决策 |
| dirty 仅为本阶段产物（验证报告草稿等） | 可继续 |
| 已实现但 `tasks.md` 仍有未勾选 | 视为 apply 状态滞后 → C1 失败 |

> dirty 检查**不是**阻断项本身——它只是把问题归入 C1 / C2。避免像 verify 那样形成「dirty → 失败 → 修复 → 又 dirty」的死循环。

### 1.2 检查报告格式

简表 6 项 + PASS / FAIL，写入 `openspec/changes/<change_id>/reviews/verify-report.md`（先确保 `reviews/` 存在）。

---

## 2. Constitution 合规审计（注入点 D，轻量版）

`read_file ./policies/constitution-audit.md`，按其核心原则执行。

```bash
bash "$PLUGIN_ROOT/scripts/constitution-validity.sh"   # 0=有效 / 1=无效 / 2=不存在
```

| 脚本结果 | 处理 |
|----------|------|
| 0（有效） | 逐条核对 Core Principle；`NON-NEGOTIABLE` 违规 → **Critical**；其余 → **Important** |
| 1 / 2 | 按 `.polaris/config.yaml` 的 `constitution_required` 决定告警或阻断；脚本缺失 → 按失败决策的 A/B 二选一处理，不得伪造结论 |

输出格式照 `constitution-audit.md` §3。累计的 Critical + Important 条数记为 metrics 的 `audit.violations`，核对项总数记为 `audit.total_checks`（无明确分母时填 1）。

写入 `state.yaml`：`runtime.verify.constitution_valid: <true|false>`。

---

## 3. Scorer 评分与 metrics 落盘

**必须真跑**，不得跳过或伪造。

### 3.1 跑 5 个 scorer

```bash
for s in audit-violation-rate constitution-violation-count test-coverage-scorer complexity-scorer doc-sync-scorer; do
  bash "$PLUGIN_ROOT/scorers/$s.sh"
done
```

每个脚本 stdout 一行 JSON：`{"scorer":"<name>","score":<0-100>,"reason":"<text>"}`。

**脚本缺失**：不得伪造分数。按 `./policies/decision-point.md`：**A 阻断并提示补齐 scorers** / **B 用户接受跳过**（team 模式且强制 scorer 时只允许 A）。

### 3.2 聚合写入 metrics

```bash
mkdir -p .polaris/metrics
TS=$(date -u +%Y%m%d-%H%M%S)
# 写入 .polaris/metrics/${TS}-metrics.json
```

结构与 `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` Step 3.2 **完全一致**——这是 retro 能统一聚合的前提：

```json
{
  "timestamp": "20260903-074800",
  "change_id": "<change_id>",
  "mode": "solo",
  "audit": { "violations": 0, "total_checks": 12 },
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

- **禁止**写到 `.polaris/metrics.json`（单文件形式）——会破坏按时间戳叠加语义
- metrics 目录取**当前工作目录**的 `.polaris/`（worktree 内即 worktree 的 metrics，由 ship 合回主仓）

### 3.3 Overall Score

```
overall_score = round( Σ(score_i × w_i) / Σ(w_i) )
```

- `w_i` 取自 `.polaris/config.yaml` 的 `[scorer.weights]`；整段缺失 → 全部 `1.0`
- `w_i = 0` → 不参与 overall，但仍写入 `scorers[]`
- `Σ(w_i) = 0` → `overall_score = 0`，reason 注明「所有 scorer 权重为 0」

写入 `state.yaml`：`runtime.verify.overall_score`、`runtime.verify.scorer_results`。

### 3.4 Mode 分发

```
if mode == solo:
  score_level = (overall_score < thresholds.solo.warn_below) ? "low" : "high"
else:  # team
  score_level = (overall_score < thresholds.team.block_below) ? "low" : "high"
```

- **solo**：低分仅告警，可继续
- **team**：低分 → `runtime.verify.blocked: true`，需用户 override（记 `overrides.log`）后才可继续

写入 `runtime.verify.score_level: <high|low>`。

---

## 4. 失败决策（阻塞点）

任一检查项 FAIL 时，**必须**按 `./policies/decision-point.md` 暂停。不得自动调用 `/opsx:apply` 修复，不得把失败标成通过。

暂停时必须列出：失败项编号（C1–C6 / Constitution 条款）、严重程度、推荐处理方式。

### 4.1 严重程度判定

**不确定性原则**：无法确定严重程度时，**宁可标轻**（SUGGESTION 或 WARNING），**禁止**在不确定时标 CRITICAL。仅对下列已确认事实使用 CRITICAL：

- 构建失败、测试失败
- 已确认的安全问题
- `NON-NEGOTIABLE` 宪法原则违规

### 4.2 用户选项

| 选择 | 动作 |
|------|------|
| 全部修复 | 回 normal Step 8.3 重新 `/opsx:apply`（用户确认后）；本轮先写 `runtime.verify.status: failed` 与失败原因，**不**推进 phase |
| 逐项处理 | CRITICAL / IMPORTANT 必须修；WARNING / SUGGESTION 可接受偏差但须写入报告；存在任一 CRITICAL / IMPORTANT 时禁止「全部接受」 |
| 接受偏差（仅非 blocking） | 记 `.polaris/overrides.log` + `verify-report.md`；team blocking 场景除外 |
| 升到 P03 | 命中升档信号（`./tier-gate.md` §2）时可选；按其 §2.3 转交 design |

### 4.3 重试上限

连续 **3 次**「exit-check → apply → exit-check」失败循环后，第 4 次失败时**必须**把决策点收敛为仅两选项：「接受所有偏差并记录」/「继续修复」——代理不得自行选择继续修。

---

## 5. 报告落盘

`openspec/changes/<change_id>/reviews/verify-report.md` 必须包含：

1. 6 项检查表（C1–C6 + PASS / FAIL）
2. Constitution 审计摘要（核对项、violations、Critical / Important 分级）
3. `overall_score` 与 `score_level`
4. 5 个 scorer 的逐项 score + reason
5. Step 8.5 代码审查的 IMPORTANT 项及其处置结论
6. Step 7 合并主审的遗留 concerns 及其处置结论
7. 接受的偏差（若有）及原因

报告首行须标注来源：

```markdown
> 本报告由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` 出口检查生成（P02 常规通道，verify_mode=light）。
```

---

## 6. 硬阻断（不得推进 phase）

- 任一 CRITICAL 未解决
- `.polaris/metrics/<timestamp>-metrics.json` 未写入或不含 `change_id`
- `reviews/verify-report.md` 未落盘
- `runtime.verify.blocked=true` 且用户未 override

## 7. 断点恢复

- 停在 §1 → 从失败项续，勿重跑已通过的检查项
- 停在 §3.2 之后 → metrics 已落盘，**不得重复写同一 timestamp 文件**；重跑时另起新 timestamp
- 停在 §4 决策点 → 从决策点续
- 不得重新跑 `/opsx:apply`，除非用户明确选择「全部修复」
