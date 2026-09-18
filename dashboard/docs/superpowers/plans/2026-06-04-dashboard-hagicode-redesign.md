# Dashboard HagiCode 风格重设计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 polaris-cli dashboard 从 Catppuccin 纯原生技术栈升级为 HagiCode 风格 UI（三栏布局 + Vue 3 CDN + Slate 暗色主题 + 动效系统）

**Architecture:** 保留 Node.js 原生 HTTP server + SSR 字符串渲染，客户端引入 Vue 3 CDN（import map 方式，零构建步骤）。组件用纯 .js 文件（Options API），不用 .vue SFC。状态用单个 reactive() 对象管理。三栏布局：项目列表(180px) | 任务卡片(280px) | 内容区(flex)

**Tech Stack:** Vue 3 CDN (esm-browser), CSS Custom Properties, Node.js http, TypeScript

---

## 文件结构总览

```
新建 (21 files):
  src/core/dashboard/design.md
  src/core/dashboard/api/projects.ts
  src/core/dashboard/static/components/AppShell.js
  src/core/dashboard/static/components/ProjectList.js
  src/core/dashboard/static/components/TaskCardList.js
  src/core/dashboard/static/components/TaskCard.js
  src/core/dashboard/static/components/DetailPanel.js
  src/core/dashboard/static/components/FileTree.js
  src/core/dashboard/static/components/MarkdownView.js
  src/core/dashboard/static/components/ConfigEditor.js
  src/core/dashboard/static/components/ComposeForm.js
  src/core/dashboard/static/components/StatCard.js
  src/core/dashboard/static/components/MiniProgress.js
  src/core/dashboard/static/components/Skeleton.js
  src/core/dashboard/static/components/Breadcrumb.js
  src/core/dashboard/static/components/PhaseBadge.js
  src/core/dashboard/static/components/NavSidebar.js

重写 (3 files):
  src/core/dashboard/static/app.css
  src/core/dashboard/static/app.js
  src/core/dashboard/pages/layout.ts

修改 (5 files):
  src/core/dashboard/router.ts
  src/core/dashboard/pages/board.ts
  src/core/dashboard/pages/change-detail.ts
  src/core/dashboard/pages/config-editor.ts
  src/core/dashboard/pages/compose.ts

不动 (4 files):
  src/core/dashboard/server.ts
  src/core/dashboard/change-scanner.ts
  src/core/dashboard/markdown.ts
  src/core/dashboard/api/changes.ts
  src/core/dashboard/api/configs.ts
  src/core/dashboard/api/compose.ts
```

---

### Task 1: 创建设计规范文档 design.md

**Files:**
- Create: `src/core/dashboard/design.md`

- [ ] **Step 1: 编写 design.md**

