# Dashboard 合并 M1 实施计划（迁入 + 单进程骨架 + 契约冻结）

> **For agentic workers:** 本计划按 task 顺序执行，每个 Step 用 `- [ ]` 跟踪。Task 1 内部存在一个"仓库不可构建"窗口（见 Global Constraints），必须在一个提交内闭合 Task 1。

**Goal:** 把 `polaris-web`（前端）与 `polaris-cli`（Dashboard API）复制进本仓，并让 `polaris dashboard` 成为单进程单端口的工作台：同一端口提供 `/api/*` 与前端静态资源，启动后自动打开浏览器。

**Architecture:** 前端落在仓库根 `dashboard/`（自带 package.json / lockfile，不引 pnpm workspace，因此不受本仓 `src/**` 的 tsc / prettier / eslint 管辖）；Dashboard API 落在 `src/dashboard/`，只做传输层，业务语义下沉 `src/core/`；前端产物由 vite 构建到 `dist/web/`，由 `src/dashboard/static.ts` 托管。两半之间只有 `/api/*` 的 JSON 契约。

**Tech Stack:** TypeScript（Node 20+，ESM，`NodeNext`）、Commander、Vitest、Vite 6 + Vue 3（仅 `dashboard/` 内）。

**Spec:** `docs/specs/2026-09-18-dashboard-integration-design.md`

## Global Constraints

- **迁移一律复制，绝不移动**：`polaris-web` 与 `polaris-cli` 在 M1 期间保持原样可查，直到 M4 确认退役。复制只经 `scripts/migrate-dashboard.js`，不手工 `cp`。
- **中间态不发版**：M1 结束时面板对 5 类 kind 与新阶段仍不可见（数据源还是旧的）。`README` 的用户面 `dashboard` 用法说明留到 M2，M1 只订正已失实的结构性表述。
- **首发只读**（已决 4）：M1 不新增任何写操作；既有绕过 `.locks/` 的写路由（`PUT /api/configs/:path`）在 Task 1 删除。
- **不得改动前端代码风格**：`dashboard/` 不在 `src/` 下，`pnpm format:check` 与 `pnpm lint` 的范围与行为必须与改造前完全一致，且**不新增任何 ignore 例外**。
- **依赖方向**：`cli → commands → core → utils`，禁止反向。`src/dashboard/` 属传输层，业务逻辑必须放 `src/core/`。
- **服务只绑 `127.0.0.1`**，不做远程访问 / 鉴权。
- 代码文件与函数注释用中文；TS 文件名 kebab-case；导出函数 camelCase。
- **CHANGELOG**：`main` 为 `0.1.0`，当前分支已有 `0.1.1` 条目 —— 追加到该条目下，**不**升到 `0.1.2`。
- 提交前须过：`pnpm format:check && pnpm lint && pnpm build && pnpm test`。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `dashboard/**`（88 文件） | 前端子工程：`index.html`、`vite.config.js`、`package.json`、`public/`、`src/`、`docs/` |
| `src/dashboard/server.ts` | 单进程 HTTP 服务：`/api/*` 转发 + 静态托管 + 开浏览器（由脚本覆盖后重写） |
| `src/dashboard/static.ts` | **新建**：静态托管、MIME、路径穿越防护、SPA 兜底 |
| `src/dashboard/router.ts` | API 路由表（脚本搬入后裁掉指向未搬文件的路由） |
| `src/dashboard/api/*.ts` | API 处理器（M1 保留旧数据源，M2 再换） |
| `src/dashboard/change-scanner.ts` / `markdown.ts` | 变更扫描与 markdown 辅助（M1 保留，M2 重写） |
| `src/commands/dashboard.ts` | **新建**：`polaris dashboard` 命令编排（从 `register-user-commands.ts` 拆出） |
| `src/cli/register-user-commands.ts` | 改为注册 `dashboardCommand`；删 `--api-port`，加 `--no-open` / `--api-only` |
| `src/commands/status.ts` | 参考它的命令编排写法（错误处理与 `--json` 风格保持一致） |
| `scripts/migrate-dashboard.js` | 已就绪的迁移脚本（本次执行它） |
| `build.js` | 追加 vite 构建步骤 |
| `.github/workflows/ci.yml` | Build 前补前端依赖安装 |
| `test/ts/dashboard-static.test.ts` | **新建**：`static.ts` 单测 |
| `test/ts/dashboard-resolve.test.ts` | **删除**：测的是被移除的 `resolvePolarisWebRoot` |
| `docs/specs/2026-09-18-dashboard-api-contract.md` | **新建**：`/api/*` 契约（M2 的实现依据） |
| `README.md` / `README-zh.md` / `AGENTS.md` | 订正已失实的"三仓"表述 |

