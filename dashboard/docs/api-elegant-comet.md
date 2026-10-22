# Polaris Dashboard API 接口文档

Polaris Dashboard 是一个纯 API 服务器，为 Polaris Web 前端提供 RESTful 接口。

基础路径：`http://localhost:3700`

所有 API 响应均为 JSON 格式。非 API 路径的请求返回 API 服务器状态信息。

---

## 目录

- [通用说明](#通用说明)
- [Changes](#changes)
- [Configs](#configs)
- [Compose](#compose)
- [Projects](#projects)
- [Workflow](#workflow)
- [检查与工具](#检查与工具)

---

## 通用说明

### 多项目支持

多数接口支持 `?project=` 查询参数指定目标项目路径。不传则使用当前工作目录作为项目根目录。

### 响应格式

- 成功：HTTP 200 + JSON body
- API 不存在：HTTP 404 + `{ "error": "API not found" }`
- 服务端错误：HTTP 500 + `{ "error": "..." }`

---

## Changes

### `GET /api/changes`

返回变更列表及统计信息。

**参数**

| 参数 | 位置 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `filter` | query | `active \| all \| archived` | `active` | 过滤条件 |
| `project` | query | string | - | 项目根目录路径 |

**响应**

```json
{
  "tasks": [
    {
      "name": "add-auth",
      "phase": "proposal",
      "summary": "",
      "created": "2026-06-01",
      "labels": [],
      "currentGroup": "准备提案",
      "schema": "polaris-flow-backend",
      "workflowName": "后端开发",
      "workflowShortName": "后端",
      "tasksTotal": 3,
      "tasksDone": 1,
      "stepsDone": 2,
      "stepsTotal": 17,
      "mtime": "2026-06-10T12:00:00.000Z"
    }
  ],
  "counts": {
    "active": 3,
    "archived": 1
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `tasks` | array | 变更列表 |
| `tasks[].name` | string | 变更名称（目录名） |
| `tasks[].phase` | string | 当前阶段：`proposal` / `specs` / `design` / `tasks` / `done` / `archived` |
| `tasks[].currentGroup` | string | 当前所在步骤组名称 |
| `tasks[].schema` | string | 关联的 workflow ID |
| `tasks[].workflowName` | string | workflow 名称（`canonical` 或 `name`） |
| `tasks[].workflowShortName` | string | workflow 简称（`canonical`） |
| `tasks[].tasksTotal` | number | 任务总数 |
| `tasks[].tasksDone` | number | 已完成任务数 |
| `tasks[].stepsDone` | number | 已完成步骤数 |
| `tasks[].stepsTotal` | number | 步骤总数 |
| `counts.active` | number | 活跃变更数 |
| `counts.archived` | number | 已归档变更数 |

---

### `GET /api/changes/:name`

返回单个变更的完整详情。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | string | 变更名称 |

**查询参数**

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `project` | query | string | 项目根目录路径 |

**响应**

```json
{
  "name": "add-auth",
  "phase": "proposal",
  "schema": "polaris-flow-backend",
  "summary": "",
  "created": "2026-06-01",
  "labels": [],
  "currentGroup": "准备提案",
  "workflow": { "id": "polaris-flow-backend", "name": "后端开发", "groups": [...] },
  "tasksTotal": 3,
  "tasksDone": 1,
  "stepsDone": 2,
  "stepsTotal": 17,
  "mtime": "2026-06-10T12:00:00.000Z",
  "files": [
    { "name": "proposal.md", "path": "proposal.md", "content": "# Proposal: ..." },
    { "name": "specs/user-auth/spec.md", "path": "specs/user-auth/spec.md", "content": "# Spec" }
  ],
  "specs": [
    { "name": "specs/user-auth/spec.md", "path": "specs/user-auth/spec.md", "content": "# Spec" }
  ],
  "stepStatuses": {
    "create": "done",
    "brainstorm": "active",
    "proposal": "done",
    "specs": "pending"
  },
  "artifactStatuses": {
    "create:0": true,
    "brainstorm:0": false,
    "brainstorm:1": true
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 变更名称 |
| `phase` | string | 当前阶段 |
| `schema` | string | workflow ID |
| `workflow` | object \| null | 完整的 workflow 定义（含 groups、steps、generated） |
| `workflowError` | string? | workflow 加载失败时的错误信息 |
| `currentGroup` | string | 当前步骤组名称 |
| `tasksTotal` | number | 任务总数 |
| `tasksDone` | number | 已完成任务数 |
| `stepsDone` | number | 已完成步骤数 |
| `stepsTotal` | number | 步骤总数 |
| `files` | array | 变更目录下的文件列表（含内容） |
| `specs` | array | specs/ 目录下的规范文件列表（含内容） |
| `stepStatuses` | object | 每步骤状态：`done` / `active` / `pending` / `not_executed` |
| `artifactStatuses` | object | 每产出物状态（key 格式 `stepId:index`）：`true` / `false` |

---

### `POST /api/changes/:name/tasks/:id`

切换 tasks.md 中指定 checkbox 的勾选状态。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | string | 变更名称 |
| `id` | number | checkbox 序号（0-based） |

**查询参数**

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `project` | query | string | 项目根目录路径 |

**响应**

```json
{ "ok": true, "index": 0 }
```

---

### `POST /api/changes/:name/validate`

对指定变更执行 `openspec validate <name> --type change --json` 结构校验（仅当前变更，服务端子进程）。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | string | 变更名称 |

**查询参数**

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `project` | query | string | 项目根目录路径 |

**响应**

```json
{
  "ok": true,
  "changeName": "add-auth",
  "valid": false,
  "items": [
    {
      "id": "add-auth",
      "type": "change",
      "valid": false,
      "issues": [
        { "level": "ERROR", "path": "file", "message": "..." }
      ]
    }
  ],
  "summary": {
    "totals": { "items": 1, "passed": 0, "failed": 1 }
  },
  "exitCode": 1
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `ok` | boolean | 命令执行成功（含校验未通过的情况） |
| `changeName` | string | 变更名称 |
| `valid` | boolean | 该校验项是否全部通过 |
| `items` | array | 仅包含目标变更的校验项（后端会过滤掉 openspec 可能附带的其他项） |
| `items[].issues` | array | 未通过时的具体问题 |
| `summary` | object | 汇总统计 |
| `exitCode` | number | openspec 进程退出码（未通过时常为 1） |

**错误响应**

```json
{ "error": "Change \"missing\" not found" }
```

---

## Configs

### `GET /api/configs`

列出项目配置文件。

**查询参数**

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `project` | query | string | 项目根目录路径 |

**响应**

```json
[
  { "path": "openspec/polaris.yaml", "name": "polaris.yaml", "mtime": "2026-06-01T00:00:00.000Z" },
  { "path": "openspec/schemas/polaris-flow-backend/check.yaml", "name": "check.yaml", "mtime": "..." }
]
```

---

### `GET /api/configs/:path*`

读取配置文件内容。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | string | 相对于项目根目录的文件路径 |

**查询参数**

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `project` | query | string | 项目根目录路径 |

**响应**

```json
{
  "path": "openspec/polaris.yaml",
  "content": "schema: polaris-flow-backend\n",
  "syntax": "yaml"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string | 文件路径 |
| `content` | string | 文件内容 |
| `syntax` | string | 语法类型：`yaml` / `markdown` |

---

### `PUT /api/configs/:path*`

保存配置文件内容。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | string | 相对于项目根目录的文件路径 |

**查询参数**

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `project` | query | string | 项目根目录路径 |

**请求体**

纯文本（YAML 或 Markdown 内容）。

**响应**

```json
{ "ok": true, "path": "openspec/polaris.yaml" }
```

---

## Compose

### `POST /api/compose`

创建新变更（生成 `proposal.md` 和 `.openspec.yaml`）。

**查询参数**

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `project` | query | string | 项目根目录路径 |

**请求体**

```json
{
  "name": "add-export",
  "schema": "polaris-flow-backend",
  "background": "用户需要导出功能",
  "businessGoals": "支持 CSV 导出",
  "techGoals": "实现导出 API",
  "scopeAdd": "data-export",
  "scopeModify": "",
  "scopeRemove": "",
  "acceptance": "用户可下载 CSV",
  "exclusions": "PDF 导出"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 变更名称，kebab-case 格式（`[a-z0-9]+(-[a-z0-9]+)*`） |
| `schema` | string | 否 | workflow ID，默认 `polaris-flow-backend` |
| `background` | string | 否 | 业务背景 |
| `businessGoals` | string | 否 | 业务目标 |
| `techGoals` | string | 否 | 技术目标 |
| `scopeAdd` | string | 否 | 新增功能（每行一个） |
| `scopeModify` | string | 否 | 修改功能（每行一个） |
| `scopeRemove` | string | 否 | 删除功能（每行一个） |
| `acceptance` | string | 否 | 验收标准 |
| `exclusions` | string | 否 | 明确排除的范围 |

**成功响应**

```json
{ "ok": true, "name": "add-export", "redirect": "/change/add-export" }
```

**错误响应**

```json
{ "error": "Invalid change name (kebab-case required)" }
```

---

### `GET /api/schemas`

列出可用的 schema（workflow）列表。

**查询参数**

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `project` | query | string | 项目根目录路径 |

**响应**

```json
["polaris-flow-backend"]
```

返回 `openspec/schemas/` 下的目录名称。

---

## Projects

多项目管理，数据持久化存储在 `~/.polaris/projects.json`。

### `GET /api/projects`

列出所有项目。

**响应**

```json
{
  "projects": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "示例项目",
      "path": "/Users/me/my-project",
      "createdAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "defaultProjectId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `projects` | array | 项目列表 |
| `projects[].id` | string | UUID |
| `projects[].name` | string | 项目别名 |
| `projects[].path` | string | 项目根目录绝对路径 |
| `defaultProjectId` | string \| null | 默认项目 ID |

---

### `POST /api/projects`

添加项目。

**请求体**

```json
{
  "name": "示例项目",
  "path": "/Users/me/my-project"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 项目别名 |
| `path` | string | 是 | 项目根目录绝对路径（需存在） |

**成功响应**

```json
{
  "project": {
    "id": "550e8400-...",
    "name": "示例项目",
    "path": "/Users/me/my-project",
    "createdAt": "2026-06-10T00:00:00.000Z"
  }
}
```

**错误响应**

```json
{ "error": "目录不存在: /path/to/project" }
```

---

### `DELETE /api/projects`
e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e
删除项目。支持两种方式：

**方式一：查询参数**e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e'e

```
DELETE /api/projects?id=550e8400-...
```

**方式二：请求体**

```json
{ "id": "550e8400-..." }
```

**成功响应**

```json
{ "ok": true }
```

---

### `PUT /api/projects/default`

设置默认项目。

**请求体**

```json
{ "id": "550e8400-..." }
```

**响应**

```json
{ "ok": true, "defaultProjectId": "550e8400-..." }
```

---

### `GET /api/stats`

所有项目的聚合任务统计。

**响应**

```json
{
  "totalTasks": 25,
  "doneTasks": 18,
  "pendingTasks": 7
}
```

---

## Workflow

### `GET /api/workflow`

返回所有 workflow 定义列表。

**响应**

```json
{
  "workflows": [
    {
      "id": "polaris-flow-backend",
      "name": "后端开发",
      "canonical": "后端",
      "description": "后端开发工作流，包括需求分析、设计、编码、测试、部署等阶段",
      "phases": [
        { "code": "prepare", "name": "准备", "nextStep": "proposal" },
        { "code": "proposal", "name": "提案", "nextStep": "specs" }
      ],
      "groups": [
        {
          "name": "准备提案",
          "steps": [
            {
              "id": "create",
              "name": "创建变更",
              "description": "创建变更",
              "generated": [
                {
                  "file": "explore-brief.md",
                  "name": "探索简报",
                  "description": "探索需求背景，明确变更目标，并生成探索简报",
                  "artifact": "prepare",
                  "check": "file-exists"
                }
              ],
              "operations": [
                { "code": "continue", "name": "继续", "target": "brainstorm" },
                { "code": "review", "name": "评审" },
                { "code": "optimize", "name": "优化" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

---

### `GET /api/workflow/:id/phases`

返回指定 workflow 的阶段定义。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | string | workflow ID |

**响应**

```json
{
  "workflowId": "polaris-flow-backend",
  "workflowName": "后端开发",
  "phases": [
    { "code": "prepare", "name": "准备", "nextStep": "proposal" },
    { "code": "proposal", "name": "提案", "nextStep": "specs" },
    { "code": "specs", "name": "规范", "nextStep": "design" },
    { "code": "design", "name": "设计", "nextStep": "tasks" },
    { "code": "tasks", "name": "任务", "nextStep": "apply" },
    { "code": "apply", "name": "实施", "nextStep": "archive" },
    { "code": "archive", "name": "复盘", "nextStep": "completion" },
    { "code": "completion", "name": "完成", "nextStep": "none" }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `workflowId` | string | workflow ID |
| `workflowName` | string | workflow 名称 |
| `phases` | array | 阶段定义列表，按 workflow 定义顺序 |
| `phases[].code` | string | 阶段编码 |
| `phases[].name` | string | 阶段名称 |
| `phases[].nextStep` | string? | 下一阶段的 code，`"none"` 表示无下一阶段（末尾阶段） |

---

### `GET /api/workflow/:id/steps/:stepId/operations`

返回指定步骤的可执行操作列表。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | string | workflow ID |
| `stepId` | string | 步骤 ID |

**响应**

```json
[
  { "code": "continue", "name": "继续", "target": "brainstorm" },
  { "code": "review", "name": "评审" },
  { "code": "optimize", "name": "优化" }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `[].code` | string | 操作编码 |
| `[].name` | string | 操作显示名称 |
| `[].target` | string? | 操作的目标步骤 ID；无 target 表示停留在当前步骤 |

---

### `GET /api/workflow/:id/artifacts`

按产物阶段分组返回指定 workflow 的产出物信息。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | string | workflow ID |

**响应**

```json
{
  "workflowId": "polaris-flow-backend",
  "workflowName": "后端开发",
  "phases": [
    {
      "code": "prepare",
      "name": "准备",
      "artifacts": [
        {
          "stepId": "create",
          "file": "explore-brief.md",
          "name": "探索简报",
          "description": "探索需求背景，明确变更目标，并生成探索简报",
          "check": "file-exists"
        },
        {
          "stepId": "brainstorm",
          "file": "brainstorm.md",
          "name": "探索结论",
          "description": "结合探索简报，用头脑风暴的方式，生成的探索结论",
          "check": "file-exists"
        },
        {
          "stepId": "brainstorm",
          "file": "review-log.md",
          "name": "方案评审日志",
          "description": "记录方案评审过程，包括评审意见、评审结论等",
          "check": "none"
        }
      ]
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `workflowId` | string | workflow ID |
| `workflowName` | string | workflow 名称 |
| `phases` | array | 按阶段分组的产出物列表 |
| `phases[].code` | string | 阶段编码 |
| `phases[].name` | string | 阶段名称 |
| `phases[].artifacts` | array | 该阶段的产出物列表 |
| `artifacts[].stepId` | string | 所属步骤 ID |
| `artifacts[].file` | string? | 产出文件路径（无文件时省略） |
| `artifacts[].name` | string | 产出物名称 |
| `artifacts[].description` | string | 产出物描述 |
| `artifacts[].check` | string | 验证方式：`file-exists` / `none` / `dir-has-md` / `tasks-all-checked` / `markdown-section-done` / `git-worktree-exists` / `archive-exists` / `git-branch-merged` |

---

## 检查与工具

### `GET /api/check`

运行项目环境检查。

**查询参数**

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `project` | query | string | 项目根目录路径 |

**响应**

```json
{
  "checks": [
    { "name": ".polaris 目录", "status": "ok", "description": ".polaris 目录存在" },
    { "name": "polaris.meta.yaml", "status": "ok", "description": "项目元数据文件存在" },
    { "name": "polaris.record.yaml", "status": "warn", "description": "安装记录文件不存在（可能尚未执行安装）" },
    { "name": "openspec 目录", "status": "ok", "description": "openspec 目录存在" },
    { "name": "polaris.yaml", "status": "warn", "description": "项目配置文件不存在" }
  ],
  "summary": { "ok": 3, "warn": 2, "error": 0 }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `checks[].name` | string | 检查项名称 |
| `checks[].status` | string | 状态：`ok` / `warn` / `error` |
| `checks[].description` | string | 检查结果描述 |
| `summary.ok` | number | 通过数 |
| `summary.warn` | number | 警告数 |
| `summary.error` | number | 错误数 |

---

### `GET /api/dirs`

列出目录内容（用于项目路径浏览）。

**查询参数**

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `path` | query | string | 是 | 父目录路径 |

**响应**

```json
{
  "dirs": [
    { "name": "my-project", "path": "/Users/me/my-project" },
    { "name": "another-project", "path": "/Users/me/another-project" }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `dirs` | array | 子目录列表（过滤隐藏目录，按名称排序） |

---

### `GET /api/check-openspec`

检查路径下是否包含 `openspec/` 目录。

**查询参数**

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `path` | query | string | 是 | 待检查路径 |

**响应**

```json
{ "exists": true }
```

---

### `POST /api/reveal`

在系统文件管理器中打开路径。

**请求体**

```json
{ "path": "/Users/me/my-project/openspec/changes/add-auth" }
```

**响应**

```json
{ "ok": true }
```

打开路径需在允许的根目录范围内（当前项目路径 + 已注册项目的路径）。

---
