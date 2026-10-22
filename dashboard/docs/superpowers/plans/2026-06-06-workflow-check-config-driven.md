# 工作流步骤状态判断 — 配置驱动 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 change-scanner.ts 中硬编码的 `STEP_FILE_CHECKS` 替换为从 `config/tasks.yaml` 中每个步骤的 `check` 字段驱动的通用判断逻辑，实现新增工作流零代码改动。

**架构：** 在 `config/tasks.yaml` 的每个 step 中新增 `check` 对象声明完成条件，`api/workflow.ts` 扩展 `WorkflowStep` 接口，`change-scanner.ts` 删除硬编码常量改为根据 `check.type` 分派到独立检查函数。前端 `app.js` 和 `app.css` 不变。

**技术栈：** TypeScript, Node.js (fs, child_process), YAML (yaml package), Vitest

---

### 文件职责

| 文件 | 职责 |
|------|------|
| `config/tasks.yaml` | 定义工作流、步骤名称、check 条件（唯一数据源） |
| `src/core/dashboard/api/workflow.ts` | 类型定义、读取 tasks.yaml、扁平化步骤 |
| `src/core/dashboard/change-scanner.ts` | 扫描 change 目录、计算步骤状态（通用 check 分派） |
| `tests/unit/change-scanner.test.ts` | 测试扫描逻辑和所有 check 类型 |

### `change-scanner.ts` 函数边界

- 对外导出的 `computeStepStatuses` 签名不变（返回 `Record<string, 'done'|'active'|'pending'>`），但内部接收 step 对象而非 stepId 字符串
- 新增内部函数 `isStepDone(ctx, step)` 替代旧的 `isStepDone(changeDir, stepId)`
- 每个 check 类型对应一个内部函数，保持逻辑隔离

---

### 任务 1：config/tasks.yaml — 给每个步骤添加 check 字段

**文件：**
- 修改：`config/tasks.yaml`

- [ ] **步骤 1：为 polaris-flow-backend 的 17 个步骤补上 `check` 字段**

将现有步骤从纯文本格式改为包含 `check` 对象的格式。根据讨论确定的映射关系：

```yaml
workflow:
  - id: polaris-flow-backend
    name: 后端开发工作流
    groups:
      - name: 准备提案
        steps:
          - id: create
            name: 创建变更
            description: 创建变更
            check:
              type: none
          - id: brainstorm
            name: 方案研讨
            description: 用头脑风暴的方式，结合需求及现有上下文进行方案的研讨
            check:
              type: file-exists
              path: brainstorm.md

      - name: 编写提案
        steps:
          - id: proposal
            name: 编写提案
            description: 编写提案，阐述变更的背景、业务目标、技术目标、变更范围、验收标准、风险评估等
            check:
              type: file-exists
              path: proposal.md
          - id: specs
            name: 编写规范
            description: 用GWT格式阐述提案的功能场景
            check:
              type: dir-has-md
              path: specs

      - name: 详细设计
        steps:
          - id: design-domain-model
            name: 设计领域模型
            description: 设计领域模型
            check:
              type: file-exists
              path: design-domain-model.md
          - id: design-repository
            name: 设计仓储
            description: 设计仓储
            check:
              type: file-exists
              path: design-repository.md
          - id: design-data-model
            name: 设计数据模型
            description: 设计数据模型
            check:
              type: file-exists
              path: design-data-model.md
          - id: design-rest-api
            name: 设计前后端接口
            description: 设计前后端接口
            check:
              type: file-exists
              path: design-rest-api.md
          - id: design
            name: 设计总体技术方案
            description: 设计总体技术方案
            check:
              type: file-exists
              path: design.md

      - name: 任务规划
        steps:
          - id: tasks
            name: 分解任务
            description: 分解任务，并编写任务规划
            check:
              type: file-exists
              path: tasks.md
          - id: plan
            name: 编写执行计划
            description: 编写执行计划，并编写任务规划
            check:
              type: file-exists
              path: plan.md

      - name: 实施变更
        steps:
          - id: workspace
            name: 创建工作区
            description: 创建工作区
            check:
              type: git-worktree-exists
          - id: executor
            name: 测试驱动开发
            description: 测试驱动开发模式，逐个任务编写代码
            check:
              type: tasks-all-checked
              path: tasks.md
          - id: codeReview
            name: 代码审查
            description: 审查工作区代码，确保代码质量
            check:
              type: markdown-section-done
              path: plan.md
              section: Final verification
          - id: verify
            name: 验证变更
            description: 验证变更，确保变更符合规范
            check:
              type: file-exists
              path: verify.md

      - name: 复盘归档
        steps:
          - id: retrospective
            name: 复盘
            description: 复盘变更过程，总结任务结果及经验教训，提出改进建议
            check:
              type: file-exists
              path: retrospective.md
          - id: archrive
            name: 归档
            description: 归档变更，将变更归档到历史变更中
            check:
              type: archive-exists
          - id: completion
            name: 完成变更
            description: 完成变更，将工作区变更内容合并到开发分支
            check:
              type: git-branch-merged
```

