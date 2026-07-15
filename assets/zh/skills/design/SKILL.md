---
name: design
description: "用户触发 /polaris-flow:design 或要求进入设计阶段时必须使用本 skill。负责深化设计"
---

# 深度设计(design)

<HARD-GATE>
本 skill **仅**负责把propose阶段的design.md深化设计形成详细实现方案。
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入阶段: design — 使用 polaris-flow:design skill。`

## 前置条件

- 活跃 change 已存在（proposal.md、design.md、tasks.md）
- 无 Design Doc（`docs/superpowers/specs/` 下无对应文件）

> 职责边界：propose 阶段的 `design.md` 给出**高层方案框架**（架构决策方向、方案选型、数据流）；design 阶段的 Design Doc 是对它的**深度技术细化**（详细实现设计、技术风险、测试策略、边界条件），是深化而非替代或重写。

---

## 流程（按顺序执行，每一步未完成不得进入下一步）

### Step 0: 入口状态验证（Entry Check）


### Step 1: 读取Openspec文档
读取当前Change的 OpenSpec 阶段产物：
- `proposal.md`：目标、动机、范围、非目标
- `design.md`：高层架构决策、方案约束
- `tasks.md`：初始任务边界
- `specs/*/spec.md`：delta 能力规格：

### Step 2: 执行 Brainstorming（带上下文）

#### 2.1 brainstorming深入设计

**立即执行：** 使用 Skill 工具加载 Superpowers `brainstorming` 技能。禁止跳过此步骤。

```bash
CONFIG_FILE="$REPO_ROOT/.polaris/config.yaml"
LANGUAGE="$(cat "$CONFIG_FILE" | grep "language" | awk -F'"' '{print $2}')"

技能加载时，ARGUMENTS 必须包含：

```text
Language: $LANGUAGE
```

技能加载后，按其指引使用以下上下文：

```text
Change: <change-name>
OpenSpec Context : openspec/changes/<name>/*.md

OpenSpec 产物是上游事实源，但不得用“跳过重复上下文探索”削弱 Superpowers `brainstorming` 的澄清流程。
你的任务是基于 OpenSpec 文档做深度技术设计：实现方案、技术风险、测试策略、边界条件。
如发现目标、范围、非目标、验收场景或关键约束仍不清楚，必须先继续提问并形成设计方案，不得只进行一轮问答就创建 Design Doc。
不要重写 proposal/spec；如发现 OpenSpec delta spec 缺少验收场景，只能提出 Spec Patch，并回写 OpenSpec delta spec；不要在 Design Doc 中创建第二份需求 spec。
Spec Patch 仅限于补充验收场景、修正歧义描述或添加边界条件，不得大幅重写 delta spec 的结构或范围——如需大幅修改，应标记为设计发现并回到 brainstorming 确认。

Design Doc frontmatter 必须最小化，只包含：
---
change: <change-name>
role: technical-design
canonical_spec: openspec
---

按 Superpowers `brainstorming` 技能原流程推进：澄清问题、2-3 个方案、分段确认设计。不得提前写入 Design Doc。
```

禁止在未加载该技能的情况下继续。

如 Superpowers `brainstorming` 技能不可用，停止流程并提示安装或启用 Superpowers 技能，不要用普通对话替代该步骤。

技能加载后，按其指引产出设计方案（以对话形式呈现）：
- 技术方案：架构、数据流、关键技术选型与风险
- 测试策略
- 需求/范围缺口与需回写的 Spec Patch
- 如需补充验收场景，标明将回写的 delta spec 变更

brainstorming 阶段不写入 Design Doc 文件，仅产出设计方案供 Step 1c 用户确认。确认后才创建 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` 并回写 delta spec。

但为了上下文压缩恢复，brainstorming 过程中必须增量更新 `brainstorm-summary.md`。每轮澄清或方案迭代后，只要产生新的已确认事实、关键约束、候选方案、取舍/风险、测试策略或 Spec Patch 候选，就更新该文件；未确认内容必须标注为“待确认”或“候选”。该文件是恢复检查点，不是 Design Doc，也不得替代 Step 1c 的用户确认。

#### 2.2 用户确认设计方案（阻塞点）

brainstorming 产出设计方案后，**必须按 `/reference/decision-point.md` 的协议暂停并等待用户明确确认设计方案**。不得在用户确认前创建最终 Design Doc、写入 `design_doc`、运行 design guard，或进入 `/polaris-build`。

暂停时只展示必要摘要：
- 采用的技术方案
- 关键取舍与风险
- 测试策略
- 如有 Spec Patch，列出将回写的 delta spec 变更

用户明确确认后，才继续 Step 3。若用户要求调整，继续 brainstorming 迭代，直到用户确认。

### Step 3: 创建 Design Doc
#### 3.1 落盘设计文档

基于 brainstorming 对话的完整上下文（仍在主 session 中），创建 Design Doc。

Design Doc frontmatter 必须最小化：

```yaml
---
comet_change: <change-name>
role: technical-design
canonical_spec: openspec
---
```

将 Design Doc 写入 `opensepc/changes/$CHANGE_ID`， 命名为`detailed-design.md`。
如需回写 delta spec（Spec Patch），同时编辑对应的 `specs/*/spec.md`。

#### 3.2 落盘专项设计文档（阻塞点）

询问用户是否还需要生成专项设计文档，如果用户选择“是”，则提供给用户以下选项供用户选择，选项包括：
- 「领域」 - 设计领域模型、领域服务
- 「仓储服务」 - 设计仓储服务(数据持久化无关的仓储服务)
- 「数据模型」 - 设计ER关系图、数据表、数据库迁移脚本（包括回滚脚本）
- 「Rest API」 - 设计Web 交互API接口
- 「其他」

以上选项可以多选：
1. 除「其他」外，上述列举选项均是可选项，根据实际情况哪项不涉及就不显示给用户选择。
2. 「其他」选项是由用户手工填写需要的专项设计文档。

用户选择后，根据选择的类别来生成专项设计文档（过程中尝试加载匹配的技能）。

#### 3.3 主动式上下文压缩

完成 Step 3.2 并确认设计文档已写入后，进入主动式上下文压缩。此时 brainstorming 文档已落盘，应主动释放前面读取 Spec 和 brainstorming 消耗的上下文，为 Step 4 及后续 Build 阶段保留窗口。

执行规则：
- 如果当前平台提供原生上下文压缩/清理机制（例如宿主 Agent 的 compact/compaction 命令、工具或 UI 操作），必须在这里触发一次主动压缩；不要尝试用 shell 脚本伪造压缩命令。
- 压缩恢复提示必须包含 change 名称、当前步骤（Design Step 2）、以及上方三类需重新加载的 handoff 文件。
- 如果当前平台无法由 agent 程序化触发压缩，必须暂停并提示用户在宿主平台执行手动压缩；用户确认无法压缩或要求继续时，才继续 Step 2。

### Step 4: 评审

<HARD-GATE>
禁止修改提案材料（proposal.md / design.md / specs/ / tasks.md）——本 skill 仅做评审，结论写入 review-report.md。当存在未消化的 Critical / Important 问题时禁止把 STATUS 标记为 DONE。critical-tier 变更禁止跳过 Outside Voice（cross-review-agent）。
</HARD-GATE>

#### 4.0 Overview

工程经理模式的计划/提案评审 skill。在写代码之前，锁定架构、数据流、测试覆盖、性能。以"找漏洞而非走流程"为目标，以"一问一议"的方式与用户交互逐项落实。**宿主中立**（subagent 启动方式由 `./references/host-adapters.md` 按宿主分发）；**模型可配置**（跨模型交叉评审用的 subagent 模型在 `config.yaml: challenger.model` 由用户声明，不在 agent 文件 frontmatter 中硬编码）；**业务工作流解耦**——本 skill 只接受"提案材料路径 + 输出路径"作为输入，业务概念由调用方（如 easy-flow lock 链）按 `./references/caller-contract.md` 履约。

**流程总览**

```
读 config → Step 0 范围挑战 → Section 1-4 顺序评审 → Outside Voice → 必需输出 → 写 review-report.md
```

每个阶段的"做什么"在对应 policy 文件，本 SKILL.md 仅承载入口、HARD-GATE 锚点与跨阶段衔接。

#### 4.1 配置加载

进入 skill 后首先读项目根 `config.yaml`（缺失则全部走 `config.example.yaml` 给出的默认值，跳过加载并在评审报告开头记一行"使用默认配置"）。可配置项摘要：`challenger.{enabled, model, prompt_mode, share_user_decisions}` / `scope_challenge.{max_files, max_new_services}`。配置缺失**不阻断**。

#### 4.2 范围挑战（Scope Challenge）

`read_file ./policies/scope-challenge.md` 并按其执行：6 个子节（已有代码盘点 / 最小改动集 / 复杂度检查 / 搜索检查 / TODOS 交叉引用 / 完整性检查）。复杂度命中阈值（默认 8+ 文件 或 2+ 新服务）→ 主动 `ask_followup_question` 提议 scope reduction，等待用户答复后继续；未命中 → 直接进 Section 1。

**关键铁律**：一旦用户接受/拒绝 scope reduction，**完全 commit**——后续评审节绝不再重提缩减建议。

#### 4.3 Section 1-4：四节评审

`read_file ./policies/four-section-review.md` 并按其执行四节顺序评审：架构 → 代码质量 → 测试 → 性能。

**STOP 规则**：每节内"一问一议"——每个发现单独发起一次 `ask_followup_question`，**不打包**（详见 `./references/output-format.md` 第 3 节）。只有当本节所有问题都已被用户决策（A/B/C 之一，或显式跳过）后，才进入下一节。

测试评审完整方法论（7 步法、E2E vs Unit 决策矩阵、回归测试铁律、ASCII 覆盖率图）见 `./references/test-review-methodology.md`，是本 skill 最重的一节。

#### 4.4 Outside Voice — 独立交叉评审

四节评审完成后,**必须先询问用户是否进入交叉评审**,并基于本次变更的实际复杂度给出建议:

```
通过 ask_followup_question 询问:

