---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}plan
description: "基于已锁定的 intention.md 生成 OpenSpec 四件套（proposal / specs / design / tasks）并经独立评审。当用户要求生成提案、写规格契约、做方案设计、产出 OpenSpec 四件套时使用。不要用于：澄清需求（走 specify）、深化为详细技术设计（走 design）、拆实施任务（走 tasks）。"
version: 0.1
---

# Polaris 工作流 - 阶段：提案（plan）

<HARD-GATE>
- **禁止**未检查 `intention.md` 存在性就调用 `/opsx:propose` / 开始生成四件套
  - 文件存在 → 必须读取全文后再调用
  - 文件不存在 → 必须先走 Step 3.2 fallback 声明，方可继续（不得静默跳过检查）
- **禁止**主代理在调用 `/opsx:propose` / 生成 `design.md` / 生成 `tasks.md` 之前未读取对应产物模板（`./templates/design-template.md`、`./templates/tasks-template.md`）
- **禁止**跳过 `./policies/artifact-batch-generation.md`：须按 4.3 已选模式执行分批生成（Mode A 含批内 §4；Mode B 跳过 §4）；禁止硬编码四件套结构；禁止主代理自审冒充制品审查
- **禁止**通过 `superpowers:using-git-worktrees` 创建 worktree——必须由本 skill Step 2.3.A 直接执行 git / hooks 完成
- **禁止**跳过 Step 4.3 用户询问：未经用户显式选择，禁止写入 `artifact_review_mode`、禁止进入 Step 4.4
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]提案 - 进入提案阶段: 使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}plan 技能。`

## 标识约定

- 任务目录（运行态）：`.polaris/tasks/<task_id>/`（本阶段结束后通常仅留 `state.yaml`）
- 意图文档（入口暂存）：`.polaris/tasks/<task_id>/intention.md`
- 意图文档（迁入后唯一真相）：`openspec/changes/<task_id>/intention.md`
- OpenSpec 四件套：`openspec/changes/<task_id>/`
- 批内审查日志（Mode A）：`openspec/changes/<task_id>/review-log.md`
- 提案主审报告：`openspec/changes/<task_id>/reviews/plan-review-report.md`（Step 5.2）
- Outside Voice 报告（若运行）：`openspec/changes/<task_id>/reviews/openspec-review-report.md`
- workflow 游标：`.polaris/workflow.yaml` → `coding_tasks[].task_id`（写入一律走 `scripts/workflow-entry.sh`）

> **续跑**：若 `openspec/changes/<task_id>/intention.md` 已存在且 `.polaris/tasks/<task_id>/intention.md` 已不存在，视为 Step 4.5 已完成，不得再从 `.polaris` 读 intention。

## 流程（按顺序执行，每一步未完成不得进入下一步）

### Step 0：设置产物语言

**执行**：`LANG=$(bash "$PLUGIN_ROOT/scripts/get-language-name.sh")`（输出语言显示名，如 `中文` / `English`）；退出码 `≠ 0` 时回退到当前用户请求语言。

本阶段均以 `$LANG` 为主语言。

### Step 1：接收 `intake` 交接

**前置**：根据交接中是否存在 `task_id`（由 `intake` 的 Step 4 给出；阶段出口的自动衔接同样会带），做以下操作：

| 情形 | 动作 |
| ---- | ---- |
| 有 | **采纳**；`worktree_path` 一并取（空 = 主仓；非空 ⇒ 后续读产物 / 跑命令一律以该 worktree 为仓库根）。中断续跑时按文末「上下文压缩恢复」表定位断点 |
| 没有 | **阻断**：告知「本技能须经 `intake` 进入，请从入口技能（`tweak` / `normal` / `strict`）重新开始」。|

### Step 2：Worktree 决策（提示性，非阻断）

#### 2.1 前置自检
读 `.polaris/tasks/<task_id>/state.yaml` 的 `worktree.created_by_polaris_flow`。

- 字段**已存在**（`true` 或 `false`）→ 跳过本步，输出 `[polaris-flow 开发]提案 - worktree：已决策（<true|false>），跳过本次询问。` 后进入 Step 3
- 字段缺失 / 空 → 继续 2.2

#### 2.2 询问用户

按 `./policies/decision-point.md` 协议：

> 即将进入 plan 阶段，会生成 OpenSpec 规格文档。是否为本次变更建立独立的 git worktree？
>
> A. 是，创建 worktree
> B. 否，留在当前工作目录

**推荐规则**（可附在选项旁，不强制）：

- 需要并行开发，或当前分支有未提交工作 → 推荐 **A**
- 变更预计很小（例如 ≤ 3 个文件）、无并行需求 → 推荐 **B**

#### 2.3.A 用户选 A — 创建 worktree

```bash
WT_RESULT=$(bash "$PLUGIN_ROOT/scripts/worktree-create.sh" "$task_id" "$REPO_ROOT")
WT_EXIT=$?
```

- exit 0 → `$WT_RESULT` 含 JSON（`target_path` / `target_branch` / `snapshot_path`）；继续下方同步
- exit 1 → **阻断**，stderr 有错误信息

创建成功后，确保 `.polaris/tasks/<task_id>/state.yaml`（worktree 内路径优先）写入：

- `worktree.created_by_polaris_flow: true`
- `worktree.path` / `branch` / `origin_repo` / `status: active`
- `phase: plan`

同步主仓 workflow.yaml（脚本内含锁 / 写后校验，见 H12）：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind coding --skill plan --where-task-id "$task_id" --set worktree-path="$target_path"
```

