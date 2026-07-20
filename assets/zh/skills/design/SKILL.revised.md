<!--
  已过时：产物路径以同目录 SKILL.md 为准（叙事进 openspec/changes；评审进 reviews/；.polaris/tasks 仅运行态与 draft）。
  本文件勿当作生效 skill；确认后删除或按 SKILL.md 重写。
-->

<!--
  对比修订稿（非正式发布）：与同目录 SKILL.md 对照阅读。
  勿直接当作已生效 skill；确认后可替换 SKILL.md。

  相对 git 现稿 / 早期粘贴稿的主要修正：
  1. 产物统一 `.polaris/tasks/<change_id>/detailed-design.md`；对齐 polaris 标识。
  2. 切除独立 plan-review skill / writing-plans 异物；本 skill 只做深度设计。
  3. Step 4 仅「派发 design-review-agent」——评审标准与结果在 `assets/<lang>/agents/design-review-agent.md`，
     禁止在 SKILL 内包装成评审技能。
  4. 步骤连续 0→5；decision-point / workflow-entry 与 clarify/propose 一致。

  已知外部债：propose 出口仍写 lock；state 模板仍混 .polaris/changes/ 与 pre_design.md。
-->

---
name: polaris-flow-design
description: "用户触发 /polaris-flow-design、/design，或要求把 OpenSpec 高层 design.md 深化为 detailed-design.md / 深度技术设计时必须使用本 skill。"
---

# Polaris 工作流 - 阶段：深度设计（design）

<HARD-GATE>
本 skill **仅**负责把 propose 阶段的高层 `design.md` **深化**为 `.polaris/tasks/<change_id>/detailed-design.md`。

