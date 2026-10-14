# 技能配置文件读写合规审计

> **范围**：`assets/zh/skills/`（34 技能）、`assets/zh/policies/`（8）、`assets/zh/commands/`（13）
> **对象**：`.polaris/tasks/<id>/state.yaml`、`.polaris/workflow.yaml`、`.polaris/config.yaml`
> **问题**：① 未使用脚本、由 AI 直接操作的 ② 使用了脚本但脚本有问题的
> **日期**：2026-10-13（初版）／**2026-10-14 复核 —— 行号已漂移，请以文末「复核」节的当前行号为准**
> **证据口径**：coding 族逐处亲验；prd / testing / prototype / debug / policies / commands 由分族深读 + 抽样回验（每条附文件:行号）
>
> ⚠️ **本文正文的行号是 2026-10-13 09:44 的快照**。此后技能与 `src/` 均有改动（`build` 10-14 09:56、`design` 10-13 16:23、`plan` 16:22、`specify` 16:15、`verify`/`ship`/`tasks` 15:35），**正文行号大多失效**。当前行号与复核结论见文末。

---

## 一、审计口径（「正确途径」的定义）

| 文件 | 唯一正确脚本 | 支持的操作 |
|---|---|---|
| `state.yaml` | `scripts/task-state-entry.sh` | `get` / `get-json` / `set` / `enter-phase` / `complete-phase` / `set-identity` / `get-identity` / `set-checkbox` |
| `workflow.yaml` | `scripts/workflow-entry.sh` | `get-active-changes` / `append-active` / `update-active` / `rename-active` / `delete-active` |
| `config.yaml` **读** | `scripts/get-language-name.sh` | **仅 `language`**（底层 `polaris-flow config get language`） |
| `config.yaml` **写** | — | **无任何脚本** |

写 op 的价值（走脚本 vs AI 直写）：

- **持锁**：`task-state-<id>.lock`（state）/ `workflow.lock`（游标），防并发写者互相覆盖
- **写后校验**：写完回读确认（`task-state-entry.ts:610-618`、`workflow-entry.ts:439-457`）
- **phase 校验**：`enter-phase` / `complete-phase` 会校验 phase 是阶段表内的合法值（`phase-validation.ts`），非法值当场拦下并给出合法清单

---

## 二、结论速览

| # | 类别 | 计数 |
|---|---|---|
| **1** | **未使用脚本（AI 直接操作）** | |
| 1-A | `state.yaml` **写入**（无脚本调用） | **33 处** |
| 1-B | `config.yaml` **写入**（无脚本可用） | 1 处 |
| 1-C | `config.yaml` **读取**（脚本覆盖不全） | 12 处（6 处有脚本未用 + 6 处无脚本可用） |
| 1-D | `state.yaml` **读取**（自然语言，未走 `get`） | 大量（各技能入口校验 / 重载段） |
| **2** | **脚本自身问题** | **6 条**（其中 1 条功能性） |

---

## 三、类型 1：未使用脚本（AI 直接操作）

### 1-A 🔴 `state.yaml` 写入无脚本调用（33 处）

**判据**：技能只给 ```yaml``` 块或一句「写入/更新 `state.yaml`：<字段>」，**没有** `task-state-entry.sh set/enter-phase/complete-phase` 命令。执行者（AI）只能直接编辑 `state.yaml` —— **绕过锁、写后校验、phase 校验三者全部**。