- [ ] **步骤 2：验证 YAML 格式**

```bash
node -e "const { parse } = require('yaml'); const fs = require('fs'); const r = parse(fs.readFileSync('config/tasks.yaml','utf8')); console.log('Groups:', r.workflow[0].groups.length); r.workflow[0].groups.forEach(g => g.steps.forEach(s => console.log(s.id, s.check?.type)))"
```

预期输出：6 个 groups，17 个 step id + check type

- [ ] **步骤 3：Commit**

```bash
git add config/tasks.yaml
git commit -m "feat: add check field to each workflow step in tasks.yaml"
```

---

### 任务 2：扩展 api/workflow.ts 接口

**文件：**
- 修改：`src/core/dashboard/api/workflow.ts`

- [ ] **步骤 1：新增 StepCheck 接口和 flattenSteps 函数**

在 `WorkflowStep` 接口之后、`TasksYaml` 接口之前添加 `StepCheck` 接口，给 `WorkflowStep` 加 `check?` 字段，末尾添加 `flattenSteps` 函数。

修改 `WorkflowStep`（第 9-12 行）：
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

在 `flattenStepIds` 之后（第 86 行后）添加：
```typescript
/** 按 groups 顺序扁平化步骤对象列表（含 check 信息） */
export function flattenSteps(workflow: WorkflowDef): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  for (const group of workflow.groups) {
    for (const step of group.steps) {
      steps.push(step)
    }
  }
  return steps
}
```

- [ ] **步骤 2：编译检查**

```bash
npx tsc --noEmit src/core/dashboard/api/workflow.ts
```

预期：无错误。

- [ ] **步骤 3：Commit**

```bash
git add src/core/dashboard/api/workflow.ts
git commit -m "feat: add StepCheck interface and flattenSteps to workflow API"
```

---

### 任务 3：重写 change-scanner.ts — 删除硬编码，新增通用 check 分派

**文件：**
- 修改：`src/core/dashboard/change-scanner.ts`

- [ ] **步骤 1：添加 imports 和定义 Ctx 类型**

在文件顶部 `import { statSync, existsSync }` 后添加 `import { execSync } from 'node:child_process'`，将 `import { join, basename }` 改为 `import { join, basename, dirname }`。

将 `import { getWorkflowBySchema, flattenStepIds, type WorkflowDef } from './api/workflow.js'` 替换为：

```typescript
import {
  getWorkflowBySchema,
  flattenSteps,
  type WorkflowDef,
  type WorkflowStep,
} from './api/workflow.js'
```

在 `DEFAULT_SCHEMA` 之后添加内部 context 类型：
```typescript
interface CheckCtx {
  changeDir: string
  changeName: string
  projectRoot: string
}
```

- [ ] **步骤 2：删除 STEP_FILE_CHECKS 和旧的 isStepDone**

删除第 131-148 行的 `STEP_FILE_CHECKS` 常量。

删除第 150-179 行的 `isStepDone(changeDir: string, stepId: string)` 函数。

- [ ] **步骤 3：添加 8 个 check 函数**

在 `getChangeDetail` 函数之前添加以下函数：

