# RESTful API 专项生成策略

> **调用方**：design skill Step 3.2（用户已勾选「Rest API」专项后）。  
> **产物**：`openspec/changes/<change_id>/restful-api-design.md`（变更根目录扁平；禁止 `design/` 子目录）。  
> **定位**：前后端联调用的 **HTTP 契约**。写资源、方法、权限、请求/响应、错误码。**不写** Controller、框架代码、SDK、DDL。

## 核心原则

- **输入真相**：以 `detailed-design.md` 为接口**能力来源**；若已有 `domain-model-design.md`，资源命名与聚合/实体对齐。辅以高层 `design.md`、`proposal.md`、`specs/*/spec.md`。**禁止**发明未出现的业务能力
- **结构骨架**：必须 `read_file ./templates/restful-api-design-template.md`，按模板章节落盘
- **深化不扩 scope**：不得扩大 plan 已锁定的目标 / Non-goals；缺口标 TBD，留给 Spec Patch
- **契约视角**：只写可联调、可评审的 HTTP 契约；禁止堆砌实现、表结构、仓储接口（那些归 data-model / repository）

### 设计约束（必须遵守）

| # | 约束 |
|---|------|
| A1 | **资源导向**：路径用名词、复数；禁止 `/createTask`、`/getUser` 等动词路径。非 CRUD 动作优先子资源或标准方法；确需动作时用 `POST /{resources}/{id}/actions/{action}` 并写明为何不是标准方法 |
| A2 | **HTTP 方法语义**：GET 安全且幂等、禁止带写语义 Body；POST 创建或非幂等动作；PUT 全量更新（幂等）；PATCH 部分更新；DELETE 删除 |
| A3 | **命名统一**：同一文档内路径风格、JSON 字段命名、错误码格式必须一致；优先遵循 detailed-design / 项目已有约定，无约定则路径小写短横线、字段 camelCase |
| A4 | **错误码按模块分段**：接口私有错误码写在该接口异常表；跨接口复用的写文末「公共错误码」。禁止每个接口复制一套 401/500 |
| A5 | **每接口必写权限**：匿名 / 登录 / 角色或 scope；清单表与接口头都要有 |
| A6 | **一接口一章**：总览表每一行必须有对应明细章，禁止只列清单不写契约 |
| A7 | **列表接口必写分页**：过滤、排序、分页（或明确「不分页及理由」） |

---

## 1. 执行前必读

| 优先级 | 路径 | 要求 |
|--------|------|------|
| 1 | `openspec/changes/<change_id>/detailed-design.md` | **必读全文**；接口能力来源。缺失 → **阻断**，回 skill Step 3.1 |
| 2 | `./templates/restful-api-design-template.md` | **必读**；输出结构以此为准 |
| 3 | `openspec/changes/<change_id>/domain-model-design.md` | 若有则必读；资源与聚合/实体同名或写明映射 |
| 4 | `proposal.md` / `design.md` / `specs/*/spec.md` | 边界、Non-goals、验收场景 |
| 5 | 已有 `restful-api-design.md` | 若有；修订而非静默重写无关节 |

无 `domain-model-design.md` **不阻断**（本专项可独立勾选）；有则必须对齐，不得另起一套资源名。

---

## 2. 生成步骤

1. 从 `detailed-design.md` / specs 抽出接口能力，按**业务域**分组；每条须能回溯到依据句
2. 若有 `domain-model-design.md`，将资源对齐聚合/实体；写操作应对齐领域行为，而不是给每个对象自动 CRUD 全套
3. 按 A1–A3 确定路径、HTTP 方法、字段命名
4. 按模板落盘：约定 → 清单总览 → 按域逐接口明细 → 公共错误码
5. 输出：`[polaris-flow] design: wrote openspec/changes/<change_id>/restful-api-design.md`

### 2.1 溯源与禁止

| 允许 | 禁止 |
|------|------|
| 将 detailed-design 已点名的 API / 用例展开为可联调契约 | 发明 proposal / detailed-design / specs 未出现的接口或字段 |
| 为联调补全路径、状态码、校验、错误码（须在文内注明依据节） | 为「看起来 RESTful」给每个实体生成无业务依据的 CRUD |
| 标注未写清处为 TBD，需用户确认或 Spec Patch | Controller / 路由框架代码、OpenAPI 工具链、SDK、SQL |
| 与领域模型的资源映射表（名称对应即可） | 用参考范例里的 `/users`、`/orders` 顶替本变更真实资源 |

---

## 3. 章节与模板对齐

输出必须覆盖模板全部一级/二级节（可按预检「范围外」裁剪，裁剪时文首注明）。默认期望：

| 模板节 | 内容要点 |
|--------|----------|
| §0 范围 | 预检范围内 / 范围外（有则必写） |
| §1 接口约定 | 命名、鉴权模型、统一响应/错误信封、版本与兼容；全篇只写一次 |
| §2 接口清单总览 | **表格**：接口名称、路径、HTTP 方法、权限、业务目的、重要程度、预估 QPS |
| §3 按业务域的接口明细 | 每接口独立成章，章名 `{序号} {接口名称}` |
| §4 公共错误码 | 认证授权 / 资源数据 / 系统服务；列：错误码、HTTP 状态码、业务含义、用户提示 |

### 3.1 每个接口章必须包含

接口头用表格写清：**URL、HTTP 方法、权限、是否幂等、重要程度、预估 QPS**。

其后子节不可缺：

| 子节 | 要求 |
|------|------|
| 业务背景与价值 | 为什么需要、解决什么痛点；禁止空话套模板 |
| 业务规则与前置条件 | 状态、权限、层级、时间窗等可执行规则 |
| 请求参数表 | 列齐全：参数位置（Header/Path/Query/Body）、字段名、必填、类型、示例值、业务含义、校验规则 |
| 请求体示例 | 合法 JSON；字段与参数表一致。无 Body 则写「无」 |
| 成功响应示例 | 合法 JSON；含关键字段（id、status、时间等） |
| 响应字段表 | 列：字段路径、类型、业务含义、是否敏感、注意事项 |
| 异常场景表 | 列：错误码、HTTP 状态码、触发条件、用户友好消息、建议处理动作。只列本接口特有错误 |
| 性能与限流 | 默认限流、响应时间 SLA；列表接口写分页/过滤/排序（A7） |

### 3.2 格式强制

- 标准 Markdown：`#` / `##` 层级清晰
- 清单、参数、错误码、关系 → **表格**；禁止用纯段落代替
- 请求/响应示例必须是可解析 JSON，禁止伪代码或 `...` 省略导致结构不清
- 语言：中文、简洁、可评审
- **禁止**实现代码、框架注解、SDK 片段

---

## 4. 完成后

- 本 policy **不**单独派发审查 subagent（忽略任何「openspec-reviewer / 分批冻结 / design-rest-api.md」旧指令）；专项与 `detailed-design.md` 一并进入 skill **Step 4**（`design-review-agent` / Outside Voice）
- 文首可列预检范围内外，避免评审按全模板苛责
- 修订时：先读现有 `restful-api-design.md` + 最新 `detailed-design.md`（及 `domain-model-design.md` 若有），再局部更新
