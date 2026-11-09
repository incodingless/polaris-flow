# 实现复杂度复核（verify 私有）

> **这是 `verify`（阶段：验证）的私有细则**，`verify` 是其唯一调用方（调用位置 = 它的 Step 9 两轴复核）。
> ⚠️ **本文随 `verify` 安装**（落在 `coding/verify/policies/`），**不再被注入其他技能**——别处写 `./policies/complexity-review.md` 是坏引用。

## 一、复核什么

`specify` Step 5.5 出口判了「幅度 × 深度 + 风险」（见 specify 的 `implementation-complexity.md`）。本步用**真实 diff** 复核其中的「深度轴 + 风险」——specify 只从 `intention.md` 判，实现侧高危（需求说「加个字段」、实际代码碰了 `crypto`）要 diff 才暴露。

- `complexity_level` 本步**不重判**（实现侧不改需求幅度）。
- 只复核 `risk_level`，**只升不降**；下调须按 `./policies/decision-point.md` 显式确认。

## 二、深度轴（用 diff 判，与 specify 的 `implementation-complexity.md` §三 同源）

| 档 | 判据（diff 路径 + 改动内容） |
|---|---|
| **表层** | 只改 UI / 展示 / 独立工具 |
| **逻辑** | 改业务规则 / 状态流转 |
| **结构** | 改数据模型 / 接口契约 / 领域模型 |
| **核心链路** | 改核心生产链路 / 主流程 / 核心数据流转 |

## 三、风险一票（命中即 `critical`，与 specify 的 `implementation-complexity.md` §四 同源）

- 资金 / 支付 / 结算 / 财务
- 合规 / 监管（强监管，违规有法律风险）
- 安全 / 鉴权 / 权限
- 不可回滚 / 回滚成本极高
- 存量数据迁移 / 数据丢失风险

## 四、glob 兜底（机械，沿用 `./policies/risk-signals.md` §3）

命中任一路径片段 → `risk_level = critical`（一票升档，不给总分抵消的机会）。

## 五、合成（只升不降）

- `risk_level' = max(Step 1 读入的 `risk_level`, 本步复核值)`
- 深度轴 = 结构 / 核心链路 → 复核值 ≥ `standard` / `critical`
- 风险一票命中 或 glob 命中 → `critical`
- **只升不降**：下调须按 `./policies/decision-point.md` 显式确认
