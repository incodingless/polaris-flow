# Plan 技能审查机制优化方案

> 状态：已落盘（2026-10-16），测试通过。落点两文件：`assets/zh/skills/coding/plan/SKILL.md`、`assets/zh/agents/review/plan-review-agent.md`。仅中文版（英文版暂不处理，未同步前不写 Changelog）。

## 1. 背景与问题

| 问题 | 现象 | 根因 |
|------|------|------|
| 1 | Step 4.3 审查模式决策点未出现，直接按 `per_batch` 自动审查 | 4.3.1「推荐判定」占长文、4.3.2「询问」后置 → 执行者把「判定完成」当「已决策」；HARD-GATE 未覆盖；「默认推荐」措辞可误读为自动默认 |
| 2 | 齐套主审（`Batch: all`）subagent 长时间运行后服务端 `-1` 超时 | 单次派发负载过大（四件套 + 存量 specs 全量 + intention + review-log，单 turn 跑完全部对照）；无中间落盘；SKILL.md Step 5.2 无派发失败分支 |

## 2. 核心判断

跨文档对照（脱节/错位检查）**不等于**一次性全量读。OpenSpec 四工件是 DAG（proposal → specs/design → tasks），对照本质是**沿依赖边的可追溯性检查**。分段串行、每段只审一条边，既降负载、又查得更准。

---

## 3. 问题 1 优化：4.3 决策点强制回显（SKILL.md）

三处改动。

### 3.1 HARD-GATE 追加一条

```markdown
- **禁止**跳过 Step 4.3 用户询问：未经用户显式选择，禁止写入 `artifact_review_mode`、禁止进入 Step 4.4
```

### 3.2 4.3 节重构：合并为「回显 → 询问 → 等待」单块

替换原 4.3.1「先判定推荐」与 4.3.2「用户决策点」两小节，消除结构倒置。改后文本：

```markdown
#### 4.3 审查模式选择（阻塞，禁止自动决策）

本步是用户决策点：必须先回显判定依据与推荐，再暂停等用户选择。
禁止用推荐直接写入 `artifact_review_mode` 或跳过询问。

发问前按顺序一次性回显三件事：

1. **判定依据**：基于 `intention.md` 与 `state.yaml` 分级三字段
   （`complexity_level` / `risk_level` / `current_tier`），核对下方信号表，
   **只列出实际命中的信号**（未命中不列）。
   三字段由 `specify` Step 5.4.1 落盘；缺失（老任务 / 非 specify 入口）→ 按 `standard` 兜底并标注。
   信号表唯一源：`./policies/risk-signals.md`。

   【推荐 A（per_batch）信号表 — 原表保留】
   【推荐 B（after_all）信号表 — 原表保留】

2. **推荐**：`审查模式推荐: A|B（per_batch|after_all）`，附 1–3 条命中信号。
   信号无法判定或冲突 → 推荐 A（分批审查成本高于事后大返工时更可控）。
   **推荐仅作回显，不代选。**

3. **选项**（按 `./policies/decision-point.md` 暂停询问，须带上推荐）：

   ```text
   即将按批次创建 OpenSpec 制品（顺序：proposal → specs → design → tasks）。
   是否在每一批生成后立即审查该批内容？

   建议: <A 或 B>（依据见上方）

   A. 是 — 每批生成后立即审查并冻结，再生成下一批（per_batch）
   B. 否 — 四件套全部生成完毕后，再在 Step 5.2 统一整体主审（after_all）
   ```

   停止等待用户选择。用户未回复前，禁止写入 `artifact_review_mode`、禁止进入 Step 4.4。

| 选项 | 写入 `state.yaml` | 后续 | 【原表保留】 |
```

### 3.3 「默认推荐」措辞修正

原「默认推荐：说不清或信号冲突 → 推荐 A」改为：

```markdown
信号无法判定或冲突 → 推荐按 A 呈现（仅作为推荐回显，仍必须询问，不得直接写入 per_batch）。
```

---

