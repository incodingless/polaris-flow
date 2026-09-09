---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}specify
description: "经结构化探索与确认，把用户需求落地为 intention.md。用户触发 /polaris{{SKN_SPR}}coding{{SKN_SPR}}specify 或 要求进入需求澄清 或 产出 intention.md 时必须使用本 skill。"
version: 0.1
---
# Polaris 工作流 - 阶段1：澄清

<HARD-GATE>
本 skill **仅**负责把用户需求经过强制结构化讨论后落地为 `intention.md`。

- **禁止**跳过 openspec-explore 强制交互（≥3 个探索性问题 + 等待用户回答 + 覆盖 ≥3 类）
- **禁止**跳过 Reframe Check（`./policies/reframe-check.md` 第 1 节）
- **禁止**跳过设计决策 Options（`./policies/reframe-check.md` 第 2 节）
- **禁止**跳过 Premise Challenge（`./policies/premise-challenge.md`）
- **禁止**未拿到用户对 **intention.md 全文** 的整体确认就标记本阶段完成
- **禁止**未读取 `./templates/intention-template.md` 就生成 `intention.md`（Step 4 强制前置）
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]澄清需求 - 进入澄清阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}specify 技能。`

---

## 前置条件

- 无活跃 change，或用户希望创建新 change

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：设置产物语言

读取 `.polaris/config.yaml` 的 `language`（规范化 ID，如 `en`、`zh`）。无配置时回退到当前用户请求语言。

本阶段所有提问、澄清摘要、`intention.md` 均以该语言为主语言。OpenSpec 三件套语言由后续 plan 阶段继承同一配置，**本阶段不创建**那些文件。

### Step 1：准备 draft 目录 + workflow entry

使用 SessionStart 注入的路径（本 skill 内此后一律复用 `$REPO_ROOT` / `$PLUGIN_ROOT`）：

- 优先：环境变量 `$PLUGIN_ROOT` / `$REPO_ROOT`（Trae `env`、 Cursor `env`、Claude `CLAUDE_ENV_FILE`，或 Agent 上下文中的同名赋值）
- 兜底：source `.polaris/.cache/runtime-env`（SessionStart 落盘）
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

**输出解读**（读 `INIT_RESULT` JSON）：

| `INIT_EXIT` | `status` | 含义 | 后续动作 |
| ----------- | -------- | ---- | -------- |
| 0 | `"ok"` | 成功 | 取 `draft_name`，进入 Step 1.5 |
| 1 | `"existing"` | 存在未完成 draft | 按决策点协议询问 A/B/C（见下） |
| 2 | —（stderr）  | 参数/环境错误     | 按 H12 阻断 |
| 3 | —（stderr）  | workflow 写入失败 | 按 H12 阻断 |

`status="existing"` 时且 `existing` 含已有 draft 目录列表，**必须**按 `./policies/decision-point.md` 暂停询问：

- **A. 续写最新一个**：`draft_name` = 列表最后一项 → 进入 Step 2
- **B. 选择一个**：列出所有的 `draft_name` 候选让用户选择之后，再进入 Step 2
- **C. 丢弃所有**：对每个 dir 执行下列命令后，**重新**调用 `task-init.sh`，再进入 Step 1.5：

```bash
for d in <existing 列表>; do
  rm -rf "$REPO_ROOT/.polaris/tasks/$d"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind change --skill specify --repo-root "$REPO_ROOT" --where-task-id "$d"
