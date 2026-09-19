# Dashboard 写操作与多项目 M3 实施计划

日期：2026-09-19
状态：**待放行** —— 决策 D4、D20-reveal 已由用户拍板（见 §二），其余待定
上游设计：`docs/specs/2026-09-18-dashboard-integration-design.md` §5.2 / §六 M3 / §7 D4
前置：M2 已完成（`docs/plans/2026-09-18-dashboard-integration-m2.md` §十一 执行记录）

**Goal:** 把面板从「只读」打开为「可写，但每个写操作都落到既有 CLI 原语且经 `.polaris/.locks/`」，并明确多项目注册表的语义与校验。

**Architecture:** 写操作**在进程内调用 `src/core/hooks/*` 的原语函数**（不 spawn CLI —— 那会重新引入 M1 刚拆掉的「外部 CLI 依赖」，且锁在进程内更简单）。`src/dashboard/api/*` 仍是传输层：解析请求、校验参数、调原语、回读校验、序列化结果。**API 自己不写任何文件。**

**Tech Stack:** TypeScript（Node 20+，ESM，NodeNext）、Commander（原语 CLI 面）、Vitest、Vue 3（面板侧确认交互）。

**Spec:** 设计文档 §5.2（写操作白名单）+ §7 D4（注册表落点，已由用户拍板）

---

## 一、开工前已查实的事实

| # | 查实 | 对 M3 的含义 |
| --- | --- | --- |
| 1 | **`workflow-entry update-active`**：`--skill` 与 `--kind` 必填；按 `task_id === --where-task-id` 在 `--kind` 对应的数组里定位，改 `phase` / `worktree_path`（`workflow-entry.ts:141-162`） | 「推进阶段」= `update-active --kind <k> --where-task-id <id> --set phase=<p>`。**`--kind` 传错会报「未找到 entry（kind=…）」**，所以面板必须带 kind |
| 2 | **`--skill` 只作锁写者标识**（`acquireWorkflowLock(repoRoot, args.skill)`，`workflow-entry.ts:282`），**不落盘进任何数据** | 面板调用传 `--skill dashboard` 即可，不会污染任务数据；锁归属清晰 |
| 3 | **`update-active` 不校验 phase 取值**（`args.setPhase ?? cur.phase` 直接写） | 面板侧要先按 `isKnownPhase()` 校验（复用 M2 的单一表）；原语级白名单属「phase 归一 A 案」，不在 M3 |
| 4 | **`task-state-entry`** 已有 `get|get-json|set|enter-phase|complete-phase|set-identity|get-identity`，且已持 **task-state 锁**（`acquireExclusiveLock(getTaskStateLockPath(...))`，`task-state-entry.ts:397`） | 复选框写入的落点候选：扩展它即可**免费获得同一把锁**，与技能写 state 串行 |
| 5 | **`tasks-lint <file>`**：`runTasksLint(filePath) → { exitCode, pass, violations: string[] }`（`tasks-lint.ts:8-17`），纯只读 | 「校验计划」零风险，直接包成 GET 端点 |
| 6 | **`ship-cleanup <change_id> <origin_repo>`** 会 `rm -rf .polaris/tasks/<id>/` 与 `<id>.snapshot/`（`delivery-cleanup.ts:36-43`） | 它是**不可逆的**删除，面板侧必须二次确认并先给 dry-run 清单 |
| 7 | ⚠️ **`ship-cleanup` 硬编码 `kind: 'coding'`**（`delivery-cleanup.ts:25-29`）。**已实测复现**（`/tmp/m3-check`，一个 `debug_tasks` 里 `phase: patch` 的任务）：调 `polaris-flow ship-cleanup dbg-9 <root>` → **exit 0**、`.polaris/tasks/dbg-9/`（含 `state.yaml` 与 `diagnose-brief.md`）被删空、而 `workflow.yaml` 里该条目**仍在** | **既有缺陷，且是静默的数据丢失**：`delete-active` 在 `coding_tasks` 里找不到条目 → 过滤后列表没变 → `no_tid` 校验**假通过** → 返回 0 → 接着 `rm -rf` 任务目录。结果「面板上还在、档案已蒸发」。**M3 必须先修**（详见 §二 D20） |
| 8 | **`addProject` 只校验**：别名非空、路径非空、目录存在、路径未重复（`api/projects.ts`） | **没有校验「该项目是否使用 polaris-flow」**。用户已明确注册表语义（§二 D4），M3 需补该判据（`checkInitialized` 同款：`.polaris/config.yaml` 存在） |
| 9 | **`revealPath` 已有前缀包含校验**，但 `if (allowedRoots.length > 0)` 才校验 → **传空数组即放行任意路径**（fail-open） | 用户已拍板按建议收紧（§二 D20-reveal） |
| 10 | `runDeliveryCleanup` 内部**就是进程内调 `runWorkflowEntry`**，不是 spawn | 印证 §Architecture 的选型：进程内调原语是本仓既定做法，不是新机制 |
| 11 | M2 已把 6 个写/依赖外部 CLI 的端点清零，且前端两个死动作已下线 | M3 是在空地上按原语重建，**不是恢复旧实现**；契约 §四 的移除清单就是拒绝名单 |
| 12 | phase 权威是 `workflow.yaml` 游标；`state.yaml.phase` 是只写不读的镜像（`docs/specs/2026-09-19-phase-truth-unification-design.md` §1.1） | 「推进阶段」**只写游标**（见 §二 D19），不要把面板变成第二个镜像维护者 |