```markdown
# Dashboard Design System

## 1. 视觉主题与氛围

深色科技风，Slate 底色 + blue-500 发光主调。JetBrains Mono 用于品牌/代码，系统字体用于 UI 正文。蓝紫色渐变点缀数字和标题，微光边框和霓虹呼吸灯增加技术氛围。

## 2. 色彩系统

```css
:root {
  --bg: #0f172a;
  --bg-sidebar: #0c1524;
  --surface: #1e293b;
  --muted: #334155;
  --border: #1e293b;

  --primary: #3b82f6;
  --primary-hover: #2563eb;
  --primary-glow: rgba(59, 130, 246, 0.15);
  --primary-glow-strong: rgba(59, 130, 246, 0.3);

  --success: #10b981;
  --success-glow: rgba(16, 185, 129, 0.2);
  --warning: #f59e0b;
  --error: #ef4444;
  --accent: #8b5cf6;

  --text: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

语义色用途：
- primary: 选中态、主按钮、链接
- success: 完成/Done 阶段、在线状态
- warning: 进行中/Tasks 阶段
- error: 删除/错误
- accent: Proposal 阶段

## 3. 字体层级

| 标签 | 字号 | 字重 | 字体 |
|------|------|------|------|
| h1 (页标题) | 1.5rem | 700 | var(--font-ui) |
| h2 (区段标题) | 1.25rem | 600 | var(--font-ui) |
| h3 | 1.1rem | 600 | var(--font-ui) |
| body | 14px | 400 | var(--font-ui) |
| small | 12px | 400 | var(--font-ui) |
| code | 0.875em | 400 | var(--font-mono) |
| .brand | 14px | 700 | var(--font-mono) |
| .stat-value | 28px | 700 | var(--font-mono) |

## 4. 间距系统

基于 4px 阶梯：xs:4, sm:8, md:12, lg:16, xl:24, 2xl:32, 3xl:48

## 5. 组件样式规范

### 按钮
- 默认: bg(--muted), color(--text), radius:6px, padding:8px 16px
- 主按钮: bg(--primary), color(#fff)
- hover: bg(--primary-hover)
- transition: .15s ease

### 卡片
- bg(--surface), border:1px solid transparent, radius:8px
- hover: border-color(--primary) + box-shadow: 0 0 12px var(--primary-glow)
- active: 同上，颜色保持
- padding: 14px 16px

### 进度条
- 容器: height:4px, bg(--muted), radius:2px
- 填充: transition width 1s ease-out
- 颜色: <50% error, 50-99% warning, 100% success

### 骨架屏
- 基础: bg(--surface), radius:6px
- shimmer: linear-gradient(90deg, var(--surface) 25%, var(--muted) 50%, var(--surface) 75%), bg-size 200%
- animation: shimmer 1.5s infinite

### Badge (阶段标签)
- padding: 3px 10px, radius:12px, font-size:12px
- proposal: bg(--accent), design: bg(--primary), specs: bg(#06b6d4)
- tasks: bg(--warning), done: bg(--success)

## 6. 深度与层级

- 无阴影系统，使用 box-shadow 发光替代
- z-index: sidebar(100), overlay(200), dropdown(300)
- 侧边栏分隔线: 1px solid var(--border)

## 7. 动效规范

| 动画 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| shimmer | background-position | 1.5s | linear infinite |
| neon-pulse | opacity + box-shadow | 2s | ease-in-out infinite |
| card-hover | border-color + box-shadow | .15s | ease |
| sidebar-collapse | width | .3s | ease |
| content-fade-in | opacity + transform(translateY) | .4s | ease |
| progress-fill | width | 1s | ease-out |
| code-rain | opacity + transform | 2s | linear infinite |

使用 `@media (prefers-reduced-motion: reduce)` 关闭全部动画。

## 8. 响应式断点

| 断点 | 布局 |
|------|------|
| >=1024px | 三栏: 180px + 280px + flex |
| 768-1023px | 两栏: 栏1折叠(48px图标) + 240px + flex |
| <768px | 单栏内容 + 底部 Tab 栏 |
```

- [ ] **Step 2: Commit**

```bash
git add src/core/dashboard/design.md
git commit -m "docs: add dashboard design system specification"
```

---

### Task 2: 重写 app.css（CSS 变量 + 全局样式 + 动画）

**Files:**
- Rewrite: `src/core/dashboard/static/app.css`

- [ ] **Step 1: 编写新的 app.css**

```css
/* ===== CSS Custom Properties ===== */
:root {
  --bg: #0f172a;
  --bg-sidebar: #0c1524;
  --surface: #1e293b;
  --muted: #334155;
  --border: #1e293b;

  --primary: #3b82f6;
  --primary-hover: #2563eb;
  --primary-glow: rgba(59, 130, 246, 0.15);
  --primary-glow-strong: rgba(59, 130, 246, 0.3);

  --success: #10b981;
  --success-glow: rgba(16, 185, 129, 0.2);
  --warning: #f59e0b;
  --error: #ef4444;
  --accent: #8b5cf6;

  --text: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  --radius-sm: 4px;
  --radius: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
}

/* ===== Reset & Base ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-ui);
  font-size: 14px;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  overflow: hidden;
  height: 100vh;
}

a { color: var(--primary); text-decoration: none; }
a:hover { color: var(--primary-hover); }

/* ===== Three-Column Layout ===== */
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ===== Column 1: Project List (180px) ===== */
.sidebar-col {
  width: 180px;
  min-width: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: width .3s ease;
  overflow: hidden;
}
.sidebar-col.collapsed { width: 0; border-right: none; }

.sidebar-brand {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--primary);
  white-space: nowrap;
}
.sidebar-brand small {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: var(--text-muted);
  margin-top: 2px;
}

.sidebar-nav { flex: 1; padding: var(--space-sm); overflow-y: auto; }

.nav-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  padding: var(--space-sm) var(--space-sm) var(--space-xs);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: color .15s, background .15s;
  white-space: nowrap;
}
.nav-item:hover { background: rgba(59, 130, 246, 0.08); color: var(--text); }
.nav-item.active {
  background: rgba(59, 130, 246, 0.12);
  color: var(--primary);
  border-left-color: var(--primary);
}

.sidebar-status {
  padding: var(--space-md);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
}

/* ===== Column 2: Task Cards (280px) ===== */
.task-col {
  width: 280px;
  min-width: 0;
  background: var(--bg);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.task-col-header {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.task-col-list { flex: 1; overflow-y: auto; padding: var(--space-sm); }

/* ===== Column 3: Detail Area ===== */
.detail-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.detail-col-header {
  padding: var(--space-md) var(--space-xl);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: var(--space-md);
  font-size: 14px;
  font-weight: 600;
}
.detail-col-body { flex: 1; overflow-y: auto; padding: var(--space-xl); }

/* ===== Task Card ===== */
.task-card {
  display: block;
  background: var(--surface);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  margin-bottom: var(--space-sm);
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
  text-decoration: none;
  color: var(--text);
}
.task-card:hover {
  border-color: var(--primary);
  box-shadow: 0 0 12px var(--primary-glow);
}
.task-card.active {
  border-color: var(--primary);
  box-shadow: 0 0 16px var(--primary-glow-strong);
}

.task-card-name { font-size: 13px; font-weight: 500; }
.task-card-meta {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: var(--space-xs);
  display: flex;
  justify-content: space-between;
}

/* ===== Progress Bar ===== */
.mini-progress {
  height: 3px;
  background: var(--muted);
  border-radius: 2px;
  margin-top: var(--space-sm);
  overflow: hidden;
}
.mini-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 1s ease-out;
}

/* ===== Stat Cards ===== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}
.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  text-align: center;
}
.stat-value {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.stat-label { font-size: 13px; color: var(--text-secondary); margin-top: var(--space-xs); }

/* ===== Skeleton / Shimmer ===== */
.skeleton {
  background: var(--surface);
  border-radius: var(--radius);
  overflow: hidden;
}
.skeleton-shimmer {
  height: 100%;
  background: linear-gradient(90deg, var(--surface) 25%, var(--muted) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
.skeleton-text { height: 14px; margin-bottom: var(--space-sm); }
.skeleton-text.short { width: 60%; }
.skeleton-card { height: 64px; margin-bottom: var(--space-sm); border-radius: var(--radius-lg); }
.skeleton-stat { height: 76px; border-radius: var(--radius-lg); }

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ===== Phase Badge ===== */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}
.badge-proposal { background: rgba(139, 92, 246, 0.2); color: var(--accent); }
.badge-specs { background: rgba(6, 182, 212, 0.2); color: #06b6d4; }
.badge-design { background: rgba(59, 130, 246, 0.2); color: var(--primary); }
.badge-tasks { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
.badge-done { background: rgba(16, 185, 129, 0.2); color: var(--success); }

/* ===== Buttons ===== */
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  background: var(--muted);
  color: var(--text);
  border: none;
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 13px;
  font-family: var(--font-ui);
  transition: background .15s;
}
.btn:hover { background: var(--primary); color: #fff; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-hover); }

/* ===== Breadcrumb ===== */
.breadcrumb { font-size: 12px; color: var(--text-muted); }
.breadcrumb span { color: var(--text); }

/* ===== Detail Two-Column (FileTree + Content) ===== */
.detail-split {
  display: flex;
  gap: var(--space-xl);
  height: 100%;
}
.detail-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  overflow-y: auto;
}
.detail-content {
  flex: 1;
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  overflow-y: auto;
}

/* ===== File Tree ===== */
.file-tree-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.file-tree-item:hover { background: var(--muted); color: var(--text); }
.file-tree-item.active { background: rgba(59, 130, 246, 0.15); color: var(--primary); }

/* ===== Config Editor ===== */
.config-editor {
  width: 100%;
  min-height: 400px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-lg);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}
.config-editor:focus { border-color: var(--primary); outline: none; }

/* ===== Compose Form ===== */
.compose-form { max-width: 700px; }
.form-group { margin-bottom: var(--space-lg); }
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
}
.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-sm) var(--space-md);
  font-size: 14px;
  font-family: var(--font-ui);
}
.form-group textarea { resize: vertical; min-height: 80px; }
.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus { border-color: var(--primary); outline: none; }
.form-row { display: flex; gap: var(--space-md); }
.form-row .form-group { flex: 1; }