---

### Task 1: 执行迁移脚本并恢复可编译

纯复制会让本仓不可构建（搬来的 `router.ts` 引用了刻意未搬的三个文件），本 task 必须在一个提交内闭合这个窗口。

**Files:**
- Run: `scripts/migrate-dashboard.js`
- Create: `dashboard/**`（88）、`src/dashboard/{change-scanner,markdown,router}.ts`、`src/dashboard/api/{changes,check,configs,filesystem,projects,workflow}.ts`（共 10 个 TS 文件）
- Modify: `src/dashboard/server.ts`（脚本覆盖既有启动器）、`src/dashboard/router.ts`、`src/dashboard/api/configs.ts`
- Delete: `test/ts/dashboard-resolve.test.ts`

- [ ] **Step 1: 预演并核对清单**

```bash
pnpm migrate:dashboard
```

预期：`合计 98 个文件`（`dashboard/` 88 + `src/dashboard/` 10），且**不含** `useTasksMock.js`、`.DS_Store`、`docs/{agent-guide,development,quickstart,troubleshooting}.md`。

- [ ] **Step 2: 写入（`--force` 覆盖既有启动器）**

```bash
pnpm migrate:dashboard:write --force
```

- [ ] **Step 3: 记录源仓未被改动**

```bash
git -C ../polaris-web status --porcelain
git -C ../polaris-cli status --porcelain
```

预期：输出与执行脚本前**完全一致**（两仓本就各有既有改动，不得因本次迁移新增任何条目）。

- [ ] **Step 4: 裁 `router.ts`**

删除下列 import、路由分支与处理函数引用（对应刻意未搬的 `change-operations.ts` / `change-validate.ts` / `compose.ts`）：

- `import('./api/change-operations.js')` 与 `POST /api/changes/:name/steps/:stepId/operations`
- `import('./api/change-validate.js')` 与 `POST /api/changes/:name/validate`
- `import('./api/compose.js')` 与 `POST /api/compose`、`GET /api/schemas`
- `PUT /api/configs/:path` 分支（保留同路径的 `GET`）

其中 `POST /api/changes/:name/steps/:stepId/operations` 是旧「继续 / 调度智能体」入口，依赖外部 `openspec` CLI 与 `POLARIS_CONTINUE_CMD`，**本设计不做**（§5.2），直接删除。

- [ ] **Step 5: 去掉 `api/configs.ts` 的写入能力**

删除 `saveConfig` 导出及其 `writeFileSync` 路径，文件内只留 `listConfigs` / `getConfig`。理由：它是绕过 `.locks/` 的直写（§5.1）。

- [ ] **Step 6: 删除失效测试**

```bash
git rm test/ts/dashboard-resolve.test.ts
```

该文件测的是 `resolvePolarisWebRoot` —— Step 2 已用 polaris-cli 的 server 覆盖它，函数不复存在。

- [ ] **Step 7: 验证可编译**

```bash
pnpm build && pnpm test
```

