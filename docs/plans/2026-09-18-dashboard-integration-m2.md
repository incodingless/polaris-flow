# Dashboard 数据源对齐 M2 实施计划（5 类 kind + 新阶段 + 契约定稿）

> **For agentic workers:** 本计划按 task 顺序执行，每个 Step 用 `- [ ]` 跟踪。Task 1–2 是**纯新增**（先建真相层与扫描层，不动既有路由）；Task 3 起才动既有行为；Task 4–6 动前端。**任一提交后本仓必须仍可 `pnpm build && pnpm test`** —— M2 不存在"不可构建窗口"，这是它与 M1 最大的不同。

**Goal:** 把 Dashboard 的数据源从 openspec 时代模型（扫 `openspec/changes/*/`、按文件存在性猜 phase、内置 `config/tasks.yaml` 定义 8 步）换成 polaris-flow 当前模型（`.polaris/workflow.yaml` 的 5 类游标 + `state.yaml.phase` 单一真相 + 各 kind 的真阶段表），并让前端按新模型渲染。M2 结束即 `README` 可写用法说明（中间态解除）。

**Architecture:** 业务语义下沉 `src/core/`：kind 的阶段表与产物表是**唯一真相**，落在既有的「任务类型布局表」里。`src/dashboard/scan/` 只做「读 core → 组形状」，`src/dashboard/api/*` 只做 HTTP 编解码与序列化，`dashboard/src/**` 只消费契约字段。旧的「按文件存在性反推 phase」整块退役（`change-scanner.ts` 及其 `getChangePhase()` / `computeStepStatuses()` / `isArtifactDone()` 家族）。

**Tech Stack:** TypeScript（Node 20+，ESM，`NodeNext`）、Commander、Vitest、Vue 3 + Vite 6（仅 `dashboard/` 内）。

**Spec:** `docs/specs/2026-09-18-dashboard-integration-design.md` §5.1 / §六 M2；契约 `docs/specs/2026-09-18-dashboard-api-contract.md`（M2 定稿）

---

## 一、开工前已查实的事实（每一条都影响实现取舍）

| # | 查实 | 对 M2 的含义 |
| --- | --- | --- |
| 1 | **`config/tasks.yaml` 在本仓根本不存在**（`src/dashboard/api/workflow.ts` 的两个候选路径都落空） | `GET /api/workflow` 恒返回 `{workflows: [], error}`，前端 `changeMapper.buildStepGroupsFromWorkflow()` 永远拿不到 workflow，一路退化成 `utils/workflow.js` 里硬编码的旧 9 步。**M1 面板的问题不是"数据源旧"，是"流程定义整块缺失"** —— 所以 M2 必须先有真阶段表（Task 1），否则后面全是空中楼阁 |
| 2 | 旧 phase 由 `getChangePhase()` 按文件存在性猜，取值域 `proposal\|specs\|design\|tasks\|done`（`change-scanner.ts:111-147`） | 与真 phase 名**没有一个重合**。前端 `changeMapper.PHASE_STATUS`、`dashboardHelpers.PHASE_ORDER`/`PHASE_BADGE_LABELS`、`workflow.STAGE_TO_TAB` 三张表全部作废 |
| 3 | **phase 枚举在仓内有三个互相矛盾的来源**（见 §二） | 以「技能 README + state 模板 + 契约」这一组为真相；`workflow-template.yaml` 的注释是陈旧文本 |
| 4 | **debug 族是 3 阶段**（`diagnose → patch → closeout`），真相在 `assets/zh/skills/debug/README.md:7`（「2026-09-17 三阶段合并」）与 `debug-state.example.yaml`；仓内另有 3 处「六段时代」陈旧文本说它 6 阶段（详见 §二 debug 组） | 契约 §五、设计文档已订正为 3 阶段。其中 `task-kind-layout.ts` 的 debug `initialPhase: 'triage'` 是**缺陷**（debug 实际起始于 `diagnose`），而该文件正是 D6 的落点 → Task 1 一并修正，否则新建的 debug 任务会写成 `phase: triage`、面板显示「未知阶段」 |
| 5 | `workflow.mode` 的取值也有两套名字：`state.example.yaml` 注释写 `sdd \| tweak \| bugfix \| full`（默认 `sdd`），而契约 §五写 `tweak \| normal \| full` | 渲染模式标签时必须**两个名字都认**（`sdd` 与 `normal` 视为同一档），否则面板静默空白。这正是契约文档存在的理由 |
| 6 | 只有 requirement / prototype 的 `state.yaml` 有名字字段（`req_name`/`req_name_cn`、`name`），coding / debug / testcase 没有 | 契约需要一条显式的 `title` 取值规则，否则列表与详情只能显示 id（见 §三 字段表） |
| 7 | `testcase` 的 state 在 `.polaris/testcases/<id>/`，其余在 `.polaris/tasks/<id>/` | `polaris-paths.getTaskKindStatePath(projectRoot, kind, taskId)` 已覆盖两种情形，**直接用，不许自己拼路径**（旧实现坏掉的根因） |
| 8 | `src/dashboard/markdown.ts`（`renderMarkdown`，149 行）**全仓无引用** | 是随 `change-operations`/`compose` 一起成为孤儿的死代码，M2 删 |
| 9 | `src/dashboard/change-scanner.ts:98` 的 `parseTasksMd`（复选框解析）与 `:149` 的 `listChangeFiles`（文件树 walk）仍有价值 | 两者**移植**进 `scan/`，其余整组删除。`getChangePhase` / `computeStepStatuses` / `computeArtifactStatuses` / `isArtifactDone` / 6 个 `check*` 是"按文件存在性反推"的化身，一个不留 |
| 10 | 可用的验证样本不足：`test-project/prdtesting` 已 init，但 5 个数组全空、`.polaris/tasks/` 为空 | "5 类 kind 全可见"**无法用现成样本验**，必须自造 fixture（Task 5 Step 6） |
| 11 | 前端消费面收敛：`api/index.js` 20 个函数、`utils/` 8 个模块、`composables/` 3 个、`views/` 5 个、`components/` 29 个；总计约 3200 行 | 规模可控，但**字段级依赖必须逐条对齐**（§三 那张表就是依据），不能靠"看起来能跑" |
| 12 | **`src/core/hooks/state-next.ts` 已有一份 per-kind 的 phase 知识表**（`PHASE_TO_SKILL` / `DEBUG_PHASE_TO_SKILL`），其测试 `state-next.test.ts:105` 明确断言 triage/prescribe/prove 返回 null、`specify` 返回 null | 这是**独立的第三处 phase 真相**（前两处见 §二）。Task 1 新表若与它各自漂移，就会重演 `triage` 事故 → Task 1 Step 2 必须加**漂移护栏**：state-next 的 phase key 必须是新表已登记阶段或已声明别名 |
| 13 | **`phase` 的权威是 `workflow.yaml` 的游标，不是 `state.yaml.phase`**：全仓唯一读取方 `polaris state next` 读的是 `hit.entry.phase`；而 `state.yaml.phase` **src/ 内零读取方**，coding 族又从不调用 `enter/complete-phase`，所以它会长期停在建任务时的 `specify` 或 `idle` | M1 契约原写「state.yaml 为单一真相」**是错的**，已订正。Task 2 的 `readTaskRuntime` 改为**接收游标 phase**，不读 `state.yaml.phase`（见 Task 2 Step 2）。完整调研与归一方案见 `docs/specs/2026-09-19-phase-truth-unification-design.md` |

---

## 二、phase 枚举的矛盾来源与裁定

### coding

