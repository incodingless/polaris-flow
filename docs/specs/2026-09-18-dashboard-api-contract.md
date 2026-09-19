# Dashboard API 契约（`/api/*`）

日期：2026-09-18（M2 定稿：2026-09-19；M3 定稿：2026-09-19）
状态：**M3 定稿** —— 端点与字段按实现冻结；两侧（`src/dashboard/` 与 `dashboard/src/`）实现与本文档一致
上游设计：`docs/specs/2026-09-18-dashboard-integration-design.md` §五
实施计划：`docs/plans/2026-09-18-dashboard-integration-m1.md`、`docs/plans/2026-09-18-dashboard-integration-m2.md`、`docs/plans/2026-09-19-dashboard-integration-m3.md`
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
| 写操作 | **M3 前只读；M3 起开放三个写端点**（18–20），且每个都必须落到 polaris-flow 的 CLI 原语并经 `.polaris/.locks/` —— `src/dashboard/` 自身不写任何项目内文件（详见 §五） |

### 多项目：`?project=<绝对路径>`

所有端点都接受 `?project=` 覆盖默认项目根（默认根 = `polaris dashboard <path>` 的 `path`，缺省 `process.cwd()`）。

由 `resolveProjectRoot(reqUrl, defaultRoot)` 处理：**该路径必须 `existsSync` 才生效，否则静默回落到默认根**。因此调用方不能用它探测路径是否存在。

### 多项目注册表：`~/.polaris/projects.json`（D4 已决）

注册表的语义（用户 2026-09-19 定）：

> 保存的是**所有被加入 dashboard 做可视化、且使用 polaris-flow 的项目**。

由此三条落地约束（**不得**并入 `~/.polaris/polaris.yaml` —— 否决了设计文档原倾向）：

1. **加入必须校验已 `polaris init`**（判据 `.polaris/config.yaml`，与 11 号端点同源）。只校验「目录存在」会让任意目录进注册表，之后每个面板都展现空列表。
2. **失效项照常返回并标 `stale` + `reason`，不自动删** —— 目录可能是临时移走的，自动清理会丢掉用户自己的选择。删除只能是用户的动作。
3. **`stale` 不落盘**，每次读时算：它是「当下这一刻成立与否」的事实，存下来就会变旧，而变旧的表现是「目录早就回来了、面板还标着失效」。

不做数据迁移：只拦新增，存量为可见性。

## 二、实际路由（实现即此清单）

来源：`src/dashboard/router.ts`。数据源已全部切换到 polaris-flow 的现行模型。

| # | 方法与路径 | 查询参数 | 响应 | 只读 |
| --- | --- | --- | --- | --- |
| 1 | `GET /api/tasks` | `status=active\|archived\|all`（非此三值按 `active`）、`kind=` | `{ tasks: TaskItem[], counts: { active, archived, by_kind } }` | ✅ |
| 2 | `GET /api/tasks/:id` | `kind=`（可选提示） | `TaskDetail`；查不到 → `{ error }`（HTTP 仍 200） | ✅ |
| 3 | `GET /api/configs` | — | `Array<{ path, name, mtime }>`：`.polaris/*.yaml` | ✅ |
| 4 | `GET /api/configs/:path*` | 路径可含 `/` | `{ path, content, syntax: 'yaml'\|'markdown' }`；不存在或越界 → `{ error }` | ✅ |
| 5 | `GET /api/projects` | — | `{ projects: ProjectView[], defaultProjectId: string \| null }`；`ProjectView = ProjectItem + { stale, reason }`（**每次读时算**，不落盘） | ✅ |
| 6 | `POST /api/projects` | body `{ name, path }` | `{ project: ProjectView }` / `{ error }`。**须已 `polaris init`**（判据 `.polaris/config.yaml`，见 §一） | ⚠️ 写 `~/.polaris/` 注册表 |
| 7 | `DELETE /api/projects` | `?id=` 或 body | `{ ok: true }` / `{ error }` | ⚠️ 同上 |
| 8 | `PUT /api/projects/default` | body `{ id }` | `{ ok: true }` / `{ error }` | ⚠️ 同上 |
| 9 | `GET /api/stats` | — | `TaskStats`（见 §三） | ✅ |
| 10 | `GET /api/dirs` | `path=<父目录>` | `{ dirs: DirEntry[] }` / `{ error }` | ✅ |
| 11 | `GET /api/check-initialized` | `path=<目录>` | `{ exists: boolean }`，判据 = `.polaris/config.yaml` 存在 | ✅ |
| 12 | `GET /api/check` | — | `{ checks: [{ name, status, description }], summary }`，`status ∈ ok\|warn\|error` | ✅ |
| 13 | `POST /api/reveal` | body `{ path }` | `{ ok }` / `{ error }`；白名单 = 已注册项目根 + 当前项目根。**fail-closed**：空白名单拒绝 | ✅ 调系统文件管理器 |
| 14 | `GET /api/workflow` | — | `{ kinds: [{ kind, label, groups, phases }] }` | ✅ |
| 15 | `GET /api/workflow/:kind/phases` | — | `{ kind, label, groups: [{ name, phases }] }` | ✅ |
| 16 | `GET /api/workflow/:kind/artifacts` | — | `{ kind, label, phases: [{ code, name, artifacts: [{ relPath, kind, checkboxes }] }] }` | ✅ |
| 17 | `GET /api/tasks/:id/plan-lint` | `kind=` | `{ pass: boolean \| null, violations: string[], file, reason }`。**`pass: null` = 没有可校验的计划文件**，不是失败 | ✅ |
| 18 | `POST /api/tasks/:id/checkbox` | body `{ index, checked, file?, kind? }` | 见 §5.3 | ⚠️ **写** |
| 19 | `POST /api/tasks/:id/phase` | body `{ to, kind? }` | 见 §5.4 | ⚠️ **写** |
| 20 | `POST /api/tasks/:id/cleanup` | body `{ dry_run: true }` \| `{ confirm: true }` | 见 §5.5 | ⚠️ **写（不可逆）** |

