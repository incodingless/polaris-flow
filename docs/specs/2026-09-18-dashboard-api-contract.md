# Dashboard API 契约（`/api/*`）

日期：2026-09-18
状态：**M1 定形** —— 通用约定与 M2 目标字段已冻结；M1 实际响应仍为旧数据源，逐条标注
上游设计：`docs/specs/2026-09-18-dashboard-integration-design.md` §五
M1 计划：`docs/plans/2026-09-18-dashboard-integration-m1.md`

## 为什么需要这份文档

前端是纯 JS（`dashboard/src/`），后端是 TS（`src/dashboard/`），两侧**没有共享类型**，也没有编译期校验。任何字段改名都不会被构建拦下，只会表现为界面静默渲染空白。契约因此是唯一的形式化保证 —— 两侧改动都必须先改这里。

## 一、通用约定（冻结）

| 项 | 约定 |
| --- | --- |
| 前缀 | 所有接口以 `/api/` 开头；`server.ts` 据此把请求分流给 `router.ts` |
| 方法 | `GET` / `POST` / `PUT` / `DELETE` |
| 请求体 | `POST` / `PUT` / `DELETE` 的 body 为 JSON 文本；由 `router.ts` 解析后以字符串传给处理器 |
| 响应 | `Content-Type: application/json`；成功 200 |
| 错误 | 统一形状 `{ "error": string }`。未匹配路由 → 404 `{"error":"API not found"}`；处理器抛错 → 500 `{"error":"<message>"}` |
| 服务绑定 | 仅 `127.0.0.1`，不做鉴权、不对外 |
| 写操作 | **M1/M2 全为只读**（见「四、已移除端点」）。任何新增写操作必须落到 polaris-flow 的 CLI 原语并经 `.polaris/.locks/` |

### 多项目：`?project=<绝对路径>`

所有端点都接受 `?project=` 覆盖默认项目根（默认根 = `polaris dashboard <path>` 的 `path`，缺省 `process.cwd()`）。

由 `resolveProjectRoot(reqUrl, defaultRoot)` 处理：**该路径必须 `existsSync` 才生效，否则静默回落到默认根**。因此调用方不能用它探测路径是否存在。

## 二、M1 实际路由（实现即此清单）

来源：`src/dashboard/router.ts`。数据源仍是 openspec 时代模型（读 `openspec/changes/`）。

| # | 方法与路径 | 查询参数 | 响应（顶层字段） | M2 去向 |
| --- | --- | --- | --- | --- |
| 1 | `GET /api/changes` | `filter=active\|all\|archived`（非这三个值一律按 `active`） | `{ tasks: ChangeSummary[], counts: { active: number, archived: number } }` | 改名 `GET /api/tasks`，数据源换 `.polaris/workflow.yaml` |
| 2 | `GET /api/changes/:name` | — | `ChangeDetail`；查不到 → `{ error }`（HTTP 仍 200） | 改名 `GET /api/tasks/:id` |
| 3 | `GET /api/configs` | — | `Array<{ path, name, mtime }>` | 数据源换 `.polaris/config.yaml` |
| 4 | `GET /api/configs/:path*` | 路径可含 `/` | `{ path, content, syntax: 'yaml'\|'markdown' }`；不存在 → `{ error }` | 保留 |
| 5 | `GET /api/projects` | — | `{ projects: ProjectItem[], defaultProjectId: string \| null }` | 保留（落点见设计文档 §7 D4） |
| 6 | `POST /api/projects` | body `{ name, path }` | `{ project: ProjectItem }`；失败 → `{ error }` | 保留 |
| 7 | `DELETE /api/projects` | `?id=`，或 body | `{ ok: true }`；失败 → `{ error }` | 保留 |
| 8 | `PUT /api/projects/default` | body `{ id }` | `{ ok: true }` / `{ error }` | 保留 |
| 9 | `GET /api/stats` | — | 聚合统计（`change-scanner.computeStats`） | 重定义 |
| 10 | `GET /api/dirs` | `path=<父目录>` | `{ dirs: DirEntry[] }`／`{ error }` | 保留 |
| 11 | `GET /api/check-openspec` | `path=<目录>` | `{ exists: boolean }` | **改名** `GET /api/check-initialized`，判据改为 `.polaris/config.yaml` 存在 |
| 12 | `GET /api/check` | — | 环境诊断结果 | 改接 `src/core/doctor.ts` |
| 13 | `POST /api/reveal` | body `{ path }` | `{ ok }` / `{ error }` | 保留；白名单收紧为「已注册项目根 + 当前项目根」 |
| 14 | `GET /api/workflow` | — | `{ workflows: WorkflowDef[], error? }` | 数据源从内置 `config/tasks.yaml` 换为代码内常量 |
| 15 | `GET /api/workflow/:id/phases` | — | `WorkflowPhase[]` | 重定义为当前 8 阶段 |
| 16 | `GET /api/workflow/:id/artifacts` | — | 按阶段分组的产物列表 | 重定义为各 kind 的产物路径表 |
| 17 | `GET /api/workflow/:id/steps/:stepId/operations` | — | `Operation[]` | 重定义 |

