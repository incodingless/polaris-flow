# 数据模型专项生成策略

> **调用方**：design skill Step 3.2（用户已勾选「数据模型」专项后）。  
> **产物**：`openspec/changes/<change_id>/data-model-design.md`（变更根目录扁平；禁止 `design/` 子目录）。  
> **定位**：仓储持久化单元的**具体存储形状**（表/集合、字段、索引、引用完整性、迁移）。**不写** HTTP 契约、仓储接口、领域行为。

## 核心原则

- **输入真相**：有 `repository-design.md` 时以其 **§7 持久化单元** 为表/集合清单来源；有 `domain-model-design.md` 时以聚合/实体约束字段含义。`detailed-design.md` 提供存储技术与容量假设。**禁止**发明上游没有的业务表
- **结构骨架**：必须 `read_file ./templates/data-model-design-template.md`，按模板章节落盘
- **深化不扩 scope**：不得扩大 propose 已锁定的目标 / Non-goals；缺口标 TBD，留给 Spec Patch
- **实现形状、不是领域重写**：本文件写表/索引/DDL；禁止再定义一套与领域模型矛盾的实体

### 设计约束（必须遵守）

| # | 约束 |
|---|------|
| M1 | **命名统一**：同一文档内表名、字段风格一致；无约定则表名**复数**、字段 `snake_case` |
| M2 | **一表一章**：ER / 映射表出现的每个存储单元必须有结构章；禁止只画 ER 不写字段 |
| M3 | **主键与时间戳**：每表必有主键。业务表必有创建时间、更新时间。类型与字段名遵循 detailed-design / 项目约定；无约定则 `id` + `created_at` + `updated_at`。禁止默认抄 `BIGINT AUTO_INCREMENT` 覆盖已定的 UUID/雪花策略 |
| M4 | **索引有场景**：每个索引必须对应热点查询或唯一约束；禁止无场景的宽复合索引 |
| M5 | **对齐仓储/聚合**：有 repository 时，写模型表必须能映射到其持久化单元；子实体表挂在聚合根表下，禁止给非聚合根单独建写模型主表 |
| M6 | **技术表显式**：outbox、幂等键、审计等非领域表必须标明「技术表」及用途，不得伪装成业务实体 |
| M7 | **引用策略写清**：外键表必须有删除/更新策略；**物理 FK** 与 **应用层逻辑引用** 必须区分，不得只写 CASCADE 假装已论证 |

存储技术以 `detailed-design.md` 为准。未定则文首声明假设（默认关系库），不得用 MySQL 类型描述文档库，也不得用集合名冒充表结构。

---

## 1. 执行前必读

| 优先级 | 路径 | 要求 |
|--------|------|------|
| 1 | `openspec/changes/<change_id>/detailed-design.md` | **必读全文**；存储技术、容量、迁移动机。缺失 → **阻断**，回 skill Step 3.1 |
| 2 | `./templates/data-model-design-template.md` | **必读** |
| 3 | `openspec/changes/<change_id>/repository-design.md` | 若有则必读；§7 持久化单元 = 本专项表/集合清单 |
| 4 | `openspec/changes/<change_id>/domain-model-design.md` | 若有则必读；字段含义与不变式 |
| 5 | `proposal.md` / `design.md` / `specs/*/spec.md` | 边界与 Non-goals |
| 6 | 已有 `data-model-design.md` | 若有；修订而非静默重写无关节 |

无 repository / domain-model **不阻断**（本专项可独立勾选）；有则必须对齐，不得另起一套表名与聚合无关。

---

## 2. 生成步骤

1. 从 `detailed-design.md` 确认存储技术、是否有旧表、容量假设
2. 列存储单元：优先 `repository-design.md` §7；否则从 domain-model 聚合展开（一根表 + 子实体表；值对象默认内嵌列，拆表须写理由）；再否则从 detailed-design 已点名的表
3. 填「表 ↔ 聚合/仓储」映射表；技术表单独标出
4. 画 Mermaid `erDiagram`（含 1:1 / 1:n / n:n；n:n 必须画出中间表）
5. 按模板逐表填写结构、索引、容量；再写引用完整性与迁移
6. 输出：`[polaris-flow] design: wrote openspec/changes/<change_id>/data-model-design.md`

### 2.1 溯源与禁止

| 允许 | 禁止 |
|------|------|
| 将仓储持久化单元 / 领域属性展开为列、类型、索引 | 发明 repository / domain-model / detailed-design 未出现的业务表或业务字段 |
| 为联调与实施补全类型、默认值、约束（须能回溯依据） | 为「看起来完整」给每个实体自动生成一套无查询依据的索引 |
| 标注容量/旧表不明处为 TBD 或「假设」 | 用范例 `users` / `orders` 顶替本变更真实表名 |
| 绿场无旧表时迁移说明写「无历史数据，仅建表」 | HTTP 契约、仓储方法签名、ORM 注解当作设计正文 |
| 文档库/KV：用集合/键空间替换「表」，文首声明 | 未声明技术却混用多种存储方言 |

---

## 3. 章节与模板对齐

输出必须覆盖模板全部一级/二级节（可按预检「范围外」裁剪，裁剪时文首注明）。默认期望：

| 模板节 | 内容要点 |
|--------|----------|
| §0 范围 | 预检范围内 / 范围外（有则必写） |
| §1 存储约定与映射 | 技术、命名、主键策略、时间戳；**表 ↔ 聚合根/仓储** 映射表 |
| §2 ER 关系图 | Mermaid `erDiagram`；关系类型齐全 |
| §3 表结构 | 每表一章，章名 `{序号} {表名}` |
| §4 引用完整性 | 从表、外键字段、主表、主键、删除策略、更新策略、物理/逻辑、业务含义 |
| §5 迁移 | 建表 DDL、回滚 DDL、旧表→新表映射（无旧表则明示） |

### 3.1 每个表章必须包含

| 子节 | 要求 |
|------|------|
| 业务说明 | 存什么、服务哪条业务流程、对应哪个聚合/仓储（或「技术表」） |
| 表结构定义 | 列齐全：字段名、类型、是否必填、默认值、业务含义、约束/校验。主键与时间戳按 M3 |
| 索引设计 | 列：索引名、类型（普通/唯一/联合）、字段、业务场景 |
| 数据量与性能 | 日增量、总量、查询频率、热点条件。有依据写数字；无依据写量级并标「假设」，禁止假精确 |

### 3.2 格式强制

- 标准 Markdown：`#` / `##` 层级清晰
- 清单、字段、索引、外键、映射 → **表格**
- ER 必须是可渲染的 Mermaid `erDiagram`，禁止 ASCII 盒图代替
- DDL 必须是完整可执行语句（或当前存储技术等价物），禁止 `...` 省略关键列
- 语言：中文、简洁、可评审
- **禁止** Controller / API 示例；**允许**本专项内的 DDL（这是形状本身）

---

## 4. 完成后

- 本 policy **不**单独派发审查 subagent（忽略任何「openspec-reviewer / 分批冻结 / design-data-model.md」旧指令）；专项与 `detailed-design.md` 一并进入 skill **Step 4**（`design-review-agent` / Outside Voice）
- 文首可列预检范围内外
- 修订时：先读现有 `data-model-design.md` + 最新 `detailed-design.md`（及 `repository-design.md` / `domain-model-design.md` 若有），再局部更新