预期：tsc 零错误；测试全绿。若 tsc 报出 polaris-cli 侧独有严格项（`noUncheckedIndexedAccess` / `noImplicitOverride` / `noFallthroughCasesInSwitch`）相关的错误，说明搬来的代码依赖了更严的设置 —— 属可修的小问题，就地修正即可（本仓这三项未开，只会更宽松）。

- [ ] **Step 8: 提交（单独一个提交，闭合不可构建窗口）**

```bash
git add -A dashboard src/dashboard test/ts
git commit -m "feat: 迁入 Dashboard 前端与 API（复制自 polaris-web / polaris-cli）"
```

---

### Task 2: 静态托管 `src/dashboard/static.ts`（TDD）

**Files:**
- Create: `test/ts/dashboard-static.test.ts`
- Create: `src/dashboard/static.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentTypeOf, resolveStaticPath } from '../../src/dashboard/static.js';

function fixture(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'polaris-web-root-'));
  writeFileSync(path.join(root, 'index.html'), '<div id="app"></div>');
  mkdirSync(path.join(root, 'assets'));
  writeFileSync(path.join(root, 'assets', 'index.js'), 'console.log(1)');
  return root;
}

describe('resolveStaticPath', () => {
  it('根路径映射到 index.html', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/')).toBe(path.join(root, 'index.html'));
  });

  it('命中真实文件', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/assets/index.js')).toBe(path.join(root, 'assets', 'index.js'));
  });

  it('拒绝路径穿越', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/../../etc/passwd')).toBeNull();
    expect(resolveStaticPath(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
  });

  it('不存在的文件返回 null', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/nope.js')).toBeNull();
  });

  it('非法百分号编码不抛异常', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/%zz')).toBeNull();
  });
});

describe('contentTypeOf', () => {
  it('覆盖前端产物常用类型', () => {
    expect(contentTypeOf('a.html')).toContain('text/html');
    expect(contentTypeOf('a.js')).toContain('javascript');
    expect(contentTypeOf('a.css')).toContain('text/css');
    expect(contentTypeOf('a.svg')).toContain('image/svg+xml');
    expect(contentTypeOf('a.woff2')).toContain('font/woff2');
  });

  it('未知扩展名回退二进制流', () => {
    expect(contentTypeOf('a.unknown')).toBe('application/octet-stream');
  });
});
```

```bash
pnpm vitest run test/ts/dashboard-static.test.ts   # 预期：失败（模块不存在）
```

- [ ] **Step 2: 实现 `static.ts`**

要点（完整实现由执行者补齐，但下列行为必须成立）：

```ts
/** 取扩展名对应的 Content-Type；未知回退 application/octet-stream */
export function contentTypeOf(filePath: string): string;

/**
 * 在 webRoot 内解析 URL 路径为绝对路径。
 * 越界（路径穿越）、不存在、非文件、非法编码一律返回 null。
 */
export function resolveStaticPath(webRoot: string, urlPath: string): string | null;

/**
 * 托管静态资源。命中写响应并返回 true；未命中返回 false，交给调用方决定 404。
 * SPA 兜底：无扩展名的未命中路径回退 index.html（hash router 下正常不会触发）。
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, webRoot: string): boolean;
```

硬要求：

- 去掉 query 后再 `decodeURIComponent`，且 **decode 必须包 try/catch**（`/%zz` 会抛 `URIError`）。
- 越界判定：`path.resolve(webRoot, rel)` 必须等于 `path.resolve(webRoot)` 或以 `path.resolve(webRoot) + path.sep` 开头。
- MIME 表覆盖：`html/js/mjs/css/json/map/svg/png/jpg/jpeg/gif/ico/woff/woff2/txt/webmanifest`。
- 静态响应带 `Cache-Control: no-cache`（本地工作台，避免改完前端看不到）。

- [ ] **Step 3: 测试转绿**

```bash
pnpm vitest run test/ts/dashboard-static.test.ts
```

