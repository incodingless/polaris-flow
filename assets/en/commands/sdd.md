---
name: sdd
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}sdd"]
description: Specification-driven development (alias for the P03 full chain) — includes deep design and strengthened review
---

> **Alias note**: `/polaris{{CMD_SPR}}sdd` is a command alias that the `polaris{{CMD_SPR}}flow` Step 0.4 auto-evaluation routes to when the complexity verdict is `complex`. Behavior is **identical** to the P03 full chain starting from `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify`:
>
> `specify → plan → design → tasks → build → verify → ship → retro`
>
> Use sdd when you already know the request is complex and want to skip the complexity pre-check. Use `polaris{{CMD_SPR}}flow` when you want the pre-check + auto-evaluation to drive the routing.
>
> Still subject to the zero-step pre-check: before execution, `polaris{{CMD_SPR}}flow`'s zero-step must have populated `需求内容` (requirement content) to a non-empty value, otherwise H14 blocks.

Use the `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` skill.
