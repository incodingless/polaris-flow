# cs-foundation state.yaml 字段排查报告

- **排查对象**：`/Users/weiliu/Documents/work/projects/polaris/test-coding/.polaris/tasks/cs-foundation/state.yaml`（任务已走完 verify，phase=ship 待执行）
- **对照基准**：`assets/shared/templates/state.example.yaml`、`src/core/config/task-state.ts`（类型唯一源）、`src/core/config/task-kind-layout.ts`（initPatches）、各技能 SKILL.md 的落盘指令
- **排查时间**：2026-10-19
- **范围边界**：只审计、不修复；涉及 `src/` 与技能资产的改动建议另行分批裁定

## 0. 结论摘要

| 类别 | 数量 | 定性 |
|---|---|---|
| 🔴 漏赋值（该写没写） | 5 | 含 1 处指向不存在文件 |
| 🔴 赋值错误 | 3 | 含 1 处模板样例值落盘 |
| 🟠 未登记孤儿键（技能自造） | 9 | 赋值本身有技能依据，类型/模板未登记 |
| 🟡 无写者字段（已裁定：补写者，不裁撤） | 5 | workflow 层 = 全局决策，runtime 层 = 运行细节记录，两层并存 |
| 🔵 已核实无问题 | 8 项 | 见 §5 |

用户报告的两个问题均成立，且同属一个根因大类：**模板占位符 / 默认值无写者**——不是技能写错值，而是从初始化到收口全程没有任何代码或技能负责写这些字段，模板内容原样落盘。

## 1. 🔴 用户报告问题一：init 后占位符未替换

| 字段（state.yaml 行号） | 现值 | 应为 | 根因 |
|---|---|---|---|
| `main_repo_root`（L3） | `<project_root>` | `/Users/weiliu/Documents/work/projects/polaris/test-coding` | `task-kind-layout.ts` L116-124：coding 的 `initPatches` 只补 8 个键（kind/change_id/task_id/phase/runtime.specify.*），**不含** `main_repo_root`/`worktree_dir`/`install_time` |
| `worktree_dir`（L4） | `<project_root>/.worktrees` | `/Users/weiliu/Documents/work/projects/polaris/test-coding/.worktrees` | 同上；`task.ts` L109-136 `materializeStateFromTemplate` 原样拷贝模板正文 |

**关键事实**：正确值在项目 `.polaris/config.yaml` 中现成存在（`main-repo-root` / `worktree-dir` 均为绝对路径），init 路径没有去取。`init-config.test.ts` / `generate-polaris-config.test.ts` 已断言项目级 config 不允许残留 `<project_root>`，但任务级 state 无对应检查。

**同根因连带发现**：`install_time`（L2）= `2026-06-25T02:05:29.066Z`，是 `state.example.yaml` L19 **硬编码的样例值**原样落盘；项目真实安装时间为 `2026-10-15T07:11:29.627Z`。归入 §3 赋值错误。

## 2. 🔴 用户报告问题二：workflow.tdd_mode / build_mode 值不正确

| 字段（行号） | 现值 | 实际决策落点 | 定性 |
|---|---|---|---|
| `workflow.tdd_mode`（L15） | `auto_by_task_type` | `runtime.tasks.tdd_policy: prefer_tdd`（L74） | **全仓无写者**：无任何技能/代码写 `workflow.tdd_mode`，此值是模板默认值（state.example.yaml L69）原样带过。build SKILL.md L154 明言「刻意不做：全局 tdd_mode」——该字段与既有设计决策直接冲突，是死字段 |
| `workflow.build_mode`（L16） | `inline` | `runtime.build.build_mode: inline`（L85） | 同样**无写者**，模板默认值（模板 L72），与 runtime 值重复且只是碰巧同值。若 build 实际选了 `subagent_dispatch`，此处仍会停留 `inline` |

**纠正定性**：不是「技能执行过程中赋值不正确」，而是「无人赋值，模板默认值误导」。

**裁定（2026-10-19）**：这两个字段连同 `workflow.signals` **不裁撤**——它们是 workflow 层的**全局决策字段**，应写入；`runtime.tasks.tdd_policy`、`runtime.build.build_mode` 等 runtime 同名/相应字段的作用是**运行细节记录**。两层语义分工：workflow 层记「任务级决策」，runtime 层记「阶段执行细节」。修复方向 = 为 workflow 层字段补写者（见 §3.4），与 build SKILL.md L154「刻意不做全局 tdd_mode」的表述需同步修正（该表述与本裁定冲突）。