---

### Task 3: 单进程 `src/dashboard/server.ts`

**Files:**
- Modify: `src/dashboard/server.ts`（Step 2 已由脚本覆盖为 polaris-cli 的旧 HTTP server，本 task 全量重写）

- [ ] **Step 1: 重写 server**

```ts
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from './router.js';
import { serveStatic } from './static.js';

export type StartDashboardOptions = {
  /** 服务端口 */
  port: number;
  /** 要可视化的项目根；默认 process.cwd() */
  projectPath?: string;
  /** 就绪后自动打开浏览器；默认 true */
  open?: boolean;
  /** 只起 API，不做静态托管（供 dashboard/ 内 vite dev 使用） */
  apiOnly?: boolean;
};

/** 前端产物根：从 dist/dashboard/server.js 上溯两级 = 包根，再拼 dist/web */
export function resolveWebRoot(fromUrl: string = import.meta.url): string;

/** 就绪后打开浏览器；失败忽略（不阻断服务） */
export function openBrowser(url: string): void;

/** 启动工作台；阻塞至进程退出 */
export async function startDashboard(options: StartDashboardOptions): Promise<void>;
```

行为要求：

- 路由分流：`url.startsWith('/api/')` → `void handleRequest(req, res, projectRoot).catch(...)`（**必须 catch**，否则异步拒绝会打挂进程）；否则 `apiOnly` 时回 404 JSON，非 `apiOnly` 时 `serveStatic`，未命中回 404。
- **产物缺失前置校验**：非 `apiOnly` 且 `dist/web/index.html` 不存在时，**listen 之前**抛错并给出构建命令提示（`pnpm run build`），不静默降级为只起 API。
- `server.listen(port, '127.0.0.1')` —— 显式绑定回环。
- 在 **`listening` 事件**里开浏览器（不是固定 setTimeout），URL 用 `http://127.0.0.1:<port>`（与绑定地址一致，避开 `localhost` 解析到 `::1` 的错配）。
- `EADDRINUSE` 给出明确提示并 `process.exitCode = 1`。
- 启动日志：前端地址、API 地址、项目根、`Ctrl+C` 提示。

- [ ] **Step 2: 类型与构建校验**

```bash
pnpm build
```

---

### Task 4: 命令层接线

**Files:**
- Create: `src/commands/dashboard.ts`
- Modify: `src/cli/register-user-commands.ts`

- [ ] **Step 1: 新建 `src/commands/dashboard.ts`**

把命令编排从 `register-user-commands.ts` 拆出（对齐 `src/commands/` 下其它命令的写法），导出 `dashboardCommand(projectPath, options)`：

```ts
export type DashboardCommandOptions = { port?: string; open?: boolean; apiOnly?: boolean };

/** 解析端口并启动工作台；端口非法或启动失败时置 process.exitCode = 1 */
export async function dashboardCommand(projectPath: string, options: DashboardCommandOptions): Promise<void>;
```

端口校验：非整数或不在 `1..65535` 时报错返回；**默认 `3700`**。

- [ ] **Step 2: 改 `register-user-commands.ts`**

```ts
program
  .command('dashboard')
  .description('Start the local workbench (API + web UI on one port)')
  .argument('[path]', 'project root to visualize', process.cwd())
  .option('--port <n>', 'server port', '3700')
  .option('--no-open', 'do not open the browser automatically')
  .option('--api-only', 'serve the API only (for `npm run dev` in dashboard/)')
  .action(async (projectPath: string, options) => {
    await dashboardCommand(projectPath, {
      port: options.port,
      open: options.open, // Commander 的 --no-open 使其默认 true
      apiOnly: options.apiOnly,
    });
  });
```

**必须删除**：`--api-port` 选项、`startDashboard` 的直接 import 与内联调用、`description` 里"launches sibling polaris-web"的表述。

- [ ] **Step 3: 校验**

