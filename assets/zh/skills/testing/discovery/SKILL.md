---
name: polaris{{SKN_SPR}}testing{{SKN_SPR}}discovery
description: 触发场景：用户持有定稿的 PRD（含验收标准），需要先定清「要测什么」——梳理测试意图、锁定需求条目清单、确定测试范围与测试粒度、选择分层与自动化策略（如「编写测试用例」「设计测试用例」「梳理解测试范围」「测哪些」「测试计划」）。本技能覆盖单个阶段：探索并澄清测试意图，输出《测试计划》testcase_plan.md。硬性约束：用例源于需求不源于想象；需求条目编号沿用 PRD 原编号；不得臆造需求未声明的行为；范围与策略必须经用户确认。
version: 0.1
---

# 测试用例-探索并澄清测试意图

<HARD-GATE>
- **需求为唯一来源**：一切测试意图与用例设计以定稿 PRD（含验收标准）为唯一需求来源；PRD 未声明的交互、文案、错误码、数值一律不得臆造。
- **测试意图先于用例正文**：本阶段只产「要测什么」的总纲，不写用例；未定版测试意图清单前禁止进入用例设计。
- **条目编号沿用上游**：需求条目必须沿用 PRD 原编号；PRD 无编号时才按 `F{章节}-{序号}` 补编，规则一经确定全程不变。
- **范围与策略必须留痕**：测试范围、测试粒度、分层策略、自动化策略四项均须经用户确认并落盘，禁止 AI 单方面定版。
- **输入缺失即阻断**：无定稿 PRD 或缺验收标准时阻断，先补齐上游；不得凭印象开工。
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 测试用例] 进入阶段: 探索并澄清测试意图 — 使用 polaris{{SKN_SPR}}testing{{SKN_SPR}}discovery 技能。`

## 标识约定

本族**不新起编号命名空间**，全部追溯标识复用上游 PRD 已有的编号前缀（`req_prefix`），从而与需求条目一一对上：

| 标识 | 用途 | 示例 |
|---|---|---|
| 任务名（`$task_id`） | `.polaris/testcases/<task_id>/` 目录名、脚本参数、workflow 游标 | `testcase-user-privilege` |
| **需求条目编号** | 用例的追溯锚点；**沿用 PRD 原编号**（功能点 `{前缀}-F{dd}-{dd}`、业务规则 `{前缀}-BR-{ddd}`）；PRD 无编号时补编 `F{章节}-{序号}` | `UAP-F01-01` / `UAP-BR-101` / `F3-07` |
| **用例编号** | 单条用例的唯一 ID：`TC-{需求条目编号}-{两位序号}` | `TC-UAP-F01-01-01` |
| **场景分类** | 六类固定分类语言（唯一源见 §判据） | 正常路径 / 边界值 / 异常输入 / 依赖异常 / 状态校验 / 幂等并发 |
| **优先级** | 唯一优先级轴 P0 / P1 / P2 | `P0` |
| **执行分层** | 执行批次与准入视图 L1 / L2 / L3 / L4 | `L1` |

> **两条轴不可混用**：优先级（P0/P1/P2）回答「单条用例多重要」，由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks` 的 `references/test-case-checklist.md` 定义并被 verify 消费；执行分层（L1-L4）回答「按什么批次跑、什么算准入」，独有价值是 **L1 的准入闸门语义**（L1 100% 通过才放行）。映射口径见 `polaris{{SKN_SPR}}testing{{SKN_SPR}}draft` 的 `references/01-case-design-criteria.md`。

## 判据（唯一源，本技能不复制）

| 判据 | 唯一源 | 消费方式 |
|---|---|---|
| 场景枚举语言（6 大类）与优先级 | `polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks` 的 `references/test-case-checklist.md` | 本族按技能名引用；需求级扩展见 `polaris{{SKN_SPR}}testing{{SKN_SPR}}draft` 的 `references/01-case-design-criteria.md` |
| 用例字段、分层定义、追溯矩阵、覆盖校验 | `polaris{{SKN_SPR}}testing{{SKN_SPR}}draft` 的 `references/01-case-design-criteria.md`（族内唯一源） | 本阶段确定策略时读它，`draft` / `review` 共用同一份 |
| 执行口径（五槽 / 三级分叉 / 覆盖率 / 基线红名单） | `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` | 本族**不跑测试**，只给指针 |
| 《测试计划》文档结构 | `./templates/testcase-plan-template.md` | Step 7 落盘时**必读** |
| 停顿协议 / 自动衔接 / 硬约束 | `./policies/*`（顶层注入） | `decision-point.md`、`ask-question-react.md`、`auto-transition.md`、`hard-stops.md` |

