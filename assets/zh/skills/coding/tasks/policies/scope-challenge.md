# Step 0：范围挑战（Scope Challenge）

> 归属：`polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks` 技能。由 **`tasks-review-agent`** 在评审入口执行。  
> **一次性报告模式**：6 子节结论写入 Plan Review Report 的「Step 0 范围挑战结论」与相关 Findings；复杂度命中时**只给出缩 Scope 建议**，不向用户提问（决策由 plan skill 消化）。

**评审任何东西之前**先完成以下 6 项。跳过会让后续 Section 1-4 失焦。

## 0.1 已有代码盘点

什么现有代码已部分或完全解决了各子问题？能否捕获现有流程的输出，而不是构建并行流程？

→ 输出进入报告「What already exists」章节。

## 0.2 最小改动集

什么是达成既定目标的**最小改动集**？标记任何可推迟而不阻塞核心目标的工作。**对范围蔓延要严苛**。

→ 推迟项进入报告「NOT in scope」。

## 0.3 复杂度检查（关键阈值）

若计划满足以下任一条件，视为**复杂度异味**（默认阈值；若项目 `config.yaml` 有 `scope_challenge.max_files` / `max_new_services` 则从其值）：

- 触及 **8+ 文件**
- 引入 **2+ 个新类/新服务**

命中时必须在报告中：

- 解释什么被过度构建
- 提出达成核心目标的最小版本（缩 Scope 建议）
- 严重度至少 Important；明显臆造模块 → Critical

**不**在 agent 内询问用户是否缩减——由 plan skill 展示建议后 decision-point。

## 0.4 搜索检查

对计划引入的每个架构模式、基础设施组件、并发方案：

- 运行时/框架是否有内置方案？
- 当前最佳实践与已知 footgun？

本 agent **禁止联网**。跳过实际联网查询，在报告记录："联网搜索不可用（agent 禁网）——基于材料与只读代码验证继续"。若材料声明「复用现有 X」则按读代码规则验证。

如计划在已有内置方案的情况下自造方案，标记为 scope reduction 机会（Finding）。

## 0.5 TODOS 交叉引用

读取项目根 `TODOS.md`（若存在）。检查：

- 是否有遗留项阻塞此计划？
- 能否把遗留项**捎带**进此变更而不扩大范围？
- 此计划是否产生新的应被记录为 TODO 的工作？

## 0.6 完整性检查（Completeness Principle）

- AI 辅助下「完整方案」成本低：默认倾向完整覆盖 specs / detailed-design，而非人时导向的 shortcut
- 若计划用 shortcut 省掉关键验收或测试 → Finding（Important / Critical）

## 触发结果

- **复杂度检查命中** → 报告写明缩 Scope 建议，再继续 Section 1-4（不阻塞后续节；STATUS 由 Findings 严重度决定）
- **未命中** → 6 项结论写入报告后直接进 Section 1-4
