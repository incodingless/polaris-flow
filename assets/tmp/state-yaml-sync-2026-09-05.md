# coding 工作流 state.yaml 同步改造：落地报告

日期：2026-09-05
基线：`shared/templates/state.example.yaml`（新结构）
修改范围：coding 工作流全部 10 个 SKILL.md + 6 个 policy + 1 个全局 hard-stops + 模板本身

---

## 用户 5 项决策 → 全部已落实

| # | 决策 | 落地位置 |
|---|---|---|
| 1 | verify 段归属 → 新增 `runtime.verify`（独立块） | 模板新增；verify SKILL yaml 块嵌套进 runtime |
| 2 | ship → `runtime.ship`，`backfill` 字段补进模板 | 模板重命名 delivery→ship + 加 backfill；ship SKILL 嵌套进 runtime |
| 3 | tweak/normal 私有段 → 补 `runtime.tweak` / `runtime.normal` 进模板 | 模板新增两个块；tweak/normal SKILL yaml 嵌套进 runtime |
| 4 | build 私有字段 → `build_mode` / `review_mode` / `final_review` 补进模板 | 模板新增三字段；build SKILL 嵌套进 runtime |
| 5 | `current_verb` → `phase`，`delivery` → `ship` | 22 处 `current_verb` 已全替换；phase=delivery 全清零 |

---

## 改动统计

- **yaml 块嵌套**：22 个 state 配置块全部移入 `runtime:` 容器，0 个失配
- **字段引用加前缀**：约 90 处阶段字段引用加上 `runtime.` 前缀
- **命名迁移**：22 处 `current_verb:` → `phase:`
- **bug 修复**：3 处功能性 bug（详见下方）

---

## 修复的 3 个功能性 bug

### Bug 1：`ship/SKILL.md:102` 旧字段名导致 Step 3 整段静默失效
- **问题**：条件写 `worktree.created_by_easy_flow == true`，但全仓唯一一处旧名，其余 8 处都是 `created_by_polaris_flow`
- **后果**：ship Step 3（产物合回+清理）永不执行，`.polaris/` 产物随 `git worktree remove` 永久丢失
- **修复**：统一为 `created_by_polaris_flow`

### Bug 2：`design/SKILL.md` 报告路径不一致导致 plan 入口审查门禁静默失效
- **问题**：design 落盘到 `reviews/deep-design-review-report.md`，但 L236 与 `plan/SKILL.md:102` 引用的是 `reviews/design-review-report.md`
- **后果**：plan 阶段查不到审查报告，门禁永远通过
- **修复**：落盘路径统一为 `design-review-report.md`

### Bug 3：`ship/SKILL.md:203` + `ship|policies/artifact-backfill.md:61` 读 `tweak.mode == "tweak"`，模板无 tweak 段
- **问题**：模板没有 `runtime.tweak` 块，触发条件永远为 false
- **后果**：P01 快速通道的产物补齐永不触发，后续 `openspec-cn archive` 因四件套缺失失败
- **修复**：模板新增 `runtime.tweak` / `runtime.normal` 两个段（决策项 #3 一并解决）

### 顺带修复：全局 hard-stops
- `zh/policies/hard-stops.md` 也有一处 `created_by_easy_flow`，与 ship SKILL 同步改为 `created_by_polaris_flow`

---

## 模板最终结构