在 `.polaris/tasks/<task_id>/state.yaml`（worktree 内路径优先）写入：

- `runtime.plan.worktree_decision: created`

输出 `[polaris-flow 开发]提案 - worktree：created at <target_path> on branch <target_branch>`。

#### 2.3.B 用户选 B — 留在主仓库

不动 git。更新主仓 `.polaris/tasks/<task_id>/state.yaml`：

- `worktree.created_by_polaris_flow: false`
- `runtime.plan.worktree_decision: declined`
- `phase: plan`

输出 `[polaris-flow 开发]提案 - worktree：用户选择留在主仓库，工作区未创建。工作路径为: $REPO_ROOT`。

### Step 3：定位并校验 `intention.md`

##### 3.1 定位（按优先级）

1. 若 `openspec/changes/<task_id>/intention.md` 已存在 → 视为已迁入；本步仅确认可读，后续若四件套已齐可从中断点续跑到 Step 5
2. 否则读暂存：
   - worktree 模式（2.3.A）：`<target_path>/.polaris/tasks/<task_id>/intention.md`
   - 主仓模式（2.3.B）：`<main_repo_root>/.polaris/tasks/<task_id>/intention.md`

#### 3.2 检查文件存在性 + 完整性

检查`intention.md`内容，根据情况处理：
| 情况 | 处理 |
|---|---|
| **`.polaris` 与 `openspec` 目录下均无 intention.md** | fallback：把用户**直接进入本阶段**时的原始消息作为 plan 输入；输出 `[polaris-flow 开发]提案 - 未找到 intention.md，使用用户原始 prompt 作为 plan 输入。` 后跳到 Step 3.3 |
| **文件存在**（暂存或已迁入） | 逐节检查**必含节**均存在且非空：目标 / 任务范围 / 验收场景及标准 / 宪法对齐 / 前提 / 结论（架构 + 技术选型）/ 待决问题 / 备选方案。缺节 → **阻断**，列出缺失节名，提示回到 specify 补全 |

#### 3.3 用户最终确认
按 `./policies/ask-question-react.md` 询问 `A. 确认 / B. 暂停回到 specify`，仅 A 进入 Step 4。

### Step 4：创建 Change 结构 + 初始化状态

#### 4.1 创建 Change 结构