### 只读性

- **只读**：1–5、9–17。
- **写 `~/.polaris/` 注册表**（非任务模型、不涉及 `.locks/`）：6–8。
- **调系统文件管理器**（不改文件）：13。
- **写任务模型**（M3 新增，必须是原语 + `.locks/`，见 §五）：**18–20**。

`kind` 非法时 14–16 返回 `{ error: 未知的任务类型 "<x>" }`（HTTP 200）。

## 三、字段定义（M2 冻结）

### 3.1 `TaskItem`（`GET /api/tasks` 的 `tasks[]`）

| 字段 | 类型 | 来源 |
| --- | --- | --- |
| `task_id` | `string` | `.polaris/workflow.yaml` 各任务数组项 |
| `kind` | `'coding' \| 'requirement' \| 'testcase' \| 'prototype' \| 'debug' \| null` | 由所在数组决定；归档项读 `.polaris/archive/<id>/state.yaml` 的 `kind`，读不到为 `null`（**不猜**） |
| `kind_label` | `string` | 单一表（`src/core/config/task-kind-layout.ts` 的 `label`） |
| `phase` | `string` | **权威 = `.polaris/workflow.yaml` 游标项的 `phase`**（见 §六）；归档项为合成值 `archived` |
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
| `plan_file` | `string` | **可勾选的计划文件**（项目根相对 posix）。该 kind 未声明复选框产物、或文件尚未生成时为空串。前端据此按**路径精确比对**判断「当前展示的文件能否勾选」，不靠文件名猜 |

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
| `GET /api/workflow/:kind/steps/:stepId/operations` | 操作白名单属 M3。**M3 的结论是「不做通用操作通道」**：写操作各自有显式入口（勾选 / 推进 / 清理），没有「列出一串可执行操作」的需求，故本端点不再出现 |
| `POST /api/changes/:name/steps/:stepId/operations` | 依赖外部 `openspec` CLI（`openspec status/instructions --json`）+ 环境变量 `POLARIS_CONTINUE_CMD`；除 `continue` 外全部未实现。**「继续 / 调度智能体」本设计明确不做**（设计 §5.2）：调度走宿主 hook，不该由面板代劳 |
| `POST /api/changes/:name/validate` | 同为外部 `openspec` CLI 调用。**M3 以 `GET /api/tasks/:id/plan-lint` 重建**：改调本仓的 `tasks-lint`（纯只读、不依赖外部 CLI） |
| `POST /api/changes/:name/tasks/:id` | 直改 `openspec/changes/<name>/tasks.md`，绕过 `.polaris/.locks/`。**M3 以 `POST /api/tasks/:id/checkbox` 重建**：经 `task-state-entry set-checkbox` 原语持锁，并在同锁内同步 `state.yaml` 计数 |
| `PUT /api/configs/:path` | 直写配置文件，绕过 `.locks/`。M3 未恢复（配置写入不在 §5.2 的四项写面内） |
| `POST /api/compose`、`GET /api/schemas` | 对应 M3 的 CLI 原语；M3 未实现（不在写面内） |

> M1 曾记录「任务详情页的『执行操作』与『结构校验』两个按钮会 404」这一中间态。**M2 已消除**：前端删除了 `executeChangeStepOperation` / `validateChange` 与 operations 拉取，操作按钮不再渲染。

## 五、写操作（M3 新增，冻结）

### 5.1 唯一不变量：**API 层不写任何文件**

