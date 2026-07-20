<!--
  简要说明：
  - 职责：经结构化探索与确认，把用户需求落地为 intention.md（本阶段不写 OpenSpec）。
  - 主产物：`.polaris/tasks/<task_id>/intention.md` + state / workflow 游标。
  - 上游 / 下游：新建 change → 本阶段 → propose。
-->

---
name: polaris-flow-clarify
description: "用户触发 /polaris-flow-clarify 或 要求进入需求澄清 或 产出 intention.md 时必须使用本 skill。"
---
# Polaris 工作流 - 阶段1：澄清

<HARD-GATE>
本 skill **仅**负责把用户需求经过强制结构化讨论后落地为 `intention.md`。

- **禁止**跳过 openspec-explore 强制交互（≥3 个探索性问题 + 等待用户回答 + 覆盖 ≥3 类）
- **禁止**跳过 Reframe Check（`./policies/reframe-check.md` 第 1 节）
- **禁止**跳过设计决策 Options（`./policies/reframe-check.md` 第 2 节）
- **禁止**跳过 Premise Challenge（`./policies/premise-challenge.md`）
- **禁止**未拿到用户对 **intention.md 全文** 的整体确认就标记本阶段完成
- **禁止**未 `read_file templates/intention-template.md` 就生成 `intention.md`（Step 4 强制前置）
- **禁止**在本阶段创建 `proposal.md` / `design.md` / `tasks.md`，或调用 `/opsx:new` / 加载 `openspec-propose`
- **禁止**使用未基于探索摘要提炼的随机 slug——推荐的 `task_id` 必须从用户回答中取核心 2–3 个名词关键词，保证可解释性

</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入阶段: 澄清目标及需求 — 使用 polaris-flow-clarify 技能。`

## 状态布局

- 起草期间：`.polaris/tasks/draft-<session_suffix>-<unix_ts>/state.yaml`
- Step 5.3 finalize 成功后：`mv` 为 `.polaris/tasks/<task_id>/`
- `intention.md` 在 finalize 前位于 draft 目录；finalize 后位于正式 `task_id` 目录
- 同步维护 `.polaris/workflow.yaml` 的 active 游标（写入一律走 `hooks/workflow-entry.sh`；失败按 H12 阻断）

---

## 前置条件

- 无活跃 change，或用户希望创建新 change

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：产物语言

读取 `.polaris/config.yaml` 的 `language`（规范化 ID，如 `en`、`中文`）。无配置时回退到当前用户请求语言。

本阶段所有提问、澄清摘要、`intention.md` 均以该语言为主语言。OpenSpec 三件套语言由后续 propose 阶段继承同一配置，**本阶段不创建**那些文件。

### Step 1：准备 draft 目录 + workflow entry

解析插件根目录（本 skill 内此后一律复用此方式）：

```bash
PLUGIN_ROOT="$(cat "<repo_root>/.polaris/config.yaml" | grep "plugin_root" | awk -F'"' '{print $2}')"
INIT_RESULT=$(bash "$PLUGIN_ROOT/hooks/clarify-init.sh" "<repo_root>")
INIT_EXIT=$?
echo "INIT_EXIT=$INIT_EXIT INIT_RESULT=$INIT_RESULT"
```

**输出解读**（读 `INIT_RESULT` JSON）：

| `INIT_EXIT` | `status` | 含义 | 后续动作 |
| ----------- | -------- | ---- | -------- |
| 0 | `"ok"` | 成功 | 取 `draft_name`，进入 Step 1.5 |
| 1 | `"existing"` | 已有未完成 draft | 按决策点协议询问 A/B/C（见下） |
| 2 | —（stderr）  | 参数/环境错误     | 按 H12 阻断 |
| 3 | —（stderr）  | workflow 写入失败 | 按 H12 阻断 |

`status="existing"` 时，`existing` 含已有 draft 目录列表。**必须**按 `.polaris/reference/decision-point.md` 暂停询问：

- **A. 续写最新一个**：`draft_name` = 列表最后一项 → 进入 Step 2
- **B. 丢弃所有**：对每个 dir 执行下列命令后，**重新**调用 `clarify-init.sh`，再进入 Step 1.5：

```bash
for d in <existing 列表>; do
    rm -rf "<repo_root>/.polaris/tasks/$d"
    bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" delete-active --skill clarify \
      --repo-root "<repo_root>" --where-change-id "$d"
