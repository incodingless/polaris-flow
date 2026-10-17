# build 分批派发方案（防单个 subagent 上下文压缩）

## 问题

单个 change 存在大量编码任务（多为 TDD 任务）时，`build` 的 `subagent_dispatch` 模式派**一个** implementer subagent 串行跑 `/opsx:apply` 全量任务。任务一多，subagent 上下文充满 → 触发压缩 → 任务丢失 / 执行偏离。

核心痛点是**上下文窗口装不下整个 change 的全部任务**，不是执行速度慢。

## 方案（串行分批派发，不并行）

`tasks` 阶段按依赖/关联把顶层任务划成多个批次；`build` 阶段按批次号**串行逐批派发 subagent**，每个 subagent 只实施一批，上下文只装「本批任务 + 上游产出摘要」，从根上避免上下文溢出。

依赖的地基是现成的：`openspec instructions apply` 是续跑式的——每次只要求做「未勾选」任务（`remaining`）。前一批勾选完，后一批的 apply 自然只剩「本批 + 后续未做」。所以分批串行**不需要改 apply 命令本身**。

## 四个改动点

### A. tasks 产出「执行批次」

- 批次 = 依赖拓扑层 + 文件关联聚类：节点 = 顶层任务，边 = A 的 Produces 被 B 的 Consumes 引用；Consumes 为空 → 最早批，依赖某任务的排其后；改同一文件/模块的合并同批。
- 落盘形式：复用现有 `## N.` 组标题，N 显式定义为**批次号**、按依赖拓扑连续编号。apply/lint 只认 checkbox、忽略 `##` 标题，故对 apply 零影响，agent 能读到批次结构。
- 硬约束：单批顶层任务 **≤ 8**（超限拆成两个连续批次，保持依赖序）；每条 TDD 任务的用例清单 + 五步**整体归本批、不跨批**（否则「先 RED 后 GREEN」断裂）。

### B. build Step 4 改为逐批循环派发

按批次号顺序逐批：组装「本批专属」implementer prompt → 派发一个 fresh subagent → 跑 `/opsx:apply` 只做本批 → 主代理本批出口校验（本批全勾 + 无越界）→ 落盘批次游标 → 下一批。

### C. implementer-prompt 改造

保留「唯一动作 = `/opsx:apply`」不变（apply 仍是写码通道），新增「本批范围」块：本批任务 `N.M` 编号范围 + 上游已就绪符号摘要 + 硬边界禁令（编号之外的任务禁止触碰）+「只需读本批 Files + 上游摘要，不必通读 tasks.md 其余部分」。

### D. 出口校验适配

- 现有校验 1（tasks.md 无 `- [ ]`）语义不变，仅「完成时机」从「单次 apply 结束」改为「全部批次结束」。
- 新增：越界勾选检查；批次游标与勾选进度一致。

## 裁定（D1–D4，全部按推荐）

| # | 决策点 | 裁定 |
|---|---|---|
| D1 | 单批上限 | 顶层任务数 **8**，跑两个真实 change 再调 |
| D2 | 批次落盘形式 | 只复用 `## N.` 组语义，**不加** `<!-- batch -->` 注释 |
| D3 | 越界兜底 | 主代理**每批出口强校验**（自律不可靠，是方案命门） |
| D4 | 续跑游标 | 存 `state.yaml` 的 `runtime.build.current_batch`（跨压缩恢复需要） |

## 改动分批

| 批 | 范围 | 风险 |
|---|---|---|
| 批 1 | `tasks/templates/tasks-template.md` + `tasks/SKILL.md`（批次语义 + 划分规则） | 低（纯规划语义） |
| 批 2 | `build/SKILL.md` Step 4 逐批循环 + `build/assets/implementer-prompt.md` 本批范围 | 中（改执行逻辑，贴近「唯一动作 = apply」边界） |
| 批 3 | `build/SKILL.md` Step 6 出口校验 + 标识约定（`current_batch` 游标） | 低-中 |

## 风险

1. **越界风险**：apply 每次列全部 pending 任务，subagent 靠 prompt 边界自律「只做本批」。靠 D3 每批出口强校验兜底，比现状（一个 subagent 全扛到压缩）可靠，但不是零越界。
2. **Interfaces 精度 = 摘要质量**：Consumes/Produces 写得含糊，本批 subagent 仍要重读上游代码，摘要白做、上下文照样膨胀。本方案顺带把 tasks 阶段写 Interfaces 的职责从「给 reviewer 看」升级为「给下游 subagent 续上下文」。
3. **批次划分收益需实测**：分批是否真能压住上下文，取决于「一批任务 + 上游摘要」是否确实小于单个 subagent 的压缩阈值。D1 的 8 是拍的值，需真实 change 校准。

## 落地状态

| 批 | 范围 | 状态 |
|---|---|---|
| 批 1 | `tasks/templates/tasks-template.md` + `tasks/SKILL.md` | ✅ 已落地（2026-10-16） |
| 批 2 | `build/SKILL.md` Step 4 逐批循环 + `build/assets/implementer-prompt.md` 本批范围 | ✅ 已落地（2026-10-17） |
| 批 3 | `build/SKILL.md` Step 6 出口校验 + 标识约定 / 恢复清单（`current_batch`） | ✅ 已落地（2026-10-17） |

落地要点：
- `implementer-prompt.md` 新增「# 本批范围」块：`<批次号>` / `<本批编号范围>` / `<上游 Consumes 摘要>` 三个运行时占位符 + 硬边界（编号之外禁止触碰、不必通读 tasks.md）。
- `build/SKILL.md` Step 4 改为 `4.A`（subagent 逐批循环：组装本批 prompt → 派发 fresh subagent → 出口强校验 → 落盘 `current_batch`）+ `4.B`（inline 单次，不写游标）。
- Step 6 校验 2 吸收「逐批 completed + 无越界」；落盘表与 set 命令新增 `current_batch` 置空。
- 越界仍是「prompt 自律 + 出口强校验兜底」，非事前阻止（用户已确认接受）。
- 验证：`npx vitest run test/ts/skills-install.test.ts` 14/14 通过。

## 增量（2026-10-17）：分批派发改成用户可选开关

原设计 `subagent_dispatch` 一律逐批派发。按用户要求改为**用户选择是否分批**：

- 新增 `runtime.build.batch_dispatch`（`true`=分批 / `false`=单批，默认 `false`），登记进 `state.example.yaml`（含 `current_batch` 游标一并补登记）。
- Step 2 新增 2.3「是否分批派发」决策点（仅 `build_mode=subagent_dispatch` 时询问；inline 不询问、不写）。
- Step 4 改为 4.A（`subagent_dispatch` 入口，按 `batch_dispatch` 分 4.A.1 单批 / 4.A.2 逐批）+ 4.B（inline）。
- `implementer-prompt.md` 的「本批范围」块改为「实施范围」块，兼容单批（全部任务）/分批（第 N 批）两种形态。
- 验证：`skills-install` 14/14 + `task-state` 6/6 + `task-state-entry` 12/12 + `task-state-checkbox` 17/17 + `generate-polaris-config`/`task-kind-phases` 均通过。
