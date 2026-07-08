# 派发点 → 关键词映射规则

## 匹配算法

对每个候选 agent 文件，读取其 frontmatter `description` 字段（纯文本扫描 `description: ` 行，不依赖 YAML 解析器），对下表中当前派发点的关键词列表做**大小写不敏感子串匹配**。

- 命中 ≥1 个关键词 → 归入"推荐"分组
- 都不命中 → 归入"通用"分组
- 命中多个派发点关键词 = 在多个派发点的菜单中都被推荐

## 关键词表

| 派发点 ID | 关键词（`|` 分隔，任一命中即推荐） |
|---|---|
| `design.brainstorm` | brainstorm \| 需求 \| requirement \| discovery \| exploration \| design \| 设计 |
| `lock.plan-review` | review \| 评审 \| engineering \| plan \| spec \| 审查 |
| `build.implementer` | implementer \| apply \| implement \| 实施 |
| `audit.scorer-driver` | audit \| quality \| scorer \| metric \| compliance \| 审计 \| 合规 |

## 维护规则

- 新增派发点时必须在此表新增一行
- 关键词变更需同步更新设计稿 §4
- 关键词应以 agent 社区中常见的 description 用词为依据
