# 调用方契约（Caller Contract）

> 本 skill 是**通用提案评审器**，不绑定任何特定工作流。任何业务工作流（如 easy-flow `lock` 链）作为调用方需履行下面的契约。**修改本文件字段或顺序，必须同步更新所有已知 adapter（包括 `commands/lock.md`）。**

## 输入

调用方需提供"提案材料路径列表"。在 easy-flow lock 链场景中，固定为：

- `openspec/changes/<name>/proposal.md`
- `openspec/changes/<name>/design.md`
- `openspec/changes/<name>/specs/`
- `openspec/changes/<name>/tasks.md`

独立调用场景由用户在对话中显式列出待评审文档路径。

## 输出

**唯一产物**：评审报告文件（路径由调用方指定）。

easy-flow lock 链场景下输出路径为 `openspec/changes/<name>/review-report.md`。

包含以下章节（顺序固定）：

1. 评审元信息（被评审 change 名、评审时间、评审者）
2. Step 0 范围挑战结论
3. Section 1: 架构评审
4. Section 2: 代码质量评审
5. Section 3: 测试评审（含 ASCII 覆盖率图）
6. Section 4: 性能评审
7. Outside Voice 评审（如运行）
8. NOT in scope
9. What already exists
10. Failure modes
11. Worktree 并行化策略（如适用）
12. Completion Summary
13. STATUS

## 修改约束

**评审期间禁止修改"提案材料"目录之外的任何文件**（在 easy-flow lock 链场景中即 `openspec/changes/<name>/` 之外）。

如果评审发现的测试缺口需要加入 tasks.md，**仅在 review-report.md 中列出建议**，由调用方在下一阶段（如 easy-flow 的 `/ezfl:build`）启动前统一更新 tasks.md。

## Constitution Compliance（由调用方处理，不在本 skill 职责内）

某些工作流要求评审报告包含 `## Constitution Compliance` 节，**该节由调用方在本 skill 执行完成后追加**，不在本 skill 的写入责任范围内。本 skill 不读 `openspec/memory/constitution.md`，不知道宪法的存在。

→ 在 easy-flow lock 链中，由 `commands/lock.md` 描述的注入点 B 在本 skill 完成后追加 Constitution Compliance 节。

## 硬门禁交付

review-report 的 STATUS 字段是**调用方的硬门禁信号**：

- `STATUS: DONE` → 调用方可推进到下一阶段
- `STATUS: DONE_WITH_CONCERNS` → 用户必须逐条决策每个 concern，确认后方可推进
- `STATUS: BLOCKED` 或 `STATUS: NEEDS_CONTEXT` → 严禁推进，必须先解决 blocking

在 easy-flow lock 链中，"下一阶段"指 `/ezfl:build`；STATUS 决策由 `commands/lock.md` 描述的链路转换处理。