| 来源 | 枚举 | 裁定 |
| --- | --- | --- |
| `assets/shared/templates/workflow-template.yaml:16` 注释 | `specify \| plan \| design \| build \| verify \| delivery`（**缺 `tasks`**，且用 `delivery` 而非 `ship`） | ❌ 陈旧，**不在本计划内改**（init 资产，另案） |
| `assets/shared/templates/state.example.yaml:53` 注释 | `idle \| specify \| plan \| design \| tasks \| build \| verify \| ship` | ✅ 与技能一致 |
| `assets/zh/skills/README.md` §阶段一览 | specify → plan → design(可选) → tasks → build → verify → ship（+ 旁路 retro） | ✅ **真相** |
| `docs/specs/2026-09-18-dashboard-api-contract.md` §五 | 同上 | ✅ 真相的冻结形式 |

### debug（**已订正：3 阶段，不是 6 阶段**）

| 来源 | 枚举 | 裁定 |
| --- | --- | --- |
| `assets/zh/skills/debug/README.md:7`（「2026-09-17 三阶段合并」） | `diagnose → patch → closeout` | ✅ **真相** |
| `assets/shared/templates/debug-state.example.yaml` | `idle \| diagnose \| patch \| closeout`（`runtime` 下恰此三块） | ✅ 与技能一致 |
| `assets/zh/skills/debug/{diagnose,patch,closeout}/` 三个技能目录 | 同三个 | ✅ 与技能一致 |
| `docs/specs/2026-09-16-debug-workflow-design.md` | `triage → diagnose → prescribe → patch → prove → closeout` | ❌ 六段时代。该文档在 debug README:25 被自身声明「阶段名以本 README 为准」 |
| `assets/shared/templates/workflow-template.yaml:68` 注释 | 同上六阶段 | ❌ 六段时代遗留 |
| `src/core/config/task-kind-layout.ts` debug 的 `initialPhase: 'triage'` + `initPatches['runtime.triage.*']` | 起始 `triage` | ❌ **属缺陷**：debug 实际起始于 `diagnose`（`debug/diagnose/SKILL.md:133` 即 `--phase diagnose`）→ **M2 一并修正**（该文件正是 D6 的落点） |

**裁定：以「技能 README + state 模板 + 技能目录」为真相（三者互洽）；两份模板注释与 2026-09-16 设计文档是陈旧文本。** 落地形式是 Task 1 的阶段表 + 一条**契约枚举的守卫测试**（把契约 §五 的枚举逐条写进单测，两侧任一处漂移都会红）。

> 附带发现（**不在 M2 范围**，交 debug 技能族）：`assets/zh/skills/debug/closeout/SKILL.md:55-58` 是从 `patch` 复制的残留 —— 状态行仍写「进入实现与自验」、正文写 `phase: build` / `build.status: in_progress`（而同段 bash 块写的是 `--phase patch`，两者矛盾）。

---

## 三、字段映射表（前端消费者 → M2 契约，逐条对照改）

旧字段的读取位置由 grep 实测得来，`dashboard/src/` 下逐条给出：

| 前端现读取（证据：文件:行号） | M2 契约字段 | 来源 |
| --- | --- | --- |
| `t.name`（`useTasks.js:58,171`） | `task_id` | `.polaris/workflow.yaml` 各项 |
| `t.title` / `change.summary`（`changeMapper.js:97,139`） | `title` | 按 kind 取：requirement→`req_name`→`req_name_cn`；prototype→`name`；testcase→`testcase_plan.md` 一级标题；coding→`openspec/changes/<id>/change-brief.md`→`intention.md` 一级标题；debug→`diagnose-brief.md` 一级标题；全落空→`task_id` |
| `change.phase`（`changeMapper.js:104,146`） | `phase` | **`.polaris/workflow.yaml` 游标的 `phase`**（权威；见 §一 事实 #13），**不读 `state.yaml.phase`** |
| `change.currentGroup`（`changeMapper.js:121,147`、`useTasks.js:50,200`、`ChangeDetailDrawer.vue:44`） | `phase_group` | 阶段表：phase → 所属分组名 |
| `change.stepStatuses` / `change.workflow`（`changeMapper.js:27-35,75`） | `phase_groups` | 阶段表 + `phase` 算出的 done/active/pending |
| `change.stepsDone` / `stepsTotal`（`changeMapper.js:73,87`、`dashboardHelpers.js:36-38`） | `phase_index` / `phase_total` | 阶段表序位 |
| `t.tasksDone` / `tasksTotal`（`useDashboard.js:117-118`、`dashboardHelpers.js:83-84`） | `tasks_done` / `tasks_total` | `openspec/changes/<id>/tasks.md` 复选框（**仅 coding / debug**；其余为 `null` → UI 不渲染该行） |
| `t.time`（`useTasks.js:85` 排序） | `started_at` | workflow.yaml |
| `change.created`（`changeMapper.js:101,118`） | `started_at` | 同上 |
| `change.mtime`（`changeMapper.js:117`、`useDashboard.js:100`） | `updated_at` | `state.yaml` 的 mtime |
| `change.archivedDate`（`workflow.js:80,101`、`changeMapper.js:119`） | `archived_at` | `.polaris/archive/<id>/` 目录 mtime |
| `change.labels` → `groupTag`（`changeMapper.js:13-17,116`） | `kind` + `channel` | 旧 labels 作废；卡片角标改 kind 缩写（COD/REQ/TC/PRO/DBG），debug 再带 channel |
| `change.workflowName` / `workflowShortName` / `schema`（`changeMapper.js:124-126`、`TaskCardItem.vue:12`） | `kind`（即 workflowId） | 契约：`workflowId` ≡ `kind` |
| `change.name` → `changePath`（`changeMapper.js:106-108`） | `task_path` | `.polaris/<segment>/<id>` |
| `change.specs`（`changeMapper.js:129,142-143`、`dashboardHelpers.js:56-60`） | `artifacts` 计数 | 产物表 |
| `change.files` / `change.specs[]`（`changeMapper.js:141-142`、`useTasks.js:219`、`refreshChangeFile`） | `files` | `.polaris/<segment>/<id>/` ＋ `openspec/changes/<id>/`（仅 coding/debug）的 `.md`/`.yaml` 树 |
| `mapped.workflowPhases` / `artifactPhases`（`useTasks.js:176-193`） | `GET /api/workflow/:kind/{phases,artifacts}` | 阶段表 / 产物表 |
| `change.workflowError`（`changeMapper.js:148`） | 删除 | 阶段表是常量，不再会"查不到 schema" |
| `stats.tasksDone/tasksTotal`（`useDashboard.js:143-144`、`HomePage.vue:74-75`） | `GET /api/stats` 的 `tasks_done`/`tasks_total` | 同上拉取 |
| `store.taskCounts.{active,archived}`（`useTasks.js:107-110`） | `counts.{active,archived,by_kind}` | 扫描器 |

---

## 四、待决（动手前请拍板；每条附建议与理由）

> **2026-09-18 全部拍板**：D6、D8、D9、D10 采纳建议；D7 **由用户裁定为 3 阶段**（原建议的「按 6 阶段渲染」作废，理由见下，属我判断错误）。以下保留原提案与理由，便于回溯。

### D6 — 阶段表落在哪 —— ✅ 已决：扩 `task-kind-layout.ts`

- **决定：扩展 `src/core/config/task-kind-layout.ts`**。它已是「任务类型布局表」，`TASK_KIND_LAYOUTS` 是 kind 的单一表，已含 `initialPhase`/`storageSegment`/`stateTemplate`。加 `phases` 与 `artifacts` 是把「kind 的全部事实」收在一处，**不新增文件、不出现第二处 kind 定义**。
- 备选（未采纳）：新增 `src/core/config/workflow-phases.ts`。文件职责更单一，但 kind 的定义就散成两处了。
- 两案都满足设计文档「改为 `src/core/` 内常量」（§5.1）。

### D7 — debug 族的阶段口径 —— ✅ 已决：**3 阶段**（用户裁定，原建议作废）

**决定：debug 阶段表就是 `diagnose → patch → closeout`。** 依据 `assets/zh/skills/debug/README.md:7`「2026-09-17 三阶段合并」与我查实的 `debug-state.example.yaml`、三个技能目录。

