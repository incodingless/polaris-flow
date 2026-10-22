# Multi-Project Dashboard 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有单项目仪表盘改造为支持多项目管理的 SPA 仪表盘

**Architecture:** hash-based SPA（Vue 3 CDN），顶部导航栏 + 主内容区 + 底部状态栏。项目数据存储在 `~/.polaris/projects.json`。服务端统一返回 index.html，客户端接管路由。

**Tech Stack:** TypeScript (server), Vue 3 CDN (client), vanilla CSS, Node.js HTTP server

---

## 文件结构

```
src/core/dashboard/
├── server.ts              # 修改：统一入口 + API 路由
├── router.ts              # 重写：简化 API 路由
├── change-scanner.ts      # 保留不变
├── markdown.ts            # 保留不变
├── api/
│   ├── changes.ts         # 修改：支持 projectRoot 参数
│   ├── configs.ts         # 保留不变
│   ├── compose.ts         # 保留不变
│   └── projects.ts        # 重写：中心化多项目 CRUD
├── pages/
│   └── shell.ts           # 新增：SPA 外壳 index.html
└── static/
    ├── app.js             # 重写：SPA 路由 + 所有页面组件
    ├── app.css            # 修改：新增样式
    └── components/        # 保留：PhaseBadge, MiniProgress, StatCard, Skeleton 等
```

---

### Task 1: 项目数据持久化 API

**Files:**
- Rewrite: `src/core/dashboard/api/projects.ts`
- Modify: `src/core/dashboard/router.ts:63-122` (add new API routes)

- [ ] **Step 1: 重写 projects.ts 支持中心化多项目 CRUD**

用以下代码替换 `src/core/dashboard/api/projects.ts`：

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

export interface ProjectItem {
  id: string
  name: string
  path: string
  createdAt: string
}

interface ProjectsData {
  projects: ProjectItem[]
}

const PROJECTS_FILE = join(homedir(), '.polaris', 'projects.json')

function readProjects(): ProjectsData {
  if (!existsSync(PROJECTS_FILE)) {
    return { projects: [] }
  }
  try {
    const raw = readFileSync(PROJECTS_FILE, 'utf8')
    return JSON.parse(raw) as ProjectsData
  } catch {
    return { projects: [] }
  }
}

function writeProjects(data: ProjectsData): void {
  const dir = dirname(PROJECTS_FILE)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2))
}

export function listProjects(_projectRoot: string): { projects: ProjectItem[] } {
  return readProjects()
}

export function addProject(body: string): { project?: ProjectItem; error?: string } {
  const data = JSON.parse(body) as { name?: string; path?: string }
  if (!data.name || !data.name.trim()) {
    return { error: '项目别名不能为空' }
  }
  if (!data.path || !data.path.trim()) {
    return { error: '项目路径不能为空' }
  }
  if (!existsSync(data.path)) {
    return { error: `目录不存在: ${data.path}` }
  }

  const store = readProjects()
  if (store.projects.some(p => p.path === data.path)) {
    return { error: '该项目路径已存在' }
  }

  const project: ProjectItem = {
    id: randomUUID(),
    name: data.name.trim(),
    path: data.path.trim(),
    createdAt: new Date().toISOString()
  }

  store.projects.push(project)
  writeProjects(store)

  return { project }
}

export function deleteProject(body: string): { ok?: boolean; error?: string } {
  const data = JSON.parse(body) as { id?: string }
  if (!data.id) {
    return { error: '缺少项目 ID' }
  }

  const store = readProjects()
  const idx = store.projects.findIndex(p => p.id === data.id)
  if (idx === -1) {
    return { error: '项目不存在' }
  }

  store.projects.splice(idx, 1)
  writeProjects(store)

  return { ok: true }
}

export function getProject(id: string): { project?: ProjectItem; error?: string } {
  const store = readProjects()
  const project = store.projects.find(p => p.id === id)
  if (!project) {
    return { error: '项目不存在' }
  }
  if (!existsSync(project.path)) {
    return { error: `项目目录不存在: ${project.path}` }
  }
  return { project }
}
```

- [ ] **Step 2: 在 router.ts 中添加新 API 路由**

在 `src/core/dashboard/router.ts` 的 `handleApiRoute` 函数中，替换现有的 projects 路由部分（`// GET /api/projects` 开始的几行）：

找到：
```typescript
    // GET /api/projects
    if (method === 'GET' && pathname === '/api/projects') {
      return json(res, projectsApi.listProjects(projectRoot))
    }
```

替换为：
```typescript
    // GET /api/projects
    if (method === 'GET' && pathname === '/api/projects') {
      return json(res, projectsApi.listProjects(projectRoot))
    }

    // POST /api/projects
    if (method === 'POST' && pathname === '/api/projects') {
      return json(res, projectsApi.addProject(body))
    }

    // DELETE /api/projects
    if (method === 'DELETE' && pathname === '/api/projects') {
      return json(res, projectsApi.deleteProject(body))
    }
```

