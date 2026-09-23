# 派发执行策略

本文件定义 `subagent-dispatch` 在收到调用方传入的 `agent`（由 `subagent-probe` 探测后调用方选定）和 `task_spec` 后的派发执行机制。

## 适用范围

- 调用方传入 agent 非空时的派发执行（D-0 工具判定 → D-1 路径引用型 / D-2 内容注入型）
- 调用方传入 agent=null 且 `dispatch_mode_hint=default_subagent` 时的默认 subagent 派发
- 调用方传入 agent=null 且 `dispatch_mode_hint=inline` 时的主代理 inline 执行
- 各类通用任务类型（代码 / 文档 / 评审 / 分析 / 研究）的 prompt 构造

## 输入参数

派发前从调用方入参获取：

| 参数 | 必填 | 说明 |
|---|---|---|
| `agent` | 是（可 null） | 由 `subagent-probe` 返回并经调用方选定的 agent 项；含 id / path / tools / source。null 表示用默认 subagent 或 inline |
| `task_spec.task_description` | 是 | 任务的具体描述 |
| `task_spec.task_type` | 是 | 任务类型（见 `subagent-probe` 的 `references/task-type-mapping.md`） |
| `task_spec.materials` | 否 | 材料路径清单数组；subagent 需读取的文件 |
| `task_spec.constraints` | 否 | 约束条件（允许范围、禁止操作、输出格式等）；agent=null 时含 `dispatch_mode_hint` |
| `task_spec.language` | 否 | 输出语言；默认跟随主会话 |

## 派发三步式

> **agent 来源**：进入本阶段时 agent 已由调用方选定并传入。本阶段不重新选择 agent，只做工具判定与 prompt 构造。

### Step D-0：工具可用性判定（必走）

选定 `agent` 后、构造 prompt 前，按下列顺序判定派发方式：

1. 取 `agent.tools` 数组（由 subagent-probe 扫描 agent frontmatter `tools:` 行返回）
2. 若数组含 `read_file` 或 `Read`（任一即可）→ **路径引用型** → 走 Step D-1
3. 若数组**不含**上述任一 → 候选「内容注入型」，**但必须先过 D-0.1 体积闸门**

#### D-0.1 体积闸门（2026-09-23 新增）

D-2 会让**主代理先 Read 全文**，这是对父会话上下文最贵的操作。因此它只允许用于小材料：

- **闸门**：`materials` 各文件**合计 ≤ 300 行**。
- **超闸门** → **禁止注入**，改走二选一：
  - 换一个具备读文件能力的 agent（重跑 probe 或按 `matched_agents` 换项）；
  - 或降级 `inline`（主代理自己读 → **立刻写入产出路径** → 回报只给路径 → 标注 `inline`）。

> **闸门的意义**：把「父代理先读全文」限制在可接受的成本内。超限材料走 inline 至少产出会落盘、
> 回报也不把原文贴回；走 D-2 则是纯消耗且无落盘产出。

#### D-0.2 保守策略（2026-09-23 反转）

`tools` 字段**仅反映 frontmatter 声明，不保证宿主实际授予**（已知部分宿主忽略它，按默认工具集挂载 subagent）。

- **旧策略**（已废止）：「不确定时应直接走内容注入型」——这让「父代理先读全文」成为**默认行为**，
  与「`materials` 只给路径、父会话禁止先读」的原则直接冲突。
- **现策略**：**不确定时走 D-1（路径引用型）**。若派发后 subagent 报 `NEEDS_CONTEXT`（无法读文件），
  再按降级链处理：换 agent → 体积闸门内的 D-2 → inline。

**agent=null 时**：跳过 D-0，按 `task_spec.constraints.dispatch_mode_hint` 走对应分支（见下方"默认 subagent"和"inline 执行"小节）；默认 subagent 分支同样受 **D-0.1 体积闸门**约束。

### Step D-1：路径引用型（工具可用时）

subagent 自读材料，启动 prompt 给路径清单 + 任务描述 + 约束。

**prompt 模板**：

