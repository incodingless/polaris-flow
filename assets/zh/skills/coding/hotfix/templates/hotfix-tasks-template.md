# hotfix tasks 模板

> **使用范围**：仅 `polaris{{SKN_SPR}}coding{{SKN_SPR}}hotfix` 技能。tweak / normal / design 的 tasks 模板**不适用**。

## 与 tweak-tasks-template.md 的差异

| 维度 | hotfix | tweak |
|------|--------|-------|
| 任务数 | **≤3**（强约束） | ≤3（强约束） |
| TDD 标注 | **必填**（bug 修复 = 必写回归测试） | 必填 |
| 任务类型 | 「写回归测试 / 写 fix / 跑测试 / incident 复盘」 | 「写实现 / 写测试 / 自检」 |
| task-split-precheck | 跳过 | 跳过 |
| tasks-lint | 强制 | 强制 |

## 模板骨架

```markdown
# Tasks — <change_id>

<!-- hotfix-template -->
<!-- 任务类型：TDD 任务 = 含「写测试 / 写 fix / 跑测试」字样 -->
<!-- 任务类型：非 TDD 任务 = 「incident 复盘 / 文档同步」类 -->

## 1. 写回归测试（红）

<!-- TDD 任务 -->
- **类型**：TDD
- **路径**：`<test file path>`
- **测试名**：`<describe what>`
- **断言**：<what should fail before fix>

## 2. 写 fix（绿）

<!-- TDD 任务 -->
- **类型**：TDD
- **路径**：`<source file path>`
- **改动**：<one-line summary>
- **依赖**：任务 1

## 3. incident 复盘（可选）

<!-- 非 TDD 任务 -->
- **类型**：非 TDD
- **路径**：`docs/incidents/<change_id>.md`
- **模板**：`./policies/incident-recap-template.md`
- **依赖**：任务 2
```

## 强制规则

1. **任务数 ≤3**（hotfix 强约束，不走 task-split-precheck 也必须满足）
2. **至少 1 个 `<!-- TDD 任务 -->`**（bug 修复 = 必须有回归测试）
3. **incident 复盘任务可选**——但若用户提及"复盘 / 沉淀教训 / 跨团队同步"，则**必填**
4. **TDD 任务必须先写测试再写 fix**——任务顺序固定，lint 校验

## tasks-lint 校验

执行 `scripts/tasks-lint.sh`（或对应 hooks）会校验：

- 任务总数 ≤3
- `<!-- TDD 任务 -->` 数量 ≥1
- 任务顺序：测试任务必须在 fix 任务之前
- 路径必须以相对仓库根写（禁止绝对路径）

不通过 → 在 hotfix 阶段修，不通过阻塞 ship 移交。
