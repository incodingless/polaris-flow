---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}specify
description: "把用户需求经澄清与确认后落地为 intention.md。当用户要求澄清需求、理清「要做什么」、把一句话需求展开成结构化需求文档时使用。不要用于：生成提案四件套（走 plan）、写实施计划（走 tasks）、写代码（走 build）。"
version: 0.1
---
# Polaris 工作流 - 阶段1：澄清

<HARD-GATE>
本 skill **仅**负责把用户需求经过结构化讨论后落地为 `intention.md`。

**下列 4 条探索类禁令只适用于 `normal` / `strict` 档**（`tweak` 档走轻量调研，见 Step 3 的档位分派 —— **本档豁免，非缺失**）：

- **禁止**跳过 openspec-explore 强制交互（≥3 个探索性问题 + 等待用户回答 + 覆盖 ≥3 类）
- **禁止**跳过 Reframe Check（`./policies/reframe-check.md` 第 1 节）
- **禁止**跳过设计决策 Options（`./policies/reframe-check.md` 第 2 节）
- **禁止**跳过 Premise Challenge（`./policies/premise-challenge.md`）

**下列两条对三档一律适用**：

- **禁止**未拿到用户对 **intention.md 全文** 的整体确认就标记本阶段完成
- **禁止**未读取 `./templates/intention-template.md` 就生成 `intention.md`（Step 4 强制前置）

