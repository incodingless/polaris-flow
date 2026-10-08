---
name: review-testcase
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}testing{{CMD_SPR}}review-testcase"]
description: 测试用例集独立评审（7 维度 + Critical/Major/Minor/Nit 分级 + 可核对的评审报告）
---

> **前置依赖**：需要**待评审的测试用例集**。按下列顺序定位：① 用户在附加上下文给出的用例文档路径；② 当前活跃测试用例任务的产物 `.polaris/testcases/<task_id>/test-cases.md`（及其三份增量）。两者皆无 → **阻断**：提示先在第三步附上用例集路径，或先走 `/polaris{{CMD_SPR}}flow` 的 **T01 编写测试用例** 产出用例集。
> 配套的《测试计划》（`testcase_plan.md`）与 PRD 是覆盖类判据来源——**缺失不阻断**，但对应维度标记「无法执行」并说明原因。

使用 `polaris{{SKN_SPR}}testing{{SKN_SPR}}review` 技能。