**立即执行：** 使用 Skill 工具加载 `opsx:new` / `openspec-new-change` 技能。禁止跳过此步骤。
技能加载后，按其指引创建 change 骨架；
change 骨架创建后立即初始化可恢复状态，不能等 artifacts 全部生成后再写 `.polaris/workflow.yaml`。

#### 4.2 组装输入

`read_file` `.polaris/tasks/<task_id>/intention.md`

**`intention.md` 节 → OpenSpec 四件套映射**（仅完整路径适用）：

| `intention.md` 节 | 写入位置 | 要求 |
|---|---|---|
| `## Reframe 历程` | `proposal.md` 的 Why / Context | 必须包含 |
| `## 目标` | `proposal.md` 的目标相关节 | 必须包含 |
| `## 任务范围` | `proposal.md` 范围 / 非目标；并作为 `tasks.md` 任务划分依据 | 必须包含；任务为粗粒度，单任务约 20 分钟量级 |
| `## 待决问题` | `proposal.md` 的 Open Questions / 待决 | 必须包含 |
| `## 验收场景及标准` | `specs/` 需求与场景依据 | 必须体现 |
| `## 宪法对齐` | `design.md` 的 `## 3. 原则与依据`（逐条对齐 Core Principle） | 必须包含 |
| `## 前提` | `design.md` 的 `## 2. 前提` | 必须包含 |
| `## 结论（架构 + 技术选型）` | `design.md` 的 `### 4.1 技术栈` / `### 4.2 整体方案思路` / `### 4.3 架构总览` | 必须包含架构决策与方案选型（深度技术设计留给后续 `design` 阶段） |
| `## 备选方案` | `design.md` 的 `## 5. 未选方案及拒绝理由` | 必须包含未选方案及拒绝理由 |

`design.md` 严格按 `./templates/design-template.md` 的节名与节序生成（先 `read_file` 再填充）；
`tasks.md` 严格按 `./templates/tasks-template.md` 规则生成;

#### 4.3 审查模式选择（阻塞，禁止自动决策）

本步是用户决策点：必须先回显判定依据与推荐，再暂停等用户选择。禁止用推荐直接写入 `artifact_review_mode` 或跳过询问。

发问前按顺序一次性回显三件事：

1. **判定依据**：基于 `intention.md`（或 fallback 原始 prompt）与 `state.yaml` 的分级三字段（`complexity_level` / `risk_level` / `current_tier`），核对下方信号表，**只列出实际命中的信号**（未命中不列）。

   > 三字段由 `specify` Step 5.4.1 落盘（必有）；缺失（老任务 / 非 specify 入口）→ 按 `standard` 兜底并标注。信号表唯一源：`./policies/risk-signals.md`。

   **推荐 A（`per_batch`）— 每批生成后立即审查**，命中任一即倾向 A：

   | 信号 | 说明 |
   |------|------|
   | 范围大 / 多模块 | Scope 跨 2+ 模块或子系统；或涉及多 capability / 多份 spec 预期 |
   | 需求与选型仍脆 | intention 中待决问题多、备选方案争议大、或结论依赖未验证假设 |
   | 高返工成本 | 后续批次强依赖前序决策（specs/design 易被 proposal 边界牵动）；希望尽早冻结，避免四件套齐了再大面积回滚 |
   | 复杂 / 关键变更 | `current_tier` 为 `critical`，或涉及权限、数据迁移、对外 API 契约、合规 |
   | 作者经验不足该域 | 主代理或用户对该领域不熟，需要分批纠偏 |

   **推荐 B（`after_all`）— 生成完成后再整体审查**，在未命中上表强信号且同时满足多项时倾向 B：

   | 信号 | 说明 |
   |------|------|
   | 变更小而清晰 | 单模块、目标与 Non-goals 清楚、待决问题少或已关闭 |
   | 低耦合四件套 | proposal→specs→design→tasks 预期改动面窄，跨批矛盾概率低 |
   | 速度优先且可接受一次齐套返工 | 用户明确要快推；或 trivial / 文档型 / 配置型变更 |
   | `current_tier` 为 `trivial` 或明确的小改 | 与上列一致时加强 B |

