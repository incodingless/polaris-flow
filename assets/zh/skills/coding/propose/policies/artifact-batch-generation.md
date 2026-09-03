# OpenSpec 制品分批生成与 Mode A 批内审查

> **调用方**：propose skill Step 3.4。模式选择由 skill Step 3.3 完成并写入 `state.yaml`；本文件**不**再做模式 decision-point。

## 核心原则

- 四件套**必须按批次顺序生成**，默认顺序：`proposal` → `specs` → `design` → `tasks`（以 `openspec status --change "<change_id>"` 给出的可创建顺序为准；冲突时以 status 为准）
- **禁止**未读 `openspec instructions` 返回的 `template` / `instruction` 就硬编码文档结构
- `artifact_review_mode` 只改变**批内审查是否发生**，不改变批次顺序，不绕过 OpenSpec instructions
- **Mode A（`per_batch`）**：每批生成后必须走 §4 反思循环（intention / explore 基线 + `review-log.md`）→ 冻结 → 下一批；全部批次完成后返回 skill
- **Mode B（`after_all`）**：只跑 §3 生成后返回 skill；**禁止**在本 policy 内跑 §4 / `Batch: all`。制品主审出口是 skill **Step 4.2**
- 批内审查派发 `propose-reviewer`；主代理**禁止**自审冒充通过
- **机械终检**不在本 policy：由 skill **Step 4.1** 执行

---

## 1. 进入前提（模式已由 skill 选定）

进入本 policy 前，调用方必须已写入：

`.polaris/tasks/<change_id>/state.yaml` 顶层字段：

```yaml
artifact_review_mode: per_batch   # 或 after_all
```

> 本字段只决定「批内 §4 是否发生」：批次顺序与行为见上方**核心原则**（`per_batch` → §3+§4；`after_all` → 仅 §3，跳过 §4）；机械终检统一在 skill Step 4.1。

若字段缺失、空或非上述枚举 → **停止**，回 skill Step 3.3 补选；**禁止** AI 代选或默认为某一模式。

---

## 2. 批次与产物约定

| 批次名 | 主要产物路径 | 说明 |
|--------|--------------|------|
| `proposal` | `openspec/changes/<change_id>/proposal.md` | Why + What |
| `specs` | `openspec/changes/<change_id>/specs/**` | 至少一处非空 `spec.md` |
| `design` | `openspec/changes/<change_id>/design.md` | 高层 How |
| `tasks` | `openspec/changes/<change_id>/tasks.md` | 粗任务清单（须先读 `./templates/tasks-template.md`） |

完整目录期望（全部批次结束后）：

```text
openspec/changes/<change_id>/
├── .openspec.yaml
├── proposal.md
├── specs/            # 目录，至少一个非空 spec 文件
├── design.md
└── tasks.md
```

---

## 3. 标准生成循环（两种模式共用）

主代理在自己会话内可调用 `/opsx:propose <change_id>` 作为上下文，把 skill Step 3.2 的输入一并带入。
按 OpenSpec **四件套**循环生成（对每个 artifact：以 `openspec status` 给出的可创建顺序为准；通常为 `proposal` → `specs` → `design` → `tasks`）：

对**当前批次**严格执行：

1. **刷新状态**  
   `openspec status --change "<change_id>" --json`
2. **取指令**（按当前批次名替换）：  
   `openspec instructions <batch> --change "<change_id>" --json`  
   例：`proposal` / `specs` / `design` / `tasks`
3. **消费 JSON 载荷**（缺一不可）：
   - 读取 `dependencies` 中每个已完成依赖产物
   - 以 `template` 为结构骨架
   - 遵循 `instruction`
   - 将 `context`、`rules` 作为约束应用，**不得原文复制进制品**
   - 写入 `resolvedOutputPath`
   - 验证输出路径存在且非空（`specs` 则验证目录内至少一非空文件）
4. **再刷状态**  
   `openspec status --change "<change_id>" --json`，确认本批已完成

### 3.1 失败处理（立即阻断）

出现任一情况 → **停止**后续批次，报告 OpenSpec 错误，不得硬编码兜底结构：

- `openspec instructions` 失败或返回非 JSON
- `dependencies` 未满足
- 无可用 `resolvedOutputPath`
- 写入后文件缺失或为空

### 3.2 模式分支

- 批次执行范围严格遵循**核心原则**：`per_batch` 每批 §3 后走 §4 反思循环再冻结；`after_all` 连续四批 §3 后直接返回 skill，不进入 §4。

可用 `/opsx:propose <change_id>` 作为会话入口/上下文，但**不得**用其替代逐步 `instructions` 循环；真实落盘仍以本 §3 为准。