## 3. 全量审计发现

### 3.1 🔴 漏赋值（该写没写）

| # | 字段（行号） | 现值 | 证据与判据 |
|---|---|---|---|
| 1 | `runtime.specify.intention_path`（L42） | `.polaris/tasks/cs-foundation/intention.md` | **指向不存在的文件**：任务目录下只有 `split-plan.md` + `state.yaml`；intention.md 实际在 `openspec/changes/cs-foundation/intention.md`。plan SKILL.md L261、tasks SKILL.md L140 均要求迁移后 `--set runtime.specify.intention_path=openspec/...`，执行链漏了这一步 |
| 2 | `runtime.design/tasks/build/verify.start_time`（L68/L80/L91/L112） | 空 | **根因修正（2026-10-19 二次核查）**：`started_at` 不是技能自造——`task-state-entry.ts` L275 `applyEnterPhase` 官方写入 `` `${prefix}.started_at` ``（自 14c0e07 / 2026-09-15 起），而模板与 TS 类型声明的是 `start_time`，**脚本与模板/类型键名分裂**（src 级 bug）。四段 `start_time` 恒空是结构性必然，值落在 L70/L82/L93/L114 的 `started_at`。specify 段 `start_time` 有值是因为 initPatches（task-kind-layout.ts L123）写的正是 `start_time`——init 与 enter-phase 两条官方路径互相不一致。plan 段 `start_time`（L56）有值但全仓无写者，疑似执行会话 AI 直写残留 ⚠️。修复归批①（键名统一），非技能侧 |
| 3 | `runtime.tasks.outside_voice_report`（L79） | 空 | 同段 `outside_voice: ran`（L78）——跑了没记报告路径；对照 plan（L55）、design（L71）均记录了 |
| 4 | `runtime.verify.constitution_compliance`（L100） | 空 | 但 `constitution_valid: true`（L101）已填——聚合判定有、逐条明细无。且与 build 段 `constitution_exception: constitution_md_missing_user_approved_skip`（L94，宪法文件缺失、用户批准跳过）口径矛盾：跳过了为何 valid=true？ |
| 5 | `workflow.signals`（L17） | `[]` | critical 判定明确命中信号（`risk_escalation_reason` L115 引 §5 glob 命中 auth/token/session/secret/migration），但 `signals` 全仓无写者——命中编号只出现在技能输出话术，不落盘。已裁定为应写入的全局决策字段（§3.4） |

### 3.2 🔴 赋值错误

| # | 字段（行号） | 现值 | 判据 |
|---|---|---|---|
| 1 | `install_time`（L2） | `2026-06-25T02:05:29.066Z` | 模板 L19 硬编码样例值原样落盘；initPatches 不覆盖。真实安装时间 2026-10-15T07:11:29.627Z（项目 config） |
| 2 | `runtime.build.final_review`（L87） | `review_fix_round_done_F1_F2_F3_fixed_full_regression_green` | 违反值域：模板 L268 规定 `done \| skipped:off \| skipped:<reason> \| accepted_risk`。自由文本描述不是合法值，机器读不出「已完成」语义 |
| 3 | `runtime.plan.review.skipped: true` + `round: 0`（L59-60） | — | 与同段 `review_round: 2`（L50）+ `review_report`（L53）直接矛盾：主审跑了 2 轮，嵌套块却记跳过。plan SKILL.md 只写扁平字段，嵌套 `review.*` 块无写者（模板 L193-205 遗留） |

### 3.3 🟠 未登记孤儿键（技能有依据，注册缺失）

以下键由技能按 SKILL.md 指令写入，**但 `TaskRuntimeVerifyState` / `TaskRuntimeBuildState`（task-state.ts L106-136）与 `state.example.yaml` 均未登记**——与 `runtime.build.pause_reason` 是同一类先例（类型有、模板无 → 这里反过来：技能写、两头都无）。

