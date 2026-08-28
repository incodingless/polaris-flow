---
name: write-prd-doc
description: "This skill should be used when the user wants to author product requirement documents (PRD) from user stories through a staged, resumable workflow. It supports per-requirement directory isolation, stage tracking, and breakpoint resume, with a config file defining where documents are generated and where they are archived. Trigger when the user says things like 写产品需求, 根据用户故事生成需求文档, PRD, 需求规格, 把用户故事展开成需求, or asks to clarify, draft, review, or archive a requirement. Six stages: clarify, draft, detail, review, archive."
version: 0.1
---

# 编写产品需求

将用户故事逐步展开为结构化的产品需求文档。

## 何时使用

- 用户提供用户故事，希望得到完整、可评审、可测试的产品需求文档。
- 需要多轮澄清、草稿确认、详细规格、评审报告与归档的端到端流程。
- 需要把多个需求彼此隔离，并跟踪每个需求各自生成到哪个阶段。
- 流程中途被打断后，希望从上次停下的阶段继续（断点续做）。


<HARD-GATE>

</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 需求工程] 进入阶段: 澄清需求 — 使用 {{SKILL_NAME_PREFIX}}write-prd-doc 技能。`

## 流程（每次调用都先执行）

### Step 0: 设置产物语言

读取 `.polaris/config.yaml` 的 `language`（规范化 ID，如 `en`、`zh`）。无配置时回退到当前用户请求语言。

本阶段所有提问、澄清摘要均以该语言为主语言。

### Step 1: 初始阶段

### 1.0 加载宪法（注入点 A）

读取 `openspec/memory/constitution.md`（若存在且无占位符）。后续写入 `prd.md`「宪法对齐」节时使用。

#### 1.1 加载任务并选择

使用 SessionStart 注入的路径（本 skill 内此后一律复用 `$REPO_ROOT` / `$PLUGIN_ROOT`）：

- 环境变量 `$PLUGIN_ROOT` / `$REPO_ROOT`（Trae `env`、 Cursor `env`、Claude `CLAUDE_ENV_FILE`，或 Agent 上下文中的同名赋值）
- 仍无 `$PLUGIN_ROOT` → 按 H12 阻断，提示用户重启会话以触发 SessionStart

```bash
if [ -z "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/scripts/task-init.sh" ]; then
  echo "PLUGIN_ROOT unset or hooks missing — restart session to run SessionStart" >&2
  exit 2
fi

INIT_RESULT=$(bash "$PLUGIN_ROOT/scripts/task-init.sh" "$REPO_ROOT")
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
- **C. 丢弃所有**：对每个 dir 执行下列命令后，**重新**调用 `clarify-init.sh`，再进入 Step 1.5：

```bash
for d in <existing 列表>; do
  rm -rf "$REPO_ROOT/.polaris/tasks/$d"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --skill clarify --repo-root "$REPO_ROOT" --where-change-id "$d"
done
```

- **D. 取消退出**：结束本 skill

### Step 2：开启新任务

进入本子流程前必须 `read_file ./policies/response-posture.md`，并按其行为对照表、Pushback Patterns推回、回复前自检执行。

#### 2.1 创建任务目录

```bash

```


#### 2.2 

### Step 3：理解并澄清用户需求

#### 3.1 理解用户需求


#### 3.2 查阅需求文档库


#### 3.3 拆解用户故事


#### 3.4 识别歧义与缺口

#### 3.5 澄清

#### 3.6 编写 `clarifications.md`

#### 3.7 用户确认 `clarifications.md` （阻塞点）

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

用户明确确认后，输出：`[polaris-flow] 澄清阶段完成：.polaris/docs/prd/<task_id>/clarifications.md 已锁定；state 已更新。`

### Step 4：编写草稿（draft）

#### 4.1 生成需求草稿

1. 基于 `clarifications.md`，撰写产品需求草稿：
   - 目标与背景；
   - 范围（包含/不包含）；
   - 功能点清单（每个功能一行概要，含编号）；
   - 关键用户旅程 / 主流程；
   - 核心页面或系统交互；
   - 非功能性需求初稿；
   - 开放问题。
2. 仅写到“概要/大纲”层级，不展开逐字段逻辑。可参考 `references/prd_template.md` 的章节骨架。

#### 4.2 用户确认
3. **提交用户确认与完善**：用简洁总结或 `AskUserQuestion` 请用户确认方向，收集补充。
   未获确认不得进入 `detail`。

**输出**：`prd_draft.md`

### Step 5：编写详细规格（detail）
对 `prd_draft.md` 中的每个功能点，按 `references/prd_template.md` 的“功能规格块”
结构编写：
- 功能编号、标题、描述、关联用户故事；
- **前置条件**（preconditions）；
- **后置条件**（postconditions）；
- **业务逻辑**（分步描述主流程与分支）；
- **数据输入**（字段名、类型、来源、校验规则）；
- **数据输出**（字段、落库/下游）；
- **验收标准**（Given/When/Then，可测）；
- **异常与错误处理**；
- **依赖**。
将各功能块汇总为 `prd_detail.md`，并合并 `prd_draft.md` 形成 `prd_final.md`（评审前草稿）。

