---
name: polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint
description: "当用户要从需求做出一个原型时使用——本技能是原型开发链的入口：只出《原型蓝图》并交人工确认，确认后由 build 制作、由 ship 评审并归档。用户要求：做个原型 / 制作原型 / 画原型 / 生成原型 / 从需求到原型交付 / 把需求转成原型 / 这个需求要做哪些页面 / 页面清单怎么定 / 梳理信息架构 / 出原型蓝图 / 先别做原型先说思路 / 需求转成页面结构。不触发：已有已确认蓝图、只要按蓝图继续做或重做已有原型（走 polaris{{SKN_SPR}}prototype{{SKN_SPR}}build）、只评审已有原型（走 polaris{{SKN_SPR}}prototype{{SKN_SPR}}review）、只做交付归档与任务收尾（走 polaris{{SKN_SPR}}prototype{{SKN_SPR}}ship）、只写 PRD 或需求文档、只做需求澄清与需求评审、只要低保真线稿或页面流程图（走 lofi-prototype）、只要技术方案 / 接口设计 / 数据库设计、只要视觉走查或设计规范文档。"
version: 1.1.0
---

# 原型蓝图 · 需求理解与制作思路

用途：需求理解 / 任务流 / 信息架构 / 页面体系与职责 / 《原型蓝图》/ 人工确认冻结

**本技能只出思路，不出原型。** 产物是经人工确认后冻结的《原型蓝图》，它是下一环节 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}build` 的输入；页面模式、页面结构、交互状态、视觉系统与 HTML 实现一律不在本技能范围内。

## 标识约定

输出目录由用户指定；**未指定时默认落 `$REPO_ROOT/.polaris/tasks/$task_id/`**，并把最终路径写进 `state.yaml` 的 `work_dir`——下一环节要按它找回产物。文件名用户有指定时以用户为准，否则按下列建议：

| 项 | 文件 | 对应步骤 | 说明 |
|---|---|---|---|
| 原型蓝图（核心成果·给人读） | `blueprint.md` | Step 4 | 一份连贯文档：定位 / 用户 / 黄金流 / IA / 页面清单与职责。确认后冻结 |
| 任务理解卡 | `task-card.md` | Step 3.1 | |
| 核心用户任务流 | `golden-flow.md` | Step 3.2 | 下一环节据此落 `<原型名>.flow.json` |
| 信息架构 | `ia.md` | Step 3.3 | |
| 页面清单与职责 | `page-list.md` | Step 3.4 | **机器契约**：下一环节 `scaffold.mjs init --pages=` 的直接输入 |

四份分项文档与 `blueprint.md` 必须一致；**冲突时以 `page-list.md` 为准并回报**——它是机器消费的那一份。

---

**启动时必须先输出**：`[polaris-flow 原型] 原型蓝图: 使用 polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint 技能。`

## 流程

### Step 0: 设置产物语言

读取 `.polaris/config.yaml` 的 `language`（规范化 ID，如 `en`、`zh`）；未配置时回退到当前用户请求语言。本技能所有提问与产出物均采用该语言。

### Step 1: 初始化目录及任务

使用 SessionStart 注入的路径（本 skill 内此后一律复用 `$REPO_ROOT` / `$PLUGIN_ROOT`）：

- 环境变量 `$PLUGIN_ROOT` / `$REPO_ROOT`（Trae `env`、 Cursor `env`、Claude `CLAUDE_ENV_FILE`，或 Agent 上下文中的同名赋值）
- 仍无 `$PLUGIN_ROOT` → 按 H12 阻断，提示用户重启会话以触发 SessionStart

```bash
if [ -z "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/scripts/workflow-entry.sh" ]; then
  echo "PLUGIN_ROOT unset or hooks missing — restart session to run SessionStart" >&2
  exit 2
fi

