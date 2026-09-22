# 上下文边界与压缩时机规范（设计提案）

日期：2026-09-22
状态：**待评审** —— 三条原则已由用户给定，§六 的 D1–D5 未决
触发：用户提出「技能边界应支持新开会话接续」「技能内压缩时机应有统一门槛」「委派材料与回报只走路径」三条原则，要求据此重整四条工作流（prd / coding / prototype / debug）的上下文策略
上游：`docs/specs/2026-09-19-phase-truth-unification-design.md`（游标权威结论）、`docs/specs/2026-09-16-debug-workflow-design.md`（已作废）
范围：只定**边界契约**与**压缩时机**；不含技能内部业务分支逻辑，不改 Dashboard

---

## 一、用户给定的三条原则（原文）

1. **技能级**：每个技能均可以新开会话，也应该新开会话窗口。同一个技能簇（工作流）中的技能完成任务后**必须落盘必要内容**，以便在新会话窗口内接续之前的任务。
2. **技能内压缩时机**：
   - (a) 必须完成本步操作、完成指定文件落盘后，**再允许提到压缩**；
   - (b) 大段读取、调研、使用 subagent 委派时，`materials` **只给路径**；**父会话禁止先读**这些路径。子代理回报**只许**：状态、产出路径、短列表；**禁止**把原文、代码、未命中检索贴回；父会话之后**只读产出路径**。若子代理无法委派、或要求 `inline`，才由父会话自己读，**立刻写入同一产出路径**，回复里不贴原文，并标明边界 `inline`；需要压缩时**输出提示，要求人工操作压缩按钮**。
   - (c) 阶段收尾、`complete-phase` 已成功后，可加**一句不阻塞提示**（宿主若支持压缩，现在可以压缩；恢复时读哪些文件）。

---

## 二、调研结论

### 2.1 压缩时机：已被零散实现，但无统一契约

仓内已存在 5 类压缩点，**做法各自为政、措辞四种**：

| # | 位置 | 措辞 | 是否满足「落盘后才提」 |
|---|---|---|---|
| 1 | `coding/design/SKILL.md:169-174`（3.3 主动式上下文压缩） | 「主动式上下文压缩」 | ✅ **显式写明前置**：`detailed-design.md` + 专项设计 + 状态证据均已落盘后才考虑 |
| 2 | `prototype/build/SKILL.md:266`（Step 6.2） | 「**压缩**上下文」 | ✅ 位于收尾步，产物已落盘 |
| 3 | `debug/patch/SKILL.md:123,129`（1.6） | 「**清理**上下文」 | ✅ 位于收尾步 |
| 4 | `prd/discovery` 4.4 / 5.3 / 6.3、`prd/draft` 4 处 | 「**上下文整理**」 | ✅ 每步收尾，且 `draft` 另有「全文只在落盘时输出一次」的省 token 机制 |
| 5 | `prd/discovery:621`、`prototype/blueprint:292` | 「**清空**上下文并输出」 | ✅ 阶段推进后 |
| 6 | `prd/draft:258` | 「请开启**新会话**」 | ✅ 阶段推进后（**全仓唯一一处强制新会话**） |

**结论：原则 2(a) 实质上已被满足** —— 既有 6 类压缩点全部出现在「操作已完成 + 产出已落盘」之后。真正缺的是**统一**（四种措辞、没有统一提示语模板、没有恢复清单格式），以及**覆盖面**（见 2.3）。

### 2.2 技能衔接：存在「自动衔接」这条路，默认开启

| 事实 | 证据 |
|---|---|
| 权威是 `workflow.yaml` 游标；`state.yaml.phase` **只写不读** | `docs/specs/2026-09-19-phase-truth-unification-design.md` §1.1 |
| 技能出口调 `polaris-flow state next`，按 `NEXT:` 三分支 | `zh/policies/auto-transition.md` §执行方式 |
| `NEXT: auto` → **在同一会话直接调用下一技能** | 同上；实现在 `coding/specify/SKILL.md` 尾部「## 自动衔接下一阶段」 |
| `auto_transition` **默认 `true`** | `assets/shared/templates/state.example.yaml:122` |
| 带自动衔接的技能共 4 个 | `coding/{specify, plan, normal, tweak}/SKILL.md` |