## 流程

> **压缩上下文通用规则**：每个 Step 收尾时，统一释放该步的中间推导草稿、重复条目、冗余对话与已闭环问题的原始草稿；仅保留已确认结论、剩余待澄清项、变更记录、隐含假设清单（下文各「压缩上下文」子步骤只列本步需保留的关键产出）。
>
> **用词与模板的唯一来源**：`./policies/auto-transition.md` 的「压缩时机与恢复清单」。注意「压缩上下文」**不同于**「新开会话」。**禁止**在步骤中途提压缩，**禁止**用 shell 命令或摘要伪造压缩。

### Step 0：设置产物语言

读取 `.polaris/config.yaml` 的 `language`（规范化 ID，如 `en`、`zh`）；未配置时回退到当前用户请求语言。本阶段所有提问与落盘产物均采用该语言。

### Step 1：状态检查与中断恢复

使用 SessionStart 注入的路径（本技能此后一律复用 `$REPO_ROOT` / `$PLUGIN_ROOT`）：

- 环境变量 `$PLUGIN_ROOT` / `$REPO_ROOT`（Trae `env`、Cursor `env`、Claude `CLAUDE_ENV_FILE`，或 Agent 上下文中的同名赋值）
- 仍无 `$PLUGIN_ROOT` → 按 `./policies/hard-stops.md` H12 阻断，提示用户重启会话以触发 SessionStart

```bash
if [ -z "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/scripts/workflow-entry.sh" ]; then
  echo "PLUGIN_ROOT unset or hooks missing — restart session to run SessionStart" >&2
  exit 2
fi

ACTIVE_RESULT=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind testcase --skill discovery --repo-root "$REPO_ROOT")
ACTIVE_EXIT=$?
echo "ACTIVE_EXIT=$ACTIVE_EXIT ACTIVE_RESULT=$ACTIVE_RESULT"
```

**输出解读**（读 `ACTIVE_RESULT` JSON 数组，元素为 `task_id`）：

| `ACTIVE_EXIT` | 含义 | 后续动作 |
|---|---|---|
| 0 且数组非空 | 存在未完结的测试用例任务 | 按 `./policies/decision-point.md` 询问 A/B/C/D（见下） |
| 0 且数组为空 | 无活跃任务 | 进入 Step 2 开启新任务 |
| 非 0 | 参数/环境错误 | 按 `./policies/hard-stops.md` H12 阻断 |

存在活跃任务时，**必须**按 `./policies/decision-point.md` 暂停询问：

- **A. 继续最近任务**：`task_id` = 列表最后一项 → 进入 Step 1.5
- **B. 选择一个**：列出所有 `task_id` 候选让用户选择之后，再发出确认询问：

  > 当前选择任务 <task_id>，请确认以下操作：
  >
  > - **A. 续写当前任务**：进入 Step 1.5
  > - **B. 重新开始任务**：对当前目录执行下列命令后，进入 Step 2
  >

  ```bash
  rm -rf "$REPO_ROOT/.polaris/testcases/$task_id"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind testcase --skill discovery --repo-root "$REPO_ROOT" --where-task-id "$task_id"
  ```
- **C. 丢弃所有**：对每个 id 执行下列命令后，进入 Step 2

  ```bash
  for d in <ACTIVE_RESULT 列表>; do
    rm -rf "$REPO_ROOT/.polaris/testcases/$d"
    bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind testcase --skill discovery --repo-root "$REPO_ROOT" --where-task-id "$d"
  done
  ```
- **D. 取消退出**：结束本技能

### Step 1.5：读取任务进展，继续执行任务

