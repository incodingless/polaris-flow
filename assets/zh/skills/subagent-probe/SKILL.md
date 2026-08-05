---
name: subagent-probe
description: 在 subagent 派发前必须调用。接收 platform，按该平台专属扫描策略返回可用 subagent 列表与退化结论。凡派发点 skill 需要发现或选定宿主 subagent 时使用本 skill，替代已退役的 agent-selector。
---

# subagent-probe

## 调用方契约（必经之路）

**任何派发点 skill 在做 subagent 派发动作之前，必须先 `use_skill("polaris-flow:subagent-probe")` 并传入 `platform`，等待返回。**

"派发动作"包括但不限于：

- 通过宿主原生 Task / AgentTool 直接派发 subagent
- 任何"让另一个 LLM context 接手某项工作"的动作

> **全局禁令(HARD STOP H13)**:任何 skill **禁止**调用 `superpowers:subagent-driven-development` 与 `superpowers:executing-plans` 这两个派发驱动器。所有 subagent 派发统一由主代理使用宿主原生 Task / AgentTool 完成；本 skill 只返回「该平台有哪些可用 subagent / 是否应退化」，不派发。
>
> 注:`superpowers:brainstorming`、`superpowers:test-driven-development` 等被动方法论 skill **不在禁令范围**——它们不派发 subagent,只是给主代理或 subagent 提供检查清单与思路,可继续使用。

**禁止**主代理跳过本步直接假设「宿主一定有某 agent / 一定支持 subagent」。

### 跳过自检（违规即停）

派发点 skill 中若即将做派发动作而本 skill 尚未被调用，**必须**立即停止并输出：

> "[polaris-flow] 阻断：派发前必须先调用 polaris-flow:subagent-probe（platform=<id>），不得跳过 Subagent Probe。"

然后回到本 skill 重新走完，再继续派发。

## 输入

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `platform` | string | 是 | 宿主平台 id（如 `claude` / `cursor` / `codebuddy` / `trae` / `qoder`）。调用方宜从 `.polaris/config.yaml` 的 `platform` 字段读取后传入 |

**平台补齐**：若调用方未传 `platform`，按未登记平台退化（见输出）。

## 输出

必须返回以下结构化结果（字段齐全；`agents` 可以为空数组）：

```text
platform: <$PLATFORM_ID 或 "">
supports_subagent: true|false
agents:
  - id: <可选，builtin 时为 subagent_type；目录型可为文件名 stem>
    path: <可选，相对 repo 根的 .md 路径；builtin 可省略>
    description: <摘要>
    source: directory | builtin
degradation: null | "inline" | "unsupported" | "empty"
reason: <短说明>
```

| `degradation` | 含义 | 调用方应执行 |
|---|---|---|
| `null` | 有可用候选 | 从 `agents` 选取后派发（路径型用 `path`；builtin 用 `id` 作为 `subagent_type`） |
| `"empty"` | 宿主有能力但扫不到候选 | 可退到宿主**默认** subagent（不指定 agent 文件），或按调用方策略改为 inline |
| `"inline"` | 能力表要求强制内联 | 主代理在自己会话内执行，不派发 |
| `"unsupported"` | 未登记或明确无能力 | 禁止按项目 agent 路径派发；通常按调用方策略 skip 或 inline |

> **`null` 作为整份返回值不合法。** 必须始终返回上述结构。

消费细则：先 `read_file ./policies/degradation.md`。

## 完整流程

```
[1] 解析 platform（入参优先；否则读 .polaris/config.yaml；仍空 → 跳 [5] unsupported）

[2] read_file ./policies/platform-scan-strategies.md
    - 未登记 → supports_subagent=false, degradation=unsupported, agents=[]
    - 已登记且 supports_subagent=false → degradation=inline, agents=[]
    - 已登记且 supports_subagent=true → 继续 [3]

[3] 按该 platform 专属策略扫描（不得套用其它平台目录）
    - 目录型：见策略表 + adapters/agent-directory-probe.md
    - cursor 额外：目录空时回退 builtin Task 清单（策略表内写死）

[4] agents 非空 → degradation=null, reason=ok
    agents 为空 → degradation=empty, reason=empty_scan

[5] 返回完整结构；不弹菜单、不写缓存、不做关键词推荐
```

## Policies

| Policy | 路径 | 职责 |
|---|---|---|
| 平台扫描策略 | `./policies/platform-scan-strategies.md` | platform → 能力 + 扫描方式 |
| 退化消费 | `./policies/degradation.md` | 调用方如何消费 degradation |

扫描目录细节另见 `read_file` 仓库内 `adapters/agent-directory-probe.md`（与本 skill 同插件包安装后的相对路径，以插件根下 `adapters/` 为准）。
