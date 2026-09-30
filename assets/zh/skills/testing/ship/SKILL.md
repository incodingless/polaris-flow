---
name: polaris{{SKN_SPR}}testing{{SKN_SPR}}ship
description: 触发场景：用例集已通过独立评审、要做交付收尾——输出测试准出报告、把用例资产与自动化脚本资产交付到文档库、归档并收尾任务（如「交付测试用例」「用例可以交了」「测试准出」「用例归档」「走完测试用例交付」）。本技能覆盖单个阶段：准出判定 + 资产交付 + 归档 + 持续迭代约定。硬性约束：准出判定与用例编写分离；无执行数据时标「无执行数据」不得编造；归档目标已存在不得静默覆盖。不触发：只评审不交付（走 polaris{{SKN_SPR}}testing{{SKN_SPR}}review）、编写或完善用例（走 draft / refine）。
version: 0.1
---

# 测试用例-准出与交付

通过独立评审的用例集，**先经准出评估判定能否交付**，再迁移至文档库目录，登记任务状态为完成。

**核心设计思路**：准出判定与用例编写分离（`draft`/`refine` 保质、`ship` 准出）+ 评估对象 = 交付对象 + 人工确认有客观依据。

**与 refine 的职责边界**：

| 阶段 | 判定什么 | 结论 |
|---|---|---|
| `refine` | 用例集**质量**是否达标 | 评审 Critical 是否清零 |
| `ship`（本技能） | 用例集**能否交付**（进入验收/回归使用） | PASS / CONDITIONAL / FAIL |

> **Critical 清零 ≠ 可交付**。质量达标由 `refine` 保证，准出由本技能独立判定——判定者与执行者分离。

**启动时必须先输出**：`[polaris-flow 测试用例] 进入阶段: 准出与交付 — 使用 polaris{{SKN_SPR}}testing{{SKN_SPR}}ship 技能。`

## 流程

### Step 0：状态检查与中断恢复

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind testcase --skill ship --repo-root "$REPO_ROOT" --phase ship)
EXIT_CODE=$?
```

- `EXIT_CODE != 0` → **阻断**，按 stderr 处理
- `EXIT_CODE == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按数组长度解读：**唯一匹配**直接取；**多个匹配**按 `./policies/decision-point.md` 列出候选让用户选择；**零匹配**阻断，提示「未找到 ship 阶段的 active change，请先执行 `/polaris{{CMD_SPR}}flow` 的 T01 编写测试用例并完成 refine」。

**入口校验**：

| 检查 | 条件 | 不满足时 |
|---|---|---|
| refine 已完成 | `state.yaml` 中 `refine.status=completed` | **阻断**：提示先完成 `refine` |
| 用例集已落盘 | 四份产物齐备（或已声明「本版不适用」） | **阻断**：回 `refine` 补 |
| 评审已执行 | `testcase-review-report.md` 已落盘 | **阻断**：回 `refine` Step 6 派发评审 |
| ship 已完成 | `state.yaml` 中 `ship.status=completed` | **阻断重跑** |

**中断恢复**：`ship.readiness=done` 且有准出报告 → 跳过 Step 1 直接进 Step 2；`ship.readiness=failed` → 重新执行 Step 1。

### Step 1：准出评估（Exit Criteria）

**目的**：判定用例集能否交付使用（进入验收 / 全量回归），为人工确认提供客观依据与重点阅读方向。

**评估对象** = **交付对象**：四份用例产物 + `testcase-review-report.md`。

#### 1.1 判据

| # | 维度 | 判据 | 数据来源 | 缺失处理 |
|---|---|---|---|---|
| C1 | **用例集质量** | `testcase-review-report.md` 的 **Critical = 0** | 评审报告 | **阻断**（无报告不得准出） |
| C2 | **需求覆盖率** | 有验收标准的需求条目 **100%** 有用例 | 用例集追溯矩阵 | 数值取自矩阵，不重算 |
| C3 | **L1 准入** | L1 用例 **100% 通过** | 执行数据（见 1.2） | 标「无执行数据」 |
| C4 | **L2–L3 通过率** | ≥ 用户设定阈值 | 执行数据 | 标「无执行数据」 |
| C5 | **自动化覆盖率** | ≥ 用户设定阈值 | 自动化清单 | 标「无执行数据」 |
| C6 | **遗留缺陷** | 阻塞级缺陷 = 0 | 缺陷清单（见 1.2） | 标「无执行数据」 |