读取 `$REPO_ROOT/.polaris/testcases/$task_id/state.yaml`，按落盘产物判定续跑位置（**产物即状态**，不靠 `phase` 回推）：

| 落盘产物 | 进入步骤 |
|---|---|
| `testcase_plan.md` 仍是 task-init 写入的占位（仅标题 + `<!-- Skill 填充正文 -->`） | 视为**未启动任务**，目录/游标已就绪，直接进入 **Step 3** |
| `testcase_plan.md` 已有第 2 章「测试意图清单」实质内容 | 从对应未完成章节续写（Step 4 之后） |
| `phase=draft` 或更后 | 提示该任务已过 discovery，引导到 `polaris{{SKN_SPR}}testing{{SKN_SPR}}draft` |
| 无法判定 | 按 `./policies/decision-point.md` 询问用户从哪一步继续 |

### Step 2：初始化任务（仅无活跃任务时）

#### 2.1 命名与来源确认（阻塞点）

从上游 PRD 派生**推荐任务名**（kebab-case，如由 `UAP-用户权限精细化` 派生 `testcase-user-privilege`），给 2–3 个候选并回显其范围，按 `./policies/decision-point.md` 暂停让用户选定或自拟。

任务名约束（与 `prd/discovery` 一致）：

- 一律 kebab-case 英文（小写字母、数字、连字符）
- 与已有 `$REPO_ROOT/.polaris/testcases/` 目录冲突时加数字后缀（如 `-2`）消歧并回显，不得静默改名
- 推荐名默认采用；用户指定非合规名称时转换为 kebab-case 后**回显并再次确认**

#### 2.2 建目录 + 登记游标（不可省略）

本族的 `testcase_plan.md` 由 kind 的 `bootstrapFiles` 在 `task-init` 时自动创建，**不要手写该文件**：

```bash
INIT_RESULT=$(bash "$PLUGIN_ROOT/scripts/task-init.sh" "$REPO_ROOT" --kind testcase --task-id "$TASK")
INIT_EXIT=$?
echo "TASK=$TASK INIT_EXIT=$INIT_EXIT INIT_RESULT=$INIT_RESULT"
```

| `INIT_EXIT` | `status` | 后续动作 |
|---|---|---|
| 0 | `ok` | 目录、`state.yaml`、`testcase_plan.md` 已建，继续登记游标 |
| 1 | `existing` | **立即中断**：报告冲突目录，请用户改名或删除后重试；**禁止**向既有任务目录写入内容 |
| 2 | — | 参数/环境错误，按 `./policies/hard-stops.md` H12 阻断 |

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" append-active \
  --kind testcase --skill discovery --repo-root "$REPO_ROOT" \
  --task-id "$TASK" --phase discovery --worktree-path "" \
  --started-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

登记后用 `get-active-changes --kind testcase` 校验任务名已在返回列表中；缺则重跑 `append-active`，不得带着遗漏进入 Step 3。

输出：`[polaris-flow 测试用例] 已创建测试用例任务：<task_id>`

### Step 3：输入加载 + 需求条目编号

#### 3.1 加载必需输入（缺失即阻断）

**必需**：定稿 PRD（唯一需求真相）。按下列顺序定位，命中即用：

1. 用户在 flow 附加上下文给出的 PRD 路径
2. `$REPO_ROOT/docs/prd/{前缀}-{中文名}-需求终稿-*.md`（`polaris{{SKN_SPR}}prd{{SKN_SPR}}ship` 交付位置）
3. `$REPO_ROOT/.polaris/tasks/<prd_task_id>/prd-final-v1.0.md`（未交付的终稿）

**必需**：PRD 中的验收标准。逐条检查需求条目是否带可判定的验收标准（Given/When/Then）：

- 全部齐备 → 继续 3.2
- 存在缺验收标准的条目 → **阻断**，输出缺失清单，提示先执行 `polaris{{SKN_SPR}}testing{{SKN_SPR}}acceptance`（或 `polaris{{SKN_SPR}}prd{{SKN_SPR}}testability`）补全；**禁止**为其设计用例

#### 3.2 加载可选输入（缺失不阻断）