## 4. 问题 2 优化：齐套主审分段化 + 失败降级

### 4.1 一次性 vs 分段 判断（两轴，回显不自动决策）

| 轴 | 判据 | 结论 |
|----|------|------|
| 负载（硬规则） | 主审材料合计行数 = proposal + specs + design + tasks + intention + review-log | 超阈值 **2500 行** → 强制分段；未超 → 看下一轴 |
| 一致性复杂度（推荐） | specs 份数、跨 2+ capability、tasks 需求条目数 | 复杂 → 推荐分段；简单 → 推荐一次性 |

负载轴超限是**工程降级**（分段是唯一不崩的路径），不是用户决策，直接执行并回显判定依据即可。

### 4.2 与 after_all / per_batch 的关系

| Step 5.2 场景 | 默认策略 |
|---------------|----------|
| `after_all`（唯一主审，单批质量 + 跨批对齐都做，负载最重） | **默认分段** |
| `per_batch`（批内已审，5.2 只做跨批 Verdict，负载轻） | **默认一次性**；体量超阈值再分段 |

### 4.3 分段审查方法（沿 DAG 边，3 段链式串行）

| 段 | 审的边 | 对照检查项 | 基线 |
|----|--------|-----------|------|
| 1 | proposal → specs | specs 每条需求是否承接 proposal 目标/范围；是否越界到非目标；ADDED/MODIFIED/REMOVED + EARS + Scenario 完整性 | intention + proposal 决策摘要 |
| 2 | proposal+specs → design | design 每个决策是否对应 proposal capability；是否暗改边界/非目标；Premises / Alternatives / Constitution Alignment 存在 | 段 1 已锁摘要 |
| 3 | 全上游 → tasks | tasks 覆盖 specs 全部需求（无闲置需求/孤立任务）；不越 proposal 非目标；迁移/兼容/异常兜底项 | 全部上游摘要 |

- 每段 agent 拿「上游决策摘要 + 本段全量」，产出 `reviews/plan-review-<segment>.md`
- 主代理汇总三段 findings 合成最终 Verdict，写入 `reviews/plan-review-report.md`

**跨段脱节 checklist（写进 agent 定义，每段必查）**：

1. 越界：下游是否触碰上游非目标
2. 遗漏：上游需求/决策在下游无对应
3. 闲置：下游条目无上游来源（孤立 task / 决策）
4. 矛盾：上下游对同一概念的语义冲突

### 4.4 派发失败降级分支（SKILL.md 5.2）

派发失败/超时（如服务端 `-1`）→ **不整轮重跑** → decision-point：

- A. 分段重跑（按 4.3）
- B. 原样重试一次
- C. 用户接受 SKIPPED（按现有协议）

### 4.5 agent 定义瘦身（plan-review-agent.md）

- 存量 `openspec/specs/*/spec.md` 从「全量读」改为「按变更涉及 capability **定向读**」（Grep 定位，≤3 次）
- 支持分段模式：注入 `Segment: 1|2|3` + 上游决策摘要
- 修复 review-log 校验：`Batch: all` / 分段下不再 `grep "<batch> Round"`（原逻辑在齐套场景无匹配）

---

## 5. 落点文件与执行顺序

| 批次 | 改动 | 文件 |
|------|------|------|
| ① 低风险 | 3.1 / 3.2 / 3.3 | SKILL.md |
| ② | 4.1 / 4.2 / 4.3 / 4.4（5.2 分段派发 + 失败降级） | SKILL.md |
| ③ | 4.5（分段模式 + checklist + 定向读） | plan-review-agent.md |

落盘后跑 26/26 技能测试通过方可提交。

## 6. 已裁定（2026-10-16）

| 项 | 裁定 |
|----|------|
| 负载阈值 | **全部文档合计 2500 行**（本次变更 materials 清单合计；存量 specs 已定向读，不计入） |
| 分段数 | 3 段（沿 DAG 边） |
| Verdict 汇总 | 主代理汇总 |
