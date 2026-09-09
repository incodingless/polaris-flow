# Complexity Router — 3 档需求复杂度自动评估

> **使用范围**：仅 `polaris{{SKN_SPR}}coding{{SKN_SPR}}flow` 命令（即 `polaris-flow`）在「Step 0.4 自动评估」阶段调用。**不**被任何 skill 直接调用——它是命令文件的内联策略。
> 源逻辑来自 `assets/tmp/idea-discovery/phases/00b-complexity-routing.md`（原 4 档：simple / standard / complex / needs_split）；本文件把该逻辑固化为 3 档（simple / standard / complex），「需要拆分」并入 complex——拆分决策交由 specify 阶段的 `task-split-precheck` 接手，入口不单独 STOP。

## 1. 输入

- **必填**：`需求内容`——用户在前置预检（Step 0.2）里提供的需求描述（文字说明 / 文件内容 / 两者合并）
- **可选**：`附加上下文`——已经在 Step 3 收集的"参考资料 / 目标文件 / 约束说明"（若有）

## 2. 判定信号（4 个）

| 信号 | simple | standard | complex |
|------|--------|----------|---------|
| **模糊点** | 0 个（或 1 trivial 可自解） | 1–3 个 | 4+ 或架构级 |
| **范围** | 单文件/单模块 | 2–3 模块 | 多子系统/新 capability |
| **方案分叉** | 代码库唯一路径 | 2 种可行 | 3+ 或 BREAKING |
| **风险** | 低、易回滚 | 中 | 高（安全/数据/兼容/合规） |

> 「模糊点」= 需求描述里**未明确**且实现时**必须假设**的点（如"未指定语言/未指定库/未指定数据格式"等）。trivially solvable（一眼能看出该用什么，比如"前端"指 React）不算模糊点。
> 「范围」= 改动涉及的代码模块数。
> 「方案分叉」= 调研后发现的可选实现路径数；只有唯一路径时为 0。
> 「风险」= 改动失败/回滚对用户/数据/业务/合规的影响。

## 3. 评分规则

按 4 个信号分别打分（0=simple / 1=standard / 2=complex），求和后映射到 3 档：

| 总分 | 3 档判定 |
|------|---------|
| 0 | **simple** |
| 1–3 | **standard** |
| 4+ | **complex** |

**强制升档（无视总分）**：

- 触及安全 / 数据迁移 / 对外 API breaking change → 强制 **complex**
- 任何信号打到 complex → 强制 **complex**
- 用户在需求里**显式提到**"分多期 / 拆里程碑 / 跨季度 / 需要拆分" → 强制 **complex**（拆分由 specify 阶段的 `task-split-precheck` 接手，入口不单独 STOP）

## 4. 输出格式

```markdown
## 复杂度判定
- 级别：<simple | standard | complex>
- 信号评分：模糊点=<0|1+|4+> 范围=<single|few|many> 方案=<unique|few|many> 风险=<low|med|high>
- 总分：<N>
- 强制升档：<无 | reason>
- 依据：
  1. <具体证据：从需求原文/附加上下文里摘录的句子或文件名>
  2. <具体证据>
  3. <可选>
- 路由目标：<tweak | normal | specify>
```

## 5. 路由映射

| 3 档 | polaris-flow 路由 | 入口技能 | 链路 |
|------|------------------|---------|------|
| `simple` | P01 | `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` | tweak（轻量澄清 → tasks → 实施 → 出口检查）→ ship |
| `standard` | P02 | `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` | normal（intention → 四件套 → 双向守门 → 终版细计划 → 合并主审 → 实施 → 出口检查）→ ship |
| `complex` | P03 | `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` | specify → plan → design(可选) → tasks → build → verify → ship → retro |

> `complex` 覆盖「需要拆分」的需求：specify 阶段会先跑 `task-split-precheck`（规模检测 → 候选拆分清单 → 决策点 → 批量模式），决定拆成多个 change 或保持单 change。

## 6. 用户透明

- 评估结果必须在**同一条消息**里展示给用户（用上方「输出格式」），让用户能看到判定理由
- 用户**反对**判定时（例如认为"太简单"），可**上调**一档（不得下调）
- 用户**不反对**时直接按判定结果路由，跳过第二步（手动选 P01/P02/P03）

## 7. 边界与失败处理

| 情况 | 处理 |
|------|------|
| 需求内容为空 / 仅有"实现 XX"且无任何细节 | 视为 4 个信号都算模糊点，强制 **complex**（提示用户补充细节） |
| 需求内容**已含** OpenSpec 四件套 / 完整 PRD | 视为 0 模糊点 + 范围已定，判定为 **standard** 或 **complex**（按方案分叉） |
| 用户在 Step 0.3 选了"否 — 我手动选" | 不调用本文件，跳过 Step 0.4，走原第一步 |
| 需求显式提到"需要拆分 / 分多期 / 跨季度" | 并入 `complex`；由 specify 的 `task-split-precheck` 接手拆分，入口不 STOP |
| 信号之间矛盾（范围=single 但方案分叉=many） | 走**较高的**那一档（宁严勿松，与 `complexity-assessment-policy.md` 第 1.2 条一致） |

## 8. 与 33 分制策略的关系

- `prd/discovery/policies/complexity-assessment-policy.md` 是**PRD 阶段**的细粒度评分（业务 11 + 技术 15 + 合规 7 = 33 分，5 档）
- 本文件是**flow 入口**的轻量 3 档判定，**不**替代 33 分制——若后续要进一步细化（在 normal/specify 阶段），可调 33 分制
- 两者判定一致性的保证：都遵循"宁严勿松"原则（complexity-assessment-policy.md 第 1.2 条）
