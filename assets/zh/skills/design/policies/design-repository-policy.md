# 仓储专项生成策略

> **调用方**：design skill Step 3.2（用户已勾选「仓储服务」专项后）。  
> **产物**：`openspec/changes/<change_id>/repository-design.md`（变更根目录扁平；禁止 `design/` 子目录）。  
> **定位**：基于领域模型的**抽象存储层**设计；为下游 `data-model-design.md` 提供持久化边界依据。**不写**具体库表实现。

## 核心原则

- **输入真相**：以 `domain-model-design.md` 为**唯一领域概念来源**；`detailed-design.md` 仅作补充上下文。**禁止**新增领域概念或仓储职责
- **结构骨架**：必须 `read_file ./templates/repository-design-template.md`
- **实践透镜**：生成前 `read_file ./references/ddd-repository-practices.md`；不得把参考文当作第二需求源
- **抽象与实现分离**：只定义仓储**接口与行为契约**；禁止 SQL、ORM、驱动、框架代码、建表 DDL、索引全文
- **深化不扩 scope**：不得扩大 propose 已锁定的目标 / Non-goals

### 设计约束（必须遵守）

| # | 约束 |
|---|------|
| D1 | 仓储**只**封装**聚合根**的持久化；非聚合根对象经聚合根仓储间接存取，不得为其单独建写模型仓储 |
| D2 | **单一职责**：一个仓储对应一个核心领域聚合根；禁止跨聚合根的「上帝仓储」 |
| D3 | **抽象与实现分离**：只写行为与结构契约，不写具体存储技术 |
| D4 | **对齐业务流程**：核心操作须匹配 `domain-model-design.md` 中的业务场景与领域事件 |

---

## 1. 执行前必读

| 优先级 | 路径 | 要求 |
|--------|------|------|
| 1 | `openspec/changes/<change_id>/domain-model-design.md` | **必读全文**；缺失 → **阻断**，先完成领域模型专项或回预检勾选 |
| 2 | `./templates/repository-design-template.md` | **必读** |
| 3 | `./references/ddd-repository-practices.md` | **必读**；自检 |
| 4 | `openspec/changes/<change_id>/detailed-design.md` | 建议；技术选型与一致性策略补充 |
| 5 | `proposal.md` / `design.md` / `specs` | 边界与 Non-goals |
| 6 | 已有 `repository-design.md` | 若有；修订而非静默重写无关节 |

---

## 2. 生成步骤

1. 从 `domain-model-design.md` 列出全部**聚合根**及关联实体/值对象/领域事件
2. 按 D1–D2 为每个聚合根建立一行仓储（命名：`{AggregateRoot}Repository`，PascalCase，强绑定领域语义）
3. 对照领域行为与事件，填写核心操作与「事件触发后的存储行为」
4. 「关联仓储」仅描述**依赖/校验关系**（如存在性校验），**不**表示一个仓储写入另一聚合
5. 按模板落盘；通过 `ddd-repository-practices.md` §8 自检
6. 输出：`[polaris-flow] design: wrote openspec/changes/<change_id>/repository-design.md`

### 2.1 溯源与禁止

| 允许 | 禁止 |
|------|------|
| 将 domain-model 中已有聚合/事件整理为仓储行为契约 | 发明 domain-model 未出现的聚合、事件或仓储职责 |
| 用表格描述抽象操作（save / findById / findByCondition / delete 等） | `DataRepository`、`CommonRepository` 等无领域语义命名 |
| 为下游 data-model 写「聚合 ↔ 持久化单元」映射意图 | SQL、ORM、伪代码、表字段清单、迁移脚本 |
| 标注 domain-model 未写清处为 TBD | 纯文本罗列关系（必须用表格） |

---

## 3. 仓储结构表（强制核心产出）

模板 **§2** 必须用表格列出全部仓储，列齐全且不可缺：

| 列名 | 要求 |
|------|------|
| 仓储名称 | 领域语义 + PascalCase（如 `UserRepository`、`OrderRepository`） |
| 对应领域聚合根 | 与 `domain-model-design.md` 中聚合根**同名**，必填 |
| 仓储描述 | 核心存储职责，**不超过 200 字** |
| 核心操作 | 抽象操作列表（如 save、findById、findByCondition、delete） |
| 关联仓储 | 依赖/关联的其他仓储；无则 `-`。例：OrderRepository 依赖 UserRepository 做用户存在性校验 |
| 领域事件关联 | 关联 `domain-model-design.md` 中的事件，并写明触发后仓储行为。例：OrderCreatedEvent 触发后执行 save |

其余模板节（概览、接口行为明细、事务、读模型、并发、持久化映射、风险）在用户范围内必须用**表格**填写；裁剪范围外时文首注明。

### 3.1 格式强制

- 标准 Markdown：`#` / `##` 层级清晰
- 凡清单与关系 → **表格**；禁止用纯段落代替关系表
- 语言简洁、业务化，无废话
- **禁止**任何代码、技术栈、实现细节（纯领域侧抽象存储分析）

---

## 4. 对下游的支持目标

本产物须直接支撑后续 `data-model-design.md`：

| 下游用途 | 本文件提供 |
|----------|------------|
| 表结构与聚合根映射 | §7 持久化单元映射 + §2 聚合根列 |
| 库操作边界与权限 | §1 边界 + 一仓储一聚合（D1/D2） |
| 持久化核心操作与业务场景对齐 | §2 核心操作 + §3 方法意图/场景依据 |
| 领域事件触发后的持久化行为 | §2「领域事件关联」列 |

---

## 5. 完成后

- 本 policy **不**单独派发审查 subagent（忽略任何「openspec-reviewer / 分批冻结」旧指令）；专项与 `detailed-design.md` 一并进入 skill **Step 4**（`design-review-agent` / Outside Voice）
- 文首可列预检范围内外
- 修订时：先读现有 `repository-design.md` + 最新 `domain-model-design.md`
