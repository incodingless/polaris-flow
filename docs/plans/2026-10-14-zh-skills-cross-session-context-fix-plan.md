# `assets/zh/skills/` 跨会话上下文缺陷 — 修复方案

> **输入**：`2026-10-14-zh-skills-cross-session-context-review.md`（审计报告，2026-10-11）。
> **性质**：方案文档，**不含任何资产改动**。逐项给出「问题 → 精确改法 → 决策张力 → 验证」，
> 供逐项裁定后分批落盘。
> **范围**：仅 `assets/zh/skills/**` 与 `assets/zh/commands/**` 的 Markdown 文本。
> **零代码约束**：不触碰 `src/`。所有修复都是技能文本与点路径取值，脚本已支持任意 `--set` 点路径 → **无单测影响**。

---

## 〇、执行原则（先定，再改）

| 原则 | 说明 |
|---|---|
| **只动 zh 资产** | `assets/en/skills/` 为空（仅 `.gitkeep`）。按 `AGENTS.md`「先中文、确认后再改英文」，当前**无英文可同步** → 中文改完即视为同步完成。 |
| **Changelog 处理** | `AGENTS.md` 规定「Skill 内容变更须等中英文完全同步后写 Changelog」。en 为空时是否即算同步 → **需裁定**（见 §末 M1）。 |
| **不保留兼容层** | `AGENTS.md` 明令移除过时路径。修复**只改现状值**，不写「旧值兼容分支」。 |
| **批次推进** | 按 P0→P1→P2 分批，每批独立可提交、可回滚。建议每批改完跑一次 `pnpm test` 确认无副作用（预期全绿，因不改 src）。 |
| **验证手段** | 文本类修复无自动化用例；验证 = ① 逐条对照证据行复核；② `grep` 确认旧串清零；③ 对涉及字段的修复，手工走一遍 `state.yaml` 读回路径。 |

---

## 一、P0 — 功能性缺陷（1 项，必改）

### F1 🔴 `coding/tasks` 状态字段写错命名空间

**问题**：`tasks` 把阶段字段写进 `runtime.plan.*`，而模板、技能自身读取、下游 build 都用 `runtime.tasks.*`。

**证据**

- 写错处（**两处，必须同时改**）：
  - Step 2 写入块 `coding/tasks/SKILL.md:143-147`：`runtime → plan → tdd_policy`
  - Step 8 写入块 `coding/tasks/SKILL.md:362-370`：`--set runtime.plan.{status,tdd_policy,tasks_path,review_report,outside_voice}`
- 权威定义：`assets/shared/templates/state.example.yaml` 的 `runtime.tasks.{status,tdd_policy,tasks_path,review_report,outside_voice}`
- 技能自身读取（全部为 `runtime.tasks.*`）：`tasks/SKILL.md:98,100,151,259,404,413,416`
- 旁证：`coding/plan` 正当使用 `runtime.plan.{worktree_decision,review_round,review_log_file}`（`plan/SKILL.md:107,116,235-236`）→ tasks 的写入与 plan 命名空间**真实冲突**。

**精确改法**

| 位置 | 现状 | 改为 |
|---|---|---|
| `tasks/SKILL.md:143-147` | `runtime:` / `‎  plan:` / `‎    tdd_policy: <…>` | `runtime:` / `‎  tasks:` / `‎    tdd_policy: <…>` |
| `tasks/SKILL.md:364` | `--set runtime.plan.status=completed` | `--set runtime.tasks.status=completed` |
| `tasks/SKILL.md:365` | `--set runtime.plan.tdd_policy=<…>` | `--set runtime.tasks.tdd_policy=<…>` |
| `tasks/SKILL.md:366` | `--set runtime.plan.tasks_path=…` | `--set runtime.tasks.tasks_path=…` |
| `tasks/SKILL.md:367` | `--set runtime.plan.review_report=…` | `--set runtime.tasks.review_report=…` |
| `tasks/SKILL.md:368` | `--set "runtime.plan.outside_voice=<…>"` | `--set "runtime.tasks.outside_voice=<…>"` |