| 可选输入 | 用起来提升什么 | 缺失处理 |
|---|---|---|
| 交互原型 | 页面流转、操作入口、字段交互规则 | 记 `No-Input`，在计划与后续报告中声明 |
| 数据库表设计 | 数据落库断言、字段约束、表间关联 | 同上 |
| 接口清单（如 ApiFox 导出） | 接口用例的入参/响应与场景串设计 | 同上 |

> 三类可选输入的缺失**不构成阻断**，但**必须显式记 `No-Input`**，不得静默跳过——否则 `review` 无法区分「没测」与「本就无法测」。

#### 3.3 需求条目编号

逐条拆解 PRD，产出**需求条目清单**（本族全部用例的追溯锚点）：

- 有编号的需求条目 → **原样沿用**（功能点 `{前缀}-F{dd}-{dd}`、业务规则 `{前缀}-BR-{ddd}`）
- 无编号的条目 → 按 `F{章节}-{序号}` 补编，并在计划中标注「补编」
- 同时提取每条目的：验收标准（GWT）、业务规则引用、状态流转、非功能指标
- 标注**可从需求判定的条目**与**信息缺口条目**（缺口条目列入待确认清单，不进入用例设计）

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind testcase --phase discovery
```

#### 压缩上下文

- 释放：PRD 全文、逐条拆解草稿、原始扫描文本
- 保留：需求条目清单（编号 + 验收标准索引）、信息缺口清单、`No-Input` 声明

### Step 4：测试意图清单（模块 → 子功能 → 功能点）

按三级拆解需求，产出**测试意图清单**——它是后续 `draft` 的总纲，用于防止漏测：

1. **模块级**：按 PRD 的功能模块（如 `{前缀}-F01`）划分一级
2. **子功能级**：每个模块下拆出子功能（用户可识别的行为单元）
3. **功能点级**：每个子功能落到具体功能点；每个功能点标注：对应需求条目编号、测试验证目标（一句话）、验收标准来源

**约束**：

- 一个功能点对应一个明确的测试验证目标；目标含糊即回退到 PRD 补信息，不得带模糊目标进入起草
- 逐条标注来源需求条目编号；**无来源的意图不得保留**（防止需求蔓延）
- 需求条目清单中的每一条，必须至少落到一个功能点；未落到的条目必须显式说明原因（如信息缺口待确认）

#### 压缩上下文

- 释放：PRD 逐句拆解中间稿、候选意图的讨论过程
- 保留：三级测试意图清单、来源映射、信息缺口清单

### Step 5：测试范围与粒度确认（阻塞点）

按 `./policies/ask-question-react.md` 发起**一轮**询问（按 `./policies/decision-point.md` 暂停；选项上限以 `ask-question-react.md` 的平台注册表为准）：

> 请确认本次测试的**范围**与**粒度**：
>
> **范围**（覆盖哪些模块/需求条目）：
> A. 全量覆盖 PRD 全部需求条目（默认）
> B. 指定模块
> C. 指定需求条目子集
>
> **粒度**：
> A. 场景级——一条用例只验证一个可判定结论（**默认推荐**）
> B. 功能级——一条用例覆盖一个功能点主流程

| 用户答复 | 处理 |
|---|---|
| 给出范围 + 粒度 | 落盘；未指定粒度时按**场景级**默认并回显说明 |
| 只给其中一项 | 回显已选项，请用户补齐另一项，**不得**默认补全 |
| 回复模糊（「都行」「你定」） | 按 `./policies/decision-point.md` 要求明确答复；**不得**替用户选 |

**范围校验**：选定范围内的**每条**需求条目都必须有测试意图覆盖；范围外条目在计划中显式列出（「本次不测」），防止事后被当作漏测。

### Step 6：分层策略与自动化策略（阻塞点）

按 `./policies/ask-question-react.md` 发起**一轮**询问：

> 请确认**分层策略**与**自动化策略**：
>
> **分层**（本版做几层：L1 主流程 / L2 正常分支 / L3 异常 / L4 深度穿透）：
> A. L1+L2（功能验证，最常用）
> B. L1+L2+L3（含异常与边界）
> C. L1–L4 全量（含并发/事务/性能穿透）
>
> **自动化**：
> A. 本版只产手工用例（默认）
> B. 同时约定待转自动化的批次（L1 优先）

| 用户答复 | 处理 |
|---|---|
| 完整答复 | 落盘为策略基线 |
| 不完整 | 回显缺失项并要求补齐 |
| 与 PRD 风险不匹配（如高风险需求只选 L1+L2） | **给出提示但不强制**；用户坚持则记录「已提示、用户坚持」 |

分层定义与 P 级映射见 `polaris{{SKN_SPR}}testing{{SKN_SPR}}draft` 的 `references/01-case-design-criteria.md`，**本技能不复制该表**。

### Step 7：出口门禁 + 落盘《测试计划》

**门禁自检**（全部通过才允许推进）：

| 检查项 | 通过标准 |
|---|---|
| 输入齐备 | 定稿 PRD 已定位；缺验收标准的条目已阻断或已补齐 |
| 编号唯一 | 需求条目编号无重复；补编项已标注 |
| 意图完整 | 范围内每条需求条目至少落到一个功能点；未落到的有显式原因 |
| 无孤儿 | 每个功能点都能追溯到需求条目编号 |
| 策略定版 | 范围、粒度、分层、自动化四项均已由用户确认 |
| 可选输入 | 未提供的可选输入已记 `No-Input` |

门禁不通过 → **不得推进**，回到对应 Step 补正后重跑本步。

**落盘**：**必读**（强制前置）`read_file ./templates/testcase-plan-template.md`，按其章节与表格结构写入 `$REPO_ROOT/.polaris/testcases/<task_id>/testcase_plan.md`（增量写入 task-init 已建的文件，不重新初始化；**不得增删章节**）。

输出：`[polaris-flow 测试用例] 测试意图已定版：需求条目 {N} 条、功能点 {M} 个、范围 {范围}、粒度 {粒度}。`

### Step 8：完成 discovery 阶段

用户明确确认《测试计划》后：

1. 推进 workflow 阶段至 draft

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind testcase --skill discovery --repo-root "$REPO_ROOT" --where-task-id "$task_id" --set phase=draft
```

