# Dashboard 集成设计（polaris-web + Dashboard API 全部并入 polaris-flow）

日期：2026-09-18
状态：**已定稿** — 四项决策全部关闭：全部并入 polaris-flow（已决 1、2）；M1 先搬 + M2 立即对齐且中间态不发版（已决 3）；首发只读（已决 4）。仅剩两个可后置项（§7 D4、D5）
实施计划：`docs/plans/2026-09-18-dashboard-integration-m1.md`
范围：让 `polaris dashboard` 成为「单命令、单进程、单端口」的工作台；前端落点与工具隔离、`/api/*` 契约、数据源对齐、分阶段落地路线

---

## 一、背景：现状是一条三仓三进程的启动链

`polaris dashboard` 当前的实现（`src/dashboard/server.ts`，约 120 行）本身**不是**工作台，只是编排启动器：

```
polaris dashboard [project] [--port 5173] [--api-port 3700]
└─ resolvePolarisWebRoot()
     POLARIS_WEB_PATH  →  <包根>/../polaris-web  →  <cwd>/../polaris-web
└─ bash <webRoot>/scripts/dev.sh <project>
     ├─ 缺依赖则 npm install（polaris-web）
     ├─ 缺依赖则 npm install + npm run build（polaris-cli）
     ├─ node polaris-cli/dist/bin/polaris.js dashboard --port 3700   ← API 进程
     └─ npm run dev -- --port 5173                                   ← Vite 开发服务器
└─ 2500ms 定时器 → open http://localhost:5173
```

三仓的实际内容：

| 仓库 | 内容 | 体量 |
| --- | --- | --- |
| `polaris-flow` | CLI、skills、hooks、OpenSpec schema；`src/dashboard/server.ts` 仅是启动器 | 本仓 |
| `polaris-web` | Vue 3 + Vite，纯 JS；视图约 800 行、composables/utils 约 2000 行、组件约 1000 行、styles 若干；`src/` 388K + `public/` 20K + `docs/` 1.0M | git 历史仅 6 commit |
| `polaris-cli` | 旧 CLI（与 polaris-flow 重名 `bin: polaris`）；Dashboard API 在 `src/core/dashboard/`：router 234 + change-scanner 460 + api 1229 + markdown 149 ≈ 2100 行 TS | 最后活动 2026-07-05 |

这带来四个结构性问题：

1. **不可发布**。npm 包 `files` 只有 `dist` / `bin` / `assets`，前端与 API 都在包外，靠相对路径猜同级目录。`npm i -g @polaris/polaris-flow` 之后 `polaris dashboard` 必然失败。
2. **依赖开发工具链**。运行期要 `npm install`、要 `tsc` 编译 polaris-cli、要起 Vite 开发服务器。
3. **双端口 + 代理 + 竞态**。5173 经 vite proxy 转发 `/api` 与 `/static` 到 3700（其中 `/static` 在服务端已无对应实现，是死配置）；浏览器在固定 2500ms 后打开，Vite 慢启动即白屏。
4. **数据模型错位**（成本最高，见 §3.2）。

---

## 二、目标与非目标

### 目标

- **G1 单命令单进程**：`polaris dashboard` 启动一个 Node HTTP 服务，同一端口同时提供 `/api/*` 与前端静态资源，并自动打开浏览器。
- **G2 单仓自洽**：CLI、Dashboard API、前端源码全在本仓；`npm i -g` 后开箱可用，不依赖任何兄弟仓库，不在运行期做任何构建。
- **G3 数据源正确**：API 读取 polaris-flow **当前**数据模型 —— `.polaris/workflow.yaml`（游标）+ `.polaris/tasks|testcases/<id>/state.yaml`（运行态）+ `openspec/changes/<id>/`（叙事与规格），而不是 openspec-cli 时代的模型。
- **G4 写操作有锁**：一切写操作经 polaris-flow 既有 CLI 原语（`workflow-entry` / `task-state-entry` / `tasks-lint` / `ship-cleanup` 等），不绕过 `.polaris/.locks/`。
- **G5 前端工具链双向隔离**：前端源码在本仓，但① 不受本仓 `tsc` / `prettier` / `eslint` 管辖（不进 `src/`，不改任何现有配置）；② 本仓的 `pnpm install` 不被拉入 Vue/Vite 依赖（前端自带 `package.json` + lockfile，不引 pnpm workspace）。
- **G6 契约冻结**：`/api/*` 冻结为独立文档。前端是纯 JS、后端是 TS，两侧没有共享类型、也没有编译期校验，契约文档是唯一的形式化保证。