**档位消费者**：本技能**只读** `workflow.mode`（由 `intake` 落盘），**不覆盖它**；
唯一的档位变更发生在**本技能的出口**（Step 5.5），且**过了出口即冻结**。
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]澄清需求 - 进入澄清阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}specify 技能。`

---

## 前置条件

- 无在途的 coding 任务，或用户希望新建 / 续写一个 change
- 已有在途任务时**不阻断**：Step 1 会读回它在途状态，决定**接手**（本技能正是它该跑的阶段）还是**转交**给正确的技能

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：设置产物语言

**执行**：`LANG=$(bash "$PLUGIN_ROOT/scripts/get-language-name.sh")`（输出语言显示名，如 `中文` / `English`）；退出码 `≠ 0` 时回退到当前用户请求语言。

本阶段所有提问、澄清摘要、`intention.md` 均以 `$LANG` 为主语言。

### Step 1：接收 `intake` 交接

**前置**：根据交接中是否存在 `task_id`（由 `intake` 的 Step 4 给出；阶段出口的自动衔接同样会带），做以下操作：

| 情形 | 动作 |
| ---- | ---- |
| 有 | **采纳**；`worktree_path` 一并取（空 = 主仓；非空 ⇒ 后续读产物 / 跑命令一律以该 worktree 为仓库根）。中断续跑时按文末「上下文压缩恢复」表定位断点 |
| 没有 | **阻断**：告知「本技能须经 `intake` 进入，请从入口技能（`tweak` / `normal` / `strict`）重新开始」。|

 **不覆盖它、不判断升降档** —— 升 / 降档只在本技能**出口**发生（见 Step 5.5）。

**状态行（H8）**：输出 `[polaris-flow 开发]澄清需求 - 接手任务：.polaris/tasks/<task_id>/；工作流=<档>`

### Step 2：加载宪法（注入点 A）

读取 `openspec/memory/constitution.md`（若存在且无占位符）。后续写入 `intention.md`「宪法对齐」节时使用。

### Step 3：探索、收敛（核心）

**先按 `workflow.mode` 分派**（Step 1 已取；本技能是**档位消费者**，只读不覆盖）：

| 档 | 澄清强度 | 走法 |
| --- | --- | --- |
| **`tweak`** | **轻量调研** —— 简单改动的事实主要**在代码里**，不在用户脑子里 | 按 `./policies/lite-clarify.md`：现场勘察 → **一次**理解确认（6 项）→ 直接进 Step 4。**跳过下面的 3.0–3.4 全部探索环节**（本档豁免，非缺失） |
| **`normal` / `strict`** | **完整探索** | 依次执行 3.0 → 3.1 → 3.2 → 3.3 → 3.4 |

⚠️ 两条路径**汇合于 Step 4**（命名与落盘）。`intention.md` 的 **9 个节**两档都要写满
（tweak 档内容极简）；`intention-validate` 照跑，**不改 lint**。

进入本子流程前必须 `read_file ./policies/response-posture.md`，并按其行为对照表、Pushback Patterns推回、回复前自检执行。

#### 3.0 探索想法与需求澄清（强制硬门 · **仅 `normal` / `strict` 档**）

**立即执行：** 使用 Skill 工具加载 `openspec-explore` 或 `opsx:explore`。禁止跳过此步骤。

<!-- external-openspec-skill-override -->
**外部 OpenSpec Skill 覆写：** 加载后只采用其探索方法；其中任何直接运行官方 CLI、切换到固定 cwd 或读写固定物理 OpenSpec 路径的指令都不得执行。

技能加载后，按其指引探索问题空间，但不得把一次问答视为足够澄清。必须围绕下列内容继续提问、对齐并形成澄清摘要：
- 目标：用户真正要解决的问题和期望结果
- 非目标：本次明确不做的内容
- 范围边界：涉及/不涉及的模块、用户、平台或数据
- 关键未知项：仍不确定的假设、风险或依赖
- 验收场景草案：核心成功场景 + 关键边界场景

澄清摘要必须包含：目标、非目标、范围边界、关键未知项、验收场景草案，过程中至少满足以下要求：

| 维度 | 下限 |
| ---- | ---- |
| 提问数量 | **≥ 3** 个探索性问题 |
| 覆盖类型数 | **≥ 3** 类（禁止同类刷数） |
| 提问范式 | 按 response-posture.md 第四节 Exploratory Question Patterns（E1–E5） |
| 等待行为 | 用户回答**全部** ≥3 个问题后才能进入 3.1 |
| 模糊回答 | 按 response-posture.md 第二节 Pushback Patterns 推回；**不**计入提问达成 |

**3.0 自检**：已提出 ≥3 问、覆盖 ≥3 类、且收到具体回答？未达成 → 继续提问。通过 → 进入 3.1。

#### 3.1 需求拆分预检（阻塞点）

> 🔻 **以下 3.1–3.4 属 `normal` / `strict` 档路径**。`tweak` 档走 `./policies/lite-clarify.md`，
> 在完成轻量调研后**直接进 Step 4**，不进入本节。
> ⚠️ `tweak` 档**不做**拆分预检 —— 简单改动不存在「拆成多个 change」的问题；
> 若勘察中发现确实需要拆分（跨模块 / 多 delta spec），那不是"漏了预检"，而是**档判低了**，
> 记入摘要并在 **Step 5.5 出口判档**升档处理。

须在澄清摘要已形成、且 **Reframe 之前** `read_file ./policies/task-split-precheck.md` 并按其执行。**禁止**在本步骤完成前创建 OpenSpec artifacts 或调用 `/opsx:new`。

#### 3.2 Reframe Check

`read_file ./policies/reframe-check.md`，按 **第 1 节**执行：满足跳过条件则跳过并说明理由；否则输出 1 个 Reframe 候选，等用户在 ✅ / ✏️ / ❌ 间选择（✏️ 最多 2 轮；❌ 保留原始 framing）。完成后进入 3.3。

#### 3.3 决策方案 Options

继续按 `reframe-check.md` **第 2 节**：每个实现层决策点给出 2–3 个方案 + 优劣权衡，按`./policies/ask-question-react.md`的方式发起提问并等用户选择；未选方案与拒绝理由记入后续 `intention.md`「备选方案」节。完成后进入 3.4。

#### 3.4 Premise Challenge

`read_file ./policies/premise-challenge.md` 并按其执行：基于 3.0–3.3 提炼 3–5 条前提（覆盖 ≥3 类）→ 用户对每条作出 “认可” / “不认可” / “不确定” 选择（选“不认可”时最多重生成 3 轮；不确定发起追问）→ **全部认可** 后进入 Step 4。

### Step 4: 命名 + 落盘意图文档

#### 4.1 任务名称确认（阻塞点）→ 得到 `task_id`

按 `./policies/decision-point.md` 暂停，让用户决定任务名（即后续目录名 / `task_id`）。**禁止**静默推断或自动落盘。
约束：`task_id` 必须是 **kebab-case 英文**（小写字母、数字、连字符），如 `refine-requirements-doc`。

暂停时必须展示：

- 基于已确认摘要派生的 **2–3 个推荐名**，各附一行范围说明
- 「自行输入名称」选项
- 提示：非合规输入（含中文）会转换为 kebab-case，**转换结果须回显并再次确认**

名称与已有 `$REPO_ROOT/.polaris/tasks/` 目录冲突时，报告冲突并请用户另选。

用户确认后，**`task_id` 随 4.2 写入的 `intention.md` 首行一并落盘** —— 那是本阶段名称的**唯一落盘载体**。**禁止**只把它留在会话上下文里（会话丢失后无从恢复）。此时 **尚未** `mv` 目录。进入 4.2。

#### 4.2 写入 `intention.md`（仍在 draft 目录）：

落盘路径：`$REPO_ROOT/.polaris/tasks/<draft_name>/intention.md`

**强制前置**：写入前必须 `read_file ./templates/intention-template.md`，并输出：`[polaris-flow 开发]澄清需求：已读取意图探索模板 intention-template.md`

**禁止**未读模板就生成内容。

内容严格按模板节顺序填充（与模板一致）：

| 模板节 | 内容来源 |
| ------ | -------- |
| Reframe 历程 | 3.2 |
| 宪法对齐 | Step 2 |
| 前提 / 前提历史 | 3.4 |
| 目标 / 任务范围 / 验收场景及标准 | `normal` / `strict`：3.0 摘要（含整体确认）；`tweak`：`lite-clarify.md` 的 L1 现状事实 + L2 六项摘要 |
| 结论（架构 + 技术选型） | 3.3 用户选定方案 |
| 备选方案 | 3.3 未选方案 + 拒绝理由 |
| 待决问题 | 探索中未关闭项 |
| 下游约束 | 按模板固定条目 |

首行任务标识**直接写 4.1 已确认的真实 `task_id`**（如 `# intention: refine-user-privilege`）——它是本阶段唯一的落盘任务身份，也是会话丢失后恢复 `task_id` 的依据。**不使用 `<TBD>` 占位**。