**原建议（按契约 6 阶段渲染）是错的**，我错在把设计文档与模板注释当成了真相，而那两处恰恰是六段时代遗留 —— 且 debug README 自己就声明了「阶段名以本 README 为准」。教训记在 §二：**枚举类真相要认「实现与技能自述」，不要认设计文档里没落地的阶段名。**

连带影响（已全部落到计划里）：

1. `task-kind-layout.ts` 的 debug `initialPhase: 'triage'`、`initPatches['runtime.triage.*']` 是**缺陷**，改为 `diagnose` / `runtime.diagnose.*`（Task 1 Step 1）。
2. 「未知 phase 兜底不崩」**保留为通用健壮性规则**（不再是为 debug 特设）：任何枚举取到未登记值都显示原值 + 标注，不抛错、不静默空白。
3. debug 分组由 3 组降为 2 组（见 §五）；`KindPhaseDef` 不再需要 `onlyChannel` 字段（3 阶段两通道装配相同），类型因此更简单。
4. 契约 §五 与设计文档 §3.2 表格已在本轮订正。

### D8 — 前端进度模型的形状 —— ✅ 已决：保留两级

老 UI 假定两级「分组（groups）→ 步骤（steps）」，`StepsProgress` / `WorkflowThumbnail` / `PhaseBadge` / `SecondarySidebar` 都吃这个形状；`STAGE_NAV_ITEMS` / `DETAIL_TABS` 则吃「四件套」的 5 个 Tab。

- **决定：保留两级形状**，把每个 kind 的阶段切成 2–3 个分组（见 §五 阶段表），Tab 由 kind 的阶段分组驱动，而不是四件套。理由：改动集中在数据映射层，组件改动小、可验证；推倒重做成单层阶段条会让 5 个组件同时重写，风险与收益不成比例。
- 备选（未采纳）：单层阶段条（更像 CLI 的 `workflow.yaml` 语义，但要重写组件）。

### D9 — 一级导航「规格」的去向 —— ✅ 已决：改为「配置」

`useTasks.filterSpecFiles()` 按 `openspec/schemas/`、`openspec/specs/`、`openspec/polaris.yaml` 过滤 `/api/configs` 的结果。换源到 `.polaris/*.yaml` 后这些前缀全部落空 → 该导航会变成永远空列表。

- **决定：把「规格」改为「配置」**，列 `.polaris/config.yaml` 与 `.polaris/workflow.yaml`（+ 存在则 `polaris.example.yaml`），点击进只读的 yaml 查看。理由：`GET /api/configs` 的 M2 数据源本就只有这两份文件；且设计 §六 M2 验收写的是「配置面板显示 `.polaris/config.yaml`」。
- 备选（未采纳）：保留「规格」语义，改扫 `openspec/specs/` + `openspec/changes/<id>/specs/`（那是"参考规格"而非配置，需要新端点）。

### D10 — `operations` 端点与操作组件 —— ✅ 已决：删除

- **决定：M2 直接删除** `GET /api/workflow/:kind/steps/:stepId/operations`，前端删 `fetchWorkflowStepOperations` / `executeChangeStepOperation` / `validateChange`，`StageActionNav` / `ReviewPhaseNav` 去掉操作能力。理由：契约 §5.2 明写操作白名单属 M3；M2 是只读阶段，"列不出任何操作"的端点是纯噪音。这也顺手清掉 M1 契约 §四记的那两个已知 404。

### D11 — `state-next` 里 coding 与 debug 的 phase 语义疑似不一致（**实现期新发现，待你判定**）

**不阻塞 M2**（面板只原样显示 `state.yaml.phase`，不依赖 state-next），但会影响 M3 的「下一阶段」提示，且现在就是一处语义裂缝。证据：

| 观察 | 证据 |
| --- | --- |
| coding 的表是**自映射**：`plan→plan`、`build→build` | `state-next.ts` 的 `PHASE_TO_SKILL.coding`；`state-next.test.ts` 断言 `resolveNextSkillName('coding','plan') === 'plan'` |
| debug 的表是**后移一位**：`diagnose→patch`、`patch→closeout` | `DEBUG_PHASE_TO_SKILL`；`state-next.test.ts` 断言 `resolveNextSkillName('debug','diagnose') === 'patch'` |
| 两者由**同一个** `resolveNextSkillName` 消费，因此只能是同一套约定 | `state-next.ts:129-135` |
| debug 的游标在**阶段出口**就前移 | `debug/diagnose/SKILL.md:328-334`：`complete-phase --phase diagnose --next-phase patch` ＋ `update-active --set phase=patch` |

**推论**：若沿用 coding 的约定（phase 值 = 下一个要跑的阶段），则 debug 出口把游标置为 `patch` 后，`resolveNextSkillName('debug','patch')` 返回 `closeout` —— **会跳过 `patch`**。反之若 debug 的约定是「phase 值 = 刚结束的阶段」，那 coding 的表就是错的。

我的置信度 **MED**（无法从前端代码单独判定 debug 侧究竟在何时咨询 state-next）。**没有改** —— 这是 debug 族/自动衔接的语义问题，不属于 Dashboard 范围。请判定：是真 off-by-one，还是我读错了调用时机。

---

## 五、阶段表内容（Task 1 的落地清单；文案可再改，结构定死）

| kind | 分组（group） | 分组内阶段 | 备注 |
| --- | --- | --- | --- |
| coding | 澄清与方案 | `specify` → `plan` → `design`(可选) | `design` 仅 full 模式走；`retro` 是旁路，**不进游标**，不列入进度 |
| | 实现 | `tasks` → `build` | |
| | 收口 | `verify` → `ship` | |
| debug | 诊断 | `diagnose` | **起始阶段**；含场景分流（测试/生产信号）、根因与方案；出口两处人确认 |
| | 修复与关单 | `patch` → `closeout` | 两通道装配相同；`prove` 已并入 `patch` 的 1.5 步，**不再是独立阶段** |
| requirement | 澄清与草稿 | `discovery` → `draft` | |
| | 完善与交付 | `refine` → `ship` | |
| testcase | 澄清与草稿 | `discovery` → `draft` | 同 requirement（不同产物） |
| | 完善与交付 | `refine` → `ship` | |
| prototype | 蓝图 | `blueprint` | |
| | 构建与评审 | `build` → `review` | |
| | 交付 | `ship` | |

产物表（`artifacts`）对齐 `assets/zh/skills/README.md` §产物布局与 §路径对照：

| kind | 阶段 | 产物（相对路径） | check |
| --- | --- | --- | --- |
| coding | specify | `.polaris/tasks/<id>/intention.md` 或 `openspec/changes/<id>/intention.md` | file-exists（两处取或） |
| | plan | `openspec/changes/<id>/{proposal,design,specs,tasks}.md` | file-exists ×4 |
| | design | `openspec/changes/<id>/detailed-design.md` | file-exists |
| | tasks | `openspec/changes/<id>/tasks.md` | tasks-all-checked |
| | verify | `openspec/changes/<id>/reviews/verify-report.md` | file-exists |
| | ship | `.polaris/archive/<id>/` | dir-exists |
| | （各阶段可选） | `openspec/changes/<id>/reviews/*.md` | dir-has-md |
| debug | diagnose | `diagnose-brief.md`（过程档案）＋ `reviews/rca-report.md`（RCA 成品）＋ `tasks.md`（修复方案） | file-exists；`tasks.md` 用 tasks-all-checked |
| | patch | `verification.md`（「自验」节；生产通道另含 1.5 步的「独立验证」节） | file-exists |
| | closeout | `reviews/bugfix-report.md` ＋ 归档 `docs/troubleshooting/<id>/`（扁平 4 文件，**复制不移动**） | file-exists + dir-exists |
| requirement | discovery / draft / refine | `.polaris/tasks/<id>/` 下的过程文件（已核：`assets/zh/skills/prd/README.md` §产物布局） | file-exists |
| | ship | `docs/prd/<name>.md`（`$PRD_DOC_DIR`，默认 `$REPO_ROOT/docs/prd/`，README §产物布局已核） | file-exists |
| testcase | draft | `.polaris/testcases/<id>/testcase_plan.md`（`task-kind-layout.ts` 的 `bootstrapFiles` 已核） | file-exists |
| | refine / ship | `.polaris/testcases/<id>/` 下产物 | file-exists |
| prototype | blueprint / build / review | `docs/prototype/…`（`test-project/prdtesting` 实测目录） | file-exists |

