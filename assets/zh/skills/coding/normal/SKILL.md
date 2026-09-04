---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}normal
description: "面向常规需求（P02）的单入口开发流程：一次入口内串行完成轻量澄清（intention）→ OpenSpec 四件套生成 → 双向守门 → 终版细计划 → 合并主审 → 实施 → 出口检查，然后交给 ship 收尾。用户触发 /polaris{{SKN_SPR}}coding{{SKN_SPR}}normal、经 /flow 选择 P02 实现常规功能、或要求实现多模块协作但无需专项设计的功能时必须使用本 skill。不要用于：单模块 / 单文件级简单改动（走 P01 tweak）、跨服务 / 高风险 / 需数据模型或接口契约专项设计的需求（走 P03 完整链路）、出口检查未通过就强行交付、或在本技能内重写已定稿规格的结论。"
version: 0.1
---

# Polaris 工作流 - 常规需求通道（normal）

<HARD-GATE>
本 skill **仅**负责：在**多模块协作、中等风险**范围内，单入口串行完成「轻量澄清 → 四件套生成 → 双向守门 → 终版细计划 → 合并主审 → 实施 → 出口检查」，然后把 `phase` 推到 `ship`，由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` 完成分支收尾与归档。

- **禁止**跳过 Step 1.4 理解确认就写 `intention.md`
- **禁止**跳过 Step 2.1 任务名确认（阻塞点）就 finalize 目录名
- **禁止**跳过 Step 4.4 规格定稿确认（阻塞点）就生成 `tasks.md`
- **禁止**跳过 Step 5 双向守门；**禁止**守门决策未消化就生成 `tasks.md`
- **禁止**生成 `tasks.md` 前未 `read_file ./templates/tasks-template.md`
- **禁止**跳过 `tasks-lint.sh` 或用脑补核对代替
- **禁止**未按 `tasks-template.md` 的任务类型规则自动标注 `<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->`；**禁止**用全局开关把「新功能 / Bug 修复 / 含分支逻辑」类任务标成非 TDD（Test-First 是 Constitution NON-NEGOTIABLE）
- **禁止**用主代理自审冒充合并主审（Step 7）；主审 subagent 不可用时按 `./policies/decision-point.md` 由用户决定，不得 inline 假评审
- **禁止**主代理在 `/opsx:apply` 之外直接编写业务实现代码
- **禁止**调用 `superpowers:subagent-driven-development` / `superpowers:executing-plans`（H13）
- **禁止**跳过 5 个 scorer 或伪造分数；**禁止**未写入 `.polaris/metrics/<timestamp>-metrics.json` 就把 `phase` 推到 ship
- **禁止**本阶段做分支合并 / PR / `/opsx:archive`（那是 ship）
- **禁止**未完成出口校验（Step 9）就写 `build.status` / `verify.status=completed` 或推进 phase
- **H8**（状态行）：每个 Step 入口输出 `[polaris-flow 开发]常规通道 - 进入 normal Step <N>: <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]常规通道 - 进入阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}normal 技能。`

---

## 定位与边界

normal 是 P02（常规功能）的执行体。它把完整链路的 `clarify → propose → design → plan → build → verify` 六段压缩进**一个技能**，但保留 P02 的本质差异：**真实产出 OpenSpec 四件套作为跨模块契约**，并保留**一次独立合并主审**。

| 维度 | tweak（P01） | normal（P02） | 完整链路（P03） |
|------|----------------|----------------------|----------------|
| 适用 | 单模块 / 单文件级、≤ 3 顶层任务、≤ 1 delta spec | 多模块协作、需规格契约、≤ 8 顶层任务 | 跨服务 / 高风险、需专项设计与复盘 |
| 阶段数 | 1 个技能内部跑完 4 步 | 1 个技能内部跑完 10 步 | clarify → propose → design → plan → build → verify → ship（→ retro） |
| 规格产物 | `change-brief.md` + `tasks.md` | **OpenSpec 四件套** + `intention.md` + 终版 `tasks.md` | 四件套 + `detailed-design.md` + 专项设计 |
| 设计 / 评审 | 无独立设计，无主审 | 设计并入四件套 `design.md`；**1 次合并主审**（propose-reviewer） | design 主审 + plan 主审 + 可选 Outside Voice |
| 用户确认 | 3 次 | **~5 次**（理解确认 / 任务名 / 规格定稿 + 条件性的主审消化、出口决策） | ≥ 10 次 |
| workflow 写入 | 仅 1 次（出口推进 ship） | **1 次**（出口推进 ship；升档转交时条件性 +1） | 每阶段 1 次 |
| 收尾 | 交 ship（归档前补齐四件套） | 交 ship（四件套已齐，无需补齐） | 交 ship |
| metrics | 照写 | 照写（retro 趋势不断档） | 照写 |

**刻意不做**：worktree 决策询问、TDD 策略询问、执行方式询问、审查模式询问、brainstorming、专项设计预检、design / plan 独立主审、Outside Voice 询问。这些在常规需求里属于过度流程，且 `decision-point.md` 明确要求「只有一个安全下一步时不得制造确认」。

**刻意保留**（相对 tweak 的加法）：真实四件套（多模块协作需要 specs 作为跨模块契约）、一次独立合并主审（规格错误的多模块返工成本远高于单模块）、双向守门（P02 是三档的中间档，两个方向的错档都要兜住）。

**关键收益**：升 P03 的转交成本为零——四件套已在，`polaris{{SKN_SPR}}coding{{SKN_SPR}}design` 可直接深化 `detailed-design.md`。

## 遵守的 Hard Stops

| ID | 在本 skill 的适用方式 |
|----|---------------------|
| H8 | 每个 Step 入口输出可见状态行 |
| H10 | **条件适用**：仅当用户显式要求 subagent 派发（Step 8.1）或合并主审派发（Step 7.2）时，派发前必须先 `use_skill("polaris{{SKN_SPR}}subagent-probe")` 并传入 `platform`。默认 inline 路径不派发 subagent，不触发本条 |
| H12 | 写 `.polaris/workflow.yaml` 走 `scripts/workflow-entry.sh`（内含 workflow.lock + 写后校验），不自写文件 |
| H13 | 不调用两个 superpowers 派发驱动器 |

## 标识约定

| 项 | 路径 / 值 |
|----|-----------|
| `change_id` | 与 tweak / ship 同值，kebab-case |
| 意图文档（唯一真相） | `openspec/changes/<change_id>/intention.md`（Step 4.2 迁入前在 `.polaris/tasks/<change_id>/`） |
| OpenSpec 四件套 | `openspec/changes/<change_id>/{proposal.md, design.md, specs/, tasks.md}` |
| 合并主审报告 | `openspec/changes/<change_id>/reviews/propose-review-report.md` |
| 运行态 | `.polaris/tasks/<change_id>/state.yaml` |
| 验证报告 | `openspec/changes/<change_id>/reviews/verify-report.md` |
| Metrics | `.polaris/metrics/<timestamp>-metrics.json` |
| workflow 游标 | `.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.sh`） |

> **链路**：`**normal**（轻量澄清 → 四件套 → 双向守门 → 细计划 → 合并主审 → 实施 → 出口检查）→ ship`。
> 本技能不归档、不合分支；**不产** `detailed-design.md` / `<slug>-design.md` / `brainstorm-summary.md`（那是 P03 design 阶段的产物）。

---

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：环境准备 + draft 初始化

使用 SessionStart 注入的路径（本 skill 内此后一律复用 `$REPO_ROOT` / `$PLUGIN_ROOT`）：

- 优先：环境变量 `$PLUGIN_ROOT` / `$REPO_ROOT`
- 兜底：source `.polaris/.cache/runtime-env`
- 仍无 `$PLUGIN_ROOT` → 按 H12 阻断，提示用户重启会话以触发 SessionStart

```bash
if [ -z "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/scripts/task-init.sh" ]; then
  echo "PLUGIN_ROOT unset or hooks missing — restart session to run SessionStart" >&2
  exit 2
