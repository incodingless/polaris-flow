# Polaris 任务页面布局及交互规范

## 1. 页面概述

任务页面是 Polaris Dashboard 的核心页面，提供项目管理、任务列表浏览和任务详情查看功能。采用三层导航结构：顶部导航栏 + 项目标签栏 + 双层左侧侧边栏。

---

## 2. 外壳结构 (App Shell)

```
┌──────────────────────────────────────────────────────────┐
│  TopNavbar (48px, bg-sidebar)                             │
├──────────────────────────────────────────────────────────┤
│  ProjectTabsBar (36px, bg-sidebar, 底部边框, 仅任务页面)    │
├────────┬──────────┬───────────────────────────────────────┤
│Primary │Secondary │                                       │
│Sidebar │Sidebar   │  Content Area (flex: 1, bg)           │
│(64px)  │(280px)   │                                       │
│        │          │                                       │
├────────┴──────────┴───────────────────────────────────────┤
│  BottomStatusBar (32px, bg-sidebar, 顶部边框)              │
└──────────────────────────────────────────────────────────┘
```

- 外壳：`display: flex; flex-direction: column; height: 100vh; overflow: hidden`
- 顶部导航栏、项目标签栏、底部状态栏固定高度
- 中间主容器 `display: flex; flex: 1; overflow: hidden`

---

## 3. 顶部导航栏 (TopNavbar)

```
┌──────────────────────────────────────────────────────────┐
│ >_ polaris                                  首页 任务 设置 │
└──────────────────────────────────────────────────────────┘
```

| 区域 | 内容 | 说明 |
|------|------|------|
| 左侧 | Logo `>_ polaris` | 等宽字体，primary 色，14px / 700 |
| 中间 | 空 | 预留宽度，其他页面用于页面标题 |
| 右侧 | 导航按钮组 | 首页 / 任务 / 设置，`<a>` 标签风格按钮 |

**导航按钮交互：**
- 默认：透明背景，`color: var(--text-secondary)`
- hover：`background: var(--bg-hover)`，`transform: scale(1.02)`
- active：`background: var(--primary-bg)`，`border-color: var(--primary)`，`color: var(--primary-light)`，主色发光
- 过渡：`0.2s ease`（与 [ui-design-spec.md](ui-design-spec.md) 一致）

---

## 4. 项目标签栏 (ProjectTabsBar)

仅在任务页面显示，位于导航栏下方独立一行。

```
┌──────────────────────────────────────────────────────────┐
│ [polaris-cli ×] [backend-service ×] [legacy]  ◀ ▶  ⚙    │
└──────────────────────────────────────────────────────────┘
```

### 4.1 标签样式

| 状态 | 背景 | 边框 | 文字色 |
|------|------|------|--------|
| 默认 | transparent | 无 | `--text-helper` |
| hover | `var(--primary-hover-bg)` | 无 | `--text-primary` |
| active | `--bg-card` | `1px solid --border-normal`，底部边框同色掩盖 | `--text-primary` |
| deleted | transparent | 无 | `--text-helper`，opacity 0.5，禁用点击 |

### 4.2 激活标签底部外翻圆角

激活标签左右下角为**向外**的圆角，使用 `::before` / `::after` 伪元素 + `box-shadow` 实现：

```css
.project-tab.active::before {
  content: ''; position: absolute; left: -6px; bottom: -1px;
  width: 6px; height: 6px;
  background: var(--bg-sidebar);
  border-radius: 0 0 6px 0;
  box-shadow: 3px 2px 0 0 var(--surface);
}
.project-tab.active::after {
  content: ''; position: absolute; right: -6px; bottom: -1px;
  width: 6px; height: 6px;
  background: var(--bg-sidebar);
  border-radius: 0 0 0 6px;
  box-shadow: -3px 2px 0 0 var(--surface);
}
```

### 4.3 标签交互

| 操作 | 行为 |
|------|------|
| 点击标签 | 切换到对应项目，标签变 active，加载任务列表 |
| 点击 ✕ | 关闭标签，若为最后一个标签则提示不可关闭 |
| 点击 ⚙ | 打开项目选择器弹窗 |
| 点击 ◀ ▶ | 横向滚动标签（标签溢出时显示） |

### 4.4 标签规格