- [ ] **Step 3: 编译并验证**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run build
```

预期：编译成功，无类型错误。

- [ ] **Step 4: Commit**

```bash
git add src/core/dashboard/api/projects.ts src/core/dashboard/router.ts
git commit -m "feat: add centralized multi-project CRUD API with projects.json storage"
```

---

### Task 2: SPA 服务端改造

**Files:**
- Create: `src/core/dashboard/pages/shell.ts`
- Modify: `src/core/dashboard/router.ts:132-176` (handlePageRoute)

- [ ] **Step 1: 创建 SPA 外壳页面**

创建 `src/core/dashboard/pages/shell.ts`：

```typescript
export function renderShell(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>polaris dashboard</title>
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
  <div id="app"></div>
  <script type="module" src="/static/app.js"></script>
</body>
</html>`
}
```

- [ ] **Step 2: 修改 handlePageRoute 统一返回 index.html**

在 `src/core/dashboard/router.ts` 中，将 `handlePageRoute` 函数替换为：

```typescript
async function handlePageRoute(
  _pathname: string,
  res: ServerResponse,
  _projectRoot: string
): Promise<void> {
  try {
    const shellPage = await import('./pages/shell.js')
    html(res, shellPage.renderShell())
  } catch (err) {
    res.writeHead(500)
    res.end(`<h1>Error</h1><pre>${(err as Error).message}</pre>`)
  }
}
```

同时删除文件顶部的 `boardPage`、`changeDetailPage`、`configEditorPage`、`composePage` 相关的 import（它们不再需要）。

- [ ] **Step 3: 编译验证**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/core/dashboard/pages/shell.ts src/core/dashboard/router.ts
git commit -m "feat: serve SPA shell for all page routes"
```

---

### Task 3: SPA 路由 + 布局外壳

**Files:**
- Rewrite: `src/core/dashboard/static/app.js`
- Modify: `src/core/dashboard/static/app.css`

这是最大的一步——创建新的 SPA 应用，包含 hash 路由、全局布局和所有页面组件。

- [ ] **Step 1: 重写 app.js — SPA 入口 + 路由 + 全局状态 + 布局组件**

用以下代码替换 `src/core/dashboard/static/app.js`：

```javascript
import { createApp, reactive, computed, watch } from 'vue'

/* ===== Hash Router ===== */
function useRouter() {
  const route = reactive({ hash: window.location.hash || '#/home' })

  window.addEventListener('hashchange', () => {
    route.hash = window.location.hash || '#/home'
  })

  function navigate(hash) {
    window.location.hash = hash
  }

  return { route, navigate }
}

/* ===== App ===== */
const app = createApp({
  setup() {
    const { route, navigate } = useRouter()

    const state = reactive({
      loading: false,
      projects: [],
      currentProject: null,
      currentProjectId: localStorage.getItem('polaris-current-project-id') || null,
      tasks: [],
      currentTask: null,
      // Home stats
      homeStats: { totalProjects: 0, totalTasks: 0, pendingTasks: 0, doneTasks: 0 }
    })

    /* ---- Projects ---- */
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects')
        const data = await res.json()
        state.projects = data.projects || []
        if (state.currentProjectId && state.projects.length > 0) {
          const found = state.projects.find(p => p.id === state.currentProjectId)
          if (found) {
            state.currentProject = found
          } else {
            state.currentProject = state.projects[0]
            state.currentProjectId = state.projects[0].id
            localStorage.setItem('polaris-current-project-id', state.projects[0].id)
          }
        } else if (state.projects.length > 0 && !state.currentProject) {
          state.currentProject = state.projects[0]
          state.currentProjectId = state.projects[0].id
        }
      } catch (e) {
        console.error('Failed to fetch projects:', e)
      }
    }

    function selectProject(project) {
      state.currentProject = project
      state.currentProjectId = project.id
      localStorage.setItem('polaris-current-project-id', project.id)
      state.currentTask = null
      state.tasks = []
    }

    async function addProject(name, path) {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await fetchProjects()
      if (data.project) {
        selectProject(data.project)
      }
      return data
    }

    async function deleteProject(id) {
      const res = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await fetchProjects()
      if (state.currentProjectId === id) {
        state.currentProject = state.projects.length > 0 ? state.projects[0] : null
        state.currentProjectId = state.currentProject ? state.currentProject.id : null
      }
      return data
    }

    /* ---- Tasks ---- */
    async function fetchTasks() {
      if (!state.currentProject) return
      state.loading = true
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

    function selectTask(task) {
      state.currentTask = task
    }

    /* ---- Home Stats ---- */
    async function fetchHomeStats() {
      try {
        const res = await fetch('/api/projects')
        const data = await res.json()
        const projects = data.projects || []
        let totalTasks = 0, doneTasks = 0, pendingTasks = 0

        // Aggregate stats from all projects (best-effort, use cached change counts)
        // For simplicity, count from current known state
        state.homeStats.totalProjects = projects.length
        // Fetch aggregate via a new API or compute from loaded data
        const statsRes = await fetch('/api/stats')
        if (statsRes.ok) {
          const stats = await statsRes.json()
          state.homeStats = { totalProjects: projects.length, ...stats }
        }
      } catch (e) {
        console.error('Failed to fetch home stats:', e)
      }
    }

    /* ---- Current page computed ---- */
    const currentPage = computed(() => {
      const h = route.hash
      if (h.startsWith('#/projects')) return 'projects'
      if (h.startsWith('#/tasks')) return 'tasks'
      if (h.startsWith('#/config')) return 'config'
      if (h.startsWith('#/check')) return 'check'
      return 'home'
    })

    // Watch route changes to fetch appropriate data
    watch(currentPage, (page) => {
      if (page === 'home') fetchHomeStats()
      if (page === 'tasks') fetchTasks()
    })

    return {
      state, route, navigate, currentPage,
      fetchProjects, selectProject, addProject, deleteProject,
      fetchTasks, selectTask, fetchHomeStats
    }
  },

  async mounted() {
    await this.fetchProjects()
  },

  template: `
    <div class="app-shell-new">
      <top-navbar
        :projects="state.projects"
        :current-project="state.currentProject"
        :current-page="currentPage"
        @select-project="selectProject"
        @navigate="navigate">
      </top-navbar>

      <main class="main-content">
        <home-page v-if="currentPage === 'home'"
          :stats="state.homeStats"
          @navigate="navigate">
        </home-page>

        <projects-page v-else-if="currentPage === 'projects'"
          :projects="state.projects"
          :current-project="state.currentProject"
          @add-project="addProject"
          @delete-project="deleteProject"
          @select-project="selectProject"
          @navigate="navigate">
        </projects-page>

        <tasks-page v-else-if="currentPage === 'tasks'"
          :tasks="state.tasks"
          :current-task="state.currentTask"
          :current-project="state.currentProject"
          :loading="state.loading"
          @select-task="selectTask"
          @navigate="navigate">
        </tasks-page>

        <config-page v-else-if="currentPage === 'config'"
          :current-project="state.currentProject">
        </config-page>

        <check-page v-else-if="currentPage === 'check'"
          :current-project="state.currentProject">
        </check-page>

        <div v-else class="empty-state">
          <p>页面不存在</p>
          <button class="btn" @click="navigate('#/home')">返回首页</button>
        </div>
      </main>

      <bottom-status-bar></bottom-status-bar>
    </div>
  `
})

/* ===== Components ===== */

