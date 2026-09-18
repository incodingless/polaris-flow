# Dashboard HagiCode 风格重设计

将 polaris-cli dashboard 从 Catppuccin 纯原生技术栈升级为 HagiCode 风格 UI，采用 Vue 3 CDN 渐进增强方案。

## 目标

- 视觉风格从 Catppuccin Mocha 迁移到 HagiCode Dark（Slate 底色 + blue-500 发光主调）
- 引入骨架屏/shimmmer、微交互动效、代码雨/霓虹品牌特效
- 顶栏 Tab 布局改为三栏 IDE 风格布局
- 建立 design.md 设计规范保证视觉一致性

## 非目标

- 不引入前端构建步骤（Vite/webpack）
- 不使用 .vue SFC 单文件组件
- 不做 SPA 客户端路由（保持 SSR 全页刷新）
- 不改动现有 Server 端架构和 API 端点（仅新增 /api/projects）
- PTY 终端、搜索功能等 Phase 2 需求

---

## 架构

```
src/core/dashboard/
├── server.ts                    # 不变
├── router.ts                    # 不变（仅路由注册处微调）
├── change-scanner.ts            # 不变
├── markdown.ts                  # 不变
├── api/
│   ├── changes.ts               # 不变
│   ├── configs.ts               # 不变
│   ├── compose.ts               # 不变
│   └── projects.ts              # 新增：GET /api/projects
├── pages/
│   ├── layout.ts                # 重写：新 HTML 骨架（三栏 mount point）
│   ├── board.ts                 # 简化：仅提供 mount point + 初始数据 JSON
│   ├── change-detail.ts         # 简化：同上
│   ├── config-editor.ts         # 简化：同上
│   └── compose.ts               # 简化：同上
├── design.md                    # 新增：设计规范文档
└── static/
    ├── app.css                  # 重写：CSS 自定义属性 + 全局样式 + 动画
    ├── app.js                   # 重写：Vue 3 createApp 入口
    └── components/              # 新增：Vue 3 组件目录
        ├── AppShell.js          # 三栏布局容器
        ├── ProjectList.js       # 栏 1：项目列表
        ├── TaskCardList.js      # 栏 2：任务卡片列表
        ├── TaskCard.js          # 单个任务卡片
        ├── DetailPanel.js       # 栏 3：内容区容器
        ├── FileTree.js          # 文档树（change 详情）
        ├── MarkdownView.js      # Markdown 渲染
        ├── ConfigEditor.js      # Config 编辑
        ├── ComposeForm.js       # Compose 表单
        ├── StatCard.js          # 统计卡片
        ├── MiniProgress.js      # 微型进度条
        ├── Skeleton.js          # 通用骨架屏
        ├── Breadcrumb.js        # 面包屑导航
        └── PhaseBadge.js        # 阶段标签
```

### 技术选型

- **Vue 3 CDN**（~40KB gzipped）：通过 import map 从 CDN 加载，无需 npm install
- **纯 .js 文件**：组件用 `app.component()` 注册或 Options API 对象，不用 .vue SFC
- **零构建步骤**：`tsc` 编译 TypeScript 后直接使用，与现有构建流程一致
- **reactive() 状态**：根组件一个 `reactive()` 对象管理全部状态，不引入 Pinia/Vuex

### Vue 3 加载方式

```html
<script type="importmap">
{
  "imports": {
    "vue": "https://unpkg.com/vue@3/dist/vue.esm-browser.js"
  }
}
</script>
<script type="module" src="/static/app.js"></script>
```

---

## 布局：三栏结构

```
┌──────────────┬──────────────────┬────────────────────────────┐
│  栏 1 (180px) │  栏 2 (280px)     │  栏 3 (flex)               │
│  项目列表      │  任务卡片列表       │  详情内容                   │
│              │                  │                            │
│  📁 my-proj  │ ┌──────────────┐ │  my-proj / add-user-auth   │
│  📁 demo     │ │ add-user-auth │ │  ┌────────┬─────────────┐ │
│  📁 exp-01   │ │ 📐 Specs 43% │ │  │ 文档树  │ Markdown    │ │
│              │ └──────────────┘ │  │        │ 内容        │ │
│              │ ┌──────────────┐ │  │        │             │ │
│              │ │ fix-login    │ │  │        │             │ │
│              │ │ 🔨 Tasks 50% │ │  └────────┴─────────────┘ │
│              │ └──────────────┘ │                            │
└──────────────┴──────────────────┴────────────────────────────┘
```

### 栏 1：项目列表（180px，可折叠）

