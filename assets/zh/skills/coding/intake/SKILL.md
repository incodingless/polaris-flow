---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}intake
description: "coding 工作流的任务管理与调度中心：恢复在途任务 → 入口判档 → 任务初始化 → 转交阶段技能。由入口技能（tweak / normal / strict）加载，或在用户新建 / 续写 / 恢复 coding 任务时直接使用。不要用于：判断需求是否合格（specify 的职责）、判断档位升降（specify 出口的职责）、产出任何需求 / 设计 / 代码产物。"
version: 0.1
---

# Polaris 工作流 - 任务管理与调度（intake）

<HARD-GATE>
本 skill **仅**负责**任务的生命周期与路由**：恢复分发 → 入口判档 → 任务初始化 → 转交。

- **禁止**在本技能内判断**需求是否合格**（够不够详细 / 要不要追问）—— 那是**澄清**的职责
- **禁止**在本技能内判断**档位升降** —— 那是 `specify` **出口**的职责；本技能只做**入口粗判**，且只为"选哪个入口技能"
- **禁止**跳过 Step 1 的在途任务检测直接新建
- **禁止**在"需求内容为空"时建任务（准入检查，见 Step 3）
- **禁止**内联任何「档位 → 阶段序列」表（唯一源 = 代码表，见下）
- **禁止**在本技能内产出任何需求、设计、代码或测试产物
- ❌ 用户未明确选择时不得自行推进
</HARD-GATE>

## 定位：本技能是 coding 族的**调度层**

| 层 | 技能 | 职责 | 与本技能的关系 |
|----|------|------|----------------|
| **入口层** | 薄编排技能 `tweak` / `normal` / `strict` | 声明档位 | **加载本技能**，并在交接中给出本档 `mode` |
| **调度层** | **本技能（`intake`）** | 恢复分发 / 入口判档 / 任务初始化 / 转交 | —— |
| **执行层** | `specify` / `plan` / `design` / `tasks` / `build` / `verify` / `ship` | 只做本阶段（读 `workflow.mode` 决定工序强度） | **不加载本技能**；**只接收本技能的交接**（见下），不再自行查任务 |

> 🔴 **执行层只有一个入口 = 本技能**。它们**不得**被直接调用，也**不得**互相直接调用
> （含阶段出口的"自动衔接"—— 那一跳同样回本技能，见 `./policies/auto-transition.md`）。
> 因此执行层的 Step 1 只**接收交接**，不做任何任务判定。
>
> ⚠️ **链外技能（不受本技能调度、也不受上面那条约束）**：`retro`（复盘）是**服务型只读技能** ——
> 它不在任何档的阶段序列里（`skill: null`）、不需要 `task_id`、只读主仓全局 metrics / overrides。
> ⇒ 它**由用户直接调用**（说「看度量 / 复盘」）：本技能**不转交它**，任何技能的「自动衔接」也**不得**指向它。

## 判定依据（全部来自代码 / 共享 policy，本技能不内联映射表）

| 判定值 | 唯一来源 |
|---|---|
| 有哪些在途任务、任务在哪 | `workflow-entry get-active-changes --kind coding --format full` |
| 该由哪个技能接手（`skill` 字段） | 上一行命令的输出（由 `task-kind-layout.ts` 的 `skillForModePhase` 算出） |
| 本档的阶段序列与**首段** | `task-kind-layout.ts` 的 `phasesForMode(kind, mode)` |
| 档位判据（粗判） | `./policies/risk-signals.md` §1 档位 / §3 降档 / §4 升档 |
| 人工确认协议 | `./policies/decision-point.md` |
| 破坏性分支（孤儿 draft / 丢弃并新建） | `./policies/task-entry.md` §5 |

## 流程（按顺序执行）

### Step 0：设置产物语言

**执行**：`LANG=$(bash "$PLUGIN_ROOT/scripts/get-language-name.sh")`（输出语言显示名，如 `中文` / `English`）；退出码 `≠ 0` 时回退到当前用户请求语言。

本技能所有提问与输出均采用 `$LANG`。

### Step 1：恢复分发（在途任务优先）

