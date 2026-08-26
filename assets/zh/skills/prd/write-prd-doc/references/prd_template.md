# 产品需求文档（PRD）结构模板

用于 `draft` 与 `detail` 阶段的文档骨架。复制 `assets/prd_template.md` 到需求目录后填写。

## 文档整体结构

```
1. 概述（Overview）
   1.1 背景与目标
   1.2 范围（包含 / 不包含）
   1.3 术语与定义
2. 用户与角色（Personas / Roles）
3. 功能点清单（Function List，附编号）
4. 关键用户旅程（User Journeys）
5. 功能规格（Feature Specifications）  ← detail 阶段逐功能展开
6. 非功能性需求（NFR）
7. 依赖与约束（Dependencies & Constraints）
8. 成功度量（Metrics）
9. 开放问题与风险（Open Questions & Risks）
```

## 功能规格块（每个功能点一份）

> 在 `detail` 阶段对每个功能点都按要求填写以下字段。字段名固定，便于评审与追溯。

```
### [F-01] 功能标题

- 功能编号: F-01
- 关联用户故事: <引用 user_story 或澄清中的条目>
- 描述: <一句话说明该功能的用途>

前置条件 (Preconditions):
  - <进入该功能前系统/数据必须满足的状态>
  - ...

后置条件 (Postconditions):
  - <功能成功后系统/数据达到的状态>
  - ...

业务逻辑 (Business Logic):
  1. <主流程步骤>
  2. <分支/异常步骤>
  ...

数据输入 (Data Inputs):
  | 字段 | 类型 | 来源 | 校验规则 |
  |------|------|------|----------|
  | ...  | ...  | ...  | ...      |

数据输出 (Data Outputs):
  | 字段 | 落库/下游 | 说明 |
  |------|-----------|------|
  | ...  | ...       | ...  |

验收标准 (Acceptance Criteria):
  - Given <前置场景> When <操作> Then <可观测结果>
  - ...

异常与错误处理 (Exceptions):
  - <异常场景> → <系统行为/提示>

依赖 (Dependencies):
  - <上游/下游系统或前置功能>
```

## 验收标准写法（可测性）

使用 Given / When / Then：
- **Given** 明确的初始上下文（含数据状态）
- **When** 用户或系统的具体操作
- **Then** 可观测、可判定的结果（数量、状态、提示文案、落库记录）

避免使用“良好”“快速”“友好”等不可度量词；如必须，给出量化口径。
