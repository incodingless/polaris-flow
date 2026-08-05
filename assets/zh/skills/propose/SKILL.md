<!--
  简要说明：
  - 职责：基于已锁定的 intention.md 生成 OpenSpec 四件套；可提示创建 worktree（非阻断）；四件套成功后将 intention 迁入 openspec；经 propose-review-agent 主审（可选 Outside Voice）后放行 design。
  - 主产物：`openspec/changes/<change_id>/` 下 proposal / specs / design / tasks（粗骨架）+ intention.md + `reviews/propose-review-report.md`。
  - 上游 / 下游：clarify → 本阶段 → design。
-->
---
name: polaris-flow-propose
description: "用户触发 /polaris-flow-propose、/propose，或要求基于 intention.md 生成 OpenSpec 四件套（proposal/specs/design/tasks）时必须使用本 skill。四件套落盘并经 propose-review-agent 独立主审（可选 Outside Voice）后方可进入 design。"
---

# Polaris 工作流 - 阶段：提案（propose）

<HARD-GATE>
- **禁止**未检查 `intention.md` 存在性就调用 `/opsx:propose`
  - 文件存在 → 必须读取全文后再调用
  - 文件不存在 → 必须先走 Step 2.2 fallback 声明，方可调用（不得静默跳过检查）
- **禁止**跳过 worktree 提示直接进入 propose 主流程（提示非阻断：用户可选不创建并继续，但**不能不问**）
- **禁止**主代理在调用 `/opsx:propose` / 生成 `tasks.md` 之前未 `read_file templates/tasks-template.md`
- **禁止**通过 `superpowers:using-git-worktrees` 创建 worktree——必须由本 skill Step 1.3.A 直接执行 git / hooks 完成
- **禁止**跳过 Step 4.6 主审询问路径：必须派发 `propose-review-agent`（或 subagent 不可用时经 decision-point 接受跳过）；禁止主代理自审冒充
- **禁止**跳过 Step 4.6 Outside Voice **询问**（按 `.polaris/reference/outside-voice.md`；用户可选跳过 OV，AI 不得代决）
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入提案阶段: 使用 polaris-flow-propose 技能。`

## 标识约定

- **`change_id`**：本 skill 唯一主键。与 clarify finalize 后的目录名 / `task_id` **同值**。
- 任务目录（运行态）：`.polaris/tasks/<change_id>/`（本阶段结束后通常仅留 `state.yaml`）
- 意图文档（入口暂存）：`.polaris/tasks/<change_id>/intention.md`（propose **开始时**读取）
- 意图文档（迁入后唯一真相）：`openspec/changes/<change_id>/intention.md`（Step 4.5 `mv`，`.polaris` **不留备份**）
- OpenSpec 四件套：`openspec/changes/<change_id>/`
- 提案主审报告：`openspec/changes/<change_id>/reviews/propose-review-report.md`（Step 4.6）
- Outside Voice 报告（若运行）：`openspec/changes/<change_id>/reviews/openspec-review-report.md`
- workflow 游标：`.polaris/workflow.yaml` → `active_changes[].change_id`（写入一律走 `hooks/workflow-entry.sh`）

> **续跑**：若 `openspec/changes/<change_id>/intention.md` 已存在且 `.polaris/tasks/<change_id>/intention.md` 已不存在，视为 Step 4.5 已完成，不得再从 `.polaris` 读 intention。
## 流程（按顺序执行，每一步未完成不得进入下一步）

### Step 0：定位 change_id

读取 `.polaris/workflow.yaml: active_changes`，筛选 `phase=clarify` 的 entry：

- **唯一匹配**：直接取其 `change_id`
- **多个匹配**：按 `.polaris/reference/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 clarify 阶段的 active change，请先执行 /polaris-flow-clarify」

> 若 entry 已是 `phase=propose`（例如上次中断续跑），且同 `change_id` 下 worktree 决策与 intention 校验已完成，可从中断点续跑；不得重新筛成「零匹配」。

### Step 1：Worktree 决策（提示性，非阻断）

**1.1 前置自检**：读 `.polaris/tasks/<change_id>/state.yaml` 的 `worktree.created_by_polaris_flow`。

- 字段**已存在**（`true` 或 `false`）→ 跳过本步，输出 `[polaris-flow] worktree: 已决策（<true|false>），跳过本次询问。` 后进入 Step 2
- 字段缺失 / 空 → 继续 1.2

**1.2 询问用户**（统一文案，不按 tier 区分；按 decision-point 协议）：

> 即将进入 propose 阶段，会生成 OpenSpec 规格文档并改动仓库。是否为本次变更建立独立的 git worktree？
>
> A. 是，创建 worktree
> B. 否，留在当前工作目录

**推荐规则**（可附在选项旁，不强制）：

