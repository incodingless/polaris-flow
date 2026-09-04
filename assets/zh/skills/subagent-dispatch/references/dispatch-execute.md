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

### Step D-0：工具可用性判定（必走，agent 非 null 时）

选定 `agent` 后、构造 prompt 前，按下列顺序判定该 agent 是否具备「读文件」能力：

1. 取 `agent.tools` 数组（由 subagent-probe 扫描 agent frontmatter `tools:` 行返回）
2. 若数组含 `read_file` 或 `Read`（任一即可）→ **判定为「路径引用型」** → 走 Step D-1
3. 若数组**不含**上述任一 → **判定为「内容注入型」** → 走 Step D-2

> **`tools` 字段语义**：仅反映 frontmatter 声明，**不保证宿主实际授予**。已知部分宿主会忽略 frontmatter `tools:` 字段，按宿主默认工具集挂载 subagent。
>
> **保守策略**：调用方不确定宿主是否真的授予 frontmatter `tools` 时，**应直接走「内容注入型」**——成本是多读几个文件，收益是消除派发后失败的不确定性。

**agent=null 时**：跳过 D-0，按 `task_spec.constraints.dispatch_mode_hint` 走对应分支（见下方"默认 subagent"和"inline 执行"小节）。

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

Report back with status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Include in your report: output (your deliverable or path to it), concerns (list of issues if any).
Do not ask the user questions. If you lack context, output NEEDS_CONTEXT and list what you need.
```

subagent 按 `task-type-mapping.md` 的任务类型 → 所需工具推断自读 `materials` 中列出的路径并执行任务。

### Step D-2：内容注入型（工具不可用时）

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

Report back with status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Include in your report: output (your deliverable or path to it), concerns (list of issues if any).
Do not ask the user questions. If you lack context, output NEEDS_CONTEXT and list what you need.
```

注入型下 subagent 不需读文件能力，直接基于 `Materials:` 段执行任务。

> 若 `materials` 为空或未提供，`Materials:` 段省略，prompt 只含 Task Type / Task / Constraints / 回报契约。

## 按 task_type 的 prompt 增强

不同任务类型的 prompt 可在基础模板上追加任务专属指引：

### code_writing（代码编写）

追加：
```text
You are implementing code. Follow existing code style. Write tests if required by constraints. Commit your changes if the platform supports it. Report the files you changed and test results.
```

### code_review（代码评审）

追加：
```text
You are reviewing code. Check for: correctness, security, edge cases, spec compliance, code quality. Report CRITICAL / IMPORTANT / MINOR findings with file:line references. Do not modify any files.
```

### doc_writing（文档撰写）

追加：
```text
You are writing a document. Follow the requested format and structure. Ensure logical flow, completeness, and clarity. Report the document content or path to the written file.
```

### doc_review（文档评审）

追加：
```text
You are reviewing a document. Check for: completeness, logical consistency, factual accuracy, formatting compliance, clarity. Report findings by severity (CRITICAL / IMPORTANT / MINOR). Do not modify any files.
```

### data_analysis（数据分析）

追加：
```text
You are performing data analysis. Read the data, apply appropriate analysis methods, and report findings. If you need to run scripts, do so and report the commands and results. Report your analysis results and any visualizations.
```

### research（信息研究）

追加：
```text
You are performing research. Use web search and fetch as needed. Cross-validate findings from multiple sources. Report a synthesized summary with source citations. Do not fabricate sources.
```

### code_explore（代码库探索）

追加：
```text
You are exploring a codebase. Answer the questions in the Task description based on code reading. Report file paths and line numbers as evidence. Do not modify any files.
```

### command_exec（命令执行）

追加：
```text
You are executing commands. Run the specified commands and report their output. Do not modify source code unless the task explicitly requires it. Report exact command output and exit codes.
```

## 通用约定

1. **不附带用户决策**：启动 prompt **禁止**包含用户对前序 findings 的采纳/拒绝决策（保独立性）。交叉评审场景尤其严格执行。
2. **不假设下一步**：subagent 执行结束后**禁止**建议「下一步跑哪个 skill」；由主代理 / 调用方决定。
3. **不向用户提问**：subagent 不得向用户提问；缺信息 → 输出 `NEEDS_CONTEXT` 并列出所需上下文。
4. **回报契约**：subagent 必须回报 `status`（DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT）和 `output`（产出内容或路径），有顾虑时附 `concerns` 清单。
5. **材料顺序**：注入型下 Materials 按 `materials` 数组顺序拼接，不得自调。
6. **约束遵守**：subagent 必须遵守 `task_spec.constraints`（允许修改范围、禁止操作、输出格式等）。
7. **语言**：subagent 输出语言遵循 `task_spec.language`。

## agent=null 的两个分支

调用方传入 `agent=null` 时，按 `task_spec.constraints.dispatch_mode_hint` 分支：

### 分支一：默认 subagent 派发（`dispatch_mode_hint=default_subagent`）

不指定 agent 文件、不绑 path，直接派发宿主默认 subagent。默认 subagent 无已知工具声明 → **直接走 D-2 内容注入型**（主代理先 Read materials 全文注入 prompt）。

> 若 task_type 要求特定能力（如 `code_writing` 需写文件），且主代理无法确认默认 subagent 具备该能力，应在 `concerns` 中如实记录，由调用方决定是否改走 inline。

### 分支二：inline 执行（`dispatch_mode_hint=inline`）

主代理在自己会话内执行 task_spec，**不派发**任何 subagent：

1. 按 `task_type` 与 `task_description` 直接执行（如 doc_review → 主代理 Read materials 后产出评审报告）
2. 产出填入 `result.output`，`dispatch.status=degraded_inline`，`dispatch.dispatch_mode=inline`
3. `dispatch.reason` 标注 inline 原因（如调用方 specialized 模式专用 agent 未命中，用户确认 inline）

## 调用流程总览

```text
调用方（编排型技能）
  ├── agent 非 null            → D-0 工具判定 → D-1 路径引用型 或 D-2 内容注入型 派发
  ├── agent=null + hint=default_subagent → 默认 subagent + D-2 注入型 派发
  └── agent=null + hint=inline → 主代理 inline 执行，填 result
```