```typescript
function checkFileExists(ctx: CheckCtx, path: string): boolean {
  return existsSync(join(ctx.changeDir, path))
}

function checkDirHasMd(ctx: CheckCtx, path: string): boolean {
  const dir = join(ctx.changeDir, path)
  if (!existsSync(dir)) return false
  try {
    const entries = readdirSync(dir, { recursive: true })
    return entries.some(e => (e as string).endsWith('.md'))
  } catch {
    return false
  }
}

function checkTasksAllChecked(ctx: CheckCtx, path: string): boolean {
  const tasksPath = join(ctx.changeDir, path)
  if (!existsSync(tasksPath)) return false
  const content = readFileSync(tasksPath, 'utf8')
  const tasks = parseTasksMd(content)
  return tasks.length > 0 && tasks.every(t => t.done)
}

function checkMarkdownSection(ctx: CheckCtx, path: string, section: string): boolean {
  const filePath = join(ctx.changeDir, path)
  if (!existsSync(filePath)) return false
  const content = readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  let inSection = false
  const checkboxes: boolean[] = []
  for (const line of lines) {
    if (/^##\s/.test(line) || /^#\s/.test(line)) {
      if (inSection) break
      if (line.includes(section)) {
        inSection = true
      }
      continue
    }
    if (inSection) {
      const match = line.match(/^\s*- \[(.)\] /)
      if (match) {
        checkboxes.push(match[1] !== ' ')
      }
    }
  }
  return checkboxes.length > 0 && checkboxes.every(c => c)
}

function checkGitWorktree(ctx: CheckCtx): boolean {
  try {
    const output = execSync('git worktree list', {
      cwd: ctx.projectRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    return output.includes(ctx.changeName)
  } catch {
    return false
  }
}

function checkArchiveExists(ctx: CheckCtx): boolean {
  const archiveDir = join(ctx.projectRoot, 'openspec', 'changes', 'archive')
  if (!existsSync(archiveDir)) return false
  try {
    for (const entry of readdirSync(archiveDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.endsWith('-' + ctx.changeName)) {
        return true
      }
    }
  } catch {
    /* ignore read errors */
  }
  return false
}

function checkGitBranchMerged(ctx: CheckCtx): boolean {
  try {
    const merged = execSync('git branch --merged HEAD', {
      cwd: ctx.projectRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    return merged.includes(ctx.changeName)
  } catch {
    return false
  }
}
```

- [ ] **步骤 4：添加新的 isStepDone 分派函数**

```typescript
function isStepDone(ctx: CheckCtx, step: WorkflowStep): boolean {
  const check = step.check
  if (!check || !check.type) return false

  switch (check.type) {
    case 'none':
      return true
    case 'file-exists':
      return checkFileExists(ctx, check.path!)
    case 'dir-has-md':
      return checkDirHasMd(ctx, check.path!)
    case 'tasks-all-checked':
      return checkTasksAllChecked(ctx, check.path!)
    case 'markdown-section-done':
      return checkMarkdownSection(ctx, check.path!, check.section!)
    case 'git-worktree-exists':
      return checkGitWorktree(ctx)
    case 'archive-exists':
      return checkArchiveExists(ctx)
    case 'git-branch-merged':
      return checkGitBranchMerged(ctx)
    default:
      return false
  }
}
```

- [ ] **步骤 5：Commit**

```bash
git add src/core/dashboard/change-scanner.ts
git commit -m "refactor: replace STEP_FILE_CHECKS with config-driven check dispatch"
```

---

### 任务 4：更新 computeStepStatuses 和 getChangeDetail 的调用

**文件：**
- 修改：`src/core/dashboard/change-scanner.ts`

- [ ] **步骤 1：重写 computeStepStatuses**

将 `computeStepStatuses` 签名从接收 `stepIds: string[]` 改为接收 `steps: WorkflowStep[]`，内部用 `isStepDone(ctx, step)` 替代 `isStepDone(changeDir, stepId)`：

```typescript
export function computeStepStatuses(
  changeDir: string,
  steps: WorkflowStep[]
): Record<string, 'done' | 'active' | 'pending'> {
  const changeName = basename(changeDir)
  const projectRoot = dirname(dirname(dirname(changeDir)))
  const ctx: CheckCtx = { changeDir, changeName, projectRoot }

  let foundActive = false
  const result: Record<string, 'done' | 'active' | 'pending'> = {}

  for (const step of steps) {
    const done = isStepDone(ctx, step)

    if (done) {
      result[step.id] = 'done'
    } else if (!foundActive) {
      result[step.id] = 'active'
      foundActive = true
    } else {
      result[step.id] = 'pending'
    }
  }

  return result
}
```

