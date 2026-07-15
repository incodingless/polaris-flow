# Outside Voice — 独立交叉评审

> 由 `plan-review` SKILL.md 在 Section 1-4 完成后调用。宿主 subagent 能力以 `polaris-flow:subagent-probe` 的 `degradation`/`supports_subagent` 为准；跳过自检、HARD-GATE 锚点保留在 SKILL.md；本文档承载启动方式、输入构造、可信度门禁、用户主权处理等机械执行细节。

## 核心定位

**Outside Voice 评审的对象是"提案材料"，不是代码。**

"提案材料"（Proposal Materials）的定义：

- **easy-flow lock 链场景**：`openspec/changes/<name>/` 下的四件套（`proposal.md` + `design.md` + `specs/` + `tasks.md`）
- **独立调用场景**：用户传入的所有计划文档合集

`cross-review-agent` 的职责是对"提案材料"做独立二次评审，不是 code review。读代码仅用于**验证提案材料中的引用或假设**，不用于评审代码本身。

## 启动方式（宿主中立）

本 skill 不假定具体宿主的 subagent API。启动 challenger 时：

1. 根据当前宿主，按 `../references/host-adapters.md` 中给出的对应一节执行
2. subagent 使用 `cross-review-agent.md`；

**宿主不支持 subagent 时**：直接跳过 Outside Voice 节，在评审报告 Completion Summary 标注 `Outside Voice: not run (host lacks subagent capability)`。**不再支持 inline 降级**——同 context 注入 challenger prompt 的独立性已被实证不可靠，效果优先原则下宁可不跑也不假跑。

## 喂给 challenger 的输入

按 `../prompts/main-review-summary.tmpl.md` 模板填充以下内容（注意：**不要**把用户对每条 finding 的 A/B/C 选择喂给 challenger，理由见 `../prompts/main-review-summary.tmpl.md` 头部注释）：

1. 提案材料路径列表
2. 主评审已发现的 findings 清单（去除用户决策，仅保留发现内容与严重度）
3. challenger 的行为约束（六道防线，全文见 `../agents/cross-review-agent.md`）

如 `config.challenger.share_user_decisions: true`（不推荐），则附带用户决策——但报告中应明确标注"已牺牲 challenger 独立性"。

## 用户主权铁律

**Outside Voice 的发现是仅供参考（informational），即使跨模型共识也不得自动采纳到计划中。**

每条 Outside Voice finding，如果与主评审存在 tension（即两份评审结论冲突），必须：

1. 在报告中标记为 `CROSS-MODEL TENSION`
2. 单独发起一次 `ask_followup_question`，展示两份评审的分别立场
3. 给出推荐（说明哪边更有说服力及理由）
4. **等待用户明示批准后**才更新 review-report 或 tasks.md

即使你和 cross-review-agent 都同意某条修改，**也不得自动应用**。Cross-model agreement 是强信号，不是行动许可。

## Finding 可信度门禁

收到 cross-review-agent 的输出后，在采纳前做以下检查（任何一项失败 → 该 finding 视为作废，不进 review-report）：

1. 输出是否包含 `CODE READING PLAN` 章节？
2. 输出是否包含 `CODE READING AUDIT` 章节？
3. 每条 finding 是否带溯源标签（`[proposal-only]` / `[verified-by-code]` / `[verified-by-search]`）？
4. `[verified-by-code]` 标签的 finding 是否列出了文件路径 + 行号？
5. `[verified-by-search]` 标签的 finding 是否列出了 query/路径 + 命中结果？
6. 兜底搜索次数是否 ≤3？

如 subagent 输出违反上述任何一项，**不要为了"显得完整"而采纳**——直接在主评审报告中记录："Outside Voice 输出不符合防线要求，已跳过。" 并按用户主权铁律告知用户。

## 何时跳过

**Outside Voice 默认询问用户，AI 不得自行判断跳过**。仅以下情况可跳过：

- `config.challenger.enabled: false` 或 `config.challenger.prompt_mode: never`
- 用户在 `ask_followup_question` 中明确选择跳过
- 用户在对话中显式输入"跳过评审" / "skip review" / "快速通过" / "skip outside voice" 等明确跳过指令
- 宿主不支持 subagent（按"启动方式"段处理，自动跳过并标注）

**AI 可建议但不可代决**：若 AI 判断提案规模较小（如单一 bug 修复、单文件改动、单一 API 端点），可在 `ask_followup_question` 的推荐中说明理由并建议跳过，但**必须等待用户明确选择后才能跳过**，禁止 AI 自主裁量直接跳过。
