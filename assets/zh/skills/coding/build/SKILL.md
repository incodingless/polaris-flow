---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}build
description: "按已评审的实施计划 tasks.md 完成编码实现。当用户要求按计划写代码、实施某个 change、开始编码时使用。不要用于：改需求（走 specify）、改计划（走 tasks）、验收与测试（走 verify）。"
---

# Polaris 工作流 - 阶段：构建（build）

<HARD-GATE>
本 skill **仅**负责：在**本档的规划阶段已完成**的前提下（`tweak` 档 = `tasks` 已完成；`normal` / `strict` 档 = `plan` 已完成），按 `openspec/changes/<task_id>/tasks.md` 调用 `/opsx:apply` 完成实现，并做出口校验与阶段推进。

- **禁止**在 Step 3（能力结论 / 可选 `subagent-probe`，且仅当 `build_mode=subagent_dispatch`）完成之前调用 `/opsx:apply`
- **禁止**跳过 Constitution 注入点 C（subagent 启动 prompt 必须含 C；inline 时由主代理按 task 输出 C）
- **禁止**主代理在 `/opsx:apply` 之外直接编写业务实现代码（补丁、新模块、改 API 等）
- **禁止**调用 superpowers 的两个派发驱动器（H13，规则见 `./policies/hard-stops.md`）
- **禁止**未完成出口校验（Step 6）就写 `runtime.build.status: completed` 或把 `phase` 推到 verify
- **禁止**本阶段强制 `git commit`（提交策略交 ship；apply 过程产生的未提交改动保留在工作区 / worktree）
- **禁止**重写 `proposal.md` / 高层 `design.md` / `detailed-design.md` / 覆写整份 `tasks.md` 范围；发现计划缺陷 → pause 回 plan，不在 build 静默改 Scope
- **禁止**用全局开关覆盖 tasks.md 内已有的 `<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->` 标注（要改标注回 plan）
- **H8**（状态行输出）：每个 Step 入口输出`[polaris-flow 开发]构建：进入 build Step <N>: <动作>` 等可见状态行
**允许的例外**：`build_mode=inline`，或 probe 返回 `degradation=inline|unsupported` 时，主代理**可以**在本会话执行 `/opsx:apply`（仍须注入点 C，仍禁止在 apply 之外手写实现）。
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]构建 - 进入阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}build 技能。`

## 标识约定

| 项 | 路径 / 值 |
|----|-----------|
| `task_id` | 与 specify / plan / design / tasks 同值 |
| 实施计划（唯一） | `openspec/changes/<task_id>/tasks.md` |
| 评审报告（`tasks-review-agent` 写入） | `openspec/changes/<task_id>/reviews/tasks-review-report.md` |
| 深度设计（只读，`runtime.design.status=skipped` 时不存在） | `openspec/changes/<task_id>/detailed-design.md` |
| 业务档案 | `.polaris/tasks/<task_id>/state.yaml` |
| workflow 游标 | `.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.mjs`） |
| 批次游标（仅 `subagent_dispatch` 且 `batch_dispatch=true` 时） | `state.yaml` 的 `runtime.build.current_batch`（写入走 `task-state-entry.mjs`） |
| implementer prompt 模板 | `./assets/implementer-prompt.md` |

> **链路**：`specify → plan → (design 可选) → tasks → **build** → verify → ship`。  
> 本阶段不写计划、不审设计；只执行已评审的 `tasks.md`。  
> 若本阶段落盘代码评审报告，写入 `openspec/changes/<task_id>/reviews/code-review-report.md`（无流程则不强造）。

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：设置产物语言

**执行**：`LANG=$(node "$PLUGIN_ROOT/scripts/get-language-name.mjs")`（输出语言显示名，如 `中文` / `English`）；退出码 `≠ 0` 时回退到当前用户请求语言。

本技能所有提问与产出物均采用 `$LANG`。

### Step 1：接收 `intake` 交接

**前置**：根据交接中是否存在 `task_id`（由 `intake` 的 Step 4 给出；阶段出口的自动衔接同样会带），做以下操作：

| 情形 | 动作 |
| ---- | ---- |
| 有 | **采纳**；`worktree_path` 一并取（空 = 主仓；非空 ⇒ 后续读产物 / 跑命令一律以该 worktree 为仓库根）。中断续跑时按文末「上下文压缩恢复」表定位断点 |
| 没有 | **阻断**：告知「本技能须经 `intake` 进入，请从入口技能（`tweak` / `normal` / `strict`）重新开始」。|

> 续跑：入口校验通过后**不得**重跑 Step 2 的模式询问原样 —— `runtime.build.build_mode` /
> `runtime.build.batch_dispatch` / `runtime.build.review_mode` 已存在时，**`normal` / `strict` 档**展示当前值并问是否沿用；**`tweak` 档直接沿用**（见 Step 2）。
> 若上次中断在 plan 中（`runtime.tasks.status=in_progress` / apply paused），从中断点续跑。

**入口校验**（失败 → 阻断）：

| 检查 | 条件 |
|------|------|
| plan 已完成 | `state.yaml` 中 `runtime.tasks.status=completed`（或用户明示接受续跑且 `tasks.md` 已是可执行细计划） |
| tasks 可执行 | `openspec/changes/<task_id>/tasks.md` 非空，且含至少一个 `- [ ]` 或（续跑时）未完成项可定位 |
| 工作目录 | 若 `worktree_path` 非空 → 后续 apply / 读 tasks **以该 worktree 为仓库根**；否则用主仓 |

通过后更新 `state.yaml`：`phase: build`，`runtime.build.status: in_progress`。

```bash
node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" enter-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase build
```
输出：`[polaris-flow 开发]构建: task_id=<task_id> ; worktree=<path|main>`

### Step 2：选择执行方式与审查模式

**先按 `workflow.mode` 分派**（本技能是**档位消费者**，只读不覆盖）：

| 档 | 本步行为 |
|---|---|
| 🔻 **`tweak`** | **不询问** ⇒ 直接取 **`build_mode=inline`** + **`review_mode=standard`**，按 2.1 / 2.2 的脚本写入 `runtime.build.build_mode` + `runtime.build.review_mode` 后进 Step 3。**不要**发起 decision-point 询问（"只是选个强度/模式"的询问一律改由档位派生） |
| **`normal` / `strict`** | 按下方 2.1 / 2.2 询问 |

`normal` / `strict`：**一次性**按 `./policies/decision-point.md` 询问两项（可同一轮多问；若 `build_mode=subagent_dispatch` 则加问 2.3，共三项）。推荐规则**只能说明，不能代选**。

> **判断口径（本步 2.1 / 2.3 的阈值通用）**：`未完成顶层任务数` = tasks.md 中**实施任务组**（除最后一组 Documentation Sync 外）里尚未勾选 `[ ]` 的**顶层任务 `N.M`** 条数。不计子步骤（`N.M.k`）、不计组标题（`## N.`）、**不计 Documentation Sync 组**（收尾文档同步，不参与派发 / 分批决策）。

