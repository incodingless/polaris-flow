# 双向守门 — normal 档位校验（P01 ⇄ P02 ⇄ P03）

> 由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` Step 5 引用。P02 是三档的中间档，两个方向的错档都要兜住：规格过度（实际是简单需求）浪费流程，规格不足（实际是复杂需求）埋返工雷。

## 核心原则

- 位置刻意固定在**规格定稿（Step 4.4）之后、`tasks.md` 生成（Step 6）之前**——此刻制品 = intention + 四件套，尚未投入细计划与实施，双向转交成本最低
- 判定输入**只有**四件套 + `intention.md`（重点是「下游约束」节与 `design.md` 模块划分），不得凭对话印象判定
- 任一门命中 → **必须**按 `./policies/decision-point.md` 暂停，由用户选择，不得代选
- 用户在 Step 1.4 主动选 C（超出常规）时直接走 §2 升档转交，不需要命中信号

## 1. 降档门（→ P01 tweak）

**全部满足**才命中：

| # | 条件 | 判定依据 |
|---|------|----------|
| D1′ | 单模块 / 单文件级 | `design.md` 模块划分仅 1 个模块 / 子系统 |
| D2′ | 规格单薄 | `specs/` 仅 1 个 capability 且 delta spec ≤ 1 |
| D3′ | 任务可压缩 | 预计顶层任务 ≤ 3 即可覆盖全部验收场景 |
| D4′ | 无契约变更 | 无模块间接口契约变更、无数据实体变更 |

### 1.2 用户决策点（阻塞点）

命中后按 `./policies/decision-point.md` 暂停，列出命中条件与依据：

```text
本次变更满足全部 P01 判定条件（详见下方），建议降到快速通道（tweak）。

命中条件：
  · D1′ 单模块：<模块>
  · D3′ 任务可压缩：预计 ≤ <N> 个顶层任务

A. 降到 tweak — 转交 polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak 继续（推荐）
B. 继续 normal — 记录决策后按常规通道执行
```

> 选择提示（附在选项说明中，不替用户决定）：规格四件套已生成，降档节省的主要是主审粒度与流程开销；若用户主要想省流程，继续 normal 完成剩余步骤也是合理选择（规格成本已付）。

### 1.3 转交动作（用户选 A）

1. **保留已生成的四件套**——它们是真实有效的规格；tweak 的 ship 不会重复补齐（`artifact-backfill` 的触发条件是四件套**缺失**）
2. `intention.md` 留在 `openspec/changes/<change_id>/`（已迁入，不回移）
3. 写状态：

```yaml
runtime:
  normal:
    mode: normal
    status: downgraded
    downgrade_reason: "D1',D3'"     # 命中的条件编号
    downgrade_target: tweak
    finished_at: "<ISO>"
phase: idle
```

4. workflow phase 保持 `plan` 不动（tweak 兼容该游标序列，其收尾自会推 `phase=ship`）
5. 输出：

```text
[polaris-flow 开发]常规通道 - 已降档到快速通道：change_id=<change_id>；四件套与 intention.md 已保留
下一步执行 /polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak。
```

tweak 侧衔接说明（随交接输出）：tweak Step 0 会检测到 existing draft（选 **A 续写最新**，沿用现有 `change_id`，不算冲突）；其 Step 1.4 理解摘要直接基于已保留的 `intention.md` + 四件套内容形成，用户一次确认即可收敛；Step 2.2 的 `change-brief.md` 从四件套反向摘要生成（`proposal.md` 的目标 / 范围 / 待决问题为主源）。

### 1.4 风险接受记录（用户选 B）

1. `state.yaml` 写入 `workflow.normal.signals: ["D1'","D3'"]`
2. 输出：`[polaris-flow 开发]常规通道 - 用户选择继续 normal：已记录降档信号（<D..' >）`
3. 继续 normal Step 6。**后续 Step 7 / 9 不得因同一信号再次询问**——已持久化的决策不重复发问

## 2. 升档门（→ P03 design）

**命中任一**即触发：

| # | 信号 | 判定依据 |
|---|------|----------|
| **D1** | 跨服务 / 跨系统 | 改动跨越进程 / 服务边界，或需协调多个部署单元 |
| **D2** | 需专项设计 | 数据模型 / 接口契约 / 领域模型需要 `<slug>-design.md` 级专项设计（四件套 `design.md` 无法承载） |
| **D3** | 数据迁移 | 需要 schema 变更含存量数据改写 / 迁移脚本 |
| **D4** | 破坏性契约变更 | 对外 API 契约、鉴权、权限、数据一致性的破坏性变更 |
| **D5** | 任务超编 | 预计顶层任务 > 8（Step 6.2 推导中发现时回溯到本门） |
| **D6** | 需求不稳 | Step 1.4 理解确认修正轮次 > 2 |
| **D7** | 高危领域 | 涉及合规、资金、安全审计等高危场景 |

### 2.2 用户决策点（阻塞点）

```text
本次变更命中 <N> 项 P03 信号（详见下方），建议升到复杂链路（P03：design 深度设计 → tasks → build → verify → ship → retro）。

命中信号：
  · D2 需专项设计：<列出>
  · D4 破坏性契约变更：<列出>

A. 升到 P03 — 四件套已在，从 polaris{{SKN_SPR}}coding{{SKN_SPR}}design 直接深化（推荐，转交成本为零）
B. 继续 normal — 记录风险接受后按常规通道执行
```

### 2.3 转交动作（用户选 A）

1. 四件套 + `intention.md` 已在 `openspec/changes/<change_id>/`，**转交成本为零**
2. 推进 workflow：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind change --skill normal --where-task-id "$change_id" --set phase=design
```

3. 写状态：

```yaml
runtime:
  normal:
    mode: normal
    status: upgraded
    upgrade_reason: "D2,D4"        # 命中的信号编号
    upgrade_target: design
    finished_at: "<ISO>"
phase: idle
```

4. 输出：

```text
[polaris-flow 开发]常规通道 - 已升档到复杂链路：change_id=<change_id>；四件套已就绪；命中信号 <D..>
下一步执行 /polaris{{SKN_SPR}}coding{{SKN_SPR}}design（从四件套直接深化 detailed-design；design 阶段会补 brainstorming 与专项设计预检）。
```

之后按 `./policies/auto-transition.md` 决定是否自动调用 design。

### 2.4 风险接受记录（用户选 B）

1. `state.yaml` 写入 `workflow.normal.signals: ["D2","D4"]`
2. 在 `design.md`「风险与降级方案」节追加「风险接受记录」三行（命中信号 / 用户决策 / 日期）
3. 输出：`[polaris-flow 开发]常规通道 - 用户选择继续 normal：已记录风险接受（信号 <D..>）`
4. 继续 normal Step 6。**后续 Step 7 / 9 不得因同一信号再次询问**

## 3. 双门同时判定的顺序

先判降档门，再判升档门（互斥的概率极高；若同时命中，以**升档门优先**呈现——高档位流程能覆盖低档需求，反向不成立）。

## 4. 断点恢复

- 停在 §1.2 / §2.2 决策点未选 → 重新呈现选项，不得默认走 B
- 停在转交动作中途 → 补完剩余步骤（state / workflow / 输出），勿重跑判定
- 已完成转交 → 本 skill 已结束，不得再回 normal 内部步骤
