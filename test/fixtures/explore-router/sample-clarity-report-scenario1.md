# 需求清晰度评估报告（场景 1 样例）

> 验证用样例，展示 clarity-report-template 填充结果。见 verification-walkthrough.md。

## 元信息

| 字段 | 值 |
|------|-----|
| evaluated_at | `2026-07-02T10:00:00+08:00` |
| input_documents | `test/fixtures/explore-router/scenario-1-high-clarity-l1.md` |
| input_hash | `scenario-1-high-clarity-l1@v1` |
| change_level | `L1` |
| change_level_source | `用户提供` |
| evaluator | `explore-router` |

## 路由结论

| 字段 | 值 |
|------|-----|
| total_score | `15/15` |
| routing | `SKIP` |
| routing_before_traps | `SKIP` |
| routing_rationale | L1 变更总分 15 分 ≥8，核心三维全通过，无陷阱命中 |

## 维度得分

| 维度 | 得分 | 满分 |
|------|------|------|
| D1 | 4 | 4 |
| D2 | 4 | 4 |
| D3 | 3 | 3 |
| D4 | 2 | 2 |
| D5 | 2 | 2 |

**核心三维检查**：通过

## 误判陷阱检测

全部未命中。

## 建议下一步

**SKIP** — 可直接 `/psfl:clarify` 或 `/ezfl:plan`，explore 可跳过。