---

## 二、决策台账

### D4 — 多项目注册表落点 —— ✅ 已决（用户 2026-09-19）

**继续用 `~/.polaris/projects.json`**，并明确其语义：

> 注册表里保存的是**所有被加入 dashboard 做可视化、且使用 polaris-flow 的项目**。

由此推出三条落地要求：

1. **加入时校验**：`POST /api/projects` 必须验证目标目录**已 `polaris init`**（判据 = `.polaris/config.yaml` 存在，与 `GET /api/check-initialized` 同源）。不合规 → 报错并给出「先执行 `polaris init`」的提示。
2. **读取时标记失效**：已注册项可能后来被删目录或不再使用 polaris-flow。`GET /api/projects` 对这类项返回 `stale: true` 与原因，**不自动删除**（删除是用户的动作）。
3. **不并入 `~/.polaris/polaris.yaml`**：否决设计文档里的倾向（并入）—— 用户选保持现状，理由是注册表是 dashboard 的可视化清单，与全局安装配置是两件事。**设计文档 §7 D4 需同步订正为已决**。

### D17 — 写操作怎么调原语：进程内 vs spawn CLI

- **建议：进程内调用 `src/core/hooks/*`**。理由：① M1 的设计承诺就是「API 在本仓以便复用 `src/core/` 的路径/锁/校验」，spawn 会把刚拆掉的「外部 CLI 依赖」装回来，还要依赖 `dist/` 已构建与 `polaris-flow` 在 PATH（本仓测试已多次踩到 `CLI not found`）；② 锁是进程内的文件锁，进程内调用没有额外风险；③ 既有先例：`runDeliveryCleanup` 自己就是进程内调 `runWorkflowEntry`。
- 备选：spawn `node bin/polaris.js <op>`（与技能一致，但多一层进程与 PATH 依赖）。
- **「不允许 API 直接改文件」的落地口径**：API 层禁止 `writeFile`/`rm` 任何项目内文件；只能调原语函数。这条要写进 Global Constraints，并由验收的 grep 检查兜住。

### D18 — 复选框薄原语的落点

设计要求「新增一个薄原语（如 `task-state-entry` 的扩展），不允许 API 直接改文件」。

- **建议：扩展 `task-state-entry`，新增 op `set-checkbox`**。理由：它已持有 task-state 锁；勾选 `tasks.md` 与写该任务的 `state.yaml` 是**同一次语义操作**（见下），必须同锁；避免新造脚本 + 复制一套取锁逻辑。
  - 参数：`--repo-root --task-id --kind --file <项目根相对路径> --index <n> --checked <true|false>`
  - 行为：只替换目标行的复选框字符，**其余字节原样保留**（缩进、文字、行尾）；索引越界或文件不存在 → 报错不改盘；幂等（已是目标值则无操作）。