> **续跑（`tweak` 档）**：`runtime.build.build_mode` / `review_mode` 已存在则沿用；缺则按上表补写，**不询问**。

#### 2.1 执行方式 `build_mode`

| 选项 | 值 | 含义 |
|------|-----|------|
| **A**（推荐多数情况） | `subagent_dispatch` | 主代理只编排；按 tasks.md 批次逐批派发实现子代理中跑 `/opsx:apply`（见 Step 4） |
| **B** | `inline` | 主代理在本会话执行 `/opsx:apply`（仍须注入点 C） |

**推荐规则**（附在选项旁）：

- 未完成顶层任务数 ≥ 3 → 推荐 **A**
- 未完成顶层任务数 ≤ 2 且无跨模块依赖 → 推荐 **B**
- hotfix / 极小改动路径 → 推荐 **B**

写入（走脚本，**禁止**直接编辑 `state.yaml`）：

```bash
node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.build.build_mode=<subagent_dispatch|inline> \
  --set workflow.build_mode=<同 build_mode 值>
```

- ⚠️ `workflow.build_mode` = 全局决策记录（与 `runtime.build.build_mode` 单向同步，**只写不读**）。

#### 2.2 代码审查模式 `review_mode`

| 选项 | 含义 | 适用 |
|------|------|------|
| `off` | Step 5 不自动做代码审查 | 文档、配置、文案、低风险小改 |
| `standard`（默认推荐） | apply 全部完成后做**一次**轻量最终审查（正确性 / 安全 / 边界） | 大多数普通改动 |
| `thorough` | apply 全部完成后做**一次**完整最终审查（覆盖面更宽：含与 tasks/spec 一致性关注点） | 高风险、多模块、架构或安全相关 |