---

## 4. OpenSpec 反思循环（仅 `per_batch`）

**仅当** `artifact_review_mode == per_batch` 时执行。Mode B **禁止**进入本节。

对本批制品跑完整反思循环。审查智能体为 `propose-reviewer`（下文称 **批内审查者**）。

### 4.0 审查基线（每次派发必附）

| 优先级 | 材料 | 要求 |
|--------|------|------|
| 1 | `intention.md`（暂存 `.polaris/tasks/<change_id>/intention.md` 或已迁入的 openspec 路径） | **若存在必须附上**。对照其中承诺，检查本批制品是否完整转录、有无遗漏或矛盾 |
| 2 | explore 阶段关键背景（无 intention 时强制） | 须向审查者说明：讨论了哪些方案、否决了哪些、为什么 |

**禁止**无基线（intention 与 explore 背景皆无）仍声称「对照完整」；此时须在派发说明中标注基线缺失，并让审查者按 agent 规则降级处理。

### 4.1 探针

加载 `polaris{{SKN_SPR}}subagent-probe`（传入 `platform`）。

| 结果 | 动作 |
|------|------|
| 可用 | 继续 4.2 |
| `inline` / `unsupported` | 标注原因；decision-point：A 接受跳过本批反思循环（记入摘要，**不计**为审查轮次）/ B 阻断。**禁止**主代理 inline 假评审 |

### 4.2 派发批内审查者（计一轮）

- Agent：`propose-reviewer`（须已安装；缺失 → 阻断，提示 `polaris-flow init/update`）
- 按 `subagent-delegate-policy.md`：D-0 → D-1 / D-2

**调用时必须告知审查者：**

```text
Batch: <proposal|specs|design|tasks>     # 本次审查的批次（批内不得用 all）
NewlyCreated: <本批新创建/本轮待审的文件列表>
Frozen: <已冻结批次列表；无则 none>
Round: <本批当前轮次，从 1 起>
ReviewMode: per_batch
```

**materials（按序；缺失则跳过并注明）：**

1. 审查基线：`intention.md`（若有），否则主代理注入的 explore 背景段落
2. `openspec/changes/<change_id>/review-log.md`（若有；供对照上轮遗留）
3. 本批新制品（及审查所需的已冻结前序制品全文或路径）：
   - `proposal.md` / `specs/**` / `design.md` / `tasks.md`（按 Batch 与 Frozen 实际需要）

审查者须：对照已冻结前序制品做一致性检查；对照 intention（或注入背景）检查承诺是否完整转录。

### 4.3 追加 `review-log.md`（每轮审查后、主代理必须做）

路径：`openspec/changes/<change_id>/review-log.md`（不存在则创建）。

每轮在**调用批内审查者并拿到报告后**，主代理必须将发现摘要**追加**到该文件。`<batch>` 取值为 `proposal` / `specs` / `design` / `tasks` 之一。

推荐追加结构：

```markdown
## <batch> Round <N>

- **时间**：<ISO8601>
- **NewlyCreated**：<文件列表>
- **Frozen**：<列表或 none>
- **报告路径**：reviews/openspec-<batch>-review-report.md（或本轮报告路径）

### 发现摘要
- 🔴 …（阻断/严重；可多条）
- 🟡 …（应修复；可多条）
- 💡 …（建议；可多条）

### 🔴 遗留
<!-- 本轮结束后仍未关闭的严重问题；若无则本整节省略或写「（空）」 -->
- …

### 已修复
- …

### 已处理
- …
```

同时将完整报告写入（或覆盖更新）：

`openspec/changes/<change_id>/reviews/openspec-<batch>-review-report.md`

**轮次计数**：仅当「已调用批内审查者 **且** 已向 `review-log.md` 追加了本轮条目」计为 **1 轮**。纯修复、未再派发审查的操作**不计数**。

### 4.4 主代理修复（不计轮次）

根据本轮审查反馈：

1. **只修改当前批次**（及按 §5 已解冻的批次）制品文件
2. **不碰**已冻结文件的决策性内容；声明性追加规则见 §5.1
3. 修复完成后 → **再次**执行 4.2–4.3（再审），审查范围仍是当前批次，并继续对照已冻结前序制品

### 4.5 通过标准与循环

对本批维护计数器 `round`（初值 0；每完成一次 4.2+4.3 后 `round += 1`）。

#### 4a. 单轮通过原则

当前轮次审查后，读取 `review-log.md` 中该批**本轮**条目：

- 若 `### 🔴 遗留` **不存在或为空** → **该批次冻结**（§5.1），进入下一批次
- **不再要求**连续两轮 clean

