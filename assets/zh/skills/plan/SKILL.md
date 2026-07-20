<!--
  简要说明：
  - 职责：以四件套 + detailed-design 覆写可执行 tasks.md，询问 TDD 策略，并经 plan-review 独立放行。
  - 主产物：`openspec/changes/<change_id>/tasks.md`（覆写）+ `reviews/plan-review-report.md`。
  - 上游 / 下游：design → 本阶段 → build。
-->

---
name: polaris-flow-plan
description: "用户触发 /polaris-flow-plan、/plan，或要求在 design 完成后写实施计划 / 细化 tasks.md / 按 writing-plans 拆任务时必须使用本 skill。细计划必须基于 OpenSpec 四件套（proposal/design/specs/tasks 粗骨架）+ detailed-design.md 全文推导；先询问用户 TDD 策略（prefer_tdd / require_tdd / prefer_direct），再按 Superpowers writing-plans（骨架模式）覆写 tasks.md、标注 TDD/非TDD，并调用 plan-review 做独立评审。不要用于：clarify/propose 阶段、尚未完成 design、或已进入 build 要求直接写代码。"
---

# Polaris 工作流 - 阶段：任务规划（plan）

<HARD-GATE>
本 skill **仅**负责：以 **OpenSpec 四件套 + `detailed-design.md`** 为唯一规划依据，覆写可执行的 `openspec/changes/<change_id>/tasks.md`，并经 `plan-review` 独立评审通过后才放行 build。

- **禁止**未完整阅读规划依据就开始写计划（见下方「规划依据」；禁止凭对话记忆 / 口头一句话 / 只看粗骨架 tasks 拆任务）
- **禁止**未确认 `detailed-design.md` 存在且 `design.status=completed`（或用户明示接受续跑）就开始写计划
- **禁止**跳过 Superpowers `writing-plans`（不可用则阻断；加载后必须按下方「骨架模式」落地，禁止原样照抄每步贴完整实现代码 / 每任务 commit）
- **禁止**主代理在覆写 `tasks.md` 前未 `read_file templates/tasks-template.md`
- **禁止**另写 `docs/superpowers/plans/*.md` 或 `.polaris/tasks/*/implementation-plan.md` 作为主产物——**唯一**实施计划是 `openspec/changes/<change_id>/tasks.md`（覆写，不是并列第二份）
- **禁止**跳过 `tasks-lint.sh` 或脑补核对
- **禁止**跳过 Step 6：必须加载并执行 `plan-review`（独立评审；禁止主代理自审冒充）
- **禁止**在本阶段编写业务实现代码 / 调用 `/opsx:apply`（那是 build）
- **禁止**借机重写 `proposal.md` / 高层 `design.md` 的范围与架构结论；缺口只进 review 消化或回 design，不在 plan 静默改 Scope
- **禁止**写出规划依据中不存在的需求 / 模块 / 验收场景（YAGNI；多出来的任务 = 失败）
- **禁止**未按 `.polaris/reference/decision-point.md` 获得用户对 **TDD 策略**（Step 2）的明确选择，就进入 Step 4 覆写 `tasks.md`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入阶段: plan — 使用 polaris-flow-plan 技能。`

## 标识约定

### 规划依据（只读；细计划必须从中推导）

| 来源 | 路径 | 提供什么 |
|------|------|----------|
| OpenSpec 四件套 | `openspec/changes/<change_id>/proposal.md` | Why / Scope / 非目标 |
| | `openspec/changes/<change_id>/design.md` | 高层架构与选型 |
| | `openspec/changes/<change_id>/specs/**/*.md` | 需求与验收场景（任务覆盖的主清单） |
| | `openspec/changes/<change_id>/tasks.md` | propose **粗骨架**（结构参考；**不是**范围真理，将被覆写） |
| 深度设计 | `openspec/changes/<change_id>/detailed-design.md` | 实现方案、风险、测试策略、边界、模块/接口细节 |

冲突裁决：**specs 定「做什么」；detailed-design 定「怎么拆怎么测」；高层 design.md / proposal 定边界。** 粗骨架 tasks 与三者冲突时，以三者为准并覆写 tasks。

### 其它

- **`change_id`**：与 clarify / propose / design 同值
- 设计评审（只读，若有）：`openspec/changes/<change_id>/reviews/design-review-report.md`
- **主产物（覆写）**：`openspec/changes/<change_id>/tasks.md`
- 计划评审报告：`openspec/changes/<change_id>/reviews/plan-review-report.md`（由 `plan-review` 写入）
- workflow 游标：`.polaris/workflow.yaml`（写入走 `hooks/workflow-entry.sh`）
- 运行态：`.polaris/tasks/<change_id>/state.yaml`

> **链路**：`clarify → propose → design → **plan** → build`。  
> 细计划 = f(四件套, detailed-design)；propose 的 tasks 只是输入粗骨架。独立审查走 `plan-review`。

## 有效 vs 无效（写计划前默念）

| 有效做法 | 无效做法 | 为什么 |
|----------|----------|--------|
| 每步含可复制命令 + 期望失败/成功信号 | 「实现认证」「补边界」 | Agent 会填空猜 |
| 任务边界 = 可独立验收的交付物 | 按层拆（先全写 model 再全写 API） | 中间态不可测、难回滚 |
| 先问清 TDD 策略，再按策略给每条任务标 `<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->` | 不询问就一律 TDD / 一律非 TDD / 到 build 再选 | 计划形态与执行节奏脱节；配置伪 TDD 或逻辑跳 RED |
| 禁止 TBD / TODO /「类似 Task N」 | 占位符计划 | 执行会话零上下文会瞎编 |
| **换 skill 上下文**跑 `plan-review` | 主代理写完自夸「看起来完整」 | 写计划的人看不见自己的洞 |
| 脚手架/文档折进消费它的任务 | 单独「搭脚手架」无验收 | 无独立可测交付 |
| **Interfaces** 写清 Consumes/Produces | 后任务引用未定义符号 | 跨任务类型漂移 |

---

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：定位 change_id + 入口校验

读取 `.polaris/workflow.yaml: active_changes`，筛选 `phase=design` 的 entry：

- **唯一匹配**：取其 `change_id`
- **多个匹配**：按 `.polaris/reference/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 design 阶段的 active change，请先执行 /polaris-flow-design」