- 高度：28px，padding：4px 12px
- 最小宽度 80px，最大宽度 160px
- 标签间距：2px
- 标签间分隔线：`::after` 伪元素，`1px solid rgba(255,255,255,0.06)`

---

## 5. 主容器三栏布局

```
┌──────────┬──────────────┬─────────────────────────────────┐
│ Primary  │ Secondary    │ Content Area                     │
│ Sidebar  │ Sidebar      │                                  │
│ (64px)   │ (280px)      │  - 任务详情头部 (72px)            │
│          │              │  - 步骤进度 (steps-progress)      │
│          │ 新变更  ⏱ ↻  │  - Tab 导航 (48px)               │
│ 📋 任务   │ ┌──────────┐ │  - 内容视图                      │
│ 📐 规格   │ │TaskCard 1│ │                                  │
│ 📦 归档   │ │TaskCard 2│ │                                  │
│ 🔍 检索   │ │TaskCard 3│ │                                  │
│ ✅ 检测   │ │...       │ │                                  │
│          │ └──────────┘ │                                  │
│ ⚙ 设置   │ 5 个任务      │                                  │
│ ◀ 折叠   │ 📁 polaris-cli│                                  │
└──────────┴──────────────┴─────────────────────────────────┘
```

---

## 6. 一级侧边栏 (Primary Sidebar)

宽度 64px，背景 `--bg-sidebar`（`#171717`），整体导航栏不分上下区域。

### 6.1 导航项

```
┌──────┐
│ [icon]│  ← 线性 SVG 20px
│ 任务  │  ← label 12px
│      │
│ [icon]│
│ 规格  │
│  ...  │
│      │
│ [icon]│
│ 设置  │
│ [icon]│
│ 折叠  │
└──────┘
```

每项：`display: flex; flex-direction: column; align-items: center`，高度 52px（主导航）/ 44px（底部按钮），间距 2px。

| 状态 | 背景 | 文字色 | 附加 |
|------|------|--------|------|
| 默认 | transparent | label: `--text-helper` | - |
| hover | `rgba(34, 197, 94, 0.1)` | 不变 | - |
| active | `--primary-bg`（`#2D3F38`） | label: `--primary-light` | 左侧 3px 主色竖线 |

- 图标使用内联线性 SVG（`.icon.icon--nav`），不使用 emoji
- 底部设置和折叠按钮使用相同 `.primary-nav-item` 样式，仅高度稍小
- 折叠/展开切换二级侧边栏的可见性

---

## 7. 二级侧边栏 (Secondary Sidebar)

宽度 280px，可折叠（折叠后宽度 0）。背景 `--bg-sidebar`（`#171717`），左边框 `1px solid var(--bg-global)`。

### 7.1 顶部操作栏

```
┌──────────────────────────────┐
│ [新变更]            ⏱  ↻     │
└──────────────────────────────┘
```

- 左侧：新变更按钮 (`btn--sm`)
- 右侧：排序切换按钮 + 刷新按钮 (`btn--icon`)
- 排序按钮在 ⏱（时间）和 🔤（名称）间切换

### 7.2 任务卡片列表

使用 `TaskCardItem` 组件样式：

```
┌──────────────────────────────┐
│ ┃  #987                 BE  │  ← Row 1: 序号 ID + 分组标签
│ ┃  (○) Add User Authentication│  ← Row 2: 圆形头像 + 标题
│ ┃  12 分钟前    [Execution Complete] │  ← Row 3: 相对时间 + 实心状态标签
└──────────────────────────────┘
```

#### 卡片结构

| 行 | 元素 | 样式 |
|----|------|------|
| Row 1 左 | `task-card-tag-id` | bg `--bg-global`，color `--accent`（`#8b5cf6`），等宽字体 11px |
| Row 1 右 | `task-card-tag-group` | 边框 `1px solid --border-normal`，color `--text-helper`，字号 10px |
| Row 2 左 | `task-card-avatar` | 28px 圆形，边框色由 groupTag 决定，内含用户线性 SVG |
| Row 2 右 | `task-card-title` | color `--text-primary`，字号 16px，weight 700 |
| Row 3 左 | `task-card-time` | color `--text-helper`，相对时间（如「12 分钟前」） |
| Row 3 右 | `.tag.task-card-status` | 复用 component.css 实心标签（24px 高） |

