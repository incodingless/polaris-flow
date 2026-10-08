---
name: prototype
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}prototype"]
description: 制作原型工作流（先出《原型蓝图》并人工确认 → 按蓝图做高保真可交互 HTML 原型 → 独立评审 → 确认后归档）
---

> **入口定位**：本命令是制作原型的独立入口，行为与在 /polaris{{CMD_SPR}}flow 菜单选 P01 完全一致。
> **前置依赖**：需可读的需求输入——需求基线 / 定稿 PRD / 建设方案 / Agent 设计文档（任一，且可被映射为用户 × 场景 × 任务）。缺失 → 提示用户先执行 **R01 / R02**，或把方案文档附进附加上下文。
>
> **附加上下文**：已有需求文档、目标页面清单、参考设计稿可在启动时一并给出，技能会先完整读取。

使用 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint` 技能。
