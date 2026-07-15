---
name: clarify
description: "用户触发 /polaris-flow-clarify 或要求进入需求澄清阶段时必须使用本 skill。仅负责澄清、讨论需求，并产出 intention.md。"
---
# Polaris工作-阶段1：（澄清）

<HARD-GATE>
本 skill **仅**负责把用户需求经过强制结构化讨论后落地为 `intention.md`。

- **禁止**跳过 openspec-explore 强制交互（≥3 个探索性问题 + 等待用户回答 + 覆盖 ≥3 类）
- **禁止**跳过 Reframe Check（./policies/reframe-check.md）
- **禁止**跳过 Premise Challenge（./policies/premise-challenge.md）
- **禁止**未拿到用户对**完整设计方案**的整体确认就标记本阶段完成
- **禁止**未 `read_file templates/intention-template.md` 就生成 `intention.md`（Step 4.1 强制前置）
- **禁止**使用未基于 openspec-explore 摘要生成的随机 slug——`task_id` 的 slug 部分必须由 AI 从用户回答的探索性问题摘要中提炼（取核心 2-3 个名词关键词），保证可解释性

</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入阶段: clarify — 使用 polaris-flow:clarify skill。`

//TODO

## 状态布局

- 起草期间：`.polaris/tasks/draft-<session_suffix>-<unix_ts>/state.yaml`
- Step 4.4 敲定后：`mv` 到 `.polaris/tasks/<task_id>/state.yaml`
- 同步维护 `.polaris/workflow.yaml: active_tasks` 游标 entry（写入一律走 `hooks/workflow-entry.sh`，见 `policies/workflow-lock.md`，HARD STOP H12）。

---

## 前置条件

- 无活跃 change，或用户希望创建新 change

## 流程（按顺序执行，每一步未完成不得进入下一步）

### Step 0. 输出语言约束

传递给 OpenSpec 的所有提问和产物要求都必须包含解析后的 Polaris 产物语言，并使用 `en`、`zh-CN` 这类规范化 ID。读取 `.polaris/config.yaml` 的 `language`；change 初始化后使用 `"$POLARIS_BASH" "$POLARIS_STATUS" get <task_id> language` 读取。没有配置语言时才回退到当前用户请求语言。生成的 `proposal.md`、`design.md`、`tasks.md` 必须以该语言为主语言。

### Step 1：准备 draft 目录 + workflow entry

**单次 Bash 调用**（封装了 draft 创建 /state.yaml 写入 /workflow entry 追加）：

```bash
PLUGIN_ROOT="$(cat <repo_root>/.<platform>/plugin)"
INIT_RESULT=$(bash "$PLUGIN_ROOT/hooks/design-init.sh" "<repo_root>")
INIT_EXIT=$?
echo "INIT_EXIT=$INIT_EXIT INIT_RESULT=$INIT_RESULT"
```

**输出解读**（读 `INIT_RESULT` JSON）：


| `INIT_EXIT` | `status` 字段 | 含义              | 后续动作                                     |
| ------------- | --------------- | ------------------- | ---------------------------------------------- |
| 0           | `"ok"`        | 成功              | 从`draft_name` 取值，进入 Step 1.5           |
| 1           | `"existing"`  | 已有未完成 draft  | 用`ask_followup_question` 询问 A/B/C（见下） |
| 2           | —（stderr）  | 参数/环境错误     | 按 H12 阻断                                  |
| 3           | —（stderr）  | workflow 写入失败 | 按 H12 阻断                                  |

`status="existing"` 时 `existing` 字段含已有 draft 目录列表，**必须**用 `ask_followup_question` 询问：

- **A. 续写最新一个**：`draft_name` 为列表最后一项，跳到 Step 2
- **B. 丢弃所有**：对每个 dir 执行以下操作后重新调用 `design-init.sh`：
  ```bash
  for d in <existing 列表>; do
    rm -rf "<repo_root>/.polaris/tasks/$d"
    bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" delete-active --skill clarify \
      --repo-root "<repo_root>" --where-change-id "$d"
  done
  ```
- **C. 取消退出**：退出

#### 1.5 状态行输出（H8）

输出 `[polaris-flow] clarify draft: .polaris/tasks/<draft_name>/ ; workflow: appended entry phase=clarify`。

### Step 2：加载宪法（注入点 A）

读取 `openspec/memory/constitution.md`（若存在且无占位符）。

### Step 3：探索想法与需求澄清（核心步骤）

**立即执行：** 使用 Skill 工具加载 `openspec-explore` 技能。禁止跳过此步骤。

技能加载后，按其指引探索问题空间，但不得把一次问答视为足够澄清。必须围绕下列内容继续提问、对齐并形成澄清摘要：

- 目标：用户真正要解决的问题和期望结果
- 非目标：本次明确不做的内容
- 范围边界：涉及/不涉及的模块、用户、平台或数据
- 关键未知项：仍不确定的假设、风险或依赖
- 验收场景草案：至少覆盖核心成功场景和关键边界场景

澄清摘要必须包含：目标、非目标、范围边界、关键未知项、验收场景草案。

#### 3.0 讨论（强制硬门）


| 维度         | 下限                                                                               |
| -------------- | ------------------------------------------------------------------------------------ |
| 提问数量     | **≥ 3 个**探索性问题                                                              |
| 覆盖类型数   | **≥ 3 类**（不能连提同类问题刷数）                                                |
| 提问范式来源 | `./policies/response-posture.md` 第四节 **Exploratory Question Patterns**（E1-E5） |
| 等待行为     | 必须等待用户回答**全部** ≥3 个问题后才能进入 3.1                                  |
| 模糊回答处理 | 按 response-posture.md 第二节**Pushback Patterns** 推回，**不**计入提问数量达成    |

整个子流程必须先 `read_file ./policies/response-posture.md` 并按照其行为对照表、Pushback Patterns、6 条回复前自检执行。

**3.0 自检**（呈现方案前必须通过）：是否已向用户提出 ≥3 个问题、覆盖 ≥3 类、且收到具体回答？未达成 → 继续提问。

#### 3.1 Reframe Check

`read_file ./policies/reframe-check.md` 并按其 **第 1 节**执行：满足 3 个跳过条件则跳过；否则输出 1 个 Reframe 候选，等用户在 ✅ / ✏️ / ❌ 间选择（✅ 进入 3.2；✏️ 最多 2 轮迭代；❌ 保留原始 framing）。

#### 3.2 设计决策方案 Options

`read_file ./policies/reframe-check.md` 并按其 **第 2 节**执行：每个实现层决策点给出 2-3 个方案 + 优劣权衡，等用户在 A/B/C 中选；未选方案 + 拒绝理由记录待写入 `## Alternatives` 节。