> **产物名的依据**：debug 一列来自 `assets/zh/skills/debug/closeout/references/artifacts.md`（debug 族的**产物契约**，含分段回填写明表与归档规则，实测已核）；requirement 来自 `assets/zh/skills/prd/README.md` §产物布局；testcase 的 `testcase_plan.md` 来自 `task-kind-layout.ts` 的 `bootstrapFiles`。仍待实现期核的：prototype 的 `docs/prototype/` 具体文件名。核不到时取实测值，**不猜**。
>
> **⚠️ debug 的归档落点与其余 kind 不同**：debug 归档到 `docs/troubleshooting/<id>/`（+ 追加一行到 `docs/troubleshooting/INDEX.md`），**不用 `.polaris/archive/`**（实测：`assets/zh/skills/debug/` 下 `polaris/archive` 零命中）。而 coding / requirement / testcase / prototype 的 `state.yaml` 的 `ship.archive_dir` 与 `ship-cleanup` 原语都指向 `.polaris/archive/<id>/`。**后果**：只扫 `.polaris/archive/` 会让「归档」列表丢掉全部已归档的 debug 任务 → `scanArchivedTasks` 必须同时读 `docs/troubleshooting/INDEX.md`（见 Task 2 Step 1）。

**kind ↔ 技能目录的命名映射（实现时别找错目录）**：`coding`→`assets/zh/skills/coding/`、`debug`→`debug/`、`requirement`→**`prd/`**、`testcase`→**`testing/`**、`prototype`→`prototype/`。契约里的 kind 名来自 `workflow.yaml` 的数组键，与技能目录名不必一致。

---

## 六、Global Constraints

- **只读（已决 4）**：M2 不新增任何写操作；`apis` 只提供 GET（`projects` 的 3 个写端点沿用 M1 现状，不在 M2 范围内动）。
- **单一真相**：`phase` 只来自 `state.yaml.phase`。**禁止**由文件存在性反推阶段 —— 这是旧实现的核心错误，M2 要把它根除。
- **业务语义下沉 `src/core/`**：路径解析一律用 `polaris-paths.ts`，游标读取一律用 `workflow-state.ts`，状态读取用 `task-kind-layout.ts` 定位路径。`src/dashboard/scan/*` 不出现 `join(projectRoot, '.polaris', ...)` 这类字面路径。
- **依赖方向**：`cli → commands → core → utils`，禁止反向；`src/dashboard/` 属传输层。
- **不得改动前端代码风格**：`dashboard/` 不在 `src/` 下，`pnpm format:check` / `pnpm lint` 的范围与行为必须与改造前完全一致，**不新增任何 ignore 例外**。
- **不得改 skills / hooks / `polaris init` 链路 / `assets/` 资产**（设计 §二 非目标）。阶段表落在 `src/core/`，**不**去改 `workflow-template.yaml`。
- **未知数据不崩**：任何枚举（phase / mode / channel / kind）取到未登记的值时，显示原值并标注，不得抛错、不得静默空白。
- 代码文件与函数注释用中文；TS 文件名 kebab-case；导出函数 camelCase。
- **CHANGELOG**：追加到现有 `0.1.1` 条目，**不**升版本号。
- **基线（勿误判）**：本分支 `vitest run` 基线为 **6 failed | 33 passed（39 文件）**，lint 13 个既有 error，format:check 14 个既有不合格文件。改动以「零新增」为准。
- 提交前须过：`pnpm format:check && pnpm lint && pnpm build && pnpm test`。

---

## 七、File Structure

| 文件 | 职责 | M2 动作 |
| --- | --- | --- |
| `src/core/config/task-kind-layout.ts` | 任务类型布局表（kind 的单一表） | **扩展**：加 `phases` / `groups` / `artifacts` / `modes`（D6） |
| `src/dashboard/scan/tasks.ts` | 游标扫描：`workflow.yaml` 5 数组 + `.polaris/archive/` | **新建** |
| `src/dashboard/scan/state.ts` | 运行态扫描：按 kind 定位并读 `state.yaml`；`title` 归一化 | **新建** |
| `src/dashboard/scan/files.ts` | 文件树：`.polaris/<seg>/<id>/` + `openspec/changes/<id>/`；`tasks.md` 复选框解析 | **新建**（移植旧两函数） |
| `src/dashboard/api/tasks.ts` | `GET /api/tasks`、`/api/tasks/:id` | **新建**（替代 `api/changes.ts`） |
| `src/dashboard/api/workflow.ts` | `/api/workflow*`：改为读 `task-kind-layout.ts` | **重写**（删 tasks.yaml 加载与缓存） |
| `src/dashboard/api/check.ts` | `GET /api/check` | **重写**：接 `src/core/doctor.ts` |
| `src/dashboard/api/configs.ts` | `GET /api/configs*` | **改源**：`.polaris/*.yaml` |
| `src/dashboard/api/filesystem.ts` | `checkOpenspec` → `checkInitialized` | **改名改判据** |
| `src/dashboard/router.ts` | 路由表 | **重写**相关分支 |
| `src/dashboard/change-scanner.ts` | 旧扫描（按文件存在性猜 phase） | **删除**（两个纯函数移植走） |
| `src/dashboard/markdown.ts` | `renderMarkdown`（全仓无引用） | **删除** |
| `src/dashboard/api/changes.ts` | 旧 `/api/changes` | **删除** |
| `dashboard/src/api/index.js` | API 层 | **改名与增删** |
| `dashboard/src/utils/workflow.js` | 旧 9 步模板 + 阶段/步骤工具 | **重写**为阶段表驱动 |
| `dashboard/src/utils/changeMapper.js` | 响应 → UI 结构 | **重写**字段映射 |
| `dashboard/src/utils/dashboardHelpers.js` | 阶段徽章 / 进度百分比 | **重写**（旧 4 阶段表作废） |
| `dashboard/src/utils/changeFiles.js` | 文件归类 | **改**归一化形状 |
| `dashboard/src/composables/useTasks.js` | 任务列表与详情 | **改**：删两个死动作、换 status/kind 参数 |
| `dashboard/src/composables/useDashboard.js` | 首页统计 | **改**字段 |
| `dashboard/src/components/tasks/*.vue`、`components/*.vue`、`views/*.vue` | 视图 | **按需适配**（见 Task 5） |
| `test/ts/task-kind-phases.test.ts` | 阶段表单测（**契约枚举的守卫**） | **新建** |
| `test/ts/dashboard-scan.test.ts` | 扫描器单测（含 phase 反例） | **新建** |
| `docs/specs/2026-09-18-dashboard-api-contract.md` | 契约 | **定稿** |

---

## 八、Tasks

### Task 1: 阶段表与产物表（`src/core/`，先建真相）

**Files:**
- Modify: `src/core/config/task-kind-layout.ts`
- Create: `test/ts/task-kind-phases.test.ts`

- [x] **Step 1: 扩展 `TaskKindLayout`**

新增字段（形状按 §五 的表填）：

