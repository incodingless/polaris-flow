# Dashboard API 契约（`/api/*`）

日期：2026-09-18（M2 定稿：2026-09-19）
状态：**M2 定稿** —— 端点与字段按实现冻结；两侧（`src/dashboard/` 与 `dashboard/src/`）实现与本文档一致
上游设计：`docs/specs/2026-09-18-dashboard-integration-design.md` §五
实施计划：`docs/plans/2026-09-18-dashboard-integration-m1.md`、`docs/plans/2026-09-18-dashboard-integration-m2.md`
相关设计：`docs/specs/2026-09-19-phase-truth-unification-design.md`（phase 权威字段的裁定）

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
| 写操作 | **只读**（见「四、已移除端点」）。任何新增写操作必须落到 polaris-flow 的 CLI 原语并经 `.polaris/.locks/` |

### 多项目：`?project=<绝对路径>`

所有端点都接受 `?project=` 覆盖默认项目根（默认根 = `polaris dashboard <path>` 的 `path`，缺省 `process.cwd()`）。

由 `resolveProjectRoot(reqUrl, defaultRoot)` 处理：**该路径必须 `existsSync` 才生效，否则静默回落到默认根**。因此调用方不能用它探测路径是否存在。

## 二、实际路由（实现即此清单）

来源：`src/dashboard/router.ts`。数据源已全部切换到 polaris-flow 的现行模型。

| # | 方法与路径 | 查询参数 | 响应 | 只读 |
| --- | --- | --- | --- | --- |
| 1 | `GET /api/tasks` | `status=active\|archived\|all`（非此三值按 `active`）、`kind=` | `{ tasks: TaskItem[], counts: { active, archived, by_kind } }` | ✅ |
| 2 | `GET /api/tasks/:id` | `kind=`（可选提示） | `TaskDetail`；查不到 → `{ error }`（HTTP 仍 200） | ✅ |
| 3 | `GET /api/configs` | — | `Array<{ path, name, mtime }>`：`.polaris/*.yaml` | ✅ |
| 4 | `GET /api/configs/:path*` | 路径可含 `/` | `{ path, content, syntax: 'yaml'\|'markdown' }`；不存在或越界 → `{ error }` | ✅ |
| 5 | `GET /api/projects` | — | `{ projects: ProjectItem[], defaultProjectId: string \| null }` | ✅ |
| 6 | `POST /api/projects` | body `{ name, path }` | `{ project: ProjectItem }` / `{ error }` | ⚠️ 写 `~/.polaris/` 注册表 |
| 7 | `DELETE /api/projects` | `?id=` 或 body | `{ ok: true }` / `{ error }` | ⚠️ 同上 |
| 8 | `PUT /api/projects/default` | body `{ id }` | `{ ok: true }` / `{ error }` | ⚠️ 同上 |
| 9 | `GET /api/stats` | — | `TaskStats`（见 §三） | ✅ |
| 10 | `GET /api/dirs` | `path=<父目录>` | `{ dirs: DirEntry[] }` / `{ error }` | ✅ |
| 11 | `GET /api/check-initialized` | `path=<目录>` | `{ exists: boolean }`，判据 = `.polaris/config.yaml` 存在 | ✅ |
| 12 | `GET /api/check` | — | `{ checks: [{ name, status, description }], summary }`，`status ∈ ok\|warn\|error` | ✅ |
| 13 | `POST /api/reveal` | body `{ path }` | `{ ok }` / `{ error }`；白名单 = 已注册项目根 + 当前项目根 | ✅ 调系统文件管理器 |
| 14 | `GET /api/workflow` | — | `{ kinds: [{ kind, label, groups, phases }] }` | ✅ |
| 15 | `GET /api/workflow/:kind/phases` | — | `{ kind, label, groups: [{ name, phases }] }` | ✅ |
| 16 | `GET /api/workflow/:kind/artifacts` | — | `{ kind, label, phases: [{ code, name, artifacts: [{ relPath, kind, checkboxes }] }] }` | ✅ |

`kind` 非法时 14–16 返回 `{ error: 未知的任务类型 "<x>" }`（HTTP 200）。

### 只读性

除 6–8（写 `~/.polaris/projects.json` 注册表，**不是**任务模型，不涉及 `.locks/`）与 13（调系统文件管理器、不改文件）外，其余全部只读。

## 三、字段定义（M2 冻结）

### 3.1 `TaskItem`（`GET /api/tasks` 的 `tasks[]`）