2. **推荐**：`审查模式推荐: A|B（per_batch|after_all）`，附 1–3 条命中信号。信号无法判定或冲突 → 推荐 A（分批审查成本高于事后大返工时更可控）。**推荐仅作回显，不代选。**

3. **选项**（按 `./policies/decision-point.md` 暂停询问，须带上推荐）：

   ```text
   即将按批次创建 OpenSpec 制品（顺序：proposal → specs → design → tasks）。
   是否在每一批生成后立即审查该批内容？

   建议: <A 或 B>（依据见上方）

   A. 是 — 每批生成后立即审查并冻结，再生成下一批（per_batch）
   B. 否 — 四件套全部生成完毕后，再在 Step 5.2 统一整体主审（after_all）
   ```

   停止等待用户选择。用户未回复前，禁止写入 `artifact_review_mode`、禁止进入 Step 4.4。

| 选项 | 写入 `state.yaml` | 后续 |
|------|-------------------|------|
| A | `artifact_review_mode: per_batch` | Step 4.4 走 policy Mode A（§3+§4）→ 4.5 → 5.1 机械终检 → **仍进** Step 5.2 齐套主审 |
| B | `artifact_review_mode: after_all` | Step 4.4 走 policy Mode B（仅 §3，**跳过 §4**）→ 4.5 → 5.1 机械终检 → Step 5.2 为**唯一**制品主审 |

写入 `.polaris/tasks/<task_id>/state.yaml` 顶层 `artifact_review_mode`。

同步在 `state.yaml` 写入：

- `runtime.plan.review_round: 0`  （plan 主审轮次，从 0 起；每次 5.2 落盘后 +1）
- `runtime.plan.review_log_file`：
  - 选 A → `openspec/changes/<task_id>/review-log.md`（Mode A 批内日志路径）
  - 选 B → `skipped:after_all`（无批内日志）

#### 4.4 按模式执行分批生成

`read_file ./policies/artifact-batch-generation.md`，按 4.3 已选模式执行（勿在本 skill 内另写一套循环)

执行后（无论 ok / failed）在 `.polaris/tasks/<task_id>/state.yaml` 写入：

- `runtime.propose.opsx_propose_status`: `<ok|failed>`（四件套全部生成并通过本步校验为 `ok`，任一失败为 `failed`；如本步未执行写 `n/a`）

#### 4.5 迁入 `intention.md`（唯一真相）

Step 4.4 生成完成（Mode A 含批内审查）后执行。**禁止**在 `.polaris` 保留 intention 副本。

1. 确认 `openspec/changes/<task_id>/` 目录存在。
2. 若 `.polaris/tasks/<task_id>/intention.md` 存在：

```bash
# 工作树根：worktree 模式用 target_path，否则 main_repo_root
mv "$REPO_ROOT/.polaris/tasks/$task_id/intention.md" "$REPO_ROOT/openspec/changes/$task_id/intention.md"
```
确认 `.polaris/tasks/<task_id>/intention.md` 已不存在；目标路径存在且非空。

3. 更新 `.polaris/tasks/<task_id>/state.yaml`：将 intention 路径字段改为 `openspec/changes/<task_id>/intention.md`（若模板有 `intention.path` / 等价字段则写入；无则至少在摘要中记录）。
4. 若本轮为 fallback（从未有过 intention 文件）→ **跳过**本步，不造空 `intention.md`。
5. 若 openspec 侧已有 `intention.md` 且 `.polaris` 侧已无 → 视为已迁入，输出 `[polaris-flow 开发]提案 - 意图：已在 openspec，跳过迁入。`

输出：`[polaris-flow 开发]提案 - 意图：moved to openspec/changes/<task_id>/intention.md（.polaris 无备份）`

### Step 5：机械终检 + 提案整体评审（阻塞点）

#### 5.1 机械终检（两种模式共用）

四件套已按 Step 4.4 落盘后（Mode A 另须批内 §4/冻结流程结束），做机械校验（**禁止脑补替代**）。通过后方可进入 5.2。