- 项目目录列表，当前项目蓝色高亮 + 左侧蓝色边线
- 底部状态指示：项目数量 + 绿色霓虹灯
- 折叠按钮：点击后宽度 180→0（transition .3s），内容区自动扩展
- 响应式：<768px 时通过汉堡菜单切换显示

### 栏 2：任务卡片列表（280px）

- 当前项目的 change 列表，卡片形式自上而下排列
- 每张卡片：change 名称 + 阶段标签 + 进度条 + tasks 进度
- 选中卡片：蓝色边框 + box-shadow 微光（`0 0 12px rgba(59,130,246,0.15)`）
- 加载态：骨架屏卡片占位 + shimmer 动画

### 栏 3：内容区（flex: 1）

- 面包屑导航：项目名 / change 名
- 阶段标签（Proposal/Specs/Design/Tasks/Done）彩色 badge
- 根据当前页面类型渲染不同子组件：
  - 看板首页：统计卡片（StatCard × 4）
  - Change 详情：FileTree + MarkdownView
  - Config 编辑：ConfigEditor
  - Compose：ComposeForm

### 响应式断点

| 断点 | 布局 |
|------|------|
| ≥1024px | 完整三栏（180 + 280 + flex） |
| 768-1023px | 两栏：栏 1 折叠为图标模式(48px) + 栏 2 (240px) + 栏 3 |
| <768px | 单栏内容 + 底部 Tab 导航 |

---

## 视觉设计系统

### 色彩

```css
:root {
  /* 背景层级 */
  --bg: #0f172a;           /* 最深底色 */
  --surface: #1e293b;      /* 卡片/面板背景 */
  --muted: #334155;        /* 分隔线/已选态背景 */

  /* 品牌色 */
  --primary: #3b82f6;      /* blue-500，主色调 */
  --primary-glow: rgba(59, 130, 246, 0.15);

  /* 语义色 */
  --success: #10b981;      /* 完成/在线 */
  --warning: #f59e0b;      /* 进行中 */
  --error: #ef4444;        /* 错误/阻塞 */
  --accent: #8b5cf6;       /* 强调/Proposal 阶段 */

  /* 文本 */
  --text: #e2e8f0;         /* 正文 */
  --text-secondary: #94a3b8; /* 辅助文字 */
  --text-muted: #64748b;   /* 弱化文字 */
}
```

Catppuccin Mocha → Slate Dark 的完整对照：见 design.md 色彩章节。

### 字体

| 用途 | 字体 | 示例 |
|------|------|------|
| 品牌/代码/数字 | JetBrains Mono | `>_ polaris` |
| UI 正文 | -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif | 任务看板 |
| 编辑器内容 | JetBrains Mono | `schema: polaris/v1` |

字体通过 `@font-face` 引用 woff2 格式，`font-display: swap` 确保不阻塞渲染。

### 间距

基于 4px 阶梯：`xs: 4px, sm: 8px, md: 12px, lg: 16px, xl: 24px, 2xl: 32px`

---

## 动效系统

### 第一层：加载态（骨架屏 + Shimmer）

- 统计卡片骨架屏：4 个占位卡片，shimmer 动画 1.5s
- 任务卡片骨架屏：3-5 个占位卡片，标题行+描述行+进度条逐行占位
- 详情区骨架屏：文档树占位 + 内容区占位
- 动画：`background: linear-gradient(90deg, var(--surface) 25%, var(--muted) 50%, var(--surface) 75%)` + `background-size: 200% 100%` + animation

### 第二层：微交互

| 触发 | 效果 | 时长 |
|------|------|------|
| 卡片 hover | 蓝色边框 + box-shadow 微光 | .2s ease |
| 选中卡片 | 边框保持蓝色 + glow 增强 | 即时 + 持续 |
| 侧边栏折叠 | 宽度 180→0 + 内容区扩展 | .3s ease |
| 详情加载完成 | 骨架屏消失 + 内容从下方淡入（translateY 6px→0） | .4s ease |
| 进度条 | 数据加载后从 0 动画到目标值 | 1s ease-out |
| 页面间切换 | SSR 全页刷新（无 SPA 过渡） | N/A |

### 第三层：品牌特效（可选装饰）

- **代码雨装饰**：品牌 banner 区域（页面顶部可选），终端风格代码行逐条淡出
- **霓虹呼吸灯**：侧边栏底部状态指示器，`box-shadow: 0 0 6px primary, 0 0 12px primary` + opacity pulse
- 特效仅作氛围装饰，不影响功能使用，可用 CSS `@media (prefers-reduced-motion)` 关闭

### 动效原则