done
```

- **C. 取消退出**：结束本 skill

#### 1.5 状态行输出（H8）

输出：`[polaris-flow] clarify draft: .polaris/tasks/<draft_name>/ ; workflow: appended entry phase=clarify`

### Step 2：加载宪法（注入点 A）

读取 `openspec/memory/constitution.md`（若存在且无占位符）。后续写入 `intention.md`「宪法对齐」节时使用。

### Step 3：探索、收敛与命名（核心）

**立即执行：** 使用 Skill 工具加载 `openspec-explore`。禁止跳过。

按其指引探索问题空间；不得把一次问答视为足够。必须形成澄清摘要，至少包含：

- 目标：用户真正要解决的问题和期望结果
- 非目标：本次明确不做的内容
- 范围边界：涉及/不涉及的模块、用户、平台或数据
- 关键未知项：仍不确定的假设、风险或依赖
- 验收场景草案：核心成功场景 + 关键边界场景

#### 3.0 讨论（强制硬门）

| 维度 | 下限 |
| ---- | ---- |
| 提问数量 | **≥ 3** 个探索性问题 |
| 覆盖类型数 | **≥ 3** 类（禁止同类刷数） |
| 提问范式 | `./policies/response-posture.md` 第四节 Exploratory Question Patterns（E1–E5） |
| 等待行为 | 用户回答**全部** ≥3 个问题后才能进入 3.1 |
| 模糊回答 | 按 response-posture.md 第二节 Pushback Patterns 推回；**不**计入提问达成 |

进入本子流程前必须 `read_file ./policies/response-posture.md`，并按其行为对照表、Pushback Patterns、回复前自检执行。

**3.0 自检**：已提出 ≥3 问、覆盖 ≥3 类、且收到具体回答？未达成 → 继续提问。通过 → 进入 3.1。

#### 3.1 需求目标拆分预检（阻塞点）

须在澄清摘要已形成、且 **Reframe 之前** 执行（对齐 `./policies/task-split-precheck.md`）。

`read_file ./policies/task-split-precheck.md` 并按其执行：

1. 按 §1 判定是否触发；可跳过则说明理由后进入 3.2
2. 触发时按 §2–§3 评估并输出候选拆分清单
3. 推荐拆分或边界情况时，按 §4 + `.polaris/reference/decision-point.md` **阻塞等待**
4. 用户选 A → 批量拆分模式（§5），全部 open 后按 §5.3 暂停；选 B → 记录不拆分原因后进入 3.2；选 C → 调整后重新呈现清单

**禁止**在本步骤完成前创建 OpenSpec artifacts 或调用 `/opsx:new`。

#### 3.2 Reframe Check

`read_file ./policies/reframe-check.md`，按 **第 1 节**执行：满足跳过条件则跳过并说明理由；否则输出 1 个 Reframe 候选，等用户在 ✅ / ✏️ / ❌ 间选择（✏️ 最多 2 轮；❌ 保留原始 framing）。完成后进入 3.3。

#### 3.3 设计决策方案 Options

继续按 `reframe-check.md` **第 2 节**：每个实现层决策点给出 2–3 个方案 + 优劣权衡，等用户选择；未选方案与拒绝理由记入后续 `intention.md`「备选方案」节。完成后进入 3.4。

#### 3.4 Premise Challenge

`read_file ./policies/premise-challenge.md` 并按其执行：基于 3.0–3.3 提炼 3–5 条前提（覆盖 ≥3 类）→ 用户对每条 agree / disagree / unsure（disagree 最多重生成 3 轮；unsure 追问）→ **全部 agree** 后进入 3.5。

#### 3.5 需求澄清完成确认（阻塞点）

按 `.polaris/reference/decision-point.md` 暂停，展示澄清摘要（目标、非目标、范围边界、关键未知项、验收场景草案），等待用户确认澄清完成。

确认前不得创建 OpenSpec artifacts，不得加载 `openspec-propose`。确认后进入 3.6。

#### 3.6 任务名称确认（阻塞点）→ 得到 `task_id`

按 `.polaris/reference/decision-point.md` 暂停，让用户决定任务名（即后续目录名 / `task_id`）。**禁止**静默推断或自动落盘。

约束：`task_id` 必须是 **kebab-case 英文**（小写字母、数字、连字符），如 `refine-requirements-doc`）。

暂停时必须展示：

- 基于已确认摘要派生的 **2–3 个推荐名**，各附一行范围说明
- 「自行输入名称」选项
- 提示：非合规输入（含中文）会转换为 kebab-case，**转换结果须回显并再次确认**

名称与已有 `.polaris/tasks/` 目录冲突时，报告冲突并请用户另选。

用户确认后，将 `task_id` 记入会话上下文（此时 **尚未** `mv` 目录）。进入 Step 4。

### Step 4：写入 `intention.md`（仍在 draft 目录）

落盘路径：`.polaris/tasks/<draft_name>/intention.md`

**强制前置**：写入前必须 `read_file templates/intention-template.md`，并输出：

`[polaris-flow clarify] 已 read_file templates/intention-template.md`

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

首行任务标识暂用占位（与 finalize 脚本约定一致，如 `# intention: <TBD>`）；Step 5.3 回填为真实 `task_id`。