fi

INIT_RESULT=$(bash "$PLUGIN_ROOT/scripts/task-init.sh" "$REPO_ROOT" --kind change)
INIT_EXIT=$?
echo "INIT_EXIT=$INIT_EXIT INIT_RESULT=$INIT_RESULT"
```

| `INIT_EXIT` | `status` | 含义 | 后续动作 |
| ----------- | -------- | ---- | -------- |
| 0 | `"ok"` | 成功 | 取 `draft_name`，进入 Step 1 |
| 1 | `"existing"` | 存在未完成 draft | 按决策点协议询问 A/B/C/D（同 clarify Step 1） |
| 2 | —（stderr） | 参数/环境错误 | 按 H12 阻断 |
| 3 | —（stderr） | workflow 写入失败 | 按 H12 阻断 |

`status="existing"` 时按 `./policies/decision-point.md` 暂停：**A 续写最新** / **B 选择指定** / **C 丢弃后重建** / **D 取消退出**。续写场景沿用现有 `change_id`，不算目录冲突。

**状态行（H8）**：`[polaris-flow 开发]常规通道 - 开始轻量澄清：.polaris/tasks/<draft_name>/; workflow: appended entry phase=clarify`

### Step 1：轻量澄清（intention.md）

#### 1.1 消费附加上下文

`/flow` 路由交接的 `附加上下文` 若为文件 / 目录 / 文字说明，**必须先完整读取**再进入 1.2。读取失败或内容与诉求明显无关 → 先回报用户再决定是否继续，不得静默跳过。

#### 1.2 现场勘察

在提问之前先做一次勘察（比 tweak 深一档，因为 P02 是多模块协作）：

- 读目标模块 / 相关模块，grep 跨模块调用方与被调用方
- 确认**模块清单**与**模块间接口边界**（这是四件套 design 的直接输入）
- 识别是否触碰数据实体 / 核心链路（这是 Step 5 双向守门的直接输入）
- 结果记入 intention 的「下游约束」与「结论」节

#### 1.3 加载宪法（注入点 A）

读取 `openspec/memory/constitution.md`（若存在且无占位符），供 intention「宪法对齐」节与 Step 8/9 的注入点 C/D 使用。

#### 1.4 一次理解确认（阻塞点）

基于 1.1 + 1.2 + 用户原始诉求，先输出**理解摘要**（不走多轮盘问），然后按 `./policies/decision-point.md` 暂停。

理解摘要必须覆盖 7 项，缺项不得发问：

| # | 要素 | 内容 |
|---|------|------|
| 1 | 问题与目标 | 要解决什么、期望结果 |
| 2 | 非目标 | 本次明确不做 |
| 3 | 范围边界 | 涉及 / 不涉及的模块、文件、用户、平台 |
| 4 | 验收标准 | 可判定的成功条件（尽量可测） |
| 5 | 方案 | 一句话怎么改（含关键技术选择与**模块协作方式**） |
| 6 | 前提与风险 | 依赖的假设、已知风险 |
| 7 | 影响面 | 模块清单、是否触碰数据实体、是否触碰核心链路 |

发问三选项：

```text
A. 确认 — 按此摘要推进，生成意图文档
B. 需要修正 — 请直接说明要改哪一项（可自由输入）
C. 超出常规需求 — 升到复杂链路（P03）
```

| 用户选择 | 动作 |
|----------|------|
| A | 进入 1.5 |
| B | 修改摘要后**重新发问**；修正轮次 > 2 → 视为需求不稳，记入 Step 5 升档门信号 |
| C | 按 `./policies/tier-gate.md` §2 升档门执行转交（此刻无任何制品，转交成本为零；无 P03 信号也要尊重用户选择） |

**信息不足时**：若诉求模糊到无法形成上述 7 项，**不得臆测填充**——改为一次聚焦追问（**最多 1 轮**，合并成一条消息；多模块协作的边界澄清值得这一轮，但不允许变成盘问），拿到答复后再发理解确认。

#### 1.5 写入 `intention.md`（仍在 draft 目录）

落盘路径：`$REPO_ROOT/.polaris/tasks/<draft_name>/intention.md`

**强制前置**：写入前必须 `read_file ./templates/intention-template.md`，并输出：`[polaris-flow 开发]常规通道：已读取意图模板 intention-template.md`

按模板节顺序填充。内容来源：

| 模板节 | 内容来源 |
|--------|----------|
| Reframe 历程 | 填声明行：`- 常规通道（normal）未执行 Reframe Check；原始诉求 <一句话>` |
| 宪法对齐 | Step 1.3 |
| 前提 / 前提历史 | 1.4 要素 6（前提）；前提历史填「无（normal 通道未执行 Premise Challenge）」 |
| 目标 / 任务范围 | 1.4 要素 1–3 |
| 结论（架构 + 技术选型） | 1.4 要素 5 |
| 备选方案 | 勘察中考虑过但未采用的方案 + 拒绝理由；无则写「无」 |
| 验收场景及标准 | 1.4 要素 4 |
| 待决问题 | 未关闭项；无则写「无」 |
| 下游约束 | Step 1.2 勘察结果（模块清单 / 接口边界 / 数据实体 / 核心链路） |

首行任务标识暂用占位 `# 意图调研结果: <TBD>`，Step 2.2 回填为真实 `change_id`。