理由：本轮已无严重问题即视为合格；修复后以最新一轮审查结果为准，无需额外确认轮。

#### 4b. 修复循环

若本轮仍有 🔴 遗留 → 主代理按 4.4 修复 → 再派发审查（4.2–4.3）→ 回到 4a。重复直至通过或触发 4c。

#### 4c. 最大审查轮次

进入本批反思循环前（或首次触及上界判定时）：

1. `read_file` `.polaris/tasks/<change_id>/state.yaml`
2. 读取顶层字段 `artifact_max_round`（正整数）作为本批 **MAX_ROUNDS**
3. 若字段缺失、非正整数或无法解析 → **回退默认 `MAX_ROUNDS = 5`**，并在摘要中标注 `(artifact_max_round defaulted)`

> `artifact_max_round` **仅约束 Mode A 批内 §4**；不约束 skill Step 4.2 整体主审消化轮次。

同一批次累计审查轮次达到 **MAX_ROUNDS** 仍未按 4a 通过 → **停止循环**，按 `./policies/decision-point.md` 交人工：

```text
批次 <batch> 经过 <MAX_ROUNDS> 轮审查仍未通过（上限来自 state.yaml: artifact_max_round=<值或 default:5>）。遗留严重问题：
  - <issue 1>
  - <issue 2>
请选择：
  A. 强制冻结，忽略遗留问题继续下一批次
  B. 回退设计，重新思考该批次方案
  C. 追加一轮审查（选 C 后允许再跑一轮 4.2–4.3；须在摘要标注 override；默认仍受 artifact_max_round 约束，达上限可再次触发 4c）
```

| 用户选择 | 后续 |
|----------|------|
| A | 标注强制冻结与遗留列表；进入下一批 |
| B | 解冻本批（及后序若有）；回到 §3 重做本批生成，round 清零 |
| C | 再执行一轮 4.2–4.3；若仍失败可再次触发 4c |

### 4.6 流程串（Mode A 单批）

> 单批完整流程串（§3 → 4.2 → 4.3 → 4a/4b → 4c）见 **§5.3 模式 A 批次流水线**，本节不重复绘制。

---

## 5. 冻结与解冻（仅 Mode A）

修复审查问题时修改当前批次和已解冻的文件，对已冻结的制品只允许声明性追加，绝不动手修改决策性内容。

### 5.1 冻结

某批次制品按 §4.5 **4a** 通过（或用户选 4c-A 强制冻结）→ 标记该批**冻结**。
后续制品的审查必须以冻结制品为基准做一致性检查。

| 允许 | 禁止 |
|------|------|
| 对冻结批做**声明性追加**。（缺失的映射表/关键词/完整列表、修正拼写错误、遗漏场景/示例、不改变需求语义的边界描述、不改变决策的澄清） | 改 scope / Non-goals / 选型结论 / 需求语义等**决策性**内容 |
| 在未冻结的当前批内修改 | 静默改已冻结批的决策性段落 |

### 5.2 解冻

审查认定已冻结批存在**决策性**问题（或与新批决策性矛盾）→：

1. 解冻该批，以及顺序上**其后所有批次**（例：解冻 `specs` → 同时解冻 `design`、`tasks`）
2. 修复被解冻批次（从最早解冻批开始）
3. 自该批起重跑 §4；通过后重新冻结，再继续后续批次

声明性遗漏 → **不解冻**，允许软补充后继续。

### 5.3 模式 A 批次流水线（必须）

```text
proposal: 生成 → §4 反思循环（4a）→ 冻结
   ↓
specs:    生成（对照已冻结 proposal）→ §4 → 冻结
   ↓
design:   生成（对照已冻结 proposal + specs）→ §4 → 冻结
   ↓
tasks:    生成（对照全部已冻结前序）→ §4 → 通过/冻结
   ↓
返回 skill → Step 4.1 机械终检 → …
```

每轮只推进一批；未冻结不得开下一批。

---

## 6. 完成条件（返回 skill 前）

- 四件套路径已按 §2 / §3 落盘（存在性的机械终检由 skill Step 4.1 负责，本 policy 不重复）
- **Mode A**：各批 §4 已按 4a 完成（或 4c 人工决策已落地），或经 decision-point 明确接受「本批审查 SKIPPED」；无「应冻结未冻结」的中间批；`review-log.md` 已记录各批有效审查轮次（若未整段跳过审查）
- **Mode B**：不要求 `review-log.md`；**不得**在本 policy 内声称已完成制品主审或机械终检
- 满足上述后，方可返回 skill（intention 迁入 → Step 4.1 机械终检 → Step 4.2 整体主审）
