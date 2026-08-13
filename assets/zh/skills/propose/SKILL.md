---
name: {{SKILL_NAME_PREFIX}}propose
description: "基于已锁定的 intention.md 生成 OpenSpec 四件套；用户触发 /{{SKILL_NAME_PREFIX}}propose，或要求基于 intention.md 生成 OpenSpec 四件套（proposal/specs/design/tasks）时必须使用本 skill。四件套落盘并经 propose-review-agent 独立主审（可选 Outside Voice）后方可进入 design。"
---

# Polaris 工作流 - 阶段：提案（propose）

<HARD-GATE>
- **禁止**未检查 `intention.md` 存在性就调用 `/opsx:propose` / 开始生成四件套
  - 文件存在 → 必须读取全文后再调用
  - 文件不存在 → 必须先走 Step 2.2 fallback 声明，方可继续（不得静默跳过检查）
- **禁止**跳过 worktree 提示直接进入 propose 主流程（提示非阻断：用户可选不创建并继续，但**不能不问**）
- **禁止**主代理在调用 `/opsx:propose` / 生成 `tasks.md` 之前未读取 `./templates/tasks-template.md`
- **禁止**跳过 Step 3.3 审查模式选择（AI 不得代选）；禁止未写 `artifact_review_mode` 就进入 3.4
- **禁止**跳过 `./policies/artifact-batch-generation.md`：须按 3.3 已选模式执行分批生成（Mode A 含批内 §4；Mode B 跳过 §4）；禁止硬编码四件套结构；禁止主代理自审冒充制品审查
- **禁止**通过 `superpowers:using-git-worktrees` 创建 worktree——必须由本 skill Step 1.3.A 直接执行 git / hooks 完成
- **禁止**跳过 Step 4.1 主审：必须派发 `propose-review-agent`（或 subagent 不可用时经 decision-point 接受跳过）；禁止主代理自审冒充
- **禁止**跳过 Step 4.2 Outside Voice **询问**（按 `./policies/outside-voice.md`；用户可选跳过 OV，AI 不得代为决定）
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入提案阶段: 使用 {{SKILL_NAME_PREFIX}}propose 技能。`

## 标识约定

- **`change_id`**：本 skill 唯一主键。与 clarify finalize 后的目录名 / `task_id` **同值**。
- 任务目录（运行态）：`.polaris/tasks/<task_id>/`（本阶段结束后通常仅留 `state.yaml`）
- 意图文档（入口暂存）：`.polaris/tasks/<task_id>/intention.md`
- 意图文档（迁入后唯一真相）：`openspec/changes/<change_id>/intention.md`
- OpenSpec 四件套：`openspec/changes/<change_id>/`
- 批内审查日志（Mode A）：`openspec/changes/<change_id>/review-log.md`
- 提案主审报告：`openspec/changes/<change_id>/reviews/propose-review-report.md`（Step 4.1）
- Outside Voice 报告（若运行）：`openspec/changes/<change_id>/reviews/openspec-review-report.md`
- workflow 游标：`.polaris/workflow.yaml` → `active_changes[].change_id`（写入一律走 `hooks/workflow-entry.sh`）

> **续跑**：若 `openspec/changes/<change_id>/intention.md` 已存在且 `.polaris/tasks/<task_id>/intention.md` 已不存在，视为 Step 3.5 已完成，不得再从 `.polaris` 读 intention。

## 流程（按顺序执行，每一步未完成不得进入下一步）

### Step 0：定位任务标识

读取task标识列表：

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" get-active-changes --skill propose --repo-root "$REPO_ROOT" --phase clarify)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**（恰好 1 个 id）→ 直接取该 `task_id`
- **多个匹配** → 按 `./policies/decision-point.md` 列出候选让用户选择
- **零匹配** → 阻断，提示「未找到 clarify 阶段的 active change，请先执行 /{{SKILL_NAME_PREFIX}}clarify」

> 若 entry 已是 `phase=propose`（例如上次中断续跑），且同 `task_id` 下 worktree 决策与 intention 校验已完成，可从中断点续跑；不得重新筛成「零匹配」。可再跑一次不加 `--phase` 或 `--phase propose` 核对。

### Step 1：Worktree 决策（提示性，非阻断）

#### 1.1 前置自检
读 `.polaris/tasks/<task_id>/state.yaml` 的 `worktree.created_by_polaris_flow`。

- 字段**已存在**（`true` 或 `false`）→ 跳过本步，输出 `[polaris-flow] worktree: 已决策（<true|false>），跳过本次询问。` 后进入 Step 2
- 字段缺失 / 空 → 继续 1.2

#### 1.2 询问用户

按 `./policies/decision-point.md` 协议：

> 即将进入 propose 阶段，会生成 OpenSpec 规格文档。是否为本次变更建立独立的 git worktree？
>
> A. 是，创建 worktree
> B. 否，留在当前工作目录

**推荐规则**（可附在选项旁，不强制）：

- 需要并行开发，或当前分支有未提交工作 → 推荐 **A**
- 变更预计很小（例如 ≤ 3 个文件）、无并行需求 → 推荐 **B**

#### 1.3.A 用户选 A — 创建 worktree

```bash
WT_RESULT=$(bash "$PLUGIN_ROOT/hooks/worktree-create.sh" "$task_id" "$REPO_ROOT")
WT_EXIT=$?
```

- exit 0 → `$WT_RESULT` 含 JSON（`target_path` / `target_branch` / `snapshot_path`）；继续下方同步
- exit 1 → **阻断**，stderr 有错误信息

创建成功后，确保 `.polaris/tasks/<task_id>/state.yaml`（worktree 内路径优先）写入：

- `worktree.created_by_polaris_flow: true`
- `worktree.path` / `branch` / `origin_repo` / `status: active`
- `current_verb: propose`

同步主仓 workflow.yaml（脚本内含锁 / 写后校验，见 H12）：

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill propose --where-change-id "$task_id" --set phase=propose --set worktree-path="$target_path"
```

