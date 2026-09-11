---
name: sdd
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}coding{{CMD_SPR}}sdd"]
description: SDD 驱动开发（specification-driven development；P03 完整链路的别名）——含深度设计 (design) 与加强的审查 (plan + tasks + verify)
---

> **别名说明**：`/polaris{{CMD_SPR}}coding{{CMD_SPR}}sdd` 是 `/polaris{{CMD_SPR}}flow` 走 0.4 自动评估后路由到 `complex` 档的**命令别名**。行为与 `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` 起头的 P03 完整链路**完全一致**：
>
> `specify → plan → design → tasks → build → verify → ship → retro`
>
> 用 sdd 而非直接 P03 的差异仅在**触达路径**——`/polaris{{CMD_SPR}}coding{{CMD_SPR}}sdd` 适合"我已经知道这是复杂需求，直接进 8 阶段"的用户；`/polaris{{CMD_SPR}}flow` 适合"还没定复杂度，让命令预检 + 评估"的用户。
>
> 同样触发 zero-step 预检：执行前必须先走完 `/polaris{{CMD_SPR}}flow` 零步（参见 `assets/zh/commands/flow.md` 零步）把 `需求内容` 填到非 `待预检` 且非 `无`，否则按 H14 阻断。

使用 `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` 技能。