/* ---- TopNavbar ---- */
const TopNavbar = {
  props: {
    projects: { type: Array, default: () => [] },
    currentProject: { type: Object, default: null },
    currentPage: { type: String, default: 'home' }
  },
  emits: ['select-project', 'navigate'],
  template: `
    <header class="top-navbar">
      <div class="top-navbar-left">
        <a class="top-navbar-logo" href="#/home" @click.prevent="$emit('navigate', '#/home')">&gt;_ polaris</a>
        <select class="project-switcher"
          :value="currentProject ? currentProject.id : ''"
          @change="$emit('select-project', projects.find(p => p.id === $event.target.value))">
          <option value="" disabled>选择项目...</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <nav class="top-navbar-nav">
        <a v-for="item in [
          { hash: '#/home', label: '首页' },
          { hash: '#/projects', label: '项目' },
          { hash: '#/config', label: '配置' },
          { hash: '#/check', label: '检测' }
        ]" :key="item.hash"
          :href="item.hash"
          :class="['top-nav-btn', { active: currentPage === item.hash.slice(2) }]"
          @click.prevent="$emit('navigate', item.hash)">
          {{ item.label }}
        </a>
      </nav>
    </header>
  `
}

/* ---- BottomStatusBar ---- */
const BottomStatusBar = {
  template: `
    <footer class="bottom-status-bar">
      <span class="bottom-status-left"></span>
      <span class="bottom-status-center"></span>
      <span class="bottom-status-right"></span>
    </footer>
  `
}

// Register global components
app.component('TopNavbar', TopNavbar)
app.component('BottomStatusBar', BottomStatusBar)

app.mount('#app')
```

- [ ] **Step 2: 新增 CSS 样式**

在 `src/core/dashboard/static/app.css` 末尾追加：

```css
/* ===== New Layout: Top Navbar + Main + Bottom Bar ===== */
.app-shell-new {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ---- Top Navbar ---- */
.top-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 var(--space-lg);
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 100;
}
.top-navbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}
.top-navbar-logo {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--primary);
  text-decoration: none;
  white-space: nowrap;
}
.top-navbar-logo:hover { color: var(--primary-hover); }

.project-switcher {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px 10px;
  font-size: 13px;
  font-family: var(--font-ui);
  cursor: pointer;
  min-width: 140px;
}
.project-switcher:focus { border-color: var(--primary); outline: none; }
.project-switcher option { background: var(--surface); color: var(--text); }

.top-navbar-nav {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}
.top-nav-btn {
  padding: 6px 16px;
  border-radius: var(--radius);
  color: var(--text-secondary);
  font-size: 13px;
  text-decoration: none;
  transition: background .15s, color .15s;
  white-space: nowrap;
}
.top-nav-btn:hover {
  background: rgba(59, 130, 246, 0.1);
  color: var(--text);
}
.top-nav-btn.active {
  background: rgba(59, 130, 246, 0.15);
  color: var(--primary);
}

/* ---- Main Content ---- */
.main-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* ---- Bottom Status Bar ---- */
.bottom-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 var(--space-lg);
  background: var(--bg-sidebar);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.bottom-status-left,
.bottom-status-center,
.bottom-status-right {
  flex: 1;
}

/* ---- Home Page ---- */
.home-page {
  padding: var(--space-2xl);
  max-width: 900px;
  margin: 0 auto;
}
.home-page h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: var(--space-xl);
  color: var(--text);
}
.home-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
}
@media (max-width: 767px) {
  .home-stats { grid-template-columns: repeat(2, 1fr); }
  .projects-table { font-size: 12px; }
}

/* ---- Projects Page ---- */
.projects-page {
  padding: var(--space-2xl);
  max-width: 1000px;
  margin: 0 auto;
}
.projects-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
}
.projects-page-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
}
.projects-table {
  width: 100%;
  border-collapse: collapse;
}
.projects-table th,
.projects-table td {
  padding: var(--space-sm) var(--space-md);
  text-align: left;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.projects-table th {
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.projects-table tr:hover td {
  background: rgba(59, 130, 246, 0.05);
}
.projects-table .actions {
  display: flex;
  gap: var(--space-sm);
}

/* ---- Modal ---- */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}
.modal-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  min-width: 420px;
  max-width: 90vw;
}
.modal-box h3 {
  font-size: 1.1rem;
  margin-bottom: var(--space-lg);
}
.modal-box .form-group {
  margin-bottom: var(--space-md);
}
.modal-box .form-group label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
}
.modal-box .form-group input {
  width: 100%;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-sm) var(--space-md);
  font-size: 14px;
  font-family: var(--font-ui);
}
.modal-box .form-group input:focus {
  border-color: var(--primary);
  outline: none;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
}

/* ---- Tasks Page: Two-Column ---- */
.tasks-page {
  display: flex;
  height: 100%;
}
.tasks-sidebar {
  width: 280px;
  min-width: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.tasks-sidebar-header {
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tasks-sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-sm);
}
.tasks-detail {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: var(--space-xl);
}

/* ---- Task Detail Components ---- */
.steps-bar {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
  overflow-x: auto;
  padding-bottom: var(--space-xs);
}
.step-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 6px 14px;
  border: 1px solid var(--muted);
  border-radius: var(--radius-xl);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color .15s, color .15s;
  white-space: nowrap;
  flex-shrink: 0;
}
.step-item:hover { border-color: var(--primary); color: var(--text); }
.step-item.completed {
  border-color: var(--success);
  color: var(--success);
}
.step-item.current {
  border-color: var(--primary);
  color: var(--primary);
  box-shadow: 0 0 8px var(--primary-glow);
}
.step-num {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
}

.stage-card {
  background: var(--surface);
  border: 1px solid var(--success);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-xl);
}
.stage-card h3 {
  font-size: 1.1rem;
  color: var(--success);
  margin-bottom: var(--space-sm);
}
.stage-card p {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: var(--space-md);
}
.stage-card .stage-card-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.idea-name-bar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--surface);
  border-radius: var(--radius);
  margin-bottom: var(--space-lg);
  font-family: var(--font-mono);
  font-size: 13px;
}
.idea-name-bar .files-complete {
  font-size: 11px;
  color: var(--success);
  margin-left: auto;
}

.quick-actions {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
}
.quick-actions .btn-delete { background: var(--error); }
.quick-actions .btn-delete:hover { background: #dc2626; }

.project-info {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}
.project-info h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: var(--space-lg);
}
.info-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: var(--space-lg);
}
.info-table th,
.info-table td {
  padding: var(--space-xs) var(--space-md);
  border: 1px solid var(--border);
  text-align: left;
  font-size: 13px;
}
.info-table th {
  background: var(--muted);
  color: var(--text-secondary);
  font-weight: 500;
}
.info-text-block {
  background: var(--bg);
  border-radius: var(--radius);
  padding: var(--space-md);
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.8;
  margin-top: var(--space-md);
}
.info-text-block strong {
  color: var(--text);
  display: block;
  margin-bottom: var(--space-xs);
}

