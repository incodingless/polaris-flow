---
name: explore-router
description: "评估需求文档清晰度并路由 openspec-explore 深度（SKIP/LIGHT/FULL）。用户提供 PRD/需求文档、要求判断是否需要 explore、提及需求清晰度或跳过/轻量化 explore 时必须使用。不替代 clarify 的交互式讨论。"
---

# explore-router

<HARD-GATE>
本 skill **仅**负责需求清晰度量化评估与 explore 深度路由。

- **禁止**无文档证据给任何检查项打 1 分（必须引用原文或标注「文档未提及」）
- **禁止**用户未确认变更等级（L1/L2/L3）就进入打分（用户提供等级除外）
- **禁止**L3 变更路由为 SKIP（最多 LIGHT）
- **禁止**核心三维（D1/D2/D3）任一维度 ≤1 分时路由为 SKIP
- **禁止**代替 clarify 执行 brainstorming / Reframe / Premise Challenge
- **禁止**未 `read_file templates/clarity-report-template.md` 就落盘报告
</HARD-GATE>

**启动时必须先输出**：`[easy-flow] 进入阶段: explore-router — 需求清晰度评估`

---

## 流程（按顺序执行）

### Step 0：收集输入

| 输入 | 必需 | 说明 |
|------|------|------|
| 需求文档 | ✅ | 正文或 `read_file` 路径 |
| 相关要求 | 可选 | constitution、技术约束、关联 PRD、用户口头补充 |
| change_level | 可选 | L1 / L2 / L3；未提供则 Step 1 推断 |

若需求文档缺失或无法读取 → 阻断，要求用户提供。

### Step 1：变更等级（推断 + 确认 or 用户提供）

- 用户已提供 `change_level` → 记录来源「用户提供」，跳到 Step 2
- 否则 `read_file ./policies/change-level-rubric.md`，推断等级并呈现确认模板，**等待用户确认**
- 用户改为 Lx → 记录「用户覆盖推断」，锁定等级

**未确认不得进入 Step 2。**

### Step 2：15 项打分（强制举证）

`read_file ./policies/clarity-checklist.md`，对 D1-1 ~ D5-2 逐项 0/1 打分：

1. 每项必须引用文档原文片段，或写「文档未提及」
2. 汇总 5 维度得分 + 总分 /15
3. 若存在 `openspec/memory/constitution.md`，读取后评估 D5-1/D5-2

**核心三维检查**：D1、D2、D3 任一维度 ≤1 分 → 标记 `core_dimension_failures`，后续不得 SKIP。

### Step 3：路由判定

#### 3.1 按分数初判

| 变更等级 | SKIP | LIGHT | FULL |
|---------|------|-------|------|
| L1 | ≥8 | 5-7 | ≤4 |
| L2 | ≥12 | 8-11 | ≤7 |
| L3 | — | 推荐 | 模糊时 |

L3 特殊：无论分数，初判最高 LIGHT，不得 SKIP。

#### 3.2 误判陷阱覆盖

`read_file ./policies/misjudgment-traps.md`，检测 TRAP-1 ~ TRAP-6：

- 命中任一条 → 路由降一级（SKIP→LIGHT，LIGHT→FULL）
- 记录 `trap_flags` 与覆盖原因

#### 3.3 叠加规则

- 核心三维任一 ≤1 → 不得 SKIP（最多 LIGHT）
- D2 异常场景占比无法验证且主流程占绝对多数 → D2 至少扣 2 项并重算

锁定最终路由：`SKIP` | `LIGHT` | `FULL`。

### Step 4：输出

#### 4.1 对话内报告

向用户输出结构化摘要：

```
📋 需求清晰度评估结果

变更等级：L{x}（来源：<用户提供 / 推断+确认>）
总分：<x>/15
路由结论：<SKIP / LIGHT / FULL>

维度得分：D1=<a>/4  D2=<b>/4  D3=<c>/3  D4=<d>/2  D5=<e>/2

TOP 3 缺口：
1. ...
2. ...
3. ...

误判陷阱：<命中列表或「无」>
```

LIGHT 时追加：按 `./policies/light-explore-scope.md` 列出 4 项待执行动作。

#### 4.2 落盘

1. `read_file templates/clarity-report-template.md`
2. 按模板填充完整报告
3. 写入路径（优先级）：
   - 存在活跃 change draft → `.harness/changes/<draft>/clarity-report.md`
   - 否则 → `.harness/clarity-report.md`
4. 报告头部记录 `evaluated_at` + `input_documents` + `input_hash`
5. 若覆盖旧报告，在「评估历史」节保留最近 3 次摘要

输出：`[easy-flow] clarity-report 已写入 <path>`

### Step 5：下游指引（只建议，不自动执行）

| 路由 | 建议下一步 |
|------|-----------|
| **SKIP** | 可直接 `/psfl:clarify` 或 `/ezfl:propose`；注明 explore 可跳过 |
| **LIGHT** | 按 `./policies/light-explore-scope.md` 执行 4 项定向动作，产出 1 页补充报告后进入下游 |
| **FULL** | 建议全量 openspec-explore + `/psfl:clarify` |

---

## 自检清单（完成前必须通过）

- [ ] 变更等级已确认（或用户提供）
- [ ] 15 项均有证据或「文档未提及」
- [ ] 陷阱检测已完成
- [ ] 对话报告已输出
- [ ] clarity-report.md 已落盘
- [ ] 未越权执行 clarify 流程

---

## 参考文件

| 文件 | 用途 |
|------|------|
| `./policies/clarity-checklist.md` | 15 项打分清单与分级表 |
| `./policies/change-level-rubric.md` | L1/L2/L3 推断与确认 |
| `./policies/misjudgment-traps.md` | 6 条陷阱与覆盖规则 |
| `./policies/light-explore-scope.md` | 轻量化 explore 4 项定义 |
| `./templates/clarity-report-template.md` | 落盘报告模板 |
| `../hard-stops.md` | 全局 H8 状态行约束 |
