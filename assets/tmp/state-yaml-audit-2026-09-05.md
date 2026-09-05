# state.yaml 结构变更 vs coding 工作流技能 — 核对报告

- 核对时间：2026-09-05
- 基准模板：`shared/templates/state.example.yaml`（2026-09-05 15:02 更新）
- 核对范围：`zh/skills/coding/**`（10 个 SKILL.md + 15 个 policy / template）
- **结论：未正确更新。结构性失配 5 类，字段名失配 6 处，已致 2 个功能性 bug。**

---

## 0. 新模板的实际结构（核对基准）

```
顶层：language / install-time / main-repo-root / worktree-dir
     change_id / phase / current_tier / workflow
     artifact_review_mode / artifact_max_round / verify_mode
     auto_transition / isolation
     triage{tier,t1_result,t2_result,timestamp}
     worktree{created_by_polaris_flow,path,branch,origin_repo,status,created_at}
runtime:
     clarify{intention_path,status,start_time,finished_at}
     propose{status,worktree_decision,opsx_propose_status,review_round,review_log_file,
             review_report,outside_voice,outside_voice_report,start_time,finished_at,
             review{skipped,round,start_time,finished_at}}
     design{status,path,review_report,outside_voice,outside_voice_report,draft_dir,start_time,finished_at}
     plan{status,tdd_policy,tasks_path,review_report,outside_voice,outside_voice_report,start_time,finished_at}
     review{status,plan_review_status,constitution_compliance,review_report,outside_voice,outside_voice_report}
     build{status,current_task,total_tasks,completed_tasks,start_time,finished_at}
     delivery{status,merge_strategy,harness_sync,archive_dir,archive,archive_path,archive_error,start_time,finished_at}
     deepread{last_triggered,pending_file,action}
```

三处关键变化：**① 新增 `runtime:` 容器；② `current_verb` → `phase`；③ 阶段段改名（verify 消失、ship→delivery）。**

---

## 1. 结构性失配（P0，全部技能受影响）

### 1.1 `runtime:` 容器缺失 — 阶段段全部写在顶层

模板中所有阶段段都在 `runtime:` 之下，但技能一律写成顶层段。

| 技能 | 位置 | 现在写的 | 应写为 |
|---|---|---|---|
| propose | Step 5（L335） | `propose:` | `runtime.propose:` |
| propose | Step 5.2 B（L374） | `design:` | `runtime.design:` |
| design | Step 5（L233） | `design:` | `runtime.design:` |
| plan | Step 2（L144） | `plan:` | `runtime.plan:` |
| plan | Step 8（L354） | `plan:` | `runtime.plan:` |
| build | Step 6（L207） | `build:` | `runtime.build:` |
| normal | Step 9（L508-532） | `propose:` / `build:` / `verify:` | `runtime.*` |
| tweak | Step 7（L407-427） | `build:` / `verify:` | `runtime.*` |

### 1.2 `current_verb` → `phase`（共 22 处）

模板**没有** `current_verb`，只有顶层 `phase`（枚举：`idle|clarify|propose|design|plan|build|verify|delivery`）。

| 文件 | 行号 |
|---|---|
| propose/SKILL.md | 92, 107 |
| design/SKILL.md | 78 |
| plan/SKILL.md | 105, 362 |
| build/SKILL.md | 75, 215 |
| verify/SKILL.md | 84, 283 |
| ship/SKILL.md | 77, 192 |
| normal/SKILL.md | 225, 249, 375, 531 |
| normal/policies/tier-gate.md | 53, 117 |
| tweak/SKILL.md | 255, 277, 332, 428 |
| tweak/policies/upgrade-check.md | 79 |

取值也需同步映射：`current_verb: ship` → `phase: delivery`（模板 phase 枚举**无** `ship`）；`idle` / `propose` / `plan` / `design` / `build` / `verify` 可直译。

### 1.3 `verify:` 段在模板中不存在

verify/SKILL.md（L273）、tweak/SKILL.md（L418）、normal/SKILL.md（L521）、tweak/policies/exit-check.md（L57/119）都在写 `verify.*`：
`status / constitution_valid / overall_score / score_level / verify_mode / blocked / verification_report / scorer_results / finished_at`

模板 `runtime` 下**只有 `review` 段，没有 `verify`**。`runtime.review` 现有 `plan_review_status` / `constitution_compliance` 两个字段，落点与 verify 的语义部分重叠。

> **需要你决策**：是新增 `runtime.verify` 段，还是把 verify 状态并入 `runtime.review`（并删掉 `runtime.review.plan_review_status` 的重复语义）？

### 1.4 `ship:` 段不存在 —— 应为 `runtime.delivery`

ship/SKILL.md 全篇写 `ship.*`（L181/217、L243/244/250、L293/294）：
`status / finished_at / merge_strategy / harness_sync / archive_dir / archive / archive_path / archive_error / backfill`

模板 `runtime.delivery` 已覆盖其中 8 个字段，但：
- **`backfill` 模板中没有**（ship Step 4.5 的产物补齐结果无落点）
- `delivery.status` 的可选值模板未枚举，ship 实际写的是 `delivered`

### 1.5 `tweak:` / `normal:` 段在模板中完全不存在

| 写入方 | 字段 |
|---|---|
| tweak/SKILL.md L326 / L407 | `mode / status / tdd_mode / build_mode / signals / finished_at` |
| tweak/policies/upgrade-check.md L73 | `mode / status / upgraded / upgrade_reason / upgrade_target / finished_at` |
| normal/SKILL.md L368 / L506 | 同上结构 |
| normal/policies/tier-gate.md L46 / L112 | `status: downgraded|upgraded` + `downgrade_reason/target`、`upgrade_reason/target` |