**注意**：`complete-phase --phase tasks`（同段上一命令）已由脚本自动写 `runtime.tasks.status=completed`
（`src/core/hooks/task-state-entry.ts:278`）→ 改后 `:364` 与它重复但幂等，**建议保留**以显式声明；如追求精简可删。

**决策张力**：无实质备选。模板/读取/下游三方一致指向 `runtime.tasks.*`，唯一正确解。
是否顺带补齐模板中 `runtime.tasks.plan_review_status`（当前技能不写）→ **可选**（见 M2）。

**验证**：`grep -n "runtime.plan" assets/zh/skills/coding/tasks/SKILL.md` → 应**零命中**；
`grep -n "runtime.tasks" tasks/SKILL.md` → 写入段与读取段命名空间一致。

---

## 二、P1 — 断链 / 落盘契约缺失（4 项）

### F2 🟠 `debug/diagnose` 引用不存在的 `Step 1.5`

**证据**：`debug/diagnose/SKILL.md:57`、`:62` 指向「进入 Step 1.5」；全文步骤为 Step 0→1→2…→6，**无 Step 1.5**。

**决策张力（需裁定）**

| 方案 | 改法 | 张力 |
|---|---|---|
| **A. 补 Step 1.5** | 新建「Step 1.5：读取任务进展，继续执行」，内含从盘判定表（对齐 `prototype/blueprint/SKILL.md:89-110` 的同名步骤） | 最一致，续跑路径闭环；但需新增一段内容 |
| **B. 改指向** | 把 `:57`/`:62` 的「进入 Step 1.5」改为「按『上下文压缩恢复』的续跑表定位步骤」（引用 `:356-359`） | 改动最小；但续跑逻辑散在文末，不闭环 |

**推荐 A**：`diagnose` 的 Step 2 会**重建任务**，续跑必须跳过 Step 2 → 需要显式落点，B 的引用方式容易漏跳。

**验证**：全文 `grep "Step 1.5"` → 定义处与引用处均可定位。

### F3 🟠 `prd/review`、`prd/testability` 报告无落盘路径

**证据**

- `prd/review/SKILL.md:234`「必须 `read_file ./templates/review_report_template.md`，按报告模板输出」——**无路径**；
  但 `:317` 恢复逻辑「报告已落盘、指纹未变 → 不重跑」**假设已落盘**。
- `prd/testability/SKILL.md:186` 同构；`:214` 同「报告已落盘…→ 不重跑」。
- **关键事实**：`prd/refine` 链上调用这两个技能时给的是 `output_path`
  = `final/review-business-dispatch.md`（`refine:345`）/ `final/review-testability-dispatch.md`（`refine:407`），
  再由主代理合并进 `final/full_review_report.md`（`refine:295,438`）。→ **独立触发时无兜底**。

**决策张力（需裁定）**

| 方案 | 改法 | 张力 |
|---|---|---|
| **A. 补独立默认路径** | 各自声明「链上由调用方 `output_path` 决定；**独立触发**默认落 `final/<skill>_report.md`」 | 独立触发可恢复；但引入**新文件名**（`review_report.md` / `testability_report.md`），需确认不与 refine 的 `*-dispatch.md`、`full_review_report.md` 混淆 |
| **B. 只声明边界** | 显式写「本技能产物的落盘由调用方决定；无调用方时须由用户指定路径，否则仅会话输出且无恢复点」 | 零新约定；但独立触发仍可能丢产物 |

**推荐 A**（对齐 `prd/readiness` 的正例 `SKILL.md:204-208` 固定 `final/readiness_report.md`），
文件名词根与技能名对齐即可，避免与 refine 的 dispatch 文件同名。

**验证**：两者「上下文压缩恢复」节引用的路径与实际写入路径一致。

### F4 🟠 `testing/acceptance` 完全无恢复机制与读盘入口