> 「下游约束」节不是装饰——它是 Step 5 双向守门与四件套 design 的唯一判定输入。

### Step 2：任务名 + finalize

#### 2.1 任务名确认（阻塞点）→ 得到 `task_id`

按 `./policies/decision-point.md` 暂停，让用户决定任务名（即后续目录名 / `change_id`）。**禁止**静默推断或自动落盘。

约束：`task_id` 必须是 **kebab-case 英文**（小写字母、数字、连字符），如 `add-order-export`。

暂停时必须展示：

- 基于理解摘要派生的 **2–3 个推荐名**，各附一行范围说明
- 「自行输入名称」选项
- 提示：非合规输入（含中文）会转换为 kebab-case，**转换结果须回显并再次确认**

名称与已有 `$REPO_ROOT/.polaris/tasks/` 目录冲突时（续写场景除外），报告冲突并请用户另选。确认后记入会话上下文（此时**尚未** `mv` 目录）。

#### 2.2 敲定目录名并更新 state（finalize）

```bash
FINAL_RESULT=$(bash "$PLUGIN_ROOT/scripts/clarify-finalize.sh" "$REPO_ROOT" "<draft_name>" "<task_id>")
FINAL_EXIT=$?
echo "FINAL_EXIT=$FINAL_EXIT FINAL_RESULT=$FINAL_RESULT"
```