/* ===== Markdown Content ===== */
.markdown-body h1 { font-size: 1.5em; margin-bottom: var(--space-md); color: var(--primary); }
.markdown-body h2 { font-size: 1.25em; margin: var(--space-xl) 0 var(--space-md); }
.markdown-body h3 { font-size: 1.1em; margin: var(--space-lg) 0 var(--space-sm); }
.markdown-body p { margin-bottom: var(--space-sm); }
.markdown-body ul, .markdown-body ol { padding-left: var(--space-xl); margin: var(--space-sm) 0; }
.markdown-body li { margin: var(--space-xs) 0; }
.markdown-body code {
  background: var(--muted);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.markdown-body pre {
  background: var(--muted);
  padding: var(--space-md);
  border-radius: var(--radius);
  overflow-x: auto;
  margin: var(--space-md) 0;
}
.markdown-body pre code { background: none; padding: 0; }
.markdown-body table { border-collapse: collapse; width: 100%; margin: var(--space-md) 0; }
.markdown-body th, .markdown-body td {
  border: 1px solid var(--border);
  padding: var(--space-xs) var(--space-md);
  text-align: left;
  font-size: 13px;
}
.markdown-body th { background: var(--muted); }
.markdown-body hr { border: none; border-top: 1px solid var(--border); margin: var(--space-lg) 0; }
.markdown-body input[type="checkbox"] { margin-right: var(--space-xs); }

/* ===== Neon Pulse Indicator ===== */
.neon-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: var(--space-xs);
}
.neon-dot.online {
  background: var(--success);
  box-shadow: 0 0 6px var(--success), 0 0 12px var(--success-glow);
  animation: neon-pulse 2s ease-in-out infinite;
}
@keyframes neon-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ===== Content Fade-In ===== */
.fade-enter-active { transition: opacity .4s ease, transform .4s ease; }
.fade-enter-from { opacity: 0; transform: translateY(6px); }

/* ===== Code Rain (optional decoration) ===== */
.code-rain-line {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--success);
  opacity: 0.6;
  animation: rain-drop 2s linear infinite;
}
@keyframes rain-drop {
  0% { opacity: 0; transform: translateY(-10px); }
  10% { opacity: 0.8; }
  90% { opacity: 0.6; }
  100% { opacity: 0; transform: translateY(30px); }
}

/* ===== Collapse Toggle Button ===== */
.collapse-toggle {
  position: absolute;
  top: var(--space-md);
  z-index: 110;
  width: 24px;
  height: 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: left .3s ease;
}
.collapse-toggle:hover { background: var(--primary); color: #fff; }

/* ===== Responsive ===== */
@media (max-width: 1023px) {
  .sidebar-col { width: 48px; }
  .sidebar-brand { font-size: 0; padding: var(--space-md) var(--space-sm); }
  .sidebar-brand::first-letter { font-size: 14px; }
  .nav-item { justify-content: center; padding: var(--space-sm); font-size: 0; }
  .nav-item::first-letter { font-size: 13px; }
  .nav-section-label { display: none; }
  .sidebar-status { display: none; }
  .task-col { width: 240px; }
}
@media (max-width: 767px) {
  .app-shell { flex-direction: column; }
  .sidebar-col { display: none; }
  .sidebar-col.mobile-open {
    display: flex;
    position: fixed;
    top: 0; left: 0;
    width: 240px;
    height: 100vh;
    z-index: 200;
  }
  .task-col { width: 100%; height: 50%; }
  .detail-col { height: 50%; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}

/* ===== Reduced Motion ===== */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* ===== Empty State ===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
  color: var(--text-muted);
  text-align: center;
}
.empty-state p { margin-bottom: var(--space-md); }

/* ===== Utility ===== */
.text-muted { color: var(--text-muted); }
.text-secondary { color: var(--text-secondary); }
.mt-sm { margin-top: var(--space-sm); }
.mt-md { margin-top: var(--space-md); }
```

- [ ] **Step 2: Commit**

```bash
git add src/core/dashboard/static/app.css
git commit -m "feat: rewrite app.css with HagiCode design tokens and three-column layout styles"
```

---

### Task 3: 重写 layout.ts（三栏 HTML 骨架 + Vue 3 import map）

**Files:**
- Rewrite: `src/core/dashboard/pages/layout.ts`

- [ ] **Step 1: 编写新的 layout.ts**

```typescript
export function renderLayout(title: string, bodyContent: string, activeNav: string): string {
  const navItems = [
    { label: '任务看板', href: '/', icon: '📋', key: '/' },
    { label: '配置管理', href: '/config', icon: '⚙️', key: '/config' },
    { label: '新建 Change', href: '/compose', icon: '✨', key: '/compose' }
  ]

  const navHtml = navItems.map(item =>
    `<a href="${item.href}" class="nav-item${activeNav === item.key ? ' active' : ''}">${item.icon} ${item.label}</a>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — polaris dashboard</title>
  <link rel="stylesheet" href="/static/app.css">
  <script type="importmap">
  {
    "imports": {
      "vue": "https://unpkg.com/vue@3/dist/vue.esm-browser.js"
    }
  }
  </script>
</head>
<body>
  <div id="app">
    <div class="app-shell">
      <button class="collapse-toggle" id="collapse-btn" style="left:174px">◀</button>

      <aside class="sidebar-col" id="sidebar-col">
        <div class="sidebar-brand">
          &gt;_ polaris
          <small>dashboard v1.0</small>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-section-label">导航</div>
          ${navHtml}
          <div class="nav-section-label" style="margin-top:var(--space-md)">项目</div>
          <div id="project-nav"></div>
        </nav>
        <div class="sidebar-status" id="sidebar-status">
          <span class="neon-dot online"></span>
          加载中...
        </div>
      </aside>

      <section class="task-col" id="task-col">
        <div class="task-col-header">
          <span>任务列表</span>
          <span class="text-muted" style="font-size:11px" id="task-count"></span>
        </div>
        <div class="task-col-list" id="task-list"></div>
      </section>

      <main class="detail-col">
        <div class="detail-col-header" id="detail-header"></div>
        <div class="detail-col-body" id="detail-body">
          ${bodyContent}
        </div>
      </main>
    </div>
  </div>

  <script type="module" src="/static/app.js"></script>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/dashboard/pages/layout.ts
git commit -m "feat: rewrite layout.ts with three-column skeleton and Vue 3 import map"
```

---

### Task 4: 添加 /api/projects 端点

**Files:**
- Create: `src/core/dashboard/api/projects.ts`
- Modify: `src/core/dashboard/router.ts`

- [ ] **Step 1: 创建 projects.ts API**

```typescript
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface ProjectItem {
  name: string
  path: string
  changeCount: number
}

export function listProjects(projectRoot: string): { projects: ProjectItem[] } {
  const changesDir = join(projectRoot, 'openspec', 'changes')
  const changeCount = countChanges(changesDir)

  const projects: ProjectItem[] = [
    {
      name: projectRoot.split('/').pop() || 'current-project',
      path: projectRoot,
      changeCount
    }
  ]

  return { projects }
}

function countChanges(changesDir: string): number {
  if (!existsSync(changesDir)) return 0
  try {
    return readdirSync(changesDir, { withFileTypes: true })
      .filter(d => d.isDirectory()).length
  } catch {
    return 0
  }
}
```

- [ ] **Step 2: 在 router.ts 中注册新路由**

在 `router.ts` 的 `handleApiRoute` 函数中，`GET /api/schemas` 处理之后添加：

```typescript
// 在 router.ts 顶部 import 区域添加:
// (projectsApi 在 handleApiRoute 内动态 import)

// 在 handleApiRoute 函数内的动态 import 处，修改为:
const projectsApi = await import('./api/projects.js')

// 在 "GET /api/schemas" 条件之后添加:
// GET /api/projects
if (method === 'GET' && pathname === '/api/projects') {
  return json(res, projectsApi.listProjects(projectRoot))
}
```

具体修改位置（router.ts 第 64-65 行附近）:

```typescript
// 修改前:
const changesApi = await import('./api/changes.js')
const configsApi = await import('./api/configs.js')
const composeApi = await import('./api/compose.js')

// 修改后:
const changesApi = await import('./api/changes.js')
const configsApi = await import('./api/configs.js')
const composeApi = await import('./api/compose.js')
const projectsApi = await import('./api/projects.js')
```

在第 108 行 (`GET /api/schemas`) 之后添加:

```typescript
// GET /api/projects
if (method === 'GET' && pathname === '/api/projects') {
  return json(res, projectsApi.listProjects(projectRoot))
}
```

- [ ] **Step 3: 更新集成测试，加入 /api/projects 测试用例**

在 `tests/integration/dashboard.test.ts` 中添加测试:

```typescript
it('GET /api/projects returns project list', async () => {
  const res = await fetchJson('GET', '/api/projects')
  expect(res.status).toBe(200)
  const data = res.body as any
  expect(data.projects).toBeDefined()
  expect(data.projects.length).toBeGreaterThan(0)
  expect(data.projects[0].changeCount).toBeGreaterThanOrEqual(0)
})
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run tests/integration/dashboard.test.ts
```

Expected: 全部 PASS（含新测试）

- [ ] **Step 5: Commit**

```bash
git add src/core/dashboard/api/projects.ts src/core/dashboard/router.ts tests/integration/dashboard.test.ts
git commit -m "feat: add /api/projects endpoint for project list"
```

---

### Task 5: 简化 page 函数（board, change-detail, config-editor, compose）

**Files:**
- Modify: `src/core/dashboard/pages/board.ts`
- Modify: `src/core/dashboard/pages/change-detail.ts`
- Modify: `src/core/dashboard/pages/config-editor.ts`
- Modify: `src/core/dashboard/pages/compose.ts`

- [ ] **Step 1: 简化 board.ts**

```typescript
import { renderLayout } from './layout.js'
import { computeStats } from '../change-scanner.js'

export function renderBoardPage(projectRoot: string): string {
  const stats = computeStats(projectRoot)

  const body = `
    <div class="stats-grid" id="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalChanges}</div>
        <div class="stat-label">总 Changes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.doneTasks}</div>
        <div class="stat-label">已完成 Tasks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.pendingTasks}</div>
        <div class="stat-label">待处理 Tasks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalTasks}</div>
        <div class="stat-label">总 Tasks</div>
      </div>
    </div>

    <div id="board-detail">
      <div class="empty-state">
        <p>请在左侧选择一个 Change 查看详情</p>
        <a href="/compose" class="btn btn-primary">新建 Change</a>
      </div>
    </div>
  `

  return renderLayout('任务看板', body, '/')
}
```