| 段 | 键 | 依据 |
|---|---|---|
| verify | `risk_escalation_reason`、`codereview_status`、`codereview_report`、`test_result`、`test_slots`、`semantics_review`、`semantics_skip_reason` | verify SKILL.md L471/L740/L836-844 |
| build | `constitution_exception`、`override` | build 执行链写入（SKILL.md 未见显式指令，**依据不足，需单独核实是执行时自造还是文档遗漏**） |
| design/tasks/build/verify | `started_at` ×4 | **写者是 `enter-phase` 脚本**（task-state-entry.ts L275），非技能自造；登记缺失方向相反——脚本写入的键未登记进模板/类型（归批①键名统一，见 §3.1 #2 根因修正） |

### 3.4 🟡 无写者字段（已裁定：补写者，不裁撤）

**裁定（2026-10-19）**：`workflow.tdd_mode` / `build_mode` / `signals` 是 workflow 层**全局决策字段**，应写入；runtime 中相应阶段的值是**运行细节记录**。两层并存，语义分工：workflow 层 = 任务级决策快照，runtime 层 = 阶段执行细节。修复方向 = 明确各字段写点，非裁撤。

| 字段 | 层级定位 | 现值问题 | 建议写点（待裁定） |
|---|---|---|---|
| `workflow.tdd_mode` | workflow 全局决策 | 停留模板默认 `auto_by_task_type`，与实际决策脱节 | tasks 技能 Step 3：`tdd_policy` 决策落盘时同步（tweak 档档位派生时同样同步） |
| `workflow.build_mode` | workflow 全局决策 | 模板默认 `inline`，碰巧同值掩盖失真 | build 技能 Step 2.1：`runtime.build.build_mode` 落盘时同步 |
| `workflow.signals` | workflow 全局决策 | `[]` 假象「无信号」，实际命中 critical 信号 | specify Step 5.4.1 初判命中时写入；verify Step 9 复核命中时更新 |
| `runtime.plan.review.*` 嵌套块 | runtime 运行细节 | 与扁平 `review_round` 矛盾（§3.2 #3） | plan 技能主审执行段：per_batch 批内跟踪（skipped/round/start_time/finished_at） |
| `runtime.tasks.plan_review_status` | runtime 运行细节 | 恒空，无写者 | tasks 技能 subagent 评审产出时写入 |

> 连带修订：build SKILL.md L154「刻意不做：全局 tdd_mode」与本裁定冲突，批③须一并改正表述。

另：`triage.*`（L28-32）在 coding 任务全空——triage 是 debug 族的分类段，coding 模板带它是布局复用的遗留，属低危。

### 3.5 必填属性核查矩阵（2026-10-19 二次核查）

判据：本任务 specify→verify 六阶段已完成、ship 未开始。逐字段判定「空值/失真」是**漏写**还是**合法空**。

**A 表：必须写入、当前为空或失真（10 项）**

| # | 字段 | 责任层 | 判据 |
|---|---|---|---|
| 1 | `main_repo_root` / `worktree_dir` / `install_time` | src（批①） | init 即应写入，当前占位符/样例值 |
| 2 | `runtime.design/tasks/build/verify.start_time` | src（批①） | 阶段已执行，起止时间必须成对；当前因键名分裂恒空（§3.1 #2 根因修正） |
| 3 | `workflow.signals` | 技能（批③） | 已裁定为全局决策字段；本任务命中 critical 信号却为 `[]`。specify 5.4.1 无写入指令——**文档缺口，非执行漏写** |
| 4 | `workflow.tdd_mode` | 技能（批③） | 已裁定；tasks Step 3 无同步指令——文档缺口 |
| 5 | `workflow.build_mode` | 技能（批③） | 已裁定；build Step 2.1 无同步指令——文档缺口 |
| 6 | `runtime.tasks.outside_voice_report` | 技能（批②） | 条件必须：`outside_voice=ran` 时必须记报告路径。**tasks SKILL.md L438 只写 `outside_voice` 不写 report——文档缺口**（对照 plan L428-429、design L237-238 均为成对指令）；本任务 ran 但空 = 执行忠实遵循了不完整的文档 |
| 7 | `runtime.plan.review.*` 嵌套块 | 技能（批③） | per_batch 主审跟踪必须与扁平字段一致；本任务主审 2 轮，块内却记 skipped=true（§3.2 #3） |
| 8 | `runtime.tasks.plan_review_status` | 技能（批③） | 本任务 tasks 主审已跑（round3 报告在），应为 completed 而非空；tasks SKILL.md 无写入指令——文档缺口 |
| 9 | `runtime.verify.constitution_compliance` | 技能（批③） | verify SKILL.md 只写 `constitution_valid`（L266/L830），不写逐条合规——**无写者**。本任务 constitution.md 缺失、用户批准跳过，语义上应记 `n/a` 类显式值而非空串（与 build 段 `constitution_exception` 口径一并对齐） |
| 10 | 顶层 `verify_mode`（L25，`light`） | 技能（批③） | **裁定（2026-10-19）：属性保留，值必须写入**——verify 定档时与 `runtime.verify.verify_mode` 成对同步。本任务运行决策 `full`（L99），顶层停留模板样例值 `light`，值失真。连带修订：模板 L99-102「已废弃：polaris 不再读取本键」注释与本裁定冲突，批③须改为「与 runtime.verify.verify_mode 成对写入」并补技能写点 |