🔍 主评审已完成。是否启动 Outside Voice 独立交叉评审?

建议: <根据 openspec 四件套中的改动范围与任务复杂度判断>
  - 涉及多模块/跨层架构/高风险接口变更/任务数≥5 → "强烈建议(变更范围大、复杂度高)"
  - 单模块变更/中等任务量 → "建议(有一定复杂度,交叉评审有助于发现盲区)"
  - 纯配置/文档/单文件小改动 → "可跳过(变更简单,交叉评审收益有限)"

A. 启动交叉评审
B. 跳过,直接完成 lock
```

用户选 B → 在 review-report.md Completion Summary 标注 `Outside Voice: skipped (user decision)`，跳到"必需输出"节。
用户选 A → 继续下方启动流程。

通过宿主原生 subagent 机制启动一个独立的 challenger，用与主评审**不同的模型**对提案材料做第二次评审。详细启动方式、输入构造、可信度门禁：先 `read_file ./policies/outside-voice.md` 并按其中规定执行。

challenger 先 `read_file ./references/host-adapters.md` 并按其中规定通过宿主原生 subagent 机制直接派发 `cross-review-agent`（由 session-start 注册到宿主 agent 目录，无需经 selector 选择）。

##### 宿主不支持 subagent 时的行为

直接跳过 Outside Voice 节，在 review-report.md 的 Completion Summary 标注 `Outside Voice: not run (host lacks subagent capability)`。**不再支持 inline 降级**——同 context 注入 challenger prompt 的独立性已被实证不可靠，效果优先原则下宁可不跑也不假跑。

#### 4.5 必需输出

**强制前置**：写 review-report.md 前必须 `read_file templates/review-report-template.md`，并输出 `[easy-flow lock] 已 read_file templates/review-report-template.md`。**禁止**未读模板就写报告。

先 `read_file ./references/output-format.md`。评审完成后，以下章节缺一不可（详细格式见其中规定）：

1. **NOT in scope** — 显式推迟的工作清单
2. **What already exists** — 现有代码盘点
3. **Failure modes** — 失败模式表 + critical gap 清单
4. **Worktree 并行化策略** — 仅在多条独立工作流时产出，否则一句话"顺序实施，无并行机会"
5. **Completion Summary** — 评审完成摘要表
6. **STATUS** — 四选一（DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT）

**Unresolved Decisions**：用户跳过/打断/未答某 `ask_followup_question` 时**绝不静默默认某选项**，在 Completion Summary 末尾单列「未解决的决策」章节（详见 `./references/output-format.md` 第 7 节）。

**Escalation**：任务尝试 3 次失败 / 安全敏感不确定 / 范围超出可验证能力 → STOP 并升级，使用 STATUS: BLOCKED 或 NEEDS_CONTEXT 格式。**烂工作比没工作糟。** 详见 `./references/output-format.md` 第 8 节。

#### Step 5：值

#### 2.1 细化任务计划（Subagent Offload）

通过 subagent 创建实施计划，避免 planning skill 占用主 session 上下文。计划文件和执行反馈必须使用 `"$COMET_BASH" "$COMET_STATE" get <name> language` 读取到的 Comet 配置产物语言。

**Subagent 指令**：

你是实施计划专家。基于以下输入创建实施计划：

1. **立即执行：** 使用 Skill 工具加载 Superpowers `writing-plans` 技能。禁止跳过此步骤。技能加载后，ARGUMENTS 必须包含：`Language: 使用 "$COMET_BASH" "$COMET_STATE" get <name> language 读取到的 Comet 配置产物语言输出`
2. 读取 Design Doc（`docs/superpowers/specs/` 下的技术设计文档）
3. 读取 `openspec/changes/<name>/tasks.md`（任务边界）
4. 按技能指引创建计划

计划要求：
- 保存至 `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- 引用设计文档，拆分为可执行任务
- **Plan 文件头必须包含关联元数据**：