#### 选中态

选中卡片左侧 3px 主色竖条 (`.task-card-active-bar`)，卡片背景 `--primary-bg`（`#2D3F38`），默认阴影 `--shadow-card`，hover `scale(1.02)` + 发光增强。

#### 状态徽章颜色

| 状态 | class | 背景色 | 文字色 |
|------|-------|--------|--------|
| 已完成 / Execution Complete | `tag-success` | `#166534` | `#BBF7D0` |
| 进行中 / 阻塞 | `tag-warning` | `#453A2B` | `#FCD34D` |
| 审核 / Drafting | `tag-info` | `#1E3A8A` | `#93C5FD` |

#### 图标颜色映射

| groupTag | 颜色 | 含义 |
|----------|------|------|
| BE | `#3b82f6` | 后端 |
| FE | `#38b950` | 前端 |
| FS | `#8b5cf6` | 全栈 |
| TS | `#f59e0b` | 工具/脚本 |
| RQ | `#ef4444` | 需求 |

### 7.3 底部信息栏

显示任务总数 + 当前项目名称（可点击切换项目）。

---

## 8. 内容区域 (Content Area)

默认显示第一个任务的详情页，无返回列表按钮。

### 8.1 任务详情头部 (72px)

```
┌──────────────────────────────────────────────────────────┐
│ Add User Authentication                                   │
│ 创建: 2026-06-08  规格: 3个  工作流: polaris-flow-backend  │
│ 任务进度: 4/9 [========---------------------------]        │
└──────────────────────────────────────────────────────────┘
```

- 标题：18px / 700，显示任务 `title`（非 slug）
- 元数据行：12px / `--text-helper`，水平排列
- 进度条：宽 150px，高 4px，颜色按百分比分级（<50% danger，50-99% warning，100% success）
- **操作按钮已移至 Quick Actions（§8.5），头部仅保留元数据**

### 8.2 步骤进度组件 (Steps Progress)

4 阶段 8 节点工作流（对齐 HagiCode 参考图）：

```
┌─ PROPOSAL PREPARATION ─┐   ┌─ REVIEW AND REFINE ─┐   ┌─ EXECUTION COMPLETE ─┐   ┌─ ARCHIVE ─┐
│  0 Created  1 Opt  2 Draft │ > │  3 Gen  4 Review  │ > │  5 Exec  6 Done    │ > │ 7  8      │
└──────────────────────────┘   └─────────────────────┘   └────────────────────┘   └───────────┘
```

#### 分组状态

| 状态 | 边框 | 标签色 | 透明度 |
|------|------|--------|--------|
| `completed` | `rgba(34, 197, 94, 0.3)` 虚线 | `rgba(255,255,255,0.7)` | 1.0 |
| `active` | `rgba(34, 197, 94, 0.5)` 虚线 + 主色发光 | `--primary-light` | 1.0 |
| `pending` | `--border-normal` 虚线 | `--text-helper` | 0.45 |

#### 节点状态

| 状态 | 圆形 | 卡片边框 | 名称色 | 附加 |
|------|------|---------|--------|------|
| `done` | 绿色填充 + 白色数字 | `--primary` | `--text-primary` | 右上角绿色 ✓ |
| `active` | **主色绿**填充 + glow | `--primary` | `--primary-light` | - |
| `pending` | 透明 + `--border-normal` 边框 | `--border-normal` | `--text-helper` | - |

#### 节点卡片规格

- 最小宽度 72px，padding `--space-sm --space-xs`
- 圆形：28×28px，边框 2px，居中
- 数字：12px / 600
- 名称：11px，`word-break: keep-all`

#### 分组标签

- 绝对定位，`top: 0; transform: translateY(-50%)`
- 背景 `var(--bg)` 遮盖边框
- 字号 10px / 700 / `letter-spacing: 0.8px`

#### 分组分隔符

- `>` 符号，18px / 700 / `--text-helper`，垂直居中

### 8.3 状态阶段卡片 (Stage Card)

执行完成时显示绿色边框大卡片：

- 左侧绿色圆形序号 + `Execution Completed` 标题
- 说明文字 + 琥珀渐变 `Archive Plan` pill 按钮 + `Done` 实心标签
- 进行中阶段显示蓝色边框变体 + 当前阶段名称

### 8.4 Idea Name 栏