**结论：原则 1（每个技能都应新开会话）与 `auto_transition: true` 正面冲突。** 当前默认行为是「一路跑到底」，链路越长会话越长，而「新开会话」需要用户主动打断。这是 §六 D1 的决策点。

### 2.3 委派：两种派发模式，其中一种污染父会话

`subagent-dispatch/references/dispatch-execute.md` 定义 D-0 工具判定 → D-1/D-2：

| 模式 | 行为 | 与原则 2(b) |
|---|---|---|
| **D-1 路径引用型** | subagent 自读 `materials` 路径清单 | ✅ **完全符合**，可作样板 |
| **D-2 内容注入型** | **主代理先 `Read` 全文**，拼进 prompt 的 `Materials:` 段 | ❌ **直接冲突**：「父会话禁止先读」 |
| D-2 的「保守策略」 | 「不确定宿主是否真授予 frontmatter `tools` 时，**应直接走内容注入型**」 | ❌ 让冲突成为**默认行为** |

回报契约现状（`dispatch-execute.md` prompt 模板）：

```text
Include in your report: output (your deliverable or path to it), concerns (list of issues if any).
```

`output` 允许返回**完整产出内容**；`prd/refine` 的返回处理也写「接收 `result.output`（评审报告内容**或路径**）」。→ 原则 2(b) 要求的「只回状态 + 产出路径 + 短列表」**未被强制**。

**正面样板**：`prd/refine:4.1` 的 `task_spec.materials` 已经是**纯路径清单**，且评审方法明确「以 `prd:review` 技能定义为准，此处不重复」（判据单源，做对了）。要补的只是回报端。

### 2.4 边界硬伤清单（原则 1 的违反项）

| # | 位置 | 现状 | 后果 |
|---|---|---|---|
| **H1** | `coding/specify/SKILL.md:147`、`coding/normal/SKILL.md:201`、`coding/tweak/SKILL.md:177` | 确认名称后「`task_id` **记入会话上下文**（此时尚未 `mv` 目录）」；`specify-finalize.sh` 的两个入参 `<draft_name> <task_id>` 都取自会话 | 此窗口内新开会话/压缩 → draft 目录成孤儿，finalize 无法执行 |
| **H2** | `zh/policies/context-recovery.md`（全文 44 行） | 内容是 **comet 时代**遗留：引用 `comet`、`node polaris state check`、`./reference/scripts.md`、`./reference/dirty-worktree.md`、`<change-name>`、Superpowers 技能 —— 全部不成立；**零技能引用**（全仓仅 2 处历史日志提及） | 它被注入每个技能的 `./policies/`，构成**第二份协议**且内容是错的 |
| **H3** | `zh/policies/outside-voice.md:21,35`、`coding/tasks/SKILL.md:18,318` | 引用 `./reference/outside-voice.md`、`./reference/decision-point.md` | 路径断链（应为 `./policies/`）。2026-09-07 修过 `verify` 同类问题，属**复发模式** |
| **H4** | `coding/ship/SKILL.md:60-62` | 与 `:64-66` 重复的「唯一匹配 / 多个匹配 / 零匹配」三段；且**第一段的零匹配提示是错的**（「请先执行 /polaris-flow-design」，应为 verify） | 模型读到错提示会误导用户 |
| **H5** | `prd/review/SKILL.md:55` | 「写入 `state.yaml`：`refine.build_mode: …`」—— 一个**被调用的独立评审技能**去写调用方的字段 | 技能边界 ≠ 状态边界；与 `refine` 自身写入构成双写 |
| **H6** | `coding/{build:75, design:78, tasks:104, verify:84}` | 描述性写「更新 `state.yaml`：`phase: X`」 | 与权威游标**双写**，增加漂移面（D14 已定「保留非权威镜像」，但新增写入动作与其相悖） |

### 2.5 边界相关的两个结构性问题

