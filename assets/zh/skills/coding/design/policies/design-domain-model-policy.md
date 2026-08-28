# 领域模型专项生成策略

> **调用方**：design skill Step 3.2（用户已勾选「领域 / 领域模型」专项后）。  
> **产物**：`openspec/changes/<change_id>/domain-model-design.md`（变更根目录扁平；禁止 `design/` 子目录）。

## 核心原则

- **输入真相**：以已落盘的 `detailed-design.md` 为主；辅以高层 `design.md`、`proposal.md`、`specs/*/spec.md`、`intention.md`（若有）。**禁止**用 DDD 术语脑补业务对象
- **结构骨架**：必须 `read_file ./templates/domain-model-disign-template.md`，按模板章节落盘；不得另起一套目录结构
- **实践透镜**：生成前 `read_file ./references/ddd-domain-model-practices.md`，用其中检查项做划分与自检；**不得**把参考文当作第二需求源
- **深化不扩 scope**：不得借本专项扩大 propose 已锁定的目标 / Non-goals；缺口只允许标注并留给 Spec Patch
- **纯领域视角**：本文件写限界上下文、实体/值对象/聚合、领域服务与事件、一致性规则；**禁止**堆砌表结构 DDL、HTTP 契约、框架代码（那些归 data-model / restful-api / repository 专项）

---

## 1. 执行前必读

| 优先级 | 路径 | 要求 |
|--------|------|------|
| 1 | `openspec/changes/<change_id>/detailed-design.md` | **必读全文**；本专项是对其领域面的展开 |
| 2 | `./templates/domain-model-disign-template.md` | **必读**；输出结构以此为准 |
| 3 | `./references/ddd-domain-model-practices.md` | **必读**；聚合/实体/值对象划分与自检 |
| 4 | `openspec/changes/<change_id>/design.md`、`proposal.md` | 边界与 Non-goals |
| 5 | `specs/*/spec.md`、`intention.md` | 若有；验收与选型约束 |
| 6 | 已有 `domain-model-design.md` | 若有；修订而非静默重写无关章节 |

`detailed-design.md` 缺失 → **阻断**，回 skill Step 3.1。

---

## 2. 生成步骤

1. 从 `detailed-design.md` 抽取：模块/边界、核心业务对象、状态与规则、跨模块协作、已点名的聚合或实体
2. 对照 `ddd-domain-model-practices.md` 做一次划分草案（聚合根、实体、值对象、领域服务、领域事件）；每项须能回溯到 detailed-design / specs 中的依据句
3. 按模板逐节填写；关系图用 Mermaid `classDiagram`
4. 写清「与仓储设计的映射说明」（模板 §9），供下游 `repository-design` / `data-model-design` 使用——只写映射意图，不写表字段
5. 落盘后输出：`[polaris-flow] design: wrote openspec/changes/<change_id>/domain-model-design.md`

### 2.1 溯源与禁止

| 允许 | 禁止 |
|------|------|
| 对 detailed-design 已有概念做结构化展开、补全关系与规则表述 | 发明 detailed-design / proposal 未出现的业务能力或实体 |
| 将模糊表述收敛为可评审的模型名与边界（须在文内注明依据来源节） | 为「看起来更 DDD」而拆出无业务依据的聚合/事件 |
| 标注「detailed-design 未写清 → TBD，需用户确认或 Spec Patch」 | 用参考文档中的范例域名替换本变更真实域名 |

---

## 3. 章节与模板对齐

输出必须覆盖模板全部一级/二级节（可按范围内外裁剪用户确认的「范围外」节，裁剪时在文首注明）。默认期望：

| 模板节 | 内容要点 |
|--------|----------|
| §1 总览 | 定位、边界（做什么/不做什么） |
| §2 核心结构表 | 模型类型、名称、属性、职责、关联 |
| §3 关系图 | Mermaid classDiagram |
| §4 实体明细 | 标识、属性、状态、规则、行为 |
| §5 值对象 | 组成、不可变约束、归属 |
| §6 领域服务 | 职责、入参出参、依赖 |
| §7 领域事件 | 触发、载荷、下游影响 |
| §8 约束与一致性 | 不变量、跨聚合一致性策略（进程内/最终一致等，点到为止） |
| §9 仓储映射说明 | 聚合 ↔ 预期持久化边界（给 repository/data-model） |

语言：中文、简洁、可评审；列表与关系优先用**表格**。

---

## 4. 完成后

- 本 policy **不**单独派发审查 subagent；专项与 `detailed-design.md` 一并进入 skill **Step 4**（`design-review-agent` / Outside Voice）
- 若用户在预检中界定了「范围外」，落盘文首用短表列出范围内外，避免评审按全模板苛责
- 需要修订时：先读现有 `domain-model-design.md` + 最新 `detailed-design.md`，再局部更新
