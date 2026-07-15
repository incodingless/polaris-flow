# 平台扫描策略

本文件是 `subagent-probe` 的核心能力表。执行扫描前**必须**先读本文件，再按当前 `platform` 行执行；**禁止**跨平台混扫。

## `main_repo_root` 解析（所有目录型策略共用）

```bash
main_repo_root="$(git rev-parse --show-toplevel)"
```

- 始终使用绝对路径。
- **禁止**使用 `dirname "$(git rev-parse --git-common-dir)"`。
- 只扫**项目级**目录；`$HOME/.<platform>/agents/` 等全局目录不在范围内。

## 目录型扫描算法（`scan=directory`）

对策略表给出的每个相对目录（均基于 `main_repo_root`）：

1. 若目录不存在 → 跳过
2. 列出其下所有 `*.md`（含子目录时用递归；同 path 去重）
3. 对每个文件读取前 5 行，寻找 `description:` 行（纯文本，不依赖 YAML 解析器）
4. 无 `description:` → 跳过
5. 录入 `agents` 条目：
   - `path`：相对 repo 根的正斜杠路径
   - `id`：文件名去掉 `.md`
   - `description`：`description:` 行内容，截断至 120 字符
   - `source`: `directory`

## Cursor 内置 Task 回退表（`source=builtin`）

仅当 `platform=cursor` 且目录型扫描结果为空时启用。每项：

| id | description |
|---|---|
| `generalPurpose` | 通用子代理：复杂检索、多步任务 |
| `explore` | 只读代码库探索 |
| `shell` | 命令执行专责 |
| `best-of-n-runner` | 隔离 worktree 并行尝试 |
| `code-simplifier` | 简化与澄清近期改动代码 |

录入时：`path` 省略，`source=builtin`，`id`/`description` 取上表。

## 策略表

| platform | supports_subagent | scan | 扫描目录 / 说明 | 空结果时 |
|---|---|---|---|---|
| `claude` | true | directory | `.agents/` + `.claude/agents/` | `degradation=empty` |
| `codebuddy` | true | directory | `.agents/` + `.codebuddy/agents/` | `degradation=empty` |
| `trae` | true | directory | `.agents/` + `.trae/agents/` | `degradation=empty` |
| `cursor` | true | directory+builtin | 先 `.agents/` + `.cursor/agents/`；皆空则用上表 builtin | 目录空且 builtin 已填 → `degradation=null`；若将来 builtin 表被清空则 `empty` |
| `qoder` | false | none | 不扫 | `degradation=inline`，`reason=host_forced_inline` |
| （未登记） | false | none | 不扫 | `degradation=unsupported`，`reason=unknown_platform` |

## 维护规则

- 新增平台必须在本表新增一行，并同步更新 `adapters/agent-directory-probe.md` 对应章节
- 改目录约定时不得 silently 回退到「全平台混扫」
- Cursor builtin 清单变更时同步改本文件「内置 Task 回退表」