- [ ] **Step 2: 简化 change-detail.ts**

保留 server 端渲染逻辑不变（仍然在 SSR 时渲染文档树 + Markdown 内容），但调整布局结构以匹配三栏 layout:

```typescript
import { join } from 'node:path'
import { renderLayout } from './layout.js'
import { getChangeDetail } from '../change-scanner.js'
import { renderMarkdown } from '../markdown.js'

export function renderChangeDetailPage(projectRoot: string, name: string): string {
  const changesDir = join(projectRoot, 'openspec', 'changes')
  const change = getChangeDetail(join(changesDir, name))

  const content = `
    <div class="detail-header">
      <a href="/" class="btn" style="margin-bottom:var(--space-md)">← 返回看板</a>
      <div style="display:flex;align-items:center;gap:var(--space-md)">
        <h2 style="margin:0;font-size:1.25rem">${escapeHtml(change.name)}</h2>
        <span class="badge badge-${change.phase}">${phaseLabel(change.phase)}</span>
        ${change.tasksTotal > 0 ? `<span style="font-size:13px;color:var(--text-secondary)">${change.tasksDone}/${change.tasksTotal} tasks</span>` : ''}
      </div>
    </div>

    <div class="detail-split">
      <aside class="detail-sidebar" id="file-tree-container">
        ${renderFileTree(change.name)}
      </aside>
      <div class="detail-content markdown-body" id="detail-content">
        ${renderDefaultContent(change.name)}
      </div>
    </div>
  `

  return renderLayout(`${change.name} — 详情`, content, '/')
}

// ... (保留 renderFileTree, renderDefaultContent, phaseLabel, escapeHtml 函数不变)
```

注意: change-detail.ts 的 SSR 渲染逻辑保留（不引入 Vue CDN 模式——直接在服务端渲染 Markdown 内容更简单可靠）。后续可以在客户端用 Vue 组件增强可交互性。

- [ ] **Step 3: 简化 config-editor.ts 和 compose.ts**

这两个页面保持不变（结构与 change-detail 类似调整），只修改 `renderLayout` 的第二个参数适配新的 activeNav 键值。

- [ ] **Step 4: 运行测试确保页面仍正确渲染**

```bash
npx vitest run tests/integration/dashboard.test.ts
```

Expected: 全部 PASS（页面标题、change 名称等仍出现在 HTML 中）

- [ ] **Step 5: Commit**

```bash
git add src/core/dashboard/pages/board.ts src/core/dashboard/pages/change-detail.ts src/core/dashboard/pages/config-editor.ts src/core/dashboard/pages/compose.ts
git commit -m "refactor: simplify page functions for three-column layout"
```

---

### Task 6: 创建 Vue 3 入口和基础组件（AppShell, MiniProgress, PhaseBadge, Breadcrumb, Skeleton）

