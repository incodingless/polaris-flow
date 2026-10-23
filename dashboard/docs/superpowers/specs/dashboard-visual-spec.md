# Polaris Dashboard 页面视觉效果规范

## 1. 色彩系统

```css
:root {
  /* 背景 */
  --bg: #0f172a;              /* 主背景 (Slate 900) */
  --bg-sidebar: #0c1524;      /* 侧边栏/导航栏背景 (深于主背景) */
  --surface: #1e293b;         /* 卡片/面板表面 (Slate 800) */
  --muted: #334155;           /* 次级表面/禁用态 (Slate 700) */
  --border: #1e293b;          /* 边框色 (同 surface) */

  /* 品牌/主色 */
  --primary: #3b82f6;         /* 蓝色主调 (Blue 500) */
  --primary-hover: #2563eb;   /* hover 加深 (Blue 600) */
  --primary-glow: rgba(59, 130, 246, 0.15);
  --primary-glow-strong: rgba(59, 130, 246, 0.3);

  /* 语义色 */
  --success: #10b981;         /* 完成/通过 (Emerald 500) */
  --success-glow: rgba(16, 185, 129, 0.2);
  --warning: #f59e0b;         /* 进行中/警告 (Amber 500) */
  --error: #ef4444;           /* 删除/错误 (Red 500) */
  --accent: #8b5cf6;          /* 强调/Proposal (Violet 500) */

  /* 文字 */
  --text: #e2e8f0;            /* 正文 (Slate 200) */
  --text-secondary: #94a3b8;  /* 次要文字 (Slate 400) */
  --text-muted: #64748b;      /* 辅助/禁用文字 (Slate 500) */

  /* 字体 */
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  /* 圆角阶梯 */
  --radius-sm: 4px;
  --radius: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* 间距阶梯 (4px 基准) */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;
  --space-3xl: 48px;
}
```

### 语义色使用约定

| 颜色 | 用途 |
|------|------|
| `--primary` | 选中态、主按钮、链接、当前步骤、active 导航 |
| `--success` | 完成态、通过检测、done 阶段、在线指示器 |
| `--warning` | 进行中、警告检测、tasks 阶段 |
| `--error` | 删除按钮、错误检测、低于 50% 进度 |
| `--accent` | proposal 阶段、特殊强调 |

---

## 2. 字体层级

| 标签 | 字号 | 字重 | 字体 | 用途 |
|------|------|------|------|------|
| `.stat-value` | 28px | 700 | `--font-mono` | 统计卡片数值 |
| `h1` | 1.5rem | 700 | `--font-ui` | 页标题 |
| `h2` | 1.25rem | 600 | `--font-ui` | 区段标题 |
| `h3` | 1.1rem | 600 | `--font-ui` | 卡片标题 |
| `body` | 14px | 400 | `--font-ui` | 正文 |
| `small` / `.text-muted` | 12px | 400 | `--font-ui` | 辅助信息 |
| `.brand` / Logo | 14px | 700 | `--font-mono` | 品牌标识 |
| `code` | 0.875em | 400 | `--font-mono` | 代码/路径 |

---

## 3. 整体布局

### 3.1 外壳结构 (app-shell-new)

```
┌──────────────────────────────────────────────────┐
│  TopNavbar (48px, bg-sidebar, 底部边框)           │
├──────────────────────────────────────────────────┤
│                                                    │
│  .main-content (flex: 1, overflow-y: auto)        │
│                                                    │
├──────────────────────────────────────────────────┤
│  BottomStatusBar (32px, bg-sidebar, 顶部边框)      │
└──────────────────────────────────────────────────┘
```

- 外壳为 `display: flex; flex-direction: column; height: 100vh; overflow: hidden`
- 顶部导航栏和底部状态栏固定高度，中间内容区自动填充

### 3.2 顶部导航栏 (TopNavbar)

```
┌──────────────────────────────────────────────────┐
│ >_ polaris [项目标签区]               首页 任务 配置 │
└──────────────────────────────────────────────────┘
```

- **左侧**：Logo (`>_ polaris`, JetBrains Mono, primary 色)
- **中间**：项目标签（类似Chorme浏览器的标签，显示1~N个已纳管的项目名称，仅在任务页面出现，其余页面内容留空但保持宽度）
- **右侧**：导航按钮组，按钮为 `<a>` 标签，`padding: 6px 16px`，`border-radius: var(--radius)`
- 按钮 hover：`background: rgba(59, 130, 246, 0.1)`，文字变亮
- 按钮 active：`background: rgba(59, 130, 246, 0.15)`，`color: var(--primary)`
- 过渡：`0.15s ease`

### 3.3 底部状态栏 (BottomStatusBar)