**证据**：`testing/acceptance/SKILL.md` 全文无「上下文压缩恢复」节、无任务身份读取；
落盘优先级第 3 档（`:135`）=「在对话中输出全文」。

**改法（对齐同族正例）**：参照 `testing/review/SKILL.md:152-161`（有恢复节 + 显式服务型声明），
为 `acceptance` 补：

1. **入口**（`:25-30` 「输入」节）补：链上调用时先读 `get-active-changes` 与 `.polaris/testcases/<task_id>/state.yaml` 恢复 task_id；
2. **文末新增「上下文压缩恢复」节**：给出①任务身份（task_id/目录）②进度依据（已落盘的 `acceptance-criteria.md`）③起始步骤；
3. 声明服务型边界（不推进游标、独立无任务时无落盘即无恢复点）。

**决策张力**：`acceptance` 可能**完全脱离任务**运行（用户直接粘贴需求条目）。故恢复节须区分
「链上有任务 → 落盘可恢复」与「独立无任务 → 仅会话、需用户自持」两条路径 → **不建议**强制落盘。

### F5 🟠 `prototype/blueprint` 状态字段取值自相矛盾

**证据**

| 位置 | 取值 |
|---|---|
| `prototype/blueprint/SKILL.md:99`（续跑判定） | `blueprint.status != confirmed` → 进 Step 4 |
| `prototype/blueprint/SKILL.md:306`（出口写入） | `blueprint.status: completed` |
| `prototype/build/SKILL.md:57`（下游入口校验） | `blueprint.status=completed` |
| `prototype/build/SKILL.md:109`（硬门禁） | 「`blueprint.md` 有确认记录」（文档内记录，非 state 字段） |

**后果**：blueprint 写 `completed`，却用 `!= confirmed` 判断是否需重做确认 → 续跑**恒进 Step 4**。

**决策张力（需裁定）**

| 方案 | 改法 | 张力 |
|---|---|---|
| **A. 统一为 `completed`** | 改 `blueprint:99` 的判据为 `!= completed` | 对齐 state 模板惯例（其他阶段状态值均 `in_progress/completed/skipped`）与下游 build；**推荐** |
| **B. 统一为 `confirmed`** | 改 `blueprint:306` 与 `build:57` 为 `confirmed` | 语义更贴「人工确认」；但偏离模板值域，牵动 Dashboard 契约 |

另需统一「确认态载体」：`build:57` 查 state 字段、`build:109` 查文档记录 → 两处须指向**同一处**。

**验证**：`grep -n "blueprint.status\|确认记录"` 三处判据取值一致。

---

## 三、P2 — 形式统一与边界补齐（8 项）

| # | 目标 | 改法 | 张力 / 备注 |
|---|---|---|---|
| **F6** | `prd/discovery:630` 恢复行漏第 2 主产物 | 在该行补 `req_clarify_summary.md`（与 `:637` 一致） | 无。纯补全 |
| **F7** | `prd/draft` 章节确认态无落盘载体 | 落 `draft/sessions/chapter_state.md`，每章生成/确认后更新（**对齐 `prd/refine` 的 `final/sessions/chapter_state.md` 模式**，`refine:215,222`） | **张力**：可选 ①新增 `chapter_state.md` ②章节文件 frontmatter 加 `status:` ③`state.yaml.draft.chapters[]`。推荐 ①（与 refine 同构，单源清晰） |
| **F8** | `prd/refine` Step 1.5「逐章/全量」选择未落盘 | 写入 `state.yaml` 的 `refine.gen_mode`，或 `chapter_state.md` 头部字段 | 张力：同 F7 载体选择。推荐 `state.yaml`（这是**一次性选择**，非逐章状态，放 state 更合适） |
| **F9** | `debug/diagnose` 两处人工确认门禁结果未落盘 | Step 5.6 / Step 6.5（`:287,319-321`）补「确认结论回填 `diagnose-brief.md` / `rca-report.md` 对应节」 | 无。与同技能止血（`:259`）回填惯例一致 |
| **F10a** | `coding/build` apply pause 原因未落盘 | `build:176` 补「pause 原因与可选项写入 `state.yaml` 的 `runtime.build.pause_reason`」 | 无 |
| **F10b** | `coding/ship` 出口未套层级 C 模板 | Step 6 摘要（`:254-270`）补一行「恢复：先读 …」 | 终态，风险低；可选 |
| **F11** | `subagent-dispatch` 字段名不一致 | `SKILL.md:107` 的 `status / output / concerns` → `status / artifact_path / concerns`（对齐 `:69-72`） | 无。纯一致性 |
| **F12** | 13 个命令无「重进如何恢复」说明 | **推荐**：在 `commands/` 层约定「恢复语义下沉到技能」的一句话（或在 `flow.md` 补），薄壳命令不逐个改 | **张力**：逐个补 vs 约定层声明。推荐后者（薄壳命令改动收益低） |
| **F13** | `testing/discovery:113`、`draft:51` 用 `state.yaml.phase` 判续跑 | 改为落盘产物判据（`discovery:107` 已声明「不靠 phase 回推」，`:113` 表格自相矛盾） | 无。修正后与 `auto-transition.md` 口径一致 |

