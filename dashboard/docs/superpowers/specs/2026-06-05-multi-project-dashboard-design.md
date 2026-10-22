# Multi-Project Dashboard 设计规格

## 1. 概述

将现有单项目仪表盘改造为支持多项目管理的 SPA 仪表盘，新增首页仪表台、项目管理和环境检测页面，重构导航结构为顶部导航栏 + 内容区 + 底部状态栏布局。

## 2. 架构

### 2.1 SPA 路由（hash-based）

| 哈希路由 | 页面 | 说明 |
|---------|------|------|
| `#/home` | 首页仪表台 | 汇总统计卡片 |
| `#/projects` | 项目管理 | 项目 CRUD |
| `#/tasks` | 任务管理 | 任务列表 + 详情（需选中项目） |
| `#/config` | 配置管理 | 沿用现有功能 |
| `#/check` | 环境检测 | 新增诊断页 |

默认路由 `/` 重定向到 `#/home`。

### 2.2 服务端改造

- 所有非 `/api/`、非 `/static/` 请求统一返回 `index.html`
- `index.html` 加载 Vue 3 CDN + `app.js`，由客户端接管路由
- API 路由保持不变

### 2.3 项目数据存储

中心化配置文件 `~/.polaris/projects.json`：

```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "项目别名",
      "path": "/absolute/path/to/project",
      "createdAt": "ISO timestamp"
    }
  ]
}
```

API：
- `GET /api/projects` — 列出所有项目
- `POST /api/projects` — 添加项目 `{ name, path }`
- `DELETE /api/projects/:id` — 删除项目

当前选中项目通过客户端状态管理，不在 URL 中体现。

## 3. 布局结构

```
┌──────────────────────────────────────────────────────┐
│  TopNavbar                                           │
│  [Logo] [项目切换▼]         首页 项目 配置 检测       │
├──────────────────────────────────────────────────────┤
│                                                      │
│                  主内容区 (#app-main)                  │
│        (根据 hash 路由切换渲染不同页面组件)            │
│                                                      │
├──────────────────────────────────────────────────────┤
│  BottomStatusBar (预留，暂无内容)                      │
└──────────────────────────────────────────────────────┘
```

### 3.1 顶部导航栏 (TopNavbar)

- **左侧**：Logo 文字 `>_ polaris`，品牌色，JetBrains Mono 字体
- **项目切换区**：下拉选择框 `<select>`，列出所有项目别名，切换后更新全局 currentProject 状态
- **右侧**：导航按钮组（首页、项目、配置、检测），`<a href="#/home">` 等形式
- 按钮 hover 时背景加深（`--primary-hover`），transition 0.15s
- 当前活跃路由对应的按钮高亮（active 态）

### 3.2 底部状态栏 (BottomStatusBar)

- 高度约 32px，背景 `--bg-sidebar`，上边框 `1px solid var(--border)`
- 内容分为左中右三区，目前均为空白占位
- 后续规划：左侧提示文字、中间系统参数、右侧 Open Code Server 按钮

## 4. 页面详细设计

### 4.1 首页仪表台 (`#/home`)

4 个统计卡片横向排列，使用现有 StatCard 组件样式：

| 卡片 | 统计项 | 数据来源 |
|------|--------|---------|
| 项目总数 | 已注册项目数量 | `/api/projects` |
| 任务总数 | 所有项目的 changes 总数 | 遍历 `/api/changes` |
| 待处理 | 状态非 done 的 changes 数量 | 同上过滤 |
| 已完成 | 状态为 done 的 changes 数量 | 同上过滤 |

布局：`stats-grid`（4 列 grid），卡片居中显示数值和标签。

### 4.2 项目管理 (`#/projects`)

**项目列表**：表格形式展示所有项目

```
┌─────────────────────────────────────────────────────┐
│  项目管理                              [+ 添加项目]  │
├──────────┬──────────┬──────────────────┬────────────┤
│  别名     │ 路径      │ 创建时间           │ 操作       │
├──────────┼──────────┼──────────────────┼────────────┤
│  项目A    │ /path/a   │ 2026-06-05 10:00 │ 删除 跳转  │
│  项目B    │ /path/b   │ 2026-06-05 11:00 │ 删除 跳转  │
└──────────┴──────────┴──────────────────┴────────────┘
```

**添加项目弹窗/表单**：
- 项目路径（必填，绝对路径）
- 项目别名（必填，用于列表显示）
- 确认按钮 + 取消按钮

**删除**：点击删除按钮，弹出确认对话框后执行删除。

**跳转**：点击跳转切换到该项目的任务管理页 (`#/tasks`)。

### 4.3 任务管理 (`#/tasks`)

需先选中项目，否则显示"请先在顶部选择项目"的空状态提示。

选中项目后，采用**左右两栏布局**：

#### 4.3.1 左侧任务列表