```yaml
phase: idle  # 枚举: idle|clarify|propose|design|plan|build|verify|ship

runtime:
  clarify:    { intention_path, status, start_time, finished_at }
  propose:    { status, worktree_decision, opsx_propose_status, review_round,
                review_log_file, review_mode, review_report, outside_voice,
                outside_voice_report, start_time, finished_at, review }
  design:     { status, path, review_report, outside_voice, outside_voice_report,
                draft_dir, start_time, finished_at }
  plan:       { status, tdd_policy, tasks_path, review_report, outside_voice,
                outside_voice_report, start_time, finished_at }
  review:     { status, plan_review_status, constitution_compliance, review_report,
                outside_voice, outside_voice_report }
  build:      { status, build_mode, review_mode, final_review, current_task,
                total_tasks, completed_tasks, start_time, finished_at }
  verify:     { status, verify_mode, constitution_valid, overall_score, score_level,
                blocked, verification_report, scorer_results, start_time, finished_at }
  ship:       { status, merge_strategy, harness_sync, archive_dir, backfill,
                archive, archive_path, archive_error, start_time, finished_at }
  tweak:      { mode, status, tdd_mode, build_mode, signals, upgrade_reason,
                upgrade_target, finished_at }
  normal:     { mode, status, tdd_mode, build_mode, signals, downgrade_reason,
                downgrade_target, upgrade_reason, upgrade_target, finished_at }
  deepread:   { last_triggered, pending_file }
```

---

## 最终校验（5 项全过）

| 检查项 | 结果 |
|---|---|
| 1. 模板 YAML 解析合法 | ✓ |
| 2. runtime 段齐（11 个：build/clarify/deepread/design/normal/plan/propose/review/ship/tweak/verify） | ✓ |
| 3. phase 取值全合法（idle×9 / propose×6 / build×3 / design×1 / verify×1 / plan×1 / ship×1） | ✓ |
| 4. coding 内 current_verb / easy_flow / deep-design-review-report / phase=delivery 全清零 | ✓ |
| 5. 技能引用的 runtime.* 字段全部在模板内 | ✓ 0 失配 |

---

## 范围外（不属本次任务）

- `zh/skills/prd/draft/SKILL.md:50` 与 `zh/skills/prd/README.md:106` 仍有 `current_verb: draft`，属 **prd 工作流**的 state，coding 已清零；prd 是否需要同样改造需另立任务
- `zh/skills/requirements-engineering/prd-final/SKILL.md:13` 英文短语 "delivery chapters" 是 PRD 章节语义，非 state 阶段名，无需改

---

## 第二轮纠正（15:59）：tweak/normal 应归属 workflow 而非 runtime

### 问题
用户指出：tweak / normal 是**工作流**而非技能，把它们放在 `runtime` 下语义错位。
- runtime 是「阶段容器」（propose/design/plan/build/...），单一 change 内串行推进
- tweak/normal 是「工作流类型」选择（sdd/tweak/bugfix/full），跨多个阶段并行生效

把工作流塞进运行时容器，违反职责分层。

### 改动
- **模板**：
  - 升级 `workflow: sdd`（字符串）→ `workflow: { mode: sdd, tweak: {...}, normal: {...} }`（块）
  - 删除原 `runtime.tweak` / `runtime.normal` 两个段
  - 新增 `workflow.tweak.{mode,status,tdd_mode,build_mode,signals,upgrade_reason,upgrade_target,finished_at}` 共 8 字段
  - 新增 `workflow.normal.{mode,status,tdd_mode,build_mode,signals,downgrade_reason,downgrade_target,upgrade_reason,upgrade_target,finished_at}` 共 10 字段
- **批量替换**：8 处 `runtime.tweak.*` / `runtime.normal.*` → `workflow.tweak.*` / `workflow.normal.*`
  - `tweak/SKILL.md` + `tweak/policies/upgrade-check.md` + `tweak/policies/artifact-backfill.md`
  - `normal/SKILL.md` + `normal/policies/tier-gate.md`
  - `ship/SKILL.md`（2 处） + `ship/policies/artifact-backfill.md`

### 最终校验（5 项全过）
1. ✓ 模板 YAML 合法
2. ✓ workflow 是 dict（mode + tweak 8 字段 + normal 10 字段）
3. ✓ runtime 已无 tweak/normal，剩 9 个段：build/clarify/deepread/design/plan/propose/review/ship/verify
4. ✓ 技能引用全部合法：70 个 runtime 路径 + 18 个 workflow 路径 = 88 个，0 失配
5. ✓ 残留扫描：`runtime.tweak` / `runtime.normal` / `current_verb` / `easy_flow` / `deep-design-review-report` 全部清零

