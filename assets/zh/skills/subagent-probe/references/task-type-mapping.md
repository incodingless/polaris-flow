# Task Type Mapping — 任务类型定义与 agent 能力推断

本文件定义 `subagent-probe` 支持的任务类型清单，以及如何从 agent frontmatter 推断其能力，用于 `matched_agents` 预筛。

## 任务类型清单

| task_type | 说明 | 典型场景 |
|---|---|---|
| `code_writing` | 代码编写与实现 | 实现功能、编写函数、重构代码、编写测试 |
| `code_review` | 代码评审 | 审查 diff、检查 spec 合规性、检查代码质量 |
| `code_explore` | 代码库探索 | 只读检索、回答代码库问题、查找定义 |
| `doc_writing` | 文档撰写 | 编写 PRD、技术文档、API 文档、用户手册 |
| `doc_review` | 文档评审 | 评审文档完整性、逻辑性、一致性、格式规范 |
| `data_analysis` | 数据分析 | 分析数据、生成图表、统计建模、数据清洗 |
| `research` | 信息研究 | 多步检索、交叉验证、综合摘要 |
| `command_exec` | 命令执行 | 运行构建、测试、部署等命令 |
| `general` | 通用任务 | 不属于上述类型的其它任务 |

> 若调用方传入未定义的类型，按 `general` 处理。

## Agent 能力推断规则

agent 的能力从 frontmatter 的 `task_types:` 字段推断：

### 1. `task_types` 为空数组 `[]` → 通用型

agent 可匹配**任何** task_type。通常这类 agent 是通用 subagent（如 `general-purpose`）。

### 2. `task_types` 非空数组 → 专精型

agent 仅匹配数组中列出的 task_type。例如 `task_types: ["doc_review", "code_review"]` 表示该 agent 专精于评审类任务。

### 3. 无 `task_types` frontmatter 行 → 通用型

若 agent frontmatter 未声明 `task_types:`，视为通用型（等同空数组）。

## matched_agents 预筛算法

给定 `task_type = T` 和 agents 列表（probe 扫描结果）：

```
[1] 专精匹配：筛选 task_types 含 T 的 agents → 专精候选集
[2] 通用型匹配：筛选 task_types 为空（通用型）的 agents → 通用候选集
[3] matched_agents = 专精候选集 + 通用候选集（专精在前，通用在后）
[4] 若均为空 → matched_agents = []
```

> **预筛不做最终选择**——matched_agents 是"建议候选"，调用方从中选取（或不用，自己选）。多候选时的排序仅按专精优先 + 通用次之，不做更细的排序（那是调用方的事）。

## subagent_id 与 matched_agents 的关系

- `subagent_id` 传入且命中 → 该 agent 在 `agents` 中标 `selected: true`，`subagent_id_found=true`
- `subagent_id` 命中**不影响** `matched_agents` 的计算——matched_agents 仍按 task_type 预筛所有 agents
- 调用方可以同时看 `subagent_id_found` 和 `matched_agents`：前者回答"专用 agent 在不在"，后者回答"按能力筛有哪些候选"

## 任务类型 → 所需工具推断

帮助调用方和 subagent-dispatch 判断任务所需的能力：

| task_type | 所需工具（至少其一） | 说明 |
|---|---|---|
| `code_writing` | `read_file`, `write_file`, `edit` | 需读写代码文件 |
| `code_review` | `read_file` | 只读审查 |
| `code_explore` | `read_file`, `execute_command` | 只读探索，可能需跑命令（如 grep） |
| `doc_writing` | `read_file`, `write_file` | 需读写文档 |
| `doc_review` | `read_file` | 只读评审 |
| `data_analysis` | `read_file`, `execute_command`, `write_file` | 需读数据、跑分析、写结果 |
| `research` | `web_search`, `web_fetch`, `read_file` | 需联网检索 |
| `command_exec` | `execute_command` | 需执行命令 |
| `general` | 无特定要求 | 依 task_description 判断 |

> 此表供调用方在选定 agent 后传给 `subagent-dispatch` 时参考，也供 `subagent-dispatch` 的 D-0 工具可用性判定使用。**不保证宿主实际授予**——仅反映 frontmatter 声明。