```text
Task Type: <task_type>
Task: <task_description>
Language: <language>
Constraints:
  <constraints，每行一条；无则省略此节>
Materials:
  - <materials[0]>
  - <materials[1]>
  ...

Report back with EXACTLY these three fields and nothing else:
  status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT | FAILED
  artifact_path: <path of the file you wrote; null if you produced no file>
  concerns: [<one-line items, max 5>]
Write your deliverable to a file FIRST, then report only its path.
Do NOT paste file contents, code blocks, diffs, raw search results, or transcripts into your report.
Do not ask the user questions. If you lack context, output NEEDS_CONTEXT and list what you need.
```

subagent 按 `task-type-mapping.md` 的任务类型 → 所需工具推断自读 `materials` 中列出的路径并执行任务。

### Step D-2：内容注入型（工具不可用 **且** 材料过 D-0.1 闸门时）

主代理在派发前先 `Read` `materials` 数组中每个路径的全文，按统一格式拼入 prompt 的 `Materials:` 段；subagent 不需读文件能力即可执行。

**Materials 拼接格式**：

```text
## File: <materials[i]>
<文件全文>

## File: <materials[i+1]>
<文件全文>

...
```

每条以 `## File: <相对路径>` 起始，后接文件全文，文件之间空行分隔。**禁止**摘要替代全文。

**prompt 模板**：

```text
Task Type: <task_type>
Task: <task_description>
Language: <language>
Constraints:
  <constraints，每行一条；无则省略此节>
Materials:
## File: <materials[0]>
<全文>

## File: <materials[1]>
<全文>

...（按 materials 数组顺序全部注入）...

Report back with EXACTLY these three fields and nothing else:
  status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT | FAILED
  artifact_path: <path of the file you wrote; null if you produced no file>
  concerns: [<one-line items, max 5>]
Write your deliverable to a file FIRST, then report only its path.
Do NOT paste file contents, code blocks, diffs, raw search results, or transcripts into your report.
Do not ask the user questions. If you lack context, output NEEDS_CONTEXT and list what you need.
```

注入型下 subagent 不需读文件能力，直接基于 `Materials:` 段执行任务。

> 若 `materials` 为空或未提供，`Materials:` 段省略，prompt 只含 Task Type / Task / Constraints / 回报契约。

## 按 task_type 的 prompt 增强

不同任务类型的 prompt 可在基础模板上追加任务专属指引：

### code_writing（代码编写）

追加：
```text
You are implementing code. Follow existing code style. Write tests if required by constraints. Commit your changes if the platform supports it. Write your summary (files changed + test results) to the output path and report only that path.
```

### code_review（代码评审）

追加：
```text
You are reviewing code. Check for: correctness, security, edge cases, spec compliance, code quality. Write findings (CRITICAL / IMPORTANT / MINOR, with file:line references) to the output path and report only that path. Do not modify any files.
```

### doc_writing（文档撰写）

追加：
```text
You are writing a document. Follow the requested format and structure. Ensure logical flow, completeness, and clarity. Write the document to the output path and report only that path.
```

### doc_review（文档评审）

追加：
```text
You are reviewing a document. Check for: completeness, logical consistency, factual accuracy, formatting compliance, clarity. Write findings by severity (CRITICAL / IMPORTANT / MINOR) to the output path and report only that path. Do not modify any files.
```

### data_analysis（数据分析）

追加：
```text
You are performing data analysis. Read the data and apply appropriate analysis methods. Write the analysis results (and any visualizations) to the output path, including the commands you ran and their results, then report only that path.
```

### research（信息研究）

追加：
```text
You are performing research. Use web search and fetch as needed. Cross-validate findings from multiple sources. Write a synthesized summary (with source citations) to the output path and report only that path. Do not fabricate sources.
```

### code_explore（代码库探索）

追加：
```text
You are exploring a codebase. Answer the questions in the Task description based on code reading. Write the answer (with file paths and line numbers as evidence) to the output path and report only that path. Do not modify any files.
```