**B 表：条件必须——本任务合法为空（7 项）**

| 字段 | 触发条件 | 备注 |
|---|---|---|
| `workflow.finished_at` / `status: completed` | ship 完成时 | 现阶段空 = 正常 |
| `runtime.ship.*` | ship 执行时 | 未开始，全空正常 |
| `upgrade_reason` / `upgrade_target` | specify 5.5 发生升档时 | ⚠️ 两字段同样无写者（5.5 只写 `workflow.mode`）——本任务是否升过档已无法从 state 回溯（入场档未落盘）。降档字段 `downgrade_*` 同理，仅 strict 降档场景暴露。建议随批③一并定写点 |
| `runtime.build.current_task` | apply 进行中 | 32/32 完成，空正常 |
| `runtime.build.pause_reason` | 中途暂停时 | 未暂停，空正常 |
| `worktree.path` 等五字段 | worktree_decision=created/reused 时 | 本任务 declined，空正常 |
| `runtime.deepread.last_triggered` / `pending_file` | deepread 触发时 | 未触发，空正常（`action` 有默认值 ✓） |

**C 表：coding 家族不适用 / 已废弃（3 项）**

| 字段 | 判定 |
|---|---|
| `triage.*` | debug 族分类段，coding 无此流程，恒空合法（模板布局复用遗留，低危） |
| `runtime.tasks.tdd_policy` 等 runtime 决策记录 | 已有值且正确；按 2026-10-19 裁定作为运行细节层与 workflow 全局层并存 |

## 4. 修复分批建议（待逐项裁定，不随本报告执行）