**Files:**
- Rewrite: `src/core/dashboard/static/app.js`
- Create: `src/core/dashboard/static/components/MiniProgress.js`
- Create: `src/core/dashboard/static/components/PhaseBadge.js`
- Create: `src/core/dashboard/static/components/Breadcrumb.js`
- Create: `src/core/dashboard/static/components/Skeleton.js`

- [ ] **Step 1: 创建 MiniProgress.js**

```javascript
// src/core/dashboard/static/components/MiniProgress.js
const MiniProgress = {
  props: {
    done: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  computed: {
    percent() {
      return this.total === 0 ? 0 : Math.round((this.done / this.total) * 100)
    },
    color() {
      if (this.percent === 100) return 'var(--success)'
      if (this.percent >= 50) return 'var(--warning)'
      return 'var(--error)'
    }
  },
  template: `
    <div class="mini-progress">
      <div class="mini-progress-fill" :style="{ width: percent + '%', background: color }"></div>
    </div>
  `
}
```

- [ ] **Step 2: 创建 PhaseBadge.js**

```javascript
// src/core/dashboard/static/components/PhaseBadge.js
const PhaseBadge = {
  props: { phase: String },
  computed: {
    label() {
      const map = { proposal: '📝 Proposal', specs: '📐 Specs', design: '⚙️ Design', tasks: '🔨 Tasks', done: '✅ Done' }
      return map[this.phase] || this.phase
    },
    cssClass() {
      return 'badge badge-' + (this.phase || 'proposal')
    }
  },
  template: `<span :class="cssClass">{{ label }}</span>`
}
```

- [ ] **Step 3: 创建 Breadcrumb.js**

```javascript
// src/core/dashboard/static/components/Breadcrumb.js
const Breadcrumb = {
  props: { project: String, change: String },
  template: `
    <div class="breadcrumb">
      <span>{{ project }}</span>
      <template v-if="change"> / <strong>{{ change }}</strong></template>
    </div>
  `
}
```

- [ ] **Step 4: 创建 Skeleton.js**

```javascript
// src/core/dashboard/static/components/Skeleton.js
const Skeleton = {
  props: { variant: { type: String, default: 'text' } },
  computed: {
    className() {
      return 'skeleton skeleton-' + this.variant + (this.variant !== 'text' ? ' skeleton-shimmer' : '')
    }
  },
  template: `
    <div :class="className">
      <div v-if="variant === 'text'" class="skeleton-shimmer skeleton-text" :class="{ short: $attrs.short !== undefined }"></div>
      <div v-else class="skeleton-shimmer" style="height:100%"></div>
    </div>
  `
}
```

- [ ] **Step 5: 重写 app.js（Vue 3 入口，注册基础组件）**

```javascript
// src/core/dashboard/static/app.js
import { createApp, reactive } from 'vue'

const app = createApp({
  setup() {
    const state = reactive({
      loading: true,
      collapsed: false,
      projects: [],
      currentProject: null,
      tasks: [],
      currentTask: null
    })

    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects')
        const data = await res.json()
        state.projects = data.projects || []
        if (state.projects.length > 0 && !state.currentProject) {
          state.currentProject = state.projects[0]
        }
      } catch (e) {
        console.error('Failed to fetch projects:', e)
      }
    }

    async function fetchTasks() {
      try {
        const res = await fetch('/api/changes')
        const data = await res.json()
        state.tasks = Array.isArray(data) ? data : []
      } catch (e) {
        console.error('Failed to fetch tasks:', e)
      } finally {
        state.loading = false
      }
    }

    function selectProject(project) {
      state.currentProject = project
    }

    function selectTask(task) {
      state.currentTask = task
      if (task) {
        window.location.href = '/change/' + encodeURIComponent(task.name)
      }
    }

    function toggleSidebar() {
      state.collapsed = !state.collapsed
      const el = document.getElementById('sidebar-col')
      const btn = document.getElementById('collapse-btn')
      if (el) el.classList.toggle('collapsed', state.collapsed)
      if (btn) {
        btn.style.left = state.collapsed ? '18px' : '174px'
        btn.textContent = state.collapsed ? '▶' : '◀'
      }
    }

    return { state, selectProject, selectTask, toggleSidebar, fetchProjects, fetchTasks }
  },

  async mounted() {
    await this.fetchProjects()
    await this.fetchTasks()
  },

  template: `
    <div class="app-shell">
      <button class="collapse-toggle" id="collapse-btn" style="left:174px" @click="toggleSidebar">◀</button>

      <aside class="sidebar-col" id="sidebar-col">
        <div class="sidebar-brand">
          &gt;_ polaris
          <small>dashboard v1.0</small>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-section-label">导航</div>
          <a href="/" class="nav-item active">📋 任务看板</a>
          <a href="/config" class="nav-item">⚙️ 配置管理</a>
          <a href="/compose" class="nav-item">✨ 新建 Change</a>
          <div class="nav-section-label" style="margin-top:var(--space-md)">项目</div>
          <div v-for="p in state.projects" :key="p.name"
               class="nav-item" :class="{ active: state.currentProject && state.currentProject.name === p.name }"
               @click="selectProject(p)">
            📁 {{ p.name }}
          </div>
        </nav>
        <div class="sidebar-status">
          <span class="neon-dot online"></span>
          <template v-if="state.loading">加载中...</template>
          <template v-else>{{ state.projects.length }} 个项目</template>
        </div>
      </aside>

      <section class="task-col">
        <div class="task-col-header">
          <span>任务列表</span>
          <span class="text-muted" style="font-size:11px" v-if="!state.loading">{{ state.tasks.length }} 个任务</span>
        </div>
        <div class="task-col-list">
          <template v-if="state.loading">
            <div v-for="i in 4" :key="'sk-'+i" class="skeleton skeleton-card">
              <div class="skeleton-shimmer" style="height:100%"></div>
            </div>
          </template>
          <template v-else-if="state.tasks.length === 0">
            <div class="empty-state">
              <p>暂无 Changes</p>
            </div>
          </template>
          <a v-for="task in state.tasks" :key="task.name"
             :href="'/change/' + encodeURIComponent(task.name)"
             class="task-card"
             :class="{ active: state.currentTask && state.currentTask.name === task.name }"
             @click.prevent="selectTask(task)">
            <div class="task-card-name">{{ task.name }}</div>
            <div class="task-card-meta">
              <phase-badge :phase="task.phase"></phase-badge>
              <span>{{ task.tasksDone }}/{{ task.tasksTotal }}</span>
            </div>
            <mini-progress :done="task.tasksDone" :total="task.tasksTotal"></mini-progress>
          </a>
        </div>
      </section>

      <main class="detail-col">
        <div class="detail-col-header">
          <breadcrumb :project="state.currentProject ? state.currentProject.name : ''"
                       :change="state.currentTask ? state.currentTask.name : ''"></breadcrumb>
        </div>
        <div class="detail-col-body">
          <slot></slot>
        </div>
      </main>
    </div>
  `
})

// Register global components
app.component('MiniProgress', MiniProgress)
app.component('PhaseBadge', PhaseBadge)
app.component('Breadcrumb', Breadcrumb)
app.component('Skeleton', Skeleton)

app.mount('#app')
```