1. **四件套存在且非空**：`proposal.md`、`design.md`、`tasks.md` 非空；`specs/` 为目录且含至少一个非空文件。任一失败 → 回 Step 4.4 / policy §3 补齐，不得进入 5.2
2. **`proposal.md`**：含问题背景、目标、范围、非目标
3. **`design.md`**：含高层架构决策、方案选型，且含  
   `## 2. 前提`、`## 3. 原则与依据`、`## 5. 未选方案及拒绝理由`（节名与 `./templates/design-template.md` 同源）
4. **`tasks.md`**：任务有明确描述；必须跑：
   ```bash
   LINT_RESULT=$(bash "$PLUGIN_ROOT/scripts/tasks-lint.sh" "openspec/changes/$task_id/tasks.md")
   LINT_EXIT=$?
   ```
   - exit 0 → 通过  
   - exit 1 → **阻断**，输出 `$LINT_RESULT`，修正后重跑
5. 生成 `design.md` 前已 `read_file ./templates/design-template.md`、生成 `tasks.md` 前已 `read_file ./templates/tasks-template.md`，均按其所列节顺序填充

> **fallback**（无 intention、仅用户原始 prompt）：若 proposal/design 缺第 2/3 项部分节，可放宽不阻断，仅在摘要标 `(fallback)`；**四件套存在性与 `tasks-lint` 仍必须通过**。

#### 5.2 主审 — `plan-review-agent`

本步派发主审 subagent。评审对象是**四件套 + intention**；禁止内联重写评审标准。

- **Mode A**：批内 §4 已完成；本步做**齐套跨批 Verdict**，不是重跑批内细则。
- **Mode B**：本步为**唯一**制品主审出口（policy 未跑 §4）。

1. **能力**：读 SessionStart 注入（`SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION`；清单见 `$SUBAGENT_PROBE_CACHE`）。
   - `PLATFORM_DEGRADATION=inline|unsupported` → 标注并 decision-point：A 接受跳过进 Step 5 / B 阻断。不得 inline 假评审。**不派发 → 不涉及 probe**。
   - `SUPPORTS_SUBAGENT=true` → **仍须 probe（H10）**：调用 `polaris{{SKN_SPR}}subagent-probe`（传 `platform`），随后派发固定 `plan-review-agent`。
   - **缺注入** → 调用 `polaris{{SKN_SPR}}subagent-probe`（传入 `platform`；优先读 `$SUBAGENT_PROBE_CACHE`）。`inline` / `unsupported` → 同上 decision-point。

2. **派发方式判定（一次性 vs 分段，回显不自动决策）**

   先算主审 `materials` 合计行数 = proposal + specs（每个非空 spec）+ design + tasks + intention + review-log（若有）。

   | 情形 | 判定 |
   |------|------|
   | 合计 > **2500 行** | **强制分段**（超阈值是工程降级，分段是唯一不崩路径，直接执行并回显依据，不新增决策点） |
   | 合计 ≤ 2500 行 且 `after_all` | **分段**（唯一主审，单批质量 + 跨批对齐都做，负载最重） |
   | 合计 ≤ 2500 行 且 `per_batch` | **一次性**（批内已审，本步只做跨批 Verdict，负载轻） |

   判定结果与依据随派发一并回显：`[polaris-flow 开发]提案 - 主审派发方式：一次性|分段，依据：materials 合计 <N> 行 + 模式 <per_batch|after_all>`。

3. **派发前置**：`plan-review-agent` 已安装（init 已装到 `.<platform>/agents/`）。缺失 → 阻断，提示 `polaris-flow init/update`。