```ts
/** 阶段定义：code 即 state.yaml.phase 的取值；group 决定 UI 分组 */
export type KindPhaseDef = {
  code: string;
  /** 中文显示名，如「澄清」 */
  name: string;
  /** 所属 UI 分组名 */
  group: string;
  /** 可选阶段（如 coding 的 design：仅 full 模式走，`phase_index` 计算时跳过） */
  optional?: boolean;
};

/** 产物定义：对齐 assets/zh/skills/README.md §产物布局 */
export type KindArtifactDef = {
  phase: string;
  /** 相对项目根的 posix 路径，可含 `<id>` 占位 */
  relPath: string;
  kind: 'file' | 'dir';
  /** 是否逐项校验复选框（tasks.md） */
  checkboxes?: boolean;
};
```

> 注：**不需要 `onlyChannel`**。D7 定为 3 阶段后，debug 两通道的阶段完全相同（差别只在加严分支与产物节），阶段表因此与 channel 无关。

并导出纯函数：`getKindPhases(kind)`、`getKindGroups(kind)`、`getKindArtifacts(kind)`、`phaseGroupOf(kind, phase): string | null`、`phaseIndexIn(kind, phase): number`（未登记返回 `-1`）、`isKnownPhase(kind, phase): boolean`。

- [x] **Step 1b: 修正 debug 的 `initialPhase` 与 `initPatches`（**缺陷修复，D7 连带**）**

现状：debug 的 `initialPhase: 'triage'`，`initPatches` 写 `'runtime.triage.status'` / `'runtime.triage.started_at'` —— 六段时代遗留，而 debug 实际起始阶段是 `diagnose`（`assets/zh/skills/debug/diagnose/SKILL.md:133` 即 `--phase diagnose`）。**不改则新建的 debug 任务会写成 `phase: triage`，面板必然显示「未知阶段」。**

改为 `initialPhase: 'diagnose'`、`'runtime.diagnose.status'`、`'runtime.diagnose.started_at'`，与 `debug-state.example.yaml` 的 `runtime.diagnose` 块对齐。

> 这一步会改变 `task-init` 对 debug 的落盘内容 —— 属**修正既有缺陷**，不是新增行为。若判定该改动应归 debug 技能族而非 M2，则必须同步在 `KindPhaseDef` 侧把 `triage` 作为「历史遗留值」登记，否则面板对存量 debug 任务显示未知阶段（两案任选，但**不能两案都不做**）。

- [x] **Step 2: 把契约 §五 的枚举写进单测（这一步是护栏，不是形式）**

`test/ts/task-kind-phases.test.ts` 逐条断言 5 类 kind 的阶段序列与契约文档一致，并断言 `isKnownPhase` 对未登记值返回 `false` 而不抛。**以后任何一侧漂移，这里先红。**

**另加一条漂移护栏（同源必要性，见 §一 事实 #12）**：`state-next.ts` 的 `PHASE_TO_SKILL` / `DEBUG_PHASE_TO_SKILL` 是**转移表**（phase → 下一 skill），比本表窄 —— `specify` 刻意无转移、`delivery`/`archive` 是历史别名。断言其每个 phase key 都属「本表已登记阶段 ∪ 已声明别名」，并断言 `DEBUG_PHASE_TO_SKILL` 与 debug 阶段集合认识一致、不含终结段 `closeout`。

> `state-next.ts` 的两个表原本未导出，需加 `export`（纯可见性改动、零行为影响，已在实现时完成）。

```bash
pnpm vitest run test/ts/task-kind-phases.test.ts
```

- [x] **Step 3: 校验**

```bash
pnpm build && pnpm vitest run test/ts/task-kind-phases.test.ts
```

---

### Task 2: `src/dashboard/scan/` 三个扫描器（TDD，纯新增）

**Files:**
- Create: `src/dashboard/scan/tasks.ts`、`src/dashboard/scan/state.ts`、`src/dashboard/scan/files.ts`
- Create: `test/ts/dashboard-scan.test.ts`

- [ ] **Step 1: `scan/tasks.ts`**

```ts
/** 扫描游标：workflow.yaml 5 数组 → 扁平的 TaskCursor[]，kind 由所在数组决定 */
export function scanTaskList(projectRoot: string): TaskCursor[];
/**
 * 扫描已归档任务。两个来源：
 *   1) .polaris/archive/<id>/（走 polaris-paths.getArchiveDir）—— coding / requirement / testcase / prototype
 *   2) docs/troubleshooting/INDEX.md 的每行 + docs/troubleshooting/<id>/ —— debug（**不走 .polaris/archive/**）
 */
export function scanArchivedTasks(projectRoot: string): TaskCursor[];
```

> 第 2 个来源是本计划新增的事实（§五 末尾那条警告）：debug 的归档落 `docs/troubleshooting/`。`INDEX.md` 的行格式为 `issue_id | 日期 | 模块 | 异常类型 | 根因一句话 | 修复一句话`（见 `closeout/SKILL.md:104`），只解析第一列 `issue_id` 与第二列日期即可，**不解析其余中文列**（它们不是结构化字段，硬解析会随文案漂移而碎）。

硬要求：读 `workflow.yaml` **必须**用 `loadWorkflowState(projectRoot)`（`src/core/config/workflow-state.ts`）；kind 由数组键反查 `WORKFLOW_TASK_KINDS` + `listKeyForKind`，不写字面量数组名。

- [ ] **Step 2: `scan/state.ts`**

```ts
export type TaskRuntime = {
  /**
   * **权威 phase：`.polaris/workflow.yaml` 游标项的 `phase`**，由 `scan/tasks.ts` 传入或在此回查。
   * 缺失时为空串。**不读 `state.yaml.phase`** —— 那是只写不读的非权威镜像
   * （coding 族从不调用 enter/complete-phase，其 state.yaml.phase 会长期停在建任务时的 `specify`）。
   * 依据：`docs/specs/2026-09-19-phase-truth-unification-design.md` §1.1。
   */
  phase: string;
  /** 归一化后的通道（`state.yaml.channel`）；仅 debug 族有 */
  channel: string;
  /** 归一化后的模式（`state.yaml.workflow.mode`；sdd 与 normal 视为同一档，见事实 #5） */
  mode: string;
  /** 任务名（`state.yaml` 的 req_name / name，或文档首标题，或回退 task_id） */
  title: string;
  /** 任务目录里的 worktree 路径（`state.yaml.worktree.path`） */
  worktreePath: string;
  /** state.yaml 缺失为 true —— 用于 UI 提示"运行态未初始化"。**不得据此反推阶段** */
  stateMissing: boolean;
  /** 取 state.yaml 的 mtime */
  updatedAt: string;
};

/** 按 kind 定位并读取 state.yaml（路径一律用 getTaskKindStatePath）；phase 由调用方从游标给出 */
export function readTaskRuntime(
  projectRoot: string,
  kind: WorkflowTaskKind,
  taskId: string,
  cursorPhase: string,
): TaskRuntime;
```

`title` 取值规则见 §三 字段表第 2 行；取一级标题用一个小的「首个 `# ` 行」提取函数，**不引入 markdown 解析依赖**。

> 单测要加一条反例：**`state.yaml.phase` 与游标 phase 不同**时，`readTaskRuntime` 返回的是**游标值**（这条护栏防的是契约 §三 那类失误复发）。

- [ ] **Step 3: `scan/files.ts`**

```ts
/** 合并任务目录与 openspec/changes/<id>/ 的文件树（.md/.yaml），单文件读失败跳过 */
export function listTaskFiles(projectRoot: string, kind: WorkflowTaskKind, taskId: string): TaskFile[];
/** 解析 tasks.md 的复选框 → { total, done }；无文件返回 null */
export function readTaskCheckboxes(projectRoot: string, kind: WorkflowTaskKind, taskId: string): TaskProgress | null;
```

- [ ] **Step 4: 单测（含**反例**）**

用 `mkdtempSync` 造 fixture：5 类 kind 各一个 `.polaris/workflow.yaml` + `state.yaml`，断言 `task_id`/`kind`/`phase`/`channel` 正确。