> 若 entry 已是 `phase=plan`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。

**入口校验**（失败 → 阻断）：

| 检查 | 条件 |
|------|------|
| 深度设计已落盘 | `openspec/changes/<change_id>/detailed-design.md` 非空，且 frontmatter 含 `role: technical-design` |
| 四件套存在 | `openspec/changes/<change_id>/` 下 `proposal.md`、`design.md`、`tasks.md` 非空，`specs/` 至少一非空文件 |
| 设计评审 | 若存在 `reviews/design-review-report.md` 且 Verdict=`BLOCK` / 未消化 Critical → 阻断，回 design |
| 已有细计划 | 若 `plan.status=completed` 且 `tasks.md` 已细计划 → 询问 A 修订覆写 / B 退出（禁止静默覆盖） |

通过后：

```bash
CONFIG_FILE="$REPO_ROOT/.polaris/config.yaml"
PLUGIN_ROOT="$(cat "$CONFIG_FILE" | grep "plugin_root" | awk -F'"' '{print $2}')"
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill plan \
  --where-change-id "$change_id" --set phase=plan
```

更新 `state.yaml`：`current_verb: plan`，`plan.status: in_progress`。  
输出：`[polaris-flow] plan: change_id=<change_id> ; phase=plan`

### Step 1：读取规划依据（OpenSpec 四件套 + detailed-design）

**必读全文**（勿用摘要替代；读完再进入 Step 2）：

1. `openspec/changes/<change_id>/proposal.md`
2. `openspec/changes/<change_id>/design.md`
3. `openspec/changes/<change_id>/specs/**/*.md`（目录下每个非空 spec）
4. `openspec/changes/<change_id>/tasks.md`（粗骨架，仅作结构参考）
5. `openspec/changes/<change_id>/detailed-design.md`

**禁止**凭对话记忆或只读粗骨架 `tasks.md` 开写。读完输出：

`[polaris-flow] plan: 规划依据已读 — proposal / design / specs(N=<文件数>) / tasks(粗) / detailed-design`

若存在则一并只读：

- `openspec/changes/<change_id>/reviews/design-review-report.md`
- `openspec/changes/<change_id>/*-design.md`（专项设计；排除四件套 `design.md`）
- `openspec/changes/<change_id>/intention.md`（冲突以四件套 + detailed-design 为准）

### Step 2：TDD 策略（用户决策点）