写完进入 Step 5。

### Step 5：评审、整体确认、finalize

#### 5.1 意图评审

输出：`[polaris-flow 开发]澄清需求：意图评审暂未实现，请人工评审文档（务必确保该文档的准确性）。通过后作为后续生成 OpenSpec 规格文档的唯一依据。`

#### 5.2 意图Lint评审

```bash
LINT_RESULT=$(bash "$PLUGIN_ROOT/scripts/intention-validate.sh" "$REPO_ROOT/.polaris/tasks/$draft_name/intention.md")
LINT_EXIT=$?
```
> 注意路径用 `$draft_name`：`mv` 发生在 5.4，此处目录**仍是 draft 名**。
- exit 0 → 通过  
- exit 1 → **阻断**，输出 `$LINT_RESULT`，修正后重跑

#### 5.3 用户整体确认 `intention.md`（阻塞点）

按 `./policies/decision-point.md` 暂停并发起问答询问：

> 请**仔细**阅读完整意图文档（含目标、前提、结论/选型、范围与验收），**审查**后确认是否可以进入下一阶段？
>
> （请回复「确认 / ok / 同意」等明确整体确认；若仅对某条目有意见，请直接指出以便修改）

| 用户回复 | 判定 | 后续动作 |
| -------- | ---- | -------- |
| 明确整体确认 | 完成 | 进入 5.4 |
| 仅对某条/某节反馈 | **不算确认** | 修改后 **重新执行 5.2** |
| 模糊回复（「差不多」「可以吧」） | **不算确认** | 必须再问一次明确确认 |
| 沉默 / 无回复 | **不算确认** | 同上 |

