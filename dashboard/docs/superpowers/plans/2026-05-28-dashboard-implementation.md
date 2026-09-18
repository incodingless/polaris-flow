# Dashboard Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `polaris dashboard` command that starts a local web server for OpenSpec workflow visualization.

**Architecture:** Node.js native `http` module SSR server, zero new dependencies. TypeScript functions generate HTML strings. Pages use SSR `<a>` navigation + minimal client JS for in-page interactions (fetch-based form submits, view toggling). Shares `src/schema/` and `src/utils/` with existing CLI.

**Tech Stack:** Node.js >=18, TypeScript 5.6, native `http` module, no additional npm dependencies.

---

## File Structure

```
src/commands/dashboard.ts              # NEW — Commander subcommand entry
src/core/dashboard/
├── server.ts                          # NEW — HTTP server (createServer + listen)
├── router.ts                          # NEW — URL routing (page + API dispatch)
├── change-scanner.ts                  # NEW — read openspec/changes/, parse tasks.md
├── pages/
│   ├── layout.ts                      # NEW — shared HTML shell (topbar nav tabs)
│   ├── board.ts                       # NEW — dashboard page (stats + list/kanban)
│   ├── change-detail.ts               # NEW — single change detail page
│   ├── config-editor.ts               # NEW — config file browser + editor
│   └── compose.ts                     # NEW — new-change creation form
├── api/
│   ├── changes.ts                     # NEW — /api/changes endpoints
│   ├── configs.ts                     # NEW — /api/configs endpoints
│   └── compose.ts                     # NEW — /api/compose endpoints
├── markdown.ts                        # NEW — basic markdown-to-HTML renderer
└── static/
    ├── app.css                        # NEW — dashboard styles
    └── app.js                         # NEW — client-side interactions (~200 lines)

src/cli.ts                             # MODIFY — register dashboard command
tests/
├── unit/
│   ├── change-scanner.test.ts         # NEW — scanner unit tests
│   ├── dashboard-markdown.test.ts     # NEW — markdown renderer tests
│   └── dashboard-api.test.ts          # NEW — API handler tests
└── integration/
    └── dashboard.test.ts              # NEW — server integration tests
```

---

### Task 1: Change Scanner

**Files:**
- Create: `src/core/dashboard/change-scanner.ts`
- Create: `tests/unit/change-scanner.test.ts`

**Purpose:** Read `openspec/changes/` directory, discover all changes, parse tasks.md checkbox status. This is the data layer that all pages and APIs depend on.

- [ ] **Step 1: Write failing tests for change-scanner**

Create `tests/unit/change-scanner.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanChanges, getChangeDetail, parseTasksMd, getChangePhase, computeStats } from '../../src/core/dashboard/change-scanner.js'

let testDir: string

beforeEach(() => {
  testDir = join(tmpdir(), `polaris-dashboard-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(testDir, { recursive: true })
})

function createChange(name: string, files: Record<string, string>) {
  const changeDir = join(testDir, 'openspec', 'changes', name)
  mkdirSync(changeDir, { recursive: true })
  for (const [filename, content] of Object.entries(files)) {
    const filePath = join(changeDir, filename)
    mkdirSync(join(filePath, '..'), { recursive: true })
    writeFileSync(filePath, content)
  }
}

describe('scanChanges', () => {
  it('returns empty array when openspec/changes does not exist', () => {
    expect(scanChanges(testDir)).toEqual([])
  })

  it('discovers a single change with proposal only', () => {
    createChange('add-auth', { 'proposal.md': '# Proposal' })
    const result = scanChanges(testDir)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('add-auth')
    expect(result[0].phase).toBe('proposal')
  })

  it('discovers multiple changes sorted by mtime desc', () => {
    createChange('change-a', { 'proposal.md': '# A' })
    createChange('change-b', { 'proposal.md': '# B', 'specs/user-auth/spec.md': '# Spec' })
    const result = scanChanges(testDir)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('change-b')
  })

  it('computes task stats from tasks.md', () => {
    createChange('add-auth', {
      'proposal.md': '# Proposal',
      'tasks.md': '- [ ] 1.1 Task one\n- [x] 1.2 Task two\n- [ ] 1.3 Task three\n'
    })
    const result = scanChanges(testDir)
    expect(result[0].tasksTotal).toBe(3)
    expect(result[0].tasksDone).toBe(1)
  })
})

describe('getChangePhase', () => {
  it('returns proposal when only proposal.md exists', () => {
    createChange('test', { 'proposal.md': '...' })
    expect(getChangePhase(join(testDir, 'openspec/changes/test'))).toBe('proposal')
  })

  it('returns specs when specs/ dir has files', () => {
    createChange('test', {
      'proposal.md': '...',
      'specs/user-auth/spec.md': '...'
    })
    expect(getChangePhase(join(testDir, 'openspec/changes/test'))).toBe('specs')
  })

  it('returns design when tech-design.md exists', () => {
    createChange('test', {
      'proposal.md': '...',
      'specs/user-auth/spec.md': '...',
      'tech-design.md': '...'
    })
    expect(getChangePhase(join(testDir, 'openspec/changes/test'))).toBe('design')
  })

  it('returns tasks when tasks.md exists', () => {
    createChange('test', {
      'proposal.md': '...',
      'specs/user-auth/spec.md': '...',
      'tech-design.md': '...',
      'tasks.md': ''
    })
    expect(getChangePhase(join(testDir, 'openspec/changes/test'))).toBe('tasks')
  })

  it('returns done when all tasks are checked', () => {
    createChange('test', {
      'proposal.md': '...',
      'tasks.md': '- [x] 1.1 Done\n- [x] 1.2 Done\n'
    })
    expect(getChangePhase(join(testDir, 'openspec/changes/test'))).toBe('done')
  })
})

describe('parseTasksMd', () => {
  it('parses checkbox items', () => {
    const content = '- [ ] 1.1 First task\n- [x] 1.2 Second task\nSome text\n- [ ] 1.3 Third task'
    const result = parseTasksMd(content)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ index: 0, text: '1.1 First task', done: false })
    expect(result[1]).toEqual({ index: 1, text: '1.2 Second task', done: true })
    expect(result[2]).toEqual({ index: 2, text: '1.3 Third task', done: false })
  })

  it('returns empty array for empty content', () => {
    expect(parseTasksMd('')).toEqual([])
  })

  it('ignores non-checkbox lines', () => {
    expect(parseTasksMd('## Section\nSome text\n')).toEqual([])
  })
})

describe('getChangeDetail', () => {
  it('lists all files in a change directory', () => {
    createChange('add-auth', {
      'proposal.md': '# Proposal',
      'tasks.md': '- [ ] Task',
      'specs/auth/spec.md': '# Spec'
    })
    const detail = getChangeDetail(join(testDir, 'openspec/changes/add-auth'))
    expect(detail.files).toContain('proposal.md')
    expect(detail.files).toContain('tasks.md')
  })

  it('reads file contents', () => {
    createChange('add-auth', { 'proposal.md': '# My Proposal' })
    const detail = getChangeDetail(join(testDir, 'openspec/changes/add-auth'))
    const proposal = detail.files.find(f => f.name === 'proposal.md')
    expect(proposal?.content).toBe('# My Proposal')
  })
})

