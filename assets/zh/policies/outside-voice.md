# Outside Voice 协议

由 **propose** / **design** / **plan** 在主审 subagent 报告落盘后执行。挑战主审结论的 subagent 固定为 `openspec-review-agent`。

## 核心定位

- Outside Voice **挑战主审报告 + 提案材料**，不是 code review，也不是重做主审。
- 读代码仅用于验证材料中的引用或「复用现有能力」假设（见 agent 六道防线）。
- **默认询问用户**是否启动；AI 可按复杂度给建议，**不得代决跳过或强制启动**。

## 何时执行本协议

主审已落盘且可读：

| 阶段 | 主审 agent | 主审报告 |
|------|------------|----------|
| propose | `propose-review-agent` | `openspec/changes/<change_id>/reviews/propose-review-report.md` |
| design  | `design-review-agent`  | `openspec/changes/<change_id>/reviews/design-review-report.md` |
| plan    | `plan-review-agent`    | `openspec/changes/<change_id>/reviews/plan-review-report.md` |

然后：`read_file` 本文件（或已安装的 `./reference/outside-voice.md`），按下列步骤。

## Step OV-1：复杂度建议（仅建议）

根据当前 change 材料判断，在决策点中写明建议强度：

| 信号 | 建议文案 |
|------|----------|
| 多模块 / 跨层架构 / 高风险接口 / plan 顶层任务数 ≥5 / design 含多项专项 | 强烈建议（变更范围大、交叉评审有助于发现盲区） |
| 单模块、中等任务量 | 建议（有一定复杂度） |
| 纯配置 / 文档 / 单文件小改 | 可跳过（交叉评审收益有限） |

## Step OV-2：用户决策点

按 `./reference/decision-point.md` 暂停：

```text
主审已完成。是否启动 Outside Voice（openspec-review-agent）独立交叉评审？

建议: <上表文案>

A. 启动交叉评审
B. 跳过
```

- 选 **B** → 在主审报告 Completion / state 标注 `Outside Voice: skipped (user decision)`，进入消化主审结论。
- 选 **A** → 进入 OV-3。
- 用户口头「跳过评审 / skip outside voice」等 → 同 B。

**自动跳过（不必询问）仅当：**

- 宿主 `subagent-probe` 为 `inline` / `unsupported`（无独立 subagent）→ 标注 `Outside Voice: not run (host lacks subagent capability)`，**禁止 inline 假跑**。

## Step OV-3：派发

1. **填充启动模板**：
   - **plan 阶段**：优先 `skills/plan/prompts/main-review-summary.tmpl.md`
   - **propose / design 阶段**：`templates/outside-voice-prompt.tmpl.md`（或同等字段手工 prompt）
2. 按宿主原生机制派发 `openspec-review-agent`（init 已装到 `.<platform>/agents/`）。
3. 启动 prompt **必须**含：`Change`、`Stage`、`PrimaryReport`（主审报告路径）、`Materials` 列表。
4. **禁止**把用户对主审 findings 的采纳/拒绝决策喂给 challenger（保独立性）。

## Step OV-4：落盘与可信度门禁

将 agent 返回全文写入：

`openspec/changes/<change_id>/reviews/openspec-review-report.md`

采纳前检查（任一项失败 → 整份 OV 作废，记录「Outside Voice 输出不符合防线要求，已跳过」）：

1. 含 `CODE READING PLAN`（或明确「无代码读取计划」）
2. 含 `CODE READING AUDIT`
3. 每条 finding 有溯源标签；`[verified-by-code]` 含路径；`[verified-by-search]` 含 query
4. 兜底搜索次数 ≤3（能从 AUDIT 判断时）

## 用户主权铁律

- OV findings **不得**自动写回 `detailed-design.md` / `tasks.md` / 主审报告结论。
- 与主审冲突（tension）→ 父 skill 用 decision-point **逐条**展示双方立场，用户明示后才修订产物。
- 跨模型/双审一致 = 强信号，**不是**自动应用许可。

## 消化顺序

1. 先处理主审 STATUS / Verdict（BLOCK / Critical 等）
2. 再处理 OV 中与主审的 tension 及 P0/P1
3. 修订产物后若触及主审范围 → 重跑主审 agent；OV 是否重跑另询用户（默认：主审重跑后再次询问 OV）