```bash
pnpm build && node bin/polaris.js dashboard --help
```

预期：`--help` 只列 `--port` / `--no-open` / `--api-only`，无 `--api-port`。

---

### Task 5: 前端子工程配置

**Files:**
- Modify: `dashboard/vite.config.js`、`dashboard/package.json`、`dashboard/docs/README.md`

- [ ] **Step 1: `vite.config.js`**

- `base` 改为 `'./'`（相对路径，静态托管在任意前缀下都可用）。
- `proxy` **只留 `/api`**，删除 `/static`（服务端从无该实现，是死配置）。

- [ ] **Step 2: `package.json`**

- 去掉 `"private": true`。
- `name` 从 `polaris-web` 改为 `@polaris/dashboard-web`，避免与本仓 `@polaris/polaris-flow` 混淆。
- 保留 `dev` / `build` / `preview` 三个 script 不变。

- [ ] **Step 3: 装依赖并构建**

```bash
npm --prefix dashboard install
npm --prefix dashboard run build
```

预期：产出 `dashboard/dist/`（本步骤只验证前端自身可构建；产物落位到 `dist/web` 由 Task 6 接管）。

- [ ] **Step 4: 清理 `dashboard/docs/README.md` 死链**

该索引里指向 `agent-guide.md` / `development.md` / `quickstart.md` / `troubleshooting.md` 的链接已成死链（这四份刻意未搬，描述的是即将退役的 polaris-cli 后端）。删除对应条目，并在 README 顶部加一句说明：本目录只保留前端设计文档。

---

### Task 6: 构建链

**Files:**
- Modify: `build.js`
- Modify: `package.json`

- [ ] **Step 1: `build.js` 追加 vite 步骤**

在 `runTsc()` 之后插入：

```js
const vitePath = path.join('dashboard', 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(vitePath)) {
  console.error('\n未安装前端依赖，请先执行：npm --prefix dashboard install');
  process.exit(1);
}
console.log('Building dashboard web…');
execFileSync(process.execPath, [vitePath, 'build'], { cwd: 'dashboard', stdio: 'inherit' });
```

同时把 `dashboard/vite.config.js` 的 `build.outDir` 设为 `'../dist/web'`、`build.emptyOutDir` 设为 `true`。

**为什么用 `process.execPath + vite.js` 而不是 spawn `npm`**：与本文件既有的 `require.resolve('typescript/bin/tsc')` 写法一致，且规避 Windows 上 `npm.cmd` 的跨平台问题。

- [ ] **Step 2: 根 `package.json` 加 `build:web`**

```json
"build:web": "npm --prefix dashboard run build"
```

- [ ] **Step 3: 验证产物落位**

```bash
pnpm build
ls dist/web/index.html
ls dist/dashboard/server.js     # 与 dist/web 同级，不混层
```

- [ ] **Step 4: 端到端验证（M1 主验收）**

```bash
node bin/polaris.js dashboard --port 3700
```

预期：单进程起在 `127.0.0.1:3700`，浏览器自动打开并渲染界面；`curl -s localhost:3700/api/projects` 返回 JSON。

再验证 `--api-only`：

```bash
node bin/polaris.js dashboard --port 3700 --api-only
npm --prefix dashboard run dev      # 另一终端，HMR
```

- [ ] **Step 5: 验证产物缺失时的报错路径**

```bash
mv dist/web /tmp/web-bak && node bin/polaris.js dashboard; mv /tmp/web-bak dist/web
```

预期：报错并提示 `pnpm run build`，**不**静默退化成只起 API。

---

### Task 7: CI 补前端依赖安装

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 在 Build 步之前插入前端依赖安装**

```yaml
      - name: Install dashboard deps
        run: npm --prefix dashboard ci
```

