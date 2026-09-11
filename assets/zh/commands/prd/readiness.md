---
name: readiness
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}prd{{CMD_SPR}}readiness"]
description: 需求就绪度评估（研发准出判定：五维度加权评分 + PASS/CONDITIONAL/FAIL + 缺陷清单）
---

> **前置依赖**：评估对象必须是**已定稿的 PRD 终稿**（`prd-final-v1.0.md`）。无定稿终稿 → 提示先走 `/polaris{{CMD_SPR}}flow` 的 **R02 编写产品需求** 完成定稿，禁止拿未定稿的草稿评估。
> 前置两份评审报告（`review` / `testability`）缺失时**不阻断**——对应维度标记「证据不足」并按 3 分封顶。

使用 `polaris{{SKN_SPR}}prd{{SKN_SPR}}readiness` 技能。

本命令是 `polaris{{SKN_SPR}}prd{{SKN_SPR}}ship` Step 1 准出评估的**独立触发入口**，行为与 ship 内调用完全一致（含 Step 0 免评判定 E1~E3 与强制信号 F1~F5、连续免评 2 次后强制全评）。

**硬约束**：只评估不修改；缺陷必须定位到章节 + 锚点；不重复判定 `review` / `testability` 已覆盖的问题（消费其结论作证据源）；产物落 `final/readiness_report.md`，判定为 FAIL 时阻断交付并回退 `refine` 修复。
