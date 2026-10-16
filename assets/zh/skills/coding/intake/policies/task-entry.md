# 进入任务（`task-entry` 原语的细则 · `intake` **私有**）

> **这是 `intake`（任务管理与调度层）的私有细则。** `intake` 是 `task-entry` 原语的**唯一调用方**
> （调用位置 = 它的 **Step 3**，仅在「零个在途任务」时）。
>
> 🔴 **执行层**（`specify` / `plan` / `design` / `tasks` / `build` / `verify` / `ship`）**不得调用本原语** ——
> 它们只有一个入口 = `intake`，其 Step 1 只**接收 `intake` 的交接**，不做任何任务判定。
> ⚠️ **本文随 `intake` 安装**（落在 `coding/intake/policies/`），**不再被注入其他技能** ——
> 别处写 `./policies/task-entry.md` 是坏引用。

## 为什么单独成文

「选任务 → 判阶段 → 建任务」这套动作**只属于调度层**。判定本身在**代码**里
（`src/core/config/task-kind-layout.ts` 的 `skillForModePhase`）—— 本文件只写**怎么调、怎么按返回值行动**，
不写任何映射表；`intake` 的 SKILL.md 只保留主流程与出口分派。

## 1. 取结论（一条命令）

```bash
CREATE=$(bash "$PLUGIN_ROOT/scripts/task-entry.sh" \
  --kind coding --as intake --mode <本档> --repo-root "$REPO_ROOT")
CREATE_EXIT=$?
```

- `--as` 固定填 `intake`。
- `--mode` 填**入口层给出的档位**（`tweak` / `normal` / `strict`）；入口层未给档时用它 Step 2 的粗判结果。
  ⚠️ 它**只在 `create` 时被写入**。
- `CREATE_EXIT != 0` → **阻断**，按 stderr 处理（缺 `--mode` / 非法档 / 环境问题）。
  - stderr 提示「项目未纳入 git 版本管理」时 → 提示用户先执行 `git init` 再重试；**不得**继续建任务。
- ⚠️ **本命令会写盘**（零候选时**一步**完成：建目录 + 写 `workflow.mode` + 注册游标，幂等）。
  只想**读**列表（Step 1 恢复分发）请用只读的 `workflow-entry get-active-changes`。

## 2. 按 `action` 分派

| `action` | 含义 | 动作 |
| -------- | ---- | ---- |
| `create` | 零个在途任务 → 已一步建好目录 + `workflow.mode` + 游标（幂等） | 取 `task_id`（= `draft_name`）→ 转交本档序列首段 |
| `resolve-drafts` | 零个在途任务但磁盘上有**未注册的** `draft-*` 残留 | 见 §5.1：裁决后**重跑 §1** |
| `select` | **多个**在途任务 → 只列候选，**不替用户选** | 见 §3：列候选选 1 个，带 `--task-id` **重跑 §1** |
| `handover` | 唯一任务，但该由别的技能接手 | 同会话加载 `polaris{{SKN_SPR}}coding{{SKN_SPR}}<skill>`，**不建新任务** |
| `resume` | 唯一任务且 `skill == intake` | ⚠️ **不应出现**（`intake` 不执行任何阶段）→ 按 `block` 处理 |
| `block` | 没有答案（读不到 state / `phase` 空 / `skill=null`） | 把 `reason` / `state_path` / `phase` 交给用户人工确认，**停下** |

> 🔴 **后四个出口在 Step 3 都不该出现** —— 该步只在「零个在途任务」时执行。若返回它们，
> 说明**状态在 Step 1 之后变了**。正确处理 = **回 Step 1 重判**，**不要**当场硬用。
>
> ⚠️ `handover` 时**必须同会话加载**目标技能，不得提示用户「请用 X 技能」后原地退出；
> 更不得「直接往下走（新建）」。`block` 是**结论**不是错误：**不得**把它当成「零个」去新建。

## 3. `select`：列候选

逐行给 `中文(英文)`；中文取不到时只显英文。`state_readable=false` 的行标注「无法路由」并给出 `state_path`。

```
- <task_id> (工作流：严格(strict)，阶段：提案(plan)，技能：提案(plan))
```

按 `./policies/decision-point.md` 请用户选 **1 个**，然后带 `--task-id <选中>` **重跑 §1**。

## 4. 状态行（H8）

本步不做状态行；`create` / `handover` 之后由各技能在自己的 Step 入口输出。

## 5. 需要用户裁决的分支（刻意不放进 `task-entry`）

`task-entry` **不删任何东西**。下面两组分支要么破坏性、要么需要用户裁决，因此留在本文件里，
用**既有原语**表达 —— 各技能照抄本节的命令，不要自己另写一套。

### 5.1 `resolve-drafts`：未注册的 draft 残留

`action=resolve-drafts` 时，`drafts` 是磁盘上存在、但**游标里没有**的 `draft-*` 目录名。
按 `./policies/decision-point.md` 暂停询问：

```
存在临时任务，请选择：
```

- **A. 继续最近一个**：`draft_name` = `drafts` 最后一项
- **B. 指定一个**：列出全部 `drafts` 让用户选
- **C. 全部丢弃**：对每个 `d` 执行下框，然后**重跑 §1**
- **D. 取消**：结束本技能

A / B 走的是「**采纳孤儿**」：它是上一轮没走完的同一个任务，**必须补注册与工作流**，
否则永远进不了游标、且会在 `finalize` 的 `rename-active` 处以 exit 3 阻断：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" append-active \
  --kind coding --skill intake --repo-root "$REPO_ROOT" --task-id "$draft_name"
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$draft_name" --kind coding \
  --set workflow.mode=<本档固定值>
```

之后按「新建后第一步」继续。

```bash
for d in <drafts 列表>; do
  rm -rf "$REPO_ROOT/.polaris/tasks/$d"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind coding \
    --skill intake --repo-root "$REPO_ROOT" --where-task-id "$d"
done
```

### 5.2 「丢弃并新建」（用户明确要求废弃在途任务时）

> ⚠️ 本分支**不来自 `resume`**（`intake` 不执行任何阶段，见 §2）—— 由用户明确要求「丢掉这个任务、重新开始」时触发。

按 `./policies/decision-point.md` 暂停二选一（用**字面标签**，**不要**用 A/B/C —— 会与 §5.1 的 A/B/C/D 撞字母）：

- **丢弃并新建** → 执行下框，然后**重跑 §1**（此时已无该任务，会走 `create`）
- **取消** → 结束本技能

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind coding \
  --skill intake --repo-root "$REPO_ROOT" --where-task-id "$task_id"
rm -rf "$REPO_ROOT/.polaris/tasks/$task_id"
```

- ⚠️ 返回的 `worktree_path` **非空** → **阻断，不要执行本框**。任务数据在隔离工作区里，
  拆除它先要决定其中的提交是留还是丢（属另一件事）。把 `worktree_path` 交给用户，
  提示其先用 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` 收尾或手工拆除。

> 两组分支的宾语不会重合：§5.1 问的是「**游标外的**孤儿 draft」，§5.2 问的是「**刚返回的**那个任务」。