- **同一次锁内还要同步计数**（这条决定验收能不能过）：设计 §六 M3 的验收是「勾选任务后 `state.yaml` / `tasks.md` / `.locks/` 状态一致」。coding 的 `state.yaml` 有 `runtime.build.total_tasks` / `completed_tasks` —— 勾选后不同步，`state.yaml` 就与 `tasks.md` 不一致。建议：**若 state 中存在 `runtime.build` 块则同步这两个计数**；不存在（如 debug 族）则只改 `tasks.md`。
- 备选：新造 `tasks-check` 独立原语（职责更单一，但要复制取锁逻辑，且 `tasks.md` 与 `state.yaml` 的原子性更难保证）。

### D19 — 「推进阶段」是否包含**回退**，以及要不要留痕

设计 §5.2 写的是「推进/回退阶段」，但回退涉及留痕：

- 推进（`phase` 前移）是纯 `update-active`，无副作用。
- 回退按 debug 族的约定应写 `state.yaml` 的 `regressions[]`（from/to/reason/at，见 `debug/README.md`）。而 `task-state-entry --set` 是**标量路径赋值**，往数组里 append 没有现成 op。

三个选项：

| 选项 | 做法 | 代价 |
| --- | --- | --- |
| **A（建议）** | M3 **只做推进**；回退记为后续切片 | 最小风险；与「先能推再能退」的节奏一致。面板上回退按钮先不出现（不摆灰按钮） |
| B | 做回退，并新增数组 append op（`--append`） | 多一个原语能力；但回退的语义（哪些阶段可退、谁批准）需要单独设计 |
| C | 回退用读改写（`get-json` → 改数组 → `set`） | 有竞态（两次调用之间别的写者可能插入），**不推荐** |

- **建议选 A**，并把「回退 + `regressions[]` 留痕」登记为 M3 之后的独立切片。

### D20 — 「交付清理」的缺陷修复与确认交互

- **必须修** `ship-cleanup` 的 `kind: 'coding'` 硬编码（事实 #7）。修法：
  - `runDeliveryCleanup(changeId, originRepo, kind)` 接收 kind（CLI 侧加 `--kind`，缺省 `coding` 保持 CLI 兼容；但**面板必须显式传**）；
  - `delete-active` 失败（exitCode ≠ 0）或**回读校验发现条目仍在**时，**不得继续 `rm`** —— 这是本次缺陷的根因：校验「目标 kind 列表里没有该 id」在传错 kind 时是**假通过**。改为「先按 kind 删，再**在 `workflow.yaml` 全量回读确认该 id 已消失**，否则中止」。
  - testcase 的目录是 `.polaris/testcases/<id>/`（不是 `.polaris/tasks/`）—— 现在只 rm 了 tasks 路径，属漏删。
- **面板交互**：先 `POST /api/tasks/:id/cleanup` 带 `{ dry_run: true }` 返回「将删除的路径清单 + 将移除的游标条目」，用户确认后再带 `{ confirm: true }` 执行。
- 这是**既有 core 缺陷**，不是 M3 引入的；但它挡住了「交付清理」按钮，所以在本切片修。

### D21 — `reveal` 的收紧口径 —— ✅ 已决（用户：按建议来）

- `revealPath(target, allowedRoots)`：**`allowedRoots` 为空即拒绝**（fail-closed），并显式要求调用方传白名单。
- 白名单口径固定为「**当前项目根 + 已注册项目根**」（`router.ts` 已如此传，只需补去重与 fail-closed）。
- 补单测：空白名单拒绝、白名单外路径拒绝、白名单内路径放行（放行分支用 mock 避免真的调 `open`）。

---

## 三、Global Constraints