### 设计要点（备忘）
- `workflow.mode` 是工作流类型选择入口（sdd / tweak / bugfix / full）
- `workflow.tweak.*` 仅 `mode=tweak` 时填充；`workflow.normal.*` 仅 `mode=sdd` 时填充
- 升档/降档信号（`signals` / `upgrade_reason` / `downgrade_reason` / `upgrade_target` / `downgrade_target`）聚合在工作流块下，因属工作流级决策
- 阶段段（`runtime.propose` / `design` / `plan` / `build` / ...）继续承担阶段状态，与工作流块解耦

---

## 第三轮纠正（16:06）：删除 `runtime.review`，字段拆分到 plan/verify

### 用户决策
方案 B：删除 `runtime.review` 整段，相关字段按职责拆分到对应阶段块。

### 字段迁移
| 旧字段（runtime.review.*）| 新位置 | 理由 |
|---|---|---|
| `plan_review_status` | `runtime.plan.plan_review_status` | plan 阶段内 subagent 评审产出，归属 plan |
| `constitution_compliance` | `runtime.verify.constitution_compliance` | constitution 子规则逐条合规结果，归属 verify |
| `constitution_valid` | 已存在 `runtime.verify.constitution_valid` | 聚合判定，与 `constitution_compliance` 并存（细则 + 汇总） |
| `review_report` / `outside_voice` / `outside_voice_report` | 已在 `runtime.propose` / `design` / `plan` | 各阶段独有，无需迁移 |
| `status` | 删除 | review 不再是独立阶段 |

### 改动量
- 模板删除 `runtime.review` 整段（21 行）
- `runtime.plan` 加 `plan_review_status` 字段
- `runtime.verify` 加 `constitution_compliance` 字段
- **技能侧零改动**——`runtime.review.*` 在全 coding 目录零引用（孤儿段，技能从未写入）

### 最终校验（5 项全过）
1. ✓ 模板 YAML 合法
2. ✓ runtime 段已无 review（剩 8 个：build / clarify / deepread / design / plan / propose / ship / verify）
3. ✓ plan 含 `plan_review_status`，verify 含 `constitution_compliance` + `constitution_valid`
4. ✓ 路径合法性：66 runtime 路径 + 18 workflow 路径 = 84 个，0 失配
5. ✓ 残留扫描：`runtime.review` / `runtime.tweak` / `runtime.normal` / 历史字段名 全部清零

### 关键洞察
之前的审计报告已发现 `runtime.review` 是孤儿段（模板有、技能无）。本次把它移除并把字段按职责归位，让模板与技能完全对齐 —— **没有任何「模板定义但技能永不写」的字段**，消除了潜在的静默漂移。

---

## 第四轮纠正（16:30）：propose 4 个孤儿字段补写入

### 用户决策
对第一轮审计清单第 2 项「propose 4 个孤儿字段（worktree_decision / opsx_propose_status / review_round / review_log_file）」选「补充写入」，让模板与技能对齐。

### 字段写入点设计

| 字段 | 写入位置 | 取值说明 |
|---|---|---|
| `runtime.propose.worktree_decision` | Step 1.3.A / 1.3.B 末尾 | A 创建→`created`；B 拒绝→`declined`（续跑时 1.1 自检保留历史值）|
| `runtime.propose.opsx_propose_status` | Step 3.4 末尾 | 四件套生成后填 `ok` / `failed` |
| `runtime.propose.review_log_file` | Step 3.3.2 用户决策点后 | A per_batch → 路径；B after_all → `skipped:after_all` |
| `runtime.propose.review_round` | 3.3.2 初始化为 0，4.2 每次主审落盘 +1 | 最多 3 轮 |

### 改动量
- 1 个文件：`zh/skills/coding/propose/SKILL.md`
- 5 个写入位置：Step 1.3.A、1.3.B、3.3.2 表后、3.4 末、4.2 末
- Step 5 yaml 完成态块同步展示 4 个字段（避免「先写后忘」漂移）

