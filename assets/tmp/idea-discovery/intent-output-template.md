# intent.md 产出模板

路径：`openspec/changes/<change-name>/intent.md`

对齐 polaris reviewer：design commitments 覆盖、trade-offs、逻辑一致、无重大遗漏。

---

## 标准模板（standard / complex）

```markdown
# {change-name} - 探索与方案结论

<!--
Raw capture of idea-discovery output.
历史 artifact 名 brainstorm.md；内容为收敛后的意图与方案结论，非发散记录。
-->

## 背景与意图摘要

<!-- Phase 0 + 0b + 澄清浓缩 -->

## 复杂度与路径

- 级别：
- 依据：
- 计划路径：
- 预计澄清：

## 上下文调研摘要

<!-- 关键代码/文档/OpenSpec 发现 -->

## 模糊点澄清记录

<!-- Phase 1：每点的问题、选项、结论、放弃理由；无则写（无） -->

## 决策链路 Q1–Qn

<!-- Phase 2–3：问答 + 推荐答案 -->

## 方案对比与选定方案

<!-- Phase 4：权衡表 + 选定 -->

## 意图概要

<!-- Phase 5 用户已批准内容 -->

## 开放问题

<!-- OPEN 项；无则写（无） -->

## 风险与假设

<!-- Phase 1/3 汇总 -->
```

---

## 短模板（simple）

```markdown
# {change-name} - 探索与方案结论

## 背景与意图摘要

## 复杂度与路径

- 级别：simple
- 依据：
- 计划路径：快速

## 上下文调研摘要

## 选定方案与理由

<!-- Phase 4 唯一方案 -->

## 意图概要

<!-- Phase 5 一段概要 -->

## 风险与假设

<!-- 若有；无则（无） -->
```

---

## Reviewer 对齐检查

生成后自检：

- [ ] 意图摘要可独立理解「要做什么、不做什么」
- [ ] 方案有明确权衡或 simple 下唯一方案理由充分
- [ ] 意图概要与选定方案一致，无内部矛盾
- [ ] OPEN 项已显式列出，非隐藏遗漏