- 需要并行开发，或当前分支有未提交工作 → 推荐 **A**
- 变更预计很小（例如 ≤ 3 个文件）、无并行需求 → 推荐 **B**

#### 1.3.A 用户选 A — 创建 worktree

```bash
REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
REPO_ROOT="${REPO_ROOT:-$PWD}"
PLUGIN_ROOT="$REPO_ROOT/$PLATFORM_ID/polaris-flow"

WT_RESULT=$(bash "$PLUGIN_ROOT/hooks/worktree-create.sh" "$change_id" "$REPO_ROOT")
WT_EXIT=$?
```

- exit 0 → `$WT_RESULT` 含 JSON（`target_path` / `target_branch` / `snapshot_path`）；继续下方同步
- exit 1 → **阻断**，stderr 有错误信息

创建成功后，确保 `.polaris/tasks/<change_id>/state.yaml`（worktree 内路径优先）写入：

- `worktree.created_by_polaris_flow: true`
- `worktree.path` / `branch` / `origin_repo` / `status: active`
- `current_verb: propose`

同步主仓 workflow.yaml（脚本内含锁 / 写后校验，见 H12）：

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill propose \
  --where-change-id "$change_id" --set phase=propose --set worktree-path="$target_path"
```

输出 `[polaris-flow] worktree: created at <target_path> on branch <target_branch>`。

#### 1.3.B 用户选 B — 留在主仓库

不动 git。更新主仓 `.polaris/tasks/<change_id>/state.yaml`：

- `worktree.created_by_polaris_flow: false`
- `current_verb: propose`

同步 workflow.yaml（phase 切到 propose，worktree_path 仍为空）：

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill propose \
  --where-change-id "$change_id" --set phase=propose
```

输出 `[polaris-flow] worktree: not created, staying in <cwd>`。

### Step 2：定位并校验 `intention.md`

**2.1 定位**（按优先级）：

1. 若 `openspec/changes/<change_id>/intention.md` 已存在 → 视为已迁入；本步仅确认可读，后续 `/opsx:propose` 若四件套已齐可从中断点续跑到 Step 4.5/5
2. 否则读暂存：
   - worktree 模式（1.3.A）：`<target_path>/.polaris/tasks/<change_id>/intention.md`
   - 主仓模式（1.3.B）：`<main_repo_root>/.polaris/tasks/<change_id>/intention.md`

**2.2 文件存在性 + 完整性**：

| 情况 | 处理 |
|---|---|
| **`.polaris` 与 openspec 均无 intention** | fallback：把用户调用 `/polaris-flow-propose`（或 `/propose`）时的原始消息作为 propose 输入；输出 `[polaris-flow] 未找到 intention.md，使用用户原始 prompt 作为 propose 输入。` 后跳到 Step 3.2 |
| **文件存在**（暂存或已迁入） | 对照 `templates/intention-template.md` 检查下方**必含节**均存在且非空。缺节 → **阻断**，列出缺失节名，提示回到 clarify 补全 |

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

**2.3 用户最终确认**（防御性，防陈旧 intention.md）：完整路径下输出预览 + 询问 `A. 确认 / B. 暂停回到 clarify`，仅 A 进入 Step 3。

### Step 3：调用 `/opsx:propose`

**3.1 强制前置**：调用前必须 `read_file templates/tasks-template.md`，并显式输出：

`[polaris-flow propose] 已 read_file templates/tasks-template.md（version: <模板顶部第一行>）`

**3.2 组装输入**：

- 完整路径 → `intention.md` **全文整段嵌入**（不要总结）
- fallback 路径 → 用户调用时的原始消息

**`intention.md` 节 → OpenSpec 四件套映射**（仅完整路径适用）：

| `intention.md` 节 | 写入位置 | 要求 |
|---|---|---|
| `## Reframe 历程` | `proposal.md` 的 Why / Context | 必须包含 |
| `## 目标` | `proposal.md` 的目标相关节 | 必须包含 |
| `## 任务范围（Scope）` | `proposal.md` 范围 / 非目标；并作为 `tasks.md` 任务划分依据 | 必须包含；任务为粗粒度，单任务约 20 分钟量级 |
| `## 待决问题` | `proposal.md` 的 Open Questions / 待决 | 必须包含 |
| `## 验收场景及标准` | `specs/` 需求与场景依据 | 必须体现 |
| `## 宪法对齐` | `design.md` 的 `## Constitution Alignment`（逐条对齐 Core Principle） | 必须包含 |
| `## 前提` | `design.md` 的 `## Premises` | 必须包含 |
| `## 结论（架构 + 技术选型）` | `design.md` 的 Architecture / 选型相关节 | 必须包含架构决策与方案选型（深度技术设计留给后续 design 文档细化） |
| `## 备选方案` | `design.md` 的 `## Alternatives` | 必须包含未选方案及拒绝理由 |

