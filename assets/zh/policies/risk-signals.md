# 变更分级信号表（跨通道唯一源）

> **唯一源** —— 本表被三个消费点各取一片，任何地方**不得**再内联副本（`normal` 侧原表已改为引用本文件）。
> 两轴 = **复杂度**（做多深）+ **风险**（做不做）；最终值 `current_tier = max(两轴)`。
> 档位方向**写死**：`critical` **>** `standard` **>** `trivial`，档越高 = 越复杂 / 越高危。**不得反向**。

## 1. 档位定义

| level | 判定 |
|-------|------|
| `trivial` | §3 降档门 D1′–D4′ **全部满足** 且 §4 / §5 全无命中 |
| `standard` | **默认档**：无升档信号、也不满足降档门；或信息不足 |
| `critical` | 命中 §4 任一信号（D1–D7），或 §5 glob 命中 |

## 2. 消费切片（同表，不同问法）

| 消费点 | 取哪片 | 回答 |
|--------|--------|------|
| `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` Step 5 | §3 + §4 全表 | **通道**：tweak / normal / design |
| `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` Step 5.4 | §4 需求侧切片 + §6 合成 | **初判** `complexity_level` / `risk_level` |
| `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` Step 8 | §4 实现侧切片 + §5 glob | **复核** `risk_level`（只升不降） |

> 「一次判定 ≠ 两次判定」：表唯一，判定点两个（`specify` 初判 / `verify` 复核），**职责正交**。

## 3. 降档门（D1′–D4′）—— **全部满足**才成立

| # | 条件 | 判定依据 |
|---|------|----------|
| D1′ | 单模块 / 单文件级 | `design.md` 模块划分仅 1 个模块 / 子系统 |
| D2′ | 规格单薄 | `specs/` 仅 1 个 capability 且 delta spec ≤ 1 |
| D3′ | 任务可压缩 | 预计顶层任务 ≤ 3 即可覆盖全部验收场景 |
| D4′ | 无契约变更 | 无模块间接口契约变更、无数据实体变更 |

## 4. 升档信号（D1–D7）—— 命中**任一**即成立

| # | 信号 | 判定依据 | 影响轴 |
|---|------|----------|--------|
| D1 | 跨服务 / 跨系统 | 改动跨越进程 / 服务边界，或需协调多个部署单元 | 风险 ↑ |
| D2 | 需专项设计 | 数据模型 / 接口契约 / 领域模型需 `<slug>-design.md` 级专项设计（`design.md` 无法承载） | 复杂度 ↑ |
| D3 | 数据迁移 | 需 schema 变更含存量数据改写 / 迁移脚本 | 风险 ↑ |
| D4 | 破坏性契约变更 | 对外 API 契约、鉴权、权限、数据一致性的破坏性变更 | 风险 ↑ |
| D5 | 任务超编 | 预计顶层任务 > 8 | 复杂度 ↑ |
| D6 | 需求不稳 | 理解确认修正轮次 > 2 | 复杂度 ↑ |
| D7 | 高危领域 | 涉及合规、资金、安全审计等高危场景 | 风险 ↑（**一票 `critical`**） |

## 5. glob 下限兜底（仅**实现侧**，`verify` 用 diff 判）

命中**任一**路径片段 → `risk_level = critical`（**一票升档**，不给总分抵消的机会）：

| 类别 | 路径片段 |
|------|----------|
| 认证 / 鉴权 | `auth` `oauth` `session` `token` `jwt` |
| 权限 | `permission` `rbac` `acl` |
| 支付 / 资金 | `payment` `billing` `invoice` `settle` `wallet` |
| 加密 / 密钥 | `crypto` `cipher` `secret` `keystore` `keychain` |
| 并发 / 事务 | `concurrency` `lock` `mutex` `transaction` |
| 数据迁移 | `migration` `migrate` `schema` |
| 基础设施 | `infra` `deploy` `terraform` `k8s` |
| 合规 / 审计 | `audit` `compliance` `consent` `gdpr` |

**职责分工**：glob 兜**漏判**（机械、可复现）；§4 语义兜**误判**（判得准）。两者职责不同，不冲突。

## 6. 两轴合成

- `complexity_level` ← §4 中影响轴 = **复杂度**的信号（D2 / D5 / D6）+ 规模
- `risk_level` ← §4 中影响轴 = **风险**的信号（D1 / D3 / D4 / D7）+ §5 glob
- **一票升档**：D7 或 §5 glob 命中 → `risk_level = critical`
- **最终值**：`current_tier = max(complexity_level, risk_level)`（升档门优先 —— 高档流程能覆盖低档，反向不成立）
- **只升不降**：`specify` 初判 → `verify` 复核**只允许上调**；任何下调须用户按 `./policies/decision-point.md` 显式确认

> 与 `prd/discovery/policies/complexity-assessment-policy.md` §4「高危场景强制升档（一票否决）」**同构** —— 复用既有约定，不新造机制。

## 7. 通道决策与分级的分工

同一张表回答两个不同的问题，**不是**「同一件事两处判定」：

- **通道**（`normal` Step 5）：问「这活儿该走哪条链路」→ 命降档门 → tweak；命升档门 → design
- **分级**（`specify` / `verify`）：问「要验多深、要不要卡」→ 两轴 → `current_tier`