输出 `[polaris-flow] worktree: created at <target_path> on branch <target_branch>`。

#### 1.3.B 用户选 B — 留在主仓库

不动 git。更新主仓 `.polaris/tasks/<task_id>/state.yaml`：

- `worktree.created_by_polaris_flow: false`
- `current_verb: propose`

同步 workflow.yaml（phase 切到 propose，worktree_path 仍为空）：

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill propose --where-change-id "$task_id" --set phase=propose
```

输出 `[polaris-flow] 用户选择留在主仓库，工作区未创建。工作路径为: $REPO_ROOT`。

### Step 2：定位并校验 `intention.md`

##### 2.1 定位（按优先级）

1. 若 `openspec/changes/<task_id>/intention.md` 已存在 → 视为已迁入；本步仅确认可读，后续若四件套已齐可从中断点续跑到 Step 3.5/4/5
2. 否则读暂存：
   - worktree 模式（1.3.A）：`<target_path>/.polaris/tasks/<task_id>/intention.md`
   - 主仓模式（1.3.B）：`<main_repo_root>/.polaris/tasks/<task_id>/intention.md`

#### 2.2 检查文件存在性 + 完整性

检查`intention.md`内容，根据情况处理：
| 情况 | 处理 |
|---|---|
| **`.polaris` 与 `openspec` 目录下均无 intention.md** | fallback：把用户调用 `/{{SKILL_NAME_PREFIX}}propose`（或 `/propose`）时的原始消息作为 propose 输入；输出 `[polaris-flow] 未找到 intention.md，使用用户原始 prompt 作为 propose 输入。` 后跳到 Step 3.2 |
| **文件存在**（暂存或已迁入） | 对照 `./templates/intention-template.md` 检查下方**必含节**均存在且非空。缺节 → **阻断**，列出缺失节名，提示回到 clarify 补全 |

**必含节**（节名必须与模板一致，勿用英文别名）：

| 必含节 |
|---|
| `## Reframe 历程` |
| `## 宪法对齐` |
| `## 前提` |
| `## 目标` |
| `## 结论（架构 + 技术选型）` |
| `## 备选方案` |
| `## 任务范围（Scope）` |
| `## 验收场景及标准` |
| `## 待决问题` |