### 非目标

- 不改 skills、hooks、`polaris init` 安装链路。
- 不重做前端技术栈（仍是 Vue 3 + Vite + hash router，不引入 Pinia、不迁 TS）。
- 不引入 pnpm workspace / monorepo 改造（`packages/` 迁移收益不抵改造成本）。
- 不做远程访问、多用户、鉴权 —— 服务只绑 `127.0.0.1`。
- 不做四件套的在线可视化编辑（规格文档仍在编辑器里写，面板只读与跳转）。
- 不为前端新建测试框架；前端测试不在本设计范围内。

---

## 三、现状测绘与错位分析

### 3.1 打包与进程错位（易解）

纯工程问题：搬前端源码与 API 源码、单进程托管、去掉 spawn 与多端口。无设计风险。

### 3.2 数据模型错位（真正的成本）

Dashboard API 是 **polaris-cli 时代**的模型，与 polaris-flow 现状已经不是同一套东西：

| 维度 | Dashboard API 现状 | polaris-flow 现状 |
| --- | --- | --- |
| 任务列表来源 | 扫 `openspec/changes/*/` + `.openspec.yaml` 的 `schema`/`summary`/`created`/`labels` | `.polaris/workflow.yaml` 的 5 个数组：`coding_tasks` / `requirement_tasks` / `testcase_tasks` / `prototype_tasks` / `debug_tasks`，字段 `task_id` / `phase` / `channel` / `worktree_path` / `started_at` |
| 单任务运行态 | 无（phase 由 `tasks.md` 勾选反推） | `.polaris/tasks/<id>/state.yaml`、`.polaris/testcases/<id>/state.yaml`（靠 `state.kind` 区分） |
| 当前阶段 | `getChangePhase()` 按文件存在性猜：tasks.md / tech-design.md / specs/ / proposal.md | `state.yaml.phase`，单一真相 |
| 阶段/步骤定义 | 内置 `config/tasks.yaml`：`prepare → proposal → specs → design → tasks → apply → archive → completion`，含 `create`/`brainstorm`/`design-domain-model` 等 step | 8 阶段 `specify → plan → design → tasks → build → verify → ship`（+ 旁路 `retro`）× 3 模式 `tweak` / `normal` / `full`；debug 族另有 `triage → diagnose → prescribe → patch → prove → closeout` |
| 任务类型 | 单一种类（隐含 coding） | 5 类 kind，其中 requirement / testcase / prototype / debug 对面板完全不可见 |
| 归档位置 | `openspec/changes/archive/<date>-<name>` | `.polaris/archive/<id>/`（运行态快照）+ `openspec` 侧产物 |
| 多项目 | `~/.polaris/projects.json` | 全局配置在 `~/.polaris/polaris.yaml`，无项目注册表 |
| 配置面板 | 扫 openspec 配置 | `.polaris/config.yaml` / `.polaris/workflow.yaml` |
| 诊断面板 | 检查 `.polaris` 是否存在 | `src/core/doctor.ts` 已有完整实现 |
| 前端「新增项目」校验 | `GET /api/check-openspec` 判存在 `openspec/` 子目录 | 应判是否已 `polaris init`（`.polaris/config.yaml` 存在） |

**结论：不能只搬 API。** 搬过去后面板会大面积空白或错位（phase 名对不上、5 类 kind 看不见、steps 全不对），且这种"看起来能跑"的假象比报错更危险。

**前端侧同源影响**（下列渲染假设需一并核对）：

- `src/utils/workflow.js`（282 行）—— phase/step 映射，需按新阶段表重写。
- `components/tasks/` 下的 `StepsProgress` / `StageActionNav` / `ReviewPhaseNav` / `WorkflowThumbnail` / `SpecContentPanel` / `TasksFilePanel` / `ValidationPanel` / `TasksKanbanPreview` —— 全部围绕「step + 四件套 + operations」模型。
- `composables/useTasksMock.js`（155 行）—— 无人 import，死代码，删除。
- `vite.config.js` 的 `/static` proxy —— 死配置，删除。
- 现有 `dist/` 构建于 2026-06-23，已过期，不搬。