在加载 `writing-plans`、拆任务、覆写 `tasks.md` **之前**，必须按 `.polaris/reference/decision-point.md` 暂停，询问本次 change 的 TDD 策略。  
**推荐只能说明，不能代选。** 选定前禁止进入 Step 3。

向用户说明：TDD 决定的是 **tasks.md 里每条顶层任务的子步骤形态**（TDD=5 步 / 非 TDD=3 步），不是 build 阶段再选的全局开关；build 将严格按标注执行。

| 选项 | 写入值 | 含义 | 适用 |
|------|--------|------|------|
| **A**（默认推荐） | `prefer_tdd` | **按任务类型标注**：新功能 / Bug 修复 / 含分支逻辑 → `<!-- TDD 任务 -->`；配置 / 重命名 / 文档 / 依赖升级 / 纯脚手架 → `<!-- 非 TDD 任务 -->`；无法判断 → **默认 TDD** | 大多数标准变更 |
| **B** | `require_tdd` | **从紧**：凡含行为或接口变更的任务一律 TDD；仅纯文档 / 纯文案可标非 TDD | 高风险、核心业务、安全相关 |
| **C** | `prefer_direct` | **从宽**：默认非 TDD（三步）；仅当 `detailed-design` 测试策略点名、或用户在本决策中另行指定的任务标 TDD | hotfix、探索性小改、明确不要求测试覆盖时 |

写入 `.polaris/tasks/<change_id>/state.yaml`：

```yaml
plan:
  tdd_policy: <prefer_tdd|require_tdd|prefer_direct>
```

输出：`[polaris-flow] plan: tdd_policy=<值>`

**续跑**：若 `plan.tdd_policy` 已存在 → 展示当前值，按 decision-point 问是否沿用；沿用则跳过改写，不沿用则更新后再进 Step 3。

> 用户若要改**个别**任务的 TDD/非 TDD：在本步选 A/B/C 定总策略后，可在 Step 4 覆写前用 decision-point 追加例外清单；例外必须写进 tasks 标注，并在自审中可追溯。禁止留到 build 再改策略。

### Step 3：加载 writing-plans + tasks 模板

#### 3.1 Superpowers `writing-plans`

**立即执行：** 加载 Superpowers `writing-plans`。不可用 → 阻断并提示安装 superpowers。

输出：`[polaris-flow] plan: 已加载 writing-plans（将按骨架模式落地）`

**骨架模式（相对原 skill 的强制改写——违反即计划不合格）：**

| writing-plans 原要求 | 本阶段落地 |
|----------------------|------------|
| 每步贴完整实现代码 | **禁止**大段实现代码；子步骤只写「改哪些路径 / 测什么行为 / 跑什么命令」 |
| 每任务 `git commit` | **禁止**（commit 交给 ship） |
| 存 `docs/superpowers/plans/...` | **禁止**；只覆写 `openspec/.../tasks.md` |
| 自审后直接给执行选项 | 自审后必须先经 `plan-review`，再提示进入 build |
| 假设执行者零上下文 | **保留**：路径、命令、期望输出、Interfaces 必须自洽 |
| TDD 五步节奏 | **保留**（当 `tdd_policy` 允许该任务为 TDD 时），映射为 `<!-- TDD 任务 -->` 的 1.x.1–1.x.5 |
| 配置/文档类 | 映射为 `<!-- 非 TDD 任务 -->` 三步，勿伪造成 RED/GREEN |

骨架模式须服从 Step 2 的 `tdd_policy`：`prefer_direct` 下不得把配置类以外的任务强行全部打成 TDD；`require_tdd` 下不得把含行为变更的任务标成非 TDD。

#### 3.2 强制重读模板

```text
read_file templates/tasks-template.md
```

输出：`[polaris-flow plan] 已 read_file templates/tasks-template.md`

### Step 4：文件地图 → 任务分解 → 覆写 tasks.md

#### 4.1 从规划依据推导（先覆盖，再拆步）

写 checkbox 前必须完成覆盖表（可写在对话中，不必落盘）：

| 依据条目 | 来源节/路径 | 对应将写入的顶层任务 |
|----------|-------------|----------------------|
| 每条 spec requirement / 验收场景 | `specs/` | Task … |
| detailed-design 实现方案中的模块/接口 | `detailed-design.md` | Task … |
| 测试策略与关键边界 | `detailed-design.md` | 落在相关 TDD 任务的 RED 步或独立验证步 |
| proposal 非目标 | `proposal.md` | **不得**出现对应任务 |