**S1｜单入口技能内部零会话边界**：`coding/tweak`（4 段）、`coding/normal`（6 段）明确「**一次会话内串行完成**」。它们是全链路最长的单会话段。但产物是**逐段落盘**的（intention → 四件套 → tasks.md → 实施 → verify-report），技术上每段都可切。

**S2｜`prototype/review` 缺恢复章节**：`prototype` 的 blueprint / build / ship 三技能都有「上下文压缩恢复」，`review` 没有。

---

## 三、目标与非目标

### 目标

- **G1 一条出口契约**：任何技能退出时，**新会话仅凭落盘产物即可接续**，不依赖会话记忆。
- **G2 一套压缩时机**：三个层级（步骤级 / 委派级 / 阶段级）各有唯一门槛与唯一提示语模板。
- **G3 材料与回报只走路径**：父会话不因委派而吞入原文，子代理不把原文贴回。
- **G4 措辞归一**：四种说法收敛为一致的「压缩提示」格式。
- **G5 消除第二份协议**：`context-recovery.md` 不再是一份独立协议。

### 非目标

- 不拆 `tweak` / `normal` 的技能粒度（拆了违反「禁止新造流程」，且增加人工介入）。
- 不改 `auto_transition` 的代码实现（只改默认值与技能侧措辞）。
- 不动 `state.yaml.phase` 的去留（属 phase-truth 的 C 案，另立里程碑）。
- 不改各技能的业务分支逻辑与判据内容。

---

## 四、技能边界审查（对应原则 1）

### 4.1 审查判据：出口契约四件（G1 的可判定形式）

一个技能边界「合理」= 退出时下列四项**全部**可从盘上获得，缺一项即不合格：

| # | 项 | 载体 | 现状 |
|---|---|---|---|
| 1 | **任务身份与指针** | `workflow.yaml` 游标 + `state.yaml`（`task_id` / `output_dir`） | ✅ 已有机制（H1 是执行期漏洞） |
| 2 | **本阶段产物** | 各技能自己的产物文件 + `state.yaml` 的 `runtime.*` 指针 | ✅ 已有 |
| 3 | **下一步指令** | 技能尾部的衔接提示（技能名 + 调用方式） | ⚠️ 有，但受 `auto_transition` 影响（2.2） |
| 4 | **恢复清单** | 技能尾部「上下文压缩恢复」章节：重载哪些文件、中断位置 → 恢复动作 | ⚠️ coding 8 个技能 + prototype/ship 有；`prototype/review` 无（S2）；prd / debug 靠 Step 0 入口校验替代 |

### 4.2 达标项（无需改动，作为样板）

- **coding 族的「上下文压缩恢复」章节**：8 个技能格式统一（「重载：…」+ 中断位置 → 动作表），且都以落盘产物为恢复依据。
- **prd / debug 的 Step 0 入口校验**：`get-active-changes` + `state.yaml` 状态表 + 「不得因已是 X 阶段而报零匹配」，比恢复章节更强。
- **`prd/refine` 的 `task_spec.materials`**：纯路径清单（原则 2(b) 的正面样板）。
- **`coding/design:3.3`**：显式「落盘后才考虑压缩」，且「不得用 shell 命令或摘要伪造上下文压缩」（原则 2(a) 的正面样板）。
- **`prototype` 全族**：`state.yaml` 只记身份与指针、**产物即状态**，恢复依据明确写在 `prototype/ship:231`。

### 4.3 不合格项与整改

| # | 整改动作 | 触及文件 |
|---|---|---|
| H1 | 名称确认后**立即落盘**待定名（建议：draft 目录内 `.pending-name`，或 workflow 游标的 pending 字段）；finalize 从盘读取，不再从会话传参 | `coding/{specify, normal, tweak}` |
| H2 | **删除** `zh/policies/context-recovery.md`；如需总览，改写为**索引**（指向各技能的恢复章节），不承载第二份协议 | `zh/policies/context-recovery.md` |
| H3 | `./reference/` → `./policies/`（4 处） | `zh/policies/outside-voice.md`、`coding/tasks/SKILL.md` |
| H4 | 删除 `coding/ship/SKILL.md:60-62` 重复段 | `coding/ship/SKILL.md` |
| H5 | `refine.build_mode` 由**调用方**（`refine`）写；`review` 只读不写 | `prd/review/SKILL.md` |
| H6 | 4 处「更新 `state.yaml`：`phase: X`」补一句「非权威镜像，权威见 `workflow.yaml` 游标」 | `coding/{build, design, tasks, verify}` |
| S2 | 补「上下文压缩恢复」一节（或声明「评审为原子操作，中断即整段重跑」） | `prototype/review/SKILL.md` |