`tasks.md` 严格按 `templates/tasks-template.md` 规则生成；`change_id` 来自 Step 0。

**3.3 执行**：主代理在自己会话内调用 `/opsx:propose <change_id>`，把 3.2 的输入作为命令上下文。

按 OpenSpec **四件套**循环生成（对每个 artifact：以 `openspec status` 给出的可创建顺序为准；通常为 `proposal` → `specs` → `design` → `tasks`）：

**标准产物循环**：

1. 刷新状态：`openspec status --change "<change_id>" --json`
2. 获取当前产物指令，例如：

    ```bash
    openspec instructions proposal --change "<change_id>" --json
    openspec instructions specs --change "<change_id>" --json
    openspec instructions design --change "<change_id>" --json
    openspec instructions tasks --change "<change_id>" --json
    ```

3. 对返回的 JSON 指令载荷，必须：
    - 读取 `dependencies` 中列出的每个已完成依赖产物
    - 以 `template` 作为产物结构
    - 遵循 `instruction` 的指引
    - 将 `context` 和 `rules` 作为约束条件应用，**不得复制到 artifact 内容中**
    - 写入 `resolvedOutputPath`
    - 验证输出文件存在且非空
4. 每创建一个 artifact 后，重新运行 `openspec status --change "<change_id>" --json` 确认状态，然后继续下一个 artifact

**失败处理**：如果 `openspec instructions` 失败、返回无效 JSON、报告未满足的 `dependencies`、或未提供可用的 `resolvedOutputPath`，必须立即停止 artifact 创建并报告 OpenSpec 错误。不得回退为硬编码文档结构（会绕过项目规则）。

确认以下产物已创建：

```
openspec/changes/<change_id>/
├── .openspec.yaml
├── proposal.md       # Why + What：问题、目标、范围
├── specs/            # 需求规格（目录，至少含有效 spec 文件）
├── design.md         # How（高层框架）：架构决策、方案选型
└── tasks.md          # 任务清单（勾选框）
```

### Step 4：出口校验

> fallback 模式（用户原始 prompt 作输入）下，若 propose 未生成第 2/3 项要求的节，可放宽不阻断、仅在摘要中标记 `(fallback)`。`tasks-lint.sh` 与「四件套文件存在」仍必须通过。

`/opsx:propose` 返回后校验：

1. **四件套均生成**：`openspec/changes/<change_id>/` 下含 `proposal.md` / `design.md` / `specs/` / `tasks.md`，逐个确认路径存在且非空（`specs/` 为目录且内含至少一个非空文件）。任一缺失或为空 → 不得进入 Step 5，必须回到创建步骤补充。
2. `proposal.md` 含问题背景、目标、范围、非目标
3. `design.md` 含高层架构决策、方案选型，且含：
   - `## Constitution Alignment`（逐条覆盖 Core Principle）
   - `## Alternatives`（未选方案及拒绝理由）
   - `## Premises`
4. `tasks.md` 含任务列表，每个任务有明确描述；通过合规检查（**必须跑脚本，禁止脑补核对**）：

```bash
LINT_RESULT=$(bash "$PLUGIN_ROOT/hooks/tasks-lint.sh" "openspec/changes/$change_id/tasks.md")
LINT_EXIT=$?
```

   - exit 0 → 通过
   - exit 1 → **阻断**，输出 `$LINT_RESULT`（JSON violations），要求修正 `tasks.md` 后重新跑本校验
5. 本 skill 在调用前已显式输出「已 read_file `templates/tasks-template.md`」声明

### Step 4.5：迁入 `intention.md`（唯一真相）

四件套校验通过后执行。**禁止**在 `.polaris` 保留 intention 副本。

1. 确认 `openspec/changes/<change_id>/` 目录存在。
2. 若 `.polaris/tasks/<change_id>/intention.md` 存在：

```bash
# 工作树根：worktree 模式用 target_path，否则 main_repo_root
mv "$REPO_ROOT/.polaris/tasks/$change_id/intention.md" \
   "$REPO_ROOT/openspec/changes/$change_id/intention.md"
```

   确认 `.polaris/tasks/<change_id>/intention.md` 已不存在；目标路径存在且非空。
3. 更新 `.polaris/tasks/<change_id>/state.yaml`：将 intention 路径字段改为 `openspec/changes/<change_id>/intention.md`（若模板有 `intention.path` / 等价字段则写入；无则至少在摘要中记录）。
4. 若本轮为 fallback（从未有过 intention 文件）→ **跳过**本步，不造空 `intention.md`。
5. 若 openspec 侧已有 `intention.md` 且 `.polaris` 侧已无 → 视为已迁入，输出 `[polaris-flow] intention: 已在 openspec，跳过迁入。`

