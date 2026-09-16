---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks
description: "用户触发 /polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks 或要求在 design 完成后（或 plan 已确认跳过 design）写实施计划 / 细化 tasks.md / 按 writing-plans 拆任务时必须使用本 skill。细计划基于 OpenSpec 四件套（proposal/design/specs/tasks 粗骨架）+ detailed-design.md（若已深化）推导；先询问用户 TDD 策略（prefer_tdd / require_tdd / prefer_direct），再按 Superpowers writing-plans（骨架模式）覆写 tasks.md、标注 TDD/非TDD，并派发 tasks-review-agent 做独立主审（可选 Outside Voice）。不要用于：specify/plan 阶段、尚未完成 design 且尚未确认跳过 design、或已进入 build 要求直接写代码。"
---

# Polaris 工作流 - 阶段：任务规划（tasks）

<HARD-GATE>
本 skill **仅**负责：以 **OpenSpec 四件套（+ `detailed-design.md` 若已深化）** 为唯一规划依据，覆写可执行的 `openspec/changes/<task_id>/tasks.md`，并经 `tasks-review-agent` 独立主审通过后才放行 build。

- **禁止**未完整阅读规划依据就开始写计划（见下方「规划依据」；禁止凭对话记忆 / 口头一句话 / 只看粗骨架 tasks 拆任务）
- **禁止**未确认 design 状态就开始写计划——须满足其一：`runtime.design.status=completed` 且 `detailed-design.md` 存在（已深化），或 `runtime.design.status=skipped`（plan 已确认跳过深化，`detailed-design.md` 缺失合法）
- **禁止**跳过 Superpowers `writing-plans`（不可用则阻断；加载后必须按下方「骨架模式」落地，禁止原样照抄每步贴完整实现代码 / 每任务 commit）
- **禁止**主代理在覆写 `tasks.md` 前未 `read_file templates/tasks-template.md`
- **禁止**另写 `docs/superpowers/plans/*.md` 或 `.polaris/tasks/*/implementation-plan.md` 作为主产物——**唯一**实施计划是 `openspec/changes/<task_id>/tasks.md`（覆写，不是并列第二份）
- **禁止**跳过 `tasks-lint.sh` 或脑补核对
- **禁止**跳过 Step 6 主审：必须派发 `tasks-review-agent`，并注入本 skill 的 `StandardsRoot`（agent 须读完 `policies/` + `references/` 标准文档；禁止主代理自审冒充；**主审不可跳过**）
- **禁止**跳过 Step 6 Outside Voice **询问**（按 `./reference/outside-voice.md`；用户可选跳过 OV，但不得由 AI 代决）
- **禁止**在本阶段编写业务实现代码 / 调用 `/opsx:apply`（那是 build）
- **禁止**借机重写 `proposal.md` / 高层 `design.md` 的范围与架构结论；缺口只进 review 消化或回 design，不在 plan 静默改 Scope
- **禁止**写出规划依据中不存在的需求 / 模块 / 验收场景（YAGNI；多出来的任务 = 失败）
- **禁止**未按 `./reference/decision-point.md` 获得用户对 **TDD 策略**（Step 2）的明确选择，就进入 Step 4 覆写 `tasks.md`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]任务规划- 进入阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks 技能。`

## 标识约定

### 规划依据（只读；细计划必须从中推导）

| 来源 | 路径 | 提供什么 |
|------|------|----------|
| OpenSpec 四件套 | `openspec/changes/<task_id>/proposal.md` | Why / Scope / 非目标 |
| | `openspec/changes/<task_id>/design.md` | 高层架构与选型 |
| | `openspec/changes/<task_id>/specs/**/*.md` | 需求与验收场景（任务覆盖的主清单） |
| | `openspec/changes/<task_id>/tasks.md` | plan **粗骨架**（结构参考；**不是**范围真理，将被覆写） |
| 深度设计 | `openspec/changes/<task_id>/detailed-design.md` | 实现方案、风险、测试策略、边界、模块/接口细节（**仅 `runtime.design.status=completed` 时存在**；`skipped` 时无此依据，细计划仅由四件套推导） |

冲突裁决：**specs 定「做什么」；detailed-design 定「怎么拆怎么测」（`runtime.design.status=skipped` 时由四件套 `design.md` 推导）；高层 design.md / proposal 定边界。** 粗骨架 tasks 与三者冲突时，以三者为准并覆写 tasks。

### 其它

- 设计评审（只读，若有）：`openspec/changes/<task_id>/reviews/design-review-report.md`
- **主产物（覆写）**：`openspec/changes/<task_id>/tasks.md`
- 计划主审报告：`openspec/changes/<task_id>/reviews/tasks-review-report.md`（由 Step 6 落盘）
- Outside Voice 报告（若运行）：`openspec/changes/<task_id>/reviews/openspec-review-report.md`
- workflow 游标：`.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.sh`）
- 运行态：`.polaris/tasks/<task_id>/state.yaml`

> **链路**：`specify → plan → (design 可选) → **tasks** → build → verify → ship → retro(可选)`。  
> 细计划 = f(四件套, detailed-design 若有)；plan 的 tasks 只是输入粗骨架。主审走 `tasks-review-agent`；可选 Outside Voice 走 `openspec-review-agent`。

## 有效 vs 无效（写计划前默念）

| 有效做法 | 无效做法 | 为什么 |
|----------|----------|--------|
| 每步含可复制命令 + 期望失败/成功信号 | 「实现认证」「补边界」 | Agent 会填空猜 |
| 任务边界 = 可独立验收的交付物 | 按层拆（先全写 model 再全写 API） | 中间态不可测、难回滚 |
| 先问清 TDD 策略，再按策略给每条任务标 `<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->` | 不询问就一律 TDD / 一律非 TDD / 到 build 再选 | 计划形态与执行节奏脱节；配置伪 TDD 或逻辑跳 RED |
| 禁止 TBD / TODO /「类似 Task N」 | 占位符计划 | 执行会话零上下文会瞎编 |
| **派 `tasks-review-agent`** 独立主审 | 主代理写完自夸「看起来完整」 | 写计划的人看不见自己的洞 |
| 脚手架/文档折进消费它的任务 | 单独「搭脚手架」无验收 | 无独立可测交付 |
| **Interfaces** 写清 Consumes/Produces | 后任务引用未定义符号 | 跨任务类型漂移 |

---

## 流程（按顺序执行；任一步未完成不得进入下一步）

```
TODO 待补充内部流程过程
```

每个阶段的"做什么"在对应 policy 文件，本 SKILL.md 仅承载入口、HARD-GATE 锚点与跨阶段衔接。

### Step 0：定位 任务标识 + 入口校验

用 bash 读取工作流配置中有效变更的`task_id`：

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind coding --skill tasks --repo-root "$REPO_ROOT" --phase tasks)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `task_id`
- **多个匹配**：按 `./reference/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 design 阶段的 active change，请先执行 /polaris-flow-design」

