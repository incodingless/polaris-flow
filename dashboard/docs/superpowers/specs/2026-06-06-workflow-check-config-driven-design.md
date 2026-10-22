# 工作流步骤状态判断 — 配置驱动方案

## 问题

当前 `change-scanner.ts` 中 `STEP_FILE_CHECKS` 硬编码了步骤 ID 到文件检查的映射，且仅支持 4 种检查类型。`config/tasks.yaml` 中的步骤 ID（`workspace`、`executor`、`codeReview`、`completion`）与硬编码映射不同步。新增工作流必须同时修改代码，无法做到纯配置驱动。

## 方案

将步骤的"判断依据"内置到 `config/tasks.yaml` 中，每个步骤通过 `check` 对象声明自己的完成条件。`change-scanner.ts` 删除硬编码常量，改为通用的分派逻辑。

## `check` 类型定义

| type | 参数 | 判断逻辑 |
|------|------|----------|
| `none` | — | 始终完成 |
| `file-exists` | `path: string` | `openspec/changes/<name>/<path>` 文件存在 |
| `dir-has-md` | `path: string` | 目录存在且含 `.md` 文件 |
| `tasks-all-checked` | `path: string` | 文件存在且所有 checkbox 为 `[x]` |
| `markdown-section-done` | `path: string`, `section: string` | 解析 markdown，判断指定 section 是否标记完成 |
| `git-worktree-exists` | — | 执行 `git worktree list`，匹配 change 名称 |
| `archive-exists` | — | 检查 `openspec/changes/archive/YYYY-MM-DD-<change>/` 是否存在 |
| `git-branch-merged` | — | 检查 worktree 分支是否已合并到目标分支 |
| (无 check 字段) | — | 始终 pending（手动步骤/未定义） |

## `config/tasks.yaml` 结构

每个 step 新增 `check` 字段（可选，无 check 时视为始终 pending）：

```yaml
steps:
  - id: brainstorm
    name: 方案研讨
    check:
      type: file-exists
      path: brainstorm.md
```

部分步骤不需要 `path` 参数（`git-worktree-exists`、`archive-exists`、`git-branch-merged`、`none`），这些类型通过 git 命令或目录扫描来判断，所需信息（change 名称、项目根路径）从调用上下文中获取。

## 代码改动

### 1. `api/workflow.ts` — 接口扩展

`WorkflowStep` 新增 `check` 字段：

```typescript
export interface StepCheck {
  type: string
  path?: string
  section?: string
}

export interface WorkflowStep {
  id: string
  name: string
  description: string
  check?: StepCheck
}
```

### 2. `change-scanner.ts` — 核心改动

- 删除 `STEP_FILE_CHECKS` 常量（~18 行硬编码映射）
- 删除 `isStepDone(changeDir, stepId)` 函数
- 新增 `isStepDone(ctx, step)` — 根据 `step.check.type` 分派到独立函数：

| 函数 | 对应 type |
|------|-----------|
| `checkFileExists(ctx, path)` | `file-exists` |
| `checkDirHasMd(ctx, path)` | `dir-has-md` |
| `checkTasksAllChecked(ctx, path)` | `tasks-all-checked` |
| `checkMarkdownSection(ctx, path, section)` | `markdown-section-done` |
| `checkGitWorktree(ctx)` | `git-worktree-exists` |
| `checkArchiveExists(ctx)` | `archive-exists` |
| `checkGitBranchMerged(ctx)` | `git-branch-merged` |

`ctx` 包含 `changeDir`、`changeName`、`projectRoot`（从 `changeDir` 计算得出）。

- `computeStepStatuses()` 改为接收 workflow 的 `steps` 数组（含 check 信息），传递给 `isStepDone`

### 3. `config/tasks.yaml` — 数据填充

给 `polaris-flow-backend` 的 17 个步骤补上 `check` 字段。

## 前端影响

无。`app.js` / `app.css` 不变。前端只消费 `stepStatuses`，不关心后端如何判断。

## 向后兼容

`check` 字段可选：step 无 `check` 时 `isStepDone` 返回 `false`（始终 pending）。

## 扩展性

新增工作流（如 `polaris-flow-frontend`）只需在 `config/tasks.yaml` 中新增 yaml 块，使用已有的 check 类型组合，零代码改动。