任一 spec 需求或 detailed-design 必做模块无对应任务 → 先补行，再写 tasks.md。

#### 4.2 文件结构地图

在覆盖表之后，锁定：

- 将创建 / 修改 / 测试的**精确路径**（优先采用 detailed-design 已点名的路径）
- 模块边界与依赖方向（与 detailed-design + 高层 design.md 一致）
- 哪些任务 TDD、哪些非 TDD——**必须服从 Step 2 的 `tdd_policy`**（见下表）；用户声明的例外优先于默认规则

| `tdd_policy` | 标注规则 |
|--------------|----------|
| `prefer_tdd` | 逻辑/API/bugfix → TDD；配置/文档/脚手架 → 非 TDD；无法判断 → **默认 TDD** |
| `require_tdd` | 含行为或接口变更 → **必须 TDD**；仅纯文档/文案 → 非 TDD |
| `prefer_direct` | **默认非 TDD**；仅 detailed-design 测试策略点名或用户例外清单中的任务 → TDD |

#### 4.3 任务粒度

沿用 writing-plans 的 Task Right-Sizing：

- 一个顶层任务 = 带自身验证环、值得独立评审的最小交付
- 脚手架 / 配置 / 文档同步：**折进**需要它的交付任务；禁止无验收的「纯脚手架」顶层任务
- 子步骤：TDD=5 步 / 非 TDD=3 步（见模板）；每步约 2–5 分钟量级的**一个动作**
- **不要**按 propose 粗骨架原样加细——粗骨架可拆可并，以 specs + detailed-design 覆盖为准

#### 4.4 每条顶层任务必须含

```markdown
- [ ] N.M {{TASK_NAME}}  <!-- TDD 任务 | 非 TDD 任务 -->

  **Files:**
  - Create / Modify: `exact/path`
  - Test: `exact/test/path`   # 非 TDD 可省略 Test 行，但必须有验证命令

  **Interfaces:**
  - Consumes: [先前任务已产生的符号 / 路径 / 行为——写全签名或约定]
  - Produces: [后续任务依赖的符号 / 路径 / 行为]

  - [ ] N.M.1 ...
  - [ ] N.M.2 ...   # 含可复制命令与期望输出
```

**禁止出现的计划失败标志**（写入即不合格，自审必须清掉）：

- `TBD` / `TODO` / `implement later` / `类似 Task N` / `<placeholder>`
- 「补充适当错误处理」「写测试覆盖上述内容」（无具体路径与命令）
- 引用从未在任何任务 Produces 中出现的类型 / 函数名

#### 4.5 覆写落盘

将完整计划写入（**覆写**）`openspec/changes/<change_id>/tasks.md`。  
最后一组必须是 Documentation Sync（见模板）。  
输出：`[polaris-flow] plan: wrote openspec/changes/<change_id>/tasks.md`

### Step 5：自审 + tasks-lint

#### 5.1 自审（主代理，writing-plans Self-Review）

1. **规划依据覆盖**：`proposal` Scope、每条 `specs` 需求/场景、`detailed-design` 实现模块与测试策略——能否指出对应任务？非目标是否被误写入？缺口列出并补任务。
2. **占位符扫描**：全文搜失败标志，清零。
3. **类型/接口一致**：后任务 Consumes 与前任务 Produces 同名同义。
4. **TDD 标注**：每条顶层任务有且仅有一种 HTML 注释类型；标注与 `plan.tdd_policy` + 例外清单一致（`require_tdd` 下不得把行为变更标成非 TDD；`prefer_direct` 下不得无依据地把任务全打成 TDD）。

#### 5.2 脚本校验（禁止脑补）

```bash
LINT_RESULT=$(bash "$PLUGIN_ROOT/hooks/tasks-lint.sh" "openspec/changes/$change_id/tasks.md")
LINT_EXIT=$?
```

- exit 0 → 通过
- exit 1 → **阻断**，输出 `$LINT_RESULT`，修正后重跑本步

### Step 6：独立评审 — 加载 `plan-review`（阻塞点）

本步**换评审上下文**：加载并执行 `plan-review` skill（即既有 lock / 工程评审技能），**禁止**主代理用一段「自检清单」代替。

按 `plan-review/references/caller-contract.md` 履约：