| `FINAL_EXIT` | 含义 | 后续动作 |
| ------------ | ---- | -------- |
| 0 | 成功 | 回填 `intention.md` 首行为真实 `change_id`，进入 Step 3 |
| 1 | 目标目录已存在 | 按 H12 阻断 |
| 2 | 参数/环境错误 | 按 H12 阻断 |
| 3 | workflow rename 失败 | 按 H12 阻断 |

### Step 3：worktree（默认不创建）

normal 默认留在主仓库，不询问。写入 `.polaris/tasks/<change_id>/state.yaml`：

```yaml
worktree:
  created_by_polaris_flow: false
current_verb: propose
```

> 位置刻意放在四件套生成**之前**（对齐 propose 的时序）：worktree 模式下 openspec 产物要落在 worktree 分支上。

用户**显式**要求 worktree 时，创建并同步元信息（ship 的合回逻辑照常生效）：

```bash
WT_RESULT=$(bash "$PLUGIN_ROOT/scripts/worktree-create.sh" "$change_id" "$REPO_ROOT")
WT_EXIT=$?
```

- `WT_EXIT=0` → `$WT_RESULT` 含 JSON（`target_path` / `target_branch` / `snapshot_path`），继续同步
- `WT_EXIT=1` → **阻断**，按 stderr 处理

创建成功后，写入 `.polaris/tasks/<change_id>/state.yaml`（worktree 内路径优先）：

```yaml
worktree:
  created_by_polaris_flow: true
  path: "<target_path>"
  branch: "<target_branch>"
  origin_repo: "<REPO_ROOT>"
  status: active
current_verb: propose
```

同步主仓 workflow.yaml（脚本内含锁 + 写后校验，见 H12）：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind change --skill normal --where-task-id "$change_id" --set phase=propose --set worktree-path="$target_path"
```

输出：`[polaris-flow 开发]常规通道 - worktree：created at <target_path> on branch <target_branch>`

### Step 4：四件套生成（proposal → specs → design）

#### 4.1 创建 change 骨架

**立即执行：** 使用 Skill 工具加载 `opsx:new` / `openspec-new-change`。禁止跳过此步骤（否则 `openspec/changes/<change_id>/` 目录不合法，ship 的 `openspec-cn archive` 会失败）。

#### 4.2 迁入 `intention.md`（唯一真相）

```bash
mv "$REPO_ROOT/.polaris/tasks/$change_id/intention.md" \
   "$REPO_ROOT/openspec/changes/$change_id/intention.md"
