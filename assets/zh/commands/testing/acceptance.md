---
name: acceptance
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}testing{{CMD_SPR}}acceptance"]
description: 编写验收标准工作流（把需求条目转换为 GWT 可判定验收标准：需求条目拆解 → 按场景编写 → 可验证性自检 → 输出清单）
---

> **入口定位**：本命令是编写验收标准的独立入口，行为与在 /polaris{{CMD_SPR}}flow 菜单选 **T02** 完全一致。
> **前置依赖**：需要**需求条目 / 功能点清单**作为编写对象。按下列顺序定位：① 用户在附加上下文给出的 PRD / 需求基线路径；② 用户直接口述的功能点。两者皆无 → **阻断**：提示先执行 **R02**（编写产品需求）产出 PRD，或直接给出要编写验收标准的功能点清单。
>
> **附加上下文**：PRD 中的业务规则与非功能需求、可测性报告、指定范围（全量 / 指定章节 / 指定功能点）可在启动时一并给出，技能会先完整读取。

使用 `polaris{{SKN_SPR}}testing{{SKN_SPR}}acceptance` 技能。
