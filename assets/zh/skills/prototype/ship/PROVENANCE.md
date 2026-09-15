# 溯源：prototype/ship（原型交付）

**新建**：2026-09-15 · 版本 1.0.0 · 目录 `zh/skills/prototype/ship/`
**技能全名**：`polaris{{SKN_SPR}}prototype{{SKN_SPR}}ship`（nested `polaris:prototype:ship` / flat `polaris-prototype-ship`）

## 一、为什么要有这个技能

原型链原本在 `build` 结束后就断了：交付门禁由 `flow.md` 直接调 `review`，但 `review` **只评不改、不管归档**——评审完了原型仍留在任务目录里，任务状态也没人收口。交付链路缺最后一段：

```
blueprint（出蓝图·人工确认）→ build（按蓝图做原型）→ ship（评审 → 确认 → 归档 → 收尾）
```

`ship` 补的就是这一段，且**不重复持有任何判据**：评审判据仍在 `review`，实现纪律仍在 `build`。

## 二、关键设计：评审必须由独立上下文执行

`review` 的入口 B（流程移交）原本有个已知的独立性缺口，它自己的 `§二` 写着：

> 入口 B 常由建造者在**同一会话**内接着执行——此时评审者 = 建造者，独立性受限。报告须如实注明；不因此放宽判据。

也就是说原来只能"如实标注"，缺口本身没闭合。`ship` 用 subagent 派发评审后，**评审跑到另一个上下文里**，这个注记的前提不成立——这是本技能存在的主要理由，不只是"省一步调用"。

配套约定：

| 情况 | 处理 |
|---|---|
| 平台支持 subagent | `subagent-probe` → 选 agent → `subagent-dispatch`，`task_type: doc_review` |
| 平台不支持 / 无可用 agent | 主代理 inline 执行 `review`，**报告必须标注「本轮未独立执行」** |
| 两种情况下的判据 | 完全一致——**降级的是执行方式，不是评审标准** |

`review/SKILL.md §二` 入口 B 的独立性注记已同步补一句「由 `ship` 经 subagent 派发时不适用此限制」。

## 三、与相邻技能的分工

| 技能 | 职责 | 不做的 |
|---|---|---|
| `blueprint` | 需求理解 → 蓝图 → 人工确认冻结 | 不做原型、不定页面模式与视觉 |
| `build` | 按蓝图设计细化 + 实现 + 三层验证 | 不产蓝图、不改蓝图、**不自带评审判据** |
| `review` | 判据唯一来源（§33/§34/§36）+ 只评不改 | 不改原型、**不归档、不收尾任务** |
| **`ship`（本技能）** | 派发独立评审 → 人工确认 → 归档 → 状态收尾 | 不改原型/蓝图/判据、不替用户决定返工 |

判据单向流动：`build → review`（与 `prd` 族的 `refine → review` 同方向）；`ship` 只消费结论，不参与判据生产。

## 四、流程入口决策（2026-09-15 用户拍板）

`flow.md` 的原型区**只暴露两个菜单入口**，`ship` 不占菜单项，它是「制作原型」链内的收尾段：

| 菜单项 | 调用 | 链路 |
|---|---|---|
| **R11 制作原型** | `blueprint` | blueprint → build → **ship** |
| **R12 评审原型** | `review` | 单独评审已有原型，只评不改、**不归档** |

原 R12（按蓝图制作原型）**删除**——build 并入 R11 成为链内环节；原 R13 重命名为 R12。

`build` Step 5 与退出条件里的「移交 flow.md R13」同步改为移交 `ship`。

## 五、约定与默认值

| 项 | 取值 | 备注 |
|---|---|---|
| `--kind` | `prototype` | 与 blueprint / build 一致 |
| phase | `ship` | |
| 归档目录 | `$REPO_ROOT/docs/prototype/` | 可用 `PROTOTYPE_DOC_DIR` 覆盖；对齐 `prd/ship` 的 `docs/prd/` |
| 归档命名 | `{前缀}-{原型名}-原型-v1.0.html` | 前缀与原型名取 `state.yaml` 的 `page_prefix` / `name`（blueprint 确认时写入） |
| 冲突策略 | 不静默覆盖，询问 覆盖 / 另存 `-v1.1` / 取消 | 与 `prd/ship` 3.1 同款 |
| 归档性质 | **副本**，任务目录原始产物保留 | 便于事后用 `review_report.md` 里的 `sha256` 核对「评审对象 = 交付对象」 |

**未覆盖**：本技能暂不带 `evals/`（与 `prd/ship` 一致；`build` / `review` 各有自己的评测器）。若后续要为「派发材料完整性」「P0 未清零禁止归档」等断言建评测，再单独补。