API 消费面很收敛，只有 6 个模块，重写风险可控：
`useProjects.js` / `useDashboard.js` / `useTasks.js` / `TaskDetail.vue` / `CheckPage.vue` / `TasksPage.vue`。

### 3.3 工具作用范围（落点决策的依据）

前端源码落点必须先过本仓自检工具这一关。三条 glob 全部**以仓库根锚定**：

| 工具 | 范围 | 说明 |
| --- | --- | --- |
| `lint-staged`（pre-commit） | `src/**/*.{ts,tsx,js,mjs,cjs,json,md,yaml,yml}` → `prettier --write` | husky 钩子，编辑器无关 |
| `format:check` | `prettier --check src/` | CI 强制 |
| `lint` | `eslint src/` | CI 强制 |

而 `.prettierrc` 是 `{ singleQuote: true, trailingComma: 'all', printWidth: 100, semi: true }`，`polaris-web` **全仓没有任何 prettier / eslint / editorconfig 配置**，代码风格是刻意不写分号（`const BASE = '/api'`）。

**实测澄清（推翻了初判）**：在 `rootDir: ./src` + `exclude: ["node_modules"]` 下，**嵌套 `node_modules` 会被 tsc 自动跳过**（构造 `src/dashboard/web/node_modules/fakepkg/index.d.ts` 后 `tsc --listFiles` 计数为 0）。所以 tsc **不**构成阻碍。

**因此落点的决定性理由是 prettier 这条**：前端若放进 `src/` 下，pre-commit 与 `format:check` 会一次性给约 3000 行前端 JS 加回分号，产生几千行纯格式 diff、且与前端的风格约定直接冲突。靠往 `.prettierignore` 加一行可以压住，但那是给裂缝打补丁；例外清单还会继续增长。旁证：`eslint.config.js` 的 ignores 里**已经**有一条 `'src/dashboard/web/'`（配注释「Dashboard 前端在浏览器运行，跳过 Node lint 规则」）—— 这条裂缝当年出现过一次，当时只盖住了 eslint，没盖住 prettier。而那次放在那里的其实只是三个文件的 "Coming Soon" 占位页（`index.html` + `styles.css` + `app.js`），**不构成"真前端该放这儿"的先例**。

另有两条次要理由：`vite.config.ts` / `env.d.ts` 一旦出现会被 tsc 真的编译进 `dist/`，扰乱 `rootDir` / `outDir` 语义；以及前端产物会落进 `dist/dashboard/`，与后端编译产物 `server.js` / `router.js` 混层。

**结论：前端落在仓库根，`src/` 之外。**

### 3.4 写操作错位

旧写路径有两条**绕过锁**的直接文件写：

- `POST /api/changes/:name/tasks/:id` —— 直接改 `openspec/changes/<name>/tasks.md` 的复选框。
- `PUT /api/configs/:path` —— 直接写配置文件。

以及一条**依赖外部 `openspec` CLI** 的路径：

- `POST /api/changes/:name/steps/:stepId/operations` → `openspec status --change X --json` + `openspec instructions <artifact> --change X --json`，把 job 落到 `.polaris/continue-jobs/`，再靠环境变量 `POLARIS_CONTINUE_CMD` 拉起外部智能体；且 `executeStepOperation` 里除 `continue` 外的操作全部返回「尚未实现」。

polaris-flow 已有带锁的等价原语：`workflow-entry`、`task-state-entry`、`tasks-lint`、`ship-cleanup`、`hotfix-branch-create` 等。写操作必须重定到这些原语上，否则面板会成为模型的破坏者。

---

## 四、目标架构

### 4.1 运行形态：单进程单端口

```
polaris dashboard [path] [--port 3700] [--open|--no-open] [--api-only]

Node HTTP server  (127.0.0.1:<端口>)
├── /api/*        → src/dashboard/router.ts → src/dashboard/api/*
└── 其余所有路径    → <packageRoot>/dist/web/   （SPA fallback → index.html）
```

