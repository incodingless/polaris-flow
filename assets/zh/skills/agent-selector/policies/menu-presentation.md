# 菜单展示规范

## 设计原则

selector 的菜单**始终**只暴露三类选项,绝不暴露内部"派发驱动器"的实现细节:

1. **项目级 agents**(扫描 `.agents/` / `.codebuddy/agents/` / `.claude/agents/` 得到的 `.md` 文件) — 由主代理通过宿主原生 Task/AgentTool 直接派发为 subagent。
2. **默认 subagent**(`D`) — 主代理使用宿主原生 subagent 能力派发,不指定 agent 文件,由宿主默认行为接管。
3. **inline 执行**(`I`) — 主代理在自己的会话内直接执行后续命令(如 `/opsx:apply`),不派发任何 subagent。

> **菜单文案约束**:用户可见的菜单选项**禁止出现** "superpowers"、"原生派发"、"驱动" 等暴露内部实现细节的字样。selector 契约只承认上述三类选项(派发驱动器的全局禁令见 hard-stops.md H13)。

## 用户取消的处理

若用户输入了**菜单未列出的字符**或直接取消(空回车 / Esc / "/q"),视同选 `I`(inline 执行) — selector 将返回 `"inline"`。**不询问、不阻断**;并在 cache 中记录 `agent: "inline", remember: false`(单次,不写"不再询问")。

## 菜单结构

### 候选 agent ≥1 时(标准菜单)

```
🔍 检测到项目 agent(派发点:{dispatch_point_id} — {阶段语义中文名})

📌 推荐(description 匹配当前阶段):
  1. {relative_path} — {description 摘要,截断至 60 字符}
  2. {relative_path} — {description 摘要}

📎 通用(未匹配当前阶段关键词,但可用):
  3. {relative_path} — {description 摘要}

───────────────────
  D. 默认 subagent(上下文干净,可选择自定义 agent)
  I. inline 执行(速度快,节约 token)
  R. 选定后本会话此派发点不再询问(配合上面任一选择使用,如 "1R" / "DR" / "IR")
```

排序规则:
- "推荐"组内按路径字母排序
- "通用"组内按路径字母排序
- "推荐"组始终在"通用"组之前

### 候选 agent = 0 时(精简菜单)

> **"候选"= 扫描到的所有含 description 的 .md 文件总数(推荐+通用合计),不是"关键词匹配数"。** 只要有一个 .md 文件被扫描到且含 description,候选就 ≥1,应弹标准菜单(该文件归入"通用"组)。

当扫描结果为空(无论"三个目录都不存在"还是"目录存在但无可用 `.md` / 全部不匹配"),一律弹菜单让用户在 D / I 之间显式选择,**禁止静默走任何分支**:

```
🔍 未匹配到项目 agent(派发点:{dispatch_point_id} — {中文名})
   已扫描:.agents/  .codebuddy/agents/  .claude/agents/

───────────────────
  D. 默认 subagent(上下文干净,可选择自定义 agent)
  I. inline 执行(速度快,节约 token)
  R. 选定后本会话此派发点不再询问(如 "DR" / "IR")
```

> 当三个扫描目录在文件系统上都不存在时,可在菜单上方追加一行说明:`ℹ️ 未发现任何项目 agent 目录(.agents / .codebuddy/agents / .claude/agents 均不存在)。请在 D / I 之间选择。`——但**仍必须弹菜单**,不允许免菜单直接返回 `"inline"`。

## 阶段语义中文名映射

| 派发点 ID | 中文名 |
|---|---|
| `design.brainstorm` | 需求探索 |
| `lock.plan-review` | 工程评审 |
| `build.implementer` | 实施(执行 /opsx:apply) |
| `audit.scorer-driver` | 审计驱动 |

## 跳过文件警告

若扫描中跳过了无 description 的文件,在菜单底部追加:

```
⚠️ 跳过 {N} 个无 description 字段的文件
```

## 选项语义对照(供调用方解读返回值)

| 用户输入 | selector 返回 | 调用方应执行 |
|---|---|---|
| 数字(如 `1`/`2R`) | agent 文件相对路径(string) | 主代理用宿主原生 Task tool,以该路径作为 subagent_path 派发 |
| `D` / `DR` | `"default-subagent"` | 主代理用宿主原生 subagent 能力派发,不指定 agent 文件 |
| `I` / `IR` / 空回车 / 未识别输入 | `"inline"` | 主代理在自己会话内 inline 执行后续命令,不派发 |