```bash
ROWS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind coding --repo-root "$REPO_ROOT" --format full)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理。
- 每行含：`task_id` / `worktree_path` / `state_path` / `phase` / `phase_label` / `mode` / `mode_label` / `skill` / `skill_label` / `state_readable`。

| 情形 | 动作 |
|---|---|
| 🔴 **上游已指定 `task_id`**（阶段出口的自动衔接交接） | **直接采用它** → 跳到 Step 4。**跳过下面的枚举与询问** |
| **零个**在途任务 | 进入 Step 2（新建） |
| **多个**在途任务 | 按 `./policies/decision-point.md` 列出候选请用户选 **1 个**，记下 `task_id`，然后进入 Step 4 |
| **1 个**在途任务 | 按 `./policies/decision-point.md` 暂停：**A 继续该任务** / **B 新建** / **C 取消**；选 A → Step 4，选 B → Step 2 |

> 🔴 **为什么"上游已指定"必须免提问**：该情形只出现在**阶段出口的自动衔接**上（每次阶段切换一次）。
> 在那里制造确认 = 每个阶段收尾都弹一次问题；且依 `./policies/decision-point.md`
> 「**只有一个安全下一步时不得制造确认**」——上游刚把那个任务交过来，它就是唯一安全解。
> 而用户从入口技能进入时上游不带 `task_id`，才走下面的枚举与询问。

候选呈现格式：逐行给 `中文(英文)`，中文取不到时只显英文：

```
- <task_id> (工作流：严格(strict)，阶段：提案(plan)，技能：提案(plan))
```

- ⚠️ 该行 `state_readable=false` 或 `phase` 为空 → **阻断**：把 `state_path` 交给用户人工确认，不得猜。
- ⚠️ 该行 `skill` 为 `null` → **阻断**：没有可路由的技能，把 `phase` / `state_path` 交给用户。两种情形：
  - **`retro`（旁路，刻意豁免调度）** → 告诉用户「该行不该由本技能接手 —— 让它**自己**跑（说『看度量 / 复盘』）」。
    本技能**不得**转交它，也不得为其建任务 / 改档：它是链外的服务型只读技能。
  - **表外未登记阶段** → 仍是阻断，交用户人工确认。
- ⚠️ 「读不到」**只在你选中那一行时**才是阻塞；与本次操作无关的其它任务读不到，照常列出并标注。

### Step 2：入口判档 / 复核（**仅「零个」时**）

按 `./policies/risk-signals.md` 对**需求侧**做一次**粗判**：

- §3 降档门 **全部满足** 且 §4 / §5 全无命中 → `trivial`
- 无升档信号、也不满足降档门；**或信息不足** → `standard`（**默认档**）
- 命中 §4 任一信号 → `critical`

| 上游是否已声明档位 | 动作 |
|---|---|
| **未声明**（上游直接加载本技能，没带档位） | 以**粗判结果**为档 → 交给 Step 3 |
| **已声明**（由 `tweak` / `normal` / `strict` 交接而来） | **复核**：一致 → 采用上游给的档；粗判**更高** → 按 `./policies/decision-point.md` 提示用户「信号表显示更像 `<更高档>`，是否升级？」，**由用户定**；粗判更低 → **不降**（不擅自推翻用户的选择） |

**输出**（必须同条消息展示，含依据）：

```markdown
## 入口判档
- 档位：<trivial | standard | critical>
- 命中信号：<D2,D6 / 无>
- 依据：<从需求原文或材料摘录>
```

> ⚠️ 这只是**"选哪个入口技能"的粗判**。**权威判定在 `specify` 出口** ——
> 那里有 `intention.md` 可细判，且只有那时改档才零返工。本技能**不修改**任何已建任务的档位。

### Step 3：任务初始化（**仅「零个」时**）

**前置（准入检查）**：`需求内容` **非空** —— 空则不建任务，要求用户先说明要做什么。

> 这是**输入非空校验**，不是需求质量判断。需求够不够详细由被转交的 `specify` 在澄清时解决。

**档位 `<档>` 的取值** = 入口层给出的 `mode`；入口层未给时，把 Step 2 粗判出的 level 按
`./policies/risk-signals.md` **§1 的单源映射**折算成档位（**本技能不内联该映射**）。

#### 3.1 解析运行环境

使用 SessionStart 注入的路径（本技能内此后一律复用 `$REPO_ROOT` / `$PLUGIN_ROOT`）：

- 优先：环境变量 `$PLUGIN_ROOT` / `$REPO_ROOT`（Trae `env`、Cursor `env`、Claude `CLAUDE_ENV_FILE`，或 Agent 上下文中的同名赋值）
- 兜底：source `.polaris/.cache/runtime-env`（SessionStart 落盘）
- 仍无 `$PLUGIN_ROOT` → 按 H12 阻断，提示用户重启会话以触发 SessionStart

```bash
if [ -z "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/scripts/task-entry.sh" ]; then
  echo "PLUGIN_ROOT unset or hooks missing — restart session to run SessionStart" >&2
  exit 2
