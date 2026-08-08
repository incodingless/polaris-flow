# Phase 0 — 上下文调研

**不可跳过。** simple 任务同样必须完成本 Phase。

## 调研范围

按相关性全部尝试：

1. **用户资料** — 想法、链接、文档、截图描述
2. **代码库** — 相关模块、patterns、集成点、隐藏复杂度（SemanticSearch / Grep / Read）
3. **项目文档** — specs、README、agent-guide
4. **OpenSpec** — `openspec list --json`；若无 CLI，Read `openspec/`、`openspec/changes/<name>/`、关联 `specs/`

## 输出（写入管道草稿）

### context-brief

3–5 句「基于调研，我理解你在想什么」。

### fuzzy-points

每条模糊点标注来源：

- 用户表述模糊
- 代码与意图矛盾
- 文档缺失
- OpenSpec 未覆盖

无模糊点时写：`（无）`

### clear-items

已清晰、无需发散的条目列表。

## 纪律

- 能查代码/文档自行回答的，**先查再问用户**
- 未完成三项输出，不得进入 Phase 0b
- 若发现多独立子系统且单 change 无法覆盖，在 fuzzy-points 标注并在 Phase 0b 倾向 `needs_split`