**禁止**把 3.2–3.4 中任何局部「同意」当作本步整体确认。

#### 5.4 敲定目录名并更新 state（finalize）

将 draft 目录 `mv` 为正式 `task_id`，更新 state / workflow（首行已是真值，**无需回填**）：

> **会话丢失后的恢复**：`task_id` 从 `intention.md` 首行读（4.2 已写入真值）；`draft_name` 从
> `.polaris/tasks/` 下的 `draft-*` 目录推断（多个则按 `./policies/decision-point.md` 让用户选）。
> **两者都不依赖会话记忆** —— 这是本步可在新会话中执行的前提。

```bash
FINAL_RESULT=$(bash "$PLUGIN_ROOT/scripts/specify-finalize.sh" "$REPO_ROOT" "<draft_name>" "<task_id>")
FINAL_EXIT=$?
echo "FINAL_EXIT=$FINAL_EXIT FINAL_RESULT=$FINAL_RESULT"
```

| `FINAL_EXIT` | 含义 | 后续动作 |
| ------------ | ---- | -------- |
| 0 | 成功 | 进入 5.4.1 |
| 1 | 目标目录已存在 | 按 H12 阻断 |
| 2 | 参数/环境错误 | 按 H12 阻断 |
| 3 | workflow rename 失败 | 按 H12 阻断 |

##### 5.4.1 分级初判（写两轴三字段）

`finalize` 成功后，按 `./policies/risk-signals.md` 对**需求侧**做一次初判，写 `state.yaml`。
判定输入 = `intention.md` 的目标 / 任务范围 / 验收场景 / 下游约束（`tweak` 档即 `lite-clarify.md` 的 L1
现状事实 + L2 六项摘要），加 3.1 拆分预检结论；**不得**凭对话印象。

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set complexity_level=<trivial|standard|critical> \
  --set risk_level=<trivial|standard|critical> \
  --set current_tier=<两轴取较高档>
```

- 档位定义与方向见 `./policies/risk-signals.md` §1；信号见 §4（需求侧重点 `D2` / `D6` / `D7`）；合成见 §6
- `current_tier = max(complexity_level, risk_level)`（升档门优先）
- **只初判不代决**：本步只把档位**落盘**；需要用户拍板的是下一步（**5.5 的出口判档**），本步不得代选
- 输出判定依据（命中信号编号，如 `D6,D7`），随 5.6 状态行一并呈现

#### 5.5 出口判档 + 推进阶段（**全流程唯一一处档位变更**）

> 🔴 **为什么在这里**：本步之前，本任务的产物**只有 `intention.md`** ⇒ 改档**零返工**。
> 一旦进入 `tasks` 及以后，改档就意味着四件套 / `tasks.md` / 代码 / 验证报告**全部要按新档重做**。
> ⇒ **过了本步 = 档位冻结**：`tasks` / `build` / `verify` / `ship` 的出口只按 `skill` 字段转交，
> **不判档、不改 `mode`**。

**顺序固定，不得颠倒**：

##### ① 判档（输入 = **落盘产物**，不得依赖会话记忆）

按 `./policies/risk-signals.md` §1 / §3（降档门）/ §4（升档信号），用 `intention.md` 的目标 /
任务范围 / 验收场景 / 下游约束 + 5.4.1 的两轴字段：

| 命中 | level |
| ---- | ----- |
| §4 任一信号（或 §5 glob） | `critical` |
| §3 降档门**全部满足** 且 §4 无命中 | `trivial` |
| 其余 / 信息不足 | `standard` |

**目标档 = 该 level 按 `./policies/risk-signals.md` §1 的单源映射折算** —— **本技能不另列该映射**。

- 目标档 **=** 当前档（`state.yaml` 的 `workflow.mode`）→ **不改**，直接进入 ②
- 🔴 目标档 **≠** 当前档 → 按 `./policies/decision-point.md` **问用户确认**
  （升档 = 换更重的流程；降档 = 入口判高了），用户确认后写：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set workflow.mode=<目标档>
```

