# 退化结论消费约定

由派发点 skill 在收到 `subagent-probe` 返回后执行。本文件不改变 probe 的输出结构，只约束**调用方分支**。

## 决策矩阵

| `degradation` | `supports_subagent` | 调用方动作 |
|---|---|---|
| `null` | `true` | 从 `agents` 选取一项派发。路径型：`subagent_path`/`Task` 指向 `path`。builtin：以 `id` 作为宿主 `subagent_type`。多项时由调用方按场景自定（如取第一项）；**禁止**再调已退役的 agent-selector 弹菜单 |
| `empty` | `true` | 宿主有能力但无候选：派发**默认** subagent（不指定 agent 文件 / 不绑 path）。若调用方策略要求必须有项目 agent，可改为向用户说明后 inline，但不得假装扫到了文件 |
| `inline` | `false` | 主代理在自己会话内执行后续命令，**不派发**任何 subagent |
| `unsupported` | `false` | 与 `inline` 相同的派发禁令；若调用方功能依赖独立 context（如 Outside Voice 交叉评审），应 **skip** 该功能并在报告中标注 `host lacks subagent capability`，而不是假跑 |

## 硬约束

1. `degradation` 非 `null` 时，**禁止**把空的 `agents` 当成「已选定项目 agent 路径」继续派发。
2. `degradation=unsupported` / `inline` 时，**禁止**调用 superpowers 派发驱动器（H13）。
3. probe 本身不写 `.harness/.cache/agent-selection.json`；调用方也**不应**再依赖该缓存作为选型来源。

## build 阶段示例

```text
probe → degradation=null, agents[0].path=...  → Task(subagent_path=agents[0].path)
probe → degradation=null, agents[0].source=builtin → Task(subagent_type=agents[0].id)
probe → degradation=empty                       → Task(默认 subagent, 无 path)
probe → degradation=inline|unsupported          → 主代理 inline 执行 /opsx:apply
```