- **API 层禁止直接写文件**：`src/dashboard/**` 里不得出现 `writeFile` / `writeFileSync` / `rm` / `rename` / `mkdir` 作用于项目内文件；写操作只能经 `src/core/hooks/*` 的原语函数。**由验收的 grep 检查兜住。**
- **每个写操作必须持锁**：`workflow-entry` 走 `workflow.lock`；`task-state-entry` 走 `task-state-<id>.lock`。不得绕过。
- **写面收敛在 §5.2 的四项**：勾选任务、校验计划（只读）、推进阶段、交付清理。其余一律不开放；「继续 / 调度智能体」**不做**（设计 §5.2 明确）。
- **不恢复 M1/M2 删掉的写路径**：`POST /api/changes/:name/tasks/:id`、`PUT /api/configs/:path`、operations / validate / compose / schemas 全部保持下线。
- **面板不维护 `state.yaml.phase`**：推进阶段只写游标（事实 #12）。
- **契约先行**：新增写端点前先改契约（§五 新增「写操作」章节），两侧再对齐。
- 代码文件与函数注释用中文；TS 文件名 kebab-case；导出函数 camelCase。
- **CHANGELOG**：追加到现有 `0.1.1` 条目，不升版本号。
- **基线（勿误判）**：`vitest run` 基线 **6 failed | 35 passed（41 文件）**；`prettier --check src/` 14 个既有不合格；`eslint src/` 13 errors。以「零新增」为准。
- 提交前须过：`pnpm format:check && pnpm lint && pnpm build && pnpm test`。

---

## 四、File Structure

| 文件 | 职责 | M3 动作 |
| --- | --- | --- |
| `src/core/hooks/task-state-entry.ts` | state.yaml 读写原语 | **扩展**：新增 `set-checkbox` op（+ 计数同步）|
| `src/commands/hooks/task-state-entry.ts` | 上面的命令壳 | **加** op 分支与参数 |
| `src/cli/register-runtime-commands.ts` | 原语 CLI 注册 | **加** `--file` / `--index` / `--checked` 选项 |
| `src/core/hooks/delivery-cleanup.ts` | ship-cleanup | **修**：接收 kind；删条目后全量回读确认；testcase 路径 |
| `src/cli/register-runtime-commands.ts` | 同上 | **加** `ship-cleanup --kind`（缺省 coding 兼容） |
| `src/dashboard/api/filesystem.ts` | reveal | **改**：fail-closed + 单测 |
| `src/dashboard/api/tasks.ts` | 任务读写 API | **加** 三个写处理器（checkbox / phase / cleanup）+ lint 只读处理器 |
| `src/dashboard/api/projects.ts` | 注册表 | **改**：`addProject` 校验 polaris-flow；`listProjects` 标记 `stale` |
| `src/dashboard/router.ts` | 路由表 | **加** 4 条路由（含 cleanup 的 dry-run） |
| `dashboard/src/api/index.js` | 前端 API 层 | **加** 4 个函数 |
| `dashboard/src/composables/useTasks.js` | 任务页逻辑 | **加** 三个动作 + 确认流程 |
| `dashboard/src/components/tasks/TasksFilePanel.vue` | tasks.md 展示 | **加** 勾选交互（原为只读） |
| `dashboard/src/components/TaskDetail.vue` | 详情 | **加** 阶段推进与交付清理入口（带确认） |
| `test/ts/task-state-checkbox.test.ts` | 复选框原语单测 | **新建** |
| `test/ts/delivery-cleanup.test.ts` | 交付清理单测（含**传错 kind 必须中止**的反例） | **新建** |
| `test/ts/dashboard-write.test.ts` | 写端点的路由级测试（含锁行为） | **新建** |
| `docs/specs/2026-09-18-dashboard-api-contract.md` | 契约 | **加**「写操作」章节 |
| `docs/specs/2026-09-18-dashboard-integration-design.md` | 设计 | **订正** §7 D4 为已决（继续用 projects.json） |

---

## 五、Tasks

### Task 1: `reveal` 收紧（fail-closed）—— 最小、零风险，先做

- [ ] **Step 1: 改 `revealPath`**

`allowedRoots` 为空 → 返回 `{ error: '缺少允许的项目根白名单' }`（**不再放行**）。保留既有的 `..` 预过滤与前缀包含校验。

- [ ] **Step 2: `router.ts` 去重并显式传白名单**

白名单 = `[当前项目根, ...已注册项目根]`（去重后）。若解析不出任何根 → 拒绝。

- [ ] **Step 3: 单测**

```bash
pnpm vitest run test/ts/dashboard-static.test.ts   # 同目录下有 filesystem 相关断言则并入；否则新建
```
覆盖：空白名单拒绝、白名单外拒绝、`..` 拒绝、白名单内放行（放行分支 mock `execFile`）。

---

### Task 2: 复选框薄原语（TDD）

