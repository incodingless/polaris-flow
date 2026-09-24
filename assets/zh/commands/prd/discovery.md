---
name: discovery
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}prd{{CMD_SPR}}discovery"]
description: 编写产品需求（探索并澄清需求：产出需求基线 + 功能架构草案；后续 draft → refine → review → ship）
---

> **入口定位**：本命令是 `/polaris{{CMD_SPR}}flow` 的 **R02 · 编写产品需求** 的入口，行为与在 flow 菜单选 R02 完全一致。从原始需求（用户想法 / 需求文档 / 口头描述）出发，探索并澄清模糊点，产出《需求基线》（`req_baseline.md`，含功能架构草案）与《需求澄清纪要》（`req_clarify_summary.md`），确认后衔接 `draft`。
>
> 后续阶段链：`discovery → draft → refine → review → ship`（`ship` 迁移出《需求终稿》并归档）。

使用 `polaris{{SKN_SPR}}prd{{SKN_SPR}}discovery` 技能。