| 批 | 层 | 内容 | 风险 |
|---|---|---|---|
| ① | `src/` | **✅ 已完成（2026-10-19，A 案）**：`initPatches` 补 `main_repo_root`/`worktree_dir`（从项目 config 读取）；`install_time` init 时写真实安装时间；阶段时间键名统一为 `started_at`（模板 + task-state.ts 类型 + coding initPatches 三处对齐，enter-phase 无需改）。e2e 验证通过（单进程调用 init()，生成 state 中三字段取自 config、`runtime.specify.started_at` 有值、全文件零 `start_time`）。涉及：task-kind-layout.ts / task.ts / task-state.ts / state.example.yaml | 低-中，已验证 |
| ② | 技能资产 `assets/zh/skills/coding/**` | ✅ **已完成（2026-10-19）**：`final_review` 值域硬约束（build Step 6 落盘命令后）；tasks Step 9.1 补 `outside_voice_report` 成对写入 + tweak 档写 `—`；verify 6.1 补 `constitution_compliance` 成对写入（`pass\|violations:<N>\|skipped:<reason>`），文件不存在+用户批准跳过 → `valid=false + skipped:no_constitution_user_approved`（对齐 build 段 `constitution_exception`），Step 17 同步；intention_path 迁移硬化（plan Step 4.5 / tasks Step 2.0：`mv` 与 `--set` 成对、执行后核对）。涉及 build/tasks/plan/verify 4 个 SKILL.md。验证：skills-install 14/14（含 zh 资产无幽灵占位符）、manifest+install-layout 13/13、session-start 9/9 全绿；commands-install 被环境 SIGTERM（批①基线已知存量环境失败，未引用改动）。未写 Changelog（双语言约定：英文同步后补记） |
| ③ | 模板 + 类型 + 技能 | ✅ **已完成（2026-10-19）**：**孤儿键登记**——TS `TaskRuntimeVerifyState` 补 9 键（审计 7 键 + 实际提取发现 `build_command`/`test_command` 也是孤儿）、`TaskRuntimeBuildState` 补 `constitution_exception`/`override`（依据已核实：override = build L289 decision-point B「用户接受风险」，constitution_exception = 注入点 C 宪法缺失场景），模板同步登记；**workflow 全局字段写者**——tasks Step 3/9.1 写 `workflow.tdd_mode`（只写不读）、build 2.1 写 `workflow.build_mode`（只写不读）、specify 5.4.1 初判 + verify Step 9 复核覆盖写 `workflow.signals`（JSON 数组字面量）；**顶层 `verify_mode`**——verify Step 9 定档 / Step 17 落盘均与 `runtime.verify.verify_mode` 成对写入，模板 L99-102 注释改写为「全局快照，成对写入」；**升降档留痕**——specify 5.5 写 `workflow.status` + `upgrade_/downgrade_reason/target` 成对六项；**runtime 细节**——plan Step 6 写 `runtime.plan.review.*` 嵌套块（与扁平 `review_round` 一致性约束 + 跳过场景写法）、tasks 9.1 写 `plan_review_status`（tweak 档 skipped）；**build L154**「刻意不做全局 tdd_mode」修正为「仅作决策记录，只写不读」；连带：模板 `upgrade_target` 过时注释（normal/design）修正为 mode 同值域、`constitution_compliance` 模板值域对齐批②、`check_state_yaml_three_way.py` 补 `tasks` 类型映射（1 行，修复基线解析 bug）。**验证**：pnpm build ✓；三方校验基线 2 失配 → 0 全绿（技能 runtime 引用 66 条 + workflow 11 条全命中）；assets 测试 36/36 ✓；state/phase/task-entry 类型消费测试 51/51 ✓。Changelog 已记 src/模板/脚本侧，技能写点待英文同步后补记 |

## 5. 🔵 已核实无问题项

- `phase: ship`：verify complete-phase 按 strict 序列派生，正确
- `workflow.mode: strict` + `complexity_level`/`risk_level`/`current_tier` 三字段：critical→strict 映射与单源一致
- `runtime.tasks.tdd_policy: prefer_tdd`、`runtime.build.build_mode: inline`、`runtime.verify.verify_mode: full`：均为实际决策的正确落点
- `overall_score: 65` 与五项 scorer 等权均值吻合（(100+100+25+40+60)/5=65）
- 顶层 `verify_mode: light`：**裁定（2026-10-19）后改判为漏写**——属性保留且值必须写入，本任务停留模板样例值 `light`、与运行决策 `full` 失真，已移入 §3.5 A 表 #10（修复归批③）
- `worktree.*` 全空 + `plan.worktree_decision: declined`：一致（未创建 worktree）
- `runtime.ship` / `runtime.deepread` 全空/默认：未开始，正常
- `runtime.build.total_tasks: 32` / `completed_tasks: 32`：与 build 完成态一致

## 6. 事实核查标注

- 本报告所有行号引用均出自本次实际读取的文件版本（state.yaml 137 行版、state.example.yaml 361 行版、task-kind-layout.ts、task.ts、task-state.ts、各 SKILL.md）✅ real
- `started_at` 写者已用 git 历史核实（14c0e07，2026-09-15「技能更新 state 转到脚本实现」），`task-state-entry.ts` 从未写过 `start_time`（`git log -S` 零命中）✅ real
- §3.3 `constitution_exception` / `override` 的写入依据标注为 ⚠️ risk（未在 build SKILL.md 找到显式指令，可能是执行会话自造）
- `runtime.plan.start_time`（L56）有值但全仓无写者，标注为 ⚠️ risk（疑似执行会话 AI 直写残留，与 zh-skills-state-write-fix-plan.md 同类）
- §3.5 B 表「本任务是否发生过升档」无法从 state 回溯（入场档未落盘），标注为 ⚠️ UNKNOWN
- 修复分批建议为提案性质，待逐项裁定后方可执行
