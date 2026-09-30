---
name: polaris{{SKN_SPR}}testing{{SKN_SPR}}draft
description: 触发场景：用户已有《测试计划》testcase_plan.md（含测试意图清单、范围与粒度、分层与自动化策略），需要据此写出功能用例集——正向主干、反向场景、边界取点、数据构造脚本、分层标注与双向追溯矩阵（如「写测试用例」「产出用例集」「按计划写用例」「测试用例草稿」）。本技能覆盖单个阶段：基于测试计划产出功能用例集 test-cases.md。硬性约束：用例源于需求不源于想象；每条用例只验证一个行为点；无来源的孤儿用例必须删除；场景枚举按 6 大类逐类过、不适用者显式标「无」。
version: 0.1
---

# 测试用例-编写用例集

<HARD-GATE>
- **需求为唯一来源**：全部用例必须追溯到《测试计划》的测试意图清单与 PRD 需求条目；PRD 未声明的交互、文案、错误码、数值一律不得臆造。
- **一条用例只验证一个行为点**：多分支堆砌会导致失败后无法定位问题，禁止。
- **枚举必须过一遍**：按 §判据的 6 大类与扩展表逐类过；无对应场景**必须显式标「无」**，禁止静默跳过。
- **无孤儿用例**：每条用例都必须标注来源需求条目编号；无来源者删除或补来源。
- **预期结果可判定**：禁止「功能正常」「显示正确」类模糊表述；必须覆盖页面表现 + 业务结果 + 数据落库状态三层。
- **不越界**：性能与安全用例归 `refine`，本阶段不产出。
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 测试用例] 进入阶段: 编写用例集 — 使用 polaris{{SKN_SPR}}testing{{SKN_SPR}}draft 技能。`

## 标识约定

沿用 `polaris{{SKN_SPR}}testing{{SKN_SPR}}discovery` 已定版的命名空间，本阶段**不新起编号**：需求条目编号与 PRD 一致、用例编号为 `TC-{需求条目编号}-{两位序号}`、场景分类为 6 大类 + 扩展表 `E#`、优先级 `P0/P1/P2`、执行分层 `L1–L4`。

## 判据（唯一源，本技能不复制）

| 判据 | 唯一源 |
|---|---|
| **用例设计判据**（6 大类消费方式 / 需求级扩展表 E1–E8 / 用例字段 / 优先级 / 执行分层与准入 / 数据独立性 / 追溯矩阵 / 覆盖校验 / 反模式） | `./references/01-case-design-criteria.md`（本技能自带，族内唯一源；`discovery` 与 `review` 均按技能名引用它） |
| **《用例集》文档结构** | `./templates/test-cases-template.md`（Step 8 落盘时**必读**） |
| 场景枚举的原始定义（6 大类 + 适配规则 + GWT/AAA + 反模式） | `polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks` 的 `references/test-case-checklist.md` |
| 执行口径（五槽 / 三级分叉 / 覆盖率 / 基线红名单） | `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`（本族**不跑测试**） |

## 流程

> **压缩上下文通用规则**：每个 Step 收尾时释放中间草稿与冗余对话，仅保留已确认结论与落盘产物指针。
>
> **用词与模板的唯一来源**：`./policies/auto-transition.md` 的「压缩时机与恢复清单」。**禁止**在步骤中途提压缩。

### Step 0：定位任务标识 + 入口校验

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind testcase --skill draft --repo-root "$REPO_ROOT" --phase draft)
EXIT_CODE=$?
```

- `EXIT_CODE != 0` → **阻断**，按 stderr 处理
- `EXIT_CODE == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按数组长度解读：**唯一匹配**直接取；**多个匹配**按 `./policies/decision-point.md` 列出候选让用户选择；**零匹配**阻断，提示「未找到 draft 阶段的 active change，请先执行 `/polaris{{CMD_SPR}}flow` 的 T01 编写测试用例」。

> 若选择的任务已是 `phase=draft`（中断续跑），从中断点续跑；不得重新筛成「零匹配」。

**入口校验**：

| 检查 | 条件 | 不满足时 |
|---|---|---|
| discovery 已完成 | `state.yaml` 中 `discovery.status=completed` | **阻断**：提示先完成 `discovery` |
| draft 已完成 | `state.yaml` 中 `draft.status=completed` | **阻断重跑** |

