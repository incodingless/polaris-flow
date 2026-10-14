---
name: sdd
command_prefix: psfl
triggers: ["/psfl{{CMD_SPR}}coding{{CMD_SPR}}sdd"]
description: SDD 驱动开发（specification-driven development）——复杂需求的完整链路入口：澄清 → 提案 → 深度设计 → 任务规划 → 构建 → 验收 → 交付
---

# SDD 驱动开发（完整链路入口）

本命令是**复杂需求（complex）的独立入口**，可独立启动，不依赖其他命令。

## 链路

```
澄清（specify） → 提案（plan） → 深度设计（design） → 任务规划（tasks） → 构建（build） → 验收（verify） → 交付（ship）
```

- 链尾是 `ship`；`retro` 是交付后的**可选**只读聚合入口（不进阶段序列、由用户显式触发），不计入阶段链。
- 每个阶段由独立技能执行；阶段间衔接由各技能出口的 `state next` + 任务自己的 `state.yaml` 顶层 `phase` 判定，**不由本命令代做**。

## 需求内容

本命令**本身不收集**需求 —— 由 `specify` Step 1 的探索澄清承接。
若需求描述严重不足（如仅"实现 XX"），`specify` 的澄清流程会要求补全后才继续。

## 中断恢复

重新执行本命令即可：`specify` Step 1 会枚举在途任务、读回**它自己的** `state.yaml`
（`workflow.mode=full`）并按决策点询问**续写 / 丢弃并新建**。

- 任务**仍在 specify** → 续写，或丢弃重建。
- 任务**已越过 specify**（该任务 `state.yaml` 的 `phase` 为 `plan` / `design` / `tasks` / `build` / `verify`）
  → 重新执行本命令时会被**自动转交**给该阶段技能（`polaris{{SKN_SPR}}coding{{SKN_SPR}}<skill>`）续跑，
  无需用户手动换命令。

## 执行

使用 `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` 技能。
