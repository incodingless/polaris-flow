# Main Review Summary 模板

> 归属：`polaris{{SKN_SPR}}flow{{SKN_SPR}}plan`（`./prompts/main-review-summary.tmpl.md`）。  
> 用于喂给 **`openspec-review-agent`**（Outside Voice）：主审 findings 摘要 + 材料路径，避免重复主审。  
> **默认不包含**用户对 findings 的采纳决策，以最大化 challenger 独立性。
>
> 占位符：`{{PLACEHOLDER}}` 由 plan（或 design）skill 在派发前替换。

---

# 你的本次任务

你是 `openspec-review-agent`（Outside Voice）。主审已完成。请**挑战主审结论**，找主审漏掉或判错的问题（五类盲区 + 六道防线，见系统 prompt）。

```text
Change: {{CHANGE_ID}}
Stage: {{STAGE}}
PrimaryReport: {{PRIMARY_REPORT_PATH}}
```

---

## 提案材料路径

**调用场景**：{{SCENARIO}}

**评审对象（请全部读完）**：

{{PROPOSAL_MATERIALS_LIST}}

---

## 主审报告

请**全文阅读** `{{PRIMARY_REPORT_PATH}}`。以下为便于对照的 findings 摘录（与文件冲突时以文件为准）：

### 范围 / 架构

{{ARCHITECTURE_FINDINGS}}

### 代码质量（计划组织）

{{CODE_QUALITY_FINDINGS}}

### 测试

{{TEST_REVIEW_FINDINGS}}

### 性能

{{PERFORMANCE_FINDINGS}}

### Step 0 范围结论

{{SCOPE_DECISION}}

---

## 工作步骤

1. 按系统 prompt「执行流程」执行
2. 先读主审报告，再读 Materials
3. 输出必须含 `CODE READING PLAN` 与 `CODE READING AUDIT`
4. 无新增 P0/P1/P2 时写 `NO-FINDINGS DECLARATION`，禁止凑数

## 边界

- 不要重复主审已覆盖且无新证据的问题
- 不要做 code review / 不要改任何文件
- 不要向用户提问

开始评审。