| 字段 | 类型 | 来源 |
| --- | --- | --- |
| `task_id` | `string` | `.polaris/workflow.yaml` 各任务数组项 |
| `kind` | `'coding' \| 'requirement' \| 'testcase' \| 'prototype' \| 'debug' \| null` | 由所在数组决定；归档项读 `.polaris/archive/<id>/state.yaml` 的 `kind`，读不到为 `null`（**不猜**） |
| `kind_label` | `string` | 单一表（`src/core/config/task-kind-layout.ts` 的 `label`） |
| `phase` | `string` | **权威 = `.polaris/workflow.yaml` 游标项的 `phase`**（见 §五）；归档项为合成值 `archived` |
| `phase_known` | `boolean` | `phase` 是否登记在该 kind 的阶段表里；`false` 时界面显示原值并标注 |
| `phase_group` | `string \| null` | 所属 UI 分组；未登记为 `null` |
| `phase_index` / `phase_total` | `number` | 主序列序位 / 总阶段数；未登记或旁路为 `-1` |
| `phase_groups` | `PhaseGroup[]` | 步骤条数据（见 3.2） |
| `channel` | `string` | debug 族：`bugfix` \| `hotfix`；其余为空串 |
| `mode` | `string` | `state.yaml` 的 `workflow.mode` **原文**（历史值域含 `sdd`，展示层负责归一） |
| `title` | `string` | state 名字字段（`req_name`/`req_name_cn`/`name`）→ 产物表首个存在文档的一级标题 → `task_id` |
| `worktree_path` | `string` | 游标项优先；回落到 `state.yaml` 的 `worktree.path` |
| `started_at` / `updated_at` / `archived_at` | `string` | 游标 `started_at` / `state.yaml` mtime / 归档目录 mtime 或 troubleshoot 索引日期 |
| `source` | `'cursor' \| 'archive' \| 'troubleshooting'` | 条目来源（前两者见 3.4） |
| `state_missing` | `boolean` | `state.yaml` 缺失（运行态未初始化） |
| `task_path` | `string` | 任务目录（项目根相对 posix） |
| `tasks_done` / `tasks_total` | `number \| null` | `tasks.md` 复选框进度；该 kind 未声明复选框产物时为 `null`（UI 显示「—」） |

### 3.2 `PhaseGroup` / `PhaseNode`

```ts
type PhaseNode  = { code: string; name: string; optional: boolean;
                    status: 'done' | 'active' | 'pending' | 'skipped' }
type PhaseGroup = { name: string; status: 'completed' | 'active' | 'pending';
                    phases: PhaseNode[] }
```

规则：归档任务全部 `done`；当前 phase 之前为 `done`（若 `state.yaml` 记 `skipped` 则为 `skipped`）、自身 `active`、其后 `pending`；**phase 未登记（含 `idle`）或为旁路时全部 `pending`，不猜归属**。

### 3.3 `TaskDetail` = `TaskItem` + 

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `files` | `TaskFile[]` | `.polaris/<segment>/<id>/` ＋ `openspec/changes/<id>/` 的 `.md`/`.yaml`；`path` 为项目根相对 posix，与产物表 `relPath` 同形 |
| `artifacts` | `Array<{ phase, relPath, kind: 'file'\|'dir', exists }>` | 该 kind 的产物表 + 存在性；`<id>` 已替换为真实 id |

### 3.4 归档的两个来源（**落点不同，别只扫一个**）

| 来源 | 路径 | 覆盖 kind |
| --- | --- | --- |
| `source: 'archive'` | `.polaris/archive/<id>/`（`harness-sync` 拷入 `state.yaml`；原型可能落 `.polaris/archive/prototype/<id>/`，故多探一层） | coding / requirement / testcase / prototype |
| `source: 'troubleshooting'` | `docs/troubleshooting/<id>/`（`INDEX.md` 只取前两列作日期） | **debug**（该族不用 `.polaris/archive/`，依据 `assets/zh/skills/debug/closeout/references/artifacts.md`） |

### 3.5 `TaskStats`（`GET /api/stats`）

`{ total, active, archived, by_kind: Record<kind, number>, by_phase: Record<phase, number>, tasks_done, tasks_total }`

`tasks_done` / `tasks_total` 只累计有 `tasks.md` 复选框产物的任务。旧的 `totalChanges` / `pendingTasks` 语义已作废。

## 四、已移除端点（不再提供，`router.ts` 内亦有清单）

| 端点 | 移除理由 |
| --- | --- |
| `/api/changes`、`/api/changes/:name` | 改名 `/api/tasks`（**不保留别名、不做兼容层**） |
| `/api/check-openspec` | 改名 `/api/check-initialized`，判据由「存在 `openspec/` 子目录」改为「`.polaris/config.yaml` 存在」 |
| `GET /api/workflow/:kind/steps/:stepId/operations` | 操作白名单属 M3，只读期无操作可列（设计 §5.2） |
| `POST /api/changes/:name/steps/:stepId/operations` | 依赖外部 `openspec` CLI（`openspec status/instructions --json`）+ 环境变量 `POLARIS_CONTINUE_CMD`；除 `continue` 外全部未实现 |
| `POST /api/changes/:name/validate` | 同为外部 `openspec` CLI 调用 |
| `POST /api/changes/:name/tasks/:id` | 直改 `openspec/changes/<name>/tasks.md`，绕过 `.polaris/.locks/`。推迟到 M3，且必须落到 CLI 原语 |
| `PUT /api/configs/:path` | 直写配置文件，绕过 `.locks/` |
| `POST /api/compose`、`GET /api/schemas` | 对应 M3 的 CLI 原语 |