ACTIVE_RESULT=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind prototype --skill blueprint --repo-root "$REPO_ROOT")
ACTIVE_EXIT=$?
echo "ACTIVE_EXIT=$ACTIVE_EXIT ACTIVE_RESULT=$ACTIVE_RESULT"
```

**输出解读**（读 `ACTIVE_RESULT` JSON 数组，元素为 `task_id`）：

| `ACTIVE_EXIT` | 含义 | 后续动作 |
| ------------- | ---- | -------- |
| 0 且数组非空 | 存在未完结原型任务 | 按决策点协议询问 A/B/C/D（见下） |
| 0 且数组为空 | 无活跃原型任务 | 进入 Step 2 开启新任务 |
| 非 0 | 参数/环境错误 | 按 H12 阻断 |

存在活跃任务时，**必须**按 `./policies/decision-point.md` 暂停询问：

- **A. 继续最近任务**：`task_id` = 列表最后一项 → 进入 Step 1.5
- **B. 选择一个**：列出所有 `task_id` 候选让用户选择之后，再发出以下询问：

  > 当前选择任务 <task_id>，请确认以下操作：
  >
  > - **A. 续写当前任务**：进入 Step 1.5
  > - **B. 重新开始任务**：对当前 dir 执行下列命令后，进入 Step 2（重新产出需求组并建目录）
  >

  ```bash
  rm -rf "$REPO_ROOT/.polaris/tasks/$task_id"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind prototype --skill blueprint --repo-root "$REPO_ROOT" --where-task-id "$task_id"
  ```
- **C. 丢弃所有**：对每个 id 执行下列命令后，进入 Step 2

```bash
for d in <ACTIVE_RESULT 列表>; do
  rm -rf "$REPO_ROOT/.polaris/tasks/$d"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind prototype --skill blueprint --repo-root "$REPO_ROOT" --where-task-id "$d"
done
```

- **D. 取消退出**：结束本 skill

#### Step 1.5：读取任务进展，继续执行任务

读取 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml` 与 `work_dir` 下已落盘的产物：

| 判断依据 | 进入步骤 |
|---|---|
| `phase=blueprint` 且 `task-card.md` 缺失 | 进入 **Step 3.1** |
| `task-card.md` 在、`golden-flow.md` 缺 | 进入 **Step 3.2** |
| `ia.md` 缺 | 进入 **Step 3.3** |
| `page-list.md` 缺 | 进入 **Step 3.4** |
| 四份齐全、`blueprint.md` 缺或 `blueprint.status != confirmed` | 进入 **Step 4** |
| `phase=build` 或更后 | 提示用户该任务已过蓝图阶段，引导到 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}build` |
| 无法判定 | 按 `./policies/decision-point.md` 询问用户从哪个步骤继续 |

**进度以落盘产物为准**（产物即状态），`state.yaml` 只记身份与指针（`task_id` / `phase` / `name` / `work_dir`），不记「做到第几步」。

**命名标识补齐**（续写既有任务时先查 `state.yaml` 的 `name`）：

| `name` 状态 | 后续动作 |
|---|---|
| 缺失 | 补走 **Step 2.1** 确认 `task_id`、原型名与 Page ID 前缀后，再进入对应步骤继续 |
| 存在 | 直接沿用，后续文档名与 Page ID 一律以该前缀为准 |

### Step 2: 初始化

#### Step 2.1: 命名与建目录

按 `./policies/ask-question-react.md` **一次询问**确认下列三项（可分两轮若平台选项上限不够）：

1. **kebab-case 任务名 `task_id`**（目录名 / 游标身份）：AI 给 2–3 个候选，首个为默认；与已有 `$REPO_ROOT/.polaris/tasks/` 冲突时加数字后缀消歧并回显；用户指定须合规（小写字母、数字、连字符），非合规输入转换后**回显并再次确认**
2. **原型名**：AI 建议 3 个候选，用户选定或自行输入
3. **Page ID 前缀**（Page ID 形如 `<前缀>-P01`）：由用户输入；无输入时取原型名拼音首字母大写

**1. 建目录**：

```bash
INIT_RESULT=$(bash "$PLUGIN_ROOT/scripts/task-init.sh" "$REPO_ROOT" --kind prototype --task-id "$task_id")
INIT_EXIT=$?
echo "INIT_EXIT=$INIT_EXIT INIT_RESULT=$INIT_RESULT"
```

| `INIT_EXIT` | `status` | 后续动作 |
|---|---|---|
| 0 | `ok` | 目录与 `state.yaml` 已建，继续 ② |
| 1 | `existing` | **立即中断**：报告冲突目录，请用户改名或删除后重试；**禁止**向既有任务目录写入内容 |
| 2 | — | 参数/环境错误，按 H12 阻断 |

**2. 登记 workflow 游标**：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" append-active \
  --kind prototype --skill blueprint --repo-root "$REPO_ROOT" \
  --task-id "$task_id" --phase blueprint --worktree-path "" \
  --started-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

**3. 写入身份**到 `state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set-identity \
  --repo-root "$REPO_ROOT" --task-id "$task_id" \
  --name "<原型名>" --page-prefix "<前缀>" --work-dir "<工作目录路径>"
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind prototype --phase blueprint
```

**前缀经确认即冻结**——后续 `page-list.md` 的 Page ID、下一环节的原型文件名与 `flow.json` 一律以它为准，不得改写。

#### Step 2.2: 加载必读信息

`read_file` `./references/00-basis.md`，理解角色定位与方法论、能力 / 决策边界、核心原则与冻结规则。

**输入检查**（详见 `./references/02-inputs-handoff.md`）：最低输入 6 项（产品是什么 / 主要用户 / 最大业务问题 / 最重要的用户任务 / 原型用途 / 是否已有方案或旧系统）。已有资料能判断的**不重复询问**；缺项按 `./policies/decision-point.md` 一次性问齐，不逐项追问。

**两条不可协商的红线**（全文见 `./references/00-basis.md §三`）：上游已确认的名称与范围不得改写，缺口一律标记 `WEB-DESIGN-CHANGE-XXX`；上游给了设计系统 / 视觉规范时，只登记来源、不在本环节定取值。

### Step 3: 需求理解与思路形成

#### Step 3.1 理解需求 + 产品快速定义

先出《Web 原型任务理解卡》，它至少包含：

- 产品一句话定位；
- 主要用户；
- 使用场景；
- 当前问题；
- 核心目标；
- 3～5 个核心任务；
- 核心业务成果；
- 一期范围；
- 已知信息；
- 待确认信息。

需求转换公式：**原始需求 → 用户 × 场景 × 任务 × 问题 × 结果**。例：「做 AI 合同审查系统」应转换成
**合约专员 + 审查客户合同 + 快速发现风险并形成正式审查成果 + 当前人工审查时间长 + AI 先审、人确认**。

- 产出：`task-card.md`　判据：3–5 个核心任务各能追到一个真实用户场景；一期范围有边界；待确认项已列出而非留白　门禁：无

#### Step 3.2 黄金任务流

必须找到**最能体现产品价值的一条完整任务闭环**。
例：上传合同 → AI 解析 → AI 审查 → 查看风险 → 查看依据 → 人工确认 → 生成审查成果；
或 AI 发现隐患 → 查看详情 → 派单 → 整改 → 复核 → 闭环。

黄金任务流五原则：①先保证闭环；②优先服务高频、高价值任务；③页面围绕任务生成；④不为「功能丰富」破坏任务闭环；⑤演示 / 竞赛模式下原则上只保留 1～2 条。输出《核心用户任务流》。

- 产出：`golden-flow.md`　判据：有起点、有终点、有业务成果，且覆盖 Step 3.1 里最高频高价值的那个任务　门禁：无

#### Step 3.3 信息架构 IA

设计产品结构，不直接画页面。IA 原则：高频业务优先；一级导航控制数量；
「管理」和「配置」能力后置；不为「大系统感」堆菜单；一个导航项必须能对应明确用户任务；
同一业务对象尽量统一入口；管理、业务处理、分析、资产配置区分清楚。

推荐基础结构（**只是候选，不得机械套用**）：

```text
工作台
├─ 我的待办
├─ 重点提醒
└─ 最近任务