- [ ] **Step 6: 确认构建流程包含 components 目录**

检查 `package.json` 的 `build` 脚本:

```json
"build": "tsc && cp -r src/core/dashboard/static dist/core/dashboard/"
```

确认 `cp -r` 已递归复制整个 `static/` 目录（包含 `components/` 子目录）。

- [ ] **Step 7: Commit**

```bash
git add src/core/dashboard/static/app.js src/core/dashboard/static/components/
git commit -m "feat: add Vue 3 entry point and base components (MiniProgress, PhaseBadge, Breadcrumb, Skeleton)"
```

---

### Task 7: 创建 ProjectList 和 TaskCard 组件

**Files:**
- Create: `src/core/dashboard/static/components/ProjectList.js`
- Create: `src/core/dashboard/static/components/TaskCardList.js`
- Create: `src/core/dashboard/static/components/TaskCard.js`
- Modify: `src/core/dashboard/static/app.js`

- [ ] **Step 1: 创建 TaskCard.js**

```javascript
// src/core/dashboard/static/components/TaskCard.js
const TaskCard = {
  props: {
    task: Object,
    active: { type: Boolean, default: false }
  },
  template: `
    <a :href="'/change/' + encodeURIComponent(task.name)"
       class="task-card" :class="{ active: active }">
      <div class="task-card-name">{{ task.name }}</div>
      <div class="task-card-meta">
        <phase-badge :phase="task.phase"></phase-badge>
        <span>{{ task.tasksDone }}/{{ task.tasksTotal }}</span>
      </div>
      <mini-progress :done="task.tasksDone" :total="task.tasksTotal"></mini-progress>
    </a>
  `
}
```

- [ ] **Step 2: 创建 TaskCardList.js**

```javascript
// src/core/dashboard/static/components/TaskCardList.js
const TaskCardList = {
  props: {
    tasks: { type: Array, default: () => [] },
    currentTask: { type: Object, default: null },
    loading: { type: Boolean, default: false }
  },
  template: `
    <section class="task-col">
      <div class="task-col-header">
        <span>任务列表</span>
        <span class="text-muted" style="font-size:11px" v-if="!loading">{{ tasks.length }} 个任务</span>
      </div>
      <div class="task-col-list">
        <template v-if="loading">
          <div v-for="i in 4" :key="'sk-'+i" class="skeleton skeleton-card">
            <div class="skeleton-shimmer" style="height:100%"></div>
          </div>
        </template>
        <template v-else-if="tasks.length === 0">
          <div class="empty-state"><p>暂无 Changes</p></div>
        </template>
        <template v-else>
          <task-card v-for="task in tasks" :key="task.name"
            :task="task"
            :active="currentTask && currentTask.name === task.name">
          </task-card>
        </template>
      </div>
    </section>
  `
}
```

- [ ] **Step 3: 创建 ProjectList.js**

```javascript
// src/core/dashboard/static/components/ProjectList.js
const ProjectList = {
  props: {
    projects: { type: Array, default: () => [] },
    currentProject: { type: Object, default: null }
  },
  emits: ['select-project'],
  template: `
    <div>
      <div class="nav-section-label" style="margin-top:var(--space-md)">项目</div>
      <div v-for="p in projects" :key="p.name"
           class="nav-item"
           :class="{ active: currentProject && currentProject.name === p.name }"
           @click="$emit('select-project', p)">
        📁 {{ p.name }}
        <span class="text-muted" style="margin-left:auto;font-size:10px">{{ p.changeCount }}</span>
      </div>
    </div>
  `
}
```

- [ ] **Step 4: 更新 app.js——使用新增组件替换内联模板**

在 app.js 中注册新组件:

```javascript
// 在 createApp 调用前添加组件导入
app.component('TaskCard', TaskCard)
app.component('TaskCardList', TaskCardList)
app.component('ProjectList', ProjectList)
```

并将 app.js 根组件 template 中的侧边栏项目列表和任务列表区域替换为组件引用。

- [ ] **Step 5: Commit**

```bash
git add src/core/dashboard/static/components/TaskCard.js src/core/dashboard/static/components/TaskCardList.js src/core/dashboard/static/components/ProjectList.js src/core/dashboard/static/app.js
git commit -m "feat: add TaskCard, TaskCardList, ProjectList Vue components"
```

---

### Task 8: 创建 DetailPanel 及内容子组件

**Files:**
- Create: `src/core/dashboard/static/components/DetailPanel.js`
- Create: `src/core/dashboard/static/components/FileTree.js`
- Create: `src/core/dashboard/static/components/MarkdownView.js`
- Create: `src/core/dashboard/static/components/ConfigEditor.js`
- Create: `src/core/dashboard/static/components/ComposeForm.js`
- Create: `src/core/dashboard/static/components/StatCard.js`

- [ ] **Step 1: 创建 StatCard.js**

```javascript
// src/core/dashboard/static/components/StatCard.js
const StatCard = {
  props: { value: [Number, String], label: String },
  template: `
    <div class="stat-card">
      <div class="stat-value">{{ value }}</div>
      <div class="stat-label">{{ label }}</div>
    </div>
  `
}
```

- [ ] **Step 2: 创建 FileTree.js**

```javascript
// src/core/dashboard/static/components/FileTree.js
const FileTree = {
  props: { files: { type: Array, default: () => [] }, activeFile: String },
  emits: ['select-file'],
  template: `
    <div>
      <div v-for="f in files" :key="f.name"
           class="file-tree-item"
           :class="{ active: activeFile === f.name }"
           @click="$emit('select-file', f)">
        📄 {{ f.name }}
      </div>
      <p v-if="files.length === 0" class="text-muted" style="font-size:12px;padding:8px">暂无文件</p>
    </div>
  `
}
```

- [ ] **Step 3: 创建 MarkdownView.js**

