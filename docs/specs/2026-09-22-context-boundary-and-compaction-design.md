# 上下文边界与压缩时机规范（设计提案）

日期：2026-09-22
状态：**批 1–5 已落地（2026-09-23）** —— 三条原则已由用户给定；D1、D2、D4、D6 已决（落法见 §5.3 / §5.6 / §5.6.3）；D3、D5 未决
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
- D-1（路径引用型）为**默认**；**不确定宿主是否真授予 `tools` 时也走 D-1**（旧「保守策略」已于 2026-09-23 反转，落点见 `subagent-dispatch/references/dispatch-execute.md` 的 D-0.2）。
- D-2（内容注入型）**只允许用于小材料**：`materials` 合计 ≤ 300 行。超限 → 不注入，改换有读文件能力的 agent 或降级 `inline`。默认 subagent 分支（`agent=null`，最常用）同样受此闸门约束。
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

### 5.6 技能衔接协议（D1 已决，2026-09-22）

**决策**（用户给定）：

- `auto_transition: false`（**manual**）→ 输出提示，**要求用户新开会话并输入对应的技能名称**；
- `auto_transition: true`（**auto**）→ **必须先压缩上下文，再自动执行对应的技能**；
- **「清空」不再作为一种独立动作** —— 它统一等于「用户新开会话」，即 manual 路径。

这条决策把「auto 与『每技能新开会话』冲突」转化成了**配置约束**：`auto_transition` 与
`context_compression` 本来就是同一份配置（`assets/shared/templates/config.example.yaml` 的
「工作流状态」/「功能开关」两段）里的两个开关，默认值分别为 `true`（`polaris-project-config.ts:186`）
与 `off`（同文件 `:190`，值域 `off | beta`）。

| `auto_transition` | `context_compression` | 行为 |
|---|---|---|
| `false`（**建议默认**） | 任意 | **manual**：输出提示语，停下等用户新开会话 |
| `true` | `beta`（或未来的 `on`） | **auto**：提示用户按平台方法压缩 → 用户完成后自动执行下一技能 |
| `true` | `off` | ❌ **非法组合**——不能压缩就不能自动跑（否则违背原则 1）。写入时拦截；存量数据降级为 manual 并告警 |

#### 5.6.1 压缩动作必须按平台分派（2026-09-22 查证）

| 平台 | IDE 形态的压缩动作 | CLI 形态的压缩动作 | 自动压缩 | 清空 / 新会话 |
|---|---|---|---|---|
| Claude Code | `/compact`（可带焦点，如 `/compact focus on X`）；`/rewind` 可分段摘要 | 同左（本就是 CLI） | 接近窗口上限时自动 | `/clear` 或开新会话 |
| Cursor | `/summarize` | 同左 | 达到窗口上限自动摘要 | 新建对话 |
| Trae | 上下文使用率面板上的**「压缩」按钮**（仅 SOLO Agent） | `/compact` | 超出窗口时自动触发 | `/new` 开新对话 |
| Trae-CN | 同 Trae | 同 Trae | 同 Trae | 同 Trae |
| Qoder | Smart Context Control 的**「压缩当前会话」按钮**（用量 >40% 才可用；对话早期与生成中禁用） | `/compact`；`/clear` | — | 「新建会话」New Chat |

⇒ 两条硬约束：

1. **agent 没有压缩原语**。上表入口全部是「用户输入斜杠命令 / 点击按钮」或「宿主在阈值自动触发」；
   项目里 agent 的工具映射（`PLATFORMS[].agentToolMap`）也没有斜杠命令工具
   → **agent 不能自己执行压缩**，只能给出本平台对应的操作提示。
2. **动作随宿主形态而变**（IDE 用按钮、CLI 用斜杠命令），而现有 `platforms.ts` 只按平台 id 分派，
   **没有 IDE / CLI 维度** → **D6 已决（A 案），落地形态见 §5.6.3**。

#### 5.6.2 auto 的真实语义是「半自动」

因为第 1 条硬约束，auto 无法做到 agent 自主压缩。它的实现是：

```text
[<族> <技能>] <阶段>完成，状态已落盘。
请执行压缩：<本平台压缩动作>（如 Claude Code 输入 /compact；Trae IDE 点击上下文面板的「压缩」）。
压缩完成后回复「继续」，我将执行 /<下一技能>。
恢复：先读 <文件1>、<文件2> 的 <字段>。
```

**auto 的执行序（六步，顺序不可交换）**：