### command_exec（命令执行）

追加：
```text
You are executing commands. Run the specified commands. Write the exact command output and exit codes to the output path and report only that path. Do not modify source code unless the task explicitly requires it.
```

## 通用约定

1. **不附带用户决策**：启动 prompt **禁止**包含用户对前序 findings 的采纳/拒绝决策（保独立性）。交叉评审场景尤其严格执行。
2. **不假设下一步**：subagent 执行结束后**禁止**建议「下一步跑哪个 skill」；由主代理 / 调用方决定。
3. **不向用户提问**：subagent 不得向用户提问；缺信息 → 输出 `NEEDS_CONTEXT` 并列出所需上下文。
4. **回报契约**：subagent 只回报**三件**——`status`（DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT / FAILED）、`artifact_path`（产出文件路径；无产出则 `null`）、`concerns`（短列表，每项 ≤1 行）。**禁止**在回报中粘贴原文、代码块、diff、未命中检索结果或过程记录。产出必须**先落盘再报路径**——回报里出现正文即视为违反契约。
5. **材料顺序**：注入型下 Materials 按 `materials` 数组顺序拼接，不得自调。
6. **约束遵守**：subagent 必须遵守 `task_spec.constraints`（允许修改范围、禁止操作、输出格式等）。
7. **语言**：subagent 输出语言遵循 `task_spec.language`。
8. **产出落盘（2026-09-23 起）**：subagent 的产出**必须写入文件**，回报只给路径。产出路径取
   `task_spec.constraints.output_path`；未指定时写入 `<任务目录>/<task_type>-<YYYYMMDD-HHmmss>.md`，
   并在 `artifact_path` 回报**实际使用的**路径。**下文各 task_type 增强里凡出现 "Report …" 字样，
   一律按本条执行**：写入产出路径后只报路径，不把内容贴回。

## agent=null 的两个分支

调用方传入 `agent=null` 时，按 `task_spec.constraints.dispatch_mode_hint` 分支：

### 分支一：默认 subagent 派发（`dispatch_mode_hint=default_subagent`）

不指定 agent 文件、不绑 path，直接派发宿主默认 subagent。默认 subagent 无已知工具声明 → 按 **D-0.1 体积闸门**判定：

- `materials` 合计 ≤ 300 行 → 走 D-2 内容注入型（主代理 Read 后注入）；
- **超闸门** → 不注入，直接降级 `inline`（主代理自己读 → 立刻写入产出路径 → 只报路径 → 标注 `inline`）。

> **这是最主要的闸门**：多数编排步骤都用 `agent=null`（`SUPPORTS_SUBAGENT=true` 且只要默认通用 agent 时可跳过 probe），
> 所以「父会话被灌入全文」的主要风险口就在这条分支上。

> 若 task_type 要求特定能力（如 `code_writing` 需写文件），且主代理无法确认默认 subagent 具备该能力，应在 `concerns` 中如实记录，由调用方决定是否改走 inline。

### 分支二：inline 执行（`dispatch_mode_hint=inline`）

主代理在自己会话内执行 task_spec，**不派发**任何 subagent：

1. 按 `task_type` 与 `task_description` 直接执行（如 doc_review → 主代理 Read materials 后产出评审报告）
2. **产出先落盘**：写入 `task_spec.constraints.output_path`（未指定时写入任务目录下的约定路径），再把**该路径**填入 `result.artifact_path`；`dispatch.status=degraded_inline`、`dispatch.dispatch_mode=inline`
3. `dispatch.reason` 标注 inline 原因（如调用方 specialized 模式专用 agent 未命中，用户确认 inline）
4. **回复正文不贴原文**，并标注边界 `inline`

## 调用流程总览

```text
调用方（编排型技能）
  ├── agent 非 null            → D-0 工具判定 → D-1 路径引用型 或 D-2 内容注入型 派发
  ├── agent=null + hint=default_subagent → 默认 subagent + D-2 注入型 派发
  └── agent=null + hint=inline → 主代理 inline 执行，填 result
```
