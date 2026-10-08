---
name: prd
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}prd"]
description: 编写需求文档工作流（用户 / 系统需求：探索并澄清需求 → 产出需求基线 + 功能架构草案；后续 draft → refine → review → ship 定稿归档）
---

> **入口定位**：本命令是编写需求文档的独立入口，行为与在 /polaris{{CMD_SPR}}flow 菜单选 R02 完全一致。
> **前置依赖**：无硬前置——原始需求（用户想法 / 需求文档 / 口头描述）即可起步；若已有《需求基线》，可直接从下游阶段续跑。
>
> **附加上下文**：已有的需求文档、用户反馈、竞品资料、建设方案可在启动时一并给出，技能会先完整读取。

使用 `polaris{{SKN_SPR}}prd{{SKN_SPR}}discovery` 技能。