#### 2.3 用户最终确认
按 `./policies/ask-question-react.md` 询问 `A. 确认 / B. 暂停回到 clarify`，仅 A 进入 Step 3。

### Step 3：创建 Change 结构 + 初始化状态

#### 3.1 创建 Change 结构

**立即执行：** 使用 Skill 工具加载 `opsx:new` / `openspec-new-change` 技能。禁止跳过此步骤。
技能加载后，按其指引创建 change 骨架；
change 骨架创建后立即初始化可恢复状态，不能等 artifacts 全部生成后再写 `.polaris/workflow.yaml`。

#### 3.2 组装输入

`read_file` `.polaris/tasks/<change_id>/intention.md`

**`intention.md` 节 → OpenSpec 四件套映射**（仅完整路径适用）：

| `intention.md` 节 | 写入位置 | 要求 |
|---|---|---|
| `## Reframe 历程` | `proposal.md` 的 Why / Context | 必须包含 |
| `## 目标` | `proposal.md` 的目标相关节 | 必须包含 |
| `## 任务范围` | `proposal.md` 范围 / 非目标；并作为 `tasks.md` 任务划分依据 | 必须包含；任务为粗粒度，单任务约 20 分钟量级 |
| `## 待决问题` | `proposal.md` 的 Open Questions / 待决 | 必须包含 |
| `## 验收场景及标准` | `specs/` 需求与场景依据 | 必须体现 |
| `## 宪法对齐` | `design.md` 的 `## Constitution Alignment`（逐条对齐 Core Principle） | 必须包含 |
| `## 前提` | `design.md` 的 `## Premises` | 必须包含 |
| `## 结论（架构 + 技术选型）` | `design.md` 的 Architecture / 选型相关节 | 必须包含架构决策与方案选型（深度技术设计留给后续 design 文档细化） |
| `## 备选方案` | `design.md` 的 `## Alternatives` | 必须包含未选方案及拒绝理由 |

`tasks.md` 严格按 `./templates/tasks-template.md` 规则生成；`change_id`值与 Step 0 中获取的`task_id`一致。

#### 3.3 审查模式选择（阻塞）

在创建任一制品前，按 `./policies/decision-point.md` 暂停，询问：

```text
即将按批次创建 OpenSpec 制品（顺序：proposal → specs → design → tasks）。
是否在每一批生成后立即审查该批内容？

A. 是（推荐）— 每批生成后立即审查
B. 否 — 四件套全部生成完毕后
```

| 选项 | 写入 `state.yaml` | 后续 |
|------|-------------------|------|
| A | `artifact_review_mode: per_batch` | Step 3.4 走 policy Mode A（§3+§4+§5）→ 3.5 → **仍进** Step 4.1 齐套主审 |
| B | `artifact_review_mode: after_all` | Step 3.4 走 policy Mode B（§3+§5，**跳过 §4**）→ 3.5 → Step 4.1 为**唯一**制品主审 |

写入 `.polaris/tasks/<change_id>/state.yaml` 顶层 `artifact_review_mode`。**禁止** AI 代选或跳过本步。

#### 3.4 按模式执行分批生成

`read_file ./policies/artifact-batch-generation.md`，按 3.3 已选模式执行（勿在本 skill 内另写一套循环）：

| 模式 | 执行范围 |
|------|----------|
| `per_batch` | policy §3 + §4（批内反思/冻结，`artifact_max_round`）+ §5 机械终检 |
| `after_all` | policy §3 + §5 机械终检；**禁止**跑 policy §4 |