### 最终校验（5 项全过）
1. ✓ 模板合法
2. ✓ Step 5 yaml 块4 个新字段全部出现（与模板对齐）
3. ✓ 4 字段在 propose/SKILL.md 出现：worktree_decision×3 / opsx_propose_status×2 / review_round×4 / review_log_file×2
4. ✓ 路径 0 失配（runtime 路径共 66 个合法）
5. ✓ 残留扫描：`runtime.review` / `runtime.tweak` / `runtime.normal` / `easy_flow` 全部 0；`current_verb` 仅 1 处在 prd/README.md（范围外）

### 关键洞察
「补充写入 vs 删除」是要反复斟酌的设计抉择：本例中 4 个字段都对应 propose 阶段**实际存在的关键决策点**（worktree 创建、opsx 生成结果、批内日志存在性、主审轮次），删除会让「续跑」「3 轮上限判定」「审批报告路径反查」全部丢上下文，因此选**补充写入**是正确的。

后续若同一字段在 3 个阶段都没写入，再考虑删除。

---

## 第五轮（20:50：polaris-flow TS 源码适配，方案 A 落地）

### 用户决策
A — 全面改造 polaris-flow TS 源码（task-state.ts / task.ts / polaris-project-config.ts / test），让代码层适配 runtime.* / workflow.* 新结构，根治"模板与代码脱节"问题。

### 改造清单（5 文件）

| 文件 | 改动 |
|---|---|
| `src/core/config/task-state.ts` | 类型 + 默认值全量重写：删 clarify/intention/review/delivery 顶层；新增 `runtime: { clarify, propose, design, plan, build, verify, ship, deepread }` + `workflow_state: { mode, tweak, normal }`；加 `artifact_review_mode/artifact_max_round`；加 `migrateLegacyShape()` 读取层兼容旧扁平 |
| `src/core/hooks/task.ts` | `state.intention = {...}` → `state.runtime.clarify.intention_path`；`state.clarify = {...}` → `state.runtime.clarify`；finalize patch 同改 |
| `src/core/config/polaris-project-config.ts` | TaskPhase `'delivery'` → `'ship'`；注释保留别名语义 |
| `test/ts/task-state.test.ts` | 5 个测试用例全改新结构；新增"旧扁平自动归一"用例；修正导入路径 bug |
| `scripts/check_state_yaml_three_way.py` | **新增**：三方一致性校验脚本（模板 ↔ TS ↔ SKILL.md） |

### 校验（4 项全过）
1. ✓ `tsc --noEmit` 无错误（43 秒）
2. ✓ `vitest run task-state.test.ts`：5/5 测试通过（含旧扁平兼容、kebab 兼容）
3. ✓ 三方一致性：模板 8 段 runtime + 3 段 workflow，TS 类型完全对齐；22 个 SKILL runtime 引用 + 5 个 workflow 引用全部命中
4. ✓ `state-next.ts` 的 `delivery/archive → ship` 别名保留为读取层兼容

### 兼容策略
- **读取层** `migrateLegacyShape` 把旧扁平（intention/clarify/review/delivery/build_mode/review_mode/workflow: 'sdd'）自动归一为 runtime.*/workflow_state.*；落盘一律新结构
- **kebab 归一** `normalizeKeys` 一律转 snake，删除顶层白名单机制（简化）
- **`workflow_state` 双写** 顶层同时写 `workflow: 'sdd'`（兼容老 reader）和 `workflow_state: {mode: 'sdd'}`（新结构权威）

### 校验脚本亮点
`scripts/check_state_yaml_three_way.py` 跑一次即可输出三方对齐报告：
```
✓ 模板 runtime 子段全部在 TS 中定义
✓ 模板 workflow 子段全部在 TS 中定义
✓ 模板顶层字段全部在 TS 中定义
✓ 技能 runtime 引用全部命中模板 + TS
✓ 技能 workflow 引用全部命中模板 + TS
```
任何后续若 SKILL.md/模板/TS 出现漂移，脚本 0 退出码转 1 + 指出具体失配路径。