- 宽度约 280px，背景 `--bg-sidebar`，右侧边框
- 顶部显示项目名称 + 任务数量
- 循环渲染任务卡片，每张卡片包含：
  - **名称**：任务名称（加粗，13px）
  - **标签**：使用 PhaseBadge 组件显示阶段
  - **描述**：简短描述文本（12px，`--text-secondary`）
  - **时间**：更新时间（11px，`--text-muted`）
  - **状态**：`Execution Complete` 绿底白字圆角标签（`--success` 背景）
- 点击任务卡片切换右侧详情内容，当前选中卡片 active 态高亮（border + glow）
- 复用现有 task-card 样式

#### 4.3.2 右侧主内容区

##### ① 流程步骤条

- 从当前任务数据中读取实际工作流阶段（动态数组）
- 横向排列，每个步骤包含：标签名 + 编号
- 已完成阶段：绿色边框高亮（`--success`）
- 当前阶段：蓝色边框（`--primary`）+ glow
- 未开始阶段：灰色（`--muted`）
- 点击步骤可切换选中态（高亮该步骤详情）

##### ② 当前阶段卡片

- 绿色标题 "Execution Completed"（`--success`）
- 说明文本（从任务数据中读取）
- 主操作按钮 + 标签

##### ③ 项目名称区

- 单行文本样式展示项目名称与本地路径
- 附带 "Files Complete" 标识

##### ④ QuickActions 按钮组

- 4 个功能按钮横向排布
- 样式：背景 `--muted`，hover 切换 `--primary`
- Delete 按钮：红色（`--error`），hover 加深

##### ⑤ 项目信息模块

- Session Title 大标题
- 仓库信息表格：仓库名称、路径、编辑权限、用途
- 下方展示「背景、问题」文本区块

### 4.4 配置管理 (`#/config`)

沿用现有配置管理功能（`/config` 页面），内容根据当前选中项目加载对应配置。

### 4.5 环境检测 (`#/check`)

新增页面，对当前选中项目执行 polaris 环境检测：

- 调用现有的 doctor 检查逻辑（`/api/check` 或复用 DoctorEngine）
- 显示问题清单：问题描述 + 严重程度 + 修复状态
- 每条问题提供修复按钮
- 整体状态摘要（通过/警告/错误数量）

## 5. 组件树

```
App
├── TopNavbar
│   ├── Logo
│   ├── ProjectSwitcher (select dropdown)
│   └── NavButtons (首页/项目/配置/检测)
├── MainContent (router-view)
│   ├── HomePage
│   │   └── StatCard ×4
│   ├── ProjectsPage
│   │   ├── ProjectTable
│   │   └── AddProjectModal
│   ├── TasksPage
│   │   ├── TaskListSidebar
│   │   │   └── TaskCard ×N
│   │   └── TaskDetail
│   │       ├── StepsBar
│   │       ├── StageCard
│   │       ├── ProjectNameBar
│   │       ├── QuickActions
│   │       └── ProjectInfo
│   ├── ConfigPage (沿用现有)
│   └── CheckPage (新增)
└── BottomStatusBar
```

## 6. 数据流

```
projects.json ──► /api/projects ──► App state.projects
                                      │
                    ┌─────────────────┤
                    ▼                 ▼
              ProjectSwitcher    HomePage (stats)
                    │
                    ▼
            state.currentProject
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    TasksPage   ConfigPage   CheckPage
        │
        ▼
  /api/changes?project=xxx
```

- 项目切换时，任务/配置/检测页面自动刷新数据
- 任务选中时，详情面板动态切换

## 7. 交互规范

- 所有按钮 hover 变色，transition: 0.15s ease
- 任务卡片 hover：border-color → primary + box-shadow glow
- 任务卡片 active/选中：持续高亮 border + 更强 glow
- 步骤条点击：切换选中态，对应阶段高亮
- 导航按钮 active 态：背景加深 + 左边框高亮
- 所有数据加载过程显示 Skeleton 骨架屏

## 8. 视觉设计

沿用 design.md 定义的设计系统：
- 深色科技风，Slate 底色 + blue-500 发光主调
- 色彩、字体、间距、动效规范均保持不变
- 新增组件遵循现有组件样式规范

## 9. 实施策略

1. **第一步**：改造服务端，index.html 统一入口 + SPA 路由
2. **第二步**：搭建 TopNavbar + BottomStatusBar 布局外壳
3. **第三步**：实现首页仪表台（HomePage）
4. **第四步**：实现项目管理页（ProjectsPage + API）
5. **第五步**：改造任务管理页为左右两栏布局（TasksPage）
6. **第六步**：迁移配置管理页到 SPA（ConfigPage）
7. **第七步**：新增环境检测页（CheckPage）
8. **第八步**：联动调试 + 边界处理

## 10. 技术约束

- 不使用构建工具（Vue 3 CDN 方式）
- 不引入额外 npm 依赖
- 所有路由为客户端 hash 路由
- 前后端代码均在 `src/core/dashboard/` 目录下