写入（走脚本；与 2.1 可合并为同一条 `set`）：

```bash
node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.build.review_mode=<off|standard|thorough>
```

#### 2.3 是否分批派发 `batch_dispatch`（仅 `build_mode=subagent_dispatch` 时询问）

| 选项 | 值 | 含义 |
|------|-----|------|
| **否**（默认推荐） | `false` | 单批派发：一个 subagent 一次跑完整份 tasks.md（任务少时更省协调开销） |
| **是** | `true` | 分批派发：按 tasks.md 的 `## N.` 批次逐批派发 subagent，每批一个（任务多、防单个 subagent 上下文溢出时） |

**推荐规则**（附在选项旁）：

- 未完成顶层任务数 ≥ 8 → 推荐**是**
- 未完成顶层任务数 < 8 → 推荐**否**

写入（走脚本；与 2.1 / 2.2 可合并为同一条 `set`）：

```bash
node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.build.batch_dispatch=<true|false>
```

> `build_mode=inline` 时不询问、不写此字段（inline 不涉及分批）。  
> 续跑时 `runtime.build.batch_dispatch` 已存在则沿用，缺则按推荐补写（仅 `subagent_dispatch` 时）。

> **全局 `tdd_mode` 仅作决策记录**：tasks Step 3 已把总策略写入 `workflow.tdd_mode`（单向同步，build **只写不读**）。每个 task 是否 TDD 仍由 plan 写在 `tasks.md` HTML 注释里；`/opsx:apply` / implementer 必须遵守注释，不得用 build 级开关覆盖。  
> **刻意不做**：apply 循环内的「每任务 reviewer」——与「implementer 唯一动作是 `/opsx:apply`」冲突；需要更密审查时选 `thorough`，或事后在 verify 再审。

若续跑且 `runtime.build.build_mode` / `runtime.build.batch_dispatch` / `runtime.build.review_mode` 已存在 → **`normal` / `strict` 档**展示当前值、问是否沿用（沿用则跳过写入）；**`tweak` 档直接沿用**（档位派生值，不询问）。

### Step 3：Subagent Probe（仅 `build_mode=subagent_dispatch`）

若 `build_mode=inline` → 输出 `[polaris-flow 开发]构建 - 第二步: 不派发（inline，不涉及 probe）`，直接进入 Step 4.B。

若 `build_mode=subagent_dispatch`：

1. 读 SessionStart 注入：`PLATFORM_DEGRADATION=inline|unsupported` → **强制**本会话 inline；输出原因；进入 Step 4.B（**不派发 → 不涉及 probe**）
2. `SUPPORTS_SUBAGENT=true`（degradation 空）→ **仍须 probe（H10）**，记 `dispatch=default`，进入派发
3. 若要从清单选 agent：优先读 `$SUBAGENT_PROBE_CACHE`；仅当**缺缓存/缺注入**或需 `task_type`/`subagent_id` 过滤时，才 `use_skill("polaris{{SKN_SPR}}subagent-probe")`（传入 `platform` / `PLATFORM_ID`；probe 优先读缓存）
4. 按能力结论或 `subagent-probe` 返回结构消费（`platform_degradation` + `agents`）：

| 结论来源 | 动作 |
|---------------|------|
| `platform_degradation=null` 且 `agents` 非空（缓存或 probe） | 从 `agents` 选一项：路径型 → 记 `dispatch=path` + `subagent_path`；builtin → 记 `dispatch=builtin` + `subagent_type=id`。多项时按 decision-point 让用户选，或取第一项并告知用户 |
| `platform_degradation=null` 且 `agents=[]` | 记 `dispatch=default`（宿主默认 subagent，不绑 path） |
| `platform_degradation=inline` / `unsupported` | **强制**改为本会话 inline 执行 apply；输出原因；进入 Step 4.B（不违反 HARD-GATE 例外） |

禁止在缺能力结论时假设宿主有某 agent。禁止回退到 superpowers 派发驱动器。

### Step 4：执行 `/opsx:apply`