⚠️ 用户不同意 → **保持当前档**，不写。（判定与理由一并落 5.6 状态行，便于回溯。）

##### ② 推进阶段

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase specify
```

🔴 **不传 `--next-phase`** —— 缺省由代码按**当前的** `workflow.mode` 从阶段表派生
（`phasesForMode` 为唯一真相）：`tweak → tasks`（跳过 `plan` / `design`）、`normal` / `strict → plan`。
⇒ **升档一律落 `plan`**，**不需要第二张转移表**。
⚠️ 因此 **① 必须先于 ②**：先改 `mode`，再按新 `mode` 派生下一阶段。

非 0 退出 → 按 H12 阻断，不得进入 5.6。

#### 5.6 完成状态行

输出：`[polaris-flow 开发]澄清需求 - 澄清阶段完成：.polaris/tasks/<task_id>/intention.md 已锁定；state 已更新；分级初判 = complexity=<...> / risk=<...> → current_tier=<...>（命中 <信号编号>）；出口判档 = <当前档> → <目标档>（未变 | 已升档 <当前档>→<目标档> | 已降档 <当前档>→<目标档>）。`

输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**）。
先按「自动衔接下一阶段」一节运行 `state next`，**下一步的技能名与括注均取自其输出**
—— `SKILL` 直填；括注按 `NEXT` 取（`manual` → 「建议新开会话」；`auto` → 「可同会话继续」）。**两者都不得写死**：

```text
[polaris-flow 开发]澄清需求 - 阶段完成，状态已落盘。
下一步：<SKILL> 阶段（建议新开会话 | 可同会话继续）。
恢复：先读 .polaris/tasks/<task_id>/intention.md（首行即 task_id），再从下一步技能的 Step 0 开始。
```

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```

---

## 上下文压缩恢复

重载：`draft_name`（`.polaris/tasks/` 下的 `draft-*`）、`intention.md` 是否已落盘及其**首行的 `task_id`**、
`state.yaml`（顶层 `phase` + 分级三字段 `complexity_level` / `risk_level` / `current_tier`）、
该任务在游标里的 `task_id` / `worktree_path`、本技能停在哪个 Step。

- **名称的恢复**：`task_id` 从 `intention.md` 首行读（4.2 已写入真值）；首行缺失或文件未落盘 → 回 **4.1** 重新确认名称
- 停在 **Step 3.x（`normal` / `strict` 档）** → 从 **3.0 自检**续做（澄清摘要未达「≥3 问 / ≥3 类」时继续提问，不得跳过）
- 停在 **轻量调研中途（`tweak` 档）** → 先读 `workflow.mode` 确认确为 `tweak`；L2 六项摘要已在则从确认续，否则重做 L1 现状勘察（`./policies/lite-clarify.md`）
- 停在 **4.2 之后、5.4 之前** → 从 **5.1** 续（产物已在 draft 目录，不必重写）
- 停在 **5.4（finalize）** → 按 5.4 的恢复路径重跑；`mv` 失败按该步的退出码表处理
- 停在 **5.4.1（分级初判）** → 三个字段已有值则直接用，**勿重判**；只缺部分字段则补齐缺失项（`current_tier` 须与两轴取高一致）
- 停在 **5.5（阶段未推进）** → 补执行 5.5：先核对**出口判档**结论是否已落盘（`workflow.mode` 是否已是目标档；`set` 幂等，未落则补写），再跑 `complete-phase`；**勿重跑 finalize**（目录已改名，重跑会撞 `FINAL_EXIT=1`）
- 恢复依据是**落盘产物**（首行 `task_id` + draft 目录），不依赖会话记忆
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」