- **禁止**跳过 Superpowers `brainstorming`（不可用则阻断，禁止用普通对话替代）
- **禁止**未按 `.polaris/reference/decision-point.md` 获得用户对设计方案的明确确认，就落盘 `detailed-design.md`
- **禁止**重写 OpenSpec `proposal.md` / 高层 `design.md` / `tasks.md` 的结构或范围（深化 ≠ 替代）
- **禁止**在 Design Doc 中再造第二份需求 spec；缺口只能以 **Spec Patch** 回写 `openspec/changes/<change_id>/specs/*/spec.md`（仅限补充验收场景、修正歧义、添加边界条件）
- **禁止**跳过 Step 4：必须派发 `design-review-agent` 完成设计评审（评审逻辑在 agent 内，禁止在本 skill 内联重写）
- **禁止**在本阶段创建实施计划 / 调用 `writing-plans` / 进入 `/opsx:apply`（实施计划是 `/polaris-flow-plan`；写代码是 build）
- **禁止**把本 skill 当成 plan 主审：不派 `plan-review-agent`、不写 `plan-review-report.md`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入阶段: design — 使用 polaris-flow-design 技能。`

## 标识约定

- **`change_id`**：与 clarify finalize / propose 同值
- 任务目录：`.polaris/tasks/<change_id>/`
- 深度设计产物：`.polaris/tasks/<change_id>/detailed-design.md`
- 专项设计（可选）：`.polaris/tasks/<change_id>/design/*.md`
- 设计评审报告：`.polaris/tasks/<change_id>/design-review-report.md`（由 Step 4 落盘）
- 澄清检查点：`.polaris/tasks/<change_id>/brainstorm-summary.md`
- OpenSpec 四件套：`openspec/changes/<change_id>/`
- workflow 游标：`.polaris/workflow.yaml`（写入走 `hooks/workflow-entry.sh`）

> **职责边界**：propose 的 `design.md` = 高层方案框架；本阶段 `detailed-design.md` = 深度技术细化。深化，不替代。

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：定位 change_id + 入口校验

读取 `.polaris/workflow.yaml: active_changes`，筛选 `phase=propose` 的 entry：

- **唯一匹配**：取其 `change_id`
- **多个匹配**：按 `.polaris/reference/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 propose 阶段的 active change，请先执行 /polaris-flow-propose」

> 若 entry 已是 `phase=design`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。

**入口校验**（失败 → 阻断）：

| 检查 | 条件 |
| ---- | ---- |
| 四件套存在 | `openspec/changes/<change_id>/` 下 `proposal.md`、`design.md`、`tasks.md` 非空，且 `specs/` 含至少一个非空文件 |
| 尚未锁定 | 若 `design.status=completed` 且 `detailed-design.md` 已存在 → 询问 A 续写修订 / B 退出（禁止静默覆盖） |

通过后：

```bash
CONFIG_FILE="$REPO_ROOT/.polaris/config.yaml"
PLUGIN_ROOT="$(cat "$CONFIG_FILE" | grep "plugin_root" | awk -F'"' '{print $2}')"
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill design \
  --where-change-id "$change_id" --set phase=design
```

更新 `state.yaml`：`current_verb: design`，`design.status: in_progress`。  
输出：`[polaris-flow] design: change_id=<change_id> ; phase=design`

### Step 1：读取上游事实源

- `openspec/changes/<change_id>/proposal.md`
- `openspec/changes/<change_id>/design.md`
- `openspec/changes/<change_id>/tasks.md`
- `openspec/changes/<change_id>/specs/*/spec.md`
- 若存在：`.polaris/tasks/<change_id>/intention.md`（只读）

### Step 2：Brainstorming（带上下文）

#### 2.1 加载 Superpowers `brainstorming`

**立即执行：** 使用 Skill 工具加载 Superpowers `brainstorming`。禁止跳过。

```bash
LANGUAGE="$(cat "$REPO_ROOT/.polaris/config.yaml" | grep "language" | awk -F'"' '{print $2}')"
```

ARGUMENTS 必须含 `Language: $LANGUAGE`。

加载后上下文：

```text
Change: <change_id>
OpenSpec Context: openspec/changes/<change_id>/*.md

基于 OpenSpec 做深度技术设计（实现方案、技术风险、测试策略、边界条件）。
不清楚则继续提问，不得一轮问答就落盘。
不要重写 proposal / 高层 design.md；缺口仅 Spec Patch 回写 specs。
```

技能不可用 → 停止并提示安装。对话产出方案，**不**落盘 Design Doc。

#### 2.2 增量更新 `brainstorm-summary.md`

路径：`.polaris/tasks/<change_id>/brainstorm-summary.md`  
未确认内容标「待确认」/「候选」。非 Design Doc，不替代 2.3。

#### 2.3 用户确认设计方案（阻塞点）

按 `.polaris/reference/decision-point.md` 暂停，展示技术方案 / 取舍风险 / 测试策略 / Spec Patch（如有）。确认前禁止落盘 `detailed-design.md`。确认 → Step 3；调整 → 回 2.1。

### Step 3：落盘深度设计

#### 3.1 写入 `detailed-design.md`

路径：`.polaris/tasks/<change_id>/detailed-design.md`

```yaml
---
change: <change_id>
role: technical-design
canonical_spec: openspec
---
```

正文至少含：实现方案、技术风险、测试策略、边界条件、Spec Patch 清单（无则写「无」）。  
有 Spec Patch 则同时改 `specs/*/spec.md`。  
输出：`[polaris-flow] design: wrote .polaris/tasks/<change_id>/detailed-design.md`

#### 3.2 专项设计（可选）

按 decision-point 询问是否需要专项文档（不涉及的类别不展示）：领域 / 仓储服务 / 数据模型 / Rest API / 其他。  
选否 → 3.3；多选则写入 `.polaris/tasks/<change_id>/design/` 后进 3.3。

#### 3.3 主动式上下文压缩（可选）

有原生 compact 则触发一次。恢复提示含 `change_id`、Step 3 完成、以及 `detailed-design.md` / `design/`（若有）/ `brainstorm-summary.md` / OpenSpec 四件套。然后进入 Step 4。

### Step 4：调用 `design-review-agent`（阻塞点）

本步**只负责派发**专用评审 subagent；评审标准与结果格式以已安装的 `design-review-agent` 为准（源文件 `assets/<lang>/agents/design-review-agent.md`），禁止在本 skill 内再包装一套评审流程。

1. **`subagent-probe`**：加载 `polaris-flow:subagent-probe`（传入 `platform`）。`inline` / `unsupported` → 标注跳过并 decision-point：A 接受跳过进 Step 5 / B 阻断。不得 inline 假评审。
2. **派发**：优先注册名 / `subagent_type` = `design-review-agent`（init 已装到 `.<platform>/agents/design-review-agent.md`）。文件缺失 → 阻断，提示先 `polaris-flow init/update`。启动 prompt 仅：

```text
Change: <change_id>
```

3. **落盘**：将 agent 返回的完整 **Design Review Report** 写入 `.polaris/tasks/<change_id>/design-review-report.md`。
4. **消化**：按报告 `Verdict` 与 Findings——`BLOCK` / 未消化 Critical 不得完成；`APPROVE_WITH_CONCERNS` 需用户确认；修订后重跑本 Step（最多 3 轮）。

### Step 5：完成 design 阶段

更新 `state.yaml`：`design.status: completed`，`design.path` → detailed-design，`design.review_report` → 报告路径或 `skipped:<reason>`。

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill design \
  --where-change-id "$change_id" --set phase=plan
```

输出：`[polaris-flow] design 阶段完成：.polaris/tasks/<change_id>/detailed-design.md 已锁定。下一步建议 /polaris-flow-plan。`

## 退出条件

- `detailed-design.md` 已落盘且 frontmatter 合法
- Step 2.3 用户已确认方案
- Step 4 已派发评审（或用户接受 SKIPPED）且无未消化 Critical
- `phase=plan`

## 上下文压缩恢复

重载 Step 3.3 handoff + `design-review-report.md`（若有）。