- **单端口**，删除 `--api-port`。默认 `3700`（沿用 polaris-cli dashboard 的既有默认值，亦曾是 vite proxy 的目标端口）。
- **hash router 天然适配静态托管**：无需服务端 rewrite 规则，仅 `/` 返回 `index.html`，其余路径兜底到 `index.html`。
- **开浏览器改为监听 `listening` 事件**后触发，消除固定延时竞态。
- `--api-only`：只起 API 不起静态托管，供前端 `npm run dev`（Vite HMR + proxy 到本端口）使用。**这是唯一保留的开发双进程形态，且由开发者显式选择。**
- 找不到 `dist/web` 时**报错并提示构建命令**，不静默降级为「只起 API」。

### 4.2 单仓目录契约

```
polaris-flow/
├── dashboard/                  # ★ 前端子工程（自包含：自己的 package.json / lockfile / vite）
│   ├── index.html
│   ├── vite.config.js          # base 调整为可静态托管；proxy 只留 /api（开发态），删 /static
│   ├── package.json            # 去 private；改 name 避免与 polaris-flow 混淆
│   ├── package-lock.json
│   ├── public/resources/logo.png
│   ├── src/                    # ← polaris-web/src 整棵（删 useTasksMock.js）
│   └── docs/                   # ← polaris-web/docs 中的前端设计文档（uxe 等）
├── assets/                     # 原有：发布到 npm 的 skills / hooks 资产
├── bin/                        # 原有：CLI 入口
├── dist/
│   ├── cli/ commands/ core/ dashboard/ utils/   # tsc 产物（含 Dashboard API）
│   └── web/                    # ★ vite 产物（vite outDir = ../dist/web）
├── docs/
├── scripts/
├── src/
│   └── dashboard/              # Dashboard API（TS）：只做传输层
│       ├── server.ts           #   单进程启动（替代现有"启动器"语义）
│       ├── static.ts           #   静态托管 + MIME + SPA fallback + 路径穿越防护
│       ├── router.ts           #   路由表（由 polaris-cli 迁入并重定义）
│       ├── api/*.ts            #   处理器；按 §5.1 重写数据源
│       └── scan/*.ts           #   workflow.yaml / state.yaml / openspec 扫描器
└── test/
```

**为什么要分层这条线**：`src/dashboard/` 是传输层（HTTP 编解码、路由、序列化），业务语义一律下沉 `src/core/`；`dashboard/` 是纯视图层。两半之间只有 `/api/*` 的 JSON 契约。

**产物为什么落 `dist/web/` 而不是 `dist/dashboard/web/`**：避免与前端的 API 编译产物 `dist/dashboard/server.js` / `router.js` 混在同一目录层。

### 4.3 构建链

`build.js` 在现有 `clean dist → tsc` 之后**追加一步 vite build**：

```js
// 1. clean dist（现有）
// 2. tsc（现有）
// 3. 新增：dashboard/ 有 node_modules 时构建前端，产物进 dist/web
const vitePath = path.join('dashboard', 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(vitePath)) throw new Error('未安装前端依赖：cd dashboard && npm install');
execFileSync(process.execPath, [vitePath, 'build'], { cwd: 'dashboard', stdio: 'inherit' });
```

要点：

- 用 `process.execPath + vite.js` 而不是 spawn `npm` / `npx`，与 build.js 现有的 `require.resolve('typescript/bin/tsc')` 写法一致，且规避 Windows 上 `npm.cmd` 的跨平台问题。
- 前端依赖缺失时**明确报错**，不生成一个缺前端的发布包。
- `package.json` 的 `files: ["dist", "bin", "assets", ...]` **无需改动**（`dist/web` 已被 `dist` 覆盖）。
- 根 `package.json` 加 `build:web` 脚本供单独构建前端。
- `.gitignore` 与 `.prettierignore` **无需改动**：两者的 `node_modules/`、`dist/` 都是无前缀模式，匹配任意层级。
- **CI 必须补一步前端依赖安装**：`.github/workflows/ci.yml` 目前只有 `pnpm install --frozen-lockfile`，随后直接 `pnpm run build` —— 而 `pnpm run build` 现在包含 vite 步骤。不装 `dashboard/node_modules` 就会在 **Build 步直接失败**。需补 `npm ci --prefix dashboard`；现有 `cache: pnpm` 覆盖不到前端依赖，可另配 npm 缓存。

### 4.4 迁入清单

