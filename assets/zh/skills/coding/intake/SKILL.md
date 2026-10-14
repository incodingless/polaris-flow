---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}intake
description: "开发类需求的统一受理入口：恢复分发（在途任务）→ 需求预检 → 复杂度判档 → 路由到 tweak / normal / specify。经 flow 总入口选开发类、或需要由 AI 判定需求复杂度时使用。不要用于：已明确工作流的直达场景（直接调用 tweak / normal / sdd 命令）、非开发类需求、或在本技能内产出任何需求/设计/代码产物。"
version: 0.1
---

# Polaris 工作流 - 开发类受理入口（intake）

<HARD-GATE>
本 skill **仅**负责：**恢复分发 → 需求预检 → 复杂度判档 → 路由**，然后把执行交给对应工作流技能。
**不产出**任何需求、设计、代码或测试产物（那是被路由技能的事）。

- **禁止**跳过 Step 1 的在途任务检测直接新建
- **禁止**在 Step 2 需求三要素未满足时进入 Step 3
- **禁止**用脑补代替 `./policies/risk-signals.md` 的信号表判档
- **禁止**在本技能内执行 `task-init`（建任务是工作流技能的事）
- **禁止**代写 `workflow.mode`（工作流技能建任务后自行写）
- ❌ 用户未明确选择时不得自行推进
</HARD-GATE>

## 定位

开发类有 3 条工作流，本技能是它们**共同的受理入口**：

| 判档（`complexity_level`） | 工作流（`workflow.mode`） | 入口技能 |
|---|---|---|
| `trivial` | `tweak` | `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` |
| `standard` | `normal` | `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` |
| `critical` | `strict` | `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` |

- 判档值域 = `trivial | standard | critical`（唯一源 `./policies/risk-signals.md` §1），与 `state.yaml` 的
  `complexity_level` **同一套** —— **不另造词表**。
- **不代做阶段衔接**：路由之后的阶段推进由各技能出口的 `state next` + 任务自己的 `state.yaml` 决定。

## 恢复判据

**`mode` 定工作流、`phase` 定技能** —— 判据由**代码**给出：`get-active-changes --format full` 的
`skill` 字段（`src/core/config/task-kind-layout.ts` 的 `skillForModePhase`）。本技能**不内联**任何分发表。

### Step 0：设置产物语言

**执行**：`LANG=$(bash "$PLUGIN_ROOT/scripts/get-language-name.sh")`（输出语言显示名，如 `中文` / `English`）；退出码 `≠ 0` 时回退到当前用户请求语言。

本技能所有提问与输出均采用 `$LANG`。

## Step 1：恢复分发（在途任务优先）

```bash
ROWS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind coding --repo-root "$REPO_ROOT" --format full)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理。
- 每行含：`task_id` / `worktree_path` / `state_path` / `phase` / `phase_label` / `mode` / `mode_label` /
  `skill` / `skill_label` / `state_readable`。`phase` 与 `mode` 取自该行 `state_path` 指向的文件。

| 情形 | 动作 |
|---|---|
| **零个**在途任务 | 进入 Step 2（新建） |
| **多个**在途任务 | 列出候选（格式见下）让用户选 **1 个**，再按下面两行处理 |
| **1 个**在途任务 | 按 `./policies/decision-point.md` 暂停：**A 继续该任务** / **B 新建** / **C 取消** |

候选呈现格式：逐行给 `中文(英文)`，中文取不到时只显英文（`state_readable=false` 的行标注「无法路由」并给出 `state_path`）：

```
- <task_id> (工作流：严格(strict)，阶段：提案(plan)，技能：提案(plan))
```

选 **A 继续** → **转交**：读该行的 `skill`，**同会话内加载** `polaris{{SKN_SPR}}coding{{SKN_SPR}}<skill>`
（**不**进 Step 2、**不**建任务）；由目标技能自己的 Step 1 接手并从其恢复表对应 Step 续跑。

- ⚠️ 该行 `state_readable=false` 或 `phase` 为空 → **阻断**：把 `state_path` 交给用户人工确认，不得猜。
- ⚠️ 该行 `skill` 为 `null`（旁路阶段 `retro` / 表外未登记阶段）→ **阻断**：没有可路由的技能，
  把 `phase` / `state_path` 交给用户。
- ⚠️ 「读不到」**只在你选中那一行时**才是阻塞；与本次操作无关的其它任务读不到，照常列出并标注。

选 **B 新建** → 进入 Step 2（旧任务保持 active，不自动删除）。

## Step 2：需求预检（开发类强制）

**目的**：开发类是产物生成路径，无需求进入会产出与意图**错位**的产物。

**需求三要素**：**动作**（实现 / 修复 / 添加 / 重构 / 改造 / 调整 / 删除）+ **目标**（具体功能名 / 模块名 / bug 现象）
+ **至少 2 项细节**（角色 / 数据 / 流程 / 约束 / 验收条件中任选 2 项）。三者齐备才算「已有需求」。

**判定**（满足任一即视为已有需求）：

1. 用户消息含完整三要素
2. 含「需求 / user story / 验收标准 / 业务背景 / 现状描述」等关键字，且长度 > 80 字
3. 附带材料已含需求文档（`requirements.md` / `user-story.md` / `prd.md` / 任何含「需求」「验收」字样的 `.md`）
4. 附带材料已含 PRD / OpenSpec 制品（`openspec/changes/<id>/proposal.md` / `specs/*.md` 等）

**不视为已有需求**：仅「实现 XX」/「加个 XX」而无细节；仅有路径但内容未读出；用户输入是问句。

未命中 → **必须**要求用户补充（附文件/目录 或 文字说明），最多 2 轮；仍为空则按 `critical` 处理并提示补细节。

## Step 3：复杂度判档

按 `./policies/risk-signals.md` 的 **§1 档位定义 + §3 降档门 + §4 升档信号**，对**需求侧**做一次判定：

- §3 降档门 D1′–D4′ **全部满足** 且 §4 / §5 全无命中 → `trivial`
- 无升档信号、也不满足降档门；或信息不足 → `standard`（**默认档**）
- 命中 §4 任一信号（D1–D7）→ `critical`

> 判定依据必须引用**需求原文或附带材料中的具体句子 / 文件名**，不得凭印象。

**输出**（必须同条消息展示，含依据与路由目标）：

```markdown
## 复杂度判定
- 档位：<trivial | standard | critical>
- 命中信号：<D2,D6 / 无>
- 依据：<从需求原文或材料摘录>
- 路由目标：<tweak | normal | specify>
```

用户反对时可**上调**一档（**不得下调**）；用户明确否认 `critical` 时按其选择路由，但须记录理由。

## Step 4：路由

| 判档 | 加载技能 |
|---|---|
| `trivial` | `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` |
| `standard` | `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` |
| `critical` | `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` |

**用户已明确复杂度时**（如直接说「这是简单需求」）→ **跳过 Step 3**，按其选择直接路由。

### 交接约定

加载工作流技能时**必须**同时交接 `需求内容` 与 `附加上下文`，并显式告知被加载的技能：

1. 在自身流程开始前，先完整读取 `附加上下文` 中的全部文件/目录（及 `需求内容`）
2. 读取失败 / 内容与诉求明显无关 → 先回报用户再决定，不得静默跳过
3. 后续产物以上下文为准绳；冲突时以用户提供的上下文优先

⚠️ 工作流技能在 Step 1/2 建任务后会**自行**写 `workflow.mode` 并落 `append-active`；本技能**不代写**。