核心业务
├─ 新建 / 发起
├─ 处理中
├─ 已完成
└─ 业务详情

分析 / AI
├─ AI分析
├─ 风险 / 异常
└─ 分析结果

资产
├─ 模板
├─ 规则
└─ 知识

系统
├─ 用户
├─ 权限
└─ 参数
```

**命名与品牌层级规范**（产品身份、Header 单一主名称、多层品牌、名称冲突、菜单命名去冗余）以 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}build` → `references/05 §16.1` 为准——**本阶段就要用**，等做到页面再回头改名字就是大面积返工。

- 产出：`ia.md`　判据：每个一级导航项对应一个明确用户任务；Header 主名称唯一且全站一致　门禁：无

#### Step 3.4 页面体系与职责划分

不设页面数量的机械上限或下限，数量由 **用户任务 + 业务闭环 + 信息架构 + 页面职责 + 交互复杂度** 自然推导——不得为「页面少」强行合并本应独立的复杂任务，也不得为「系统看起来完整」创建没有明确用户任务的页面。

**页面存在的必要性判断**——一个页面至少应满足一项：①承载一个明确、独立的用户任务；②承载一个需要持续操作的复杂业务对象；③是核心业务闭环中的必要阶段；④需要独立的信息空间才能保证认知清晰；⑤内容复杂度已不适合通过 Dialog / Drawer 承载；⑥承担独立的分析、决策、审核、配置或工作任务。答不出「用户为什么需要进入这个页面」就重新审查必要性。