- [ ] **Step 1: 先写失败测试** `test/ts/task-state-checkbox.test.ts`

用 `mkdtemp` 造任务：`openspec/changes/<id>/tasks.md` 带缩进与不同状态的复选框 + `state.yaml` 带 `runtime.build.{total_tasks,completed_tasks}`。

断言：
1. `set-checkbox --index 1 --checked true` → 第 2 行变 `- [x]`，**其余字节逐字节不变**（含缩进、文字、行尾）
2. 幂等：重复执行结果一致，且不产生多余写入（比对 mtime 或内容哈希）
3. 索引越界 → 报错且**文件未改动**
4. 文件不存在 → 报错
5. `state.yaml` 有 `runtime.build` 时，两个计数同步正确；无该块（debug 族）时只改文件、不新增块
6. 并发：两个进程同时勾选不同行 → 都成功（靠 task-state 锁串行），最终内容两条都生效

- [ ] **Step 2: 实现 `set-checkbox` op**（D18）

纯函数 `applySetCheckbox(content, index, checked) → { content, changed }` 便于单测；原语负责取锁、读写、同步计数、回读校验。

- [ ] **Step 3: 接 CLI 面**

```bash
node bin/polaris.js task-state-entry set-checkbox --repo-root . --kind coding \
  --task-id <id> --file openspec/changes/<id>/tasks.md --index 0 --checked true
```

- [ ] **Step 4: 测试转绿 + `pnpm build`**

---

### Task 3: 修 `ship-cleanup`（D20，**缺陷修复，优先于面板接线**）

- [ ] **Step 1: 先写失败测试** `test/ts/delivery-cleanup.test.ts`

- 核心反例：对一个 **debug** 任务调 `runDeliveryCleanup(id, root)`（不传 kind）→ **必须失败且 `.polaris/tasks/<id>/` 仍存在**（今天是「成功并删掉目录」，正是要修的行为）
- 传对 kind → 游标条目消失 + 目录被删
- testcase → 删的是 `.polaris/testcases/<id>/`
- 游标条目不存在 → 失败且不删目录

- [ ] **Step 2: 实现**

1. 签名加 `kind`（缺省 `coding` 保持 CLI 兼容）
2. `delete-active` 之后**全量回读 `workflow.yaml`**，确认该 `task_id` 在**任何** kind 的列表里都不存在；否则中止并返回错误（这堵住「传错 kind 假通过」）
3. 删除路径按 kind 取（`getTaskKindDir` 而非硬编码 `getTaskDir`）
4. CLI 加 `--kind`

- [ ] **Step 3: 测试转绿**

---

### Task 4: 读操作先接线（`tasks-lint`）

- [ ] **Step 1: 端点** `GET /api/tasks/:id/plan-lint`

用产物表里 `checkboxes: true` 的产物定位 `tasks.md`（复用 M2 的 `getKindArtifacts`，不写死路径）；无该产物 → `{ pass: null, reason: '该任务类型无计划文件' }`。

- [ ] **Step 2: 前端**：详情页「校验计划」按钮 → 展示 `violations` 列表。只读，无确认。

> 为什么先做只读：它是唯一零风险的写面相邻项，先跑通「端点 → 原语 → 回显」这条链路，再上真写操作。

---

### Task 5: 推进阶段端点

- [ ] **Step 1: 端点** `POST /api/tasks/:id/phase`，body `{ to: string }`

```ts
// 参数校验（传输层）
if (!isKnownPhase(kind, to)) return { error: '未知阶段 ...  合法值：...' }   // 复用 M2 单一表
```
调 `runWorkflowEntry({ op: 'update-active', kind, skill: 'dashboard', repoRoot, whereTaskId: id, set: [`phase=${to}`] })`；失败 → 返回原语的消息（如「未找到 entry」）；成功 → **回读游标**并返回新的 `phase` / `phase_groups`。

按 D19：**只做推进**（`to` 必须严格晚于当前 `phaseIndexIn`）；回退不在本切片。

- [ ] **Step 2: 前端**：阶段推进入口 + 二次确认（显示「`build` → `verify`」）。

- [ ] **Step 3: 锁行为测试**：并发两次推进 → 串行成功、无写坏；持锁时另一写者等锁（`test/ts/dashboard-write.test.ts`）。