### 只读性

上表 17 条中，触碰磁盘的仅有：

- `POST /api/projects`、`DELETE /api/projects`、`PUT /api/projects/default` —— 写 `~/.polaris/projects.json`（全局注册表，**不是** `.polaris` 任务模型，不涉及 `.locks/`）。
- `POST /api/reveal` —— 调系统文件管理器，不改文件。

其余全部只读。

## 三、M2 目标形状（字段名现在冻结）

M1 之后，数据源切到 polaris-flow 的当前模型；**字段名与形状在此定死，M2 的两侧实现都得对齐这里**。

### 任务项（`GET /api/tasks` 的 `tasks[]`）

| 字段 | 类型 | 来源 |
| --- | --- | --- |
| `task_id` | `string` | `.polaris/workflow.yaml` 各任务数组项 |
| `kind` | `'coding' \| 'requirement' \| 'testcase' \| 'prototype' \| 'debug'` | 由所在数组决定（`coding_tasks` / `requirement_tasks` / `testcase_tasks` / `prototype_tasks` / `debug_tasks`） |
| `phase` | `string` | **`state.yaml` 的 `phase` 为单一真相**，不由文件存在性反推 |
| `channel` | `'bugfix' \| 'hotfix' \| undefined` | 仅 debug 族有 |
| `worktree_path` | `string` | 空串表示仍在主仓 |
| `started_at` | `string`（ISO 8601） | |

### 运行态与产物来源

| 用途 | 路径 |
| --- | --- |
| 运行态 | `.polaris/tasks/<task_id>/state.yaml`、`.polaris/testcases/<task_id>/state.yaml`（`state.kind` 区分） |
| 叙事与规格 | `openspec/changes/<task_id>/`（四件套 + `intention.md` + `change-brief.md` + `detailed-design.md` + `reviews/`） |
| 归档 | `.polaris/archive/<task_id>/` |

任务目录按 kind 分流：`testcase` → `.polaris/testcases/`，其余 → `.polaris/tasks/`。

## 四、已移除端点（M1 起不再提供）

| 端点 | 移除理由 |
| --- | --- |
| `POST /api/changes/:name/tasks/:id` | 直改 `openspec/changes/<name>/tasks.md`，绕过 `.polaris/.locks/`。推迟到 M3，且必须落到 CLI 原语 |
| `PUT /api/configs/:path` | 直写配置文件，绕过 `.locks/` |
| `POST /api/changes/:name/steps/:stepId/operations` | 依赖外部 `openspec` CLI（`openspec status/instructions --json`）+ 环境变量 `POLARIS_CONTINUE_CMD` 拉起外部智能体；除 `continue` 外全部未实现 |
| `POST /api/changes/:name/validate` | 同为外部 `openspec` CLI 调用 |
| `POST /api/compose`、`GET /api/schemas` | 对应 M3 的 CLI 原语，M1 不提供 |

