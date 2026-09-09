# 变更简报: <change_id>

> **使用约定**：本模板由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` skill Step 2.2 引用。主代理读取本模板后按节顺序填充，不得删节、不得改节顺序。
>
> 各节的 `→` 行内注释标注了该节在两处下游的映射去向：
> 1. **升档转交**：生成符合 `intention-template.md` 结构的 `intention.md`，交 `polaris{{SKN_SPR}}coding{{SKN_SPR}}plan`（见 `policies/artifact-backfill.md` §2）
> 2. **归档补齐**：生成 OpenSpec 四件套，供 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` 归档前调用（见 `policies/artifact-backfill.md` §3）
>
> 因此**每节内容必须自洽完整**——下游只做格式转换，不补内容。

---

## 一句话目标

<!-- → proposal.md 目标 / intention.md「目标」 -->

<一句话：本次变更要达成什么>

## 问题与背景

<!-- → proposal.md 的 Why / Context；intention.md「Reframe 历程」（注明轻量通道未做 Reframe） -->

<为什么需要这次变更；当前状态是什么>

## 范围

<!-- → proposal.md 的 Scope / 非目标；intention.md「任务范围（Scope）」 -->

### 包含

- <...>

### 不包含（非目标）

- <...>

### 拆分决策

- 结论：保持单 change
- 不拆分原因：<满足 task-split-precheck §1 唯一判定门，引用具体条目>
- 评估日期：<YYYY-MM-DD>

## 验收标准

<!-- → specs/<capability>/spec.md 的 Requirements + Scenarios；intention.md「验收场景及标准」 -->

1. <可判定的成功条件；尽量可自动化验证>
2. <关键边界场景>
3. <...>

## 方案

<!-- → design.md 的 Architecture / 技术选型；intention.md「结论（架构 + 技术选型）」 -->

<怎么改：涉及哪些文件、关键实现思路、为什么这样选。1–3 段，不要贴大段代码>

## 宪法对齐

<!-- → design.md 的 `## Constitution Alignment`；intention.md「宪法对齐」 -->

- <Principle 名>: <如何对齐>
- <...>

<!-- 若宪法含 NON-NEGOTIABLE 原则（如 Test-First），必须逐条显式说明 -->

## 前提与风险

<!-- → design.md 的 `## Premises`；intention.md「前提」 -->

1. <依赖的假设，须为真本次方案才成立>
2. <...>

**风险**（可为空）：<已知风险与缓解方式>

**风险接受记录**（仅 Step 3 选 B 继续 tweak 时追加）：

- 命中升档信号：<U1 / U3 / ...>
- 用户决策：继续 tweak
- 日期：<YYYY-MM-DD>

## 备选方案

<!-- → design.md 的 `## Alternatives`；intention.md「备选方案」 -->

### 方案 B（未选）

- 优点：…
- 缺点：…
- 拒绝理由：…

<!-- 无备选方案时整节填「无」，不得删节 -->

## 待决问题

<!-- → proposal.md 的 Open Questions；intention.md「待决问题」 -->

- <...>

<!-- 无待决问题时整节填「无」。非空且影响方案 → 命中升档信号 U6 -->

## 影响面

<!-- → 不进四件套；仅作 Step 3 升档判定与 artifact-backfill 的 capability 命名输入 -->

- **涉及模块**：<模块 / 子系统清单，逐项列出>
- **涉及文件**：<预计改动的文件路径清单>
- **新增或变更数据实体**：<有 / 无；有则列出表名 / schema / 迁移脚本>
- **触碰核心链路**：<有 / 无；有则列出：鉴权 / 支付 / 权限 / 对外 API 契约 / 数据一致性>
- **预计 delta spec 数**：<N>
- **预计顶层任务数**：<N>
- **主 capability 命名**：<kebab-case，供 specs 目录命名；取核心模块名，无则取 change_id>