---

### Task 6: 交付清理端点（带 dry-run）

- [ ] **Step 1: 端点** `POST /api/tasks/:id/cleanup`

- `{ dry_run: true }` → 返回 `{ will_delete: string[], will_remove_entry: { kind, phase } }`，**不执行**
- `{ confirm: true }` → 调 `runDeliveryCleanup(id, projectRoot, kind)`；返回原语结果
- 两者都不带 → 报错要求显式选择（避免误触）

- [ ] **Step 2: 前端**：二次确认弹窗，列出将被删除的路径（不可逆要写清）。

---

### Task 7: 多项目注册表口径（D4）

- [ ] **Step 1: `addProject` 加校验**

目录存在 → 已 `polaris init`（`.polaris/config.yaml` 存在，复用 `checkInitialized` 的判据）→ 路径未重复。不合规给出可操作提示。

- [ ] **Step 2: `listProjects` 标记失效**

对每项返回 `stale: boolean`（目录不存在 / 不再是 polaris-flow 项目）+ `reason`。**不自动删除**。

- [ ] **Step 3: 前端**：项目选择器显示失效标记，提供「移除」动作（手动）。

> ⚠️ 兼容性：老注册表里可能已有非 polaris-flow 的项目（历史遗留）。第 1 步只拦**新增**，第 2 步为存量提供可见性 —— **不做数据迁移**（AGENTS.md：移除过时路径、不加兼容层）。

---

### Task 8: 契约 + CHANGELOG + 验收

- [ ] **Step 1: 契约新增「五、写操作」章节**（原 §五 起顺延）

逐条写：端点、方法、body、**映射到的原语**、错误形状、是否需确认、锁名。并把 §二 对应端点的只读列由 ✅ 改为 ⚠️。

- [ ] **Step 2: 订正设计文档 §7 D4** 为「已决：继续用 `~/.polaris/projects.json`」+ 语义说明。

- [ ] **Step 3: CHANGELOG** 追加到 `0.1.1`（Added / Changed / Fixed，`ship-cleanup` 的修复放 Fixed）。

- [ ] **Step 4: 全量自检**（零新增）

```bash
pnpm format:check && pnpm lint && pnpm build && pnpm test
```

- [ ] **Step 5: 绕过锁的直写检查**（验收硬指标，机械可查）

```bash
grep -rnE "writeFile|writeFileSync|\brm\(|rename\(|mkdir" src/dashboard/ | grep -v "scan/" 
# 预期：无对项目内文件的写操作（scan/ 只读，也不应有写）
```

---

## 六、M3 完成判据（对齐设计 §六 M3）

1. **勾选任务后三者一致**：`tasks.md` 复选框、`state.yaml` 的 `runtime.build` 计数、`.locks/` 状态一致（Task 2 测试覆盖）。
2. **推进阶段后游标正确**：`workflow.yaml` 的对应 kind 条目 `phase` 变为目标值，且面板回读显示一致。
3. **无绕过锁的直写路径**：API 层 grep 无写文件调用；三个写端点全部经原语（Task 8 Step 5 机械检查）。
4. **交付清理不可逆操作有 dry-run 与确认**，且**传错 kind 必须中止**（缺陷修复的回归测试）。
5. **`reveal` fail-closed**：空白名单拒绝、白名单外拒绝。
6. **注册表语义落地**：新增项目必须已 `polaris init`；失效项可见但不自动删。
7. 基线零新增（format / lint / test 三项数字不变差）。

## 七、后续（不在本计划内）

- **回退阶段 + `regressions[]` 留痕**（D19 选项 B）—— 需要数组 append 能力，且要先定「谁可退、退到哪」的语义。
- **phase 真相归一的 A 案**（`docs/specs/2026-09-19-phase-truth-unification-design.md`，D12–D16 待决）。**注意依赖关系**：面板推进阶段后，宿主的自动衔接会走 `polaris state next`，而其中 prototype / debug 两张表**偏移一位**（D13）—— 若 M3 之后要开自动衔接，D13 必须先修。
- **M4 收敛与退役**：`test/ts/dashboard.test.ts`；README / AGENTS.md 更新；`npm pack` 解包终检；两源仓归档。