> M1 曾记录「任务详情页的『执行操作』与『结构校验』两个按钮会 404」这一中间态。**M2 已消除**：前端删除了 `executeChangeStepOperation` / `validateChange` 与 operations 拉取，操作按钮不再渲染。

## 五、phase 的权威字段与枚举

### 5.1 权威是 `workflow.yaml` 的游标，不是 `state.yaml.phase`

| 字段 | 写入方 | 读取方 | 判定 |
| --- | --- | --- | --- |
| `.polaris/workflow.yaml` → `<kind>_tasks[].phase` | `workflow-entry update-active --set phase=X` | `polaris state next`（CLI）与本契约 | ✅ **权威**：游标 = 接下来要执行的阶段 |
| `.polaris/<seg>/<id>/state.yaml` → `phase` | initPatches / `task-state-entry` | **无**（本面板不读） | ⚠️ 非权威镜像，默认 `idle` |

依据：`docs/specs/2026-09-19-phase-truth-unification-design.md` §1.1。**任何读 phase 的实现都读游标。**

### 5.2 枚举（与 `src/core/config/task-kind-layout.ts` 一致）

| kind | phase 序列 |
| --- | --- |
| coding | `specify` → `plan` → `design`（可选） → `tasks` → `build` → `verify` → `ship`；旁路 `retro` 不推进游标 |
| debug | `diagnose` → `patch` → `closeout`（**三阶段**，两通道装配相同） |
| requirement | `discovery` → `draft` → `refine` → `ship` |
| testcase | `discovery` → `draft` → `refine` → `ship` |
| prototype | `blueprint` → `build` → `review` → `ship` |

coding 三模式（`tweak` / `normal` / `full`）不改变 phase 名，只决定装配哪些阶段技能。

### 枚举的真相来源

裁定依据是 **`assets/zh/skills/README.md` §阶段一览** 与各 kind 的 `state.yaml` 模板注释（两者互洽）。以下 in-repo 文本与本表**不一致，均属陈旧，不作为实现依据**：

| 陈旧处 | 它写的 | 为什么不算数 |
| --- | --- | --- |
| `assets/shared/templates/workflow-template.yaml:16` 注释 | coding 为 `specify \| plan \| design \| build \| verify \| delivery`（缺 `tasks`、用 `delivery`） | 与技能 README 和 state 模板都矛盾 |
| `assets/shared/templates/workflow-template.yaml:68` 注释 | debug 为 `triage \| diagnose \| prescribe \| patch \| prove \| closeout` | 六段时代遗留 |
| `docs/specs/2026-09-16-debug-workflow-design.md` | debug 六阶段 | 该文档自身在 debug README 里被声明为「成文于六段时代，阶段名以 README 为准」；2026-09-17 已三阶段合并 |
| `src/core/config/task-kind-layout.ts` 的 debug `initialPhase: 'triage'` | 起始阶段 `triage` | **已于 M2 修正为 `diagnose`**（debug 实际起始于 `diagnose`，见 `debug/diagnose/SKILL.md:133`） |

debug 三阶段合并的原始记录：`assets/zh/skills/debug/README.md:7`。

## 六、契约变更流程

1. 先改本文件（含字段名、错误形状、只读性标记）。
2. 后端 `src/dashboard/api/*` 与前端 `dashboard/src/api/index.js` 分别对齐。
3. 前端 `dashboard/src/utils/changeMapper.js`（**唯一适配层**）与 `utils/workflow.js` 同步更新。

**不得**只改一侧而不改本文件 —— 那正是这份契约要防的情况。

## 七、契约的守卫（哪些测试在盯这份文档）

| 测试 | 守的是什么 |
| --- | --- |
| `test/ts/task-kind-phases.test.ts` | §五 的阶段枚举逐条一致；与 `src/core/hooks/state-next.ts` 的 phase 键互不漂移；未知值不崩 |
| `test/ts/dashboard-scan.test.ts` | §三 的 `phase` 取自游标（反例：`state.yaml.phase` 与游标不一致时返回游标值）；归档双来源；`title` 三级兜底 |
| `test/ts/dashboard-static.test.ts` | 静态托管、MIME、路径穿越防护 |

字段名本身**没有编译期守卫**（纯 JS 前端 + TS 后端）。改字段名时，本文件与 `changeMapper.js` 必须同步改 —— 这是 M2 把适配收敛在映射层的原因：**需要同步改的地方越少，漂移面越小。**