**迁移方式（约束）**：**一律复制，绝不移动**。`polaris-web` 与 `polaris-cli` 在迁移期间保持原样可查，直到 M4 确认退役。复制由脚本 `scripts/migrate-dashboard.js` 完成，不手工 `cp` —— 目的是让"搬了什么"可复现、可审查、可重跑。

```
pnpm migrate:dashboard          # 预演：只列清单，不写盘
pnpm migrate:dashboard:write    # 实际复制（遇既有目标文件则中止）
node scripts/migrate-dashboard.js --write --force   # 允许覆盖既有目标文件
```

脚本性质：白名单驱动（只搬清单条目，不是黑名单排除）、源仓只读、只做机械复制不做内容改写、默认预演、源仓缺条目时**报错中止**而非静默跳过。实测预演结果：**98 个文件 / 1279 KB**（web 88 + cli 10）。

清单：

| 类别 | 条目 | 处理 |
| --- | --- | --- |
| 搬 | `index.html` / `vite.config.js` / `package.json` / `package-lock.json` / `public/` / `src/` | 进 `dashboard/`（`src/composables/useTasksMock.js` 排除，无引用的死代码） |
| 搬 | `docs/` 中的**前端**文档：`uxe/`、`superpowers/`、`Polaris Dashboard 全局布局框架定义.md`、`Polaris Dashboard 页面布局及交互规范.md`、`dashboard需求.md`、`api-elegant-comet.md`、`resources-configuration-guide.md`、`README.md` | 进 `dashboard/docs/` |
| 搬 | polaris-cli 的 Dashboard API **10 个文件**：`change-scanner.ts`、`markdown.ts`、`router.ts`、`server.ts`、`api/{changes,check,configs,filesystem,projects,workflow}.ts` | 进 `src/dashboard/`（**`server.ts` 会覆盖现有启动器**，属预期行为） |
| **不搬** | polaris-cli 的 `api/change-operations.ts`、`api/change-validate.ts`、`api/compose.ts` | 三者依赖外部 `openspec` CLI 或对应 §5.1/§5.2 已判定删除的路由。排除后**不再需要连带搬 `polaris-cli/src/utils/spawnAsync.ts`**，复制结果可直接编译 |
| 不搬 | `docs/agent-guide.md`、`development.md`、`quickstart.md`、`troubleshooting.md` | 描述的是 **polaris-cli 后端**，而该后端即将退役；搬进来即成为误导性文档。逐个人工确认后丢弃或改写到 `src/dashboard/` 侧文档 |
| 不搬 | `.polaris/continue-jobs/*.json`、`openspec/`（含 `schemas/polaris-flow-backend`）、`.trae/skills/*`、`.DS_Store` | polaris-web 仓自己的运行时残留，非产品代码 |
| 不搬 | `scripts/dev.sh`、`CLAUDE.md`、`node_modules/`、`dist/` | 前两者描述的是旧三仓形态，本就作废 |
| 元数据 | git 历史（6 commit） | 用 `git subtree add` / `filter-repo` 保留，或直接拷（历史价值低，二选一即可） |
| 待清理 | `eslint.config.js` 中过时的 `'src/dashboard/web/'` ignore | 删除 |
| 待修 | `scripts/prepublish-check.js` 的 `TEXT_EXTENSIONS` 缺 `.vue` | 补上，否则合并后密钥扫描在 `.vue` 上有盲点 |

---

## 五、API 重写契约

**前置产物**：`/api/*` 是前端与后端两半之间的唯一接口，必须在动手前冻结成独立文档 `docs/specs/2026-09-18-dashboard-api-contract.md`（端点、查询参数、响应字段、错误形状、只读/可写标记、各 kind 的 phase 枚举）。

单仓之后契约不再跨仓，但**仍然必要**：前端是纯 JS、后端是 TS，两侧没有共享类型，也没有编译期校验 —— 契约文档是唯一能防住「后端改了字段名、前端静默渲染空白」的手段。**M1 定形，M2 依它实现两侧。**

### 5.1 数据源映射（§3.2 表的落地形式）

