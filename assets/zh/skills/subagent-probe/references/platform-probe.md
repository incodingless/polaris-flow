# Platform Probe — 按平台分派的 subagent 目录探测

本文件是 `subagent-probe` 的平台能力表。执行扫描前**必须**先读本文件，再按当前 `platform` 行执行；**禁止**跨平台混扫。
本文档定义「某个 platform 去哪里找 subagent」；扫描由 `subagent-probe` skill 执行，选 agent / 派发 / 降级决策由调用方（编排型技能）完成。

> **能力列同源**：下表 `supports_subagent` / 对应的 `platform_degradation` 语义与 `src/core/domain/subagent-capability.ts`（SessionStart 注入 `SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION`）必须保持一致；改一处必须改另一处。

> **禁止**对所有平台做全目录混扫。必须先有 `platform`，再只扫该平台策略允许的目录。

## `main_repo_root` 解析

```bash
main_repo_root="$(git rev-parse --show-toplevel)"
```

`--show-toplevel` 始终返回**绝对路径**，在主仓和 worktree 内都可用。在 worktree 内返回 worktree 根（`.<platform>/agents/` 可能不存在——这是预期行为，此时 agents 为空数组；是否回退 builtin、默认 subagent 或 inline 由调用方决策）。

> **禁止使用** `dirname "$(git rev-parse --git-common-dir)"`——它在主仓内返回相对路径 `.`，拼接路径依赖 cwd 正确，实测证明不可靠。

## 目录型扫描算法（`scan=directory`）

对策略表给出的每个相对目录（均基于 `main_repo_root`）：

1. 若目录不存在 → 跳过
2. 列出其下所有 `*.md`（含子目录时用递归；同 path 去重）
3. 对每个文件读取前 15 行，寻找以下 frontmatter 行：
   - `description:` 行（纯文本，不依赖 YAML 解析器）
   - `tools:` 行（agent 声明的工具清单；以 `tools:` 起始，逗号分隔；不存在则置空数组）
   - `task_types:` 行（agent 声明支持的任务类型清单；以 `task_types:` 起始，逗号分隔；不存在则置空数组，视为通用型）
4. 无 `description:` → 跳过
5. 录入 `agents` 条目：
   - `path`：相对 repo 根的正斜杠路径
   - `id`：文件名去掉 `.md`
   - `description`：`description:` 行内容，截断至 120 字符
   - `tools`：`tools:` 行内容按逗号 trim 后得到的数组；无 `tools:` 行 → `[]`
   - `task_types`：`task_types:` 行内容按逗号 trim 后得到的数组；无 → `[]`（通用型，匹配所有 task_type）
   - `source`: `directory`

> **`tools` 字段语义**：仅反映 agent frontmatter 声明，**不保证宿主实际授予**。调用方据此决定是否走「路径引用型」/「内容注入型」派发分支（见 `dispatch-execute.md`）。
>
> **`task_types` 字段语义**：反映 agent 自述能力。空数组视为「通用型」，可匹配任何任务类型；非空数组视为「专精型」，仅匹配数组中列出的类型。匹配规则见 `task-type-mapping.md`。

## 与 subagent-probe / subagent-dispatch 的关系

| 文档 / skill | 职责 |
|---|---|
| 本文档 | 平台 → 扫描目录与算法说明 |
| `subagent-probe` | 查能力表，执行扫描，返回 agents 清单与命中信息（不做决策） |
| `subagent-dispatch` | 接收调用方选定的 agent 与 task_spec，执行派发（不做探测、不做选 agent 决策） |
| 调用方技能（编排型） | 消费 probe 结果，选 agent、做降级决策，调用 dispatch 派发 |

## 按平台扫描

### 共性（目录型）：

- 始终附带宿主中立目录：`<REPO_ROOT>/.agents/`
- 追加：`<REPO_ROOT>/.<platform>/agents/`（`platform` 与目录名一致时）
- 只收录含 frontmatter `description:` 的 `*.md`
- 同 path 去重；仅项目级（全局 `$HOME/.../agents/` 不扫）

### 平台扫描目录表

| platform | supports_subagent | scan | 扫描目录 / 说明 | 空结果时 |
|---|---|---|---|---|
| `claude` | true | directory | `<main_repo_root>/.agents/` / 全局级 `$HOME/.claude/agents/` 不扫 | agents=[]，决策由调用方 |
| `codebuddy` | true | directory | `<main_repo_root>/.agents/` / 全局级 `$HOME/.codebuddy/agents/` 不扫 | agents=[]，决策由调用方 |
| `cursor` | true | directory+builtin | 先 `<main_repo_root>/.agents/` + `<main_repo_root>/.cursor/agents/`；皆空则为 `builtin` | builtin 已填 → agents=builtin 清单；builtin 表也空 → agents=[] |
| `trae` | true | directory | `<main_repo_root>/.agents/` / 全局 `$HOME/.trae/agents/` 不扫 | agents=[]，决策由调用方 |
| `trae-cn` | true | directory | `<main_repo_root>/.agents/` / 全局 `$HOME/.trae/agents/` 不扫 | agents=[]，决策由调用方 |
| `qoder` | false | none | 不扫 | platform_degradation=inline，reason=host_forced_inline |
| （未登记） | false | none | 不扫 | platform_degradation=unsupported，reason=unknown_platform |

### Cursor 内置 Task 回退表（`source=builtin`）

仅当 `platform=cursor` 且目录型扫描结果为空时启用。每项：

| id | description | tools | task_types |
|---|---|---|---|
| `generalPurpose` | 通用子代理：复杂检索、多步任务 | `[]` | `[]`（通用型） |
| `explore` | 只读代码库探索 | `[]` | `["code_explore", "research"]` |
| `shell` | 命令执行专责 | `[]` | `["command_exec"]` |

录入时：`path` 省略，`source=builtin`，`id`/`description` 取上表，`tools=[]`（builtin Task 的工具集由宿主决定，扫描层无法预知）。

### 通用平台 builtin 回退表

当目录型扫描为空、且平台策略允许 builtin 回退时，可使用以下通用 builtin（仅当平台原生支持默认 subagent 派发时）：

| id | description | tools | task_types |
|---|---|---|---|
| `general-purpose` | 通用子代理：研究、检索、多步任务 | `[]` | `[]`（通用型） |

> builtin 回退仅在平台策略表标注 `builtin` 时启用；不支持 builtin 回退的平台（如 trae/trae-cn）目录空时直接返回 agents=[]（是否派默认 subagent / inline 由调用方决策）。

### Fallback（由调用方消费 probe 结果）

| probe 结果 | 调用方典型动作 |
|---|---|
| platform_degradation=null，agents 非空 | 按 task_type / subagent_id 选定 agent，调用 `subagent-dispatch` 派发 |
| platform_degradation=null，agents=[] | 调用方决策：派默认 subagent（dispatch agent=null + hint=default_subagent）或 inline |
| platform_degradation=inline / unsupported | 主代理 inline 执行，或不跑依赖独立 context 的功能（specialized 模式需询问用户） |