done
```

- **D. 取消退出**：结束本 skill

#### 1.5 状态行输出（H8）

输出：`[polaris-flow 开发]澄清需求 - 开始编写(意图)澄清草稿：.polaris/tasks/<draft_name>/; workflow: appended entry phase=specify`

### Step 2：加载宪法（注入点 A）

读取 `openspec/memory/constitution.md`（若存在且无占位符）。后续写入 `intention.md`「宪法对齐」节时使用。

### Step 3：探索、收敛（核心）

进入本子流程前必须 `read_file ./policies/response-posture.md`，并按其行为对照表、Pushback Patterns推回、回复前自检执行。

#### 3.0 探索想法与需求澄清（强制硬门）

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

用户确认后，将 `task_id` 记入会话上下文（此时 **尚未** `mv` 目录）。进入 4.2。

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
| 目标 / 任务范围 / 验收场景及标准 | 3.0 摘要 + 3.5 确认 |
| 结论（架构 + 技术选型） | 3.3 用户选定方案 |
| 备选方案 | 3.3 未选方案 + 拒绝理由 |
| 待决问题 | 探索中未关闭项 |
| 下游约束 | 按模板固定条目 |

首行任务标识暂用占位（与 finalize 脚本约定一致，如 `# intention: <TBD>`）；Step 5.4 回填为真实 `task_id`。

写完进入 Step 5。

### Step 5：评审、整体确认、finalize

#### 5.1 意图评审

输出：`[polaris-flow 开发]澄清需求：意图评审暂未实现，请人工评审文档（务必确保该文档的准确性）。通过后作为后续生成 OpenSpec 规格文档的唯一依据。`

#### 5.2 意图Lint评审

```bash
LINT_RESULT=$(bash "$PLUGIN_ROOT/scripts/intention-validate.sh" "$REPO_ROOT/.polaris/tasks/$change_id/intention.md")
LINT_EXIT=$?
```
- exit 0 → 通过  
- exit 1 → **阻断**，输出 `$LINT_RESULT`，修正后重跑

#### 5.3 用户整体确认 `intention.md`（阻塞点）

按 `./policies/decision-point.md` 暂停并发起问答询问：

> 请**仔细**阅读完整意图文档（含目标、前提、结论/选型、范围与验收），**审查**后确认是否可以进入下一阶段？
>
> （请回复「确认 / ok / 同意」等明确整体确认；若仅对某条目有意见，请直接指出以便修改）

| 用户回复 | 判定 | 后续动作 |
| -------- | ---- | -------- |
| 明确整体确认 | 完成 | 进入 5.3 |
| 仅对某条/某节反馈 | **不算确认** | 修改后 **重新执行 5.2** |
| 模糊回复（「差不多」「可以吧」） | **不算确认** | 必须再问一次明确确认 |
| 沉默 / 无回复 | **不算确认** | 同上 |

**禁止**把 3.2–3.4 中任何局部「同意」当作本步整体确认。

#### 5.4 敲定目录名并更新 state（finalize）

将 draft 目录 `mv` 为正式 `task_id`，回填 intention 首行，更新 state / workflow：

```bash
FINAL_RESULT=$(bash "$PLUGIN_ROOT/scripts/specify-finalize.sh" "$REPO_ROOT" "<draft_name>" "<task_id>")
FINAL_EXIT=$?
echo "FINAL_EXIT=$FINAL_EXIT FINAL_RESULT=$FINAL_RESULT"
```

| `FINAL_EXIT` | 含义 | 后续动作 |
| ------------ | ---- | -------- |
| 0 | 成功 | 进入 5.5 |
| 1 | 目标目录已存在 | 按 H12 阻断 |
| 2 | 参数/环境错误 | 按 H12 阻断 |
| 3 | workflow rename 失败 | 按 H12 阻断 |

#### 5.5 完成状态行

输出：`[polaris-flow 开发]澄清需求 - 澄清阶段完成：.polaris/tasks/<task_id>/intention.md 已锁定；state 已更新。`

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行。关键命令：

```bash
node polaris-flow state next <change-name>
```

- `NEXT: auto` → 调用 `SKILL` 指向的 skill 进入下一阶段
- `NEXT: manual` → 不要调用下一 skill，按 `HINT` 提示用户手动运行 `/<SKILL>`
- `NEXT: done` → 流程已完成，无需继续