```yaml
---
change: <openspec-change-name>
design-doc: docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
base-ref: <git rev-parse HEAD before implementation>
---
```

`base-ref` 用于验证阶段跨提交统计改动规模。创建计划时先记录当前提交：

```bash
git rev-parse HEAD
```

将计划写入文件后，返回文件路径。

**执行 subagent**：使用当前平台的 subagent 调度机制派发上述任务。

Subagent 完成后：
- 若返回有效文件路径且文件存在，记录为 plan
- 若 subagent 失败或返回路径无效，在主 session 内联加载 Superpowers `writing-plans` 技能创建计划（降级回退）

#### 2.2 更新计划状态并提供 plan-ready 暂停点
先记录 plan 路径：

```bash
node "$COMET_STATE" set <name> plan docs/superpowers/plans/YYYY-MM-DD-feature.md
```

无需手动更新 phase，阶段守卫（guard `--apply`）会在退出条件满足后推进 `phase` 字段。

计划写入后，立即提供一个新的用户决策点：

| 选项 | 行为 | 说明 |
|------|------|------|
| A | 继续执行 | 保持在当前模型中，进入 Step 3 选择工作区隔离、执行方式、TDD 模式和代码审查模式 |
| B | 暂停切换模型 | 记录 `build_pause: plan-ready`，本次 `/comet-build` 停止，用户稍后可从 `/comet` 或 `/comet-build` 恢复 |

