# 宿主适配指南（Host Adapters）

本文档说明如何在不同宿主中启动 `cross-review-agent` subagent。Outside Voice 节启动 challenger 前**必读**本文档对应宿主章节。

> **重要**：本 skill 要求宿主**支持 subagent 派发能力**。不支持 subagent 的宿主**直接跳过** Outside Voice 节并在报告中标注"未跑交叉评审（host lacks subagent capability）"——**不再支持 inline 降级**（同 context 注入 challenger prompt 的独立性已被实证不可靠，效果优先原则下宁可不跑也不假跑）。

## 通用约定

无论宿主是什么，启动 challenger 时主 skill 必须完成 3 件事：

1. **决定模型名**：从 `config.yaml: challenger.model` 读取。留空 = 用宿主默认模型。
2. **准备 prompt 上下文**：用 `../prompts/main-review-summary.tmpl.md` 填充主评审摘要；subagent 使用 `/cross-review-agent.md`。
3. **校验输出**：subagent 完成后，按 SKILL.md「Finding 可信度门禁」检查 `CODE READING PLAN` / `CODE READING AUDIT` / 溯源标签等结构性要求。

### 启动方式

```text
task(
  subagent_name="cross-review-agent",
  subagent_path="<skill 根目录>/agents/cross-review-agent.md",
  description="独立交叉评审提案材料",
  prompt="<填充 prompts/main-review-summary.tmpl.md 后的内容>",
  mode="<config.yaml: challenger.model 的值>"  # 若该值非空
)
```

### 关键点

- 若 `config.challenger.model` 留空，省略 `mode` 参数，CodeBuddy 用宿主默认模型
- subagent 完成后通过返回的 final message 拿到评审 markdown

### 启动方式

```text
Task(
  subagent_type="cross-review-agent",   # session-start 已复制到 .claude/agents/，按注册名派发
  description="独立交叉评审提案材料",
  prompt="<填充 prompts/main-review-summary.tmpl.md 后的内容>"
)
```

### 模型

模型由 `cross-review-agent.md` frontmatter 的 `model:` 字段决定：session-start 复制时按 `config.yaml: challenger.model` 注入，留空注入 `inherit`（复用主对话模型）。`inherit` 下跨模型独立性受限——如需跨厂商独立性，在 config 显式指定其它模型，或用 Codex / Gemini CLI 手动另跑一次。

## 其他兼容宿主（通用模式）

若宿主支持"开一个子 context + 传 prompt + 等返回 markdown"的能力（无论 API 名字是 task / agent / spawn / subprocess），按以下步骤：

1. 把 `../agents/cross-review-agent.md` 的 body 部分读出来作为 system prompt
2. 把填充后的 `../prompts/main-review-summary.tmpl.md` 作为 user prompt
3. 若宿主 API 支持 model 参数，传 `config.challenger.model` 的值
4. 等待子 context 完成，拿到 markdown 输出
5. 按 SKILL.md「Finding 可信度门禁」校验输出

## 不支持 subagent 的宿主：跳过 Outside Voice

若宿主**完全不支持** subagent / 子任务机制（如纯对话场景，没有任何派发 API）：

1. **直接跳过** Outside Voice 节
2. 在 review-report.md 的 Completion Summary 中**显式标注**：`Outside Voice: not run (host lacks subagent capability)`
3. 不询问用户、不重试、不降级到 inline——这是设计选择，不是 bug

## 失败处理

无论哪种宿主，subagent 启动失败按以下路径处理：

| 失败类型 | 行动 |
|---------|------|
| subagent 不存在（agent 文件读不到） | 报告"agent 文件丢失"，让用户检查 skill 安装；不降级，因为这是 skill 自身问题 |
| 模型不可用（config 指定的 model 宿主不支持） | 询问用户：换模型 / 用宿主默认 / 跳过 challenger |
| subagent 输出畸形（缺 CODE READING PLAN / AUDIT） | 按"Finding 可信度门禁"规则，整份 challenger 输出作废；报告中记录"已跳过" |
| subagent 超时（宿主有时限） | 询问用户：重试 / 跳过 |

任何失败/跳过都**显式记录在 review-report.md 的 Completion Summary 中**，让用户清楚知道：是否真的跑了 Outside Voice，跑的是什么模型，质量如何。