1. 落盘本阶段全部产物（出口契约四件）；
2. 运行 `polaris-flow state next <change-name>`，取得 `NEXT: auto` 与 `SKILL`；
3. 把「下一步 = `SKILL`」与恢复清单**写进落盘文件**——压缩后当前会话不再可靠记得它；
4. 按**本平台压缩动作**输出提示，**停下等用户完成压缩**；
5. 用户确认完成后，执行 `SKILL`；
6. 执行前重读恢复清单，校验落盘产物仍在（压缩后防线）。

⇒ **manual 与 auto 的差别**：前者是「新开会话 + 重新输入技能名」（清空）；后者是「留在原会话，
按平台方法压缩，然后由 agent 接续」。**两者都需要用户动一次手**——区别在于是否重置整个窗口。
⇒ 若宿主既不支持用户手动压缩、`context_compression` 又为 `off` → auto **无法落地**，
必须降级 manual，**不得**退化成「背着历史继续跑」（那是被否决的旧行为）。

**禁止**（沿用 `coding/design:3.3` 既有条款，此处提为通则）：

- 不得用 shell 命令或摘要**伪造**压缩；
- 不得在未落盘时压缩；
- 不得在 `context_compression: off` 下宣称「已压缩」。

**顺带记录一处 bug**：`coding/design/SKILL.md:170` 判断的是 `context-compression: on`，而配置值域是
`off | beta`（`src/core/config/polaris-project-config.ts:189`）→ **该分支永不命中**，应改为 `beta`。

#### 5.6.3 A 案落地形态：宿主形态维度（D6 已决，2026-09-22）

**① 数据层** —— `src/core/domain/platforms.ts` 的 `Platform` 新增：

```ts
/** 上下文压缩动作，按宿主形态分列；缺项 = 该形态无此动作 */
compressionAction?: { ide?: string; cli?: string };
```

各平台取值即 §5.6.1 表的第 2、3 列。沿用 `supportsSubagent` + `resolveSubagentCapability` 的既有模式，
**不新造机制**。

**② 探测层** —— 新增 `resolveHostForm(platformId, config, signals): 'ide' | 'cli' | 'unknown'`，三级链：

| 优先级 | 判据 | 状态 |
|---|---|---|
| ① | `config.yaml` 的 `host-form: ide \| cli`（显式声明） | ✅ 确定可用（新增字段） |
| ② | 宿主信号（平台特有 env / PPID 进程名） | ⚠️ **未实测**，需五平台逐一验证 |
| ③ | `'unknown'` | ✅ **不猜**，交给消费方降级 |

> **已排除的判据**：Claude Code SessionStart 的 `source` 取值是 `startup / resume / clear / compact`，
> 语义为「会话如何启动」，**不是宿主形态** → 不可用作判据。
>
> **但它是意外收获**：`source: compact` 是「压缩确实发生过」的**宿主级证据**。可挂进 auto 执行序的
> 第 6 步，用来校验压缩真的发生，而不是只听用户自述「我压缩了」。

**③ 注入层** —— 随现有 SessionStart 注入通道（`additionalContext` + Cursor `env` +
`.polaris/.cache/runtime-env` + `CLAUDE_ENV_FILE`）：

| 变量 | 值 |
|---|---|
| `HOST_FORM` | `ide` \| `cli` \| `''`（unknown） |
| `CONTEXT_COMPRESSION_ACTION` | 本平台本形态的动作描述；`unknown` 时为空串 |

**④ 消费层** —— 技能衔接提示语直接引用注入值：

```text
请执行压缩：${CONTEXT_COMPRESSION_ACTION}
```

`HOST_FORM=''` 时降级为双形式提示（即 §七 D6 的 B 案行为）——**A 案自带降级路径，
不需要在 A / B 之间二选一**。

**⑤ 落地顺序** —— 先打通 ① + ③（config 显式 + unknown 兜底），让提示语先有确定载体；
②（PPID / env 探测）作为后续增强：**探测每一步都要在真机实测，不实测不进规范**。

---

## 六、落地方案（改动清单）

按「先低风险、后行为变更」排序：