- [ ] **步骤 2：更新 getChangeDetail 中的调用**

在 `getChangeDetail` 函数中，将 stepIds 相关逻辑改为使用 `flattenSteps` 和 `WorkflowStep[]`：

将：
```typescript
  let workflowError: string | undefined
  let stepIds: string[]
  if (workflow) {
    stepIds = flattenStepIds(workflow)
  } else {
    workflowError = `tasks.yaml 中未找到 schema "${schema}" 对应的 workflow`
    stepIds = Object.keys(STEP_FILE_CHECKS)
  }
```

改为：
```typescript
  let workflowError: string | undefined
  let steps: WorkflowStep[]
  if (workflow) {
    steps = flattenSteps(workflow)
  } else {
    workflowError = `tasks.yaml 中未找到 schema "${schema}" 对应的 workflow`
    steps = []
  }
```

将 `const stepStatuses = computeStepStatuses(changeDir, stepIds)` 改为：
```typescript
  const stepStatuses = steps.length > 0 ? computeStepStatuses(changeDir, steps) : {}
```

- [ ] **步骤 3：编译检查**

```bash
npx tsc --noEmit
```

预期：无类型错误。

- [ ] **步骤 4：Commit**

```bash
git add src/core/dashboard/change-scanner.ts
git commit -m "refactor: wire config-driven checks into computeStepStatuses and getChangeDetail"
```

---

### 任务 5：更新测试

**文件：**
- 修改：`tests/unit/change-scanner.test.ts`

- [ ] **步骤 1：更新 import**

将 import 中的 `flattenStepIds` 改为 `flattenSteps`：
```typescript
import { flattenSteps, getWorkflowBySchema } from '../../src/core/dashboard/api/workflow.js'
```

- [ ] **步骤 2：更新现有测试 — `proposal.md 存在时 create/proposal 为 done`**

将 `flattenStepIds` + `computeStepStatuses(changeDir, stepIds)` 改为 `flattenSteps` + `computeStepStatuses(changeDir, steps)`：

```typescript
  it('proposal.md 存在时 create/proposal 为 done，首个未完成步骤为 active', () => {
    createChange('in-progress', {
      '.openspec.yaml': 'schema: polaris-flow-backend\n',
      'proposal.md': '# Proposal',
    })
    const changeDir = join(testDir, 'openspec/changes/in-progress')
    const workflow = getWorkflowBySchema('polaris-flow-backend')!
    const steps = flattenSteps(workflow)
    const statuses = computeStepStatuses(changeDir, steps)
    expect(statuses.create).toBe('done')
    expect(statuses.brainstorm).toBe('active')
    expect(statuses.proposal).toBe('done')
    expect(statuses.specs).toBe('pending')
  })
```

- [ ] **步骤 3：修复测试预期值**

第 185 行期望 `'提案准备'`，`config/tasks.yaml` 中实际是 `'准备提案'`。修复期望值：

```typescript
    expect(detail.workflow!.groups[0]!.name).toBe('准备提案')
```

- [ ] **步骤 4：添加 check 类型测试**

