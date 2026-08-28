# 复盘报告

> **使用约定**：本模板由 `{{SKILL_NAME_PREFIX}}retro` skill。 主代理读取本模板后，按节顺序填充；各节内容来源标注见行内注释。

- 范围：<overview|monthly|by-change> <补充：N 次 / YYYY-MM / change_id=…>
- 生成时间：<ISO8601>
- 配置 mode：<solo|team|未配置>
- 数据：metrics=<n> 文件；overrides=<n> 行；解析失败=<n>  [MACHINE_VERIFIED]

## 1. Scorer 趋势 [MACHINE_VERIFIED]

| 时间 | change_id | overall | audit-violation-rate | constitution-violation-count | test-coverage | complexity | doc-sync |
|------|-----------|---------|----------------------|------------------------------|---------------|------------|---------|
| … | … | … | … | … | … | … | … |

（overview：最近 N 行；可另附「按 change_id 桶」均值表）

## 2. Constitution 合规 [MACHINE_VERIFIED]

- 范围内 violations 合计 / checks 合计
- 按 change_id 分布（含「未归因」）

## 3. Override 分析 [MACHINE_VERIFIED]

- 总行数 / 可解析 / 未结构化
- 理由分布与反复项（无则写「无记录」）

## 4. 改进建议 [LLM_SELF_CHECK]

1. …
2. …
3. …（可选）

## 5. 后续

- 继续度量：对进行中 change 跑 `/{{SKILL_NAME_PREFIX}}verify`（worktree 场景需经 `/{{SKILL_NAME_PREFIX}}delivery` 合回）
- 新变更：`/{{SKILL_NAME_PREFIX}}clarify` 或 `/{{SKILL_NAME_PREFIX}}propose`

## 约束速查

| 陈述类型 | 标记 |
|----------|------|
| 从 JSON / log 直接聚合的数字与表格 | `[MACHINE_VERIFIED]` |
| 改进建议与因果解读 | `[LLM_SELF_CHECK]` |

- 度量计算不得「估一个差不多的数」  
- 改进建议不得脱离 Step 2–3 的证据