**必须有的反例**：造一个「`openspec/changes/<id>/tasks.md` 存在、但 `state.yaml.phase` 是 `plan`」的任务，断言 `phase === 'plan'` —— 这条测试就是"禁止按文件存在性反推"的看守。

再补：`state.yaml` 缺失 → `phase: ''` 且 `stateMissing: true`；requirement 的 `state.yaml` 只有 `req_name` → `title` 取到它。

```bash
pnpm vitest run test/ts/dashboard-scan.test.ts
```

---

### Task 3: 端点重写与旧模型退役

**Files:**
- Create: `src/dashboard/api/tasks.ts`
- Modify: `src/dashboard/router.ts`、`api/workflow.ts`、`api/check.ts`、`api/configs.ts`、`api/filesystem.ts`
- Delete: `src/dashboard/change-scanner.ts`、`src/dashboard/markdown.ts`、`src/dashboard/api/changes.ts`

- [ ] **Step 1: 端点清单（改完即契约 §二）**

| 方法与路径 | 查询参数 | 响应 | 变化 |
| --- | --- | --- | --- |
| `GET /api/tasks` | `status=active\|archived\|all`（默认 active）、`kind=` | `{ tasks: TaskItem[], counts: { active, archived, by_kind: Record<kind, number> } }` | 由 `/api/changes` 改名，**不保留别名** |
| `GET /api/tasks/:id` | `kind=`（可选，缺省按 5 数组 + testcases 探测） | `TaskDetail`（含 `files` / `phase_groups` / `artifacts` / `tasks_done` / `tasks_total`） | 由 `/api/changes/:name` 改名 |
| `GET /api/workflow` | — | `{ kinds: KindWorkflow[] }` | 换源为 `task-kind-layout.ts` |
| `GET /api/workflow/:kind/phases` | — | `{ kind, groups: [{ name, phases: [{ code, name, optional }] }] }` | 重定义 |
| `GET /api/workflow/:kind/artifacts` | `id=`（可选） | `{ kind, phases: [{ code, name, artifacts: [{ relPath, kind, exists }] }] }`；无 `id` 时 `exists` 为 `null` | 重定义 |
| `GET /api/check-initialized` | `path=` | `{ exists }`，判 `.polaris/config.yaml` | 由 `/api/check-openspec` 改名（**不保留别名**） |
| `GET /api/check` | — | `{ checks: [{ name, status: 'ok'\|'warn'\|'error', description }], summary }` | 改接 `runDiagnostics()` |
| `GET /api/configs` | — | `Array<{ path, name, mtime }>`：`.polaris/config.yaml`、`.polaris/workflow.yaml`（+ 存在的 `polaris.example.yaml`） | 换源 |
| `GET /api/configs/:path*` | — | 不变 | — |
| `GET /api/projects`、`/api/dirs`、`/api/stats`、`POST /api/reveal` | — | `/api/stats` 重定义（Step 4） | 其余保留 |

**删除**（并在契约 §四 登记）：`/api/changes`、`/api/changes/:name`、`/api/check-openspec`、`GET /api/workflow/:kind/steps/:stepId/operations`（D10）。

- [ ] **Step 2: `api/check.ts` 接 `doctor`**

```bash
grep -nE "^export|DiagnosticStatus|DiagnosticItem" src/core/doctor.ts   # 先读实际签名
```

要点：`runDiagnostics()` 的 `'fail'` 映射为前端认的 `'error'`（**只在这一层映射，不把 `'fail'` 透穿给前端**）；`ok/warn` 原样。**不得**保留现在那 5 条硬编码检查（`polaris.meta.yaml` / `polaris.record.yaml` / `openspec/polaris.yaml` 这些路径已失实）。

- [ ] **Step 3: 删旧模型**

```bash
git rm src/dashboard/change-scanner.ts src/dashboard/markdown.ts src/dashboard/api/changes.ts
grep -rn "change-scanner\|api/changes\|renderMarkdown" src/   # 预期：无输出
```

确认 `parseTasksMd` / `listChangeFiles` 的语义已在 Task 2 移植到 `scan/files.ts`（**移植，不是 import 旧文件**）。

- [ ] **Step 4: `/api/stats` 重定义**

`{ total, active, archived, by_kind: Record<kind, number>, tasks_done, tasks_total, phases: Record<phase, number> }`
说明：旧的 `totalChanges` / `pendingTasks` 语义作废（前端 `useDashboard.js:143-144` 与 `HomePage.vue:74-75` 同步改）。

- [ ] **Step 5: 校验**

```bash
pnpm build && pnpm test && node bin/polaris.js dashboard --port 3799 --no-open --api-only
```

逐条 curl（另开终端）：`/api/tasks`、`/api/tasks/<id>?kind=coding`、`/api/workflow`、`/api/workflow/coding/phases`、`/api/check-initialized?path=<已 init 项目>`、`/api/check`、`/api/configs`、`/api/stats`；并确认 `/api/changes`、`/api/check-openspec`、`/api/workflow/coding/steps/x/operations` **全部 404**。

---

### Task 4: 前端 API 层与契约对齐

**Files:**
- Modify: `dashboard/src/api/index.js`、`dashboard/src/utils/changeFiles.js`

- [ ] **Step 1: 改名与增删**

| 现函数 | M2 |
| --- | --- |
| `fetchChanges(project, filter)` | `fetchTasks(project, { status, kind })` |
| `fetchChangeDetail(project, name)` | `fetchTaskDetail(project, id, kind)` |
| `fetchCheckOpenspec(dirPath)` | `fetchCheckInitialized(dirPath)` |
| `fetchWorkflowPhases(workflowId)` | 语义不变，`workflowId` ≡ `kind` |
| `fetchWorkflowArtifacts(workflowId)` | 同上，增加可选 `id` 参数 |
| `fetchWorkflowStepOperations` | **删除**（D10） |
| `executeChangeStepOperation` | **删除**（D10） |
| `validateChange` | **删除**（D10） |
| `fetchChecks`（已 @deprecated） | **删除** |
| `fetchStats` | 改走 `parseResponse`（现在直接 `res.json()`，错误形状不统一） |

- [ ] **Step 2: 归一化层跟上新形状**

`changeFiles.js` 的 `normalizeWorkflowPhases` / `normalizeArtifactPhases` 要接受 `{ groups: [{ name, phases }] }` 与 `{ phases: [{ code, name, artifacts }] }`。

- [ ] **Step 3: 全仓确认无残留调用**

```bash
grep -rnE "fetchChanges|fetchChangeDetail|fetchCheckOpenspec|fetchWorkflowStepOperations|executeChangeStepOperation|validateChange" dashboard/src/   # 预期：无输出
npm --prefix dashboard run build
```

---

### Task 5: 前端阶段渲染改造

**Files:**
- Modify: `dashboard/src/utils/workflow.js`、`utils/changeMapper.js`、`utils/dashboardHelpers.js`、`utils/changeFiles.js`
- Modify: `dashboard/src/composables/useTasks.js`、`composables/useDashboard.js`
- Modify: `dashboard/src/components/tasks/{StepsProgress,WorkflowThumbnail,StageActionNav,ReviewPhaseNav,ChangeDetailDrawer,SecondarySidebar,PrimarySidebar}.vue`
- Modify: `dashboard/src/components/{TaskCardItem,TaskDetail,PhaseBadge}.vue`、`views/{TasksPage,HomePage,CheckPage}.vue`

- [ ] **Step 1: `utils/workflow.js` 重写（阶段表驱动）**

删掉：`WORKFLOW_TEMPLATE`（旧 9 步：Created/Optimizing/Draft/Generating/Review/Executing/Completed/Archiving/Archived）、`buildStepGroups`、`workflowMeta`、`STAGE_TO_TAB`、`STAGE_NAV_ITEMS`、`DETAIL_TABS`、`getGroupColor`（`BE/FE/FS/TS/RQ` 是旧 labels 的产物）、`formatStepCheck`（吃旧 `check.type` 枚举）。

