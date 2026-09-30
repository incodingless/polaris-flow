---
name: review
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}testing{{CMD_SPR}}review"]
description: 测试用例集独立评审（7 维度 + Critical/Major/Minor/Nit 分级 + 可核对的评审报告）
---

> **前置依赖**：需要**待评审的测试用例集**。按下列顺序定位：① 用户在附加上下文给出的用例文档路径；② 当前活跃测试用例任务的产物 `.polaris/testcases/<task_id>/test-cases.md`（及其三份增量）。两者皆无 → **阻断**：提示先在第三步附上用例集路径，或先走 `/polaris{{CMD_SPR}}flow` 的 **T01 编写测试用例** 产出用例集。
> 配套的《测试计划》（`testcase_plan.md`）与 PRD 是覆盖类判据来源——**缺失不阻断**，但对应维度标记「无法执行」并说明原因。

使用 `polaris{{SKN_SPR}}testing{{SKN_SPR}}review` 技能。

本命令是 `polaris{{SKN_SPR}}testing{{SKN_SPR}}refine` Step 6 评审子步的**独立触发入口**，行为与 refine 内派发完全一致（同一份判据 `references/01-review-criteria.md`、同一份报告模板）。

**与链上委托的差异**：本入口**只出报告**——不推 workflow 游标、不改任何文件、**不阻断任何流程**；用例集的准入门禁（Critical 清零才放行 `ship`）只在链上委托路径生效。

**硬约束**：只评不改；问题必须分级（Critical/Major/Minor/Nit）；每条问题必须给可核对定位（用例编号 / 章节）；不得臆测需求；7 个维度不得跳过。报告落用例集同目录（或用户指定路径），文件名 `testcase-review-report.md`。