- 高度 32px，三区均分（左/中/右），当前均为空白占位
- 字体：11px，`--text-muted`

---

## 4. 页面布局规范

### 4.1 首页 (HomePage)

```
┌──────────────────────────────────────┐
│  仪表台                               │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │
│  │ 项目  │ │ 任务  │ │ 待处理│ │ 已完成│ │
│  │ 总数  │ │ 总数  │ │ 任务  │ │ 任务  │ │
│  └──────┘ └──────┘ └──────┘ └──────┘ │
└──────────────────────────────────────┘
```

- 最大宽度 900px，水平居中
- 统计卡片 4 列 grid，`gap: var(--space-lg)`
- 移动端 (<768px) 切换为 2 列

### 4.2 项目管理 (ProjectsPage)

- 最大宽度 1000px，水平居中
- 表格展示：别名 / 路径 / 添加时间 / 操作
- 表头：12px，大写，`letter-spacing: 0.5px`
- 行 hover：`rgba(59, 130, 246, 0.05)`
- "删除"按钮：error 色

### 4.3 任务管理 (TasksPage)

两栏布局：
```
┌────────────┬──────────────────────────┐
│ 左侧任务列表 │     右侧任务详情           │
│ (280px)    │     (flex: 1)            │
│            │  - 步骤进度条              │
│  task-card │  - 阶段卡片               │
│  task-card │  - 项目信息               │
│  ...       │                          │
└────────────┴──────────────────────────┘
```

### 4.4 配置管理 (ConfigPage)

两栏布局：
```
┌────────────┬──────────────────────────┐
│ 文件树      │     编辑区                │
│ (200px)    │     (flex: 1)            │
│            │  - 路径 + 语法标签         │
│ config1    │  - 保存按钮               │
│ config2    │  - textarea (monospace)   │
└────────────┴──────────────────────────┘
```

### 4.5 环境检测 (CheckPage)

- 最大宽度 900px，水平居中
- 摘要区：3 个卡片（错误/警告/通过），错误红色、警告黄色、通过绿色
- 清单区：每项左侧 3px 状态色边框 + 图标 + 名称 + 描述

---

## 5. 组件样式规范

### 5.1 按钮 (.btn)

```css
.btn {
  display: inline-flex; align-items: center; gap: var(--space-xs);
  background: var(--muted); color: var(--text);
  border: none; padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius); cursor: pointer;
  font-size: 13px; font-family: var(--font-ui);
  transition: background .15s;
}
.btn:hover { background: var(--primary); color: #fff; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-hover); }
```

### 5.2 卡片

- 背景 `--surface`，圆角 `--radius-lg`，边框 1px transparent
- hover：`border-color: var(--primary)` + `box-shadow: 0 0 12px var(--primary-glow)`

### 5.3 统计卡片 (.stat-card)

- 居中布局，padding: `var(--space-lg)`
- 数值：28px / 700 / `--font-mono`，蓝紫渐变文字
- 标签：13px / `--text-secondary`

### 5.4 任务卡片 (.task-card)

- 左侧任务列表中的可点击项
- 边框 1px transparent → hover/active 时 primary 色 + glow
- 内容：名称(13px/500)、meta(11px 标签+时间)、进度条、状态标签

### 5.5 Badge (.badge)

```css
.badge {
  display: inline-flex; align-items: center;
  padding: 3px 10px; border-radius: 12px;
  font-size: 12px; font-weight: 500;
}
```

| 阶段 | CSS 类 | 背景 | 文字色 |
|------|--------|------|--------|
| Proposal | `.badge-proposal` | `rgba(139,92,246,0.2)` | `--accent` |
| Specs | `.badge-specs` | `rgba(6,182,212,0.2)` | `#06b6d4` |
| Design | `.badge-design` | `rgba(59,130,246,0.2)` | `--primary` |
| Tasks | `.badge-tasks` | `rgba(245,158,11,0.2)` | `--warning` |
| Done | `.badge-done` | `rgba(16,185,129,0.2)` | `--success` |

### 5.6 进度条 (.mini-progress)

- 容器：height 3px, bg `--muted`, radius 2px
- 填充：transition width 1s ease-out
- 颜色规则：<50% `--error`, 50-99% `--warning`, 100% `--success`

### 5.7 骨架屏 (.skeleton)

- 基础: bg `--surface`, radius `--radius`
- shimmer: `linear-gradient(90deg, var(--surface) 25%, var(--muted) 50%, var(--surface) 75%)`
- animation: `shimmer 1.5s ease-in-out infinite`

### 5.8 模态框

- 遮罩：`rgba(0,0,0,0.6)`，`z-index: 300`
- 面板：bg `--surface`，radius `--radius-lg`，min-width 420px
- 表单：label(13px/secondary) + input(bg `--bg`, focus border primary)