改为：
```js
/** 每个阶段的 UI 状态：当前 phase 之前为 done，当前为 active，其余 pending */
export function buildPhaseGroups(kind, groups, currentPhase) { /* 产出旧的两级形状 */ }
export const KIND_LABELS = { coding: '开发', requirement: '需求', testcase: '测试用例', prototype: '原型', debug: '缺陷' }
export const KIND_ABBR = { coding: 'COD', requirement: 'REQ', testcase: 'TC', prototype: 'PRO', debug: 'DBG' }
export function displayPhase(phase, kind)   // 未登记 → 返回原值并标「未知」，不抛
export function displayMode(mode)           // sdd 与 normal 归一到同一档（事实 #5）
```

**关键**：`buildPhaseGroups` 保持「groups → steps」两级形状（D8），让 `StepsProgress` / `WorkflowThumbnail` 的模板改动最小。

- [ ] **Step 2: `changeMapper.js` 按 §三 字段表改**

`PHASE_STATUS`（`proposal/design/specs/tasks/done/archived`）整张作废；`mapPhaseStatus` 改为按 kind 的阶段名与位置生成；`mapChangeToTask` / `mapChangeDetail` 的每个字段对着 §三 表逐行替换。

- [ ] **Step 3: `dashboardHelpers.js` 改**

`PHASE_ORDER = ['proposal','design','specs','tasks']` 与 `PHASE_BADGE_LABELS` 作废 → 由 `kind` 的 groups 生成徽章；`getChangeProgressPct` 用 `phase_index / phase_total`。

- [ ] **Step 4: `useTasks.js` 改**

- `loadProjectData(project, { status, kind })`（替代 `filter`）。
- `filterSpecFiles` 的 openspec 前缀作废（D9）。
- **删** `executeStepOperation` / `runChangeValidate`（M1 契约 §四 记录的两个已知 404 源头）与 `actionToast`（若无人用）。
- `store.taskCounts` 接 `counts.by_kind`。

- [ ] **Step 5: 组件适配**

| 组件 | 改动 |
| --- | --- |
| `StepsProgress.vue` | 吃新 `phase_groups`（形状不变，文案与状态来源变） |
| `WorkflowThumbnail.vue` | 同上；`getWorkflowThumbMeta` 的 5 色循环 → 按 kind 分组数循环 |
| `TaskCardItem.vue` | `workflowShortName` → kind 标签（`KIND_ABBR`） |
| `ChangeDetailDrawer.vue` | `task.currentGroup` → `phase_group` |
| `PhaseBadge.vue` | 阶段徽章由 kind 阶段表驱动 |
| `StageActionNav.vue` / `ReviewPhaseNav.vue` | 去掉操作能力（D10）；若去掉后无剩余职责则删除 |
| `TaskDetail.vue` | Tab 由 kind 阶段分组驱动，不再用四件套 |
| `PrimarySidebar.vue` | 「规格」→「配置」（D9） |
| `CheckPage.vue` | 接新 `/api/check`（`status` 三值不变，`doctor` 的条目直接显示） |
| `TasksPage.vue` / `HomePage.vue` | kind 过滤 / 统计字段 |

- [ ] **Step 6: 端到端（必须有真数据）**

现成样本不足（事实 #10），手工造 fixture：在 `test-project/prdtesting` 里写入 5 类 kind 各 1 个任务（`workflow.yaml` 各数组 + 对应 `state.yaml`，phase 分别取一个中间值），并造一个 `state.yaml` 缺失的任务：

```bash
node bin/polaris.js dashboard /Users/weiliu/Documents/work/projects/polaris/test-project/prdtesting --port 3700
```

逐条核对 §九 判据。**验收后把这个 fixture 清理掉**（它是临时验证材料，不是交付物）。

- [ ] **Step 7: 样式零污染检查**

```bash
git diff --stat dashboard/
git diff --check dashboard/          # 无空白错误
```

人工看 diff：应只含语义改动，**不得**出现整文件重排（行尾分号、缩进）—— 那是 pre-commit 误伤的信号。

---

### Task 6: 死代码清理

**Files:**
- Modify/Delete: `dashboard/src/components/**`、`dashboard/src/utils/**`

- [ ] **Step 1: 前端逐个确认后删**

判据只有一条：`grep -rn <符号> dashboard/src/` 无引用。候选（Task 5 之后复核）：`TasksFilePanel.vue`、`ValidationPanel.vue`、`SpecContentPanel.vue`、`TasksKanbanPreview.vue`、`ChangeFileListItem.vue`、`ViewModeToggle.vue`、`ProjectTabPicker.vue`、`parseTaskMarkdown.js`、`MiniProgress.vue`、`BottomStatusBar.vue`。

**注意**：这是**删无主代码**，不是"重写前端"。删之前逐个人工确认；有引用的一律保留并按 Task 5 适配。

- [ ] **Step 2: 后端残留复核**

```bash
grep -rnE "openspec/changes|getChangePhase|stepStatuses|artifactStatuses" src/dashboard/   # 预期：仅剩 scan/ 里对 openspec/changes/<id>/ 的文件树读取
pnpm build
```

---

### Task 7: 契约定稿 + CHANGELOG + 验收

**Files:**
- Modify: `docs/specs/2026-09-18-dashboard-api-contract.md`、`CHANGELOG.md`

- [ ] **Step 1: 契约文档定稿**

- 头部状态：`M1 定形` → `M2 定稿（实现即此文档）`。
- §二 换成 M2 实际路由（含查询参数与响应形状，逐条来自 Task 3 表）。
- §三 的「M2 目标形状」改为「已实现形状」，补 §三 字段表的 `title` / `phase_group` / `phase_index` / `tasks_done` / `updated_at` / `archived_at` / `task_path` / `artifacts` / `files` 字段定义。
- §四 追加 M2 新删的端点（含 `steps/:stepId/operations`）。
- §五 注明：枚举的守卫是 `test/ts/task-kind-phases.test.ts`；并**记录** debug 的 `debug-state.example.yaml` 仍是 3 阶段、`workflow-template.yaml` 注释仍是陈旧枚举（D7），面板对未知 phase 兜底。
- 新增「§七 契约测试」：指出哪几个测试文件承担契约守卫。

- [ ] **Step 2: CHANGELOG 追加到现有 `0.1.1`**

`### Changed`：Dashboard 数据源切换到 `.polaris/workflow.yaml` + `state.yaml`；5 类 kind 全部可见；`/api/changes*` → `/api/tasks*`、`check-openspec` → `check-initialized`；`/api/workflow*` 改由 `src/core/` 阶段表驱动（删除 `config/tasks.yaml` 依赖）；`/api/check` 接 `doctor`；配置面板改用 `.polaris/*.yaml`。
`### Removed`：`change-scanner.ts`（按文件存在性反推 phase）、`markdown.ts`（无引用）、`/api/workflow/:kind/steps/:stepId/operations`。

- [ ] **Step 3: 全量自检（零新增）**

```bash
pnpm format:check && pnpm lint && pnpm build && pnpm test
```

对照基线：lint error 13、format 不合格 14、测试 6 failed | 33 passed —— **数字不得变差**。

- [ ] **Step 4: 提交**

建议 2–3 个提交（真相层+扫描层 / 端点重写 / 前端+定稿），每个提交后本仓均可构建、测试不退化。

---

## 九、M2 完成判据（对齐设计 §六 M2 验收）