#### 3.3 Premise Challenge

`read_file ./policies/premise-challenge.md` 并按其执行：基于 3.1~3.3 提炼 3-5 条前提（覆盖 ≥3 类）→ 输出清单等用户对每条 agree / disagree / unsure（disagree 重生成清单最多 3 轮；unsure 具体追问）→ 全部 agree 进入 3.4。

### Step 4: 敲定 task_id + 生成intent.md + 用户整体确认



#### 4.1 需求目标拆分预检（阻塞点）

`read_file ./policies/task-split-precheck.md` 并按其执行：

1. 按 §1 判定是否触发预检；可跳过时说明理由后进入 4.2
2. 触发时按 §2 评估是否推荐拆分，按 §3 输出候选拆分清单
3. 推荐拆分或边界情况时，按 §4 呈现用户决策点并**阻塞等待**（协议见 `polaris/reference/decision-point.md`）
4. 用户选择 A → 进入批量拆分模式（§5），全部 open 完成后按 §5.3 暂停；用户选择 B → 记录不拆分原因后继续 4.2；用户选择 C → 调整后重新呈现清单

**禁止**在本步骤完成前创建 `proposal.md`、`design.md`、`tasks.md` 或调用 `/opsx:new`。

#### 4.2 需求澄清完成确认（阻塞点）

创建 OpenSpec artifacts 前，必须按 `.polaris/harness/reference/decision-point.md` 的协议暂停并等待用户确认需求澄清完成。

暂停时必须展示澄清摘要：目标、非目标、范围边界、关键未知项、验收场景草案。

不得在用户确认需求澄清完成前创建 proposal.md、design.md 或 tasks.md，也不得使用 Skill 工具加载 `openspec-propose` 技能一次性生成全部 artifacts。

#### 4.3 任务名称确认（阻塞点）

必须按 `comet/reference/decision-point.md` 的协议暂停，让用户决定 change 名称。不得自动生成或静默推断 change 名称。

Polaris 任务名称必须是 **kebab-case 英文**（小写字母、数字、连字符；如 `refine-requirements-doc`）。中文或其他不合规名称无效。

暂停时必须展示：

- 基于已确认澄清摘要派生的 **2-3 个推荐 kebab-case 英文名**，每个附一行说明其隐含范围
- 一个让用户 **自行输入名称** 的明确选项
- 提示：**若用户输入中文（或任何非 kebab-case 文本），会被转换为合规的 kebab-case 英文名**，转换结果必须回显给用户确认后才能使用

决策选项必须包含：

- 选择某个推荐名称
- 「自行输入名称」——接收用户输入；若已是合规 kebab-case 英文则直接使用；若为中文或其他不合规形式，则转换为合规 kebab-case 英文并回显转换后的名称，确认后再继续

不得在用户确认最终 change 名称前运行 `openspec new change` 或创建 `polaris.yaml`。若选定/转换后的名称与已有 change 冲突，必须报告冲突并请用户另选名称。

#### 4.4 创建任务结构

**命名与范围守卫**: task name 必须使用 3.3 中用户确认的 kebab-case 英文名，不得自动生成、推断或使用非 kebab-case（如中文）名称。变更范围必须与用户描述一致，不得自行扩大或缩小。

