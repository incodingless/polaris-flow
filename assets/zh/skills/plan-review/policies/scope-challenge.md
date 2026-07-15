# Step 0：范围挑战（Scope Challenge）

> 由 `plan-review` SKILL.md 在评审入口处调用。**评审任何东西之前**，先回答以下 6 个问题。这是评审的"地基"，跳过会让后续 Section 1-4 都失焦。

## 0.1 已有代码盘点

什么现有代码已部分或完全解决了各子问题？能否捕获现有流程的输出，而不是构建并行流程？

→ 输出会进入最终报告的「What already exists」章节（见 `../references/output-format.md` 第 4.2 节）。

## 0.2 最小改动集

什么是达成既定目标的**最小改动集**？标记任何可推迟而不阻塞核心目标的工作。**对范围蔓延要严苛**。

## 0.3 复杂度检查（关键阈值）

如果计划满足以下任一条件，视为**复杂度异味**，必须挑战（阈值由 `config.scope_challenge.max_files` / `max_new_services` 控制，默认值如下）：

- 触及 **8+ 文件**
- 引入 **2+ 个新类/新服务**

→ 主动通过 `ask_followup_question` 推荐 scope reduction：

- 解释什么被过度构建
- 提出达成核心目标的最小版本
- 询问用户是缩减范围还是按原计划继续

**关键铁律**：一旦用户接受/拒绝了 scope reduction，**完全 commit**——后续评审节中绝不再重提缩减建议，绝不静默缩减范围，绝不跳过计划好的组件。

## 0.4 搜索检查

对计划引入的每个架构模式、基础设施组件、并发方案：

- 运行时/框架是否有内置方案？尝试调用宿主提供的联网搜索能力查询 `"{framework} {pattern} built-in"`
- 当前最佳实践是什么？查询 `"{pattern} best practice {current year}"`
- 是否有已知 footgun？查询 `"{framework} {pattern} pitfalls"`

如宿主不提供联网搜索能力，跳过此项并在报告记录："联网搜索不可用——基于内置知识继续"。

如计划在已有内置方案的情况下自造方案，标记为 scope reduction 机会。

## 0.5 TODOS 交叉引用

读取项目根目录的 `TODOS.md`（若存在）。检查：

- 是否有遗留项阻塞此计划？
- 能否把遗留项**捎带**进此 PR 而不扩大范围？
- 此计划是否产生新的应被记录为 TODO 的工作？

## 0.6 完整性检查（Completeness Principle）

**这是 Boil-the-Lake 原则的核心应用**。

详见 `../references/output-format.md` 第 3 节「ask_followup_question 格式约束」中的「完整度评分」与「效率参考表」。简言之：

- AI 辅助让"完整方案"几乎免费（15 分钟 vs 人工 1 周）
- 默认推荐 Completeness ≥8 的选项
- 如果计划提议的 shortcut 节省的是"人时"但 AI 辅助下只省"分钟"，必须推荐完整版

## 触发结果分支

- **复杂度检查命中** → 主动 `ask_followup_question` 提议 scope reduction，等待用户答复后继续 Section 1
- **复杂度检查未命中** → 把上述 6 项发现以表格形式展示，然后直接进 Section 1