| 端点 | 新数据源 | 处理 |
| --- | --- | --- |
| `GET /api/tasks` | `.polaris/workflow.yaml` 5 个任务数组 | 由 `GET /api/changes` 改名（不保留别名，不做兼容层） |
| `GET /api/tasks/:id` | `state.yaml` + `openspec/changes/<id>/` 文件清单 | 由 `GET /api/changes/:name` 改名；两处合并返回 |
| `GET /api/workflow` | 8 阶段 × 3 模式 × 各 kind 的流程定义 | 数据源从 `config/tasks.yaml` 改为 `src/core/` 内常量（单一真相，避免又一份可漂移的 YAML） |
| `GET /api/workflow/:kind/artifacts` | 各 kind 的产物路径表（对齐 `assets/zh/skills/README.md` 的产物布局） | 重定义 |
| `GET /api/check-openspec` | 判 `.polaris/config.yaml` 存在 | 改名 `GET /api/check-initialized` |
| `GET /api/check` | 复用 `src/core/doctor.ts` | 重接 |
| `GET /api/configs`、`GET /api/configs/:path` | `.polaris/config.yaml` / `.polaris/workflow.yaml` | 只读保留 |
| `PUT /api/configs/:path` | ❌ | **删除**（绕过锁的直写；配置编辑留给编辑器） |
| `POST /api/reveal` | 保留 | 收紧白名单为「已注册项目根 + 当前项目根」 |
| `GET /api/projects`、`POST /api/projects`、`DELETE /api/projects`、`PUT /api/projects/default`、`GET /api/dirs` | `~/.polaris/*` | 保留，落点见 §7 D4 |
| `POST /api/compose`、`GET /api/schemas` | — | **删除**，改由 §5.2 的原语操作承接 |
| `POST /api/tasks/:id/steps/:step/operations` | polaris-flow CLI 原语 | 重定义，见 §5.2 |

### 5.2 写操作：白名单化，全部经原语

M1/M2 阶段面板**只读**（§7 已决 4）。进入 M3 后仅开放下列操作，且每个都映射到既有 CLI 原语：

| 面板操作 | 落到的原语 | 备注 |
| --- | --- | --- |
| 勾选任务 | 无直接原语 | `tasks.md` 复选框的写入须新增一个薄原语（如 `task-state-entry` 的扩展），**不允许** API 直接改文件 |
| 校验计划 | `tasks-lint <file>` | 只读校验，安全 |
| 推进/回退阶段 | `workflow-entry update-active` + `task-state-entry enter-phase/complete-phase` | 必须带 `--skill` 与 `.locks/` |
| 交付清理 | `ship-cleanup` | |
| 「继续 / 调度智能体」 | ❌ 本设计不做 | 旧实现依赖 `POLARIS_CONTINUE_CMD` + 外部 openspec CLI；polaris-flow 的调度走宿主 hook，不应由面板代劳 |

---

## 六、实施路线

### M1 — 迁入 + 单进程骨架 + 契约冻结

交付物：

1. **跑迁移脚本**：`pnpm migrate:dashboard` 预演并人工核对清单 → `pnpm migrate:dashboard:write --force`（`--force` 是因为 `src/dashboard/server.ts` 是既有文件、必然冲突）。产出 §4.4 的 98 个文件。源两仓零改动。
2. **前端适配**：`vite.config.js` 删 `/static` proxy、`base` 改为可静态托管；`package.json` 去 `private` 并改名；`dashboard/docs/README.md` 清理死链；`cd dashboard && npm install` 装依赖。
3. **服务端**：`src/dashboard/server.ts`（上一步已被 polaris-cli 版本覆盖）+ 新增 `src/dashboard/static.ts` → 单进程、单端口、静态托管 `dist/web`、`listening` 后开浏览器。
4. **API 裁剪**：`src/dashboard/router.ts` 删掉指向未搬迁文件的引用与路由（`executeStepOperation`、`validateChange`、`createChange`/`listSchemas`、`PUT /api/configs/:path`）；`src/dashboard/api/*.ts` **数据源先原样保留**（仍读 `openspec/changes/`）。
5. **契约文档初稿**（§五 前置产物）。
6. **拆除旧机制**：`resolvePolarisWebRoot` / `POLARIS_WEB_PATH` / `startDashboard` 的 spawn 逻辑、`--api-port`。
7. **构建与 CI**：`build.js` 追加 vite 步骤；根 `package.json` 加 `build:web`；`.github/workflows/ci.yml` 在 `pnpm run build` 之前补 `npm ci --prefix dashboard`；清理 `eslint.config.js` 的过时 ignore；补 `prepublish-check.js` 的 `.vue`。