完成条件见 policy §7；通过后方可进入 Step 3.5。

**禁止**：跳过 `openspec instructions` 硬编码结构；主代理自审冒充；Mode A 下未按 4a/4c 冻结就开下一批；Mode A 派发批内审查时不附 intention（或无 intention 时不附 explore 背景）；Mode A 审查后不追加 `review-log.md`；Mode B 在 policy 内再跑一遍整体 §4（与 Step 4.1 重复）。

#### 3.5 迁入 `intention.md`（唯一真相）

§5 机械终检通过后执行。**禁止**在 `.polaris` 保留 intention 副本。

1. 确认 `openspec/changes/<change_id>/` 目录存在。
2. 若 `.polaris/tasks/<change_id>/intention.md` 存在：

```bash
# 工作树根：worktree 模式用 target_path，否则 main_repo_root
mv "$REPO_ROOT/.polaris/tasks/$change_id/intention.md" "$REPO_ROOT/openspec/changes/$change_id/intention.md"
```
确认 `.polaris/tasks/<change_id>/intention.md` 已不存在；目标路径存在且非空。

3. 更新 `.polaris/tasks/<change_id>/state.yaml`：将 intention 路径字段改为 `openspec/changes/<change_id>/intention.md`（若模板有 `intention.path` / 等价字段则写入；无则至少在摘要中记录）。
4. 若本轮为 fallback（从未有过 intention 文件）→ **跳过**本步，不造空 `intention.md`。
5. 若 openspec 侧已有 `intention.md` 且 `.polaris` 侧已无 → 视为已迁入，输出 `[polaris-flow] intention: 已在 openspec，跳过迁入。`

输出：`[polaris-flow] intention: moved to openspec/changes/<change_id>/intention.md（.polaris 无备份）`

### Step 4：提案整体评审（阻塞点）

本步派发主审 subagent，再按 Outside Voice 协议询问是否交叉评审。评审对象是**四件套 + intention**；禁止内联重写评审标准。

- **Mode A**：批内 §4 已完成；本步做**齐套跨批 Verdict**（喂给 OV），不是重跑批内细则。
- **Mode B**：本步为**唯一**制品主审出口（policy 未跑 §4）。

#### 4.1 主审 — `propose-review-agent`

1. **`subagent-probe`**：加载 `{{SKILL_NAME_PREFIX}}subagent-probe`（传入 `platform`）。`inline` / `unsupported` → 标注并 decision-point：A 接受跳过进 Step 5 / B 阻断。不得 inline 假评审。
2. **派发**：`propose-review-agent`（init 已装到 `.<platform>/agents/`）。缺失 → 阻断，提示 `polaris-flow init/update`。

   **按 `subagent-delegate-policy.md` 执行派发**（D-0 工具可用性判定 → D-1 路径引用型 / D-2 内容注入型）。传入参数：

   - `stage_fields`:
     ```text
     Change: <change_id>
     Batch: all
     ReviewMode: <per_batch|after_all>
     Frozen: <Mode A 下已冻结批次列表；Mode B 为 none 或 all-unfrozen>
     ```
   - `materials`（按以下顺序构造）：
     1. `openspec/changes/<change_id>/proposal.md`
     2. `openspec/changes/<change_id>/design.md`
     3. `openspec/changes/<change_id>/specs/**/*.md`（每个非空文件）
     4. `openspec/changes/<change_id>/tasks.md`（粗骨架）
     5. 若有：`openspec/changes/<change_id>/intention.md`
     6. 若有（Mode A 常见）：`openspec/changes/<change_id>/review-log.md`

   D-1 下 agent 按 `propose-review-agent.md` 自读上述路径；D-2 下主代理 Read 全部全文拼入 `Materials:` 段。

3. **落盘**：确保 `openspec/changes/<change_id>/reviews/` 存在；写入 `openspec/changes/<change_id>/reviews/propose-review-report.md`。

