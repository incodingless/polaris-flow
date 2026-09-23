---
name: hotfix
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}maintance{{CMD_SPR}}hotfix"]
description: 修复生产故障
---

用户从「生产故障」入口进入，**预期通道 = `hotfix`**（生产 / 线上 / 灰度真实流量，已影响真实用户或数据，
来自线上告警、监控或客服工单）。

使用 `polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose` 技能，并把「预期通道 = `hotfix`」作为上下文一并交接。

**通道的判定处只有 `diagnose` 的场景分流步**——本入口只是用户的第一意图：信号不足时按该步询问，
**不得**因本入口的预期而在分流前动手，也不得默认某一通道。

两通道的装配顺序相同，`channel` 只决定各阶段技能的加严分支；生产通道的现场保全、止血、
回退路径硬门禁、数据脚本 / 埋点 / 开关、独立验证（`patch` 内）与发布确认都由对应阶段技能承接：

```
diagnose（诊断与方案）→ patch（实现与自验）→ closeout（关闭Bug + 自有收尾归档）
```

阶段之间的衔接由**各阶段技能在自己的出口**判定（`polaris-flow state next` 读 `auto_transition`，见 `policies/auto-transition.md`）；
本命令**不代做判定**，也不得在同一会话硬续跑。