| 技能 | 行号 | 写入内容 |
|---|---|---|
| **coding/ship** | `:181-197` | `runtime.ship.*`（9 字段）+ `worktree.status` + `phase: ship` —— **纯 yaml 块，ship 全程无 `task-state-entry` 调用** |
| coding/ship | `:218` 起 | Step 4.5 写状态（同上，无脚本） |
| coding/tasks | `:146-152` | `runtime.tasks.tdd_policy`（Step 2 TDD 策略） |
| coding/build | `:111` | `runtime.build.build_mode` |
| coding/build | `:121` | `runtime.build.review_mode` |
| coding/build | `:187` | `runtime.build.pause_reason` |
| coding/verify | `:265` | `runtime.verify.constitution_valid` |
| coding/verify | `:420` | `runtime.verify.overall_score` / `scorer_results` |
| coding/verify | `:434` | `runtime.verify.score_level` |
| coding/plan | `:92-96` | `worktree.*` 四字段 + `phase: plan` |
| coding/plan | `:104-106` | `runtime.plan.worktree_decision` |
| coding/plan | `:112-116` | `worktree.*` + `phase: plan`（选 B 留主仓） |
| coding/plan | `:230` | `artifact_review_mode` |
| coding/plan | `:232` | （同段同步写入） |
| coding/plan | `:243` | apply 结果字段 |
| coding/plan | `:260` | intention 路径字段 |
| coding/plan | `:323` | 主审报告落盘字段 |
| coding/tweak | `:288-294` | `worktree.created_by_polaris_flow` + `phase: plan` |
| coding/tweak | `:306-316` | `worktree.*` 五字段 + `phase: plan` |
| coding/normal | `:259` | `worktree.created_by_polaris_flow` + `phase: plan` |
| coding/normal | `:279` | `worktree.*` 五字段 + `phase: plan` |
| prd/discovery | `:279` | `req_name_cn` / `req_prefix` / `status` 回填 |
| prd/draft | `:93` | `draft.gate` |
| prd/refine | `:112` | 回写（与 Baseline 元数据区） |
| prd/refine | `:176` | `refine.gen_mode` |
| prd/ship | `:57` | 补写 `req_name_cn` |
| prd/ship | `:85` | `ship.readiness` / `ship.readiness_verdict` / `ship.readiness_waive_count` |
| prd/ship | `:115` | `ship.readiness` / `ship.readiness_verdict` |
| prd/ship | `:131` | `ship.risk_acceptance` |
| prd/readiness | `:71` | `ship.readiness_waive_count` 计数 |
| testing/draft | `:78` | `draft.gate`（yaml 块，无脚本） |
| prototype/build | `:16` | `work_dir`（用户指定输出目录时） |
| prototype/build | `:186` | `work_dir`（用户指定文件名时）—— **build 全程只有 `enter-phase`，无 `set-identity --work-dir`** |

> **最严重**：`coding/ship` —— 链路终点，要写 11 个字段（含 `phase: ship`），全族唯一**完全无状态脚本**的技能。
> **次严重**：`prototype/build` —— 唯一「要求写 `work_dir` 却连 `set-identity` 都没有」的技能（`blueprint:148` 有 `set-identity --work-dir`，build 侧漏了）。

### 1-B 🔴 `config.yaml` 写入无脚本可用（1 处）

| 技能 | 行号 | 写入内容 |
|---|---|---|
| coding/verify | `:205` | `test.commands.<slot>` + `test.source: probed\|confirmed\|corrected` + `test.confirmed_at` |

技能明确写「**落盘**（`.polaris/config.yaml` 的 `test:` 段）」，而 `config get` **只支持 `language`**（`config.ts:53` 非 language 键直接 `exit 2`），**没有任何 config 写命令**。⇒ 只能 AI 直写 `config.yaml`，无锁、无校验、无归一化。

### 1-C 🟠 `config.yaml` 读取（脚本覆盖不全，12 处）

**（a）有 `get-language-name.sh` 可用却没用的（6 处）**

| 文件:行号 | 写法 | 备注 |
|---|---|---|
| coding/design | `:106` | `LANGUAGE="$(cat "$REPO_ROOT/.polaris/config.yaml" \| grep "language" \| awk -F'"' '{print $2}')"` —— **内联 bash 手解析**，全仓唯一如此 |
| coding/specify | `:31` | 自然语言「读取 `.polaris/config.yaml` 的 `language`」 |
| debug/diagnose | `:32` | 同上 |
| prototype/blueprint | `:35` | 同上 |
| testing/discovery | `:52` | 同上 |
| prd/discovery | `:70` | 同上 |