describe('computeStats', () => {
  it('aggregates stats across all changes', () => {
    createChange('a', { 'proposal.md': '...', 'tasks.md': '- [ ] 1\n- [x] 2\n- [ ] 3' })
    createChange('b', { 'proposal.md': '...', 'tasks.md': '- [x] 1\n- [x] 2' })
    createChange('c', { 'proposal.md': '...' })
    const stats = computeStats(testDir)
    expect(stats.totalChanges).toBe(3)
    expect(stats.totalTasks).toBe(5)
    expect(stats.doneTasks).toBe(3)
    expect(stats.pendingTasks).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/change-scanner.test.ts`
Expected: FAIL — "Cannot find module" for change-scanner

- [ ] **Step 3: Implement change-scanner.ts**

Create `src/core/dashboard/change-scanner.ts`:

```typescript
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

export interface TaskItem {
  index: number
  text: string
  done: boolean
}

export interface ChangeFile {
  name: string
  path: string
  content: string
}

export interface ChangeDetail {
  name: string
  phase: string
  tasksTotal: number
  tasksDone: number
  mtime: string
  files: ChangeFile[]
}

export interface ChangeStats {
  totalChanges: number
  totalTasks: number
  doneTasks: number
  pendingTasks: number
}

const PHASE_ORDER = ['proposal', 'specs', 'design', 'tasks', 'done']

export function parseTasksMd(content: string): TaskItem[] {
  const lines = content.split('\n')
  const tasks: TaskItem[] = []
  let index = 0
  for (const line of lines) {
    const match = line.match(/^\s*- \[(.)\] (.+)/)
    if (match) {
      tasks.push({ index: index++, text: match[2].trim(), done: match[1] !== ' ' })
    }
  }
  return tasks
}

export function getChangePhase(changeDir: string): string {
  if (!existsSync(changeDir)) return 'proposal'

  const tasksPath = join(changeDir, 'tasks.md')
  if (existsSync(tasksPath)) {
    const content = readFileSync(tasksPath, 'utf8')
    const tasks = parseTasksMd(content)
    if (tasks.length > 0 && tasks.every(t => t.done)) {
      return 'done'
    }
    return 'tasks'
  }

  if (existsSync(join(changeDir, 'tech-design.md')) ||
      existsSync(join(changeDir, 'db-design.md')) ||
      existsSync(join(changeDir, 'rest-api-design.md'))) {
    return 'design'
  }

  const specsDir = join(changeDir, 'specs')
  if (existsSync(specsDir)) {
    try {
      const entries = readdirSync(specsDir, { recursive: true })
      if (entries.some(e => e.endsWith('.md'))) return 'specs'
    } catch {}
  }

  if (existsSync(join(changeDir, 'proposal.md'))) {
    return 'proposal'
  }

  return 'proposal'
}

function listChangeFiles(changeDir: string): ChangeFile[] {
  const result: ChangeFile[] = []
  if (!existsSync(changeDir)) return result
  const walk = (dir: string, prefix: string) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          walk(fullPath, relPath)
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.yaml')) {
          result.push({
            name: relPath,
            path: relPath,
            content: readFileSync(fullPath, 'utf8')
          })
        }
      }
    } catch {}
  }
  walk(changeDir, '')
  return result
}

export function getChangeDetail(changeDir: string): ChangeDetail {
  const name = basename(changeDir)
  const phase = getChangePhase(changeDir)
  const files = listChangeFiles(changeDir)

  let tasksTotal = 0
  let tasksDone = 0
  const tasksFile = files.find(f => f.name === 'tasks.md')
  if (tasksFile) {
    const tasks = parseTasksMd(tasksFile.content)
    tasksTotal = tasks.length
    tasksDone = tasks.filter(t => t.done).length
  }

  let mtime = ''
  try {
    mtime = statSync(changeDir).mtime.toISOString()
  } catch {}

  return { name, phase, tasksTotal, tasksDone, mtime, files }
}

export function scanChanges(projectRoot: string): ChangeDetail[] {
  const changesDir = join(projectRoot, 'openspec', 'changes')
  if (!existsSync(changesDir)) return []

  const names = readdirSync(changesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  return names
    .map(name => getChangeDetail(join(changesDir, name)))
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
}

export function computeStats(projectRoot: string): ChangeStats {
  const changes = scanChanges(projectRoot)
  return {
    totalChanges: changes.length,
    totalTasks: changes.reduce((sum, c) => sum + c.tasksTotal, 0),
    doneTasks: changes.reduce((sum, c) => sum + c.tasksDone, 0),
    pendingTasks: changes.reduce((sum, c) => sum + (c.tasksTotal - c.tasksDone), 0)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/change-scanner.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add src/core/dashboard/change-scanner.ts tests/unit/change-scanner.test.ts
git commit -m "feat: add change-scanner for openspec/changes discovery"
```

---

### Task 2: Markdown Renderer

**Files:**
- Create: `src/core/dashboard/markdown.ts`
- Create: `tests/unit/dashboard-markdown.test.ts`

**Purpose:** Basic markdown-to-HTML renderer (headings, lists, code blocks, links, paragraphs, inline code, bold, italic). Used by change detail page to render .md file content.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/dashboard-markdown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../../src/core/dashboard/markdown.js'

describe('renderMarkdown', () => {
  it('renders h1 heading', () => {
    expect(renderMarkdown('# Hello')).toContain('<h1>Hello</h1>')
  })

  it('renders h2 heading', () => {
    expect(renderMarkdown('## Section')).toContain('<h2>Section</h2>')
  })

  it('renders h3 heading', () => {
    expect(renderMarkdown('### Subsection')).toContain('<h3>Subsection</h3>')
  })

  it('renders unordered list', () => {
    const html = renderMarkdown('- Item 1\n- Item 2')
    expect(html).toContain('<li>Item 1</li>')
    expect(html).toContain('<li>Item 2</li>')
  })

  it('renders code block', () => {
    const html = renderMarkdown('```ts\nconst x = 1\n```')
    expect(html).toContain('<pre><code')
    expect(html).toContain('const x = 1')
  })

  it('renders inline code', () => {
    expect(renderMarkdown('Use `foo()` function')).toContain('<code>foo()</code>')
  })

  it('renders links', () => {
    const html = renderMarkdown('[click here](https://example.com)')
    expect(html).toContain('<a href="https://example.com">')
  })

  it('renders bold text', () => {
    expect(renderMarkdown('**bold text**')).toContain('<strong>bold text</strong>')
  })

  it('renders italic text', () => {
    expect(renderMarkdown('*italic*')).toContain('<em>italic</em>')
  })

  it('renders checkbox lists', () => {
    const html = renderMarkdown('- [x] Done task\n- [ ] Pending')
    expect(html).toContain('checked')
  })

  it('renders horizontal rule', () => {
    expect(renderMarkdown('---')).toContain('<hr>')
  })

  it('renders paragraphs separated by blank lines', () => {
    const html = renderMarkdown('Para 1\n\nPara 2')
    expect(html).toContain('<p>Para 1</p>')
    expect(html).toContain('<p>Para 2</p>')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/dashboard-markdown.test.ts`
Expected: FAIL — "Cannot find module" for markdown

- [ ] **Step 3: Implement markdown.ts**

Create `src/core/dashboard/markdown.ts`:

```typescript
export function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  let html = ''
  let inCodeBlock = false
  let codeContent = ''
  let codeLang = ''
  let inList = false
  let listType: 'ul' | 'ol' = 'ul'
  let paragraphLines: string[] = []

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      html += `<p>${paragraphLines.map(inlineFormat).join('<br>')}</p>\n`
      paragraphLines = []
    }
  }

  function flushList() {
    if (inList) {
      html += `</${listType}>\n`
      inList = false
    }
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const langAttr = codeLang ? ` class="language-${codeLang}"` : ''
        html += `<pre><code${langAttr}>${escapeHtml(codeContent.trim())}</code></pre>\n`
        codeContent = ''
        codeLang = ''
        inCodeBlock = false
      } else {
        flushParagraph()
        flushList()
        codeLang = line.slice(3).trim()
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeContent += line + '\n'
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      const level = headingMatch[1].length
      html += `<h${level}>${inlineFormat(headingMatch[2])}</h${level}>\n`
      continue
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}\s*$/)) {
      flushParagraph()
      flushList()
      html += '<hr>\n'
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)- (.+)/)
    if (ulMatch) {
      flushParagraph()
      if (!inList || listType !== 'ul') {
        flushList()
        html += '<ul>\n'
        listType = 'ul'
        inList = true
      }
      html += `<li>${inlineFormat(ulMatch[2])}</li>\n`
      continue
    }

    // Checkbox
    const cbMatch = line.match(/^(\s*)- \[(.)\] (.+)/)
    if (cbMatch) {
      flushParagraph()
      if (!inList || listType !== 'ul') {
        flushList()
        html += '<ul class="task-list">\n'
        listType = 'ul'
        inList = true
      }
      const checked = cbMatch[2] !== ' '
      html += `<li class="task-item"><input type="checkbox" disabled${checked ? ' checked' : ''}>${inlineFormat(cbMatch[3])}</li>\n`
      continue
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\. (.+)/)
    if (olMatch) {
      flushParagraph()
      if (!inList || listType !== 'ol') {
        flushList()
        html += '<ol>\n'
        listType = 'ol'
        inList = true
      }
      html += `<li>${inlineFormat(olMatch[2])}</li>\n`
      continue
    }

    // Blank line
    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }

    // Paragraph
    paragraphLines.push(line)
  }

  flushParagraph()
  flushList()

  if (html === '') {
    html = `<p>${escapeHtml(md)}</p>`
  }

  return html
}

function inlineFormat(text: string): string {
  // Inline code (backticks)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  // Images
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
  return text
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/dashboard-markdown.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/dashboard/markdown.ts tests/unit/dashboard-markdown.test.ts
git commit -m "feat: add basic markdown-to-HTML renderer for dashboard"
```

---

### Task 3: HTTP Server + Router

**Files:**
- Create: `src/core/dashboard/server.ts`
- Create: `src/core/dashboard/router.ts`

**Purpose:** HTTP server using Node.js `http` module. Router dispatches GET/POST/PUT requests to page handlers or API handlers. Serves static CSS/JS from `static/` directory.

- [ ] **Step 1: Implement server.ts**

Create `src/core/dashboard/server.ts`:

```typescript
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { handleRequest } from './router.js'

export interface DashboardOptions {
  port: number
  open: boolean
}

export function startServer(options: DashboardOptions, projectRoot: string): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handleRequest(req, res, projectRoot)
  })

  server.listen(options.port, () => {
    console.log(`Dashboard: http://localhost:${options.port}`)
    if (options.open) {
      const { exec } = require('node:child_process') as typeof import('node:child_process')
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
      exec(`${cmd} http://localhost:${options.port}`)
    }
  })
}
```

- [ ] **Step 2: Implement router.ts**

Create `src/core/dashboard/router.ts`:

```typescript
import { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function serveStatic(res: ServerResponse, filename: string): void {
  const filePath = join(__dirname, 'static', filename)
  if (!existsSync(filePath)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const content = readFileSync(filePath, 'utf8')
  const contentType = filename.endsWith('.css') ? 'text/css' : 'application/javascript'
  res.writeHead(200, { 'Content-Type': contentType })
  res.end(content)
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
  })
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?')
  if (idx === -1) return {}
  const qs = url.slice(idx + 1)
  const params: Record<string, string> = {}
  for (const pair of qs.split('&')) {
    const [k, v] = pair.split('=')
    params[decodeURIComponent(k)] = decodeURIComponent(v ?? '')
  }
  return params
}