**按 `build_mode` 分派**：

- `build_mode=inline` → 进 4.B（inline 单次）。
- `build_mode=subagent_dispatch` → 进 4.A；4.A 内按 `runtime.build.batch_dispatch` 决定单批还是逐批派发。

#### 4.A — `subagent_dispatch`（派 subagent 执行）

读 `state.yaml` 的 `runtime.build.batch_dispatch`（缺省 / 空 = `false`）：

| `batch_dispatch` | 行为 |
|---|---|
| `false`（单批派发） | 进 4.A.1：一个 subagent 一次跑完整份 tasks.md |
| `true`（分批派发） | 进 4.A.2：按 `## N.` 批次逐批派发 |

派发方式统一复用 Step 3 的 `dispatch` 结论：`dispatch=path` → `subagent_path`；`dispatch=builtin` → `subagent_type=id`；`dispatch=default` → 不绑 path。

##### 4.A.1 单批派发（`batch_dispatch=false`）

1. **组装一次 implementer prompt**（先 `read_file "./assets/implementer-prompt.md"`，用「实施范围」块的**单批派发**行，删去分批派发行）：
   - `<task_id 或省略>` → Step 1 的 `task_id`（方括号命令写成 `/opsx:apply <task_id>`）
   - 末尾追加（若模板未含）：

   ```text
   Change: <task_id>
   Tasks: openspec/changes/<task_id>/tasks.md
   单批派发: 实施 tasks.md 全部任务（含 Documentation Sync）
   TDD: 严格遵守 tasks.md 内每个 task 的 <!-- TDD 任务 --> / <!-- 非 TDD 任务 -->；禁止全局跳过 RED。
   Review mode (final, by parent): <off|standard|thorough> — 你不必在 apply 循环内派发 reviewer。
   Working directory: <worktree_path 或 main repo root>
   ```

2. **派发一个 fresh subagent**（复用 Step 3 的 `dispatch` 结论），`prompt` = 组装结果。运行期间**不得干预**，只收最终汇报。
3. 收汇报后**不写** `current_batch`，直接进 Step 5。

##### 4.A.2 逐批循环（`batch_dispatch=true`）

**解析批次**：读 `tasks.md`，识别 `## N.` 组标题 → 批次序列 `1..K`（K = 组数；最后一组是 Documentation Sync）。批次号 N = 组标题序号，与 tasks 阶段「执行批次」一一对应。

**确定起点**：读 `state.yaml` 的 `runtime.build.current_batch`（不存在 / 空 = 从 1；续跑从该值继续）。

从 `current_batch` 到 K，按批号顺序，对每批 N：

1. **组装本批专属 implementer prompt**（先 `read_file "./assets/implementer-prompt.md"`，用「实施范围」块的**分批派发**行）：
   - `<task_id 或省略>` → Step 1 的 `task_id`（方括号命令写成 `/opsx:apply <task_id>`）
   - `<批次号>` → N
   - `<本批编号范围>` → `N.1 ~ N.M`（本组全部顶层任务编号）
   - `<上游 Consumes 摘要>` → 本批任务 `Interfaces.Consumes` 汇总（上游批次已 Produces 的符号 / 路径，写全签名，让 subagent 无需重读上游实现）
   - 末尾追加（若模板未含）：

   ```text
   Change: <task_id>
   Tasks: openspec/changes/<task_id>/tasks.md
   本批: ## N（编号 N.1 ~ N.M）
   TDD: 严格遵守 tasks.md 内每个 task 的 <!-- TDD 任务 --> / <!-- 非 TDD 任务 -->；禁止全局跳过 RED。
   Review mode (final, by parent): <off|standard|thorough> — 你不必在 apply 循环内派发 reviewer。
   Working directory: <worktree_path 或 main repo root>
   ```

2. **派发一个 fresh subagent**（复用 Step 3 的 `dispatch` 结论），`prompt` = 组装结果。运行期间**不得干预**，只收最终汇报。

3. **本批出口强校验**（主代理；方案 D3 命门，自律不可靠）：
   - 本批 `N.1 ~ N.M` 全部已勾选？
   - 无越界：未勾选 `> N.M` 的后续批次任务；未改动本批 Files 之外的文件？
   - 越界 → **阻断**：列出越界项，纠正（撤销越界勾选 / 回退越界改动）后再继续；不静默吞掉。

