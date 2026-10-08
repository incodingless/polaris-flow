---
name: testcase
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}testing{{CMD_SPR}}testcase"]
description: 测试用例设计工作流（基于定稿 PRD：澄清测试意图 → 编写用例集 → 完善与独立评审 → 准出交付）
---

> **入口定位**：本命令是设计测试用例的独立入口，行为与在 /polaris{{CMD_SPR}}flow 菜单选 T01 完全一致。
> **前置依赖**：需**已定稿的 PRD 且含验收标准**。缺失 → 提示用户先执行 **R02**（编写产品需求）或 **T02**（编写验收标准）。
>
> **附加上下文**：定稿 PRD、交互原型、数据库表设计、接口清单可在启动时一并给出，技能会先完整读取。

使用 `polaris{{SKN_SPR}}testing{{SKN_SPR}}discovery` 技能。