写完进入 Step 5。

### Step 5：评审、整体确认、finalize

#### 5.1 意图评审

输出：`[polaris-flow clarify] 意图评审暂未实现，请人工评审文档（务必确保该文档的准确性）。通过后作为后续生成 OpenSpec 规格文档的唯一依据。`

#### 5.2 用户整体确认 `intention.md`（阻塞点）

向用户输出全文预览并询问：

> 以上是完整意图文档（含目标、前提、结论/选型、范围与验收），请 review 并确认是否可以进入下一阶段？
>
> （请回复「确认 / ok / 同意」等明确整体确认；若仅对某条目有意见，请直接指出以便修改）

| 用户回复 | 判定 | 后续动作 |
| -------- | ---- | -------- |
| 明确整体确认 | 完成 | 进入 5.3 |
| 仅对某条/某节反馈 | **不算确认** | 修改后 **重新执行 5.2** |
| 模糊回复（「差不多」「可以吧」） | **不算确认** | 必须再问一次明确确认 |
| 沉默 / 无回复 | **不算确认** | 同上 |

**禁止**把 3.2–3.6 中任何局部「同意」当作本步整体确认。

#### 5.3 敲定目录名并更新 state（finalize）

将 draft 目录 `mv` 为正式 `task_id`，回填 intention 首行，更新 state / workflow：

```bash
PLUGIN_ROOT="$(cat "<repo_root>/.polaris/config.yaml" | grep "plugin_root" | awk -F'"' '{print $2}')"
FINAL_RESULT=$(bash "$PLUGIN_ROOT/hooks/clarify-finalize.sh" "<repo_root>" "<draft_name>" "<task_id>")
FINAL_EXIT=$?
echo "FINAL_EXIT=$FINAL_EXIT FINAL_RESULT=$FINAL_RESULT"
```

| `FINAL_EXIT` | 含义 | 后续动作 |
| ------------ | ---- | -------- |
| 0 | 成功 | 进入 5.4 |
| 1 | 目标目录已存在 | 按 H12 阻断 |
| 2 | 参数/环境错误 | 按 H12 阻断 |
| 3 | workflow rename 失败 | 按 H12 阻断 |

#### 5.4 完成状态行

输出：`[polaris-flow] 澄清阶段完成：.polaris/tasks/<task_id>/intention.md 已锁定；state 已更新。`

## 自动衔接下一阶段

按 `polaris/reference/auto-transition.md` 执行。关键命令：

```bash
node "$POLARIS_FLOW" next <change-name>
```

- `NEXT: auto` → 调用 `SKILL` 指向的 skill 进入下一阶段
- `NEXT: manual` → 不要调用下一 skill，按 `HINT` 提示用户手动运行 `/<SKILL>`
- `NEXT: done` → 流程已完成，无需继续

注意：无论 `NEXT` 为 `auto` 还是 `manual`，`polaris-flow-clarify` 进入后必须先执行归档前最终确认阻塞点，等待用户明确选择「确认归档」后才允许运行归档脚本。不得因为验证已通过就自动归档。