> 若 entry 已是 `phase=tasks`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。

**入口校验**（失败 → 阻断）：

| 检查 | 条件 |
|------|------|
| 深度设计状态 | 二选一：`runtime.design.status=completed` 且 `detailed-design.md` 非空（frontmatter 含 `role: technical-design`）；或 `runtime.design.status=skipped`（plan 已确认跳过深化） |
| 四件套存在 | `openspec/changes/<task_id>/` 下 `proposal.md`、`design.md`、`tasks.md` 非空，`specs/` 至少一非空文件 |
| 设计评审 | 若存在 `reviews/design-review-report.md` 且 Verdict=`BLOCK` / 未消化 Critical → 阻断，回 design |
| 已有细计划 | 若 `runtime.tasks.status=completed` 且 `tasks.md` 已细计划 → 询问 A 修订覆写 / B 退出（禁止静默覆盖） |

通过后更新 `state.yaml`：`phase: tasks`，`runtime.tasks.status: in_progress`。

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase tasks
```
输出：`[polaris-flow 开发]任务规划: task_id=<task_id> ; phase=tasks`

### Step 1：读取规划依据（OpenSpec 四件套 + detailed-design 若有）

**必读全文**（勿用摘要替代；读完再进入 Step 2）：

1. `openspec/changes/<task_id>/proposal.md`
2. `openspec/changes/<task_id>/design.md`
3. `openspec/changes/<task_id>/specs/**/*.md`（目录下每个非空 spec）
4. `openspec/changes/<task_id>/tasks.md`（粗骨架，仅作结构参考）
5. `openspec/changes/<task_id>/detailed-design.md`（**仅 `runtime.design.status=completed` 时必读**；`skipped` 时此文件不存在，跳过）

**禁止**凭对话记忆或只读粗骨架 `tasks.md` 开写。读完输出：

`[polaris-flow 开发]任务规划: 规划依据已读 — proposal / design / specs(N=<文件数>) / tasks(粗) / detailed-design（或 design=skipped）`

若存在则一并只读：

- `openspec/changes/<task_id>/reviews/design-review-report.md`
- `openspec/changes/<task_id>/*-design.md`（专项设计，如有；排除四件套 `design.md`）
- `openspec/changes/<task_id>/intention.md`（冲突以四件套 + detailed-design 若有为准）

### Step 2：TDD 策略（用户决策点）

在加载 `writing-plans`、拆任务、覆写 `tasks.md` **之前**，必须按 `./reference/decision-point.md` 暂停，询问本次 change 的 TDD 策略。  
**推荐只能说明，不能代选。** 选定前禁止进入 Step 3。

向用户说明：TDD 决定的是 **tasks.md 里每条顶层任务的子步骤形态**（TDD=5 步 / 非 TDD=3 步），不是 build 阶段再选的全局开关；build 将严格按标注执行。

| 选项 | 写入值 | 含义 | 适用 |
|------|--------|------|------|
| **A**（默认推荐） | `prefer_tdd` | **按任务类型标注**：新功能 / Bug 修复 / 含分支逻辑 → `<!-- TDD 任务 -->`；配置 / 重命名 / 文档 / 依赖升级 / 纯脚手架 → `<!-- 非 TDD 任务 -->`；无法判断 → **默认 TDD** | 大多数标准变更 |
| **B** | `require_tdd` | **从紧**：凡含行为或接口变更的任务一律 TDD；仅纯文档 / 纯文案可标非 TDD | 高风险、核心业务、安全相关 |
| **C** | `prefer_direct` | **从宽**：默认非 TDD（三步）；仅当 `detailed-design` 测试策略点名（若已深化）、或用户在本决策中另行指定的任务标 TDD | hotfix、探索性小改、明确不要求测试覆盖时 |

写入 `$REPO_ROOT/.polaris/tasks/<task_id>/state.yaml`：

```yaml
runtime:
  plan:
    tdd_policy: <prefer_tdd|require_tdd|prefer_direct>
```

输出：`[polaris-flow 开发]任务规划: tdd_policy=<值>`

**续跑**：若 `runtime.tasks.tdd_policy` 已存在 → 展示当前值，按 decision-point 问是否沿用；沿用则跳过改写，不沿用则更新后再进 Step 3。

> 用户若要改**个别**任务的 TDD/非 TDD：在本步选 A/B/C 定总策略后，可在 Step 4 覆写前用 decision-point 追加例外清单；例外必须写进 tasks 标注，并在自审中可追溯。禁止留到 build 再改策略。

### Step 3：加载 writing-plans + tasks 模板

#### 3.1 Superpowers `writing-plans`

**立即执行：** 加载 Superpowers `writing-plans`。不可用 → 阻断并提示安装 superpowers。

输出：`[polaris-flow 开发]任务规划 plan: 已加载 writing-plans（将按骨架模式落地）`

**骨架模式（相对原 skill 的强制改写——违反即计划不合格）：**

| writing-plans 原要求 | 本阶段落地 |
|----------------------|------------|
| 每步贴完整实现代码 | **禁止**大段实现代码；子步骤只写「改哪些路径 / 测什么行为 / 跑什么命令」 |
| 每任务 `git commit` | **禁止**（commit 交给 ship） |
| 存 `docs/superpowers/plans/...` | **禁止**；只覆写 `openspec/.../tasks.md` |
| 自审后直接给执行选项 | 自审后必须先经 `tasks-review-agent`（及 OV 询问），再提示进入 build |
| 假设执行者零上下文 | **保留**：路径、命令、期望输出、Interfaces 必须自洽 |
| TDD 五步节奏 | **保留**（当 `tdd_policy` 允许该任务为 TDD 时），映射为 `<!-- TDD 任务 -->` 的 1.x.1–1.x.5 |
| 配置/文档类 | 映射为 `<!-- 非 TDD 任务 -->` 三步，勿伪造成 RED/GREEN |

骨架模式须服从 Step 2 的 `tdd_policy`：`prefer_direct` 下不得把配置类以外的任务强行全部打成 TDD；`require_tdd` 下不得把含行为变更的任务标成非 TDD。

#### 3.2 强制重读模板

```text
read_file ./templates/tasks-template.md
```

输出：`[polaris-flow plan] 已读取任务模板(tasks-template.md)`

### Step 4：文件地图 → 任务分解 → 覆写 tasks.md

#### 4.1 从规划依据推导（先覆盖，再拆步）

写 checkbox 前必须完成覆盖表（可写在对话中，不必落盘）：

| 依据条目 | 来源节/路径 | 对应将写入的顶层任务 |
|----------|-------------|----------------------|
| 每条 spec requirement / 验收场景 | `specs/` | Task … |
| detailed-design 实现方案中的模块/接口 | `detailed-design.md`（仅 `runtime.design.status=completed`；`skipped` 时跳过此行） | Task … |
| 测试策略与关键边界 | `detailed-design.md`（仅 `runtime.design.status=completed`；`skipped` 时由四件套 `design.md` 推导） | 落在相关 TDD 任务的 RED 步或独立验证步 |
| proposal 非目标 | `proposal.md` | **不得**出现对应任务 |

任一 spec 需求或 detailed-design 必做模块（若有）无对应任务 → 先补行，再写 tasks.md。

#### 4.2 文件结构地图

在覆盖表之后，锁定：

- 将创建 / 修改 / 测试的**精确路径**（优先采用 detailed-design 已点名的路径；`skipped` 时以四件套 `design.md` 为准）
- 模块边界与依赖方向（与 detailed-design（若有）+ 高层 design.md 一致）
- 哪些任务 TDD、哪些非 TDD——**必须服从 Step 2 的 `tdd_policy`**（见下表）；用户声明的例外优先于默认规则

| `tdd_policy` | 标注规则 |
|--------------|----------|
| `prefer_tdd` | 逻辑/API/bugfix → TDD；配置/文档/脚手架 → 非 TDD；无法判断 → **默认 TDD** |
| `require_tdd` | 含行为或接口变更 → **必须 TDD**；仅纯文档/文案 → 非 TDD |
| `prefer_direct` | **默认非 TDD**；仅 detailed-design 测试策略点名（若已深化）或用户例外清单中的任务 → TDD |

#### 4.3 任务粒度

沿用 writing-plans 的 Task Right-Sizing：

- 一个顶层任务 = 带自身验证环、值得独立评审的最小交付
- 脚手架 / 配置 / 文档同步：**折进**需要它的交付任务；禁止无验收的「纯脚手架」顶层任务
- 子步骤：TDD=5 步 / 非 TDD=3 步（见模板）；每步约 2–5 分钟量级的**一个动作**
- **不要**按 plan 粗骨架原样加细——粗骨架可拆可并，以 specs + detailed-design（若有）覆盖为准

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

将完整计划写入（**覆写**）`openspec/changes/<task_id>/tasks.md`。  
最后一组必须是 Documentation Sync（见模板）。  
输出：`[polaris-flow 开发]任务规划: 已写 openspec/changes/<task_id>/tasks.md`

### Step 5：自审 + tasks-lint

#### 5.1 自审（主代理，writing-plans Self-Review）

1. **规划依据覆盖**：`proposal` Scope、每条 `specs` 需求/场景、`detailed-design` 实现模块与测试策略（若已深化）——能否指出对应任务？非目标是否被误写入？缺口列出并补任务。
2. **占位符扫描**：全文搜失败标志，清零。
3. **类型/接口一致**：后任务 Consumes 与前任务 Produces 同名同义。
4. **TDD 标注**：每条顶层任务有且仅有一种 HTML 注释类型；标注与 `runtime.tasks.tdd_policy` + 例外清单一致（`require_tdd` 下不得把行为变更标成非 TDD；`prefer_direct` 下不得无依据地把任务全打成 TDD）。

#### 5.2 脚本校验（禁止脑补）

```bash
LINT_RESULT=$(bash "$PLUGIN_ROOT/scripts/tasks-lint.sh" "openspec/changes/$task_id/tasks.md")
LINT_EXIT=$?
```

- exit 0 → 通过
- exit 1 → **阻断**，输出 `$LINT_RESULT`，修正后重跑本步

### Step 6：独立主审 — `tasks-review-agent`（阻塞点）

本步**只负责派发**主审 subagent；评审标准在 `tasks-review-agent` 内。**禁止**主代理用「自检清单」冒充。**主审不可跳过。**

#### 6.1 主审

1. **能力**：读 SessionStart 注入（`SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION`；全量清单在 `$SUBAGENT_PROBE_CACHE`，勿假定 additionalContext 含 agents）。
   - `PLATFORM_DEGRADATION=inline|unsupported` → **阻断**（计划无独立主审不得进 build；与 design 可跳过主审不同）。不得 inline 假评审。**不调** probe。
   - `SUPPORTS_SUBAGENT=true`（degradation 空）→ **不调** probe，直接 Step 6.1.2 派发固定 `tasks-review-agent`（可选用缓存核对 id 是否在清单中）。
   - **缺注入** → 调用 `polaris{{SKN_SPR}}subagent-probe`（传入 `platform`；**优先读** `$SUBAGENT_PROBE_CACHE`，勿重复扫盘）。`inline` / `unsupported` → 同上阻断。
2. **解析 StandardsRoot**：本 skill 安装根目录（含 `policies/`、`references/`、`prompts/`）。例：`$PLUGIN_ROOT/tasks`（nested）或项目 skills 下的 `polaris-flow-tasks`（flat）。目录缺失 → 阻断，提示 `polaris-flow init/update`。
3. **派发**：注册名 / `subagent_type` = `tasks-review-agent`（init 已装到 `.<platform>/agents/`）。文件缺失 → 阻断。

   **按 `subagent-delegate-policy.md` 执行派发**（D-0 工具可用性判定 → D-1 路径引用型 / D-2 内容注入型）。传入参数：

   - `stage_fields`:
     ```text
     tdd_policy: <prefer_tdd|require_tdd|prefer_direct>
     StandardsRoot: <本 skill 安装绝对或仓库相对根路径>
     ```
   - `materials`（按以下顺序构造）：
     1. `./policies/scope-challenge.md`
     2. `./policies/four-section-review.md`
     3. `./references/engineering-mindset.md`
     4. `./references/test-review-methodology.md`
     5. `./templates/review-report-template.md`
     5. `openspec/changes/<task_id>/tasks.md`
     6. `openspec/changes/<task_id>/proposal.md`
     7. `openspec/changes/<task_id>/design.md`
     8. `openspec/changes/<task_id>/specs/**/*.md`（每个非空文件）
     9. 若有（`runtime.design.status=completed`）：`openspec/changes/<task_id>/detailed-design.md`
     10. 若有：`openspec/changes/<task_id>/reviews/design-review-report.md`
     11. 若有：`openspec/changes/<task_id>/*-design.md`（专项设计；排除四件套 `design.md`）
     12. 若有：`openspec/changes/<task_id>/intention.md`

   D-1 下 agent 自读上述路径；D-2 下主代理 Read 全部全文（含四份标准文档）拼入 `Materials:` 段；`StandardsRoot` 在 D-2 下仅作溯源标注用。

4. **落盘**：确保 `openspec/changes/<task_id>/reviews/` 存在；将完整 **Plan Review Report** 写入 `openspec/changes/<task_id>/reviews/tasks-review-report.md`。

输出：`[polaris-flow 开发]任务规划: tasks-review-agent 已完成，报告已落盘`

#### 6.2 Outside Voice（询问后可选）

1. `read_file` `./reference/outside-voice.md` 并按其执行。
2. 按复杂度给出建议，decision-point：**A 启动** / **B 跳过**（AI 不得代决）。
3. 用户选 A → 填充本 skill 的 `prompts/main-review-summary.tmpl.md`，派发 `openspec-review-agent`。

   **按 `subagent-delegate-policy.md` 执行派发**（D-0 判定 → D-1 路径引用型 / D-2 内容注入型）。传入参数：

   - `stage_fields`:
     ```text
     Stage: plan
     ```
   - `materials`:
     1. `openspec/changes/<task_id>/reviews/tasks-review-report.md`（即 PrimaryReport，D-2 下全文拼入）
     2. `openspec/changes/<task_id>/proposal.md`
     3. `openspec/changes/<task_id>/design.md`
     4. `openspec/changes/<task_id>/specs/**/*.md`（每个非空文件）
     5. `openspec/changes/<task_id>/tasks.md`
     6. 若有（`runtime.design.status=completed`）：`openspec/changes/<task_id>/detailed-design.md`

   （模板内 findings 摘录从刚落盘的 `tasks-review-report.md` 填充；**不要**附带用户对 findings 的采纳决策。）

4. 通过可信度门禁后写入 `openspec/changes/<task_id>/reviews/openspec-review-report.md`。
5. 宿主无 subagent 时主审已在 6.1 阻断，不会到达本步的「无 subagent 自动跳过 OV」。

### Step 7：消化评审结论

读取 `reviews/tasks-review-report.md` 的 **STATUS**：

| STATUS | 处理 |
|--------|------|
| `DONE` | 处理 OV（若有）后进 Step 8 |
| `DONE_WITH_CONCERNS` | decision-point 逐条决策；需改 tasks → 改写 → 5.2 lint →（触及测试/依赖）重跑 Step 6.1，再询 OV |
| `BLOCKED` / `NEEDS_CONTEXT` | **禁止**进 Step 8。按 Failure modes / 测试缺口改 `tasks.md` → 5.2 → **必须重跑 6.1**（最多 3 轮；第 3 轮仍 BLOCKED → 升级用户：回 design 或缩 Scope） |

报告中「建议加入 tasks 的测试缺口」：**由本 skill 写入 `tasks.md`**，再 lint；TDD/非 TDD 仍服从 `tdd_policy`。

若有 OV：与主审 tension / P0/P1 按 outside-voice 用户主权逐条决策；**禁止**自动改 tasks。

未消化的 Critical / Important → 不得标记 plan 完成。

### Step 8：完成 tasks 阶段

更新 `state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase tasks
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.plan.status=completed \
  --set runtime.plan.tdd_policy=<prefer_tdd|require_tdd|prefer_direct> \
  --set runtime.plan.tasks_path=openspec/changes/<task_id>/tasks.md \
  --set runtime.plan.review_report=openspec/changes/<task_id>/reviews/tasks-review-report.md \
  --set "runtime.plan.outside_voice=<ran|skipped:<reason>>" \
  --set phase=idle
