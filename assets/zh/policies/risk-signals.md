# 变更分级：档位映射 + 机械兜底（跨工作流唯一源）

> **职责边界**：本文件只保留「**档位映射** + **实现侧机械兜底（glob）** + **两轴合成**」。
> 「**怎么判复杂度**」（幅度 × 深度 + 风险一票）归 `coding/specify/policies/implementation-complexity.md`（唯一源），本文件**不复制判据**。
> 三消费点各持判据：`intake` 用 `intake/policies/entry-tiering.md`、`specify` 用 `implementation-complexity.md`、`verify` 用 `verify/policies/complexity-review.md`。
> 档位方向**写死**：`critical` **>** `standard` **>** `trivial`，档越高 = 越复杂 / 越高危。**不得反向**。

## 1. 档位定义

| level | 判定 |
|-------|------|
| `trivial` | 幅度 × 深度合成矩阵 = trivial，且无风险一票 / glob 命中 |
| `standard` | 合成矩阵 = standard，或信息不足（**默认档**） |
| `critical` | 风险一票命中，或合成矩阵 = critical，或 §3 glob 命中 |

**→ 工作流档位**（`state.yaml.workflow.mode`）的单源映射：`trivial → tweak`、`standard → normal`、`critical → strict`。
地方**不得**再内联这张映射（技能侧按此派生，见 §2）。

## 2. 消费切片

| 消费点 | 判据来源 | 回答 |
|--------|--------|------|
| `coding/intake` **Step 2** | `intake/policies/entry-tiering.md` | **入口粗判**：只用于"选哪个入口技能"，不落盘为权威判定 |
| `coding/specify` **Step 5.5（出口）** | `specify/policies/implementation-complexity.md` | 🔴 **权威判档**：`workflow.mode` 的唯一变更点（升 / 降都在这里） |
| `coding/verify` **Step 9** | `verify/policies/complexity-review.md` | **复核** `risk_level`（只升不降） |

> 三判定点分工正交：**入口粗判**（选技能）→ **出口权威判档**（定档位；过了 `specify` 即冻结）→ **verify 复核**（定验证强度）。

## 3. glob 下限兜底（仅**实现侧**，`verify` 用 diff 判）

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

**职责分工**：glob 兜**漏判**（机械、可复现）；风险一票（`implementation-complexity.md` §四）兜**误判**（判得准）。两者职责不同，不冲突。

## 4. 两轴合成

- `complexity_level` ← 幅度 × 深度合成矩阵（`implementation-complexity.md` §五）
- `risk_level` ← 风险一票（`implementation-complexity.md` §四）+ §3 glob
- **一票升档**：风险一票或 §3 glob 命中 → `risk_level = critical`
- **最终值**：`current_tier = max(complexity_level, risk_level)`（升档门优先 —— 高档流程能覆盖低档，反向不成立）
- **只升不降**：`specify` 初判 → `verify` 复核**只允许上调**；任何下调须用户按 `./policies/decision-point.md` 显式确认

## 5. 工作流档位与分级的分工

同一套模型回答两个不同的问题，**不是**「同一件事两处判定」：

- **工作流档位**（`workflow.mode`）：问「这活儿该走哪条链路」→ 合成矩阵 + 风险一票 → 三档。**两个判定点**：`intake` 入口**粗判**（只为选入口技能）、`specify` **出口权威判档**（`workflow.mode` 的唯一变更点，**过了即冻结**）。
- **分级**（`complexity_level` / `risk_level` / `current_tier`）：问「要验多深、要不要卡」→ 两轴 → `current_tier`；判定点：`specify` 初判 → `verify` 复核（只升不降）。