- 等宽字体展示 `Idea Name: {slug}`
- 完成态右侧显示 `Files Complete`

### 8.5 Quick Actions 快捷操作

横向按钮组：打开提案目录 / 优化提案 / 执行 / 校验 / 新窗口打开 / 删除任务（红色）

### 8.6 项目信息区 (Project Info)

- Session 大标题
- Repos 四列表格（仓库名称、路径、编辑权限、用途）
- 「背景 / 问题」文本块

### 8.7 Tab 导航 (48px)

```
┌──────────────────────────────────────────────────────────┐
│ 提案(1) │ 设计(3) │ 任务(6) │ 规格差异(2) │ 其他(4)        │
└──────────────────────────────────────────────────────────┘
```

- 高度 48px，底部边框分隔
- 激活标签：`color: var(--primary)`，底部 2px 主色下划线
- hover：`color: var(--text-primary)`

### 8.8 内容视图

| Tab | 视图类型 | 说明 |
|-----|---------|------|
| 提案 | markdown-view | Markdown 渲染的提案文档 |
| 设计 | split-view | 左侧文件树 + 右侧文件内容预览 |
| 任务 | markdown-view | 任务分解清单（✅ ⏳ ⬚） |
| 规格差异 | split-view | 左侧规格文件 + 右侧 diff 预览 |
| 其他 | split-view | 左侧附件列表 + 右侧内容预览 |

#### 分屏视图 (split-view)

```
┌────────────┬──────────────────────┐
│ 文件树      │ 内容预览              │
│ (200px)    │ (flex: 1)            │
│            │                      │
│ 📄 file1   │ # file1              │
│ 📄 file2   │                      │
│ 📄 file3   │ 文件内容...           │
└────────────┴──────────────────────┘
```

- 文件项 hover：`background: var(--primary-hover-bg)`
- 文件项 active：`background: var(--primary-bg-strong)`，`color: var(--primary)`

---

## 9. 模态框

### 9.1 项目选择器 (Project Selector)

```
┌─────────────────────────────────┐
│ 📁  Project Selector 项目选择器  ✕│
│   切换到其他项目或添加新项目       │
│                                 │
│ YOUR PROJECTS 你的项目           │
│ ┌─────────────────────────────┐ │
│ │ 📁 polaris-cli          ✓  │ │  ← active 项目
│ │ /Users/me/projects/polaris │ │
│ ├─────────────────────────────┤ │
│ │ 📁 backend-service          │ │
│ │ /Users/me/projects/backend │ │
│ ├─────────────────────────────┤ │
│ │ 📁 old-legacy-project  ⚠   │ │  ← deleted 项目
│ │ /Users/me/projects/legacy  │ │
│ └─────────────────────────────┘ │
│                                 │
│ [➕ Add New Project 添加新项目]   │
└─────────────────────────────────┘
```

- 当前激活项目：主色左边框 + 主色文字 + ✓ 标记
- 已删除项目：opacity 0.5，cursor not-allowed，⚠ 标记
- 点击项目：切换激活项目，关闭弹窗
- 点击"添加新项目"：关闭选择器，打开添加项目弹窗

### 9.2 添加项目 (Add Project)

```
┌─────────────────────────────────────┐
│ 📁  Add Project 添加项目             ✕│
│   将已有项目目录添加到 Polaris 管理    │
│                                     │
│ > / > Users > me > projects > target│  ← 面包屑导航
│                                     │
│ 📁 src/                        ▶   │  ← 目录列表
│ 📁 tests/                      ▶   │
│ 📄 package.json                     │
│ 📄 openspec.json                    │
│                                     │
│ 当前路径: /Users/me/projects/target │
│ ┌─────────────────────────────────┐ │
│ │ Add This Directory 添加此目录    │ │  ← 有 openspec 时可用
│ └─────────────────────────────────┘ │
│ Or enter path manually 或手动输入路径│
│ [________________________] [验证]   │
└─────────────────────────────────────┘
```

**交互流程：**
1. 点击目录进入子目录
2. 点击面包屑返回上级
3. 检测到 `openspec` 目录时，按钮变为可点击的"添加此目录"
4. 也可切换为手动输入路径模式

---

## 10. 底部状态栏 (BottomStatusBar)

