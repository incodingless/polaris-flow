# 产物补齐 — change-brief 与 OpenSpec 体系的双向映射

> `change-brief.md` 的节结构是刻意按四件套的关系设计的，因此两条下游路径都只做**格式转换**，不补内容：
>
> - **§2 升档路径**：brief → `intention.md`，交 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal`（P02 常规通道，由 `upgrade-check.md` §3.1 调用）
> - **§3 归档路径**：brief → 四件套，供 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` 归档前调用
>
> **硬规则**：brief 每一节必须自洽完整。下游禁止新增简报里没有的需求、模块或验收标准。

---

## 1. 映射总表

| `change-brief.md` 节 | `intention.md` 节（§2 升档） | 四件套去向（§3 归档） |
|---|---|---|
| 一句话目标 | `## 目标` | `proposal.md` — 目标 |
| 问题与背景 | `## Reframe 历程`（需改写，见 §2.1） | `proposal.md` — Why / Context |
| 范围 → 包含 / 不包含 | `## 任务范围（Scope）` | `proposal.md` — Scope / 非目标 |
| 范围 → 拆分决策 | `## 任务范围（Scope）` 末尾 | `proposal.md` — Scope 备注 |
| 验收标准 | `## 验收场景及标准` | `specs/<capability>/spec.md` — Requirements + Scenarios |
| 方案 | `## 结论（架构 + 技术选型）` | `design.md` — Architecture / 技术选型 |
| 宪法对齐 | `## 宪法对齐` | `design.md` — `## Constitution Alignment` |
| 前提与风险 | `## 前提`（风险留在 `## 待决问题` 或省略） | `design.md` — `## Premises` |
| 备选方案 | `## 备选方案` | `design.md` — `## Alternatives` |
| 待决问题 | `## 待决问题` | `proposal.md` — Open Questions |
| 影响面 | `## 下游约束` | 不进四件套；仅用于 capability 命名（§3.2） |

`intention.md` 的 `## 前提历史` 节：轻量通道未做 Premise Challenge，填「无（tweak 轻量通道未执行 Premise Challenge）」。

---

## 2. 升档路径：brief → intention.md

### 2.1 改写要求

1. `read_file ./templates/intention-template.md`，**按模板节顺序**生成
2. 逐节按 §1 映射表搬运内容，简报没有的节填「无」，**不得删节**
3. `## Reframe 历程` 必须改写为一行说明，不得复制「问题与背景」原文：

```markdown
- 轻量通道（tweak）未执行 Reframe Check；原始诉求 X 经升档转入常规链路继续
```

4. 写入 `.polaris/tasks/<change_id>/intention.md`

### 2.2 校验

生成后必须满足 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` Step 1.5 的模板要求：目标、任务范围、验收场景及标准、宪法对齐、前提、结论（架构 + 技术选型）、待决问题、备选方案各节均存在且**非空**。

缺节或为空 → 补齐后重跑，不得带着缺口转交（会让 normal 的轻量澄清丢失简报的结构化信息）。

---

## 3. 归档路径：brief → OpenSpec 四件套

### 3.1 触发条件

`polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` Step 5（归档询问）之前，满足**任一**即触发：

- `openspec/changes/<change_id>/change-brief.md` 存在，且 `proposal.md` / `design.md` / `specs/` 任一缺失
- `state.yaml` 中 `tweak.mode == "tweak"`

未触发时（例如本次本就是 P02/P03 完整链路）跳过整节。

### 3.2 生成规则

以 `change-brief.md`「影响面 → 主 capability 命名」作为 specs 子目录名；缺失时回退为 `change_id`。

| 目标文件 | 内容来源 | 必须包含的节 |
|---|---|---|
| `proposal.md` | 一句话目标、问题与背景、范围、待决问题 | Why / Context、目标、Scope、非目标、Open Questions |
| `design.md` | 方案、宪法对齐、前提与风险、备选方案 | Architecture / 技术选型、`## Constitution Alignment`、`## Premises`、`## Alternatives` |
| `specs/<capability>/spec.md` | 验收标准 | Requirements（ADDED）+ Scenarios（GWT 格式） |
| `tasks.md` | **保持原样，不动** | — |

**Spec 场景格式**：验收标准逐条转写为 GWT：

```markdown
## ADDED Requirements

### Requirement: <验收标准标题>
<一句话描述>

#### Scenario: <场景名>
- **WHEN** <触发条件>
- **THEN** <期望结果>
```

### 3.3 来源标注

补齐生成的 `proposal.md` / `design.md` / `specs/*.md` **首行必须**插入标注，避免被误认为人工设计产物：

```markdown
<!-- 由 tweak 快速通道归档前自动补齐，源：openspec/changes/<change_id>/change-brief.md -->
```

### 3.4 校验与失败处理

补齐后按 `polaris{{SKN_SPR}}coding{{SKN_SPR}}propose` Step 4.1 的机械终检标准自检：

- 四件套存在且非空；`specs/` 为目录且含至少一个非空文件
- `proposal.md` 含问题背景、目标、范围、非目标
- `design.md` 含架构决策、方案选型，且含 `## Constitution Alignment` / `## Alternatives` / `## Premises`

**失败处理**：不阻断交付。按 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` 现有规则处置——`ship.archive=failed`，写入 `archive_error`，`openspec/changes/<change_id>/` 保持原位，照常进入 Step 6.1 清游标。用户可事后手动补齐并运行 `openspec-cn archive <change_id>`。

**禁止**：因补齐失败而回滚已完成的分支合并与 worktree 合回。

---

## 4. 硬规则

- 补齐只是**格式转换**：禁止新增简报中不存在的目标、模块、验收场景或设计决策
- 禁止修改 `tasks.md`（它是执行的唯一真相）
- 禁止删除 `change-brief.md`（它是补齐的源，随 openspec 一并归档）
- 补齐产物必须可追溯：标注来源 + 保留简报原文