/* ---- Check Page ---- */
.check-page {
  padding: var(--space-2xl);
  max-width: 900px;
  margin: 0 auto;
}
.check-page h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: var(--space-xl);
}
.check-summary {
  display: flex;
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}
.check-summary-item {
  text-align: center;
  padding: var(--space-md) var(--space-xl);
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}
.check-summary-item .count {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 700;
}
.check-summary-item .count.error { color: var(--error); }
.check-summary-item .count.warn { color: var(--warning); }
.check-summary-item .count.ok { color: var(--success); }
.check-summary-item .label { font-size: 12px; color: var(--text-secondary); }

.check-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.check-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--surface);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.check-item.error { border-left: 3px solid var(--error); }
.check-item.warn { border-left: 3px solid var(--warning); }
.check-item.ok { border-left: 3px solid var(--success); }
.check-item .check-icon {
  font-size: 16px;
  flex-shrink: 0;
}
.check-item .check-detail {
  flex: 1;
  font-size: 13px;
}
.check-item .check-detail .check-name {
  font-weight: 500;
  margin-bottom: 2px;
}
.check-item .check-detail .check-desc {
  color: var(--text-secondary);
  font-size: 12px;
}

/* ---- Empty state for tasks ---- */
.tasks-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  color: var(--text-muted);
}
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/core/dashboard/static/app.js src/core/dashboard/static/app.css
git commit -m "feat: add SPA shell with hash router, TopNavbar, and BottomStatusBar"
```

---

### Task 4: HomePage 首页仪表台

**Files:**
- Modify: `src/core/dashboard/static/app.js` (add HomePage component + stats API)

- [ ] **Step 1: 添加聚合统计 API**

在 `src/core/dashboard/router.ts` 的 `handleApiRoute` 中添加（在 projects 路由之后）：

```typescript
    // GET /api/stats
    if (method === 'GET' && pathname === '/api/stats') {
      return json(res, projectsApi.getAggregateStats())
    }