```

确认 `.polaris` 侧已不存在、目标路径存在且非空。**禁止**在 `.polaris` 保留 intention 副本。

输出：`[polaris-flow 开发]常规通道 - 意图：moved to openspec/changes/<change_id>/intention.md（.polaris 无备份）`

#### 4.3 生成 `proposal.md` / `specs/` / `design.md`

**强制前置**：`read_file ./templates/design-template.md`，并输出：`[已 read_file templates/design-template.md]`

**`intention.md` 节 → 四件套映射**（与完整链路 propose 的映射一致）：

| `intention.md` 节 | 写入位置 | 要求 |
|---|---|---|
| `## Reframe 历程` | `proposal.md` 的 Why / Context | 必须包含 |
| `## 目标` | `proposal.md` 的目标相关节 | 必须包含 |
| `## 任务范围` | `proposal.md` 范围 / 非目标 | 必须包含 |
| `## 待决问题` | `proposal.md` 的 Open Questions / 待决 | 必须包含 |
| `## 验收场景及标准` | `specs/` 需求与场景依据（GWT 格式） | 必须体现 |
| `## 宪法对齐` | `design.md` 的 `## Constitution Alignment` | 必须包含 |
| `## 前提` | `design.md` 的 `## Premises` | 必须包含 |
| `## 结论（架构 + 技术选型）` | `design.md` 的 Architecture / 选型相关节 | 必须包含 |
| `## 备选方案` | `design.md` 的 `## Alternatives` | 必须包含 |
| `## 下游约束` | `design.md` 的模块划分 / 接口 / 数据流 | 必须体现 |

**`design.md` 深度边界**（P02 与 P03 的本质差异）：

- **包含**：架构决策、模块 / 领域划分、模块间接口契约、数据流、异常与风险策略
- **禁止**：生成 `detailed-design.md`、生成 `<slug>-design.md` 专项设计、跑 brainstorming、做专项设计预检——发现确实需要时记录信号，交 Step 5 升档门判定

`specs/` 场景格式（验收标准逐条转写为 GWT）：

```markdown
## ADDED Requirements

### Requirement: <验收标准标题>
<一句话描述>

#### Scenario: <场景名>
- **WHEN** <触发条件>
- **THEN** <期望结果>
```

#### 4.4 规格定稿确认（阻塞点）

按 `./policies/decision-point.md` 暂停：

> 请**仔细**阅读完整规格四件套（proposal.md：目标与范围；specs/：验收场景；design.md：架构与模块接口），**审查**后确认是否可以据此定稿规格并生成任务计划？
>
> （请回复「确认 / ok / 同意」等明确整体确认；若仅对某条目有意见，请直接指出以便修改）

| 用户回复 | 判定 | 后续动作 |
| -------- | ---- | -------- |
| 明确整体确认 | 完成 | 进入 Step 5 |
| 仅对某条/某节反馈 | **不算确认** | 修改后**重新发问** |
| 模糊回复（「差不多」「可以吧」） | **不算确认** | 必须再问一次明确确认 |
| 沉默 / 无回复 | **不算确认** | 同上 |

**禁止**把 Step 1.4 的「确认」当作本步整体确认。**定稿后禁止**在后续步骤静默重写规格结论；发现规格缺陷 → 暂停回报用户，经确认后修订并重跑受影响的下游步骤。

### Step 5：双向守门（阻塞点，命中才发问）

`read_file ./policies/tier-gate.md`，按其执行：

1. **降档门**：命中 P01 判定门（单模块、≤ 1 delta spec、≤ 3 顶层任务可覆盖、无接口契约 / 数据实体变更）→ decision-point **A 降到 tweak** / **B 继续 normal 并记录**
2. **升档门**：命中任一 P03 信号（跨服务、需专项设计、数据迁移、破坏性契约变更、顶层任务 > 8、需求不稳、高危领域）→ decision-point **A 升到 P03** / **B 继续 normal 并记录**
3. **两门均未命中** → 直接进入 Step 6，无需询问

