# 升档检查 — tweak 规模守门

## 核心原则

- 升档检查是 tweak 的**唯一**规模守门。位置刻意固定在**简报定稿之后、`tasks.md` 生成之前**——此刻除了 `change-brief.md` 没有任何制品，转交成本为零
- 判定输入**只有** `change-brief.md`（重点是「影响面」节），不得凭对话印象判定
- 命中任一信号 → **必须**按 `./policies/decision-point.md` 暂停，由用户选择，不得代选

## 1. 升档信号表

读 `openspec/changes/<change_id>/change-brief.md`（未迁入时在 `.polaris/tasks/<change_id>/`），逐条核对：

| # | 信号 | 判定依据（来自简报） |
|---|------|---------------------|
| **U1** | 跨模块 | 「影响面 → 涉及模块」列出 ≥ 2 个模块 / 子系统 |
| **U2** | 多 delta spec | 「预计 delta spec 数」> 1，或验收标准横跨多个 capability |
| **U3** | 任务超编 | 「预计顶层任务数」> 3，或实际推导出的顶层任务 > 3 |
| **U4** | 数据实体变更 | 「新增或变更数据实体」为「有」（表结构 / schema / 迁移脚本） |
| **U5** | 触碰核心链路 | 「触碰核心链路」为「有」（鉴权 / 支付 / 权限 / 对外 API 契约 / 数据一致性） |
| **U6** | 待决问题未关闭 | 「待决问题」节非空，且该问题会影响方案选择 |
| **U7** | 需求不稳 | Step 1.4 的理解确认修正轮次 > 2（由主代理在调用本 policy 时传入） |
| **U8** | 拆分预检未过 | Step 1.5 未满足 `task-split-precheck.md` §1 唯一判定门 |

**未命中任何信号** → 直接继续 tweak，无需询问。

## 2. 用户决策点（阻塞点）

命中任一信号时，按 `./policies/decision-point.md` 暂停，必须列出命中的信号编号与依据：

```text
本次变更命中 <N> 项升档信号（详见下方），建议升到常规通道（P02：polaris{{SKN_SPR}}coding{{SKN_SPR}}normal 单入口，含四件套 + 合并主审）。

命中信号：
  · U1 跨模块：<列出模块>
  · U5 触碰核心链路：<列出链路>

A. 升到常规通道 — 把简报转为 intention.md，交 polaris{{SKN_SPR}}coding{{SKN_SPR}}normal 继续（推荐）
B. 继续 tweak — 记录风险接受后按快速通道执行
```

| 选项 | 动作 |
|------|------|
| **A** | 执行 §3 转交动作，本 skill 结束 |
| **B** | 执行 §4 风险接受记录，继续 tweak Step 4 |

## 3. 转交动作（用户选 A）

目标：让 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` 拿到结构完整的 `intention.md`，直接进入其 Step 1.5 写入（映射改写到位即一次通过，无需 fallback）。

### 3.1 生成 `intention.md`

按 `./artifact-backfill.md` **§2 的映射表**把 `change-brief.md` 的每一节改写为 `./templates/intention-template.md` 的结构，写入：

```bash
# 简报已迁入 openspec 时用 openspec 侧路径；仍在 .polaris 时用 .polaris 侧路径
BRIEF="$REPO_ROOT/openspec/changes/$change_id/change-brief.md"
[ -f "$BRIEF" ] || BRIEF="$REPO_ROOT/.polaris/tasks/$change_id/change-brief.md"
# 按映射表改写后写入：
#   $REPO_ROOT/.polaris/tasks/$change_id/intention.md
```

**强制**：写入前必须 `read_file ./templates/intention-template.md`，按模板节顺序填充，缺节补「无」——不得复制简报原文了事。

### 3.2 推进 workflow

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind change --skill tweak --where-task-id "$change_id" --set phase=plan
```

### 3.3 写状态并交接

```yaml
runtime:
  tweak:
    mode: tweak
    status: upgraded
    upgrade_reason: "U1,U5"          # 命中的信号编号
    upgrade_target: normal
    finished_at: "<ISO>"
phase: idle
```

输出：

```text
[polaris-flow 开发]快速通道 - 已升档到常规通道：change_id=<change_id>；intention.md 已就绪；命中信号 <U..>
下一步执行 /polaris{{SKN_SPR}}coding{{SKN_SPR}}normal。
```

之后按 `./policies/auto-transition.md` 决定是否自动调用 normal。

## 4. 风险接受记录（用户选 B）

1. `state.yaml` 写入 `workflow.tweak.signals: ["U1","U5"]`（命中编号列表）
2. 在 `change-brief.md`「前提与风险」节追加「风险接受记录」三行（命中信号 / 用户决策 / 日期）——模板已预留该结构
3. 输出：

```text
[polaris-flow 开发]快速通道 - 用户选择继续 tweak：已记录风险接受（信号 <U..>）
```

4. 继续 tweak Step 4。**后续 Step 5 / Step 6 不得因同一信号再次询问**——已持久化的决策不重复发问。

## 5. 断点恢复

- 停在 §2 决策点未选 → 重新呈现选项，不得默认走 B
- 停在 §3.1 未完成 → 重跑映射改写，勿直接复制简报原文
- 已完成 §3.3 → 本 skill 已结束，不得再回 tweak 内部步骤