- 只用 `transform` 和 `opacity` 做动画，避免触发 layout/paint
- 尊重 `prefers-reduced-motion` 用户偏好
- 骨架屏 → 微交互 → 特效，按此优先级实现

---

## 组件设计

### AppShell（根组件）

- 职责：三栏布局容器、侧边栏折叠状态、项目/任务选中状态
- 状态：`reactive({ projects, currentProject, tasks, currentTask, loading, sidebarCollapsed })`
- 生命周期：`onMounted` 时 fetch `/api/projects` + `/api/changes`
- 提供状态给子组件（provide/inject 或 props drilling）

### ProjectList

- Props: `projects`, `currentProject`, `collapsed`
- Emits: `select-project`
- 渲染项目列表 + 折叠按钮 + 状态指示器

### TaskCardList

- Props: `tasks`, `currentTask`, `loading`
- Emits: `select-task`
- 渲染骨架屏（loading=true）或任务卡片列表

### TaskCard

- Props: `task`, `active`
- Emits: `click`
- 卡片 UI + hover/active 样式 + MiniProgress

### DetailPanel

- Props: `currentTask`, `loading`
- 根据页面类型渲染：默认统计卡片 / Change 详情 / Config 编辑 / Compose 表单
- 通过 `data-page` 属性或 URL path 判断渲染哪个子组件

### 其他子组件

- **FileTree**：文档列表，点击切换内容
- **MarkdownView**：正则渲染 Markdown（复用现有逻辑）
- **ConfigEditor**：textarea + 保存按钮 + YAML 校验
- **ComposeForm**：表单字段 + 提交
- **StatCard**：数字 + 标签，带骨架屏
- **MiniProgress**：微型进度条，颜色随百分比变化
- **Skeleton**：通用骨架屏（支持 variant: text/card/rect）
- **Breadcrumb**：面包屑导航
- **PhaseBadge**：阶段标签（颜色映射）

---

## 数据流

### 状态管理

```js
// AppShell.js
const state = reactive({
  projects: [],
  currentProject: null,
  tasks: [],
  currentTask: null,
  loading: { projects: false, tasks: false, detail: false },
  sidebarCollapsed: false
})
```

一个 `reactive()` 对象足够——状态规模小、无跨页面共享需求。

### API 端点

完全复用现有端点，新增一个：

```
GET /api/projects    → { projects: [{ name, path, changeCount }] }
```

扫描项目根目录下的子目录或 workspaces 配置，返回可用项目列表。

### 交互流

1. **页面加载** → show skeleton → fetch `/api/projects` + `/api/changes` → render cards
2. **点击项目** → highlight project → fetch `/api/changes` → update task cards
3. **点击任务卡片** → blue border + glow → fetch `/api/changes/:name` → detail panel fade-in
4. **侧边栏折叠** → width 180→0 (transition .3s) → task list shifts left
5. **Toggle task checkbox** → optimistic UI update → POST `/api/changes/:n/tasks/:id` → progress bar animate

---

## design.md 设计规范

存放位置：`src/core/dashboard/design.md`

包含 8 个章节：
1. 视觉主题与氛围
2. 色彩调色板与语义角色
3. 字体层级规范（h1-h6, body, small, code）
4. 间距系统（4px 阶梯）
5. 组件样式规范（按钮、卡片、表单、进度条、骨架屏、badge）
6. 深度与层级（阴影、发光、z-index）
7. 动效规范（时长、缓动、触发条件）
8. 响应式断点与布局策略

---

## 实现策略

### Phase 1：视觉皮肤升级（CSS + 布局）

- 重写 `app.css`：CSS 变量 + 全局样式 + 动画 @keyframes
- 重写 `layout.ts`：三栏 HTML 骨架 + import map
- 实现 AppShell + ProjectList + TaskCardList 静态版本
- 骨架屏 + shimmer
- 不引入 Vue 3（纯 CSS 可实现骨架屏和基础动画）

### Phase 2：Vue 3 组件化

- 引入 Vue 3 CDN
- 将页面拆分为 Vue 组件
- 实现响应式状态管理和数据流
- 微交互动效（hover/选中/过渡/折叠）

### Phase 3：品牌特效 + design.md

- 代码雨、霓虹灯品牌特效
- 编写 design.md 设计规范
- 响应式适配
- 测试与优化

---

## 测试策略

- **单元测试**：Vue 组件渲染（vitest + jsdom）、API 端点
- **集成测试**：server 启动 + HTTP 请求 + 验证 HTML 结构含 Vue mount point
- 不做浏览器 E2E 测试