### ⚠️ M1 中间态：前端仍调用其中两条

`dashboard/src/composables/useTasks.js` 尚未同步：

- 第 380 行 `executeChangeStepOperation` → `POST /api/changes/:name/steps/:stepId/operations`
- 第 399 行 `validateChange` → `POST /api/changes/:name/validate`

**后果**：任务详情页的「执行操作」与「结构校验」两个动作会收到 404。这是**已知且预期**的中间态（M2/M3 处理），不是缺陷。M1 验收时不要把它当回归。

## 五、phase 枚举（M2 冻结）

| kind | phase 序列 |
| --- | --- |
| coding | `specify` → `plan` → `design`（可选） → `tasks` → `build` → `verify` → `ship`；旁路 `retro` 不推进游标 |
| debug | `diagnose` → `patch` → `closeout`（**三阶段**；两通道装配相同，差别只在 `channel` 决定的加严分支；起始阶段 `diagnose`） |
| requirement | `discovery` → `draft` → `refine` → `ship` |
| testcase | `discovery` → `draft` → `refine` → `ship` |
| prototype | `blueprint` → `build` → `review` → `ship` |

coding 三模式（`tweak` / `normal` / `full`）不改变 phase 名，只决定装配哪些阶段技能。

### 枚举的真相来源（2026-09-18 订正）

本表的裁定依据是 **`assets/zh/skills/README.md` §阶段一览** 与各 kind 的 `state.yaml` 模板注释（两者互洽）。以下 in-repo 文本与本表**不一致，均属陈旧，不作为实现依据**：

| 陈旧处 | 它写的 | 为什么不算数 |
| --- | --- | --- |
| `assets/shared/templates/workflow-template.yaml:16` 注释 | coding 为 `specify \| plan \| design \| build \| verify \| delivery`（缺 `tasks`、用 `delivery`） | 与技能 README 和 state 模板都矛盾 |
| `assets/shared/templates/workflow-template.yaml:68` 注释 | debug 为 `triage \| diagnose \| prescribe \| patch \| prove \| closeout` | 六段时代遗留 |
| `docs/specs/2026-09-16-debug-workflow-design.md` | debug 六阶段 | 该文档自身在 debug README 里被声明为「成文于六段时代，阶段名以 README 为准」；2026-09-17 已三阶段合并 |
| `src/core/config/task-kind-layout.ts` 的 debug `initialPhase: 'triage'` 与 `initPatches['runtime.triage.*']` | 起始阶段 `triage` | 六段时代遗留，**属缺陷**：debug 实际起始阶段是 `diagnose`（`debug/diagnose/SKILL.md:133` 即 `--phase diagnose`） |

debug 三阶段合并的原始记录：`assets/zh/skills/debug/README.md:7`（「2026-09-17 三阶段合并」——`triage` + `diagnose` + `prescribe` 合并为单一 `diagnose`，`prove` 并入 `patch` 的 1.5 步）。

> debug 族的模板与注释对齐不在 Dashboard 范围内（那是 debug 技能族自己的迁移）；但 `task-kind-layout.ts` 的 `initialPhase` 属 M2 直接改动文件，须一并修正，否则新建的 debug 任务会写成 `phase: triage`，面板显示「未知阶段」。

## 六、契约变更流程

1. 先改本文件（含字段名、错误形状、只读性标记）。
2. 后端 `src/dashboard/api/*` 与前端 `dashboard/src/api/index.js` 分别对齐。
3. 前端 `dashboard/src/utils/workflow.js` 与 `components/tasks/*` 里依赖旧形状的渲染逻辑同步更新。

**不得**只改一侧而不改本文件 —— 那正是这份契约要防的情况。