```javascript
// src/core/dashboard/static/components/MarkdownView.js
const MarkdownView = {
  props: { content: { type: String, default: '' } },
  computed: {
    html() {
      return this.renderMarkdown(this.content)
    }
  },
  methods: {
    renderMarkdown(md) {
      if (!md) return ''
      let html = ''
      const lines = md.split('\n')
      let inCode = false
      let code = ''

      for (const line of lines) {
        if (line.startsWith('```')) {
          if (inCode) {
            html += '<pre><code>' + this.esc(code.trim()) + '</code></pre>\n'
            code = ''; inCode = false
          } else { inCode = true }
          continue
        }
        if (inCode) { code += line + '\n'; continue }

        const h = line.match(/^(#{1,6})\s+(.+)/)
        if (h) { html += '<h' + h[1].length + '>' + h[2] + '</h' + h[1].length + '>\n'; continue }

        if (/^[-*_]{3,}\s*$/.test(line)) { html += '<hr>\n'; continue }

        const cb = line.match(/^(\s*- )\[(.)\] (.+)/)
        if (cb) {
          html += '<li><input type="checkbox" disabled' + (cb[2] !== ' ' ? ' checked' : '') + '>' + cb[3] + '</li>\n'
          continue
        }

        const ul = line.match(/^(\s*- )(.+)/)
        if (ul) { html += '<li>' + ul[2] + '</li>\n'; continue }

        if (line.trim() === '') { html += '<br>'; continue }
        html += '<p>' + line + '</p>\n'
      }
      if (inCode && code) html += '<pre><code>' + this.esc(code.trim()) + '</code></pre>'
      return html
    },
    esc(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  },
  template: `<div class="markdown-body" v-html="html"></div>`
}
```

- [ ] **Step 4: 创建 ConfigEditor.js**

```javascript
// src/core/dashboard/static/components/ConfigEditor.js
const ConfigEditor = {
  props: { configPath: String, initialContent: { type: String, default: '' } },
  data() {
    return { content: this.initialContent, status: '', statusOk: false }
  },
  methods: {
    async save() {
      this.status = '保存中...'
      try {
        const res = await fetch('/api/configs/' + encodeURIComponent(this.configPath), {
          method: 'PUT',
          body: this.content
        })
        const data = await res.json()
        this.statusOk = data.ok
        this.status = data.ok ? '✓ 已保存' : '✗ ' + (data.error || '保存失败')
      } catch (err) {
        this.statusOk = false
        this.status = '✗ ' + err.message
      }
    }
  },
  template: `
    <div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <h3 style="margin:0;font-size:1.1rem">{{ configPath }}</h3>
        <button class="btn btn-primary" @click="save">保存</button>
        <span :style="{ color: statusOk ? 'var(--success)' : 'var(--error)', fontSize: '13px' }">{{ status }}</span>
      </div>
      <textarea class="config-editor" v-model="content"></textarea>
    </div>
  `
}
```

- [ ] **Step 5: 创建 ComposeForm.js**

```javascript
// src/core/dashboard/static/components/ComposeForm.js
const ComposeForm = {
  data() {
    return {
      name: '', schema: 'polaris-flow-backend',
      background: '', businessGoals: '', techGoals: '',
      scopeAdd: '', scopeModify: '', scopeRemove: '',
      acceptance: '', exclusions: '',
      status: '', statusOk: false, submitting: false
    }
  },
  methods: {
    async submit() {
      this.submitting = true
      this.status = '创建中...'
      try {
        const res = await fetch('/api/compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: this.name, schema: this.schema,
            background: this.background, businessGoals: this.businessGoals,
            techGoals: this.techGoals, scopeAdd: this.scopeAdd,
            scopeModify: this.scopeModify, scopeRemove: this.scopeRemove,
            acceptance: this.acceptance, exclusions: this.exclusions
          })
        })
        const data = await res.json()
        if (data.ok) {
          this.status = '✓ 创建成功，跳转中...'
          this.statusOk = true
          window.location.href = data.redirect || '/change/' + encodeURIComponent(this.name)
        } else {
          this.status = '✗ ' + (data.error || '创建失败')
          this.statusOk = false
          this.submitting = false
        }
      } catch (err) {
        this.status = '✗ ' + err.message
        this.statusOk = false
        this.submitting = false
      }
    }
  },
  template: `
    <form class="compose-form" @submit.prevent="submit">
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>Change 名称 <span class="text-muted">(kebab-case)</span></label>
          <input type="text" v-model="name" required placeholder="add-user-auth">
        </div>
        <div class="form-group" style="flex:1">
          <label>Schema</label>
          <select v-model="schema"><option value="polaris-flow-backend">polaris-flow-backend</option></select>
        </div>
      </div>
      <div class="form-group">
        <label>业务背景</label>
        <textarea v-model="background" rows="3" placeholder="为什么需要这个变更？"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group"><label>业务目标</label><textarea v-model="businessGoals" rows="2"></textarea></div>
        <div class="form-group"><label>技术目标</label><textarea v-model="techGoals" rows="2"></textarea></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>新增范围</label><textarea v-model="scopeAdd" rows="2"></textarea></div>
        <div class="form-group"><label>修改范围</label><textarea v-model="scopeModify" rows="2"></textarea></div>
        <div class="form-group"><label>删除范围</label><textarea v-model="scopeRemove" rows="2"></textarea></div>
      </div>
      <div class="form-group"><label>验收标准</label><textarea v-model="acceptance" rows="2"></textarea></div>
      <div class="form-group"><label>排除范围</label><textarea v-model="exclusions" rows="2"></textarea></div>
      <div style="display:flex;align-items:center;gap:12px">
        <button type="submit" class="btn btn-primary" :disabled="submitting">创建 Change</button>
        <span :style="{ color: statusOk ? 'var(--success)' : 'var(--error)', fontSize: '13px' }">{{ status }}</span>
      </div>
    </form>
  `
}
```

- [ ] **Step 6: 创建 DetailPanel.js**

```javascript
// src/core/dashboard/static/components/DetailPanel.js
const DetailPanel = {
  props: {
    pageType: { type: String, default: 'board' },
    stats: { type: Object, default: null },
    change: { type: Object, default: null },
    configPath: { type: String, default: '' },
    configContent: { type: String, default: '' }
  },
  data() {
    return { activeFile: null }
  },
  computed: {
    selectedFileContent() {
      if (!this.activeFile || !this.change || !this.change.files) return ''
      const file = this.change.files.find(f => f.name === this.activeFile)
      return file ? file.content : ''
    }
  },
  methods: {
    onSelectFile(file) {
      this.activeFile = file.name
    }
  },
  template: `
    <div>
      <template v-if="pageType === 'board' && stats">
        <div class="stats-grid">
          <stat-card :value="stats.totalChanges" label="总 Changes"></stat-card>
          <stat-card :value="stats.doneTasks" label="已完成 Tasks"></stat-card>
          <stat-card :value="stats.pendingTasks" label="待处理 Tasks"></stat-card>
          <stat-card :value="stats.totalTasks" label="总 Tasks"></stat-card>
        </div>
      </template>

      <template v-else-if="pageType === 'change-detail' && change">
        <div class="detail-split">
          <aside class="detail-sidebar">
            <file-tree :files="change.files" :active-file="activeFile" @select-file="onSelectFile"></file-tree>
          </aside>
          <div class="detail-content">
            <markdown-view :content="selectedFileContent"></markdown-view>
          </div>
        </div>
      </template>

      <template v-else-if="pageType === 'config'">
        <config-editor :config-path="configPath" :initial-content="configContent"></config-editor>
      </template>

      <template v-else-if="pageType === 'compose'">
        <compose-form></compose-form>
      </template>

      <div v-else class="empty-state">
        <p>请在左侧选择一个 Change 查看详情</p>
      </div>
    </div>
  `
}
```

- [ ] **Step 7: 在 app.js 中注册所有新组件**

```javascript
app.component('StatCard', StatCard)
app.component('FileTree', FileTree)
app.component('MarkdownView', MarkdownView)
app.component('ConfigEditor', ConfigEditor)
app.component('ComposeForm', ComposeForm)
app.component('DetailPanel', DetailPanel)
```

- [ ] **Step 8: Commit**

```bash
git add src/core/dashboard/static/components/
git commit -m "feat: add DetailPanel, FileTree, MarkdownView, ConfigEditor, ComposeForm, StatCard components"
```

---

### Task 9: 加固静态文件服务（路径穿越防护）

**Files:**
- Modify: `src/core/dashboard/router.ts`

- [ ] **Step 1: 在 serveStatic 中添加路径穿越检查**

注意：`serveStatic` 已通过 `join(__dirname, 'static', filename)` 自然支持子目录（如 `components/AppShell.js`），无需修改路由逻辑。此任务仅添加安全加固。

```typescript
// 修改前:
function serveStatic(res: ServerResponse, filename: string): void {
  const filePath = join(__dirname, 'static', filename)
  ...
}