**为什么必须加**：CI 现有步骤是 `pnpm install --frozen-lockfile` → `pnpm run build`，而 `pnpm run build` 现在包含 vite 步骤。`pnpm install` 不会装 `dashboard/` 的 npm 依赖（二者 lockfile 独立、无 workspace），因此不加这一步 CI 会在 **Build 步直接失败**。

- [ ] **Step 2: 缓存**

`actions/setup-node` 现有 `cache: pnpm` 覆盖不到前端。追加一次 setup-node（或改用 `cache-dependency-path` 同时指向 `pnpm-lock.yaml` 与 `dashboard/package-lock.json`）。二选一即可，以 CI 能命中缓存为准。

---

### Task 8: 清理与收尾

**Files:**
- Modify: `eslint.config.js`、`scripts/prepublish-check.js`

- [ ] **Step 1: 删除过时的 eslint ignore**

`eslint.config.js` 的 ignores 里有 `'src/dashboard/web/'`（配注释「Dashboard 前端在浏览器运行，跳过 Node lint 规则」）。该路径已不存在，前端也不再落在 `src/` 下 —— 删除这一项。同时确认 ignores 里**不需要**新增 `dashboard/`（`lint` 脚本是 `eslint src/`，本来就扫不到它）。

- [ ] **Step 2: 补 `.vue` 到密钥扫描范围**

`scripts/prepublish-check.js` 的 `TEXT_EXTENSIONS` 有 `.js/.ts/.json/.md/.txt/.yml/.yaml/.toml`，缺 `.vue`。合并后 `dashboard/src/**/*.vue` 进了仓库，不补上就是扫描盲点。

- [ ] **Step 3: 全量自检**

```bash
pnpm format:check && pnpm lint && pnpm build && pnpm test
```

重点确认：`format:check` 与 `lint` 的**范围与行为与改造前完全一致**（仅 `src/`），`dashboard/` 下没有任何文件被 prettier 重排。

---

### Task 9: API 契约文档初稿

**Files:**
- Create: `docs/specs/2026-09-18-dashboard-api-contract.md`

- [ ] **Step 1: 冻结契约**

这是 M2 的实现依据（§五前置产物），必须覆盖：

- 端点清单与 HTTP 方法；查询参数（尤其 `?project=`）；每一项标注**只读 / 可写**。
- 响应字段与类型；错误形状（统一 `{ error: string }`）。
- 各 kind 的 phase 枚举：coding `specify|plan|design|tasks|build|verify|ship`（+ `retro`）；debug 族 `triage|diagnose|prescribe|patch|prove|closeout`；requirement / testcase / prototype 各自枚举。
- 任务项字段：`task_id` / `kind` / `phase` / `channel` / `worktree_path` / `started_at`。

**M1 只需定形**：可以标注"数据源待 M2 切换"，但字段名与形状必须现在定死 —— 前端是纯 JS、后端是 TS，没有共享类型，契约是唯一能防住"后端改了字段名、前端静默渲染空白"的手段。

- [ ] **Step 2: 交叉核对**

逐条对照 `src/dashboard/router.ts` 实际注册的路由，确保文档里没有已删除的端点（`/api/compose`、`/api/schemas`、`PUT /api/configs/:path`、`steps/:stepId/operations`、`/api/changes/:name/validate`）。

---

### Task 10: 文档订正与 CHANGELOG

**Files:**
- Modify: `README.md`、`README-zh.md`、`AGENTS.md`、`CHANGELOG.md`

- [ ] **Step 1: 订正已失实的"三仓"表述**