1. **5 类 kind 全部可见**：任务列表可按 kind 切换，空 kind 显示空态而非报错或空白。
2. **phase 显示与 `state.yaml` 一致**：Task 2 的"文件存在但 phase 不同"反例测试守护。
3. **三模式与 debug 族正确渲染**：`state.yaml.workflow.mode` 的 `tweak`/`normal`/`sdd` 都能显示（不当未知）；debug 6 阶段正确；bugfix 通道不显示 `prove`。
4. **配置面板显示 `.polaris/config.yaml`**（`/api/configs` 换源生效）。
5. **检测页接 `doctor`**：旧的 `polaris.meta.yaml` / `openspec/polaris.yaml` 条目消失，出现 `doctor` 的实际检查项。
6. **`dashboard/` 零文件被 prettier 触碰**，`pnpm format:check` / `pnpm lint` 范围与行为与改造前一致，零 ignore 例外。
7. **无 `/api/changes*` 残留**：后端路由、前端调用、契约文档三处一致（`grep` 三处皆空）。
8. **未知值不崩**：手工把某任务**游标里的 `phase`** 改成 `nonsense`，面板显示原值并标注，不抛错。

## 十、后续（不在本计划内）

- **phase 真相归一**（独立里程碑，见 `docs/specs/2026-09-19-phase-truth-unification-design.md`）：单一枚举 + 游标语义统一 + 原语白名单校验 + 文档不再自持枚举。该设计还查出 `state-next` 的 prototype / debug 两张转移表**偏移一位**（会跳阶段），其 D13 待决。与 M2 解耦，可独立提交与回退。
- **M3 写操作与多项目**：§5.2 的原语映射（勾选任务 / 推进阶段 / `tasks-lint` / `ship-cleanup`）；多项目注册表落点（D4）；`/api/reveal` 白名单收紧。
- **M4 收敛与退役**：`test/ts/dashboard.test.ts`（路由 / 静态托管 / 项目解析 / 锁行为）；README 补齐 `dashboard` 用法；`npm pack` 解包终检；两源仓确认可归档。
- **本计划外但已登记**：debug 族模板与技能目录的阶段对齐（D7）；`workflow-template.yaml` 陈旧枚举注释（§二）；`CHANGELOG.md` 的 0.1.1 条目下有两个 `### Tests` 段。

---

## 十一、执行记录（2026-09-19 完成）

**状态：Task 1–7 全部完成**，共 8 笔提交（含前置的决策与设计）。计划内的 Step 未逐条勾选 —— 实现过程中有几处**偏离**，逐条记录如下，避免「勾了但没做」的假账。

| 提交 | 内容 |
| --- | --- |
| `6d31fd3` | docs：debug 三阶段订正 + 本计划 |
| `005dd31` | feat(core)：阶段表 / 产物表 + debug `initialPhase` 修正 + 26 项护栏（Task 1） |
| `c3bed3e` | feat(dashboard)：`scan/` 三个扫描器 + 21 项单测（Task 2） |
| `0994ea0` | feat(dashboard)：端点重写、旧模型退役（Task 3） |
| `e248ffa` | feat(dashboard-web)：前端对齐（Task 4 + 5 合并为一个提交） |
| `8772d03` | chore(dashboard-web)：死代码清理（Task 6） |
| `a214875` | docs：契约定稿 + CHANGELOG（Task 7） |

### 与计划的偏离（均已落到代码/文档）

1. **Task 4 与 Task 5 合并为一个提交**。理由：改 API 函数名会立刻打断调用方，分两个提交会让中间态的前端无法构建（`vite build` 会报未导出）。计划里把「改名」与「渲染改造」分列，是我低估了耦合。
2. **前端适配改为「映射层收敛」而非逐组件改**。Task 5 原列了 12 个组件/视图要改；实际做法是让 `changeMapper.js` 把新字段映射回**组件既有的数据结构**，组件级改动只剩「调用已删 API」与导航改名。理由：组件渲染契约不必跟着数据源换血，改动面越小漂移面越小。副作用：`STAGE_NAV_ITEMS` / `STAGE_TO_TAB` / `DETAIL_TABS` 三个常量改成函数（`buildStageNavItems` / `resolveStageTab`）。
3. **`readTaskRuntime` 增加入参而非自查**（Task 2 Step 2）：`phase` 由调用方从游标传入。计划原本写「由 `scan/tasks.ts` 传入或在此回查」，实现时定为必传 —— 回查会让「谁是权威」在模块内重新模糊。
4. **`scanTaskList` / `scanArchivedTasks` 为 async**（计划写的是同步签名）：`loadWorkflowState` 是 `fs/promises` 实现，同步签名做不到，除非自己重读一遍 YAML（那正是要避免的重复路径逻辑）。
5. **归档扫描改为「目录为主、INDEX.md 只为日期」**。计划写「解析 INDEX.md 的每行 + 目录」；实现时反过来：以 `docs/troubleshooting/<id>/` 目录为准（它才是产物），`INDEX.md` 只用来取日期 —— 否则索引文件一旦缺行就会漏任务。
6. **另加两处计划外但必要的改动**：`getConfig` 补越界防护（`../` 与绝对路径拒绝）；`TaskItem` 增加 `kind_label` / `mode` / `channel`，并把「开发模式 / 通道」标签放进任务卡片（否则验收里「三模式与 debug 族能正确渲染」在界面上无从体现）。
7. **fixture 建在 `/tmp/m2-fixture`**（计划写建在 `test-project/prdtesting`）：后者是用户的真实项目，不该往里塞演示数据。fixture 覆盖 5 类 kind + 一个 `phase: nonsense` 的反例 + 双来源归档。
8. **Task 6 只删掉 2 个组件**（`MiniProgress` / `PhaseBadge`）。计划候选清单里其余组件（`TasksFilePanel` / `ValidationPanel` / `ReviewPanel` 等）经 grep 确认**仍被引用**，故保留。

### 实施期踩的两个坑（都吃了教训）

1. **用跨行正则删函数，把中间内容一起吃掉**。`/**…*/` 的非贪婪匹配会从更早的注释开始，删 `workflowMeta` 时连带删掉了 `assignGlobalStepNumbers` 等；`vite build` 报「is not exported」才发现。改为按索引定位（向上只吃紧邻注释块、向下取首个 `\n}\n`）重做，并用导出清单复核。
2. **BSD grep 的 `\|` 与 `\b` 都不可靠**，在两条「核对」脚本里各产生一次假结果（假阴性：明明在位却报缺失）。核对类脚本一律用 `grep -E` 且不用 `\b`。

### 验收结果（对齐 §九 完成判据）

| # | 判据 | 结果 |
| --- | --- | --- |
| 1 | 5 类 kind 全部可见 | ✅ fixture 实测 6 个活跃任务覆盖 5 类，`counts.by_kind` 五项齐全 |
| 2 | phase 与游标一致 | ✅ 单测反例守护（`state.yaml.phase=specify` + 游标 `build` → 返回 `build`） |
| 3 | 三模式与 debug 族正确渲染 | ✅ `mode` 原文返回、展示层把 `sdd` 与 `normal` 归一；卡片显示模式与通道标签；debug 三阶段步骤条正确 |
| 4 | 配置面板显示 `.polaris/config.yaml` | ✅ `/api/configs` 返回 `config.yaml` + `workflow.yaml` |
| 5 | 检测页接 `doctor` | ✅ 返回 node/bash/git/openspec/skills-lock/polaris-skills 六项，旧的失实路径条目消失 |
| 6 | `dashboard/` 零 prettier 触碰、范围不变 | ✅ `prettier --check src/` 仍 14 个既有不合格（与改造前同数）；`eslint src/` 13 errors（同基线） |
| 7 | 无 `/api/changes*` 残留 | ✅ 后端路由（6 个已删端点全部 404）、前端调用、契约文档三处一致 |
| 8 | 未知值不崩 | ✅ `phase: nonsense` 实测返回 `phase_known: false` 且不抛错；单测另有覆盖 |

**测试与基线对照**：`6 failed | 35 passed（41 文件）`，失败集合与改造前**同一批 6 个文件**（agents-install / command-adapters / file-system / openspec / session-start-sh.integration / task-state），零新增失败。