验收：`pnpm build && node bin/polaris.js dashboard` 单进程起在 3700，浏览器自动打开并看到界面；`--api-only` + `cd dashboard && npm run dev` 可做 HMR 开发；`pnpm format:check` 与 `pnpm lint` 仍只作用于 `src/`，前端代码零改动。

**构建完整性提醒**：第 1 步（纯复制）执行后本仓**处于不可构建状态** —— 搬来的 `router.ts` 引用了刻意未搬的三个文件，`server.ts` 还是 polaris-cli 的旧版。第 3、4 步完成即恢复。这是 M1 内部的一次性窗口，不应把第 1 步单独提交。

**中间态声明**：M1 结束时面板对「5 类 kind + 新阶段」仍不可见（因数据源还是旧的）。此状态**只用于验证骨架，不得发版**，README 不加 `dashboard` 使用说明。

### M2 — 数据源对齐（本设计的核心交付）

交付物：

1. `src/dashboard/scan/` —— workflow.yaml（5 数组）、state.yaml（按 kind 定位）、openspec/changes 文件树，三个扫描器。
2. §5.1 的端点重写；旧 `config/tasks.yaml` 的流程定义换为当前 8 阶段 × 3 模式 × 各 kind。
3. （`dashboard/`）`src/utils/workflow.js` 与 `components/tasks/*` 按新阶段表适配；`checkOpenspec` → `check-initialized`。
4. 契约文档定稿。

验收：5 类 kind 全部可见；phase 显示与 `state.yaml` 一致；`tweak`/`normal`/`full` 与 debug 族流程能正确渲染；配置面板显示 `.polaris/config.yaml`。

**单仓之后 M2 可落在同一个 PR 里**，前后端两侧可以一起改、一起验。

### M3 — 写操作与多项目

交付物：§5.2 的原语映射 + 必要的薄原语；多项目注册表落点确定；`/api/reveal` 白名单收紧。

验收：勾选任务后 `state.yaml` / `tasks.md` / `.locks/` 状态一致，无绕过锁的直写路径（需测试覆盖）。

### M4 — 收敛与退役

交付物：

1. `test/ts/dashboard.test.ts`（路由、静态托管、项目解析、锁行为）。
2. `README.md` + `README-zh.md` + `AGENTS.md` 更新 —— 同级仓库约定删掉，架构分层加入 `dashboard/` 与 `src/dashboard/`，并删 `polaris-cli` 相关描述。
3. `CHANGELOG.md` 条目与版本号（相对 master 只加一个版本）。
4. 确认 `polaris-cli` 的 dashboard 相关代码可下线；确认 `polaris-web` 仓可归档。
5. 契约文档随版本标记冻结。

验收：`npm pack` 后解包安装，`polaris dashboard` 在**另一个目录**开箱可用（不需任何兄弟仓库、不触发任何构建）。

---

## 七、决策台账

> 编号沿用早期两仓草案，以便文中既有交叉引用继续有效。原先的 D1（前端产物如何跨仓进入）随"全部合并"作废，现记为「已决 1」；D2、D3 已分别定案为「已决 3」「已决 4」。

### 已决 1 — 归属：前端与 API 全部并入 polaris-flow

`polaris-web` 与 `polaris-cli` 两仓退役。理由：

- **API 必须在本仓**：它是 polaris-flow 领域逻辑的 HTTP 出口，要复用 `src/core/` 的 `polaris-paths.ts` 路径解析、`.polaris/.locks/`、`tasks-lint`、`doctor`。放在外部仓库只能复制一套路径与锁逻辑 —— 这正是旧实现坏掉的根因（自己拼 `openspec/changes/<n>/` 路径、自己直改 `tasks.md`）。
- **前端并入的收益**：消掉了"产物如何跨仓进入发布包"整个问题域（不必把它发成 npm 包做 runtime dependency，也不必写 vendored 拷贝脚本），同时消掉「两仓发版顺序耦合」与「跨仓契约漂移」两条风险；M2 可落单个 PR。
- **接受的代价**：仓库体积与职责变宽；CI 需要构建两套；前端 git 历史只有 6 commit，价值有限。

### 已决 2 — 前端落点：仓库根 `dashboard/`，产物 `dist/web/`

