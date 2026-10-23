# Main Review Summary（引导读取）

> 父 skill（tasks）填充后作为 `subagent-dispatch` 的 `task_description`。
> 挑战标准在 `openspec-review-agent` 系统 prompt 内；本模板只承载「引导读取」。
> 材料路径由 `task_spec.materials` 数组承载。**不包含**用户对 findings 的采纳决策。
> 占位符 `{{PLACEHOLDER}}` 由调用方替换。

挑战主审结论（Outside Voice）：找主审漏掉或判错的问题。

Change: {{CHANGE_ID}}
Stage: {{STAGE}}
PrimaryReport: {{PRIMARY_REPORT_PATH}}

## 主审 findings 摘录（便于对照；与主审报告文件冲突时以文件为准）

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