输出：`[polaris-flow] intention: moved to openspec/changes/<change_id>/intention.md（.polaris 无备份）`

### Step 4.6：提案评审（阻塞点）

本步派发主审 subagent，再按 Outside Voice 协议询问是否交叉评审。评审对象是**四件套 + intention**（粗 tasks）；禁止内联重写评审标准。

#### 4.6.1 主审 — `propose-review-agent`

1. **`subagent-probe`**：加载 `polaris-flow:subagent-probe`（传入 `platform`）。`inline` / `unsupported` → 标注并 decision-point：A 接受跳过进 Step 5 / B 阻断。不得 inline 假评审。
2. **派发**：`propose-review-agent`（init 已装到 `.<platform>/agents/`）。缺失 → 阻断，提示 `polaris-flow init/update`。启动 prompt：

```text
Change: <change_id>
```

3. **落盘**：确保 `openspec/changes/<change_id>/reviews/` 存在；写入 `openspec/changes/<change_id>/reviews/propose-review-report.md`。

#### 4.6.2 Outside Voice（询问后可选）

主审已落盘（未整步跳过）后：

1. `read_file` `.polaris/reference/outside-voice.md`（或插件 `policies/outside-voice.md`）并执行。
2. 复杂度建议 + decision-point：**A 启动** / **B 跳过**。
3. 选 A → 填充 `templates/outside-voice-prompt.tmpl.md`，派发 `openspec-review-agent`：

```text
Change: <change_id>
Stage: propose
PrimaryReport: openspec/changes/<change_id>/reviews/propose-review-report.md
Materials:
  - openspec/changes/<change_id>/proposal.md
  - openspec/changes/<change_id>/design.md
  - openspec/changes/<change_id>/specs/
  - openspec/changes/<change_id>/tasks.md
  - openspec/changes/<change_id>/intention.md（若有）
```

4. 通过可信度门禁后写入 `openspec/changes/<change_id>/reviews/openspec-review-report.md`。
5. 宿主无 subagent → 按协议跳过 OV 并标注。

#### 4.6.3 消化

1. 主审 `Verdict`：`BLOCK` / 未消化 Critical → **禁止**进 Step 5；修订四件套（必要时回 Step 3）→ 重跑 4.6.1（最多 3 轮）。
2. `APPROVE_WITH_CONCERNS` → decision-point 确认或修订。
3. OV tension / P0/P1 → 按 outside-voice 用户主权逐条决策；**禁止**自动改四件套。
4. 主审重跑后再询 OV。

### Step 5：完成 propose 阶段

校验通过、Step 4.5 完成、且 Step 4.6 已派发主审（或用户接受 SKIPPED）且无未消化 Critical → 更新 `state.yaml`：

```yaml
propose:
  status: completed
  review_report: openspec/changes/<change_id>/reviews/propose-review-report.md  # 或 skipped:<reason>
  outside_voice: ran | skipped:<reason> | not_run:<reason>
  outside_voice_report: openspec/changes/<change_id>/reviews/openspec-review-report.md  # 若 ran
  finished_at: "<ISO>"
```

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill propose \
  --where-change-id "$change_id" --set phase=design
```

输出：

`[polaris-flow] propose 完成：四件套已落盘；propose-review 已处理；intention.md 已迁入（tasks.md 为粗骨架，细计划由 /polaris-flow-plan 覆写）。下一步建议 /polaris-flow-design。`

任一项不满足 → 阻断并输出失败原因。

## 退出条件

- 四件套存在且 Step 4 出口校验通过（含 `tasks-lint`）
- Step 4.5 intention 已迁入或合法跳过
- Step 4.6 主审已派发（或用户接受 SKIPPED）且无未消化 Critical
- Outside Voice 已询问并完成（ran / 用户跳过 / 宿主无法运行已标注）
- `phase=design`

## 上下文压缩恢复

重载：`change_id`、四件套路径、`reviews/propose-review-report.md`、`reviews/openspec-review-report.md`（若有）、停在哪一步。若停在 4.6 未消化 → 先完成评审消化，勿无故重跑 `/opsx:propose`。

## 自动衔接下一阶段

按 `polaris/reference/auto-transition.md` 执行。关键命令：

```bash
node "$POLARIS_FLOW" next <change-name>
```

- `NEXT: auto` → 调用 `SKILL` 指向的 skill 进入下一阶段
- `NEXT: manual` → 不要调用下一 skill，按 `HINT` 提示用户手动运行 `/<SKILL>`
- `NEXT: done` → 流程已完成，无需继续

注意：无论 `NEXT` 为 `auto` 还是 `manual`，`polaris-flow-propose` 进入后必须先执行归档前最终确认阻塞点，等待用户明确选择「确认归档」后才允许运行归档脚本。不得因为验证已通过就自动归档。
