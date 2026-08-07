# Agent Directory Probe — 按平台分派的 agent 目录探测

本文件是 `subagent-probe` 的核心能力表。执行扫描前**必须**先读本文件，再按当前 `platform` 行执行；**禁止**跨平台混扫。
本文档定义「某个 platform 去哪里找 agent」；实际编排与退化结论由 `subagent-probe` skill 负责。

> **禁止**对所有平台做全目录混扫。必须先有 `platform`，再只扫该平台策略允许的目录。

## `main_repo_root` 解析

```bash
main_repo_root="$(git rev-parse --show-toplevel)"
```

`--show-toplevel` 始终返回**绝对路径**，在主仓和 worktree 内都可用。在 worktree 内返回 worktree 根（`.<platform>/agents/` 可能不存在——这是预期行为，由 probe 返回 `degradation=empty` 或 cursor builtin 回退）。

> **禁止使用** `dirname "$(git rev-parse --git-common-dir)"`——它在主仓内返回相对路径 `.`，拼接路径依赖 cwd 正确，实测证明不可靠。

## 目录型扫描算法（`scan=directory`）

对策略表给出的每个相对目录（均基于 `main_repo_root`）：

1. 若目录不存在 → 跳过
2. 列出其下所有 `*.md`（含子目录时用递归；同 path 去重）
3. 对每个文件读取前 10 行，寻找 `description:` 行（纯文本，不依赖 YAML 解析器）
4. 同时在前 10 行内寻找 `tools:` 行（agent frontmatter 声明工具清单；以 `tools:` 起始的单行，逗号分隔；不存在则置空数组）
5. 无 `description:` → 跳过
6. 录入 `agents` 条目：
   - `path`：相对 repo 根的正斜杠路径
   - `id`：文件名去掉 `.md`
   - `description`：`description:` 行内容，截断至 120 字符
   - `tools`：`tools:` 行内容按逗号 trim 后得到的数组；无 `tools:` 行 → `[]`
   - `source`: `directory`

> **`tools` 字段语义**：仅反映 agent frontmatter 声明，**不保证宿主实际授予**。调用方据此决定是否走「路径引用型」/「内容注入型」派发分支（见 `degradation.md`）。

## 与 subagent-probe 的关系

| 文档 / skill | 职责 |
|---|---|
| 本文档 | 平台 → 扫描目录与算法说明 |
| `subagent-probe` | 接收 `platform`，查能力表，执行扫描，返回 `agents` + `degradation` |
| 派发点 skill（如 `build`） | 消费 probe 结果后决定派发路径 / 默认 subagent / inline |

完整策略表以 `subagent-probe/policies/platform-scan-strategies.md` 为准；本文档为安装态 adapter 副本，描述「怎么找」。

## 按平台扫描

### 共性（目录型）：

- 始终附带宿主中立目录：`<REPO_ROOT>/.agents/`
- 追加：`<REPO_ROOT>/.<platform>/agents/`（`platform` 与目录名一致时）
- 只收录含 frontmatter `description:` 的 `*.md`
- 同 path 去重；仅项目级（全局 `$HOME/.../agents/` 不扫）

### 平台扫描目录表
| platform | supports_subagent | scan | 扫描目录 / 说明 | 空结果时 |
|---|---|---|---|---|
| `claude` | true | directory | `<main_repo_root>/.agents/` / 全局级 `$HOME/.claude/agents/`不扫 | `degradation=empty` |
| `codebuddy` | true | directory | `<main_repo_root>/.agents/` / 全局级 `$HOME/.codebuddy/agents/` 不扫 | `degradation=empty` |
| `trae` | true | directory | `<main_repo_root>/.agents/` / 全局 `$HOME/.trae/agents/` 不扫 | `degradation=empty` |
| `trae-cn` | true | directory | `<main_repo_root>/.agents/` / 全局 `$HOME/.trae/agents/` 不扫 | `degradation=empty` |
| `cursor` | true | directory+builtin | 先 `<main_repo_root>/.agents/` + `<main_repo_root>/.cursor/agents/`；皆空则为 `builtin` | 目录空且 builtin 已填 → `degradation=null`；若将来 builtin 表被清空则 `empty` |
| `qoder` | false | none | 不扫 | `degradation=inline`，`reason=host_forced_inline` |
| （未登记） | false | none | 不扫 | `degradation=unsupported`，`reason=unknown_platform` |


### Cursor 内置 Task 回退表（`source=builtin`）

仅当 `platform=cursor` 且目录型扫描结果为空时启用。每项：

| id | description | tools |
|---|---|---|
| `generalPurpose` | 通用子代理：复杂检索、多步任务 | （由 Cursor 内置决定，置 `[]`） |
| `explore` | 只读代码库探索 | （同上） |
| `shell` | 命令执行专责 | （同上） |
| `best-of-n-runner` | 隔离 worktree 并行尝试 | （同上） |
| `code-simplifier` | 简化与澄清近期改动代码 | （同上） |

录入时：`path` 省略，`source=builtin`，`id`/`description` 取上表，`tools=[]`（builtin Task 的工具集由宿主决定，扫描层无法预知）。


### Fallback（由调用方消费 degradation）

| probe 结果 | 调用方典型动作 |
|---|---|
| `degradation=null` | 用 `agents` 中的 path 或 builtin id 派发 |
| `degradation=empty` | 宿主默认 subagent（不指定 agent 文件） |
| `degradation=inline` / `unsupported` | 主代理 inline，或不跑依赖独立 context 的功能 |

> 派发驱动器（`superpowers:subagent-driven-development` / `:executing-plans`）受 HARD STOP H13 全局禁止——详见 `hard-stops.md`。

**不再有任何 plugin 内置 fallback agent 文件。**（Cursor builtin 是宿主 Task 类型名，不是 plugin 落盘的 agent 文件。）