4. 落盘批次游标（走脚本，**禁止**直接编辑 `state.yaml`）：

   ```bash
   node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" set \
     --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
     --set runtime.build.current_batch=<N+1>
   ```

5. 下一批。

全部批次完成（含 Documentation Sync 勾选）→ 进 Step 5。

#### 4.B — inline（用户选 B，或 probe 退化）

主代理在本会话**一次**执行整份 apply（任务数 ≤ 2，不涉及分批、不写 `current_batch`）：

1. 执行 apply **前**输出本次 build 适用的 Constitution 原则清单（一行摘要即可）
2. 调用 `/opsx:apply <task_id>`
3. 每开始一个 task 前输出：`[Constitution C] Task <N.M>: 适用原则 = ...`
4. **禁止**在 apply 流程外另写业务实现

#### apply 中途 pause / error

- **paused**：按 apply 给出的原因与选项，用 decision-point 问用户，并用脚本把**原因与可选项**写入 `runtime.build.pause_reason`（恢复清单据此重载；恢复后置空）；用户选继续 → 同模式再次 `/opsx:apply`（不要重跑 Step 2，除非用户要求改模式）

  ```bash
  node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" set \
    --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
    --set "runtime.build.pause_reason=<原因与可选项摘要>"
  ```

  恢复后置空：`--set "runtime.build.pause_reason="`
- **errored**：阻断，报告错误；不写 `runtime.build.status=completed`

### Step 5：最终代码审查（按 `review_mode`）

仅当 Step 4 全部批次完成（`subagent_dispatch`）或 apply 正常结束（`inline`）后执行：

| `review_mode` | 动作 |
|---------------|------|
| `off` | 跳过；由 Step 6 的脚本写 `runtime.build.final_review=skipped:off` |
| `standard` | 加载 Superpowers `requesting-code-review`，范围：本次 diff + `tasks.md` + 必要测试结果；只查正确性 / 安全 / 边界 |
| `thorough` | 同上，并额外要求对照 `tasks.md` 与相关 specs 做覆盖与一致性关注（仍是一次最终审查，不是每任务审查） |

- 审查发现 **Critical / Major** → **阻断**完成；decision-point：A 回 Step 4 修复 / B 用户接受风险并记录 override（须显式确认） / C 放弃
  - B 选项落盘（走脚本）：`--set runtime.build.override=<被跳过项>_user_approved`（如 `skip_runtime_verification_user_approved`）
- `requesting-code-review` 不可用 → 标注跳过原因，decision-point：A 接受跳过 / B 阻断

> 与 verify 去重：本步已审过且未再改动的 diff，verify 侧应聚焦「是否符合 spec/tasks」与「build 之后新增改动」，避免整份重审。

### Step 6：出口校验 + 推进阶段

校验（全部通过才能完成）：

1. `tasks.md` 中**不存在** `- [ ]`（任意未勾选 → 未完成）；`subagent_dispatch` 时在**全部批次结束**后统一校验，不是每批后
2. apply 完成：`subagent_dispatch` 时**每个批次**的 subagent 均汇报 `status=completed`、各批完成数合计 = 总任务数、且**无越界**（未勾选本批编号之外的任务）；`inline` 时 apply 输出含 `Implementation Complete` 类摘要
3. 未违反 HARD-GATE（未在 apply 外手写实现；`subagent_dispatch` 时已做过 probe，除非已退化 inline）
4. Step 5 已处理（执行完毕 / 合法跳过 / 用户已确认接受风险）

**硬阻断**：

- 校验 1 失败 → `[polaris-flow 开发]构建 - 阻断：tasks.md 存在未完成任务，禁止标记 build 完成。` + 列出未完成编号；等待用户（继续实施 / 手动勾选并说明理由 / 放弃）
- 校验 2 失败（paused/errored）→ 呈现原因与可选项，等待用户
- 校验 3 失败 → 流程失败，不推进 phase
- 校验 4 失败 → 不推进 phase

**全部通过**（走脚本落盘；**禁止**直接编辑 `state.yaml`）：