模板只有顶层 `workflow: sdd|tweak|bugfix|full` 能表达通道类型，但 **mode / status / signals / upgrade_* 全部无落点**，且**没有任何技能写入 `workflow` 字段**。

---

## 2. 字段名失配（P1）

| # | 技能写法 | 模板字段 | 位置 |
|---|---|---|---|
| 2.1 | `build.build_mode` | 模板 build 段无此字段 | build L209、tweak L330/410、normal L516 |
| 2.2 | `build.review_mode` | 无 | build L210、tweak L411、normal L517 |
| 2.3 | `build.final_review` | 无 | build L211、tweak L412、normal L518 |
| 2.4 | `build.current_task` | **模板有，无人写** | — |
| 2.5 | `propose.review_mode: merged` | 无（模板只有 `review_round` + `review{}`） | normal L511 |
| 2.6 | `verify.verification_report` | 同 1.3 | verify L280 |
| 2.7 | `tweak.tdd_mode` / `normal.tdd_mode` | 无 | tweak L329、normal L371 |

模板 propose 段还有 4 个字段**从无技能写入**：`worktree_decision`（created/reused/declined）、`opsx_propose_status`（ok/failed/n/a）、`review_round`、`review_log_file`。propose Step 1.3 只回填 `worktree.*`，**不回填 `propose.worktree_decision`**。

---

## 3. 缺失的时间与状态写点（P1）

| 项 | 现状 |
|---|---|
| **`start_time`** | 模板每个阶段段都有，**全部技能零写入**（只写 `finished_at`） |
| **`propose.status: in_progress`** | propose 从不写（design/plan/build/verify 都写了） |
| **`clarify.*` 整段** | clarify/SKILL.md 完全不碰 state.yaml，全交给 `task-init.sh` / `clarify-finalize.sh`；`runtime.clarify.intention_path` 无技能回填（propose Step 3.5 只含糊说「若模板有 intention.path 则写入」） |
| **`triage.*`** | 模板有 `tier/t1_result/t2_result/timestamp`，**无人写入**；`current_tier` 只被 propose 3.3.1 读取，从不写入 |
| **`worktree.created_at`** | 模板有，propose/normal/tweak 创建 worktree 时均不写 |
| **`runtime.deepread.*`** | 模板有，无人写入 |
| **`runtime.review.*`** | 整段无人写入；plan 的审查结果写在了 `plan.review_report` 下 |
| **`artifact_max_round`** | 只有 `artifact-batch-generation.md` 读取（缺则 fallback 5），无人写入 |
| **`verify_mode` / `auto_transition` / `isolation`** | 顶层配置项，无人写入（verify 写的是 `verify.verify_mode`，与顶层 `verify_mode` 双份） |

---

## 4. 已确认的功能性 bug（P0，必须立即修）

### 4.1 ship Step 3 永不执行 —— `created_by_easy_flow` 旧名残留

`ship/SKILL.md:102`：

```
**条件**：`state.yaml: worktree.created_by_easy_flow == true`。
```

全仓库仅此一处用 `easy_flow`，其余 8 处均为 `created_by_polaris_flow`（含 ship 自己 L12/L75/L191/L288）。
**后果**：worktree 产物合回 + 清理整段被跳过，`.polaris/` 产物随 worktree 删除永久丢失。

### 4.2 ship Step 4.5 / tweak 产物补齐永不触发 —— 读 `tweak.mode` 但字段不存在

- `ship/SKILL.md:203`：`state.yaml` 中 `tweak.mode == "tweak"`
- `ship/policies/artifact-backfill.md:61`、`tweak/policies/artifact-backfill.md:61`：同上

模板无 `tweak` 段（见 1.5）。**后果**：P01 快速通道的 change-brief → 四件套补齐永远不触发，ship 归档时 `openspec-cn archive` 因四件套缺失而失败。

### 4.3 design 主审报告文件名不一致

- `design/SKILL.md:194` 落盘到 `reviews/deep-design-review-report.md`
- 而 `design/SKILL.md:236`（state 写入）、`plan/SKILL.md:102`（入口校验）都引用 `reviews/design-review-report.md`

**后果**：plan 入口校验读不到主审报告 → 审查门禁静默失效。

---

## 5. 未受影响（已核对一致）

- `worktree.{created_by_polaris_flow,path,branch,origin_repo,status}` — propose / normal / tweak 三处写法与模板一致
- `artifact_review_mode` — propose Step 3.3.2 写入顶层，与模板一致
- `plan.{status,tdd_policy,tasks_path,review_report,outside_voice,outside_voice_report}` — 段名对（位置需加 `runtime.`）
- `design.{status,path,review_report,outside_voice,outside_voice_report}` — 同上
- `retro/SKILL.md` — 只读 state，无写入

---

## 6. 待你决策的 5 个问题（按依赖顺序）

1. **verify 段归属**：新增 `runtime.verify`？还是并入 `runtime.review` 并裁掉 `plan_review_status` 的重复语义？
2. **ship → `runtime.delivery` 重命名**：`status: delivered` 是否补进模板枚举？`backfill` 字段是否补进模板？
3. **tweak / normal 私有段**：补 `runtime.tweak` / `runtime.normal` 进模板？还是改用顶层 `workflow` + `triage` 表达，删掉各通道的 mode/signals？
4. **build 的 3 个私有字段**（`build_mode` / `review_mode` / `final_review`）是否补进模板？
5. **`current_verb` → `phase` 的取值映射**：确认 `ship` → `delivery`。

确认第 1 项后，我再逐文件落改（预计改动 10 个 SKILL.md + 6 个 policy）。
