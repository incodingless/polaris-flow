# 同行交叉评审(Outside Voice) 启动 prompt（引导读取）

> 父 skill 填充后作为 `subagent-dispatch` 的 `task_description`。
> 挑战标准（五类盲区 / 六道防线 / 输出格式）在 `openspec-review-agent` 系统 prompt 内；本模板只承载「引导读取」。
> 材料路径由 `task_spec.materials` 数组承载（不写在本模板）。**不包含**用户对主审 findings 的采纳决策。
> 占位符 `{{PLACEHOLDER}}` 由调用方替换。

同行交叉结论：找主审漏掉或判错的问题。

Change: {{CHANGE_ID}}
Stage: {{STAGE}}
PrimaryReport: {{PRIMARY_REPORT_PATH}}

## 主审发现摘录（便于对照；与主审报告文件冲突时以文件为准）

{{PRIMARY_FINDINGS_SUMMARY}}