```

在 `src/core/dashboard/api/projects.ts` 顶部添加 import：

```typescript
import { computeStats } from '../change-scanner.js'
```

然后添加函数：
```typescript
export function getAggregateStats(): { totalTasks: number; doneTasks: number; pendingTasks: number } {
  const store = readProjects()
  let totalTasks = 0, doneTasks = 0

  for (const p of store.projects) {
    if (!existsSync(p.path)) continue
    const stats = computeStats(p.path)
    totalTasks += stats.totalTasks
    doneTasks += stats.doneTasks
  }

  return { totalTasks, doneTasks, pendingTasks: totalTasks - doneTasks }
}
```

- [ ] **Step 2: 添加 HomePage 组件到 app.js**

在 app.js 中，在 `BottomStatusBar` 组件定义之后、`app.component` 调用之前，添加：

```javascript
/* ---- HomePage ---- */
const HomePage = {
  props: {
    stats: { type: Object, default: () => ({ totalProjects: 0, totalTasks: 0, pendingTasks: 0, doneTasks: 0 }) },
    loading: { type: Boolean, default: false }
  },
  emits: ['navigate'],
  template: `
    <div class="home-page">
      <h1>仪表台</h1>
      <div class="home-stats" v-if="!loading">
        <stat-card :value="stats.totalProjects" label="项目总数"></stat-card>
        <stat-card :value="stats.totalTasks" label="任务总数"></stat-card>
        <stat-card :value="stats.pendingTasks" label="待处理任务"></stat-card>
        <stat-card :value="stats.doneTasks" label="已完成任务"></stat-card>
      </div>
      <div class="home-stats" v-else>
        <div v-for="i in 4" :key="i" class="skeleton skeleton-stat">
          <div class="skeleton-shimmer" style="height:100%"></div>
        </div>
      </div>
    </div>
  `
}
```

并注册：
```javascript
app.component('HomePage', HomePage)
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/core/dashboard/static/app.js src/core/dashboard/api/projects.ts src/core/dashboard/router.ts
git commit -m "feat: add HomePage dashboard with aggregate stats"
```

---

### Task 5: ProjectsPage 项目管理页

**Files:**
- Modify: `src/core/dashboard/static/app.js` (add ProjectsPage component)

- [ ] **Step 1: 添加 ProjectsPage 组件**

在 app.js 的组件定义区域添加：

```javascript
/* ---- ProjectsPage ---- */
const ProjectsPage = {
  props: {
    projects: { type: Array, default: () => [] },
    currentProject: { type: Object, default: null }
  },
  emits: ['add-project', 'delete-project', 'select-project', 'navigate'],
  setup(props, { emit }) {
    const showModal = Vue.ref(false)
    const newName = Vue.ref('')
    const newPath = Vue.ref('')
    const error = Vue.ref('')
    const deletingId = Vue.ref(null)
    const addLoading = Vue.ref(false)
    const deleteLoading = Vue.ref(false)

    function openModal() {
      newName.value = ''
      newPath.value = ''
      error.value = ''
      showModal.value = true
    }

    async function handleAdd() {
      if (!newName.value.trim() || !newPath.value.trim()) {
        error.value = '请填写完整信息'
        return
      }
      addLoading.value = true
      error.value = ''
      try {
        await emit('add-project', newName.value.trim(), newPath.value.trim())
        showModal.value = false
      } catch (e) {
        error.value = e.message
      } finally {
        addLoading.value = false
      }
    }

    async function handleDelete(id) {
      if (!confirm('确定要删除此项目吗？')) return
      deletingId.value = id
      try {
        await emit('delete-project', id)
      } catch (e) {
        alert(e.message)
      } finally {
        deletingId.value = null
      }
    }

    function goToTasks(project) {
      emit('select-project', project)
      emit('navigate', '#/tasks')
    }

    return { showModal, newName, newPath, error, deletingId, addLoading, deleteLoading,
             openModal, handleAdd, handleDelete, goToTasks }
  },
  template: `
    <div class="projects-page">
      <div class="projects-page-header">
        <h1>项目管理</h1>
        <button class="btn btn-primary" @click="openModal">+ 添加项目</button>
      </div>

      <table class="projects-table" v-if="projects.length > 0">
        <thead>
          <tr>
            <th>别名</th>
            <th>路径</th>
            <th>添加时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in projects" :key="p.id">
            <td>{{ p.name }}</td>
            <td><code style="font-size:12px">{{ p.path }}</code></td>
            <td>{{ new Date(p.createdAt).toLocaleString('zh-CN') }}</td>
            <td class="actions">
              <button class="btn" @click="goToTasks(p)">任务</button>
              <button class="btn" style="color:var(--error)" @click="handleDelete(p.id)" :disabled="deletingId === p.id">
                {{ deletingId === p.id ? '...' : '删除' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="empty-state">
        <p>还没有添加任何项目</p>
        <button class="btn btn-primary" @click="openModal">添加第一个项目</button>
      </div>

      <!-- Add Modal -->
      <div class="modal-overlay" v-if="showModal" @click.self="showModal = false">
        <div class="modal-box">
          <h3>添加项目</h3>
          <div class="form-group">
            <label>项目别名</label>
            <input v-model="newName" placeholder="用于在列表中显示" @keyup.enter="handleAdd">
          </div>
          <div class="form-group">
            <label>项目路径</label>
            <input v-model="newPath" placeholder="项目的绝对路径" @keyup.enter="handleAdd">
          </div>
          <p style="color:var(--error);font-size:12px;margin-bottom:var(--space-sm)" v-if="error">{{ error }}</p>
          <div class="modal-actions">
            <button class="btn" @click="showModal = false">取消</button>
            <button class="btn btn-primary" @click="handleAdd" :disabled="addLoading">
              {{ addLoading ? '添加中...' : '确认添加' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
}
```

注册：
```javascript
app.component('ProjectsPage', ProjectsPage)
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/core/dashboard/static/app.js
git commit -m "feat: add ProjectsPage with add/delete project functionality"
```

---

### Task 6: TasksPage 任务管理页

**Files:**
- Modify: `src/core/dashboard/static/app.js` (add TasksPage, TaskDetail, StepsBar, QuickActions components)

- [ ] **Step 1: 添加 TasksPage 及子组件**

在 app.js 中添加（ProjectsPage 之后）：

```javascript
/* ---- TasksPage ---- */
const TasksPage = {
  props: {
    tasks: { type: Array, default: () => [] },
    currentTask: { type: Object, default: null },
    currentProject: { type: Object, default: null },
    loading: { type: Boolean, default: false }
  },
  emits: ['select-task', 'navigate'],
  setup(props, { emit }) {
    const taskDetailData = Vue.ref(null)
    const detailLoading = Vue.ref(false)

    async function loadTaskDetail(task) {
      emit('select-task', task)
      detailLoading.value = true
      taskDetailData.value = null
      try {
        const res = await fetch('/api/changes/' + encodeURIComponent(task.name))
        const data = await res.json()
        taskDetailData.value = data
      } catch (e) {
        console.error('Failed to fetch task detail:', e)
      } finally {
        detailLoading.value = false
      }
    }

    // Auto-load first task detail
    Vue.watch(() => props.tasks, (tasks) => {
      if (tasks.length > 0 && !props.currentTask) {
        loadTaskDetail(tasks[0])
      }
    }, { immediate: true })

    // Clear detail when task list changes (e.g., project switch)
    Vue.watch(() => props.currentProject, () => {
      taskDetailData.value = null
      emit('select-task', null)
    })

    return { taskDetailData, detailLoading, loadTaskDetail }
  },
  template: `
    <div class="tasks-page" v-if="currentProject">
      <!-- Left: Task List -->
      <aside class="tasks-sidebar">
        <div class="tasks-sidebar-header">
          <span>{{ currentProject.name }}</span>
          <span class="text-muted" style="font-size:11px" v-if="!loading">{{ tasks.length }} 个任务</span>
        </div>
        <div class="tasks-sidebar-list">
          <template v-if="loading">
            <div v-for="i in 4" :key="'sk-'+i" class="skeleton skeleton-card">
              <div class="skeleton-shimmer" style="height:100%"></div>
            </div>
          </template>
          <template v-else-if="tasks.length === 0">
            <div class="empty-state">
              <p style="font-size:13px">暂无任务</p>
              <button class="btn btn-primary" @click="$emit('navigate', '#/compose')" style="margin-top:8px">新建任务</button>
            </div>
          </template>
          <template v-else>
            <div v-for="task in tasks" :key="task.name"
                 :class="['task-card', { active: currentTask && currentTask.name === task.name }]"
                 @click="loadTaskDetail(task)">
              <div class="task-card-name">{{ task.name }}</div>
              <div class="task-card-desc" style="font-size:12px;color:var(--text-secondary);margin-top:4px"
                   v-if="task.desc">{{ task.desc }}</div>
              <div class="task-card-meta">
                <phase-badge :phase="task.phase"></phase-badge>
                <span style="font-size:11px;color:var(--text-muted)">{{ formatTime(task.mtime) }}</span>
              </div>
              <span v-if="task.phase === 'done'" class="task-status-done">Execution Complete</span>
              <mini-progress :done="task.tasksDone" :total="task.tasksTotal"></mini-progress>
            </div>
          </template>
        </div>
      </aside>

      <!-- Right: Task Detail -->
      <div class="tasks-detail">
        <task-detail v-if="taskDetailData"
          :detail="taskDetailData"
          :project="currentProject"
          :loading="detailLoading">
        </task-detail>
        <div v-else-if="detailLoading" class="skeleton skeleton-card" style="height:200px">
          <div class="skeleton-shimmer" style="height:100%"></div>
        </div>
        <div v-else class="tasks-empty">
          <p>请在左侧选择一个任务查看详情</p>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p>请先在顶部导航栏选择一个项目</p>
      <button class="btn btn-primary" @click="$emit('navigate', '#/projects')" style="margin-top:8px">前往项目管理</button>
    </div>
  `
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

/* ---- TaskDetail ---- */
const TaskDetail = {
  props: {
    detail: { type: Object, default: null },
    project: { type: Object, default: null },
    loading: { type: Boolean, default: false }
  },
  setup(props) {
    const phases = Vue.computed(() => {
      return ['proposal', 'specs', 'design', 'tasks', 'done']
        .map((p, i) => ({ label: phaseLabel(p), num: i + 1, key: p }))
    })

    const currentPhaseIndex = Vue.computed(() => {
      if (!props.detail) return 0
      const idx = phases.value.findIndex(p => p.key === props.detail.phase)
      return idx === -1 ? 0 : idx
    })

    const selectedStep = Vue.ref(currentPhaseIndex.value)

    function phaseLabel(phase) {
      const map = { proposal: 'Proposal', specs: 'Specs', design: 'Design', tasks: 'Tasks', done: 'Done' }
      return map[phase] || phase
    }

    return { phases, currentPhaseIndex, selectedStep, phaseLabel }
  },
  template: `
    <div v-if="detail">
      <!-- ① Steps Bar -->
      <div class="steps-bar">
        <div v-for="(step, idx) in phases" :key="step.key"
             :class="['step-item', {
               completed: idx < currentPhaseIndex,
               current: idx === selectedStep
             }]"
             @click="selectedStep = idx">
          <span class="step-num">{{ step.num }}</span>
          <span>{{ step.label }}</span>
        </div>
      </div>

      <!-- ② Stage Card -->
      <div class="stage-card" v-if="detail.phase === 'done'">
        <h3>Execution Completed</h3>
        <p>所有阶段已完成。</p>
        <div class="stage-card-actions">
          <button class="btn" style="background:var(--warning);color:#000">Archive Plan</button>
          <span class="badge badge-done">Done</span>
        </div>
      </div>
      <div class="stage-card" v-else-if="detail.phase">
        <h3>{{ phaseLabel(detail.phase) }} Stage</h3>
        <p>当前阶段进行中。进度：{{ detail.tasksDone }}/{{ detail.tasksTotal }} tasks</p>
        <mini-progress :done="detail.tasksDone" :total="detail.tasksTotal"></mini-progress>
      </div>

      <!-- ③ Idea Name Bar -->
      <div class="idea-name-bar" v-if="project">
        <span>{{ project.name }}</span>
        <span style="color:var(--text-muted);font-size:12px">{{ project.path }}</span>
        <span class="files-complete" v-if="detail.tasksDone === detail.tasksTotal && detail.tasksTotal > 0">Files Complete</span>
      </div>

      <!-- ④ QuickActions -->
      <div class="quick-actions">
        <button class="btn">查看详情</button>
        <button class="btn">编辑任务</button>
        <button class="btn">复制链接</button>
        <button class="btn btn-delete">Delete</button>
      </div>

      <!-- ⑤ Project Info -->
      <div class="project-info">
        <h2>{{ detail.name }}</h2>
        <table class="info-table" v-if="detail.files && detail.files.length > 0">
          <thead>
            <tr>
              <th>文件名称</th>
              <th>路径</th>
              <th>类型</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in detail.files.slice(0, 5)" :key="f.name">
              <td>{{ f.name }}</td>
              <td><code style="font-size:11px">{{ f.path }}</code></td>
              <td>{{ f.name.endsWith('.yaml') ? '配置' : '文档' }}</td>
            </tr>
          </tbody>
        </table>
        <div class="info-text-block" v-if="detail.files && detail.files.length > 0">
          <strong>背景 / 问题</strong>
          该任务包含 {{ detail.files.length }} 个关联文件，
          {{ detail.tasksDone }}/{{ detail.tasksTotal }} 项任务已完成。
        </div>
      </div>
    </div>
  `
}
```