### 4.4 需决策的三项边界问题

**D1｜`auto_transition` 默认值**（原则 1 的核心冲突）

| 案 | 做法 | 代价 |
|---|---|---|
| **A 全改 manual** | 默认 `auto_transition: false`；出口输出「下一步可执行 `/X`，建议新开会话」 | 每段都要人点一次；链路变慢 |
| **B 保留 auto + 落盘检查** | auto 分支执行前强制跑「出口契约四件」自检，并输出恢复提示 | 会话仍长，原则 1 只被"部分"满足 |
| **C 按族分** | prd / prototype / debug 用 manual（本就有人工门禁）；coding 的 normal / tweak 保留 auto（一次会话设计） | 规则不统一，需在 `state.example.yaml` 与文档里解释两套 |

**D2｜D-2 内容注入型的去留**（原则 2(b) 的核心冲突）

| 案 | 做法 |
|---|---|
| **A 删除 D-2** | agent 无读文件能力 → 视为「无法委派」→ 走 `inline`（父会话自己读、立刻落盘、标注 `inline`）。**最贴合用户原则**，但浪费"能处理内容但不能读文件"的 agent |
| **B 收窄 D-2** | 仅当「agent 无读文件能力 **且** 材料总量小于阈值」时使用；并把「保守策略」反转（不确定时走 D-1 而非 D-2） |

**D3｜单入口技能的会话分段点**（S1）
是否在 `tweak` / `normal` 内加 2–3 个**可选、不阻塞**的分段提示（四件套落盘后 / 合并主审通过后 / 实施完成后）？还是维持「一次会话」不变？

**D4｜`context-recovery.md` 的处置**：删除，还是改写为索引？

**D5｜H1 的落盘载体**：draft 目录内小文件，还是 workflow 游标新增 pending 字段？

---

## 五、压缩时机规范（对应原则 2）

### 5.1 三层时机模型

| 层级 | 触发条件 | 作用域 | 输出形式 |
|---|---|---|---|
| **A 步骤级** | 本步操作已完成 **且** 指定产出文件已落盘 | 单技能内的步骤之间 | 不阻塞提示语（人工操作压缩按钮） |
| **B 委派级** | 需要大段读取 / 调研 / 委派时 | 父会话 ↔ 子代理 | `materials` 只给路径；回报只给路径 |
| **C 阶段级** | `complete-phase` / `update-active` 成功后 | 技能退出时 | 不阻塞提示语（压缩 + 恢复清单 + 下一步） |

### 5.2 层级 A：步骤级落盘门槛

**门槛（三条全满足才允许输出压缩提示）**：

1. 本步操作**已完成**（不是"即将完成"）；
2. 本步产出的文件**已落盘**（可 `ls` 验证）；
3. 本步的中间草稿**已提炼进落盘文件**（不再需要留在上下文）。

**统一提示语模板（不阻塞）**：

```text
本步已完成，产出已落盘：<路径>。
如当前会话上下文紧张，可执行压缩；压缩后从 <文件> 的 <章节/字段> 恢复。
```

**禁止**：在步骤中途提压缩；用 shell 命令或摘要伪造压缩（`coding/design:3.3` 已有此条，应提为通则）。

### 5.3 层级 B：委派与回报契约（原则 2(b)）

**材料侧**：

- `task_spec.materials` **只放路径**；父会话**禁止**预先 `Read`。
- D-1（路径引用型）为**默认**；D-2 按 D2 决策处理。
- 派发后父会话**只读产出路径**，不读被委派的原始材料。

**回报契约（收紧为三件）**：