| 批次 | 内容 | 状态 |
|---|---|---|
| **批 1｜纯修正** | 删死文件 `context-recovery.md`（H2）；`./reference/` 断链 4 处 → `./policies/`（H3）；`./policy/decision-point.md` 拼错 2 处（H6）；删 `coding/ship` 重复段（H4）；删 `prd/review` 越界写 `refine.build_mode`（H5） | ✅ 2026-09-22 |
| **批 2｜出厂默认值** | `auto_transition: false` + `context_compression: beta`（值域维持 `off\|beta`）；`state-next` 判定重排；`design:170` 的 `on` → `beta`；测试断言同步 + 新增 auto 集成用例 | ✅ 2026-09-22 |
| **批 3｜平台维度骨架** | `Platform.compressionAction`（五平台）+ `normalizeHostForm` / `resolveCompressionAction` + `config.host_form` + 注入 `HOST_FORM` / `CONTEXT_COMPRESSION_ACTION` | ✅ 2026-09-22 |
| **批 4｜协议文本** | `auto-transition.md` 写入 manual / auto 双模式与 auto 六步执行序；4 个技能的内联三分支改指针（消双源）；manual HINT 改为「请新开会话并执行 /X」 | ✅ 2026-09-22 |
| **批 5｜委派契约收紧** | D2 取 **B 案**：D-0.1 体积闸门（`materials` 合计 ≤300 行，超限改换 agent 或降级 inline）、D-0.2 保守策略反转（不确定走 D-1）；默认 subagent 分支纳入闸门；回报契约收紧为 `status` / `artifact_path` / `concerns` 三件，全部 task_type 增强改为「先落盘、只报路径」；`prd/refine` 返回消费与 `output_path` 落点同步；另实现 `auto ⟹ compression ≠ off` 联动校验 | ✅ 2026-09-23 |
| **批 6｜落盘补齐** | H1（待定名落盘，D5）、S2（`prototype/review` 补恢复章节） | ⏳ 待决 |
| **批 7｜措辞与提示语归一** | 层级 A/C 提示语模板统一；5 类压缩点措辞归一；各技能尾部补「恢复清单」四件套 | ⏳ 待决 |
| **批 8｜形态探测增强** | §5.6.3 ②：PPID 进程名 / 平台 env 探测，逐平台实测后进规范 | ⏳ 待决（依批 3 结论） |

> 批次编号已于 2026-09-22 按**实际执行顺序**重排（原表的「批 2 契约收紧 / 批 3 落盘补齐」顺延为批 5 / 批 6），
> 以免与已落地的批次混淆。

**守护**：批 1–4 完成后跑 `npx vitest run test/ts/skills-install.test.ts`（技能 md 禁出现以 `..` 开头的路径字面量）；若触及 prototype 页面机制或脚本判定，另跑两侧 `evals/run.mjs --selftest`。

---

## 七、待决

| # | 问题 | 选项 | 影响面 |
|---|---|---|---|
| **D1** | `auto_transition` 行为 | ✅ **已决并落地（2026-09-22）**：manual（**出厂默认**）⇒ 提示用户新开会话 + 输入技能名；auto ⇒ 按平台动作压缩后自动执行。落法见 §5.6；出厂值 `false` + `context_compression: beta` | 4 个技能 + 配置 + policy |
| **D2** | D-2 内容注入型 | ✅ **已决并落地（2026-09-23）：B 案** —— 新增 D-0.1 体积闸门（`materials` 合计 ≤300 行）+ D-0.2 保守策略反转（不确定走 D-1）。默认 subagent 分支（最常用）一并纳入闸门 | `dispatch-execute.md` + 调用方 |
| **D3** | 单入口技能分段点 | 加可选提示 / 维持现状 | `tweak` / `normal` |
| **D4** | `context-recovery.md` | ✅ **已决并落地（2026-09-22）：删除**（零引用 + 内容为 comet 时代遗留） | 1 个 policy |
| **D5** | 待定名落盘载体 | draft 目录内文件 / workflow pending 字段 | `specify-finalize.sh` + 3 个技能 |
| **D6** | **宿主形态维度** | ✅ **已决（2026-09-22）：A 案** —— `Platform.compressionAction` 按形态分列 + `config.host-form` 显式声明 + `resolveHostForm` 三级链（显式 → 宿主信号 → `unknown` 不猜）+ 注入 `HOST_FORM` / `CONTEXT_COMPRESSION_ACTION`。落法见 §5.6.3；探测手段留批 8 | `platforms.ts` + SessionStart + config + 全部衔接提示语 |

> **D1 / D2 / D4 / D6 已决并落地**（批次进度见 §六）。仍待决：**D3**（单入口技能分段点）、**D5**（待定名落盘载体）。
>
> 出厂默认已定为 `auto_transition: false`（manual）+ `context_compression: beta`。需要连续执行的用户显式设
> `auto_transition: 'auto'`；**配置校验应保证它与 `context_compression: beta` 联动**（不能压缩就不许自动跑）。