**（b）无脚本可用、只能自然语言读的（6 类）**

| 文件:行号 | 读取键 | 备注 |
|---|---|---|
| commands/flow.md | `:32` | `platform` | 命令层查表确定提问工具 |
| policies/ask-question-react.md | `:14`、`:129` | `platform` | 同上（注册表唯一源） |
| coding/verify | `:42`、`:205`、`:923` | `test.*` | 构建/测试执行配置 |
| coding/verify | `:262`、`tweak/normal` 的 `policies/exit-check.md:53` | `constitution_required` | 告警或阻断 |
| coding/verify | `:415`、exit-check.md:115 | `scorer.weights` | overall_score 加权 |
| coding/verify | `:438`、coding/retro | `:81` | `kind`（solo\|team）、`mode` |
| coding/tasks/policies/scope-challenge.md | `:22` | `scope_challenge.max_files` 等 | 复杂度异味阈值 |

**正例（合规）**：`debug/patch:69`、`debug/closeout:68`、`prd/draft:65`、`prd/refine:88`、`prototype/build:73` 均已调 `get-language-name.sh` —— **同族内冷热不均**。

### 1-D 🟠 `state.yaml` 读取未走 `get`（自然语言判据）

各技能的**入口校验表**与**重载段**普遍用自然语言从 `state.yaml` 读判据，例如：

- coding：`build:82`（`runtime.tasks.status=completed`）、`verify:117`、`tasks:105`、`tweak/policies/artifact-backfill.md:67`、`ship/policies/artifact-backfill.md:67`
- prd：`ship:45/57/80`、`refine:73/106`、`draft:89`
- testing：`draft:57/58`、`refine:53/54`、`ship:42/45/47`、`discovery:107`
- prototype：`build:57/82/94/183`、`ship:57/58/62`、`blueprint:91/105`
- debug：`patch:27/54`、`closeout:53/111`、`diagnose:82`

**Full 范例（全仓仅 4 处走脚本读）**：`prd/ship:177,179`、`prototype/ship:177,179` 用 `task-state-entry.sh get --path`。

> 读不加锁，风险低于写；但**自然语言读原始 yaml** 意味着 AI 自己去解析，遇到旧格式（未归一化）或多层嵌套时容易读错字段 —— 而 `get --path` 自带归一化。

---

## 四、类型 2：脚本自身问题（6 条）

### 2.1 🔴 `task-state-entry set` 写顶层 `phase` 绕过校验（功能性）

- **代码**：`runTaskStateEntry` 只对 `enter-phase` / `complete-phase` 调 `checkPhaseWrite`（`task-state-entry.ts:408-429`）；`set` 分支走通用 `setByPath`（`:562-571`），**完全不校验**。
- **技能里 5 处正走这条路**（用 `set` 写顶层 phase）：

| 文件:行号 | 命令 |
|---|---|
| coding/specify | `:302-303` | `task-state-entry.sh set … --set phase=plan` |
| coding/plan | `:409-410` | `… --set phase=design` |
| coding/plan | `:426-427` | `… --set phase=tasks` |
| coding/tasks | `:367-374` | `… --set phase=build` |
| coding/verify | `:815-830` | `… --set phase=ship` |

- **对照**：`coding/design:246-247` 用 `complete-phase --phase design --next-phase tasks`（**受校验**）—— 同一仓库两种写法，不一致。
- **后果**：笔误（如 `buiild`）静默写入 → Dashboard 显示「未知阶段」、自动衔接静默不匹配，正是 `phase-validation.ts` 头注要防的场景；而用 `enter/complete-phase` 会当场拦下。
- **修法**（二选一）：
  - **a**：这 5 处改用 `complete-phase --phase <本阶段> --next-phase <下一阶段>`（一句话同时写 `runtime.<本阶段>.status=completed` + 顶层 phase），**并删除重复的 `--set runtime.<阶段>.status=completed`**；
  - **b**：在 `runWriteOp` 的 `set` 分支里，对点路径命中顶层 `phase` 的赋值也过一遍 `checkPhaseWrite`（守住所有写者）。

