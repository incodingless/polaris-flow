# Outside Voice 启动 prompt 模板

> 父 skill（design / plan）在派发 `openspec-review-agent` 前，用本模板填充后作为 subagent 的 user prompt。
> **默认不包含**用户对主审 findings 的采纳决策，以最大化 Outside Voice 独立性。
>
> 占位符：`{{PLACEHOLDER}}` 由调用方替换。

---

# 你的本次任务

你是 `openspec-review-agent`（Outside Voice）。主审已完成。请**挑战主审结论**，找主审漏掉或判错的问题（五类盲区 + 六道防线，见你的系统 prompt）。

```text
Change: {{CHANGE_ID}}
Stage: {{STAGE}}
PrimaryReport: {{PRIMARY_REPORT_PATH}}
Materials:
{{MATERIALS_LIST}}
```

## 主审报告

请**全文阅读** `{{PRIMARY_REPORT_PATH}}`。以下为便于对照的 findings 摘录（若与文件不一致，以文件为准）：

{{PRIMARY_FINDINGS_SUMMARY}}

## 工作步骤

1. 按系统 prompt「执行流程」执行
2. 先读主审报告，再读 Materials 全部路径
3. 输出必须含 `CODE READING PLAN` 与 `CODE READING AUDIT`
4. 无新增 P0/P1/P2 时写 `NO-FINDINGS DECLARATION`，禁止凑数

## 边界

- 不要重复主审已覆盖且无新证据的问题
- 不要做 code review / 不要改任何文件
- 不要向用户提问

开始评审。