function getPathname(url: string): string {
  const idx = url.indexOf('?')
  return idx === -1 ? url : url.slice(0, idx)
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string
): Promise<void> {
  const pathname = getPathname(req.url ?? '/')
  const method = req.method ?? 'GET'

  // Static files
  if (pathname.startsWith('/static/')) {
    serveStatic(res, pathname.replace('/static/', ''))
    return
  }

  // API routes
  if (pathname.startsWith('/api/')) {
    const body = method === 'POST' || method === 'PUT' ? await parseBody(req) : ''
    handleApiRoute(method, pathname, body, res, projectRoot)
    return
  }

  // Page routes
  handlePageRoute(pathname, res, projectRoot)
}

async function handleApiRoute(
  method: string,
  pathname: string,
  body: string,
  res: ServerResponse,
  projectRoot: string
): Promise<void> {
  try {
    // Lazy imports to avoid circular dependency issues
    const changesApi = await import('./api/changes.js')
    const configsApi = await import('./api/configs.js')
    const composeApi = await import('./api/compose.js')

    // GET /api/changes
    if (method === 'GET' && pathname === '/api/changes') {
      return json(res, changesApi.listChanges(projectRoot))
    }

    // GET /api/changes/:name
    const changeMatch = pathname.match(/^\/api\/changes\/([^/]+)$/)
    if (method === 'GET' && changeMatch) {
      return json(res, changesApi.getChange(projectRoot, changeMatch[1]))
    }

    // POST /api/changes/:name/tasks/:id
    const taskMatch = pathname.match(/^\/api\/changes\/([^/]+)\/tasks\/(\d+)$/)
    if (method === 'POST' && taskMatch) {
      return json(res, changesApi.toggleTask(projectRoot, taskMatch[1], parseInt(taskMatch[2])))
    }

    // GET /api/configs
    if (method === 'GET' && pathname === '/api/configs') {
      return json(res, configsApi.listConfigs(projectRoot))
    }

    // GET /api/configs/:path*
    const configGetMatch = pathname.match(/^\/api\/configs\/(.+)$/)
    if (method === 'GET' && configGetMatch) {
      return json(res, configsApi.getConfig(projectRoot, configGetMatch[1]))
    }

    // PUT /api/configs/:path*
    if (method === 'PUT' && configGetMatch) {
      return json(res, configsApi.saveConfig(projectRoot, configGetMatch[1], body))
    }

    // POST /api/compose
    if (method === 'POST' && pathname === '/api/compose') {
      return json(res, composeApi.createChange(projectRoot, body))
    }

    // GET /api/schemas
    if (method === 'GET' && pathname === '/api/schemas') {
      return json(res, composeApi.listSchemas(projectRoot))
    }

    res.writeHead(404)
    res.end(JSON.stringify({ error: 'API not found' }))
  } catch (err) {
    res.writeHead(500)
    res.end(JSON.stringify({ error: (err as Error).message }))
  }
}

async function handlePageRoute(
  pathname: string,
  res: ServerResponse,
  projectRoot: string
): Promise<void> {
  try {
    // Lazy imports
    const boardPage = await import('./pages/board.js')
    const changeDetailPage = await import('./pages/change-detail.js')
    const configEditorPage = await import('./pages/config-editor.js')
    const composePage = await import('./pages/compose.js')

    if (pathname === '/') {
      html(res, boardPage.renderBoardPage(projectRoot))
      return
    }

    const changeMatch = pathname.match(/^\/change\/(.+)/)
    if (changeMatch) {
      html(res, changeDetailPage.renderChangeDetailPage(projectRoot, changeMatch[1]))
      return
    }

    const configMatch = pathname.match(/^\/config\/(.+)/)
    if (configMatch) {
      html(res, configEditorPage.renderConfigEditPage(projectRoot, configMatch[1]))
      return
    }

    if (pathname === '/config') {
      html(res, configEditorPage.renderConfigListPage(projectRoot))
      return
    }

    if (pathname === '/compose') {
      html(res, composePage.renderComposePage(projectRoot))
      return
    }

    res.writeHead(404)
    res.end('<h1>404 Not Found</h1>')
  } catch (err) {
    res.writeHead(500)
    res.end(`<h1>Error</h1><pre>${(err as Error).message}</pre>`)
  }
}