// 修改后:
function serveStatic(res: ServerResponse, filename: string): void {
  const filePath = join(__dirname, 'static', filename)
  // Security: prevent path traversal
  const resolved = filePath
  const staticRoot = join(__dirname, 'static')
  if (!resolved.startsWith(staticRoot)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  ...
}
```

同样的路径安全检查应用到路由分发中的 `/static/` 处理。

- [ ] **Step 2: Commit**

```bash
git add src/core/dashboard/router.ts
git commit -m "fix: add path traversal protection for static file serving"
```

---

### Task 10: 编写设计规范网站页面和品牌特效

**Files:**
- Modify: `src/core/dashboard/static/app.css`（追加代码雨和霓虹特效样式，已在 Task 2 中包含）
- No new files needed（特效样式已在 app.css 中定义）

- [ ] **Step 1: 确认 CSS 动画已完整**

检查 `app.css` 中已包含:
- `@keyframes shimmer` (骨架屏)
- `@keyframes neon-pulse` (霓虹呼吸灯)
- `@keyframes rain-drop` (代码雨)
- `.neon-dot` / `.neon-dot.online` (状态指示器)
- `.code-rain-line` (代码雨线条)

以上样式已在 Task 2 的 app.css 中完整实现。

- [ ] **Step 2: Commit**

```bash
# 确认 CSS 特效样式已通过 Task 2 的 commit 提交
git log --oneline -1
```

---

### Task 11: 响应式适配

**Files:**
- Modify: `src/core/dashboard/static/app.css`（响应式已在 Task 2 中包含）

- [ ] **Step 1: 确认响应式断点 CSS 已完整**

检查 `app.css` 中已包含:
- `@media (max-width: 1023px)` — 栏1折叠为48px图标模式，栏2缩至240px
- `@media (max-width: 767px)` — 单栏布局，栏1隐藏（通过 mobile-open class 控制），栏2和栏3上下排列
- `.stats-grid` 在移动端变为 `grid-template-columns: repeat(2, 1fr)`

已在 Task 2 中实现。

- [ ] **Step 2: Commit**

```bash
# 响应式样式已通过 Task 2 的 commit 提交
git log --oneline -1
```

---

### Task 12: 更新测试

**Files:**
- Modify: `tests/integration/dashboard.test.ts`
- Modify: `tests/unit/dashboard-markdown.test.ts`

- [ ] **Step 1: 更新集成测试——验证三栏布局 HTML 结构**

在 `tests/integration/dashboard.test.ts` 中添加:

```typescript
it('GET / returns three-column layout HTML', async () => {
  const res = await fetchText('/')
  expect(res.status).toBe(200)
  expect(res.body).toContain('class="app-shell"')
  expect(res.body).toContain('class="sidebar-col"')
  expect(res.body).toContain('class="task-col"')
  expect(res.body).toContain('class="detail-col"')
})

it('GET / loads Vue 3 import map', async () => {
  const res = await fetchText('/')
  expect(res.body).toContain('vue.esm-browser.js')
})

it('GET / returns stat cards in detail area', async () => {
  makeChange('test-change', {
    'proposal.md': '# Test'
  })
  const res = await fetchText('/')
  expect(res.body).toContain('stats-grid')
  expect(res.body).toContain('总 Changes')
})
```

- [ ] **Step 2: 更新集成测试——适配新的 page 输出**

修改现有测试中的断言以匹配新布局:

```typescript
// 修改前:
expect(res.body).toContain('任务看板')
// 保持不变（新布局仍包含"任务看板"）✓

// 修改前:
expect(res.body).toContain('暂无 Changes')
// 修改为:
expect(res.body).toContain('暂无 Changes')
// (TaskCardList 组件在空列表时渲染此文本)
```

- [ ] **Step 3: 运行全部测试**

```bash
npx vitest run
```

Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: update integration tests for three-column layout and Vue 3 setup"
```

---

### Task 13: 端到端验证

- [ ] **Step 1: 构建项目**

```bash
npm run build
```

Expected: tsc 编译成功 + static/ 目录（含 components/）正确复制到 dist/

- [ ] **Step 2: 启动 dashboard 验证**

```bash
npm run dev -- dashboard --port 3700
```

打开浏览器访问 `http://localhost:3700`，验证:
- 三栏布局正确渲染
- 侧边栏项目列表显示
- 任务卡片列表显示（或"暂无 Changes"空状态）
- 骨架屏 shimmer 动画在加载时出现
- 卡片 hover 蓝色边框 + glow 效果
- 霓虹呼吸灯在侧边栏底部闪烁
- 点击任务卡片跳转到详情页
- Config 页面和 Compose 页面正常
- 响应式：缩小浏览器窗口到 768px 以下，布局切换

- [ ] **Step 3: Commit（如有修改）**

```bash
git add -A
git commit -m "chore: final adjustments after E2E verification"
```
