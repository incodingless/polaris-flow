# Phase 7 — 自检与用户批准

## 用户审查

> 规格已写入 `<path>`。请审查；若在进入 proposal 前需修改，请告知。

等待用户批准。要求修改 → 编辑 → 重跑 Phase 6 自检。

## openspec-reviewer（polaris schema 启用时）

intent.md 完成后 dispatch `openspec-reviewer` 子 Agent（非 Skill）：

- 审查：意图完整、方案权衡、逻辑一致、明显遗漏
- 结果追加至 intent.md 末尾（见 polaris-flow schema 分隔格式）
- 关键问题 → STOP 待修订

## 终止

用户批准 intent.md → **结束**。

**不要**调用 writing-plans、frontend-design、mcp-builder 或其他实现技能。