#### 1.2 执行数据的来源（本族**不跑测试**）

C3–C6 依赖「用例被执行」的数据，而**执行口径的唯一源是 `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`**（五槽探测 / 三级分叉 / 覆盖率 / 基线红名单），本族不重定义。数据获取顺序：

1. 若本项目已有编码链的 `verify` 产物（`openspec/changes/<id>/reviews/verify-report.md` 或 `.polaris/metrics/*-metrics.json`）→ **读取并引用**其结论；
2. 由用户在 Step 2 确认时提供；
3. 两者皆无 → 对应维度标注 **「无执行数据」**，**禁止编造通过率**。

> 本族只**产出**用例资产；执行与判定在 verify。准出报告如实标注数据来源与缺口。

#### 1.3 结论判定

| 结论 | 条件 | 处理 |
|---|---|---|
| **PASS** | C1/C2 达标 且 C3 达标（或标明无执行数据并已被用户接受） 且 无阻塞级遗留 | 进入 Step 2 确认交付 |
| **CONDITIONAL** | C1/C2 达标，但 C3–C6 存在未达标项或「无执行数据」 | 列出遗留项 + 责任人 + 建议时限；进入 Step 2 |
| **FAIL** | C1 不达标（Critical > 0）或 C2 不达标（覆盖率 < 100%） | **硬阻断**：不得进入确认交付，只提供「暂停回 refine / draft」 |

**评估结论落盘**：`$REPO_ROOT/.polaris/testcases/<task_id>/testcase-report.md` 的准出节；并写 `state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" \
  --set ship.readiness=done \
  --set "ship.readiness_verdict=<PASS|CONDITIONAL|FAIL>"
```

### Step 2：确认交付

按 `./policies/ask-question-react.md` 询问，**必须带上准出结论**。

**PASS 时**：

> 准出评估：**PASS**（C1 用例集质量达标、C2 需求覆盖率 100%）
> 交付目录：`docs/testcases/<task_id>/`
> A. 确认交付
> B. 暂停回 refine

**CONDITIONAL 时**：

> 准出评估：**CONDITIONAL**
> 遗留项：
> 1. {维度} · {情况} · 责任人 {X} · 建议时限 {日期}
> …
> A. 确认交付（遗留项按清单跟踪，不阻断）
> B. 暂停回 refine

**FAIL 时（硬门禁）**：

> 准出评估：**FAIL**（{C1 Critical 未清零 | C2 需求覆盖率 {X}% < 100%}）
> 该用例集**不具备交付条件**。
> A. 暂停回 refine / draft 修复后重新执行交付（**推荐**）
> B. 仍要交付（须填写风险接受理由，仅用于已决策的例外场景）

选 B 时记录风险接受理由，并在交付信息中标注「未通过准出评估，风险已接受」：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" \
  --set "ship.risk_acceptance=<理由>"