> 整体主审消化上限为 **最多 3 轮**（见 4.3）；与 Mode A 批内 `artifact_max_round` 无关。

#### 4.2 Outside Voice（询问后可选）

主审已落盘（未整步跳过）后：

1. `read_file` `./policies/outside-voice.md` 并执行。
2. 复杂度建议 + decision-point：**A 启动** / **B 跳过**。
3. 选 A → 填充 `./templates/outside-voice-prompt.tmpl.md`，派发 `openspec-review-agent`。

   **按 `subagent-delegate-policy.md` 执行派发**（D-0 判定 → D-1 路径引用型 / D-2 内容注入型）。传入参数：

   - `stage_fields`:
     ```text
     Change: <change_id>
     Stage: propose
     ```
   - `materials`:
     1. `openspec/changes/<change_id>/reviews/propose-review-report.md`（即 PrimaryReport，D-2 下全文拼入）
     2. `openspec/changes/<change_id>/proposal.md`
     3. `openspec/changes/<change_id>/design.md`
     4. `openspec/changes/<change_id>/specs/**/*.md`（每个非空文件）
     5. `openspec/changes/<change_id>/tasks.md`
     6. 若有：`openspec/changes/<change_id>/intention.md`

4. 通过可信度门禁后写入 `openspec/changes/<change_id>/reviews/openspec-review-report.md`。
5. 宿主无 subagent → 按协议跳过 OV 并标注。

#### 4.3 消化

1. 主审 `Verdict`：`BLOCK` / 未消化 Critical → **禁止**进 Step 5；修订四件套（必要时回 Step 3.4）→ **重跑 4.1**（最多 3 轮）。
2. `APPROVE_WITH_CONCERNS` → decision-point 确认或修订。
3. OV tension / P0/P1 → 按 outside-voice 用户主权逐条决策；**禁止**自动改四件套。
4. 主审重跑后再询 OV。

### Step 5：完成 propose 阶段

校验通过、Step 3.5 完成、且 Step 4.1 已派发主审（或用户接受 SKIPPED）且无未消化 Critical → 更新 `state.yaml`：

```yaml
propose:
  status: completed
  review_report: openspec/changes/<change_id>/reviews/propose-review-report.md  # 或 skipped:<reason>
  outside_voice: ran | skipped:<reason> | not_run:<reason>
  outside_voice_report: openspec/changes/<change_id>/reviews/openspec-review-report.md  # 若 ran
  finished_at: "<ISO>"
```

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill propose --where-change-id "$change_id" --set phase=design
```

输出：

`[polaris-flow] propose 完成：四件套已落盘；propose-review 已处理；intention.md 已迁入（tasks.md 为粗骨架，细计划由 /{{SKILL_NAME_PREFIX}}plan 覆写）。下一步建议 /{{SKILL_NAME_PREFIX}}design。`

任一项不满足 → 阻断并输出失败原因。

## 退出条件

- 四件套存在且 Step 3.4/§5 出口校验通过（含 `tasks-lint`）
- Step 3.5 intention 已迁入或合法跳过
- Step 4.1 主审已派发（或用户接受 SKIPPED）且无未消化 Critical
- Outside Voice 已询问并完成（ran / 用户跳过 / 宿主无法运行已标注）
- `phase=design`

## 上下文压缩恢复

重载：`change_id`、`artifact_review_mode`、四件套路径、`review-log.md`（若有）、`reviews/propose-review-report.md`、`reviews/openspec-review-report.md`（若有）、停在哪一步。
若停在 4.1/4.3 未消化 → 先完成评审消化，勿无故重跑 `/opsx:propose` 或整段 3.4。

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行。关键命令：

```bash
node polaris-flow state next <change-name>
```

- `NEXT: auto` → 调用 `SKILL` 指向的 skill 进入下一阶段
- `NEXT: manual` → 不要调用下一 skill，按 `HINT` 提示用户手动运行 `/<SKILL>`
- `NEXT: done` → 流程已完成，无需继续