4. **派发（一次性）**

   调用 `use_skill("polaris{{SKN_SPR}}subagent-dispatch")` 执行派发（D-0 工具判定 → D-1 路径引用型 / D-2 内容注入型，见该技能 `references/dispatch-execute.md`）。传入 `platform`、`agent`（probe 结果中 `id=plan-review-agent` 的项）、`task_spec`：

   - `task_type`: `doc_review`
   - `task_description`:
     ```text
     Change: <task_id>
     Batch: all
     ReviewMode: <per_batch|after_all>
     Frozen: <Mode A 下已冻结批次列表；Mode B 为 none 或 all-unfrozen>
     ```
   - `materials`（按以下顺序构造）：
     1. `openspec/changes/<task_id>/proposal.md`
     2. `openspec/changes/<task_id>/design.md`
     3. `openspec/changes/<task_id>/specs/**/*.md`（每个非空文件）
     4. `openspec/changes/<task_id>/tasks.md`（粗骨架）
     5. 若有：`openspec/changes/<task_id>/intention.md`
     6. 若有（Mode A 常见）：`openspec/changes/<task_id>/review-log.md`
   - `constraints`:
     - `output_path: openspec/changes/<task_id>/reviews/plan-review-report.md`（报告写入该文件后只回报路径）
     - 只评审，**禁止**修改任何文件；评审标准在 `plan-review-agent` 定义内（frontmatter 已载入）
   - `language`: 跟随主会话语言

5. **派发（分段，沿 DAG 边 3 段链式）**

   同一 `plan-review-agent` 按顺序派发 3 段，每段只审一条边。上游不传全文，改由主代理抽取「上游决策摘要」注入 `UpstreamSummary`（scope / 非目标 / 需求标题清单 / 关键决策 / 待决问题，≤ 15 行）。

   | 段 | 审的边 | 本段 materials（全量） | UpstreamSummary 来源 |
   |----|--------|----------------------|----------------------|
   | 1 | proposal → specs | proposal.md + specs/**/*.md + intention.md | 无（intention 即基线） |
   | 2 | proposal+specs → design | design.md + intention.md | proposal + specs 决策摘要 |
   | 3 | 全上游 → tasks | tasks.md + intention.md | proposal + specs + design 决策摘要 |

   每段 `task_description`：

   ```text
   Change: <task_id>
   Segment: <1|2|3>
   ReviewMode: <per_batch|after_all>
   UpstreamSummary: <主代理抽取的上游决策摘要>
   ```

   每段 `output_path`：`openspec/changes/<task_id>/reviews/plan-review-seg<1|2|3>.md`。

   三段全部落盘后，主代理汇总三段 findings 合成最终 Verdict，写入 `openspec/changes/<task_id>/reviews/plan-review-report.md`（subagent 只报 findings，不产出跨段结论）。

6. **失败降级**：任一段派发失败 / 超时（如服务端 `-1`）→ **不整轮重跑**，按 `./policies/decision-point.md` 暂停：

   - A. 分段重跑（未分段则改走第 5 步；已分段则仅重跑失败段）
   - B. 原样重试一次
   - C. 用户接受 SKIPPED（按现有协议）

7. **落盘**：确保 `openspec/changes/<task_id>/reviews/` 存在；写入 `openspec/changes/<task_id>/reviews/plan-review-report.md`。

> 整体主审消化上限为 **最多 3 轮**（见 5.4）；与 Mode A 批内 `artifact_max_round` 无关。

主审报告落盘后，在 `.polaris/tasks/<task_id>/state.yaml` 写入：

- `runtime.plan.review_round`：`runtime.plan.review_round + 1`（本次主审轮次；5.4 中重跑 5.2 时继续 +1）

#### 5.3 同行评审-Outside Voice（询问后可选）

主审已落盘（未整步跳过）后：