通过后：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind testcase --phase draft
```

输出：`[polaris-flow 测试用例] 编写用例集: task_id=<task_id>`

### Step 1：前置校验（必须全部通过才允许继续）

**校验项**：

1. `$REPO_ROOT/.polaris/testcases/<task_id>/testcase_plan.md` 存在且**不是 task-init 写入的占位**（须含第 2 章「测试意图清单」与第 3/4 章策略）——否则提示重跑 `/polaris{{CMD_SPR}}flow` 的 T01，终止流程；
2. 计划中的**范围、粒度、分层、自动化**四项策略齐备（缺失即视为计划未定版，阻断）；
3. 计划中的**待确认清单**已闭环或已由用户明确转为「后续待跟进」（未闭环的条目**不进入用例设计**）；
4. 定位定稿 PRD 与验收标准（沿用 discovery 的定位顺序）；报告 `No-Input` 的可选输入清单。

校验结论写入 `state.yaml` 的 `draft.gate`：

```yaml
draft:
  status: in_progress
  gate:
    checked_at: <校验时间>
    plan_path: .polaris/testcases/<task_id>/testcase_plan.md
    prd_path: <PRD 路径>
    scope: <全量 | 指定模块 | 指定条目>
    granularity: <场景级 | 功能级>
    layers: <L1+L2 | L1–L3 | L1–L4>
    no_input: [<交互原型|表设计|接口清单>]
    passed: true|false
    fail_reason: <失败原因，通过则空>
```

> Gate 不通过（`draft.gate.passed=false`）：**直接结束技能**，不执行任何用例编写动作。

输出：`[polaris-flow 测试用例] 编写用例集 - 输入校验通过：范围=<范围>，粒度=<粒度>，分层=<分层>，No-Input=<清单>。`

#### 压缩上下文

- 释放：计划的全文复述、校验中间结果
- 保留：`plan_path` / `prd_path` / 四项策略 / `No-Input` 清单 / 待确认清单闭环状态

### Step 2：正向主干用例（单点验证）

按《测试计划》的测试意图清单，**逐功能点**产正向用例：

1. 一条用例只验证**一个核心业务点**——多验证点混杂会导致失败无法定位
2. 操作步骤按用户真实操作路径编写，每步一个可观察动作，含具体输入数据
3. 预期结果**必须覆盖三层**：页面交互表现 + 业务逻辑结果 + **数据落库状态**（有表设计输入时按字段级断言；无则按业务可见状态断言）
4. 来源需求条目编号沿用 PRD 原编号

**约束**：

- 功能点的主流程必须有用例；主流程缺失即回退补
- 一条用例的 `Given/When/Then` 必须可映射 AAA（前置 → 操作 → 可断言结果）

### Step 3：反向场景用例（按分类语言逐类过）

对每个功能点，按 `./references/01-case-design-criteria.md` §一 / §二的分类语言**逐类过一遍**：

1. 6 大类：正常路径 / 边界值 / 异常输入 / 依赖异常 / 状态校验 / 幂等并发
2. 需求级扩展表：E1 权限异常 / E2 业务规则违例 / E3 操作时序 / E4 数据异常 / E5 弱网中断 / E6 落库一致性 / E7 性能 / E8 安全

**硬性要求**：

- 某类**无对应场景**时，**显式写「无」并给出理由**（如「本需求无外部依赖」）；扩展项不适用的写「本版不适用」
- **禁止静默跳过**——`review` 只能凭此处区分「漏测」与「本就不适用」
- E7/E8（性能/安全）**不在本阶段产出**，只在此处声明「归 refine」，由 `refine` 补齐
- 异常用例与对应的正向用例**归类存放**（同一功能点下相邻），便于后续分级与维护

### Step 4：边界取点

对每条数值 / 长度 / 数量 / 时间 / 文件 / 集合类约束，按取点方法展开边界用例：

| 边界类型 | 取点 |
|---|---|
| 数值 | 最小值、最小值−1、最大值、最大值+1、0、负数 |
| 长度 | 空、1 字符、最大长度、最大长度+1 |
| 数量 | 0 条、1 条、上限、上限+1 |
| 时间 | 生效前、生效瞬间、失效瞬间、失效后 |
| 空数据 | 列表为空、查询无结果、必填项全空 |
| 文件 | 空文件、1 字节、大小上限、上限+1；文件名长度上限；允许 / 不允许类型 |
| 分页 / 集合 | 0 条、1 条、页大小、页大小+1、超出末页 |
| 日期周期 | 闰年 2/29、月初 / 月末、季度首末日、年初 / 年末 |
| 会话 / 缓存 / 定时 | 超时前 / 超时瞬间 / 超时后；缓存过期前 / 时刻 / 后；任务执行前 / 时刻 / 后 |

边界取点必须**带具体数值与单位**；PRD 未声明上下限时，记入待确认清单，**不得臆造**。

> **等价类完备**：取点之外还要确认每个**有效 / 无效等价类各 ≥1 条**（判据见 `./references/01-case-design-criteria.md` §七），防止整类漏测。

### Step 5：数据构造脚本设计

针对用例前置依赖的数据，设计**可复用**的构造方式（不写完整脚本也可，但必须给出契约）：

| 项 | 要求 |
|---|---|
| 入口 | 脚本路径 / SQL 文件 / 接口调用；未落地时给出建议路径 |
| 参数 | 构造什么数据、参数化哪些维度 |
| 清理 | 执行后如何清理，保证用例可重复执行 |
| 命名 | 按 `./references/01-case-design-criteria.md` §六 的命名规范（`{字段}_valid_{n}` 等） |

> 数据独立性的判据见 `./references/01-case-design-criteria.md` §六。**数据不可构造/不可清理的用例一律不得入库**。

### Step 6：分层标注（L1–L4）

给每条用例标注执行分层，口径见 `./references/01-case-design-criteria.md` §五：

- **L1**：核心业务链路的端到端正常主流程（无分支、无异常）——**准入闸门**，必须 `L1 ⊇ P0 主流程`
- **L2**：旁支正常流程
- **L3**：异常流程（参数/边界/业务规则/时序/依赖异常）
- **L4**：深度穿透（落库一致性/事务、并发、隐含规则）

**同时**标注优先级 `P0/P1/P2`（§四）。两轴**并列标注**，不可只标其一。

### Step 7：覆盖校验 + 双向追溯矩阵

按 `./references/01-case-design-criteria.md` §七逐项自检：

| 校验项 | 通过标准 | 不通过时 |
|---|---|---|
| 需求覆盖率 | 有验收标准的需求条目 100% 至少 1 条用例 | 输出待补清单，回到 Step 2 补 |
| 场景覆盖 | 6 大类逐类过；不适用者标「无」 | 回到 Step 3 补 |
| 等价类完备 | 每个有效 / 无效等价类各 ≥1 条 | 回到 Step 4 补 |
| 扩展覆盖 | E1–E8 逐项声明「已覆盖 / 本版不适用」 | 回到 Step 3 补 |
| 优先级分布 | P0 覆盖全部核心主流程与核心异常 | 调整标注 |
| 孤儿用例 | 0 条 | 删除或补来源 |
| 数据独立 | 全部用例可构造、可清理 | 回到 Step 5 补契约 |

自检不通过 → **不得进入 Step 8**，补正后重跑本步。

### Step 8：落盘《用例集》+ 完成 draft 阶段

**落盘**：**必读**（强制前置）`read_file ./templates/test-cases-template.md`，按其章节与表格结构写入 `$REPO_ROOT/.polaris/testcases/<task_id>/test-cases.md`（**不得增删章节**）。

**完成后**：

1. 推进 workflow 阶段至 refine

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind testcase --skill draft --repo-root "$REPO_ROOT" --where-task-id "$task_id" --set phase=refine
```

