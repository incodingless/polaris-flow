# 进入任务（coding 入口技能共用）

> **适用范围：仅 coding 族的三个入口技能** —— `tweak` / `normal` / `specify`。
> 其他族（prd / testing / prototype / debug）**不要引用**本文件：它们的任务来源与阶段表不同。

## 为什么共用一份

「选任务 → 判阶段 →（必要时）建任务」这套动作**与走哪个档无关**，三份复制只会漂移。
判定本身在**代码**里（`src/core/config/task-kind-layout.ts` 的 `skillForModePhase`）——
本文件只写**怎么调、怎么按返回值行动**，不写任何映射表。

各入口技能的**变量**只有三个：`--as`、`--mode`、以及「`create` 之后进入自己的哪一步」。

## 1. 取结论（一条命令）

```bash
ENTRY=$(bash "$PLUGIN_ROOT/scripts/task-entry.sh" \
  --kind coding --as <本技能族内相对名> --mode <本档固定值> \
  --repo-root "$REPO_ROOT")
ENTRY_EXIT=$?
```

- `--as` 填**本技能的族内相对名**（`tweak` / `normal` / `specify`）。
- `--mode` 填**本档固定值**（`tweak` / `normal` / `full`）。⚠️ 它**只在需要新建任务时被写入**；
  判定阶段一律用任务**自己** `state.yaml` 里的 `mode` —— 通道不被入口假设。
- `ENTRY_EXIT != 0` → **阻断**，按 stderr 处理。
- ⚠️ **本命令在「零个在途任务」时会建任务**（建目录 + 写 `workflow.mode` + 注册游标，全部一步完成）。
  只想**读**列表（例如受理入口 `intake` 的恢复分发）请用只读的 `get-active-changes`。

## 2. 按 `action` 分派

| `action` | 含义 | 动作 |
| -------- | ---- | ---- |
| `resume` | 任务停在本技能的中断点 | 用返回的 `task_id`，跳到本技能「上下文压缩恢复」表里中断点对应的 Step |
| `handover` | 该由别的技能接手 | **转交**：同会话内加载 `polaris{{SKN_SPR}}coding{{SKN_SPR}}<skill>`，**不建新任务**；本技能结束 |
| `create` | 没有在途任务，已建好并注册 | 用返回的 `task_id`，进入本技能「新建后第一步」 |
| `select` | 有多个在途任务 | 见 §3：列候选请用户选 1 个，再带 `--task-id` **重跑 §1** |
| `resolve-drafts` | 磁盘上有未注册的 `draft-*` 残留 | 见 §5.1：裁决后再重跑 §1 |
| `block` | 没有答案 | 把 `reason` / `state_path` / `phase` 交给用户人工确认，**停下** |

- ⚠️ `handover` 时**必须同会话加载**目标技能，不得提示用户「请用 X 技能」后原地退出
  （那要求用户再敲一次命令）；更不得「直接往下走（新建）」。
- ⚠️ `block` 是**结论**不是错误：**不得**把它当成「零个」去新建，也不得猜阶段。
- 除 `select` / `resolve-drafts` 外，其余四个动作**都不需要第二次调用**。

## 3. `select`：列候选

逐行给 `中文(英文)`；中文取不到时只显英文。`state_readable=false` 的行标注「无法路由」并给出 `state_path`。

```
- <task_id> (工作流：完整(full)，阶段：提案(plan)，技能：提案(plan))
```

按 `./policies/decision-point.md` 请用户选 **1 个**，然后带 `--task-id <选中>` **重跑 §1**。

## 4. 状态行（H8）

本步不做状态行；`create` / `resume` 之后由各技能在自己的 Step 入口输出。

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
  --kind coding --skill <本技能> --repo-root "$REPO_ROOT" --task-id "$draft_name"
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$draft_name" --kind coding \
  --set workflow.mode=<本档固定值>
```

之后按「新建后第一步」继续。

```bash
for d in <drafts 列表>; do
  rm -rf "$REPO_ROOT/.polaris/tasks/$d"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind coding \
    --skill <本技能> --repo-root "$REPO_ROOT" --where-task-id "$d"
done
```

### 5.2 「丢弃并新建」（`resume` 时用户不想续写）

`action=resume` 时，按 `./policies/decision-point.md` 暂停三选一（用**字面标签**，
**不要**用 A/B/C —— 会与 §5.1 的 A/B/C/D 撞字母）：

- **续写** → 沿用该 `task_id`，跳到本技能「上下文压缩恢复」表里中断点对应的 Step，**不再执行 §1**
- **丢弃并新建** → 执行下框，然后**重跑 §1**（此时已无该任务，会走 `create`）
- **取消** → 结束本技能

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind coding \
  --skill <本技能> --repo-root "$REPO_ROOT" --where-task-id "$task_id"
rm -rf "$REPO_ROOT/.polaris/tasks/$task_id"
```

- ⚠️ 返回的 `worktree_path` **非空** → **阻断，不要执行本框**。任务数据在隔离工作区里，
  拆除它先要决定其中的提交是留还是丢（属另一件事）。把 `worktree_path` 交给用户，
  提示其先用 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` 收尾或手工拆除。

> 两组分支的宾语不会重合：§5.1 问的是「**游标外的**孤儿 draft」，§5.2 问的是「**刚返回的**那个任务」。