function json(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(body)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/dashboard/server.ts src/core/dashboard/router.ts
git commit -m "feat: add dashboard HTTP server and router"
```

---

### Task 4: Shared HTML Layout

**Files:**
- Create: `src/core/dashboard/pages/layout.ts`

**Purpose:** Shared HTML shell with top navigation bar. Every page wraps its content in this layout.

- [ ] **Step 1: Implement layout.ts**

Create `src/core/dashboard/pages/layout.ts`:

```typescript
export function renderLayout(title: string, body: string, activeTab: string): string {
  const tabs = [
    { label: '看板', href: '/' },
    { label: 'Config', href: '/config' },
    { label: 'Compose', href: '/compose' }
  ]

  const navItems = tabs.map(t =>
    `<a href="${t.href}" class="nav-item${activeTab === t.href ? ' active' : ''}">${t.label}</a>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — polaris dashboard</title>
  <link rel="stylesheet" href="/static/app.css">
</head>
<body>
  <nav class="topbar">
    <div class="topbar-brand">polaris dashboard</div>
    <div class="topbar-tabs">${navItems}</div>
  </nav>
  <main class="main-content">
    ${body}
  </main>
  <script src="/static/app.js"></script>
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
git commit -m "feat: add dashboard shared HTML layout with topnav"
```

---

### Task 5: Board Page

**Files:**
- Create: `src/core/dashboard/pages/board.ts`

**Purpose:** Main dashboard page showing stats cards + change list with progress bars. Can toggle to kanban view via JS.

- [ ] **Step 1: Implement board.ts**

Create `src/core/dashboard/pages/board.ts`:

```typescript
import { renderLayout } from './layout.js'
import { scanChanges, computeStats, type ChangeDetail } from '../change-scanner.js'

export function renderBoardPage(projectRoot: string): string {
  const stats = computeStats(projectRoot)
  const changes = scanChanges(projectRoot)

  const body = `
    <div class="board-header">
      <h2>任务看板</h2>
      <div class="view-toggles">
        <button class="view-toggle active" data-view="list">列表</button>
        <button class="view-toggle" data-view="kanban">Kanban</button>
      </div>
    </div>

    <div class="stats-row">
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

    ${renderListView(changes)}
    ${renderKanbanView(changes)}
  `

  return renderLayout('任务看板', body, '/')
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    proposal: '📝 Proposal',
    specs: '📐 Specs',
    design: '⚙️ Design',
    tasks: '🔨 Tasks',
    done: '✅ Done'
  }
  return map[phase] ?? phase
}

function progressPercent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

function progressColor(pct: number): string {
  if (pct === 100) return 'var(--green)'
  if (pct >= 50) return 'var(--yellow)'
  return 'var(--red)'
}

function renderListView(changes: ChangeDetail[]): string {
  if (changes.length === 0) {
    return `<div id="view-list" class="view-panel"><div class="empty-state">
      <p>暂无 Changes</p>
      <a href="/compose" class="btn-primary">新建 Change</a>
    </div></div>`
  }

  const rows = changes.map(c => {
    const pct = progressPercent(c.tasksDone, c.tasksTotal)
    return `
    <a href="/change/${encodeURIComponent(c.name)}" class="change-row">
      <div class="change-row-header">
        <span class="change-name">${escapeHtml(c.name)}</span>
        <span class="change-phase">${phaseLabel(c.phase)}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%;background:${progressColor(pct)}"></div>
      </div>
      <div class="change-row-meta">
        <span>${c.tasksDone}/${c.tasksTotal} tasks</span>
        <span>${timeAgo(c.mtime)}</span>
      </div>
    </a>`
  }).join('')

  return `<div id="view-list" class="view-panel">${rows}</div>`
}

function renderKanbanView(changes: ChangeDetail[]): string {
  const columns: Record<string, ChangeDetail[]> = {
    proposal: [],
    specs: [],
    design: [],
    tasks: [],
    done: []
  }

  for (const c of changes) {
    if (columns[c.phase]) columns[c.phase].push(c)
  }

  const colsHtml = Object.entries(columns).map(([phase, items]) => {
    const cards = items.map(c => {
      const pct = progressPercent(c.tasksDone, c.tasksTotal)
      return `
      <a href="/change/${encodeURIComponent(c.name)}" class="kanban-card">
        <div class="kanban-card-name">${escapeHtml(c.name)}</div>
        ${c.tasksTotal > 0 ? `<div class="kanban-card-progress">${c.tasksDone}/${c.tasksTotal}</div>` : ''}
        <div class="progress-bar" style="margin-top:4px">
          <div class="progress-fill" style="width:${pct}%;background:${progressColor(pct)}"></div>
        </div>
      </a>`
    }).join('') || '<div class="kanban-empty">—</div>'

    return `
    <div class="kanban-col">
      <div class="kanban-col-header">${phaseLabel(phase)} <span class="kanban-count">${items.length}</span></div>
      ${cards}
    </div>`
  }).join('')

  return `<div id="view-kanban" class="view-panel" style="display:none">
    <div class="kanban-board">${colsHtml}</div>
  </div>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/dashboard/pages/board.ts
git commit -m "feat: add board page with list and kanban views"
```

---

### Task 6: Change Detail Page

**Files:**
- Create: `src/core/dashboard/pages/change-detail.ts`

**Purpose:** Single change detail view with document tree sidebar + content area.

- [ ] **Step 1: Implement change-detail.ts**

Create `src/core/dashboard/pages/change-detail.ts`:

```typescript
import { join } from 'node:path'
import { renderLayout } from './layout.js'
import { getChangeDetail, type ChangeFile } from '../change-scanner.js'
import { renderMarkdown } from '../markdown.js'

export function renderChangeDetailPage(projectRoot: string, name: string): string {
  const changesDir = join(projectRoot, 'openspec', 'changes')
  const change = getChangeDetail(join(changesDir, name))

  const content = `
    <div class="detail-header">
      <a href="/" class="back-link">← 返回看板</a>
      <h2>${escapeHtml(change.name)}</h2>
      <div class="detail-meta">
        <span class="badge badge-${change.phase}">${phaseLabel(change.phase)}</span>
        ${change.tasksTotal > 0 ? `<span>${change.tasksDone}/${change.tasksTotal} tasks</span>` : ''}
      </div>
      <div class="detail-actions">
        <button class="btn" onclick="toggleTask()">标记完成</button>
      </div>
    </div>

    <div class="detail-layout">
      <aside class="detail-sidebar">
        <div class="file-tree">
          ${renderFileTree(change.files, name)}
        </div>
      </aside>
      <div class="detail-content" id="detail-content">
        ${renderDefaultContent(change.files)}
      </div>
    </div>
  `

  return renderLayout(`${change.name} — 详情`, content, '/')
}

function renderFileTree(files: ChangeFile[], changeName: string): string {
  if (files.length === 0) return '<p class="empty-state">暂无文件</p>'

  const docOrder = [
    'proposal.md',
    'tech-design.md',
    'db-design.md',
    'rest-api-design.md',
    'testcase-design.md',
    'tasks.md',
    'plan.md'
  ]

  const ordered = [...files].sort((a, b) => {
    const ai = docOrder.indexOf(a.name)
    const bi = docOrder.indexOf(b.name)
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  return ordered.map(f => {
    const icon = f.name === 'tasks.md' ? '☑️' : f.name.endsWith('.yaml') ? '⚙️' : '📄'
    return `<div class="file-tree-item" data-file="${escapeHtml(f.name)}" onclick="loadFile('${escapeHtml(changeName)}', '${escapeHtml(f.name)}')">
      ${icon} ${escapeHtml(f.name)}
    </div>`
  }).join('')
}

function renderDefaultContent(files: ChangeFile[]): string {
  const tasksFile = files.find(f => f.name === 'tasks.md')
  if (tasksFile) {
    return `<div class="markdown-body">${renderMarkdown(tasksFile.content)}</div>`
  }
  const proposal = files.find(f => f.name === 'proposal.md')
  if (proposal) {
    return `<div class="markdown-body">${renderMarkdown(proposal.content)}</div>`
  }
  return '<p class="empty-state">选择左侧文件查看内容</p>'
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    proposal: '📝 Proposal',
    specs: '📐 Specs',
    design: '⚙️ Design',
    tasks: '🔨 Tasks',
    done: '✅ Done'
  }
  return map[phase] ?? phase
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/dashboard/pages/change-detail.ts
git commit -m "feat: add change detail page with document tree"
```

---

### Task 7: Config Editor Page

**Files:**
- Create: `src/core/dashboard/pages/config-editor.ts`

**Purpose:** Config file browser (list view) and editor (textarea for a single file).

- [ ] **Step 1: Implement config-editor.ts**

Create `src/core/dashboard/pages/config-editor.ts`:

```typescript
import { join } from 'node:path'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { renderLayout } from './layout.js'

const CONFIG_ROOT_SEGMENTS = ['openspec', 'schemas']

export function renderConfigListPage(projectRoot: string): string {
  const files = listConfigFiles(projectRoot)

  const fileList = files.length === 0
    ? '<p class="empty-state">未找到配置文件</p>'
    : files.map(f =>
        `<a href="/config/${encodeURIComponent(f)}" class="config-file-item">
          <span>${f.endsWith('.yaml') ? '⚙️' : '📄'}</span>
          <span>${escapeHtml(f)}</span>
        </a>`
      ).join('')

  const body = `
    <h2>Config / Schema</h2>
    <div class="config-list">${fileList}</div>
  `

  return renderLayout('Config', body, '/config')
}

export function renderConfigEditPage(projectRoot: string, configPath: string): string {
  const fullPath = join(projectRoot, configPath)
  let content = ''
  let error = ''

  if (existsSync(fullPath)) {
    try {
      content = readFileSync(fullPath, 'utf8')
    } catch {
      error = '无法读取文件'
    }
  } else {
    error = '文件不存在'
  }

  const syntax = configPath.endsWith('.yaml') || configPath.endsWith('.yml') ? 'yaml' : 'markdown'
  const escaped = escapeHtml(content)

  const body = `
    <div class="editor-header">
      <a href="/config" class="back-link">← 返回列表</a>
      <h2>${escapeHtml(configPath)}</h2>
      <div class="editor-actions">
        <span class="syntax-label">${syntax.toUpperCase()}</span>
        <button class="btn-primary" onclick="saveConfig('${escapeHtml(configPath)}')">保存</button>
        <span id="save-status"></span>
      </div>
    </div>
    ${error ? `<p class="error">${error}</p>` : ''}
    <textarea id="editor" class="config-editor" data-syntax="${syntax}" data-path="${escapeHtml(configPath)}">${escaped}</textarea>
    <div id="validate-msg" class="validate-msg"></div>
  `

  return renderLayout(`编辑: ${configPath}`, body, '/config')
}

function listConfigFiles(projectRoot: string): string[] {
  const results: string[] = []
  const openspecDir = join(projectRoot, 'openspec')

  // polaris.yaml at openspec root
  if (existsSync(join(openspecDir, 'polaris.yaml'))) {
    results.push('openspec/polaris.yaml')
  }

  // Walk openspec/schemas/
  const schemasDir = join(projectRoot, 'openspec', 'schemas')
  if (existsSync(schemasDir)) {
    try {
      for (const entry of readdirSync(schemasDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const schemaDir = join(schemasDir, entry.name)
          // Use recursive without withFileTypes to get relative path strings
          const files = readdirSync(schemaDir, { recursive: true }) as string[]
          for (const file of files) {
            if (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.md')) {
              results.push(`openspec/schemas/${entry.name}/${file}`)
            }
          }
        }
      }
    } catch {}
  }

  return results.sort()
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/dashboard/pages/config-editor.ts
git commit -m "feat: add config editor page with file browser and textarea editor"
```

---

### Task 8: Compose Page

**Files:**
- Create: `src/core/dashboard/pages/compose.ts`

**Purpose:** Single-page form for creating a new OpenSpec change. Maps form fields to proposal.md sections.

- [ ] **Step 1: Implement compose.ts**

Create `src/core/dashboard/pages/compose.ts`:

```typescript
import { join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { renderLayout } from './layout.js'

export function renderComposePage(projectRoot: string): string {
  const schemas = getSchemaOptions(projectRoot)

  const body = `
    <h2>新建 Change</h2>
    <form class="compose-form" id="compose-form" onsubmit="submitCompose(event)">
      <div class="form-row">
        <div class="form-group">
          <label for="change-name">Change 名称 <span class="hint">(kebab-case)</span></label>
          <input type="text" id="change-name" name="name" required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="例如: add-user-auth"
            oninput="validateChangeName()">
          <span id="name-hint" class="field-hint"></span>
        </div>
        <div class="form-group">
          <label for="schema">Schema</label>
          <select id="schema" name="schema">
            ${schemas.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="background">业务背景</label>
        <textarea id="background" name="background" rows="4"
          placeholder="这个 Change 解决什么问题？为什么现在做？"></textarea>
      </div>

      <div class="form-group">
        <label for="goals">目标</label>
        <div class="form-row">
          <textarea class="half" id="business-goals" name="businessGoals" rows="3"
            placeholder="业务目标..."></textarea>
          <textarea class="half" id="tech-goals" name="techGoals" rows="3"
            placeholder="技术目标..."></textarea>
        </div>
      </div>

      <div class="form-group">
        <label for="scope">变更范围 <span class="hint">(每行一个 capability，kebab-case)</span></label>
        <div class="scope-section">
          <div class="scope-col">
            <div class="scope-label">新增</div>
            <textarea id="scope-add" name="scopeAdd" rows="3"
              placeholder="user-login&#10;user-registration"></textarea>
          </div>
          <div class="scope-col">
            <div class="scope-label">修改</div>
            <textarea id="scope-modify" name="scopeModify" rows="3"
              placeholder="现有 capability 名称..."></textarea>
          </div>
          <div class="scope-col">
            <div class="scope-label">删除</div>
            <textarea id="scope-remove" name="scopeRemove" rows="3"
              placeholder="要移除的功能..."></textarea>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label for="acceptance">验收标准</label>
        <textarea id="acceptance" name="acceptance" rows="4"
          placeholder="功能验收标准 / 非功能验收标准 / 安全验收标准..."></textarea>
      </div>

      <div class="form-group">
        <label for="exclusions">明确排除的范围</label>
        <textarea id="exclusions" name="exclusions" rows="2"
          placeholder="不在本次 Change 范围内的内容..."></textarea>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary" id="submit-btn">创建 Change</button>
        <span id="compose-status"></span>
      </div>
    </form>
  `

  return renderLayout('新建 Change', body, '/compose')
}

function getSchemaOptions(projectRoot: string): string[] {
  const schemasDir = join(projectRoot, 'openspec', 'schemas')
  if (!existsSync(schemasDir)) return ['polaris-flow-backend']

  try {
    return readdirSync(schemasDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  } catch {
    return ['polaris-flow-backend']
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/dashboard/pages/compose.ts
git commit -m "feat: add compose page with change creation form"
```

---

### Task 9: API Endpoints

**Files:**
- Create: `src/core/dashboard/api/changes.ts`
- Create: `src/core/dashboard/api/configs.ts`
- Create: `src/core/dashboard/api/compose.ts`

**Purpose:** JSON API handlers for changes data, config file CRUD, and change creation.

- [ ] **Step 1: Implement api/changes.ts**

Create `src/core/dashboard/api/changes.ts`:

```typescript
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { scanChanges, getChangeDetail, parseTasksMd } from '../change-scanner.js'

export function listChanges(projectRoot: string) {
  const changes = scanChanges(projectRoot)
  return changes.map(c => ({
    name: c.name,
    phase: c.phase,
    tasksTotal: c.tasksTotal,
    tasksDone: c.tasksDone,
    mtime: c.mtime
  }))
}

export function getChange(projectRoot: string, name: string) {
  const changeDir = join(projectRoot, 'openspec', 'changes', name)
  if (!existsSync(changeDir)) {
    return { error: `Change "${name}" not found` }
  }
  return getChangeDetail(changeDir)
}

export function toggleTask(projectRoot: string, name: string, taskIndex: number) {
  const tasksPath = join(projectRoot, 'openspec', 'changes', name, 'tasks.md')
  if (!existsSync(tasksPath)) {
    return { error: 'tasks.md not found' }
  }

  const content = readFileSync(tasksPath, 'utf8')
  const lines = content.split('\n')
  let currentIdx = 0
  let found = false

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*- )\[(.)\] (.+)/)
    if (match) {
      if (currentIdx === taskIndex) {
        const newState = match[2] !== ' ' ? ' ' : 'x'
        lines[i] = `${match[1]}[${newState}] ${match[3]}`
        found = true
        break
      }
      currentIdx++
    }
  }

  if (!found) {
    return { error: `Task index ${taskIndex} not found` }
  }

  writeFileSync(tasksPath, lines.join('\n'))
  return { ok: true, index: taskIndex }
}
```

- [ ] **Step 2: Implement api/configs.ts**

Create `src/core/dashboard/api/configs.ts`:

```typescript
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import * as yaml from 'yaml'

export function listConfigs(projectRoot: string) {
  const results: { path: string; name: string }[] = []

  if (existsSync(join(projectRoot, 'openspec', 'polaris.yaml'))) {
    results.push({ path: 'openspec/polaris.yaml', name: 'polaris.yaml' })
  }

  const schemasDir = join(projectRoot, 'openspec', 'schemas')
  if (existsSync(schemasDir)) {
    for (const entry of readdirSync(schemasDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const dir = join(schemasDir, entry.name)
        const files = readdirSync(dir, { recursive: true }) as string[]
        for (const file of files) {
          if (/\.(yaml|yml|md)$/.test(file)) {
            results.push({ path: `openspec/schemas/${entry.name}/${file}`, name: file })
          }
        }
      }
    }
  }

  return results
}

export function getConfig(projectRoot: string, configPath: string) {
  const fullPath = join(projectRoot, configPath)
  if (!existsSync(fullPath)) {
    return { error: 'File not found' }
  }

  const content = readFileSync(fullPath, 'utf8')
  const isYaml = configPath.endsWith('.yaml') || configPath.endsWith('.yml')

  return {
    path: configPath,
    content,
    syntax: isYaml ? 'yaml' : 'markdown'
  }
}

export function saveConfig(projectRoot: string, configPath: string, content: string) {
  const fullPath = join(projectRoot, configPath)
  // Security: only allow writes within openspec/
  if (!fullPath.includes('/openspec/') || fullPath.includes('..')) {
    return { error: 'Invalid config path' }
  }

  writeFileSync(fullPath, content)
  return { ok: true, path: configPath }
}
```

- [ ] **Step 3: Implement api/compose.ts**

Create `src/core/dashboard/api/compose.ts`:

```typescript
import { join } from 'node:path'
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'

export function listSchemas(projectRoot: string) {
  const schemasDir = join(projectRoot, 'openspec', 'schemas')
  if (!existsSync(schemasDir)) return []

  return readdirSync(schemasDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

export function createChange(projectRoot: string, body: string) {
  const data = JSON.parse(body) as {
    name?: string
    schema?: string
    background?: string
    businessGoals?: string
    techGoals?: string
    scopeAdd?: string
    scopeModify?: string
    scopeRemove?: string
    acceptance?: string
    exclusions?: string
  }

  if (!data.name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.name)) {
    return { error: 'Invalid change name (kebab-case required)' }
  }

  const changeDir = join(projectRoot, 'openspec', 'changes', data.name)
  if (existsSync(changeDir)) {
    return { error: `Change "${data.name}" already exists` }
  }

  mkdirSync(changeDir, { recursive: true })

  // Generate proposal.md from form data
  const scopeAddItems = (data.scopeAdd ?? '').split('\n').filter(s => s.trim()).map(s => `  - ${s.trim()}`).join('\n')
  const scopeModifyItems = (data.scopeModify ?? '').split('\n').filter(s => s.trim()).map(s => `  - ${s.trim()}`).join('\n')
  const scopeRemoveItems = (data.scopeRemove ?? '').split('\n').filter(s => s.trim()).map(s => `  - ${s.trim()}`).join('\n')

  const proposal = `# Proposal: ${data.name}

## 1. 业务背景
${data.background ?? '待填写'}

## 2. 目标

### 2.1 业务目标
${data.businessGoals ?? '待填写'}

### 2.2 技术目标
${data.techGoals ?? '待填写'}

## 3. 范围

### 3.1 变更范围

#### 3.1.1 新增的功能
${scopeAddItems || '  - 待填写'}

#### 3.1.2 要修改的功能
${scopeModifyItems || '  - 无'}

#### 3.1.3 要删除的功能
${scopeRemoveItems || '  - 无'}

### 3.2 明确排除的范围

${data.exclusions ?? '待填写'}

## 4. 验收标准

${data.acceptance ?? '待填写'}

## 5. 风险评估

| 风险点 | 影响程度 | 发生概率 | 应对措施 |
|--------|---------|---------|---------|
|        |         |         |         |

## 6. 回滚计划

待填写

## 7. 影响

待填写
`

  writeFileSync(join(changeDir, 'proposal.md'), proposal)

  return { ok: true, name: data.name, redirect: `/change/${encodeURIComponent(data.name)}` }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/core/dashboard/api/
git commit -m "feat: add dashboard API endpoints for changes, configs, compose"
```

---

### Task 10: Static Assets (CSS + JS)

**Files:**
- Create: `src/core/dashboard/static/app.css`
- Create: `src/core/dashboard/static/app.js`

**Purpose:** Stylesheet and client-side JS for page interactions (view toggle, file loading, form submit, config save).

- [ ] **Step 1: Implement app.css**

Create `src/core/dashboard/static/app.css`:

```css
:root {
  --bg: #1e1e2e;
  --surface: #313244;
  --overlay: #45475a;
  --text: #cdd6f4;
  --subtext: #a6adc8;
  --blue: #89b4fa;
  --green: #a6e3a1;
  --yellow: #f9e2af;
  --red: #f38ba8;
  --purple: #cba6f7;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  padding: 0 20px;
  height: 48px;
  border-bottom: 1px solid var(--overlay);
}

.topbar-brand { font-weight: bold; color: var(--blue); }

.topbar-tabs { display: flex; gap: 4px; }

.nav-item {
  color: var(--subtext);
  text-decoration: none;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 14px;
}

.nav-item:hover { background: var(--overlay); color: var(--text); }
.nav-item.active { background: var(--blue); color: var(--bg); }

.main-content { max-width: 1200px; margin: 0 auto; padding: 24px 20px; }

/* Stats */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--surface);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.stat-value { font-size: 28px; font-weight: bold; color: var(--blue); }
.stat-label { font-size: 13px; color: var(--subtext); margin-top: 4px; }

/* Board header */
.board-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.view-toggles { display: flex; gap: 4px; }

.view-toggle {
  background: var(--surface);
  color: var(--subtext);
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.view-toggle.active { background: var(--blue); color: var(--bg); }

/* Change rows (list view) */
.change-row {
  display: block;
  background: var(--surface);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 8px;
  text-decoration: none;
  color: var(--text);
  transition: background 0.15s;
}

.change-row:hover { background: var(--overlay); }

.change-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.change-name { font-weight: 600; font-size: 15px; }
.change-phase { font-size: 13px; color: var(--subtext); }

.progress-bar {
  background: var(--overlay);
  border-radius: 3px;
  height: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.change-row-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--subtext);
}

/* Kanban */
.kanban-board {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  overflow-x: auto;
}

.kanban-col {
  background: var(--surface);
  border-radius: 8px;
  padding: 10px;
  min-height: 100px;
}

.kanban-col-header {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
}

.kanban-count {
  background: var(--overlay);
  border-radius: 10px;
  padding: 0 6px;
  font-size: 11px;
}

.kanban-card {
  display: block;
  background: var(--overlay);
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 6px;
  text-decoration: none;
  color: var(--text);
  font-size: 13px;
}

.kanban-card:hover { background: var(--blue); color: var(--bg); }

.kanban-card-name { font-weight: 500; }
.kanban-card-progress { font-size: 11px; color: var(--subtext); margin-top: 2px; }

.kanban-empty { color: var(--subtext); font-size: 13px; padding: 8px; }

/* Detail page */
.detail-header { margin-bottom: 20px; }

.back-link {
  color: var(--subtext);
  text-decoration: none;
  font-size: 14px;
}

.back-link:hover { color: var(--blue); }

.detail-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 8px;
}

.badge {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.badge-proposal { background: var(--purple); color: var(--bg); }
.badge-specs { background: var(--blue); color: var(--bg); }
.badge-design { background: var(--yellow); color: var(--bg); }
.badge-tasks { background: var(--red); color: var(--bg); }
.badge-done { background: var(--green); color: var(--bg); }

.detail-actions { margin-top: 12px; }

.btn {
  background: var(--overlay);
  color: var(--text);
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.btn:hover { background: var(--blue); color: var(--bg); }

.detail-layout { display: flex; gap: 20px; }

.detail-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--surface);
  border-radius: 8px;
  padding: 12px;
}

.file-tree-item {
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--subtext);
}

.file-tree-item:hover { background: var(--overlay); color: var(--text); }
.file-tree-item.active { background: var(--blue); color: var(--bg); }

.detail-content {
  flex: 1;
  background: var(--surface);
  border-radius: 8px;
  padding: 20px;
  min-height: 400px;
  overflow: auto;
}

/* Markdown body */
.markdown-body h1 { font-size: 1.6em; margin-bottom: 12px; color: var(--blue); }
.markdown-body h2 { font-size: 1.3em; margin: 20px 0 10px; }
.markdown-body h3 { font-size: 1.1em; margin: 16px 0 8px; }
.markdown-body ul, .markdown-body ol { padding-left: 20px; margin: 8px 0; }
.markdown-body li { margin: 4px 0; }
.markdown-body code { background: var(--overlay); padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
.markdown-body pre { background: var(--overlay); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 10px 0; }
.markdown-body pre code { background: none; padding: 0; }
.markdown-body a { color: var(--blue); }
.markdown-body table { border-collapse: collapse; width: 100%; margin: 10px 0; }
.markdown-body th, .markdown-body td { border: 1px solid var(--overlay); padding: 6px 10px; text-align: left; font-size: 13px; }
.markdown-body th { background: var(--overlay); }
.markdown-body hr { border: none; border-top: 1px solid var(--overlay); margin: 16px 0; }
.markdown-body input[type="checkbox"] { margin-right: 6px; }

/* Config editor */
.config-list { display: flex; flex-direction: column; gap: 4px; }

.config-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--surface);
  border-radius: 6px;
  text-decoration: none;
  color: var(--text);
  font-size: 14px;
}

.config-file-item:hover { background: var(--overlay); }

.editor-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.editor-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }

.syntax-label {
  font-size: 11px;
  background: var(--overlay);
  padding: 2px 8px;
  border-radius: 3px;
  color: var(--subtext);
}

.config-editor {
  width: 100%;
  min-height: 500px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--overlay);
  border-radius: 6px;
  padding: 14px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}

.validate-msg { margin-top: 8px; font-size: 13px; }

/* Compose form */
.compose-form { max-width: 800px; }

.form-row { display: flex; gap: 12px; }

.form-group { margin-bottom: 16px; }

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--subtext);
}

.hint { font-weight: 400; font-size: 12px; color: var(--overlay); }

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--overlay);
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: var(--blue);
  outline: none;
}