```

仅 A（确认交付）进入 Step 3。

### Step 3：执行交付

#### 3.1 交付用例资产至文档库

```bash
CASE_DOC_DIR="${CASE_DOC_DIR:-$REPO_ROOT/docs/testcases/$task_id}"
mkdir -p "$CASE_DOC_DIR"
SRC="$REPO_ROOT/.polaris/testcases/$task_id"
test -d "$SRC" || { echo "用例产物缺失：$SRC，请先执行 /polaris{{CMD_SPR}}flow 的 T01" >&2; exit 2; }
```

交付内容（**副本**，任务目录原产物保留不动，便于回溯）：

| 交付内容 | 说明 |
|---|---|
| `testcase_plan.md` | 测试计划（意图 / 范围 / 分层 / 自动化策略） |
| `test-cases.md` | 功能用例集 + 追溯矩阵 |
| `test-cases-nonfunctional.md` | 非功能用例（性能 / 安全） |
| `test-cases-interface.md` | 接口用例 |
| `test-cases-automation.md` | 自动化用例清单与报告模板结构 |
| `testcase-review-report.md` | 独立评审报告 |
| `testcase-report.md` | 准出报告（本技能 Step 1/4 产出） |

**目标目录已存在同名文件时不得静默覆盖**：按 `./policies/decision-point.md` 回显冲突并询问「A. 覆盖 / B. 另存为带日期的子目录 / C. 取消交付」。

#### 3.2 输出准出报告与入库清单

`testcase-report.md` **必读**（强制前置）`read_file ./templates/testcase-report-template.md`，按其章节与表格结构写入（**不得增删章节**；「持续迭代约定」节取自 Step 4）。

#### 3.3 更新任务状态

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind testcase --phase ship
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" \
  --set status=completed \
  --set "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --set "delivered_to=$CASE_DOC_DIR" \
  --set "delivered_name=$task_id"
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind testcase --skill ship --repo-root "$REPO_ROOT" --where-task-id "$task_id"
```

输出：`[polaris-flow 测试用例] 准出与交付 - 已完成资产交付，当前任务成功完成。`

并附交付信息：需求中文名 / 编号前缀、交付目录、准出结论（CONDITIONAL 附遗留项数；风险接受时明确标注）、评审执行方式。

### Step 4：持续迭代约定（长期运营，不是一次性动作）

本族不把「持续迭代」做成又一个阶段——它是**长期约定**，由后续流程重入执行。在此**登记规则**，供后续版本复用：

| 规则 | 内容 | 重入动作 |
|---|---|---|
| **需求变更同步** | 每次版本迭代同步新增 / 修改 / 废弃对应用例，保证用例与需求一致，避免过期用例干扰测试 | 重入 `draft`（增量）；重大变更重入 `discovery` |
| **缺陷反向补全** | 测试 Bug 与线上问题**均须**反向补充对应层级的用例，把单点问题转成通用回归校验点 | 重入 `draft` 补用例；补完须重走 `refine` 的评审 |
| **回归集动态调优** | 定期梳理全量回归用例集，剔除失效场景、补充高风险场景 | 重入 `refine`（调整分层与自动化批次） |

> 缺陷反哺是**唯一入口**：任何缺陷必须在用例集里留下一条回归用例，否则视为未闭环。重入入口统一为 `/polaris{{CMD_SPR}}flow` 的 **T01 编写测试用例**（按任务名恢复既有任务）。

## 退出条件

1. 准出评估已执行且结论明确（PASS / CONDITIONAL / FAIL），`testcase-report.md` 已落盘；
2. 人工已明确确认交付（FAIL 下的 B 分支须有风险接受理由）；
3. 资产已交付到目标目录，冲突已按 A / B / C 决策处理，未静默覆盖；
4. 持续迭代三条规则已登记进 `testcase-report.md`；
5. `state.yaml` 已写 `status: completed` 与 `delivered_to`，任务已 `delete-active` 移出活跃列表。

未同时满足五条，不得宣告交付完成。

## 上下文压缩恢复

重载：`task_id`、四份用例产物与评审报告是否落盘、准出结论、交付目录、是否已 `delete-active`。

- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度；本环节进度以 `testcase-report.md` 与交付目录产物为准
- 停在 **Step 1** → 重跑准出评估（`testcase-report.md` 已有准出节则复用）
- 停在 **Step 2** → 重读准出结论后重新询问
- 停在 **Step 3** → 校验目标冲突后继续交付
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

本技能是**链路终点**，因此**不调用** `polaris-flow state next`：Step 3.3 已 `delete-active` 移除本任务的 workflow 游标条目，调用只会得到 `NEXT: done`。

本族**没有**后续阶段技能；`review` 与 `acceptance` 是**服务型技能**（不登记为阶段、不推游标），由各阶段技能内部引用或用户显式触发。交付完成即链路结束。
