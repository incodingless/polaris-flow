---
name: bugfix
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}maintance{{CMD_SPR}}bugfix"]
description: 修复测试缺陷
---

用户从「测试缺陷」入口进入，**预期通道 = `bugfix`**（测试环境 / 提测后回归 / 用例失败 / 测试同学提单）。

使用 `polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose` 技能，并把「预期通道 = `bugfix`」作为上下文一并交接。

**通道的判定处只有 `diagnose` 的场景分流步**——本入口只是用户的第一意图：命中生产信号时按该步处理，
信号不足按该步询问，**不得**因本入口的预期而在分流前动手，也不得默认某一通道。

两通道的装配顺序相同，`channel` 只决定各阶段技能的加严分支：

```
diagnose（诊断与方案）→ patch（实现与自验）→ closeout（关闭Bug + 自有收尾归档）
```

阶段之间的衔接由**各阶段技能在自己的出口**判定（`polaris-flow state next` 读 `auto_transition`，见 `policies/auto-transition.md`）；
本命令**不代做判定**，也不得在同一会话硬续跑。