`src/dashboard/**` 里**不得**出现 `writeFile` / `writeFileSync` / `rm` / `rename` / `mkdir` 作用于项目内文件。每个写操作只能转调 `src/core/hooks/*` 的原语函数，由原语持 `.polaris/.locks/` 下的锁。

唯一的例外是 `api/projects.ts` 写 `~/.polaris/projects.json` —— 那是**全局注册表，不是项目模型**，也不在 `.polaris/` 内，与任务数据无关。这个例外由本行显式登记；除它之外出现任何写文件调用即为违约（机械检查见 §八）。

验收命令（预期：只命中 `projects.ts` 的三行）：

```bash
grep -rnE "writeFile|writeFileSync|\brm\(|rmSync|rename\(|mkdir\(|mkdirSync|unlink" src/dashboard/
```

### 5.2 三个写端点

| # | 方法与路径 | body | 映射到的原语 | 锁 | 二次确认 | 只读 |
| --- | --- | --- | --- | --- | --- | --- |
| 17 | `POST /api/tasks/:id/checkbox` | `{ index: number, checked: boolean, file?, kind? }` | `task-state-entry set-checkbox` | `task-state-<id>.lock` | 否（幂等、可逆） | ⚠️ 写 |
| 18 | `POST /api/tasks/:id/phase` | `{ to: string, kind? }` | `workflow-entry update-active`（`setPhase`） | `workflow.lock` | 是 | ⚠️ 写 |
| 19 | `POST /api/tasks/:id/cleanup` | `{ dry_run: true }` 或 `{ confirm: true }` | `ship-cleanup` | `workflow.lock` | **是，且必须先预演** | ⚠️ 写 |

### 5.3 `POST /api/tasks/:id/checkbox`

勾选计划文件的一行。

- **`index` 是「第几个复选框」（0-based，按出现顺序），不是行号**。行号会随标题/空行增删而漂移，序号才是用户在界面上看到的「第 N 个任务」。前端看板渲染的 `item.index` 与之同源。
- `file` 可省略。省略时后端按**产物表**（`checkboxes: true`）推导：coding 在 `openspec/changes/<id>/tasks.md`、debug 在 `.polaris/tasks/<id>/tasks.md`（`TaskItem.plan_file` 即该值）。前端不需要知道各 kind 的计划文件在哪。
- **同锁内同步 `state.yaml` 的 `runtime.build.{total_tasks,completed_tasks}`**（仅当该块已存在）。这是「勾选后 `tasks.md` / `state.yaml` / `.locks/` 三者一致」的实现方式：分两次调用会在中间留下不一致窗口。
- 幂等：已是目标值时 `changed: false`，不产生写入。
- 响应：`{ ok, task_id, file, ordinal, line, checked, changed, tasks_done, tasks_total, state_synced }`。
- 错误：`序号越界` / `计划文件尚未生成` / `<kind> 类型无复选框产物` / `已归档…不能改动`。

### 5.4 `POST /api/tasks/:id/phase`

推进阶段。**只写游标**（`workflow.yaml` 的 `<kind>_tasks[].phase`），不碰 `state.yaml.phase` —— 后者是只写不读的镜像（§六）。

拒绝面（`update-active` 不校验 phase 取值，**这层是唯一拦网**）：

| 情形 | 错误 |
| --- | --- |
| 目标不在该 kind 的阶段表 | `未知阶段「<x>」。<kind> 的合法阶段：…` |
| 目标是旁路阶段（如 coding 的 `retro`） | `「retro」是旁路阶段，不在 <kind> 的主序列中…` |
| 目标不严格晚于当前 | `只支持推进：当前「<a>」，目标「<b>」不比它更晚…` |
| 当前 phase 未登记（游标脏数据） | `当前阶段「<x>」未登记在 <kind> 的阶段表中…` |
| 任务已归档（`source != 'cursor'`） | `任务「<id>」已归档（来源 …），不能推进阶段` |

**只做推进，不做回退**（D19）：回退按约定要写 `state.yaml` 的 `regressions[]` 留痕，而 `--set` 是标量赋值、往数组 append 没有现成 op，读改写有竞态。回退登记为后续独立切片。

成功时**回读游标校对**后再返回；不一致即报错，不把「写了但没写对」当成功。

### 5.5 `POST /api/tasks/:id/cleanup`

交付清理（**不可逆**：移除游标条目 + `rm -rf` 任务档案目录）。