**页面职责原则**：*不追求页面多，也不追求页面少；追求页面职责清晰、用户任务完整。*
一个页面应有明确的主任务——同时承担过多复杂任务，并出现信息过载、操作路径混乱、需频繁切换上下文、状态过多难以理解、主操作不清晰、研发实现与测试边界不清时，考虑拆分；反之，两页只是形式不同而任务高度一致时，考虑合并或用 Tab / Drawer / 分区承载。

输出《Web 页面清单与页面职责说明》，至少含：Page ID、页面名称、使用角色、页面主任务、主要业务对象、主要入口、主要出口 / 下一步、对应业务场景 / 用户任务、是否存在待产品确认事项。

**页面数量、优先级、建设批次、实现深度由产品经理决定**（边界见 `./references/00-basis.md §二`）——本技能只负责把必要性与职责讲清楚，不替产品经理取舍。

- 产出：`page-list.md`　判据：每页都能回答「用户为什么进这个页面」且入口、出口齐全　门禁：**软**——定稿即下一环节 `scaffold.mjs init` 的输入，此后增删页面走 `add-page`，不再重排

### Step 4: 人工确认 → 冻结（阻塞点）

把 Step 3.1–3.4 的四份产物汇总成一份连贯的《原型蓝图》（`blueprint.md`），主干控制在人能读完的长度，细节以指针引回分项文档。

按 `./policies/decision-point.md` 暂停并发起问答询问：

> 请**仔细**阅读《原型蓝图》及分项文档，**审查**后确认是否可以按此思路制作原型？
>
> 本原型的定稿标识：任务 `task_id`｜原型名「<原型名>」｜Page ID 前缀 `<前缀>`（后续 Page ID `<前缀>-P01`、`flow.json`、原型文件名均以此为准）
>
> （请回复「确认 / ok / 同意」等明确整体确认；若仅对某条有意见，请直接指出以便修改）

| 用户回复 | 判定 | 后续动作 |
| --- | --- | --- |
| 明确整体确认 | 完成 | 进入 Step 5 |
| 仅对某条 / 某节反馈 | **不算确认** | 修改后**重新执行 Step 4** |
| 模糊回复（「差不多」「可以吧」） | **不算确认** | 必须再问一次明确确认 |
| 沉默 / 无回复 | **不算确认** | 同上 |

**确认即冻结**：此后《原型蓝图》及四份分项文档不得再改写。确认后又发现需求缺口或矛盾，一律标记
`WEB-DESIGN-CHANGE-XXX`（命名冲突用 `WEB-DESIGN-CHANGE-NAME-XXX`）写入 `blueprint.md` 的待确认区并回报，**不在本环节自行修正**。

### Step 5: 推进到制作环节

用户明确确认后：

1. 推进 workflow 阶段至 build

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind prototype --skill blueprint --repo-root "$REPO_ROOT" --where-task-id "$task_id" --set phase=build
```

2. 更新 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind prototype \
  --phase blueprint --next-phase build
```

3. 输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**）。
   先按「自动衔接下一阶段」一节运行 `state next`，**下一步的技能名与括注均取自其输出**
   —— `SKILL` 直填；括注按 `NEXT` 取（`manual` → 「建议新开会话」；`auto` → 「可同会话继续」）。**两者都不得写死**：

```text
[polaris-flow 原型] 原型蓝图 - 环节完成，状态已落盘。
下一步：/<SKILL>（建议新开会话 | 可同会话继续）。
恢复：先读 .polaris/tasks/<task_id>/state.yaml 的 work_dir，再读该目录下 blueprint.md 与四份分项（task-card / golden-flow / ia / page-list），从下一步技能的 Step 0 开始。
```

## 退出条件

1. 《原型蓝图》`blueprint.md` 已落盘，且 `task-card.md` / `golden-flow.md` / `ia.md` / `page-list.md` 四份分项齐全、内容互相一致；
2. **已取得人工明确确认**（Step 4 判定表的「完成」，其余三种回复均不算）；
3. `state.yaml` 已写入 `phase: build` 与 `blueprint.status: completed`。

未同时满足三条，不得宣告本环节结束，也不得让流程进入制作环节。

---

## 上下文压缩恢复

重载：`task_id`、任务目录下已落盘的产出（`task-card.md` / `golden-flow.md` / `ia.md` / `page-list.md` / `blueprint.md`）、
`state.yaml` 的 `blueprint.status`、本技能停在哪个 Step。

- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 **Step 3.x** → 按已落盘的最后一份分项续做（四份分项互相独立，缺哪份补哪份）
- 停在 **Step 4（人工确认）** → 重新发起确认；**不得**因为「文档已齐全」自行判定为已确认
- 停在 **Step 5** → 只补阶段推进与状态写入，**不重做** Step 3
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```