.form-group textarea { resize: vertical; }
.half { flex: 1; }

.scope-section { display: flex; gap: 10px; }

.scope-col { flex: 1; }

.scope-label {
  font-size: 12px;
  color: var(--subtext);
  margin-bottom: 4px;
}

.scope-col textarea { resize: vertical; min-height: 60px; }

.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}

.btn-primary {
  background: var(--blue);
  color: var(--bg);
  border: none;
  padding: 8px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.btn-primary:hover { opacity: 0.9; }

.field-hint { font-size: 12px; color: var(--yellow); }
.error { color: var(--red); }
.empty-state { color: var(--subtext); padding: 40px; text-align: center; }

#save-status, #compose-status { font-size: 13px; }
```

- [ ] **Step 2: Implement app.js**

Create `src/core/dashboard/static/app.js`:

```javascript
// View toggle (list ↔ kanban)
document.querySelectorAll('.view-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-toggle').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    document.querySelectorAll('.view-panel').forEach(p => p.style.display = 'none')
    const target = document.getElementById('view-' + btn.dataset.view)
    if (target) target.style.display = ''
  })
})

// Change detail — load file content
async function loadFile(changeName, fileName) {
  const container = document.getElementById('detail-content')
  container.innerHTML = '<p>加载中...</p>'

  // Highlight active in sidebar
  document.querySelectorAll('.file-tree-item').forEach(el => el.classList.remove('active'))
  const target = document.querySelector(`[data-file="${fileName}"]`)
  if (target) target.classList.add('active')

  try {
    const res = await fetch(`/api/changes/${encodeURIComponent(changeName)}`)
    const data = await res.json()
    const file = data.files?.find(f => f.name === fileName)
    if (file) {
      // Render markdown via backend
      container.innerHTML = renderMarkdownHtml(file.content)
    } else {
      container.innerHTML = '<p class="empty-state">文件未找到</p>'
    }
  } catch (err) {
    container.innerHTML = `<p class="error">加载失败: ${err.message}</p>`
  }
}