| 文件 | 行 | 现状 | 改为 |
| --- | --- | --- | --- |
| `README.md` | 12 | Dashboard "implementation lives in sibling `polaris-web`" | 前端 `dashboard/`、API `src/dashboard/` |
| `README.md` | 20–21 | 同级仓库表列出 `polaris-web` / `polaris-cli` | 删除该两行 |
| `README.md` | 44 | "launch Dashboard from sibling `polaris-web`（`POLARIS_WEB_PATH`）" | 单进程单端口；去 `POLARIS_WEB_PATH` |
| `README-zh.md` | 12 | "实现在同级 `polaris-web`…仅 `src/dashboard/server.ts` 启动器" | 前端 `dashboard/`、API `src/dashboard/` |
| `README-zh.md` | 37 | "执行其 `scripts/dev.sh`…`POLARIS_WEB_PATH` 覆盖路径" | 同上 |
| `AGENTS.md` | 18 | "UI/API 实现在同级仓库 `polaris-web`" | 前端 `dashboard/`、API `src/dashboard/` |
| `AGENTS.md` | 27 | `src/dashboard/` = 启动器 | `src/dashboard/` = 传输层（HTTP 路由与静态托管） |
| `AGENTS.md` | 36–37 | 同级仓库约定含 `polaris-web` / `polaris-cli` | 删该两行，保留 `polaris-flow` 单仓结构 |

**只订正事实**，不加 `dashboard` 用法说明（中间态不可发版，用法说明属 M2）。

- [ ] **Step 2: CHANGELOG 追加到现有 `0.1.1` 条目**

`main` 为 `0.1.0`，当前分支已有 `[0.1.1] - 2026-08-04` 条目（按 AGENTS.md：已有比 master 大的条目则追加到同一条目下，**不**升版本号）。在 `### Added` 下追加：

```markdown
- **Dashboard 合并**: `polaris-web`（Vue 前端）与 `polaris-cli` 的 Dashboard API 一并并入本仓；前端落 `dashboard/`、API 落 `src/dashboard/`，两仓退役
- **polaris dashboard 单进程**: 同一端口同时提供 `/api/*` 与前端静态资源（`dist/web/`），就绪后自动打开浏览器；移除 `--api-port`、`POLARIS_WEB_PATH` 与 `scripts/dev.sh` 拉起链路；新增 `--no-open` / `--api-only`（前端 HMR 开发用）
```

`### Removed` 下追加：`PUT /api/configs/:path`（绕过 `.locks/` 的直写）、`POST /api/compose`、`GET /api/schemas`、`steps/:stepId/operations` 与 `/api/changes/:name/validate`（依赖外部 `openspec` CLI）。

- [ ] **Step 3: 提交前全量自检**

```bash
pnpm format:check && pnpm lint && pnpm build && pnpm test
```

---

## M1 完成判据

1. `pnpm build && node bin/polaris.js dashboard` → 单进程、单端口、浏览器自动打开并渲染界面。
2. `pnpm build` 的产物同时含 `dist/dashboard/server.js`（后端）与 `dist/web/index.html`（前端），二者不混层。
3. `pnpm format:check` / `pnpm lint` 的范围与行为与改造前一致，`dashboard/` 下零文件被 prettier 触碰。
4. 运行期无任何 `npm install` / `tsc` / Vite 进程（`--api-only` 除外）。
5. `polaris-cli` 不再是运行依赖；`../polaris-web` 与 `../polaris-cli` 两源仓内容与迁移前完全一致。
6. `/api/*` 契约文档已存在且与 `router.ts` 实际路由一致。
7. 面板**仍不显示** 5 类 kind 与新阶段 —— 这是预期中间态，M2 处理。

## 后续里程碑（不在本计划内，各自单独出计划）

- **M2 数据源对齐**：`src/dashboard/scan/` 三个扫描器；端点按契约重写；阶段定义换为 8 阶段 × 3 模式 × 各 kind；前端 `utils/workflow.js` 与 `components/tasks/*` 适配。M2 可落单个 PR。
- **M3 写操作与多项目**：勾选任务 / 推进阶段经 CLI 原语；多项目注册表落点（§7 D4）；`/api/reveal` 白名单收紧。
- **M4 收敛与退役**：`test/ts/dashboard.test.ts`；README 使用说明；确认两源仓可归档；`npm pack` 解包终检。
