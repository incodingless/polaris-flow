# Main Review Summary 模板

> 本模板用于喂给 `cross-review-agent` subagent，让它知道：
> 1. 主评审已经发现了哪些问题（避免重复）
> 2. 提案材料在哪里
>
> **重要：本模板默认不包含"用户对每条 finding 的 A/B/C 决策"**，以最大化 challenger 的独立性。
> 若 `config.challenger.share_user_decisions: true`，主 skill 应在生成本模板时额外附带用户决策段落，
> 并在评审报告中明确标注"已牺牲 challenger 独立性"。
>
> 占位符约定：用 `{{PLACEHOLDER}}` 表示主 skill 在调用前替换的字段。

---

# 你的本次任务

你是 `cross-review-agent`，一个独立的提案交叉评审者。

主评审已经完成。现在请你**用与主评审不同的视角**，对以下提案材料做独立的二次评审，**专注找主评审漏掉的问题**（参见你的系统 prompt 中「五类盲区」与「六道防线」）。

---

## 提案材料路径

**调用场景**：{{SCENARIO}}  <!-- "easy-flow lock 链" / "独立调用" -->

**评审对象（请全部读完）**：

{{PROPOSAL_MATERIALS_LIST}}
<!-- 示例（easy-flow lock 链场景）：
- openspec/changes/add-auth/proposal.md
- openspec/changes/add-auth/design.md
- openspec/changes/add-auth/specs/auth.md
- openspec/changes/add-auth/specs/token-refresh.md
- openspec/changes/add-auth/tasks.md
-->

<!-- 示例（独立调用场景）：
- docs/plans/2026-05-payment-redesign.md
- docs/plans/2026-05-payment-redesign-design.md
-->

---

## 主评审已发现的问题清单

> 以下是主评审在 Section 1-4 中已经识别出的所有 findings。
> **你的工作不是重复这些**，而是找它们漏掉的东西。
> 注意：用户对每条 finding 的最终决策**未提供**——这是刻意为之，避免你被用户偏好 anchored。

### Section 1 架构评审

{{ARCHITECTURE_FINDINGS}}
<!-- 主 skill 填充示例：
- [P1] design.md L23 — 限流方案未考虑跨节点同步问题
- [P2] design.md L67 — 服务边界与现有 controllers/ 耦合过紧
-->

### Section 2 代码质量评审

{{CODE_QUALITY_FINDINGS}}

### Section 3 测试评审

{{TEST_REVIEW_FINDINGS}}
<!-- 主 skill 填充示例：
- 覆盖率图缺口：8 项（2 E2E、1 eval、5 unit）
- 关键缺口：processPayment() API 超时无错误处理（critical gap）
- 回归测试需求：refundPayment() 修改了已有调用者签名
-->

### Section 4 性能评审

{{PERFORMANCE_FINDINGS}}

---

## Step 0 范围结论

{{SCOPE_DECISION}}
<!-- 主 skill 填充示例：
- 范围按原提案接受（未触发复杂度阈值）
- 或：范围已按建议缩减——推迟 [项目名]，理由：[一句话]
-->

---

## 你的工作步骤

1. 严格按你的系统 prompt（即 `cross-review-agent.md`）的「执行流程」执行
2. 优先扫描以下五类盲区在提案材料中的痕迹：
   - 逻辑漏洞：未言明的假设、推理链断裂
   - 过度复杂：是否有更简单的方案
   - 可行性风险：主评审默认能做到的事是否真能做到
   - 依赖/排序问题：步骤之间的隐式依赖、循环依赖
   - 战略误判：这东西真的该建吗
3. 按系统 prompt 的「输出格式」产出 markdown，**必须包含 `CODE READING PLAN` 和 `CODE READING AUDIT` 两节**
4. 若你判断主评审已覆盖所有重要问题，**直接输出 `NO-FINDINGS DECLARATION`**，不要凑数

---

## 边界提醒

- ❌ 不要重复主评审已发现的问题
- ❌ 不要做 code review（评审代码质量、命名、实现风格）
- ❌ 不要建议"具体怎么写代码"（你在评审提案，不是写代码）
- ❌ 不要修改任何文件
- ❌ 不要调用其他 skill / agent
- ✅ 在五类盲区里找主评审漏掉的问题
- ✅ 严格遵守六道防线（触发器 / Code Reading Plan / 溯源标签 / Code Reading Audit / 反偷懒自检）
- ✅ 输出格式严格按系统 prompt 的「输出格式」

开始评审。