注册所有新组件：
```javascript
app.component('TasksPage', TasksPage)
app.component('TaskDetail', TaskDetail)
```

- [ ] **Step 2: 在 CSS 中添加任务状态标签样式**

在 app.css 中添加：

```css
.task-status-done {
  display: inline-block;
  background: var(--success);
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  margin-top: var(--space-xs);
}
.task-card-desc {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/core/dashboard/static/app.js src/core/dashboard/static/app.css
git commit -m "feat: add TasksPage with task list sidebar and detail panel"
```

---

### Task 7: ConfigPage 配置管理页迁移

**Files:**
- Modify: `src/core/dashboard/static/app.js` (add ConfigPage component)

- [ ] **Step 1: 添加 ConfigPage 组件**

在 app.js 中添加：

```javascript
/* ---- ConfigPage ---- */
const ConfigPage = {
  props: {
    currentProject: { type: Object, default: null }
  },
  setup(props) {
    const configs = Vue.ref([])
    const loading = Vue.ref(true)
    const selectedFile = Vue.ref(null)
    const fileContent = Vue.ref('')
    const fileLoading = Vue.ref(false)
    const saveStatus = Vue.ref('')
    const isYaml = Vue.ref(false)

    async function fetchConfigs() {
      loading.value = true
      try {
        const res = await fetch('/api/configs')
        const data = await res.json()
        configs.value = Array.isArray(data) ? data : []
      } catch (e) {
        console.error('Failed to fetch configs:', e)
      } finally {
        loading.value = false
      }
    }

    async function loadFile(cfg) {
      selectedFile.value = cfg
      fileLoading.value = true
      fileContent.value = ''
      saveStatus.value = ''
      try {
        const res = await fetch('/api/configs/' + encodeURIComponent(cfg.path))
        const data = await res.json()
        if (data.error) {
          fileContent.value = 'Error: ' + data.error
        } else {
          fileContent.value = data.content
          isYaml.value = data.syntax === 'yaml'
        }
      } catch (e) {
        fileContent.value = 'Failed to load: ' + e.message
      } finally {
        fileLoading.value = false
      }
    }

    async function saveFile() {
      if (!selectedFile.value) return
      saveStatus.value = '保存中...'
      try {
        const res = await fetch('/api/configs/' + encodeURIComponent(selectedFile.value.path), {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          body: fileContent.value
        })
        const data = await res.json()
        saveStatus.value = data.ok ? '已保存' : '保存失败: ' + (data.error || '')
      } catch (e) {
        saveStatus.value = '保存失败: ' + e.message
      }
    }

    Vue.watch(() => props.currentProject, () => {
      if (props.currentProject) fetchConfigs()
    }, { immediate: true })

    return { configs, loading, selectedFile, fileContent, fileLoading, saveStatus, isYaml, loadFile, saveFile }
  },
  template: `
    <div v-if="currentProject" style="display:flex;height:100%">
      <div style="width:200px;background:var(--bg-sidebar);border-right:1px solid var(--border);padding:var(--space-md);overflow-y:auto">
        <h3 style="font-size:14px;margin-bottom:12px">配置文件</h3>
        <template v-if="loading">
          <div v-for="i in 3" :key="i" class="skeleton skeleton-text">
            <div class="skeleton-shimmer" style="height:100%"></div>
          </div>
        </template>
        <template v-else-if="configs.length === 0">
          <p style="font-size:12px;color:var(--text-muted)">无配置文件</p>
        </template>
        <template v-else>
          <div v-for="cfg in configs" :key="cfg.path"
               :class="['file-tree-item', { active: selectedFile && selectedFile.path === cfg.path }]"
               @click="loadFile(cfg)">
            {{ cfg.name.endsWith('.yaml') || cfg.name.endsWith('.yml') ? '⚙️' : '📄' }} {{ cfg.name }}
          </div>
        </template>
      </div>
      <div style="flex:1;padding:var(--space-xl);overflow-y:auto">
        <template v-if="selectedFile">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="font-size:14px">{{ selectedFile.path }}</h3>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:11px;color:var(--text-muted)">{{ isYaml ? 'YAML' : 'MARKDOWN' }}</span>
              <button class="btn btn-primary" @click="saveFile" :disabled="fileLoading">保存</button>
              <span style="font-size:11px;color:var(--success)" v-if="saveStatus">{{ saveStatus }}</span>
            </div>
          </div>
          <textarea v-if="!fileLoading"
            v-model="fileContent"
            :style="{ width:'100%', minHeight:'400px', background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'16px', fontFamily:'var(--font-mono)', fontSize:'13px', lineHeight:'1.6', resize:'vertical' }">
          </textarea>
        </template>
        <div v-else class="empty-state">
          <p>选择左侧文件进行编辑</p>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p>请先在顶部导航栏选择一个项目</p>
    </div>
  `
}
```