### Step 6：审查需求并定稿（review）
**目的**：质量门禁，确保交付物达标。

**流程**：依据 `references/review_checklist.md` 从四个维度评审：
1. **内容符合性**：是否满足用户故事与 `clarifications.md` 的范围与假设；是否完整。
2. **结构符合性**：是否遵循 `references/prd_template.md`，必填章节是否齐全、格式一致。
3. **用户故事覆盖度**：每条用户故事/验收点是否映射到具体功能与验收标准。
4. **可测性**：验收标准是否可度量、是否 Given/When/Then 表述、是否有明确判定。
产出 `review_report.md`（每项 通过/不通过、严重级别、必须修改项）。若存在严重（blocker）不通过，
调用 `reset --stage detail`（或 `clarify`）回到对应阶段修正后重新评审；全部通过方可归档。

**输出**：`review_report.md`、`prd_final.md`（定稿）

### Step 7：归档需求（archive）
*目的**：将终稿保存到配置指定的归档位置，保留可追溯记录。

**流程**：将 `prd_final.md`、`review_report.md` 及 `.prd-state.json` 复制到
`<archive>/<需求id>/`。生成目录中的副本可保留以便迭代。完成后 `complete --stage archive`。

**输出**：归档目录中的文件


1. **定位并加载配置**
   - 若用户给出了配置文件路径，直接 `load`；否则用 `find` 向上递归查找
     `prd-config.yaml/.yml/.json`。
   - 命令：`python scripts/config_manager.py find --start <cwd>`；
     然后 `python scripts/config_manager.py load --config <路径>`。
   - 若找不到配置：复制 `assets/prd-config.yaml` 到合适位置，请用户填写生成/归档位置后继续。
     没有配置不得继续（生成与归档位置为必需）。
   - 记录返回的 `workspace`（绝对路径）与 `archive`（绝对路径）。

2. **确定需求并初始化或恢复**
   - 需求 id：优先用用户显式给定的 id；否则由标题派生（英文标题取 slug，中文标题取短哈希）。
   - 检查 `<workspace>/<id>/.prd-state.json`：
     - **存在** → 恢复模式：读取状态，确定从中断点继续。
     - **不存在** → 初始化：`python scripts/state_manager.py init --workspace <workspace>
       --title <标题> --user-story <故事> [--id <id>] [--library <requirement_library>]`。
   - 运行 `python scripts/state_manager.py next --dir <需求目录>`，得到本次要执行的 `stage`。

3. **执行该阶段**（见 `references/stages.md` 对应章节），产出文件后调用
   `python scripts/state_manager.py complete --dir <需求目录> --stage <stage>
   --outputs <文件名列表>`。若阶段需要用户交互后暂存，可用
   `set --stage <stage> --status in_progress`。

4. **继续或结束**：再次 `next`。返回下一阶段则执行；返回 `DONE` 则结束并汇总。
   `prototype` 阶段仅在 `generate_prototype=true` 或用户要求时执行。当 `next` 返回
   `prototype` 但配置未启用且用户未要求时，用
   `complete --stage prototype --note "skipped: prototype disabled"` 将其关闭，使状态达到
   `DONE`；若启用或用户要求，则生成原型后再 `complete`。

> 断点续做原理：阶段进度写在 `.prd-state.json`。任何中断后重新调用本技能，第 2 步会自动
> 从首个未完成阶段继续。若要回退某阶段，使用 `reset --stage <stage>`——该阶段及其之后全部
> 置为 `pending`，下次 `next` 从该阶段重跑。

## 六个阶段（要点）

1. **clarify** — 查阅 `requirement_library`，拆解用户故事，识别歧义，用 `AskUserQuestion`
   与用户交互澄清；产出 `clarifications.md`。**必须用户参与**。
2. **draft** — 据澄清写高层草稿（目标/范围/功能清单/旅程/NFR/开放问题），提交用户确认完善；
   产出 `prd_draft.md`。**必须用户确认**。
3. **detail** — 对每个功能点按 `references/prd_template.md` 的“功能规格块”写前置/后置条件、
   业务逻辑、数据输入/输出、验收标准、异常；产出 `prd_detail.md` 并合并 `prd_final.md`。
4. **review** — 按 `references/review_checklist.md` 四维度（内容/结构/覆盖度/可测性）评审，
   产出 `review_report.md`。有 blocker 则 `reset` 回对应阶段修正后重评。
5. **archive** — 将 `prd_final.md`、`review_report.md`、`.prd-state.json` 复制到
   `<archive>/<id>/`。
6. **prototype**（可选）— 按 `prototype_format`（默认 html）生成可交互原型于
   `<需求目录>/prototype/`。

## 交互约定

- `clarify` 与 `draft` 是强制交互点：必须使用 `AskUserQuestion` 或结构化提问，
  将问题分组（每组 1–4 个），不要一次性抛出过多问题，未获确认不得进入下一阶段。
- 文档的实际内容由你撰写；脚本只负责配置解析、目录隔离与阶段状态管理。