### 2.2 🔴 `config get` 只支持 `language`

- `config.ts:53-62`：非 `language` 键 → `exit 2`（`unsupported config key`）。
- **后果**：`platform` / `test.*` / `scorer.weights` / `constitution_required` / `kind` 全部无读途径；`test.*` 还要写（见 1-B）→ **完全无脚本**。技能只能让 AI 直读直写 yaml，格式一变即静默出错。
- **修法**：把 `config get` 泛化为通用点路径读取（对齐 `task-state-entry get`），并补一个受控的 `config set`（至少覆盖 `test.*`）。

### 2.3 🟠 `task-finalize` 写 `phase: 'specify'` 且**不持锁**

- **代码**：`task.ts:303-314` 调 `patchTaskStateFile` 写 `phase: 'specify'` + `runtime.specify.status=completed`。
- **问题 a（语义）**：按 2026-10-12 裁定「phase = **接下来要执行的阶段**」，此刻 specify 已完成、下一阶段是 plan，应写 `plan`（现在与游标 `plan` 不一致）。因 `phase` 只写不读，暂无功能影响，但语义漂移。
- **问题 b（竞态）**：`patchTaskStateFile`（`task-state.ts:701-713`）直接 `saveTaskStateToFile`，**不持 `task-state-<id>.lock`** —— 而 `task-state-entry` 的所有写 op 都持锁。finalize 与并发写者之间存在覆盖窗口。
- **修法**：finalize 改走 `task-state-entry`（持锁路径），并把 phase 写为下一阶段。

### 2.4 🟡 `getByPath` 不支持数组索引

- `task-state-entry.ts:100`：遍历时遇 `Array.isArray(cur)` 直接返回 `undefined`。
- **后果**：`get --path workflow.signals[0]` 之类拿不到值（返回空串）。当前技能未见此类读法，风险低，列为观察项。

### 2.5 🟡 `set` 无字段白名单（错名静默通过）

- `setByPath`（`:109-127`）接受**任意点路径**，中间对象自动创建。
- **这正是此前 `runtime.plan.tdd_policy`（应为 `runtime.tasks.*`）写错命名空间的根因** —— 脚本不报错、静默写入错误位置，读方永远读到空值。
- **修法**：可选加「已知顶层段」软校验（`runtime` / `workflow` / `worktree` / 身份字段以外的键给出警告并留痕），不阻断。

### 2.6 🟡 `get-active-changes --format full` 对 mode 缺失任务按 phase 兜底

- `workflow-entry.ts:341`：`mode` 为空串时，`skillForModePhase` 回落按 `phase` 直连（`task-kind-layout.ts`）。
- 这是**刻意兜底**（存量/迁移任务），但与「`mode` 定通道」的模型冲突：旧任务会被按完整链路处理。建议在输出行里标注 `mode_missing: true`，让技能能提示用户。

---

## 五、已合规的对照（避免误伤 / 返工）

| 项 | 状态 |
|---|---|
| `workflow.yaml` 全族 | ✅ **全部走 `workflow-entry.sh`**，无一处绕过；H12 硬约束有效 |
| `state.yaml` 写入走脚本的正例 | ✅ `specify:117/281/302`、`plan:365/373/409/426`、`design:86/246/248`、`tasks:108/365/367`、`build:89`、`verify:125/126/483/813/815`、`tweak:128/261`、`normal:137/245`、全部 prd/testing/prototype/debug 的 `enter-phase` / `complete-phase` / `set-identity` / `set` |
| `language` 读取走脚本的正例 | ✅ `debug/patch:69`、`debug/closeout:68`、`prd/draft:65`、`prd/refine:88`、`prototype/build:73` |
| `state.yaml` 读取走脚本的正例 | ✅ `prd/ship:177,179`、`prototype/ship:177,179` |
| 纯「路径声明」 | ✅ 各表里列 `.polaris/.../state.yaml` 为产物位置，**不计**为操作 |
| 否定性声明 | ✅ `prototype/review:253`、`testing/review:161`、`maintance/codereview:255`、`commands/prototype/review.md:16` 的「不写 state.yaml / 不推游标」 |
| `debug` 族 `channel` / `runtime.*` 落盘 | ✅ 全走 `task-state-entry.sh set`（diagnose:148/182/208、closeout:150） |

