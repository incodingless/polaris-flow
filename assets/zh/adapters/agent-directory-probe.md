# Agent Directory Probe — 按平台分派的 agent 目录探测

本文档定义「某个 platform 去哪里找 agent」；实际编排与退化结论由 `subagent-probe` skill 负责。

> **禁止**对所有平台做全目录混扫。必须先有 `platform`，再只扫该平台策略允许的目录。

## `main_repo_root` 解析

```bash
main_repo_root="$(git rev-parse --show-toplevel)"
```

`--show-toplevel` 始终返回**绝对路径**，在主仓和 worktree 内都可用。在 worktree 内返回 worktree 根（`.<platform>/agents/` 可能不存在——这是预期行为，由 probe 返回 `degradation=empty` 或 cursor builtin 回退）。

> **禁止使用** `dirname "$(git rev-parse --git-common-dir)"`——它在主仓内返回相对路径 `.`，拼接路径依赖 cwd 正确，实测证明不可靠。

## 与 subagent-probe 的关系

| 文档 / skill | 职责 |
|---|---|
| 本文档 | 平台 → 扫描目录与算法说明 |
| `subagent-probe` | 接收 `platform`，查能力表，执行扫描，返回 `agents` + `degradation` |
| 派发点 skill（如 `build`） | 消费 probe 结果后决定派发路径 / 默认 subagent / inline |

完整策略表以 `subagent-probe/policies/platform-scan-strategies.md` 为准；本文档为安装态 adapter 副本，描述「怎么找」。

## 按平台扫描

共性（目录型）：

- 始终附带宿主中立目录：`<main_repo_root>/.agents/`
- 追加：`<main_repo_root>/.<platform>/agents/`（`platform` 与目录名一致时）
- 只收录含 frontmatter `description:` 的 `*.md`
- 同 path 去重；仅项目级（全局 `$HOME/.../agents/` 不扫）

### Claude Code（`platform=claude`）

```
<main_repo_root>/.agents/
<main_repo_root>/.claude/agents/
```

全局级 `$HOME/.claude/agents/` 仅作宿主文档参考，**不在** probe 扫描范围。

### CodeBuddy（`platform=codebuddy`）

```
<main_repo_root>/.agents/
<main_repo_root>/.codebuddy/agents/
```

全局级 `$HOME/.codebuddy/agents/` 不扫。

### Trae（`platform=trae`）

```
<main_repo_root>/.agents/
<main_repo_root>/.trae/agents/
```

session-start 可能向 `.trae/agents/` 注入 `propose-review-agent` / `design-review-agent` / `plan-review-agent` / `openspec-review-agent` 的 model；probe 按普通目录型文件收录（需有 `description:`）。

### Cursor（`platform=cursor`）

```
<main_repo_root>/.agents/
<main_repo_root>/.cursor/agents/
```

若上述目录扫描结果为空：回退到 Cursor 宿主内置 Task `subagent_type` 清单（见 `subagent-probe/policies/platform-scan-strategies.md`），`source=builtin`。

### Qoder（`platform=qoder`）

不支持 subagent 目录探测；`subagent-probe` 直接 `degradation=inline`，不扫盘。

### 未登记平台

不扫；`degradation=unsupported`。

## Fallback（由调用方消费 degradation）

| probe 结果 | 调用方典型动作 |
|---|---|
| `degradation=null` | 用 `agents` 中的 path 或 builtin id 派发 |
| `degradation=empty` | 宿主默认 subagent（不指定 agent 文件） |
| `degradation=inline` / `unsupported` | 主代理 inline，或不跑依赖独立 context 的功能 |

> 派发驱动器（`superpowers:subagent-driven-development` / `:executing-plans`）受 HARD STOP H13 全局禁止——详见 `hard-stops.md`。

**不再有任何 plugin 内置 fallback agent 文件。**（Cursor builtin 是宿主 Task 类型名，不是 plugin 落盘的 agent 文件。）