| 落盘字段 | 值 | 产出方 |
|---|---|---|
| `runtime.build.status` | `completed` | 下方 `complete-phase` |
| `runtime.build.finished_at` | ISO 时间戳 | 下方 `complete-phase` |
| 顶层 `phase` | `verify` | 下方 `complete-phase --next-phase` |
| `runtime.build.build_mode` | `<subagent_dispatch\|inline>` | 下方 `set` |
| `runtime.build.batch_dispatch` | `<true\|false>`（保留选择值） | 下方 `set` |
| `runtime.build.review_mode` | `<off\|standard\|thorough>` | 下方 `set` |
| `runtime.build.final_review` | `<done\|skipped:off\|skipped:<reason>\|accepted_risk>` | 下方 `set` |
| `runtime.build.completed_tasks` | `<N>` | 下方 `set` |
| `runtime.build.total_tasks` | `<N>` | 下方 `set` |
| `runtime.build.pause_reason` | 空（本轮暂停已解决） | 下方 `set` |
| `runtime.build.current_batch` | 空（全部分批结束，清空游标；inline 或单批派发无此字段） | 下方 `set` |

```bash
node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase build --next-phase verify

node "$PLUGIN_ROOT/scripts/task-state-entry.mjs" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.build.build_mode=<subagent_dispatch|inline> \
  --set runtime.build.batch_dispatch=<true|false> \
  --set runtime.build.review_mode=<off|standard|thorough> \
  --set "runtime.build.final_review=<done|skipped:off|skipped:<reason>|accepted_risk>" \
  --set runtime.build.completed_tasks=<N> \
  --set runtime.build.total_tasks=<N> \
  --set "runtime.build.pause_reason=" \
  --set "runtime.build.current_batch="
```

- ⚠️ `final_review` **只能**取上表四值之一：`done` / `skipped:off` / `skipped:<reason>` / `accepted_risk`；**禁止自由文本**（修复轮次、F× 明细等过程信息写 verify 报告或输出话术，不进 state）。

输出：

```
构建阶段完成：
  task_id : <task_id>
  tasks.md  : openspec/changes/<task_id>/tasks.md（全部 [x]）
  review    : <final_review 值>
```

输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**，`NEXT` 取 manual/auto 对应一套）。
先按「自动衔接下一阶段」一节运行 `state next`，`<SKILL>` 与 `<mode>` 均取自其输出，**不得写死**。
本技能填写的状态行与「恢复」行（「下一步」「操作」两行以模板为准，不在此复制）：

```text
[polaris-flow 开发]构建 - 阶段完成，状态已落盘。
恢复：先读 openspec/changes/<task_id>/tasks.md 的勾选进度与 .polaris/tasks/<task_id>/state.yaml 的 runtime.build，再从下一步技能的 Step 0 开始。
```

## Constitution 注入点 C

- **subagent（4.A）**：约束已在启动 prompt 中；implementer 在**每个** task 实施前必须输出  
  `[Constitution C] Task <N.M>: 适用原则 = ...`
- **inline（4.B）**：主代理在 apply 前输出原则清单，并在每个 task 前补输同上格式
- 原则来源：`openspec/memory/constitution.md`（若项目约定路径不同，以仓库内 constitution 为准）
- **文件缺失/无效且用户批准继续** → 走脚本记 `--set runtime.build.constitution_exception=<原因>_user_approved_skip`（如 `constitution_md_missing_user_approved_skip`），注入点 C 降级为「按通用工程原则输出」

## 退出条件

- `tasks.md` 全部 checkbox 为 `- [x]`
- apply 已 completed（`subagent_dispatch` 时 = 全部批次 completed；非 pause/error 未解决）
- `runtime.build.status=completed`，且 `phase=verify`
- Step 5 审查已按 `review_mode` 处理完毕

## 上下文压缩恢复

重载：`task_id`、`worktree_path`、`runtime.build.build_mode` / `runtime.build.batch_dispatch` / `runtime.build.review_mode`、`runtime.build.current_batch`（分批游标，空=从头或已全批结束）、当前 `tasks.md` 勾选进度、apply 上次 pause 原因（若有）、本 skill 停在哪一步。  
- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 apply pause → 从 Step 4 续，勿重选模式（除非用户要求）  
- 停在 Step 5 审查未完成 → 从 Step 5 续  
- 勿重新跑 plan / 勿调用 `writing-plans`
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```