2. 更新 `state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind testcase \
  --phase draft --next-phase refine
```

3. 输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**）。先按「自动衔接下一阶段」运行 `state next`，**技能名与括注均取自其输出**（`SKILL` 直填；`NEXT` 为 `manual` → 「建议新开会话」，为 `auto` → 「可同会话继续」），**不得写死**：

```text
[polaris-flow 测试用例] 编写用例集 - 阶段完成，状态已落盘。
下一步：/<SKILL>（建议新开会话 | 可同会话继续）。
恢复：先读 .polaris/testcases/<task_id>/test-cases.md 的「追溯矩阵」与「分类覆盖声明」，再从下一步技能的 Step 0 开始。
```

## 退出条件

1. `draft.gate.passed=true`（输入与策略校验通过）；
2. 功能用例集已落盘，含追溯矩阵与分类覆盖声明；
3. 覆盖校验六项全部通过（含孤儿用例 0 条、不适用分类已显式标「无」）；
4. `state.yaml` 已推进 `phase=refine` 且 `draft.status=completed`。

未同时满足四条，不得宣告本阶段完成。

## 上下文压缩恢复

重载：`task_id`、`testcase_plan.md`、`test-cases.md` 已写入的章节、`state.yaml` 的 `draft.status` 与 `draft.gate`、本技能停在哪个 Step。

- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度
- 停在 **Step 2–6** → 读 `test-cases.md` 已落盘的功能点范围，从未完成的模块继续，不重写已完成部分
- 停在 **Step 7**（覆盖校验）→ 直接重建覆盖矩阵（计划与用例集均已落盘，无需重扫 PRD）
- 停在 **Step 8** → 只补落盘与阶段推进，**不重做**前面的用例编写
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```
