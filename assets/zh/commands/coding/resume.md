---
name: resume
command_prefix: psfl
triggers: ["/psfl{{CMD_SPR}}coding{{CMD_SPR}}resume"]
description: 接续未完成的 coding 任务（新开会话恢复在途任务，由 intake 恢复分发到当前阶段技能）
---

使用 `polaris{{SKN_SPR}}coding{{SKN_SPR}}intake` 技能。

本命令**不声明档位**（与 `tweak` / `normal` / `strict` 三个入口不同）：档位已记录在任务 `state.yaml` 的 `workflow.mode`，由 `intake` 的恢复分发直接沿用，并按当前 `phase` / `skill` 转交到对应阶段技能。