---

## 六、整改建议（分级）

### P0（功能性，建议优先）

1. **`coding/ship` 的 state 写入改走脚本**（1-A 最大单点）：把 `:181-197` 的 11 字段改为 `task-state-entry.sh set`（或 `complete-phase --phase ship` + `set`）。
2. **`task-state-entry set` 写 phase 纳入校验**（2.1）：防静默脏值；顺带把 5 处「`complete-phase` + `set --set phase=`」合并为 `complete-phase --next-phase`。
3. **`prototype/build` 补 `set-identity --work-dir`**：否则「写回 work_dir」永远只存在于 AI 的编辑里，中断即丢。

### P1（能力缺口）

4. **`config get` 泛化为通用点路径 + 补 `config set`**（2.2 / 1-B / 1-C-b）：否则 `test.*`、`platform`、`scorer.weights` 永远无脚本。
5. **`task-finalize` 改走持锁路径**（2.3-b）。

### P2（收敛与一致性）

6. 5 处 `language` 自然语言读 → 统一改 `get-language-name.sh`（1-C-a），尤其 `coding/design:106` 的内联 `cat|grep|awk`。
7. `state.yaml` 读取统一改 `get --path`（1-D），至少覆盖**入口校验**与**重载**两处判据。
8. `finalize` 的 `phase` 写为下一阶段（2.3-a）；`--format full` 输出加 `mode_missing` 标注（2.6）。
9. `set` 加已知段软校验（2.5）。

---

## 附：审计方法

- **coding 族**：逐处 Read 亲验（`ship` / `tasks` / `verify` / `build` / `plan` / `design` / `specify` / `tweak` / `normal`）。
- **其余族**：两个 Explore 子代理分族深读，输出带行号与原文；我对 `prd/ship:80/85`、`testing/draft`、`prototype/build` 等抽样回验。
- **脚本层**：通读 `task-state-entry.ts`（737 行）、`workflow-entry.ts`（476 行）、`task.ts`（346 行）、`phase-validation.ts`、`config.ts`、`polaris-paths.ts`、`get-language-name.sh`、`specify-finalize.sh`。
- **交叉核对**：以 `grep task-state-entry` 在 coding 各文件的命中行号，反证「哪些写入点没有脚本」。

---

## 七、复核（2026-10-14）

### 7.1 背景

初版基于 **2026-10-13 09:44** 的文件快照。此后：

- 技能资产被改动（mtime：`verify`/`ship`/`tasks` 10-13 15:35、`specify` 16:15、`plan` 16:22、`design` 16:23、**`build` 10-14 09:56**）
- `src/` 亦有改动：`core/hooks/workflow-entry.ts`（+206）、`config/task-kind-layout.ts`（+101）、`cli/register-runtime-commands.ts`、`core/hooks/state-next.ts`、`core/assets/polaris-paths.ts`、`config/workflow-state.ts`、dashboard 三处

⇒ 正文行号失效，须以本节为准。

### 7.2 结论：核心发现**全部仍成立**（逐条复验）