### 5.9 空状态 (.empty-state)

- 居中 flex 布局，文字 `--text-muted`
- 附带引导操作按钮

---

## 6. 步骤进度组件 (Steps Progress)

### 6.1 数据结构

```typescript
interface StepGroup {
  name: string      // 分组名称
  status: 'completed' | 'active' | 'pending'
  steps: StepNode[]
}

interface StepNode {
  name: string
  status: 'done' | 'active' | 'pending'
}
```

### 6.2 三种分组状态

| 状态 | 边框 | 标签 | 透明度 | 节点状态 |
|------|------|------|--------|---------|
| `completed` | 浅绿色虚线 `rgba(16,185,129,0.3)` | 白色半透明 | 1.0 | 全部 done |
| `active` | 绿色实线 + `box-shadow: 0 0 0 1px var(--success)` | 亮绿色 `--success` | 1.0 | 首节点 active + 其余 pending |
| `pending` | 灰色虚线 `--muted` | 灰色 `--text-muted` | 0.45 | 全部 pending |

### 6.3 三种节点状态

| 状态 | 圆形 | 卡片边框 | 文字 | 附加 |
|------|------|---------|------|------|
| `done` | 绿色填充 + 白色 ✓ | 绿色 `--success` | 亮白 `--text` | 右上角绿色勾号 ✓ |
| `active` | 绿色填充 + glow | 绿色 + 内嵌边框 | 亮绿 `--success` | - |
| `pending` | 灰色空心 | 灰色 `--muted` | 灰色 `--text-muted` | - |

### 6.3.1 节点卡片结构

```
┌─────────────────────┐
│                ✓    │  ← node-check-icon（done 时显示）
│       (●)          │  ← node-circle（28px）
│     名称            │  ← node-name（11px）
└─────────────────────┘
  背景: var(--bg)
  边框: 1px solid
  圆角: var(--radius)
  padding: var(--space-sm)
```

### 6.4 分组标签

- 绝对定位在分组左上角，`top: calc(-0.6em - 1px)`
- 背景 `--bg` 遮盖边框，水平 padding 6px
- 10px / 700 / uppercase / `letter-spacing: 0.8px`

### 6.5 分组分隔符

- `>` 符号，18px / 700 / `--text-muted`
- 垂直居中于分组之间

### 6.6 响应式

- `<1024px`：分组 min-width 缩小为 120px，padding 和 gap 收紧
- 整体 `overflow-x: auto`，支持横向滚动

---

## 7. 交互规范

### 7.1 按钮/链接

- 所有可点击元素 transition: `0.15s ease` (背景色/边框/透明度)
- hover：背景或边框变为 `--primary`，文字变 `#fff` 或 `--text`
- disabled：降低透明度或保持 muted

### 7.2 任务卡片

- hover：`border-color: var(--primary)` + `box-shadow: 0 0 12px var(--primary-glow)`
- active/选中：同上增强为 `--primary-glow-strong`

### 7.3 导航按钮

- hover：`rgba(59, 130, 246, 0.1)`
- active：`rgba(59, 130, 246, 0.15)` + `color: var(--primary)`

### 7.4 文件树项

- hover：`background: var(--muted)`
- active：`rgba(59, 130, 246, 0.15)` + `color: var(--primary)`

---

## 8. 动效规范

| 动画 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| shimmer | background-position | 1.5s | linear infinite |
| neon-pulse | opacity + box-shadow | 2s | ease-in-out infinite |
| hover | background / border-color / box-shadow | 0.15s | ease |
| progress-fill | width | 1s | ease-out |
| step-circle | border-color / background / box-shadow | 0.2s | - |
| step-line | background | 0.3s | - |

**`prefers-reduced-motion: reduce`** 时关闭全部动画。

---

## 9. 响应式断点

| 断点 | 布局调整 |
|------|---------|
| `>=1024px` | 默认：顶部导航 + 内容 + 底部状态栏 |
| `768px-1023px` | 统计卡片 4→2 列，分组步骤缩小 |
| `<768px` | 统计卡片 2 列，表格字号缩小 |

---

## 10. 深度层级

| z-index | 用途 |
|---------|------|
| 100 | 顶部导航栏 |
| 200 | 覆盖层（预留） |
| 300 | 模态框 / 下拉菜单 |

---

## 11. 代码规范

- Vue 3 CDN 模式（ESM import），无构建步骤
- 组件定义：`const Component = { props, setup, template }`
- 全局状态：`reactive()` 在 App setup 中统一管理
- 页面通过 `computed` + hash 路由条件渲染
- CSS：原生 CSS 变量 + BEM 风格类名
- 不引入额外 npm 依赖