```
┌──────────────────────────────────────────────────────────┐
│ 项目: polaris-cli    SYSTEM TIMELINE · 就绪    Running 0 Tasks 5 v0.1.0 │
└──────────────────────────────────────────────────────────┘
```

- 高度 32px；左侧项目名，中间 System Timeline（等宽大写），右侧 Running/Tasks/版本统计
- 字号 11px，`--text-helper`；统计数字用 `--text-secondary` 加粗

---

## 11. 交互规范

### 11.1 过渡动画

| 元素 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| 按钮 hover/active | background, color, border-color, transform | 0.2s | ease |
| 任务卡片 hover | box-shadow, transform, background | 0.2s | ease |
| 步骤节点 | border-color, background | 0.2s | ease |
| 步骤分组 | border-color, opacity | 0.3s | ease |
| 二级侧边栏折叠 | width, min-width | 0.15s | ease |
| 模态框 | opacity (fadeIn) | 0.15s | ease |

### 11.2 Toast 提示

- 位置：底部居中，距底部 48px
- 背景 `--surface`，边框 `1px solid --border`
- 自动 2.5 秒消失

### 11.3 深度层级 (z-index)

| z-index | 元素 |
|---------|------|
| 100 | 顶部导航栏、底部状态栏 |
| 99 | 项目标签栏 |
| 90 | 一级/二级侧边栏 |
| 300 | 模态框遮罩 |
| 310 | 确认弹窗 |
| 400 | Toast 提示 |

---

## 12. 任务数据模型

```typescript
interface Task {
  id: number
  displayId: number      // 列表展示序号（如 987，显示为 #987）
  name: string           // 任务标识符 slug（如 'add-user-auth'）
  title: string          // 显示标题
  groupTag: string       // 'BE' | 'FE' | 'FS' | 'TS' | 'RQ'
  time: string           // ISO 时间戳，前端格式化为相对时间
  workflow: string
  status: string         // 如 'Execution Complete' | 'Reviewing' | '进行中'
  statusType: 'success' | 'warning' | 'error' | 'info'
  specs: number
  currentStep: number    // 当前活跃步骤编号 0–8
  doneSteps: number
  totalSteps: number     // 固定 9（8 步 + 1）
  pct: number
  stepGroups: StepGroup[]
  repos?: RepoRow[]      // Repos 表格数据
  background?: string    // 背景/问题描述
}

interface RepoRow {
  name: string
  path: string
  permission: string
  purpose: string
}

interface StepGroup {
  name: string           // 如 'PROPOSAL PREPARATION'
  status: 'completed' | 'active' | 'pending'
  steps: StepNode[]
}

interface StepNode {
  name: string           // 如 'Created' | 'Review'
  status: 'done' | 'active' | 'pending'
  number: number         // 0–8
}
```

---

## 13. CSS 变量参考

与 [ui-design-spec.md](ui-design-spec.md) 及 demo [`css/global.css`](demo/css/global.css) 保持一致：

```css
:root {
  /* 主色（青绿色） */
  --primary: #22C55E;
  --primary-light: #7FFFD4;
  --primary-dark: #16A34A;
  --primary-bg: #2D3F38;

  /* 功能色 */
  --success: #22C55E;
  --warning: #FCD34D;
  --danger: #EF4444;
  --info: #3B82F6;
  --accent: #8b5cf6;

  /* 背景层级 */
  --bg-global: #121212;
  --bg-card: #1E1E1E;
  --bg-hover: #252525;
  --bg-sidebar: #171717;

  /* 文本 */
  --text-primary: #FFFFFF;
  --text-secondary: #D1D5DB;
  --text-helper: #9CA3AF;
  --text-disabled: #6B7280;

  /* 边框 */
  --border-normal: #333333;
  --border-light: #2D3F38;

  /* 步骤活跃态 = 主色绿（非琥珀色） */
  --step-active: var(--primary);
  --step-active-glow: rgba(34, 197, 94, 0.3);
  --archive-gradient: linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%);

  /* 阴影/发光 */
  --shadow-card: 0 4px 12px rgba(0, 0, 0, 0.3);
  --glow-primary: 0 0 8px rgba(34, 197, 94, 0.2);
  --glow-primary-strong: 0 0 12px rgba(34, 197, 94, 0.3);

  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --transition: 0.2s ease;
}
```