注册：
```javascript
app.component('ConfigPage', ConfigPage)
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/core/dashboard/static/app.js
git commit -m "feat: migrate ConfigPage to SPA with client-side rendering"
```

---

### Task 8: CheckPage 环境检测页

**Files:**
- Modify: `src/core/dashboard/static/app.js` (add CheckPage component)
- Create: `src/core/dashboard/api/check.ts` (doctor API)

- [ ] **Step 1: 创建 doctor API**

创建 `src/core/dashboard/api/check.ts`：

```typescript
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface CheckResult {
  name: string
  status: 'ok' | 'warn' | 'error'
  description: string
}

export function runChecks(projectRoot: string): { checks: CheckResult[]; summary: { ok: number; warn: number; error: number } } {
  const checks: CheckResult[] = []

  // Check .polaris directory
  const polarisDir = join(projectRoot, '.polaris')
  checks.push({
    name: '.polaris 目录',
    status: existsSync(polarisDir) ? 'ok' : 'error',
    description: existsSync(polarisDir) ? '.polaris 目录存在' : '.polaris 目录不存在，请运行 polaris init'
  })

  // Check polaris.meta.yaml
  const metaFile = join(polarisDir, 'polaris.meta.yaml')
  checks.push({
    name: 'polaris.meta.yaml',
    status: existsSync(metaFile) ? 'ok' : 'error',
    description: existsSync(metaFile) ? '项目元数据文件存在' : '项目元数据文件不存在'
  })

  // Check polaris.record.yaml
  const recordFile = join(polarisDir, 'polaris.record.yaml')
  checks.push({
    name: 'polaris.record.yaml',
    status: existsSync(recordFile) ? 'ok' : 'warn',
    description: existsSync(recordFile) ? '安装记录文件存在' : '安装记录文件不存在（可能尚未执行安装）'
  })

  // Check openspec directory
  const openspecDir = join(projectRoot, 'openspec')
  checks.push({
    name: 'openspec 目录',
    status: existsSync(openspecDir) ? 'ok' : 'warn',
    description: existsSync(openspecDir) ? 'openspec 目录存在' : 'openspec 目录不存在'
  })

  // Check polaris.yaml
  const polarisYaml = join(projectRoot, 'openspec', 'polaris.yaml')
  checks.push({
    name: 'polaris.yaml',
    status: existsSync(polarisYaml) ? 'ok' : 'warn',
    description: existsSync(polarisYaml) ? '项目配置文件存在' : '项目配置文件不存在'
  })

  const summary = {
    ok: checks.filter(c => c.status === 'ok').length,
    warn: checks.filter(c => c.status === 'warn').length,
    error: checks.filter(c => c.status === 'error').length
  }

  return { checks, summary }
}
```

- [ ] **Step 2: 添加 API 路由**

在 `src/core/dashboard/router.ts` 的 `handleApiRoute` 中添加：

```typescript
    // GET /api/check
    if (method === 'GET' && pathname === '/api/check') {
      const checkApi = await import('./api/check.js')
      return json(res, checkApi.runChecks(projectRoot))
    }
```

- [ ] **Step 3: 添加 CheckPage 组件**

在 app.js 中添加：

```javascript
/* ---- CheckPage ---- */
const CheckPage = {
  props: {
    currentProject: { type: Object, default: null }
  },
  setup(props) {
    const checks = Vue.ref([])
    const summary = Vue.ref({ ok: 0, warn: 0, error: 0 })
    const loading = Vue.ref(false)

    async function runChecks() {
      if (!props.currentProject) return
      loading.value = true
      try {
        const res = await fetch('/api/check')
        const data = await res.json()
        checks.value = data.checks || []
        summary.value = data.summary || { ok: 0, warn: 0, error: 0 }
      } catch (e) {
        console.error('Check failed:', e)
      } finally {
        loading.value = false
      }
    }

    Vue.watch(() => props.currentProject, () => {
      if (props.currentProject) runChecks()
    }, { immediate: true })

    const statusIcon = { ok: '✅', warn: '⚠️', error: '❌' }

    return { checks, summary, loading, runChecks, statusIcon }
  },
  template: `
    <div class="check-page" v-if="currentProject">
      <h1>环境检测 — {{ currentProject.name }}</h1>

      <div class="check-summary" v-if="!loading">
        <div class="check-summary-item">
          <div class="count error">{{ summary.error }}</div>
          <div class="label">错误</div>
        </div>
        <div class="check-summary-item">
          <div class="count warn">{{ summary.warn }}</div>
          <div class="label">警告</div>
        </div>
        <div class="check-summary-item">
          <div class="count ok">{{ summary.ok }}</div>
          <div class="label">通过</div>
        </div>
      </div>

      <div class="check-list" v-if="!loading">
        <div v-for="c in checks" :key="c.name" :class="['check-item', c.status]">
          <span class="check-icon">{{ statusIcon[c.status] }}</span>
          <div class="check-detail">
            <div class="check-name">{{ c.name }}</div>
            <div class="check-desc">{{ c.description }}</div>
          </div>
        </div>
      </div>

      <div v-else>
        <div v-for="i in 4" :key="i" class="skeleton skeleton-card" style="margin-bottom:8px">
          <div class="skeleton-shimmer" style="height:48px"></div>
        </div>
      </div>

      <button class="btn btn-primary" @click="runChecks" :disabled="loading" style="margin-top:16px">
        {{ loading ? '检测中...' : '重新检测' }}
      </button>
    </div>
    <div v-else class="empty-state">
      <p>请先在顶部导航栏选择一个项目</p>
      <button class="btn btn-primary" style="margin-top:8px" @click="window.location.hash='#/projects'">前往项目管理</button>
    </div>
  `
}
```