**P2 附带项**

| # | 目标 | 改法 |
|---|---|---|
| F14 | `constitution-audit.md` 违规清单无落盘路径（`:34-41`） | 补默认路径（如 `openspec/memory/constitution-audit.md`）或声明由调用方 `output_path` 决定 |
| F15 | `constitution` AMEND 的 `Sync Impact Report` 无落盘路径（`constitution-amend.md:29-40`） | 同 F14 |
| F16 | `prototype/build` 原型文件名非字面绑定（`build:174` `--out=<原型.html>`；`PROVENANCE.md:386-389` 标「待产品确认」） | **需产品裁定**：把命名约定转正并字面绑定 `--out="$work_dir/$NAME.html"` |

---

## 四、需裁定的决策点汇总

| 编号 | 决策点 | 选项 | 建议 |
|---|---|---|---|
| **M1** | en 为空时，改 zh 技能后是否/如何写 Changelog | A 视为已同步、正常写；B 待英文补齐再写；C 本轮不写 | **需用户定**（影响 §〇） |
| **M2** | F1 是否顺带补齐 `runtime.tasks.plan_review_status` | 补 / 不补 | 不补（无消费方，YAGNI） |
| **M3** | F2 采用「补 Step 1.5」还是「改指向」 | A / B | **A** |
| **M4** | F3 采用「补独立默认路径」还是「只声明边界」 | A / B | **A**（并确认新文件名词根） |
| **M5** | F5 状态值统一为 `completed` 还是 `confirmed` | A / B | **A** |
| **M6** | F7 章节确认态载体 | ①`chapter_state.md` ②frontmatter ③`state.yaml` | **①** |
| **M7** | F12 命令层恢复说明 | 逐个补 / 约定层声明 | **约定层声明** |
| **M8** | F16 原型命名约定是否转正 | 是 / 否 | 需产品确认 |

---

## 五、建议执行顺序

```
批 1（P0）  F1                      ← 唯一影响真实续跑数据的缺陷，先落
批 2（P1）  F2 + F5                 ← 两处断链/自相矛盾，纯判据修正
批 3（P1）  F3 + F4                 ← 服务型技能落盘契约（需先定 M4）
批 4（P2）  F6/F8/F9/F10a/F11/F13   ← 无张力的形式与补全项
批 5（P2）  F7/F10b/F12/F14/F15     ← 含载体/约定决策的项（需先定 M6/M7）
批 6（待定）F16                      ← 依赖产品确认 M8
```

每批落盘后：`grep` 复核旧串清零 → 跑 `pnpm test` 确认全绿 → 按 M1 结论决定是否写 Changelog。

---

> 本方案为只读产出，未修改任何资产。所有改法均指向仓库现状（文件 + 行号），可直接复核。
