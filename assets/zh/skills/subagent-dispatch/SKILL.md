---
name: polaris{{SKN_SPR}}subagent-dispatch
description: Subagent 派发执行技能。接收 platform、已选定的 agent（来自 subagent-probe、SessionStart 缓存或调用方固定 id；亦可 agent=null）、task_spec，构造 prompt 并派发执行，等待回报。纯执行，不做探测、不做选 agent 决策、不做降级判断。
---

# subagent-dispatch

## 定位

**派发执行技能**：由编排型技能在已选定 agent（或 `agent=null`）后调用，负责"D-0 工具判定 → D-1/D-2 prompt 构造 → 派发执行 → 等待回报"，**不做探测、不做选 agent 决策、不做降级判断**。

## 适用场景

调用方技能在以下情况调用本技能：

- 已选定要派发的 agent（经 `subagent-probe`，或跳过 probe 时使用 `agent=null` 默认通用）
- 需要让一个独立 LLM context 接手某项工作（代码实现、文档撰写、文档评审、数据分析、信息研究等）

**不适用**：
- 探测可用 subagent（用 `polaris{{SKN_SPR}}subagent-probe`；跳过规则见该技能契约）
- 选定哪个 agent（由调用方决策）
- 降级 / inline 决策（由调用方决策）
- 主代理自己能直接完成的简单任务（直接 inline 执行，无需派发）

## 调用方契约

**编排型技能在已选定 agent（或决定 `agent=null`）后，调用 `use_skill("polaris{{SKN_SPR}}subagent-dispatch")` 并传入 `platform`、`agent`、`task_spec`，等待回报。**

选定途径：
- 经 `subagent-probe` 拿到清单后选定某一项；或
- 按 SessionStart 能力注入跳过 probe：平台已支持且本步只要默认通用 Agent → `agent=null`（**不要求** probe 回执）

调用方准备入参时应包含：
- `platform`：宿主平台 id（从 SessionStart 注入的 `PLATFORM_ID` 或项目配置读取）
- `agent`：由 `subagent-probe` 返回的 agents[] 中调用方选定的某一项（含 id / path / tools / source）；传 `null` 表示用默认 subagent 或 inline 执行
- `task_spec`：
  - `task_description`：任务的具体描述（做什么、产出什么）
  - `task_type`：任务类型（见 `subagent-probe` 的 `references/task-type-mapping.md`）
  - `materials`：材料路径清单（可选；subagent 需要读取的文件路径数组）
  - `constraints`：约束条件（可选；如允许修改的文件范围、禁止执行的操作、输出格式要求等）。**建议包含 `output_path`**（subagent 产出文件的落盘路径）——回报契约要求产出先落盘、只报路径
  - `language`：输出语言（可选；默认跟随主会话语言）

> **agent=null 的场景**：
> 1. 调用方 probe 后 agents 为空，或决定派默认 subagent / inline
> 2. **跳过 probe**：SessionStart 已注入 `SUPPORTS_SUBAGENT=true` 且 `PLATFORM_DEGRADATION` 为空，且本步无 `subagent_id`、无 `task_type` 预筛 → 直接本技能 + `agent=null`（合法，不要求 probe 回执）
>
> 传 `agent=null` 时在 `task_spec.constraints` 中加 `"dispatch_mode_hint: default_subagent | inline"`。本技能按 hint 执行：
> - `default_subagent` → 派发宿主默认 subagent（不指定 agent 文件），走 D-2 内容注入型
> - `inline` → 主代理在自己会话内执行 task_spec

## 输入

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `platform` | string | 是 | 宿主平台 id |
| `agent` | object\|null | 是 | 由 subagent-probe 返回并经调用方选定的 agent 项；null 表示用默认 subagent 或 inline |
| `task_spec` | object | 是 | 任务规格对象，包含 `task_description` / `task_type` / `materials` / `constraints` / `language` |

## 输出

必须返回以下结构化结果：

```text
dispatch:
  status: dispatched | degraded_inline | degraded_default | unsupported
  agent: <agent id 或 path；degraded 时为空>
  dispatch_mode: path_reference | content_injection | default_subagent | inline
  reason: <短说明>
result:
  status: <subagent 回报状态：DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT | FAILED>
  artifact_path: <产出文件路径；未产出文件则 null>
  concerns: <短列表，无则 []>
```

| `dispatch.status` | 含义 | 调用方应执行 |
|---|---|---|
| `dispatched` | 已按选定 agent 派发执行 | 消费 `result`；按 `result.status` 决定后续动作 |
| `degraded_default` | agent=null 且 hint=default_subagent，已派发默认 subagent | 消费 `result` |
| `degraded_inline` | agent=null 且 hint=inline，已由主代理 inline 执行 | 消费 `result` |
| `unsupported` | 派发失败（如宿主无默认 subagent、agent 工具不可用且无法注入） | 调用方按策略 retry 或 inline |

> **`null` 作为整份返回值不合法。** 必须始终返回上述结构。

## 完整流程

```
[1] 解析入参：platform / agent / task_spec

[2] 判定 agent 是否为 null
    - agent 非 null → 用该 agent 的 id/path/tools，跳 [3]
    - agent 为 null → 读 task_spec.constraints.dispatch_mode_hint：
      - default_subagent → dispatch.status=degraded_default, dispatch_mode=default_subagent → 走 D-2 内容注入型（跳 [4]）
      - inline → dispatch.status=degraded_inline, dispatch_mode=inline → 主代理 inline 执行 task_spec（跳 [5]）
      - 未传 hint → dispatch.status=unsupported, reason="agent=null without dispatch_mode_hint"

[3] read_file ./references/dispatch-execute.md
    - D-0 工具可用性判定（按 agent.tools 判定路径引用型 / 内容注入型）
    - D-1 路径引用型（agent 有 read_file/Read 工具）→ subagent 自读 materials
    - D-2 内容注入型（agent 无读文件工具，或保守策略）→ 主代理先 Read materials 全文拼入 prompt

[4] 构造 prompt + 执行派发
    - 按 task_type 追加任务专属指引（见 dispatch-execute.md）
    - 遵守通用约定（不附用户决策 / 不假设下一步 / 不向用户提问 / 回报契约）
    - 执行派发（宿主原生 Task / AgentTool）
    - 等待 subagent 回报

[5] 填 result（status / output / concerns），返回完整结构
```

## references

| Policy | 路径 | 职责 |
|---|---|---|
| 派发执行 | `./references/dispatch-execute.md` | D-0 工具可用性判定 → D-1 路径引用型 / D-2 内容注入型 + prompt 模板 + task_type 增强 + 通用约定 |