这是用户决策点。**必须按 `comet/reference/decision-point.md` 的协议暂停并等待用户明确选择**，不得自动继续，也不得把暂停写入 `build_mode`。

用户选择继续时：

```bash
node "$COMET_STATE" set <name> build_pause null
```

用户选择暂停时：

```bash
node "$COMET_STATE" set <name> build_pause plan-ready
```

设置 `build_pause: plan-ready` 后，当前调用停止。不要选择 `isolation` 或 `build_mode`，不要加载执行技能。

#### 2.3 评审计划

>>>>>>>>>>>


### Step 5: 完成深度设计阶段

#### 5.1 更新状态

先记录 design_doc 路径。如果 Spec Patch 回写了 delta spec（新增或修改了 `specs/*/spec.md`），必须重新生成 handoff 以更新 hash：

```bash
# 记录 design_doc 路径
node "$COMET_STATE" set <name> design_doc docs/superpowers/specs/YYYY-MM-DD-topic-design.md

# 如有 delta spec 变更，重新生成 handoff（更新 hash）
node "$COMET_HANDOFF" <change-name> design --write

# 阶段守卫推进 phase 到下一阶段
node "$COMET_GUARD" <change-name> design --apply
```

如果没有 delta spec 变更，跳过 handoff 重新生成步骤。状态文件自动更新，无需手动编辑其他字段。

#### 5.2 输出完成状态行

输出 `[polaris-flow] design 阶段完成：.polaris/changes/<change_id>/detailed-design.md 已锁定。` 并提示下一步 `/poflo:build`。

## 退出条件

- Design Doc 已创建并保存
- Design Doc frontmatter 包含 `comet_change`、`role: technical-design`、`canonical_spec: openspec`
- `handoff_context` 和 `handoff_hash` 已写入 `.comet.yaml`（由 guard 强制校验）
- `handoff_hash` 与当前 OpenSpec open 阶段产物一致（由 guard 强制校验）
- `design-context.md` 或 beta `spec-context.md` 必须是脚本生成，且包含 source path、mode、sha256 等可追溯标记（由 guard 强制校验）
- beta 模式下，`spec-context.json` 必须结构合法且引用当前源文件（由 guard 强制校验）
- 如有新能力或补充验收场景，OpenSpec delta spec 已创建/更新
- `design_doc` 已写入 `.comet.yaml`
- **阶段守卫**：运行 `node "$COMET_GUARD" <change-name> design --apply`，全部 PASS 后由守卫推进到 `phase: build`（此步骤更新 `phase` 字段，与 `auto_transition` 无关）

退出前必须使用 `--apply`：

```bash
node "$COMET_GUARD" <change-name> design --apply
```

## 上下文压缩恢复

按 `comet/reference/context-recovery.md` 执行，phase 参数为 `design`。