| 契约项 | 本 skill 取值 |
|--------|----------------|
| 提案材料 | `openspec/changes/<change_id>/` 四件套（proposal / design / specs / **刚覆写的 tasks.md**） |
| 报告路径 | `openspec/changes/<change_id>/reviews/plan-review-report.md` |
| 修改约束 | 评审期间 **plan-review 不改** tasks；消化与改写由**本 skill**在 Step 7 做 |
| STATUS 门禁 | 见 Step 7 |

启动时向 `plan-review` 注入：

```text
Change: <change_id>
Caller: polaris-flow-plan
tdd_policy: <prefer_tdd|require_tdd|prefer_direct>
Materials:
  - openspec/changes/<change_id>/proposal.md
  - openspec/changes/<change_id>/design.md
  - openspec/changes/<change_id>/specs/
  - openspec/changes/<change_id>/tasks.md
Report: openspec/changes/<change_id>/reviews/plan-review-report.md
Focus: 任务是否由 OpenSpec 四件套 + detailed-design 覆盖推导；粒度、依赖序、TDD/非TDD（是否符合 tdd_policy）、可执行性、测试缺口、有无超出 Scope 的臆造任务
```

输出：`[polaris-flow] plan: plan-review 已启动，等待 STATUS`

若宿主无法加载 `plan-review` → **阻断**（与 design 跳过 design-review 不同：计划无独立评审不得进 build）。

### Step 7：消化评审结论

读取 `reviews/plan-review-report.md` 的 **STATUS**：

| STATUS | 处理 |
|--------|------|
| `DONE` | 进入 Step 8 |
| `DONE_WITH_CONCERNS` | 按 decision-point 让用户逐条决策；需改 tasks 的 → 改写 → 5.2 lint →（若改动触及测试/依赖）可选择重跑 Step 6 |
| `BLOCKED` / `NEEDS_CONTEXT` | **禁止**进 Step 8。根据 Failure modes / 测试缺口改 `tasks.md` → 5.2 → **必须重跑 Step 6**（最多 3 轮；第 3 轮仍 BLOCKED → 升级用户：回 design 或缩 Scope） |

`plan-review` 列在报告中、建议加入 tasks 的测试缺口：**由本 skill 写入 tasks.md**（这正是 caller-contract 要求的「调用方统一更新」），然后再 lint。测试缺口任务的 TDD/非 TDD 标注仍服从 `tdd_policy`。

未消化的 Critical / Important → 不得标记 plan 完成。

### Step 8：完成 plan 阶段

更新 `state.yaml`：

```yaml
plan:
  status: completed
  tdd_policy: <prefer_tdd|require_tdd|prefer_direct>
  tasks_path: openspec/changes/<change_id>/tasks.md
  review_report: openspec/changes/<change_id>/reviews/plan-review-report.md
  finished_at: "<ISO>"
current_verb: idle
```

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill plan \
  --where-change-id "$change_id" --set phase=build
```

输出：

```
[polaris-flow] plan 阶段完成：
  change_id     : <change_id>
  tdd_policy    : <prefer_tdd|require_tdd|prefer_direct>
  tasks.md      : openspec/changes/<change_id>/tasks.md（已覆写）
  review-report : openspec/changes/<change_id>/reviews/plan-review-report.md
  STATUS        : <DONE | DONE_WITH_CONCERNS>

下一步建议 /polaris-flow-build（按 tasks.md 由 implementer 执行 /opsx:apply）。
```

## 退出条件

- 用户已明确选择 `plan.tdd_policy`（Step 2）
- `tasks.md` 已按模板覆写，含与 `tdd_policy` 一致的 TDD/非TDD 标注、Files、Interfaces、可复制验证命令
- `tasks-lint.sh` exit 0
- `plan-review` 已跑完且 STATUS 为 `DONE` 或用户已消化完的 `DONE_WITH_CONCERNS`
- `phase=build`

## 上下文压缩恢复

重载：`change_id`、`plan.tdd_policy`、`detailed-design.md`、当前 `tasks.md`、`reviews/plan-review-report.md`（若有）、本 skill 停在哪一步。
若停在 Step 2 未选定 → 先完成 TDD 策略再写 tasks。  
若停在 `plan.status=in_progress` 且 tasks 已写未评审 → 从 Step 5.2 / Step 6 续，勿无故重写全部任务（除非用户要求改 `tdd_policy`，则须重跑 Step 2→4）。