1. `read_file` `./policies/outside-voice.md` 并执行。
2. 复杂度建议 + decision-point：**A 启动** / **B 跳过**。
3. 选 A → 填充 `./templates/outside-voice-prompt.tmpl.md`，派发 `openspec-review-agent`。

   调用 `use_skill("polaris{{SKN_SPR}}subagent-dispatch")` 执行派发（D-0 判定 → D-1 路径引用型 / D-2 内容注入型，见该技能 `references/dispatch-execute.md`）。传入 `platform`、`agent`（probe 结果中 `id=openspec-review-agent` 的项）、`task_spec`：

   - `task_type`: `doc_review`
   - `task_description`: 填充后的 `./templates/outside-voice-prompt.tmpl.md`（`Change` / `Stage` / `PrimaryReport` + 主审 findings 摘录；摘录从刚落盘的 `plan-review-report.md` 提取，**不含**用户对 findings 的采纳决策）
   - `materials`:
     1. `openspec/changes/<task_id>/proposal.md`
     2. `openspec/changes/<task_id>/design.md`
     3. `openspec/changes/<task_id>/specs/**/*.md`（每个非空文件）
     4. `openspec/changes/<task_id>/tasks.md`
     5. 若有：`openspec/changes/<task_id>/intention.md`
   - `constraints`:
     - `output_path: openspec/changes/<task_id>/reviews/openspec-review-report.md`（报告写入该文件后只回报路径）
     - 只评审，**禁止**修改任何文件；挑战标准在 `openspec-review-agent` 定义内（frontmatter 已载入）
   - `language`: 跟随主会话语言

4. 通过可信度门禁后写入 `openspec/changes/<task_id>/reviews/openspec-review-report.md`。
5. 宿主无 subagent → 按协议跳过 OV 并标注。

#### 5.4 消化

1. 主审 `Verdict`：`BLOCK` / 未消化 Critical → **禁止**进 Step 6；修订四件套（必要时回 Step 4.4）→ **重跑 5.2**（最多 3 轮）；修订后若动过四件套须先重跑 **5.1** 机械终检。
2. `APPROVE_WITH_CONCERNS` → decision-point 确认或修订。
3. OV tension / P0/P1 → 按 outside-voice 用户主权逐条决策；**禁止**自动改四件套。
4. 主审重跑后再询 OV。

### Step 6：完成 plan 阶段

校验通过、Step 4.5 完成、Step 5.1 机械终检通过、且 Step 5.2 已派发主审（或用户接受 SKIPPED）且无未消化 Critical → 用脚本更新 `state.yaml`（`complete-phase` 写入 `runtime.plan.status=completed` 与 `runtime.plan.finished_at`）：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase plan

bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set "runtime.plan.worktree_decision=<created|reused|declined>" \
  --set "runtime.plan.opsx_propose_status=<ok|failed>" \
  --set "runtime.plan.review_round=<N>" \
  --set "runtime.plan.review_log_file=<path|skipped:after_all>" \
  --set runtime.plan.review_report=openspec/changes/<task_id>/reviews/plan-review-report.md \
  --set "runtime.plan.outside_voice=<ran|skipped:<reason>|not_run:<reason>>" \
  --set runtime.plan.outside_voice_report=openspec/changes/<task_id>/reviews/openspec-review-report.md
```

任一项不满足 → 阻断并输出失败原因。

#### 6.1 深化设计决策点（阻塞）

plan 完成后，深度设计（design）是**可选**衔接阶段。**本决策点是否提供，由档位决定**
（读 `state.yaml` 的 `workflow.mode`；档位 → 阶段序列的唯一真相在代码表
`src/core/config/task-kind-layout.ts` 的 `modePhases`，本技能不内联）：

| 档（`workflow.mode`） | 本决策点 |
| --- | --- |
| `strict` | ✅ **提供** —— `design` 在它的阶段序列里 |
| `normal` | ⛔ **不提供** —— `design` **不在** `normal` 的序列里 ⇒ **直接落 `tasks`**（走 6.2 的 B 支，标 `design.status=skipped`） |
| `tweak` | — **不经过本技能**（`plan` 不在它的序列里），天然无此决策 |

> ⚠️ `normal` 档下**不要**把 A 支呈现给用户 —— 那会让 `phase` 落到一个不属于本档的阶段。
> 档位在 `specify` 出口就已冻结（`./policies/risk-signals.md` §7），本技能**不判档、不改 `mode`**。

按 `./policies/decision-point.md` 暂停，询问是否进入深度设计深化：

```text
四件套已锁定。是否需要把高层 design.md 深化为 detailed-design.md（含可选专项设计）？