**单次 Bash 调用**：

```bash
INIT_RESULT=$(bash "$PLUGIN_ROOT/hooks/clarify-init.sh" "<repo_root>")
INIT_EXIT=$?
echo "INIT_EXIT=$INIT_EXIT INIT_RESULT=$INIT_RESULT"
```

**输出解读**（读 `INIT_RESULT` JSON）：


| `INIT_EXIT` | `status` 字段 | 含义              | 后续动作                                     |
| ------------- | --------------- | ------------------- | ---------------------------------------------- |
| 0           | `"ok"`        | 成功              | 从`task_name` 取值，进入 Step 1.5            |
| 1           | `"existing"`  | 已有未完成任务    | 用`ask_followup_question` 询问 A/B/C（见下） |
| 2           | —（stderr）  | 参数/环境错误     | 按 H12 阻断                                  |
| 3           | —（stderr）  | workflow 写入失败 | 按 H12 阻断                                  |

`status="existing"` 时 `existing` 字段含已有任务目录列表，**必须**用 `ask_followup_question` 询问：

- **A. 续写最新一个**：`task_name` 为列表最后一项，跳到 Step 2
- **B. 丢弃所有**：对每个 dir 执行以下操作后重新调用 `clarify-init.sh`：
  ```bash
  for d in <existing 列表>; do
    rm -rf "<repo_root>/tasks/$d"
    bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" delete-active --skill design \
      --repo-root "<repo_root>" --where-change-id "$d"
  done
  ```
- **C. 取消退出**：退出

#### 4.5 写入`intention.md`到 task 目录

落盘路径：`<repo_root>/<task_dir>/intention.md`（即 `.polaris/tasks/<task_name>/intention.md`）。

**强制前置**：写入前必须 `read_file templates/intention-template.md`，并输出 `[polaris-flow clarify] 已 read_file templates/intention-template.md`。**禁止**未读模板就生成内容。

内容严格按模板的 9 个固定节生成（Reframe 历程 / Constitution Alignment / Premises / Premise History / Decisions / Alternatives / 任务范围 / Open Questions / 下游约束）。各节内容来源（3.2 / Step 2 / 3.4 / 3.3）由本阶段对应步骤的产物填充；首行 `# intention: <task_id>` 暂用占位 `<TBD>`，4.4 敲定后回填。

### Step 5: intention.md评审 + 用户确认

#### 5.1 意图评审

输出 `[polaris-flow clarify] 意图评审暂未实现，请人工评审文档（务必确保该文档的准确性）。通过后作为后续生成OpenSpec的规格文档的唯一依据。`

#### 5.2 用户整体确认 intention.md

向用户输出预览并询问：

> 以上是完整的意图（包括架构、技术选型、任务范围），请 review 并确认是否可以进入下一阶段？
>
> （请回复"确认 / ok / 同意"等明确的整体确认；若仅对某个条目有意见，请直接指出该条目以便修改）

判定规则：


| 用户回复                         | 判定         | 后续动作                                                                   |
| ---------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| 明确整体确认（"确认/ok/同意"等） | 完成         | 进入 4.3                                                                   |
| 仅对某条/某节给出反馈            | **不算确认** | 修改对应内容后**重新执行 4.2**                                             |
| 模糊回复（"差不多"、"可以吧"）   | **不算确认** | **必须明确再问一次**："以上是完整的设计方案，请确认是否可以进入下一阶段？" |
| 沉默 / 无回复                    | **不算确认** | 同上                                                                       |

**禁止**把 3.1~3.4 中任何一处用户的局部"同意"当作整体确认。

#### 5.3 更新 state.yaml

**单次 Bash 调用**（封装了目录 mv / state.yaml 更新 / intention.md 首行回填 / workflow rename）：

```bash
PLUGIN_ROOT="$(cat "<repo_root>/.polaris/config.yaml" | grep "plugin_root" | awk -F'"' '{print $2}')"
FINAL_RESULT=$(bash "$PLUGIN_ROOT/hooks/clarify-finalize.sh" "<repo_root>" "<draft_name>" "<task_id>")
FINAL_EXIT=$?
echo "FINAL_EXIT=$FINAL_EXIT FINAL_RESULT=$FINAL_RESULT"
```


| `FINAL_EXIT` | 含义                 | 后续动作    |
| -------------- | ---------------------- | ------------- |
| 0            | 成功                 | 进入 5.4    |
| 1            | 目标目录已存在       | 按 H12 阻断 |
| 2            | 参数/环境错误        | 按 H12 阻断 |
| 3            | workflow rename 失败 | 按 H12 阻断 |

#### 5.4 输出完成状态行

输出 `[polaris-flow] 澄清 阶段完成：.polaris/tasks/<task_id>/intention.md 已锁定；state 状态已更新。` 并提示下一步 `/pofl:propose`。
