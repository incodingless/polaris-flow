---
name: polaris-flow{{SKILL_NAME_SPLITTER}}prd-draft
description: "This skill should be used when the user wants to author product requirement documents (PRD) from user stories through a staged, resumable workflow. It supports per-requirement directory isolation, stage tracking, and breakpoint resume, with a config file defining where documents are generated and where they are archived. Trigger when the user says things like 写产品需求, 根据用户故事生成需求文档, PRD, 需求规格, 把用户故事展开成需求, or asks to clarify, draft, review, or archive a requirement. Six stages: clarify, draft, detail, review, archive."
version: 0.1
---

# 编写产品需求-探索并澄清需求

<HARD-GATE>

</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 需求工程] 进入阶段: 探索并澄清需求 — 使用 polaris-flow{{SKILL_NAME_SPLITTER}}prd-discovery 技能。`

## 流程

### Step 0: 设置产物语言

读取 `.polaris/config.yaml` 的 `language`（规范化 ID，如 `en`、`zh`）。无配置时回退到当前用户请求语言。

本阶段所有提问、澄清摘要均以该语言为主语言。

### Step 1: 加载任务并选择

使用 SessionStart 注入的路径（本 skill 内此后一律复用 `$REPO_ROOT` / `$PLUGIN_ROOT`）：

- 环境变量 `$PLUGIN_ROOT` / `$REPO_ROOT`（Trae `env`、 Cursor `env`、Claude `CLAUDE_ENV_FILE`，或 Agent 上下文中的同名赋值）
- 仍无 `$PLUGIN_ROOT` → 按 H12 阻断，提示用户重启会话以触发 SessionStart

```bash
if [ -z "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/hooks/prd/task-init.sh" ]; then
  echo "PLUGIN_ROOT unset or hooks missing — restart session to run SessionStart" >&2
  exit 2
fi

INIT_RESULT=$(bash "$PLUGIN_ROOT/hooks/prd/task-init.sh" "$REPO_ROOT")
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

#### Step 1.5：丢弃所有任务

```bash
for d in <existing 列表>; do
  rm -rf "$REPO_ROOT/.polaris/tasks/$d"
  bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" delete-active --skill clarify --repo-root "$REPO_ROOT" --where-change-id "$d"
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