```typescript
describe('computeStepStatuses with check types', () => {
  it('file-exists: 文件存在时标记为 done', () => {
    createChange('test', { 'brainstorm.md': '# Brainstorm' })
    const changeDir = join(testDir, 'openspec/changes/test')
    const steps = [
      { id: 'create', name: '创建', description: '', check: { type: 'none' } },
      { id: 'brainstorm', name: '头脑风暴', description: '', check: { type: 'file-exists', path: 'brainstorm.md' } },
    ]
    const statuses = computeStepStatuses(changeDir, steps)
    expect(statuses.create).toBe('done')
    expect(statuses.brainstorm).toBe('done')
  })

  it('file-exists: 文件不存在时第一个未完成标记为 active', () => {
    createChange('test', {})
    const changeDir = join(testDir, 'openspec/changes/test')
    const steps = [
      { id: 'create', name: '创建', description: '', check: { type: 'none' } },
      { id: 'brainstorm', name: '头脑风暴', description: '', check: { type: 'file-exists', path: 'brainstorm.md' } },
    ]
    const statuses = computeStepStatuses(changeDir, steps)
    expect(statuses.create).toBe('done')
    expect(statuses.brainstorm).toBe('active')
  })

  it('dir-has-md: specs 目录有 md 文件时标记为 done', () => {
    createChange('test', { 'specs/auth/spec.md': '# Spec' })
    const changeDir = join(testDir, 'openspec/changes/test')
    const steps = [
      { id: 'specs', name: '编写规范', description: '', check: { type: 'dir-has-md', path: 'specs' } },
    ]
    const statuses = computeStepStatuses(changeDir, steps)
    expect(statuses.specs).toBe('done')
  })

  it('tasks-all-checked: 所有任务勾选时标记为 done', () => {
    createChange('test', { 'tasks.md': '- [x] Task 1\n- [x] Task 2\n' })
    const changeDir = join(testDir, 'openspec/changes/test')
    const steps = [
      { id: 'executor', name: '实施', description: '', check: { type: 'tasks-all-checked', path: 'tasks.md' } },
    ]
    const statuses = computeStepStatuses(changeDir, steps)
    expect(statuses.executor).toBe('done')
  })

  it('tasks-all-checked: 有未完成任务时标记为 pending', () => {
    createChange('test', { 'tasks.md': '- [x] Task 1\n- [ ] Task 2\n' })
    const changeDir = join(testDir, 'openspec/changes/test')
    const steps = [
      { id: 'executor', name: '实施', description: '', check: { type: 'tasks-all-checked', path: 'tasks.md' } },
    ]
    const statuses = computeStepStatuses(changeDir, steps)
    expect(statuses.executor).toBe('active')
  })

  it('markdown-section-done: section 下所有 checkbox 勾选时完成', () => {
    createChange('test', { 'plan.md': '## Final verification\n- [x] Check 1\n- [x] Check 2\n' })
    const changeDir = join(testDir, 'openspec/changes/test')
    const steps = [
      { id: 'cr', name: '代码审查', description: '', check: { type: 'markdown-section-done', path: 'plan.md', section: 'Final verification' } },
    ]
    const statuses = computeStepStatuses(changeDir, steps)
    expect(statuses.cr).toBe('done')
  })

  it('archive-exists: archive 目录存在时完成', () => {
    const archiveDir = join(testDir, 'openspec', 'changes', 'archive')
    mkdirSync(archiveDir, { recursive: true })
    mkdirSync(join(archiveDir, '2026-06-01-test-change'))
    const changeDir = join(testDir, 'openspec', 'changes', 'test-change')
    mkdirSync(changeDir, { recursive: true })
    const steps = [
      { id: 'archrive', name: '归档', description: '', check: { type: 'archive-exists' } },
    ]
    const statuses = computeStepStatuses(changeDir, steps)
    expect(statuses.archrive).toBe('done')
  })

  it('无 check 字段的步骤视为 pending', () => {
    createChange('test', {})
    const changeDir = join(testDir, 'openspec/changes/test')
    const steps = [
      { id: 'manual', name: '手动', description: '' },
    ]
    const statuses = computeStepStatuses(changeDir, steps)
    expect(statuses.manual).toBe('active')
  })

  it('未知 check type 视为 pending', () => {
    createChange('test', {})
    const changeDir = join(testDir, 'openspec/changes/test')
    const steps = [
      { id: 'unknown', name: '未知', description: '', check: { type: 'unknown-type' } },
    ]
    const statuses = computeStepStatuses(changeDir, steps)
    expect(statuses.unknown).toBe('active')
  })
})
```

- [ ] **步骤 5：运行测试**

```bash
npx vitest run tests/unit/change-scanner.test.ts
```

预期：所有测试通过（原有 19 个 + 新增 9 个）。

- [ ] **步骤 6：Commit**

```bash
git add tests/unit/change-scanner.test.ts
git commit -m "test: update tests for config-driven check dispatch"
```

---

### 任务 6：构建和完整验证

- [ ] **步骤 1：完整构建**

```bash
npm run build
```

预期：TypeScript 编译成功。

- [ ] **步骤 2：运行全量测试**

```bash
npx vitest run
```

预期：无新增失败。dashboard 相关 28 个测试全通过。

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "chore: build verification after config-driven check refactor"
```