- **必须显式二选一**：`{dry_run:true}` 只返回清单（零改动），`{confirm:true}` 才真删。两者都不给 → 报错。「默认执行」的默认值在不可逆操作上等于没有确认。
- `dry_run` 响应：`{ ok, dry_run: true, task_id, kind, will_delete: string[], entry: { kind, phase } | null }`。`will_delete` 是**绝对路径**（这就是将被删除的东西，不做相对化以免歧义）。
- `confirm` 响应同上但 `dry_run: false`，且 `will_delete` 是**已删除**的清单。
- `kind` 由游标读出后**显式**传给原语 —— 旧实现把 `kind` 写死 `coding`，导致非 coding 任务「删条目」静默失败而档案照样被删（已修，见 CHANGELOG）。
- 原语侧还有一道**全量回读**兜底：删条目后若该 `task_id` 仍留在**任何** kind 的列表里，中止且**不删档案**。这条不依赖任何单一 kind 的校验正确，只依赖「游标还有引用 → 档案不能删」。

### 5.6 与自动衔接的关系（**已知依赖**）

面板推进阶段后，宿主的自动衔接会走 `polaris state next`，而 `src/core/hooks/state-next.ts` 的 prototype / debug 两张转移表**偏移一位**（见 `docs/specs/2026-09-19-phase-truth-unification-design.md` 的 D13）。**若要开启自动衔接，D13 必须先修**。当前面板不触发 `state next`。

`kind` 非法时 14–16 返回 `{ error: 未知的任务类型 "<x>" }`（HTTP 200）。

## 六、phase 的权威字段与枚举

### 6.1 权威是 `workflow.yaml` 的游标，不是 `state.yaml.phase`

| 字段 | 写入方 | 读取方 | 判定 |
| --- | --- | --- | --- |
| `.polaris/workflow.yaml` → `<kind>_tasks[].phase` | `workflow-entry update-active --set phase=X` | `polaris state next`（CLI）与本契约 | ✅ **权威**：游标 = 接下来要执行的阶段 |
| `.polaris/<seg>/<id>/state.yaml` → `phase` | initPatches / `task-state-entry` | **无**（本面板不读） | ⚠️ 非权威镜像，默认 `idle` |

依据：`docs/specs/2026-09-19-phase-truth-unification-design.md` §1.1。**任何读 phase 的实现都读游标。**

### 6.2 枚举（与 `src/core/config/task-kind-layout.ts` 一致）

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

## 七、契约变更流程

1. 先改本文件（含字段名、错误形状、只读性标记）。
2. 后端 `src/dashboard/api/*` 与前端 `dashboard/src/api/index.js` 分别对齐。
3. 前端 `dashboard/src/utils/changeMapper.js`（**唯一适配层**）与 `utils/workflow.js` 同步更新。

**不得**只改一侧而不改本文件 —— 那正是这份契约要防的情况。

## 八、契约的守卫（哪些测试在盯这份文档）

| 测试 | 守的是什么 |
| --- | --- |
| `test/ts/task-kind-phases.test.ts` | §六 的阶段枚举逐条一致；与 `src/core/hooks/state-next.ts` 的 phase 键互不漂移；未知值不崩 |
| `test/ts/dashboard-scan.test.ts` | §三 的 `phase` 取自游标（反例：`state.yaml.phase` 与游标不一致时返回游标值）；归档双来源；`title` 三级兜底 |
| `test/ts/dashboard-static.test.ts` | 静态托管、MIME、路径穿越防护 |
| `test/ts/dashboard-filesystem.test.ts` | §二 的 13 号端点**fail-closed**：空白名单拒绝、纯空白名单拒绝、前缀相同但非子目录拒绝、白名单外拒绝 |
| `test/ts/dashboard-planlint.test.ts` | §二 的 17 号端点：`pass: null` 与「校验未通过」分开；计划文件按产物表定位（coding 与 debug 各自命中）；只读 |
| `test/ts/dashboard-write.test.ts` | §5.4 的拒绝面（未知 / 旁路 / 不更晚 / 未登记 / 已归档）、§5.3 的序号语义与同锁计数同步、§5.5 的「必须先预演」；不留锁文件；并发不损坏 YAML |
| `test/ts/dashboard-projects.test.ts` | §二 的 6 号端点：加入须已 init；失效项可见、不自动删、`stale` 每次读时算 |
| `test/ts/task-state-checkbox.test.ts` | §5.3 的底层原语：`index` 是复选框序号而非行号、逐字节保真、幂等、越界不改盘、无 `runtime.build` 时不新建 `state.yaml` |
| `test/ts/delivery-cleanup.test.ts` | §5.5 的底层原语：传错 kind **必须中止且不删档案**（回归测试）；无论哪一侧的校验失效，全量回读都兜住 |

字段名本身**没有编译期守卫**（纯 JS 前端 + TS 后端）。改字段名时，本文件与 `changeMapper.js` 必须同步改 —— 这是 M2 把适配收敛在映射层的原因：**需要同步改的地方越少，漂移面越小。**