// Simple client-side markdown to HTML (matches server-side for detail view)
function renderMarkdownHtml(md) {
  // We use the content as-is and wrap it; the server already marks it up on initial load.
  // For client-side fetch, we do a basic conversion here.
  let html = ''
  const lines = md.split('\n')
  let inCode = false
  let code = ''
  let codeLang = ''

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        html += `<pre><code>${esc(code.trim())}</code></pre>\n`
        code = ''; inCode = false
      } else {
        codeLang = line.slice(3).trim()
        inCode = true
      }
      continue
    }
    if (inCode) { code += line + '\n'; continue }

    const h = line.match(/^(#{1,6})\s+(.+)/)
    if (h) { html += `<h${h[1].length}>${h[2]}</h${h[1].length}>\n`; continue }

    if (line.match(/^[-*_]{3,}\s*$/)) { html += '<hr>\n'; continue }

    const cb = line.match(/^(\s*- )\[(.)\] (.+)/)
    if (cb) {
      html += `<li><input type="checkbox" disabled${cb[2] !== ' ' ? ' checked' : ''}>${cb[3]}</li>\n`
      continue
    }

    const ul = line.match(/^(\s*- )(.+)/)
    if (ul) { html += `<li>${ul[2]}</li>\n`; continue }

    if (line.trim() === '') { html += '<br>'; continue }

    html += `<p>${line}</p>\n`
  }

  if (inCode && code) html += `<pre><code>${esc(code.trim())}</code></pre>`
  return html
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Config editor — save
async function saveConfig(configPath) {
  const editor = document.getElementById('editor')
  const status = document.getElementById('save-status')
  status.textContent = '保存中...'

  try {
    const res = await fetch(`/api/configs/${encodeURIComponent(configPath)}`, {
      method: 'PUT',
      body: editor.value
    })
    const data = await res.json()
    if (data.ok) {
      status.textContent = '✓ 已保存'
      status.style.color = 'var(--green)'
    } else {
      status.textContent = '✗ ' + (data.error || '保存失败')
      status.style.color = 'var(--red)'
    }
  } catch (err) {
    status.textContent = '✗ ' + err.message
    status.style.color = 'var(--red)'
  }
}

// Compose — submit
async function submitCompose(event) {
  event.preventDefault()
  const form = document.getElementById('compose-form')
  const status = document.getElementById('compose-status')
  const btn = document.getElementById('submit-btn')

  btn.disabled = true
  status.textContent = '创建中...'

  const data = {
    name: form.elements.name.value,
    schema: form.elements.schema.value,
    background: form.elements.background.value,
    businessGoals: form.elements.businessGoals.value,
    techGoals: form.elements.techGoals.value,
    scopeAdd: form.elements.scopeAdd.value,
    scopeModify: form.elements.scopeModify.value,
    scopeRemove: form.elements.scopeRemove.value,
    acceptance: form.elements.acceptance.value,
    exclusions: form.elements.exclusions.value
  }

  try {
    const res = await fetch('/api/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    const result = await res.json()

    if (result.ok) {
      status.textContent = '✓ 创建成功，跳转中...'
      status.style.color = 'var(--green)'
      window.location.href = result.redirect
    } else {
      status.textContent = '✗ ' + (result.error || '创建失败')
      status.style.color = 'var(--red)'
      btn.disabled = false
    }
  } catch (err) {
    status.textContent = '✗ ' + err.message
    status.style.color = 'var(--red)'
    btn.disabled = false
  }
}

// Compose — validate change name
function validateChangeName() {
  const input = document.getElementById('change-name')
  const hint = document.getElementById('name-hint')
  if (input.value && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.value)) {
    hint.textContent = '请使用 kebab-case 格式'
  } else {
    hint.textContent = ''
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/dashboard/static/
git commit -m "feat: add dashboard stylesheet and client-side JavaScript"
```

---

### Task 11: Command Entry + Wire into CLI

**Files:**
- Create: `src/commands/dashboard.ts`
- Modify: `src/cli.ts` (add import + register)

**Purpose:** Create `polaris dashboard` commander subcommand that starts the HTTP server.

- [ ] **Step 1: Implement dashboard.ts command**

Create `src/commands/dashboard.ts`:

```typescript
import { Command } from 'commander'
import { startServer } from '../core/dashboard/server.js'

export const dashboard = new Command('dashboard')
  .description('Start the OpenSpec dashboard web server.')
  .option('--port <port>', 'Server port', '3700')
  .option('--open', 'Auto-open browser')
  .action(async function (this: Command) {
    const opts = this.opts<{ port: string; open: boolean }>()
    const port = parseInt(opts.port, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error('Invalid port number')
      process.exit(1)
    }

    const projectRoot = process.cwd()
    startServer({ port, open: opts.open }, projectRoot)
  })
```

- [ ] **Step 2: Modify cli.ts to register dashboard**

In `src/cli.ts`, add after the existing imports:

```typescript
import { dashboard } from './commands/dashboard.js'
```

And add after `program.addCommand(status)`:

```typescript
program.addCommand(dashboard)
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck && npm run build`
Expected: No type errors, build succeeds

- [ ] **Step 4: Manual smoke test**

Run:
```bash
mkdir -p /tmp/test-dashboard/openspec/changes/test-change
cat > /tmp/test-dashboard/openspec/changes/test-change/proposal.md << 'EOF'
# Test Proposal
## Background
Test content
EOF

cat > /tmp/test-dashboard/openspec/changes/test-change/tasks.md << 'EOF'
- [ ] 1.1 First task
- [x] 1.2 Second task
- [ ] 1.3 Third task
EOF

cd /tmp/test-dashboard && node /path/to/dist/bin/polaris.js dashboard --port 3700
```

Expected: Server starts, `curl http://localhost:3700/` returns HTML dashboard page, `curl http://localhost:3700/api/changes` returns JSON with test-change details.

- [ ] **Step 5: Commit**

```bash
git add src/commands/dashboard.ts src/cli.ts
git commit -m "feat: add polaris dashboard command"
```

---

### Task 12: Integration Tests

**Files:**
- Create: `tests/integration/dashboard.test.ts`

**Purpose:** Integration test that starts the server, makes HTTP requests against a real temp dir with openspec/ structure.

- [ ] **Step 1: Implement integration test**

Create `tests/integration/dashboard.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import http from 'node:http'
import { handleRequest } from '../../src/core/dashboard/router.js'

let testDir: string
let projectDir: string
let server: http.Server
let baseUrl: string

function makeChange(name: string, files: Record<string, string>) {
  const changeDir = join(projectDir, 'openspec', 'changes', name)
  mkdirSync(changeDir, { recursive: true })
  for (const [filename, content] of Object.entries(files)) {
    const filePath = join(changeDir, filename)
    mkdirSync(join(filePath, '..'), { recursive: true })
    writeFileSync(filePath, content)
  }
}

function fetchJson(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl)
    const bodyStr = body ? JSON.stringify(body) : undefined
    const req = http.request(url, { method, headers: bodyStr ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString()
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) })
        } catch {
          resolve({ status: res.statusCode ?? 0, body: raw })
        }
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

function fetchText(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}${path}`, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }))
    })
    req.on('error', reject)
  })
}