| 结论 | 当前证据（2026-10-14 复验） |
|---|---|
| **2.1** `task-state-entry set` 写顶层 `phase` 绕过校验 | `task-state-entry.ts:562-572` —— `set` 分支仍只走 `setByPath`，**无** `checkPhaseWrite`；校验仍只在 `:408-429` 的 `enter-phase` / `complete-phase` 分支 |
| **2.2** `config get` 只支持 `language` | `config.ts:53-62` 逐字未变（`supported: ['language']`） |
| **1-A 最大单点** `coding/ship` 无状态脚本 | 全目录 grep `task-state-entry` / `set-identity` / `complete-phase` → **零命中**；状态写入在 `:204`（Step 4）与 `:241`（Step 4.5），均为纯 ```yaml``` 块 |
| **1-C(a)** `coding/design` 内联 `cat\|grep\|awk` | `design/SKILL.md:112`（原 106） |
| **1-A** `prototype/build` 缺 `set-identity --work-dir` | 仍只有 `enter-phase`（`:65`）与 `complete-phase`（`:265`）；`:16` / `:186` 的「写回 `work_dir`」仍无脚本 |

### 7.3 行号刷新（本轮实测的当前值）

| 位置 | 初版 | **当前** |
|---|---|---|
| coding/ship Step 4 状态写入 | 181-197 | **204** |
| coding/ship Step 4.5 写状态 | 218 | **241** |
| coding/build 无脚本写入 | 111 / 121 / 187 | **123 / 133 / 199** |
| coding/verify 无脚本写入 | 265 / 420 / 434 | **287 / 442 /（score_level 段同文件整体 +15）** |
| coding/verify config 写入 | 205 | **227** |
| coding/plan 无脚本写入 | 92 / 104 / 112 / 230 / 232 / 243 / 260 / 323 | **109 / 121 / 129 / 241 / 243 / 254 / 271 / 334** |
| coding/tasks 无脚本写入 | 146 | **168** |
| coding/tweak 无脚本写入 | 288 / 306 | **244 / 262** |
| coding/normal 无脚本写入 | 259 / 279 | **346 / 366** |
| prd/ship readiness 写入 | 85 / 115 / 131 | **85 / 115 / 131（未变）** |
| testing/draft 无脚本写入 | 78 | **78（未变）** |

> 未逐一列举的锚点按同文件整体偏移推算；如有疑义以 `grep` 结果为准。

### 7.4 补正（初版的漏报与新增）

| 类型 | 内容 |
|---|---|
| **漏报** | `coding/tweak/policies/exit-check.md:57`、`:119` 与 `coding/normal/policies/exit-check.md:57`、`:117` —— 写 `runtime.verify.constitution_valid` / `overall_score` / `scorer_results`，**无脚本**。初版 1-A 只逐文件扫了各 SKILL.md、**未逐文件扫 policies/**，故漏列。同理 `tier-gate.md:65/114`、`upgrade-check.md:96` 写 `workflow.signals` 也无脚本 |
| **新增** | `coding/plan/SKILL.md:37` —— 新增 `language` 读取（自然语言，未走 `get-language-name.sh`），属 1-C(a) |
| **代码演进（报告 2.6 已过时）** | `--format full` 已由 **5 字段扩到 10 字段**（+`state_path` / `phase_label` / `mode_label` / `skill_label` / `state_readable`），并新增 `resolveTaskStatePath()` 处理 worktree 内 state 定位（`workflow-entry.ts:97-117`、`:341-342`）。2.6 的「建议加 mode 缺失标注」已被 `state_readable` 部分实现，但 `set` / `config` 两条主线问题未动 |

### 7.5 复核后的整改优先级（不变）

- **P0**：① `coding/ship` 状态写入改走脚本 ② `set` 写 phase 纳入校验（顺带把 5 处两段式合并为 `complete-phase --next-phase`）③ `prototype/build` 补 `set-identity --work-dir`
- **P1**：④ `config get` 泛化为通用点路径 + 补受控 `config set` ⑤ `task-finalize` 改持锁路径
- **P2**：language 读取统一走 `get-language-name.sh`、`state.yaml` 读取统一走 `get --path`、`finalize` phase 语义修正、`policies/` 下的 state 写入补脚本