```text
result:
  status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT | FAILED
  artifact_path: <产出文件路径；无产出填 null>
  concerns: [<短列表，每项 ≤1 行>]
```

**显式禁止**：回报中出现原文、代码块、未命中检索结果、逐条清单正文。

**降级路径（无法委派 / 强制 inline）**：

1. 父会话自己读 → **立刻写入同一产出路径**（不留中间态）；
2. 回复正文**不贴原文**；
3. 标注边界 `inline`（统一用语，替代现有「由主代理内联评审」等多种说法）。

### 5.4 层级 C：阶段收尾提示（原则 2(c)）

在 `complete-phase` / `update-active --set phase=` **成功之后**，追加一句不阻塞提示。统一模板：

```text
[<族> <技能>] <阶段名>完成，状态已落盘。
下一步：/<下一技能>（<是否建议新会话>）。
恢复：新会话中先读 <文件1>、<文件2> 的 <字段>，再从 <步骤/章节> 继续。
宿主支持压缩时，此刻是压缩上下文的合适时机。
```

**建议新会话 / 可同会话续跑**的判定：

| 情形 | 建议 |
|---|---|
| 跨技能（下一技能 ≠ 本技能） | **建议新开会话** |
| 同技能内跨步骤 | 不必新会话，可选压缩 |
| 存在人工门禁未过（用户确认未到） | 不得提压缩，先等确认 |

### 5.5 措辞归一

| 现有说法 | 统一为 |
|---|---|
| 清空上下文 / 压缩上下文 / 清理上下文 / 上下文整理 | **压缩上下文**（动作）+ **恢复清单**（内容） |
| 「请开启新会话」（`prd/draft:258`） | 保留，作为「建议新开会话」的**强语气**版本 |
| 「由主代理内联评审」/「未独立执行」 | 统一标注 **`inline`** |

---

## 六、落地方案（改动清单）

按「先低风险、后行为变更」排序：

| 批次 | 内容 | 文件数 | 风险 |
|---|---|---|---|
| **批 1｜纯修正** | H2（删 `context-recovery.md`）、H3（`./reference/` → `./policies/`）、H4（删 ship 重复段）、H6（补「非权威」注） | 6 | 低（不改变行为） |
| **批 2｜契约收紧** | 层级 B：`dispatch-execute.md` 的回报契约 + D2 决策落地；`prd/refine` 返回处理改为只收 `artifact_path` | 3 | 中（改变委派行为） |
| **批 3｜落盘补齐** | H1（待定名落盘）、S2（`prototype/review` 补恢复章节） | 4 | 中 |
| **批 4｜措辞与提示语归一** | 层级 A/C 的提示语模板；5 类压缩点统一措辞；各技能尾部补「恢复清单」四件套 | ~20 | 低（文本为主） |
| **批 5｜边界决策落地** | D1（`auto_transition`）、D3（单入口分段点） | 依 D1/D3 结论 | 高（改默认行为） |

**守护**：批 1–4 完成后跑 `npx vitest run test/ts/skills-install.test.ts`（技能 md 禁出现以 `..` 开头的路径字面量）；若触及 prototype 页面机制或脚本判定，另跑两侧 `evals/run.mjs --selftest`。

---

## 七、待决

| # | 问题 | 选项 | 影响面 |
|---|---|---|---|
| **D1** | `auto_transition` 默认值 | A 全改 manual / B 保留 auto + 落盘检查 / C 按族分 | 4 个技能 + 模板 + policy |
| **D2** | D-2 内容注入型 | A 删除改 inline / B 收窄 + 反转保守策略 | `dispatch-execute.md` + 全部调用方 |
| **D3** | 单入口技能分段点 | 加可选提示 / 维持现状 | `tweak` / `normal` |
| **D4** | `context-recovery.md` | 删除 / 改写为索引 | 1 个 policy |
| **D5** | 待定名落盘载体 | draft 目录内文件 / workflow pending 字段 | `specify-finalize.sh` + 3 个技能 |

> **建议先决 D1**：它决定批 5 的全部内容，也决定「每个技能都应新开会话」能否成为默认行为而非用户手动打断。