fi
```

#### 3.2 建任务（**一次调用**完成三件事）

```bash
CREATE=$(bash "$PLUGIN_ROOT/scripts/task-entry.sh" --kind coding --as intake --mode <档> --repo-root "$REPO_ROOT")
CREATE_EXIT=$?
```

- `CREATE_EXIT != 0` → **阻断**（按 H12）；stderr 写明原因（缺 `--mode` / 非法档 / 环境问题）。
  - stderr 提示「项目未纳入 git 版本管理」时 → **提示用户先执行 `git init`** 完成初始化，再重试本步；**不得**继续建任务。
- 按返回的 `action` 分派：

| `action` | 含义 | 动作 |
| -------- | ---- | ---- |
| `create` | **已一步建好**：目录 + `workflow.mode` + 游标（幂等） | 取 `task_id`（= `draft_name`）→ 3.3 |
| `resolve-drafts` | 磁盘上有**未注册的** `draft-*` 残留 | 按 `./policies/task-entry.md` **§5.1** 裁决（见下） |
| `select` / `handover` / `resume` / `block` | ⚠️ **本步不应出现**（本步只在「零个在途任务」时执行）⇒ 说明**状态在 Step 1 之后变了** | 按 `./policies/task-entry.md` §2 处理；**不要**当场硬用 —— 先回 **Step 1** 重判 |

`resolve-drafts` 的裁决（**不得**自行裁决，按 `./policies/decision-point.md` 暂停询问）：

- **A. 继续最近一个** / **B. 指定一个** → 采纳该孤儿 draft：执行 **§5.1 的两条命令**补齐
  （`append-active` 注册 + 写 `workflow.mode=<档>`），然后**直接进 3.3**。
  🔴 **不要重跑 3.2** —— draft 目录还在，会再报一次 `resolve-drafts`，**死循环**。
- **C. 全部丢弃** → 按 §5.1 的命令清理后**重跑 3.2**（此时已无残留，会走 `create`）
- **D. 取消** → 结束本技能

> `task_id` 取的是 `draft_name`：被转交的 `specify` 在 finalize 时会把目录改名成正式 `task_id`，并同步游标条目。

#### 3.3 状态行（H8）

输出：`[polaris-flow 开发]任务管理 - 已建任务：<draft_name>；工作流=<档>；游标已注册`

### Step 4：转交

| 来源 | 目标技能 |
|---|---|
| **新建**（Step 3 之后） | 本档序列的**首段** —— `phasesForMode('coding', <档>)[0]`（三档都是 `specify`） |
| **已有任务**（Step 1 选定 / 上游指定） | 该行的 **`skill` 字段**（代码算好的，不猜） |

**同会话内加载** `polaris{{SKN_SPR}}coding{{SKN_SPR}}<目标技能>`（**不要求**用户再敲命令），并在交接中附上：

1. 🔴 **`task_id`** —— **必给**：它是执行层的**唯一任务来源**（执行层不得自行查任务，见下）。
   新建路径给的是 `draft_name`；正式 `task_id` 由 `specify` 在 `finalize` 时敲定，并由**下一次交接**沿用新值。
2. 🔴 **`worktree_path`** —— 取自该行；**空 = 主仓**，非空 ⇒ 被转交技能读产物 / 跑命令一律以该 worktree 为仓库根。
3. `需求内容`：用户首次输入的**原文**（不摘要、不改写）。可选。
4. `附加上下文`：本次随输入带来的文件 / 目录 / 说明
5. 显式告知被加载的技能：在自身流程开始前**先完整读取**上述材料；读取失败或内容与诉求明显无关 → 先回报用户再决定，**不得静默跳过**；后续产物以上下文为准绳，冲突时以用户提供的上下文优先

⚠️ **阶段出口的自动衔接**（`./policies/auto-transition.md`）加载本技能时，同样要带上它自己那一次的 `task_id`
—— 由本技能 Step 1 的「上游已指定 `task_id`」分支直接采用。**链条就这样逐跳传递，不靠会话记忆。**

本技能到此结束。

## 与其他层的边界（三句话）

1. **需求够不够详细** → 不归本技能，归 `specify` 的澄清。
2. **档位准不准** → 不归本技能，归 `specify` 的**出口**。
3. **本技能只管**：任务有几个、在哪、该谁接手、怎么把控制权交出去。