beforeAll(async () => {
  testDir = join(tmpdir(), `polaris-dash-int-${Date.now()}`)
  projectDir = join(testDir, 'project')
  mkdirSync(projectDir, { recursive: true })

  // Start one server for all tests
  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => handleRequest(req, res, projectDir))
    server.listen(0, () => {
      const addr = server.address() as { port: number }
      baseUrl = `http://localhost:${addr.port}`
      resolve()
    })
  })
})

afterAll(() => {
  server?.close()
})

describe('Dashboard integration', () => {
  it('GET / returns dashboard HTML', async () => {
    const res = await fetchText('/')
    expect(res.status).toBe(200)
    expect(res.body).toContain('任务看板')
  })

  it('GET / returns empty state when no changes exist', async () => {
    const res = await fetchText('/')
    expect(res.body).toContain('暂无 Changes')
  })

  it('GET / shows change with stats', async () => {
    makeChange('add-auth', {
      'proposal.md': '# Add Auth',
      'tasks.md': '- [ ] 1.1 Task A\n- [x] 1.2 Task B\n- [ ] 1.3 Task C'
    })
    const res = await fetchText('/')
    expect(res.status).toBe(200)
    expect(res.body).toContain('add-auth')
    expect(res.body).toContain('1/3')
  })

  it('GET /api/changes returns JSON', async () => {
    const res = await fetchJson('GET', '/api/changes')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect((res.body as any[]).some((c: any) => c.name === 'add-auth')).toBe(true)
  })

  it('GET /change/:name returns detail page', async () => {
    const res = await fetchText('/change/add-auth')
    expect(res.status).toBe(200)
    expect(res.body).toContain('add-auth')
    expect(res.body).toContain('proposal.md')
  })

  it('POST /api/changes/:name/tasks/:id toggles checkbox', async () => {
    const res = await fetchJson('POST', '/api/changes/add-auth/tasks/0')
    expect(res.status).toBe(200)
    expect((res.body as any).ok).toBe(true)

    // Verify the file was updated
    const { readFileSync } = await import('node:fs')
    const tasksContent = readFileSync(join(projectDir, 'openspec/changes/add-auth/tasks.md'), 'utf8')
    expect(tasksContent).toContain('[x] 1.1')
  })

  it('POST /api/compose creates a new change', async () => {
    const res = await fetchJson('POST', '/api/compose', {
      name: 'add-export',
      schema: 'polaris-flow-backend',
      background: 'Users need export',
      businessGoals: 'Enable CSV export',
      techGoals: 'Implement export API',
      scopeAdd: 'data-export',
      scopeModify: '',
      scopeRemove: '',
      acceptance: 'Users can download CSV',
      exclusions: 'PDF export'
    })
    expect(res.status).toBe(200)
    expect((res.body as any).ok).toBe(true)
    expect((res.body as any).name).toBe('add-export')

    const { readFileSync } = await import('node:fs')
    const proposal = readFileSync(join(projectDir, 'openspec/changes/add-export/proposal.md'), 'utf8')
    expect(proposal).toContain('Users need export')
    expect(proposal).toContain('# Proposal: add-export')
  })

  it('POST /api/compose returns error for invalid name', async () => {
    const res = await fetchJson('POST', '/api/compose', {
      name: 'Invalid Name!',
      background: 'test'
    })
    expect((res.body as any).error).toBeTruthy()
  })

  it('GET /static/app.css returns stylesheet', async () => {
    const res = await fetchText('/static/app.css')
    expect(res.status).toBe(200)
  })

  it('GET /api/schemas returns available schemas', async () => {
    const schemasDir = join(projectDir, 'openspec', 'schemas', 'polaris-flow-backend')
    mkdirSync(schemasDir, { recursive: true })
    const res = await fetchJson('GET', '/api/schemas')
    expect(res.status).toBe(200)
    expect(res.body).toContain('polaris-flow-backend')
  })
})
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/integration/dashboard.test.ts`
Expected: PASS (all integration tests green)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/dashboard.test.ts
git commit -m "test: add dashboard integration tests"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Full typecheck + lint + tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass, no type errors, no lint violations

- [ ] **Step 2: Verify spec coverage**

Run through checklist:
- [x] Board page with stats + list/kanban (Task 5)
- [x] Change detail page with document tree (Task 6)
- [x] Config editor page (Task 7)
- [x] Compose page (Task 8)
- [x] API endpoints (Task 9)
- [x] Dashboard command (Task 11)
- [x] Tests (Task 1, 2, 12)

- [ ] **Step 3: Commit final check**

```bash
git status
```