A. 是 — 进入 /polaris{{SKN_SPR}}coding{{SKN_SPR}}design 深化（复杂 / 高风险 / 需数据模型或接口契约专项设计）
B. 否 — 跳过深化，直接进入 tasks（四件套已足够指导细计划）
```

**推荐规则**（可附在选项旁，不强制）：涉及跨服务、数据模型、对外 API 契约、领域模型或高风险 → 推荐 A；四件套已把架构、模块、接口、数据流写清、无需专项展开 → 推荐 B。

**风险轴闸门（`risk_level=critical` 时）**：本决策点**只保留 A**，不呈现 B —— 高危变更必须深化设计，不得跳过。发问时须写明依据（如 `risk_level=critical（命中 D4 破坏性契约变更）`）。降档须先由用户按 `./policies/decision-point.md` 显式下调 `risk_level`（两轴复核只升不降，`./policies/risk-signals.md` §6）。

#### 6.2 按决策推进阶段

**A（深化）** → 推进 design 阶段（`complete-phase` 已由 Step 6 执行，此处复跑并带 `--next-phase` 前移舞台；表内外阶段均受同一白名单校验）：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase plan --next-phase design
```

输出：`[polaris-flow 开发]提案 - 提案阶段完成：四件套已落盘；plan-review 已处理；intention.md 已迁入（tasks.md 为粗骨架，细计划由 `tasks` 阶段覆写）。`

**B（跳过深化）** → 更新 `state.yaml` 标记 design 跳过，直接推进 tasks：

```yaml
runtime:
  design:
    status: skipped
    review_report: "skipped:用户选择跳过深度设计（四件套已足够指导细计划）"
```

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase plan --next-phase tasks
```

输出：`[polaris-flow 开发]提案 - 提案阶段完成：四件套已落盘；plan-review 已处理；intention.md 已迁入；已跳过深度设计（runtime.design.status=skipped，tasks.md 为粗骨架，细计划由 `tasks` 阶段覆写）。`

**A / B 两分支共用同一出口**，输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**，`NEXT` 取 manual/auto 对应一套）。
先按「自动衔接下一阶段」一节运行 `state next`，`<SKILL>` 与 `<mode>` 均取自其输出
（A 分支应得 `design`、B 分支应得 `tasks`，但**以脚本输出为准，不得写死**）。本技能填写的状态行与「恢复」行（「下一步」「操作」两行以模板为准，不在此复制）：

```text
[polaris-flow 开发]提案 - 阶段完成，状态已落盘。
恢复：先读 openspec/changes/<task_id>/ 的四件套与 reviews/plan-review-report.md、reviews/openspec-review-report.md（若有），再从下一步技能的 Step 0 开始。
```

## 退出条件

- 四件套存在且 Step 5.1 机械终检通过（含 `tasks-lint`）
- Step 4.5 intention 已迁入或合法跳过
- Step 5.2 主审已派发（或用户接受 SKIPPED）且无未消化 Critical
- Outside Voice 已询问并完成（ran / 用户跳过 / 宿主无法运行已标注）
- Step 6.1 深化设计决策点已问询并记录
- `phase=design`（深化）或 `phase=tasks` 且 `runtime.design.status=skipped`（跳过深化）

## 上下文压缩恢复

重载：`task_id`、`artifact_review_mode`、四件套路径、`review-log.md`（若有）、`reviews/plan-review-report.md`、`reviews/openspec-review-report.md`（若有）、停在哪一步。
若停在 5.2/5.4 未消化 → 先完成评审消化，勿无故重跑 `/opsx:propose` 或整段 5.4。
若停在 5.1 未通过 → 先补齐四件套 / 修 lint，再进 5.2。
若停在 6.1 决策点 → 完成深化设计决策（A 深化 / B 跳过）后再按 6.2 推进 phase。

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```