2. 更新 `state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind testcase \
  --phase discovery --next-phase draft
```

3. 输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**）。
   先按「自动衔接下一阶段」一节运行 `state next`，**下一步的技能名与括注均取自其输出**
   —— `SKILL` 直填；括注按 `NEXT` 取（`manual` → 「建议新开会话」；`auto` → 「可同会话继续」）。**两者都不得写死**：

```text
[polaris-flow 测试用例] 探索并澄清测试意图 - 阶段完成，状态已落盘。
下一步：/<SKILL>（建议新开会话 | 可同会话继续）。
恢复：先读 .polaris/testcases/<task_id>/testcase_plan.md 的「测试意图清单」与「范围与粒度」，再从下一步技能的 Step 0 开始。
```

## 退出条件

1. 定稿 PRD 已定位，缺验收标准的条目已阻断或已补齐（`readiness` 层面的输入具备）；
2. 需求条目清单已编号且无重复，补编项已标注；
3. 测试意图清单三级完整、每条可追溯到需求条目编号、范围内无漏覆盖；
4. 范围 / 粒度 / 分层 / 自动化四项策略均已经**用户明确确认**并落盘；
5. `testcase_plan.md` 已落盘，`state.yaml` 已推进 `phase=draft` 且 `discovery.status=completed`。

未同时满足五条，不得宣告本阶段完成。

## 上下文压缩恢复

重载：`task_id`、`$REPO_ROOT/.polaris/testcases/<task_id>/testcase_plan.md` 已写入的章节、`state.yaml` 的 `discovery.status`、本技能停在哪个 Step。

- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 **Step 1**（有活跃任务但未选择）→ 按 `./policies/decision-point.md` 重新询问 A/B/C/D，**不得**替用户选
- 停在 **Step 3**（PRD 已加载、清单未定）→ 读 `testcase_plan.md` 已写入部分，从未完成的章节继续
- 停在 **Step 5–6**（策略未定版）→ 重新发起对应询问，不得沿用未确认的中间结论
- 停在 **Step 7** → 只补门禁自检与落盘，**不重做**前面的拆解
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```
