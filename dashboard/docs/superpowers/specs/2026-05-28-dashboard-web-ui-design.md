# Dashboard Web UI Design

`polaris dashboard` — 启动本地 Web 服务，在浏览器中管理 OpenSpec 工作流。

## 目标

为 OpenSpec 的 SDD 工作流提供可视化 Web 界面，覆盖日常操作：查看任务状态、编辑配置、创建新 change。

## 非目标（Phase 2）

- PTY 终端（xterm + ghostty-web）
- 动态/静态模式搜索
- 静态快照导出

---

## 架构

```
src/
├── commands/dashboard.ts          # polaris dashboard 命令入口
├── core/dashboard/
│   ├── server.ts                  # HTTP server (Node.js http 模块)
│   ├── router.ts                  # 路由分发 (页面 + API)
│   ├── pages/
│   │   ├── layout.ts              # 共享 HTML 布局 (顶栏 Tab)
│   │   ├── board.ts               # 看板页
│   │   ├── change-detail.ts       # change 详情页
│   │   ├── config-editor.ts       # Config/Schema 编辑页
│   │   └── compose.ts             # Compose 面板
│   ├── api/
│   │   ├── changes.ts             # /api/changes 端点
│   │   ├── configs.ts             # /api/configs 端点
│   │   └── compose.ts             # /api/compose 端点
│   └── static/
│       ├── app.css
│       └── app.js                 # 页内交互 (~200行)
```

- Node.js 原生 `http` 模块，零新依赖
- 页面由 TypeScript 函数生成 HTML 字符串
- 共享 `src/schema/`、`src/utils/` 现有模块
- 默认端口 `3700`，`--port` 可指定

---

## 导航

顶栏 Tab：**看板** | **Config** | **Compose**
(搜索为 Phase 2)

---

## 页面与功能

### 1. 看板页 (`/`)

**统计卡片**（顶部 4 个）：
- 总 Changes 数
- 已完成 Tasks 数
- 待处理 Tasks 数
- 进行中 Changes 数

**视图切换**：列表视图（默认）↔ Kanban 视图

**列表视图**：每行一个 change，显示名称、当前阶段、tasks 进度条、最近修改时间。点击进入详情页。

**Kanban 视图**：列 = Proposal | Specs | Design | Tasks | Done。change 作为卡片按状态自动归列。

**数据来源**：读取 `openspec/changes/` 目录结构 + 解析 `tasks.md` checkbox。

### 2. Change 详情页 (`/change/:name`)

**左侧文档树**（可折叠）：proposal.md → specs/ → tech-design.md → db-design.md → rest-api-design.md → testcase-design.md → tasks.md → plan.md

**右侧内容区**：选中文档的 Markdown 渲染（基础正则渲染，无额外依赖；标题、列表、代码块、链接）。tasks.md 特殊展示 checkbox 列表 + 完成率。

**顶部操作栏**：[编辑] [标记完成] [Apply]

### 3. Config/Schema 编辑页 (`/config`, `/config/:path*`)

**左侧文件列表**：polaris.yaml、schemas/*/schema.yaml、schemas/*/templates/*.md

**右侧编辑器**：`<textarea>` 文本编辑 + 保存 + YAML 格式校验

### 4. Compose 面板 (`/compose`)

单页表单，字段映射 proposal.md 章节：

| 表单字段 | proposal.md 章节 |
|---|---|
| Change 名称 (kebab-case) | 目录名 |
| Schema 选择 | schema 模板 |
| 业务背景 | 1. 业务背景 |
| 目标 | 2. 目标 |
| 变更范围（新增/修改/删除） | 3. 范围 |
| 验收标准 | 4. 验收标准 |
| 排除范围 | 3.2 明确排除的范围 |

提交后创建目录结构 → 生成 proposal.md → 跳转详情页。

---

## API 端点

```
GET  /api/changes                    # 所有 changes 列表及状态
GET  /api/changes/:name              # 单个 change 详情
GET  /api/changes/:name/tasks        # tasks.md 结构化数据
POST /api/changes/:name/tasks/:id    # 切换 task checkbox 状态（id = 0-based checkbox 序号）
GET  /api/configs                    # 配置文件列表
GET  /api/configs/:path*             # 读取配置文件内容
PUT  /api/configs/:path*             # 保存配置文件
POST /api/configs/:path*/validate    # 校验 YAML 格式
POST /api/compose                    # 创建新 change
GET  /api/schemas                    # 可用 schema 列表
```

## 页面路由

```
GET  /                               # board.ts
GET  /change/:name                   # change-detail.ts
GET  /config                         # config-editor.ts (文件列表)
GET  /config/:path*                  # config-editor.ts (编辑模式)
GET  /compose                        # compose.ts
```

---

## 前端 JS

- 页面间通过 `<a>` 链接切换（SSR 风格）
- 页内交互：列表↔Kanban 切换、文档树折叠、表单提交（fetch）、编辑保存（fetch）、task checkbox 切换（fetch）
- 无前端路由，每页独立 HTML

---

## 数据流

1. 用户访问 `/` → router → board.ts 读取 `openspec/changes/` → 生成 HTML → 返回
2. 用户点击 change → `/change/:name` → change-detail.ts 读取对应目录 → 渲染文档列表
3. 用户编辑 config → 前端 fetch PUT `/api/configs/:path` → 后端写文件系统
4. 用户提交 compose → 前端 fetch POST `/api/compose` → 后端创建目录 + 写 proposal.md → 返回 redirect URL

---

## 测试策略

- **单元测试**：API 端点（mock 文件系统）、页面生成函数（验证 HTML 结构）、tasks.md 解析逻辑
- **集成测试**：server 启动 + HTTP 请求 + 真实 tmpdir 中的 openspec/ 目录结构
- 不做浏览器 E2E 测试

---

## CLI 接口

```bash
polaris dashboard              # 启动 server，默认 :3700
polaris dashboard --port 8080  # 指定端口
polaris dashboard --open       # 自动打开浏览器
```