转交动作（选 A 时）按 `tier-gate.md` §1.3 / §2.3 执行，本 skill 结束。

> 位置刻意放在**规格定稿之后、细计划之前**——此刻制品 = intention + 四件套，尚未投入 tasks 细化与实施，双向转交成本最低。

### Step 6：生成 `tasks.md`（终版细计划）

#### 6.1 读取模板

**强制前置**：`read_file ./templates/tasks-template.md`，并输出：`[已 read_file templates/tasks-template.md]`

与完整链路的关键差异：propose 产出的是**粗骨架**（等 plan 覆写），normal **没有独立 plan 阶段**，因此必须一次写成**可执行细计划**——含 Files / Interfaces / 可直接复制的验证命令。

#### 6.2 规模硬约束

- **顶层任务 ≤ 8**（文档同步组不计入）。推导中发现需要 > 8 个顶层任务 → **停止生成**，回到 Step 5 升档门（命中 D5）
- 任务划分以四件套 `design.md` 的模块划分为依据，跨模块任务必须写明接口依赖（Consumes / Produces）

#### 6.3 tasks lint

```bash
LINT_RESULT=$(bash "$PLUGIN_ROOT/scripts/tasks-lint.sh" "openspec/changes/$change_id/tasks.md")
LINT_EXIT=$?
```

- exit 0 → 通过
- exit 1 → **阻断**，输出 `$LINT_RESULT`，修正后重跑

#### 6.4 状态写入

```yaml
normal:
  mode: normal
  status: in_progress
  tdd_mode: auto_by_task_type
  build_mode: inline        # 或 subagent_dispatch（仅用户显式要求）
  signals: []               # 命中的守门信号（Step 5 选 B 时记录）
current_verb: build
build:
  status: in_progress
  build_mode: inline
```

输出：`[polaris-flow 开发]常规通道: change_id=<change_id> ; worktree=main ; tasks=<N> 顶层任务`

### Step 7：合并主审（阻塞点）

P02 相对 tweak 的核心加法：规格 + 细计划经**一次独立主审**（复用 `propose-reviewer`，评审对象天然就是四件套 + intention）。不做 design / plan 独立主审，不询问 Outside Voice。

#### 7.1 机械终检

**禁止脑补替代**，逐项校验：

1. **四件套存在且非空**：`proposal.md`、`design.md`、`tasks.md` 非空；`specs/` 为目录且含至少一个非空文件
2. **`proposal.md`**：含问题背景、目标、范围、非目标
3. **`design.md`**：含架构决策、方案选型，且含 `## Constitution Alignment`、`## Alternatives`、`## Premises`
4. **`tasks.md`**：任务有明确描述且 Step 6.3 lint 已通过

任一失败 → 回 Step 4.3 / 6.2 补齐，不得进入 7.2。

#### 7.2 派发主审 — `propose-reviewer`

1. **probe**：`use_skill("polaris{{SKN_SPR}}subagent-probe")`（传入 `platform`）。返回 `inline` / `unsupported` → 标注并 decision-point：**A 接受跳过主审（记录原因）** / **B 阻断**。不得 inline 假评审。
2. **派发**：`propose-reviewer`（init 已装到 `.<platform>/agents/`）。缺失 → 阻断，提示 `polaris-flow init/update`。派发执行按 probe 返回的平台能力选择形态：
   - **路径引用型**（agent 可自读文件）：`materials` 传路径清单
   - **内容注入型**（agent 无法读文件）：主代理 Read 全部全文拼入 `Materials:` 段
3. **传入参数**：

   - `stage_fields`:
     ```text
     Change: <change_id>
     Batch: all
     ReviewMode: after_all
     Frozen: none
     ```
   - `materials`（按序）：
     1. `openspec/changes/<change_id>/proposal.md`
     2. `openspec/changes/<change_id>/design.md`
     3. `openspec/changes/<change_id>/specs/**/*.md`（每个非空文件）
     4. `openspec/changes/<change_id>/tasks.md`（**终版细计划**，非粗骨架——须在派发 prompt 中注明）
     5. `openspec/changes/<change_id>/intention.md`

4. **落盘**：确保 `openspec/changes/<change_id>/reviews/` 存在；写入 `openspec/changes/<change_id>/reviews/propose-review-report.md`