注册：
```javascript
app.component('CheckPage', CheckPage)
```

- [ ] **Step 4: 编译验证**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/core/dashboard/static/app.js src/core/dashboard/api/check.ts src/core/dashboard/router.ts
git commit -m "feat: add CheckPage with polaris environment diagnostics"
```

---

### Task 9: 事件处理修复 + 完整联调

**Files:**
- Modify: `src/core/dashboard/static/app.js` (emit 事件修复)

- [ ] **Step 1: 修复 Vue emit 在 setup 中的使用方式**

在 `app.js` 中，搜索所有 `emit('add-project', ...)` 这类在 `setup` 中通过 `emit` 调用的情况。由于 `ProjectsPage` 的 `setup` 中使用了 `emit`，但 props 中已经声明了 emits，`emit` 在 `setup` 第二个参数中可用。确认所有 `emit` 调用都正确。

对于 `ProjectsPage` 组件中 `handleAdd` 调用的 `emit('add-project', ...)` —— `add-project` 在 app 的 `setup` 中定义。确保 app 模板中 `@add-project="addProject"` 正确绑定。

- [ ] **Step 2: 修复 setup 中 emit 的使用**

在 `ProjectsPage` 中，`setup(props, { emit })` 已经正确解构。但在 template 中使用了 `@click="handleAdd"`，而 `handleAdd` 内部调用了 `emit('add-project', ...)`，而 `add-project` 通过模板的 `@add-project="addProject"` 绑定到父组件的方法。

注意：Vue 3 中，`emit('add-project', name, path)` 会传递两个参数，但父组件的 `addProject(name, path)` 应该正确接收。检查 app 模板：

```html
@add-project="addProject"
```

这里的 `addProject` 在 app setup 中定义为 `async function addProject(name, path)`。

但是，emit 传递多个参数时，父组件需要在模板中正确接收。Vue 3 中 `$emit('add-project', a, b)` 可以通过 `@add-project="(a, b) => addProject(a, b)"` 或直接 `@add-project="addProject"` 接收。

然而，由于 `ProjectsPage` 的 `handleAdd` 调用了 `emit('add-project', newName.value.trim(), newPath.value.trim())` 但返回 promise。需要确认父组件的 `addProject` 能够被正确调用。

更简单的方式：在 `ProjectsPage` 中直接调用 fetch，而不是 emit。但为了保持数据流清晰，使用 emit 是正确的。

让我确认 emit 调用的正确性。在 Vue 3 options API 组件中（我们的组件都是 options API），`emits` 选项定义了可 emit 的事件。在 `setup` 中，第二个参数 `context` 包含 `emit`。

但 `ProjectsPage` 使用了 `setup` 函数，并且声明了 `emits: ['add-project', 'delete-project', 'select-project', 'navigate']`。在 setup 中，`emit` 来自 `setup(props, { emit })`。

现在检查 emit 如何传递到父组件。父组件（app）模板中：
```html
@add-project="addProject"
```

`addProject` 是 app 的 method。当 emit('add-project', name, path) 触发时，Vue 会将参数传递给 `addProject(name, path)`。这应该是正确的。

但对于 emit('delete-project', id)，app 的 `deleteProject(id)` 接收单个参数。正确。

- [ ] **Step 3: 确保路由导航在 hashchange 时正确工作**

检查 `useRouter` 函数：当 hash 改变时，`route.hash` 自动更新。`currentPage` 计算属性依赖 `route.hash`，所以页面会自动切换。

首次加载时，如果没有 hash，默认为 `#/home`。

- [ ] **Step 4: 启动仪表盘进行手动验证**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run dev -- dashboard
```

验证清单：
1. 页面加载显示顶部导航栏 + 底部状态栏
2. 首页显示统计卡片
3. 切换到项目页，添加项目功能正常
4. 切换到任务页，任务列表和详情正常
5. 切换到配置页，配置文件编辑正常
6. 切换到检测页，环境检测结果正常
7. 项目切换下拉框功能正常
8. 所有按钮 hover 变色效果正常

- [ ] **Step 5: Commit**

```bash
git add src/core/dashboard/static/app.js
git commit -m "fix: ensure Vue emit and hash router work correctly"
```

---

### Task 10: 清理旧代码

**Files:**
- Remove/archive: 旧页面文件和服务端渲染代码

- [ ] **Step 1: 清理不再需要的 import**

在 `src/core/dashboard/router.ts` 中，确认以下 import 已不再使用：
- `boardPage` (来自 `./pages/board.js`)
- `changeDetailPage` (来自 `./pages/change-detail.js`)
- `configEditorPage` (来自 `./pages/config-editor.js`)
- `composePage` (来自 `./pages/compose.js`)

这些已在 Task 2 中移除。确认 `handlePageRoute` 函数签名不再需要 `projectRoot` 参数（但保留以防其他用途）。

- [ ] **Step 2: 保留但标记旧页面文件**

旧页面文件（`board.ts`, `change-detail.ts`, `config-editor.ts`, `compose.ts`, `layout.ts`）可以保留在仓库中作为参考，但不再被引用。如果确认不需要，可以删除。

目前先保留它们，因为 config-editor 和 compose 的某些逻辑可能在其他地方被引用。

- [ ] **Step 3: 编译验证**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up unused imports and old page rendering code"
```

---

### Task 11: 运行现有测试确保无回归

**Files:**
- 无修改，仅验证

- [ ] **Step 1: 运行单元测试**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm test
```

预期：所有现有测试通过。如果有测试涉及旧的 dashboard 路由或页面渲染代码，可能需要更新测试。

- [ ] **Step 2: 运行类型检查**

```bash
cd /Users/weiliu/Documents/work/projects/polaris/polaris-cli && npm run typecheck
```

预期：无类型错误。

- [ ] **Step 3: 修复任何失败的测试或类型错误**

根据错误信息针对性地修复代码。

- [ ] **Step 4: Commit (如有修改)**

```bash
git add -A
git commit -m "test: ensure existing tests pass with new dashboard architecture"
```