依据见 §3.3。备选 `dashboard-web/`（彻底避开与 `src/dashboard/` 的重名）同样可行，命名可再定，不影响其余设计。

### 已决 3（原 D2）— 集成节奏：M1 先搬 + M2 立即对齐，中间态不发版

先跑迁移脚本与骨架（最快看到界面），随即用真实数据驱动 M2 的数据源对齐。M1 到 M2 之间是"半成品"，靠"不发版"纪律约束（M1 末尾的中间态声明）。

代价已知：M1 结束时面板对 5 类 kind 与新阶段不可见。备选方案（先对齐数据源再搬前端）被否，原因是前端适配要盲写、无界面验证，返工概率更高。

### 已决 4（原 D3）— 首发形态：只读

M1/M2 阶段面板**只读**，含"在编辑器打开文件""在文件管理器定位"这类零风险动作；写操作推迟到 M3，且每个都必须映射到既有 CLI 原语（§5.2）。

理由：§3.4 表明旧写路径既绕过 `.locks/` 又依赖外部 `openspec` CLI，把写操作做对是独立一档工作量，不应阻塞 G1–G3 的验收。

### D4 多项目注册表落点（可后置）

沿用 `~/.polaris/projects.json`，还是并入 `~/.polaris/polaris.yaml`？按 AGENTS.md「移除过时路径、不加兼容层」，倾向并入 `polaris.yaml`；但会动到全局配置的既有读写路径，建议 M3 单独决策。

### D5 端口默认值（可后置）

推荐 `3700`（沿用旧 API 端口，单一默认值取代现在的 5173/3700 双默认）。

---

## 八、风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| M2 工作量被低估 | 前端 8 个组件的模型假设比 API 更顽固 | M2 先跑通「列表 + 详情 + 产物」三块，`StageActionNav`/`StepsProgress` 等按需适配 |
| **前端代码被本仓工具误伤** | pre-commit 重排几千行前端 JS，diff 淹没真实改动 | 落点在仓库根（§3.3）；M1 清理 `eslint.config.js` 的过时 ignore；CI 保持 `src/` 单范围 |
| **CI 会在 Build 步直接失败** | `pnpm run build` 现含 vite 步骤，但 CI 只做 `pnpm install`，`dashboard/node_modules` 不存在 | CI 在 Build 前加 `npm ci --prefix dashboard`；前端依赖的缓存另配（现有 `cache: pnpm` 覆盖不到） |
| 仓库体积与职责变宽、CI 双构建 | 只用 CLI/skills 的贡献者也要面对前端工具链 | 前端依赖树完全隔离（独立 `package.json` + lockfile，不引 pnpm workspace）；`build:web` 可单独跑 |
| 前端 git 历史丢失 | 追溯困难 | 用 `git subtree` / `filter-repo` 保留（仅 6 commit，成本极低） |
| 静态服务路径穿越 | 本地文件泄露 | `static.ts` 归一化路径并断言落在 `dist/web` 内；`/api/reveal` 白名单 |
| `prepublish-check` 扫不到 `.vue` | 密钥扫描盲点 | M1 补 `TEXT_EXTENSIONS` |
| 面板写坏模型 | 破坏 `.polaris` 一致性 | 首发只读（已决 4）；M3 全部经原语 + 测试覆盖锁行为 |
| Windows 兼容 | 路径分隔符 / MIME / 构建命令 | `path` API 统一处理；build.js 用 `process.execPath` 调 vite，不 spawn npm |

---

## 九、验收标准（合起来看）

1. `npm i -g` 后，在任意已 `polaris init` 的项目里执行 `polaris dashboard` → 单进程、单端口、浏览器自动打开工作台。
2. 工作台正确显示 5 类 kind 的任务、`state.yaml` 的 phase、各 kind 的产物与 `reviews/`。
3. 除 `--api-only` 外，运行期不产生任何 npm install / tsc / Vite 进程。
4. `polaris-cli` 与 `polaris-web` 两仓都不再是运行依赖，且已可归档。
5. 面板上不存在绕过 `.locks/` 的写路径。
6. `pnpm format:check` / `pnpm lint` 的范围与行为与改造前完全一致（前端源码零改动、零例外清单）。
7. `/api/*` 契约有独立文档，且前后端两侧实现与之一致（契约即验收依据）。