#### 7.3 消化

1. 主审 `Verdict`：`BLOCK` / 未消化 Critical → **禁止**进 Step 8；修订四件套 / tasks（必要时回 Step 4.3 / 6.2）→ 重跑 **7.1 + 7.2**（**最多 3 轮**）
2. `APPROVE_WITH_CONCERNS` → decision-point 确认或修订
3. 消化完成后写入 state：

```yaml
propose:
  status: completed
  review_report: openspec/changes/<change_id>/reviews/propose-review-report.md  # 或 skipped:<reason>
  review_mode: merged
  outside_voice: not_run:p02-compressed
  finished_at: "<ISO>"
```

### Step 8：实施

#### 8.1 执行方式（默认 inline，不询问）

默认 `build_mode=inline`：主代理在本会话内执行 `/opsx:apply`。**不发起询问**（常规需求问执行方式属于过度确认）。

仅当用户**显式**要求 subagent 时：

1. 必须先 `use_skill("polaris{{SKN_SPR}}subagent-probe")`，传入 `platform`（H10）
2. 按 probe 返回值选 agent，再按 `polaris{{SKN_SPR}}subagent-dispatch` 派发
3. probe 返回 `degradation=inline|unsupported` → 强制回退 inline，输出原因

#### 8.2 Constitution 注入点 C

在每个 task 的实施动作**之前**，必须输出一行：

```text
[Constitution C] Task <N.M>: 适用原则 = <从 openspec/memory/constitution.md 识别的相关 Core Principle>
```

inline 与 subagent 分支同样适用（subagent 分支须写入启动 prompt）。

#### 8.3 执行 apply

调用 `/opsx:apply <change_id>`。

- **禁止**在 `/opsx:apply` 之外手写业务实现代码（补丁、新模块、改 API）
- **禁止**用全局开关覆盖 `tasks.md` 内的 `<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->` 标注
- **禁止**借机重写四件套的目标与范围结论；发现计划缺陷 → 暂停回报用户，不静默改 Scope

#### 8.4 apply 中途 pause / error

- **paused**：按 apply 给出的原因与选项，用 decision-point 问用户；用户选继续 → 再次 `/opsx:apply`
- **errored**：阻断，报告错误；不写 `build.status=completed`

#### 8.5 轻量代码审查（固定 `standard`，不询问）

apply 完成后跑**一次** `superpowers:requesting-code-review`，范围 = 本次 diff + `tasks.md` + 测试结果，只查正确性 / 安全 / 边界。

| 发现级别 | 处理 |
|----------|------|
| CRITICAL | **阻断**，回 8.3 修复 |
| IMPORTANT | 不阻断本步，但必须记入 `reviews/verify-report.md`，并在 Step 9.4 由用户逐条决策 |
| 技能不可用 | 标注跳过原因，记入报告；不阻断 |

### Step 9：出口检查

`read_file ./policies/exit-check.md` 并按其执行，包含四部分：

1. **6 项检查**（tasks 勾完 / 改动一致 / 构建通过 / 测试通过 / 无明显安全问题 / **specs 验收场景可追溯**——对照 `specs/` 的 Requirements + Scenarios，非 change-brief）
2. **Constitution 合规审计**（注入点 D，轻量版，按 `./policies/constitution-audit.md`）
3. **5 个 scorer + metrics 落盘**（`.polaris/metrics/<timestamp>-metrics.json`，格式与 verify 完全一致）
4. **写 `reviews/verify-report.md`**

**硬阻断（不得推进 phase）**：

- 任一 CRITICAL 未解决
- `exit-check.md` 定义的 metrics 文件未写入
- `verify-report.md` 未落盘

失败决策的严重程度判定、重试上限（3 轮后收敛为两选项）、不确定性原则（宁可标轻）均按 `exit-check.md` 执行，与 verify 保持一致。

### Step 10：状态批量补写 + 推进 ship

出口校验全部通过后，**一次性**完成所有状态写入——与 tweak 同款模式：中间不推 phase，全程只有这一 workflow 写。