```

workflow阶段推进至详细构建阶段：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind coding --skill tasks --where-task-id "$task_id" --set phase=build
```

输出：

```
任务规划阶段完成：
  task_id     : <task_id>
  tdd_policy    : <prefer_tdd|require_tdd|prefer_direct>
  tasks.md      : openspec/changes/<task_id>/tasks.md（已覆写）
  review-report : openspec/changes/<task_id>/reviews/tasks-review-report.md
  outside-voice : <ran | skipped:...>
  STATUS        : <DONE | DONE_WITH_CONCERNS>

下一步建议 /polaris{{SKN_SPR}}coding{{SKN_SPR}}build（按 tasks.md 由 implementer 执行 /opsx:apply）。
```

## 退出条件

- 用户已明确选择 `runtime.tasks.tdd_policy`（Step 2）
- `tasks.md` 已按模板覆写，含与 `tdd_policy` 一致的 TDD/非TDD 标注、Files、Interfaces、可复制验证命令
- `tasks-lint.sh` exit 0
- `tasks-review-agent` 已跑完且 STATUS 为 `DONE` 或用户已消化完的 `DONE_WITH_CONCERNS`
- Outside Voice 已询问并完成（ran / 用户跳过）
- `phase=build`

## 上下文压缩恢复

重载：`task_id`、`runtime.tasks.tdd_policy`、`detailed-design.md`（若有）、当前 `tasks.md`、`reviews/tasks-review-report.md`、`reviews/openspec-review-report.md`（若有）、本 skill 停在哪一步。
若停在 Step 2 未选定 → 先完成 TDD 策略再写 tasks。  
若停在 `runtime.tasks.status=in_progress` 且 tasks 已写未评审 → 从 Step 5.2 / Step 6 续，勿无故重写全部任务（除非用户要求改 `tdd_policy`，则须重跑 Step 2→4）。
