---
name: strict
command_prefix: psfl
triggers: ["/psfl{{CMD_SPR}}coding{{CMD_SPR}}strict"]
description: 复杂需求（C03）的完整链路入口：声明 strict 工作流 → 任务管理与调度 → 澄清 → 提案 → 深度设计 → 任务规划 → 构建 → 验收 → 交付
---

# 复杂需求入口（strict 工作流）

本命令是**复杂需求的独立入口**，可独立启动，不依赖其他命令。

它只**声明档位**，其余全部交给 `polaris{{SKN_SPR}}coding{{SKN_SPR}}intake`（任务管理与调度）
与各阶段技能 —— 本命令**不代做**任务判定与阶段衔接。

## 本档序列（唯一源 = 代码表 `phasesForMode`）

```
澄清（specify） → 提案（plan） → 深度设计（design） → 任务规划（tasks） → 构建（build） → 验收（verify） → 交付（ship）
```

- `design` 是**可选**阶段：`plan` 出口询问是否深化。
- 链尾是 `ship`；`retro` 是交付后的**可选**只读聚合入口（不进阶段序列、由用户显式触发），不计入阶段链。
- 阶段间衔接由各技能出口的 `state next` + 任务自己的 `state.yaml` 顶层 `phase` 判定，**不由本命令代做**。

## 需求内容与中断恢复

**都交给 `intake`**：它枚举在途任务，按该任务 `state.yaml` 的 `phase` 决定**接手还是转交**；
**零个在途任务时**才建任务（并写 `workflow.mode=strict`）。

⇒ 新开会话接续用 `/psfl{{CMD_SPR}}coding{{CMD_SPR}}resume`（不声明档位，直接恢复在途任务）；任务已越过澄清时会被自动转交给当前阶段技能。
需求描述严重不足（如仅"实现 XX"）时，`specify` 的澄清流程会要求补全后才继续。

## 执行

使用 `polaris{{SKN_SPR}}coding{{SKN_SPR}}strict` 技能（声明 `strict` 档）。