```yaml
normal:
  status: completed
  finished_at: "<ISO>"
propose:
  status: completed
  review_report: openspec/changes/<change_id>/reviews/propose-review-report.md
  review_mode: merged
  outside_voice: not_run:p02-compressed
  finished_at: "<ISO>"
build:
  status: completed
  build_mode: <inline|subagent_dispatch>
  review_mode: standard
  final_review: <done|skipped:<reason>|accepted_risk>
  completed_tasks: <N>
  total_tasks: <N>
  finished_at: "<ISO>"
verify:
  status: completed
  constitution_valid: <true|false>
  overall_score: <N>
  score_level: <high|low>
  verify_mode: light
  blocked: false
  verification_report: "openspec/changes/<change_id>/reviews/verify-report.md"
  scorer_results: { ... }
  finished_at: "<ISO>"
current_verb: idle
```

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind change --skill normal --where-task-id "$change_id" --set phase=ship
```

输出：

```text
常规通道完成：
  change_id : <change_id>
  specs     : openspec/changes/<change_id>/{proposal.md, design.md, specs/, tasks.md}（四件套已齐）
  review    : openspec/changes/<change_id>/reviews/propose-review-report.md（合并主审）
  score     : <overall_score> (<score_level>)
  report    : openspec/changes/<change_id>/reviews/verify-report.md
下一步建议 /polaris{{SKN_SPR}}coding{{SKN_SPR}}ship（四件套已齐，无需补齐，直接归档）。
```

---

## TDD 策略：为什么这里不询问

完整链路在 plan 阶段会询问 `prefer_tdd / require_tdd / prefer_direct`。normal **不询问**，改为按 `tasks-template.md` 的规则**逐任务自动判定**：

- 新功能 / Bug 修复 / 含分支逻辑 → `<!-- TDD 任务 -->`（5 步）
- 配置修改 / 重命名 / 文档更新 / 依赖升级 / 构建脚本 / 脚手架 → `<!-- 非 TDD 任务 -->`（3 步）
- 无法判定 → **默认 TDD**

理由：Constitution 里 Test-First 是 `NON-NEGOTIABLE`。若用全局开关把新功能标成非 TDD，会在 Step 9 的 Constitution 审计上直接撞 Critical。normal 的「省事」来自**少切换、少确认**，不是来自降低测试纪律；≤ 8 个顶层任务的规模上限保证了 TDD 成本可控。

## 上下文压缩恢复

重载：`change_id`、draft 是否已 finalize、`intention.md` 当前所在路径、四件套是否已落盘并定稿、顶层任务数与勾选进度、`normal.*` / `propose.*` / `build.*` / `verify.*`、本 skill 停在哪一步。

| 中断位置 | 恢复动作 |
|----------|----------|
| Step 1.4 / 2.1 / 4.4 | 从该决策点续，不得跳过确认 |
| Step 5 守门 | 重跑守门判定（四件套内容未变则结论不变） |
| Step 6.3 lint 失败 | 修 `tasks.md` 后重跑 lint，勿重生成整份 |
| Step 7 主审未消化 | 先完成消化，勿无故重跑主审或整段 4.3 |
| Step 8.3 apply pause | 从 8.3 续，勿重选模式 |
| Step 9 失败决策 | 从决策点续，勿重跑已通过的检查项 |
| Step 10 之后 | 只补 ship 交接，勿重跑 apply |

## 退出条件

- `intention.md` 已迁入 `openspec/changes/<change_id>/`，`.polaris` 无副本
- 四件套存在且 Step 7.1 机械终检通过（含 `tasks-lint`）
- Step 7.2 合并主审已派发（或用户接受 SKIPPED 并记录原因）且无未消化 Critical
- `tasks.md` 全部 checkbox 为 `- [x]`
- 5 个 scorer 已跑完，`.polaris/metrics/<timestamp>-metrics.json` 已写入且含 `change_id`
- `reviews/verify-report.md` 存在且 `verify.verification_report` 指向它
- 无未解决的 CRITICAL；IMPORTANT 已逐条决策
- `build.status` / `verify.status=completed`，且 `phase=ship`

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行。关键命令：

```bash
node polaris-flow state next <change-name>
```

- `NEXT: auto` → 调用 `SKILL` 指向的 skill 进入下一阶段
- `NEXT: manual` → 不要调用下一 skill，按 `HINT` 提示用户手动运行 `/<SKILL>`
- `NEXT: done` → 流程已完成，无需继续
