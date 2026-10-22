# coding 族 `state.yaml` 写入方式 — 修复方案

> **输入**：2026-10-16 审计结论 —— `assets/zh/skills/coding/**` 中共 **23 处**「无脚本调用、纯 AI 直写」。
> **状态**：🔵 **已落盘** —— 批 1（P0 2 处）+ 批 2（P1 21 处）已全部执行（2026-10-16），验证见文末「落盘记录」。
> **范围（硬边界）**：**仅** `assets/zh/skills/coding/**`。本轮**不改 `src/`**、不改其它族、不改 `assets/shared/templates/`。
> **判据口径**：`state.yaml` 的写入，唯一合法途径是 `scripts/task-state-entry.sh`。它独占三件能力 ——
> ① 持 `task-state-<id>.lock`；② 写后回读校验；③ `checkPhaseWrite` 阶段合法性校验。
> **AI 直写 yaml 块三者全绕过** —— 这是本方案要消灭的形态。

---

## 〇、执行原则

| 原则 | 说明 |
|---|---|
| **范围只到族边界** | 凡修复点落在 `src/` 或 `assets/shared/` 的，**一律移出本方案**（见文末「范围外登记」），本轮不处理。 |
| **只动 zh 资产** | `assets/en/skills/` 为空；按 `AGENTS.md`「先中文、确认后再改英文」，本轮改完中文即视为同步完成。 |
| **脚本已够用，不加新 op** | P0 + P1 全部修复**不需要新增任何脚本能力** —— `set` / `enter-phase` / `complete-phase` 三个 op 已覆盖全部场景。**这是「本轮零代码」的前提。** |
| **不保留兼容层** | `AGENTS.md` 明令移除过时路径。改法只指向现状值，不写「旧字段路径兼容分支」。 |
| **批次可独立回滚** | 批 1 / 批 2 单独提交，各自可独立回滚。 |
| **落盘前逐处复核行号** | 本文行号为 2026-10-16 实测值；本仓行号漂移史见 `2026-10-14-zh-skills-config-io-audit.md` 前言。 |

---

## 一、对上一轮审计的 3 处更正

| # | 上一轮说法 | 更正 | 依据 |
|---|---|---|---|
| **C1** | 「`ship` 全族唯一完全无状态脚本的技能」 | ❌ **撤回**。该结论抄自 `2026-10-14-zh-skills-config-io-audit.md` §7.3 的**旧**行号表，而同报告 §8.2 记录 2026-10-14 已修 —— `ship` Step 4 / Step 4.5 现走脚本。残留的 2 处是**出口脚本已覆盖的重复声明**，性质与「无脚本可用」不同 | `ship/SKILL.md:170-185`、`:208-213`；`2026-10-14-zh-skills-config-io-audit.md:308` |
| **C2** | 「`artifact_max_round` 有读无写、永远默认 5」 | ⚠️ **结论成立，原因更正**。不是「没有写入入口」，而是 **coding 族无任何技能写它** ⇒ 读端 `artifact-batch-generation.md:210-212` 永远走 `defaulted` 分支 | `plan/policies/artifact-batch-generation.md:208-212` |
| **C3** | 把「`set` 写顶层 phase 绕过校验」当作现存缺陷引用 | ⚠️ **已于 2026-10-14 修复**。但它反而是 AI 直写的更强论据 —— 手动 yaml 块连这道新护栏也绕过了 | 见「依据」节的脚本行为 |

> 另有一条曾怀疑「plan Step 2.1 的 worktree 判据恒被跳过、2.3.A/B 是死代码」，**实测不成立，未写入结论**，故不列为更正。

> **净结论不变**：23 处仍需修复，其中 2 处是 🔴 功能性缺陷。

---

## 二、修复清单（23 处，全部在族内）

### 2.0 分级依据

| 级别 | 判据 |
|---|---|
| 🔴 **P0** | 会**写坏数据**，或产生**读端永远读不到**的字段 —— 功能性缺陷 |
| 🟠 **P1** | 字段合法，但写入**无锁 / 无校验 / 无写后回读**，且中断续跑时该字段丢失 |

### 2.1 🔴 P0（2 处，互不耦合，可先落）

#### P0-1 `build` 出口整块直写，绕过阶段校验

| 项 | 内容 |
|---|---|
| 位置 | `build/SKILL.md:214-228`（Step 6「全部通过」后的 ```yaml``` 块） |
| 现状 | 手写 8 字段 `runtime.build.{status, build_mode, review_mode, final_review, completed_tasks, total_tasks, finished_at}` + **顶层 `phase: verify`**。build 全篇只用过一次脚本（`:73` 的 `enter-phase`） |
| 危害 | ① 顶层 `phase` 绕过阶段合法性校验，笔误（如 `verfy`）静默落盘 → Dashboard 显示「未知阶段」+ 自动衔接静默不匹配；② `status` / `finished_at` 与 `complete-phase` 的能力**完全重复**；③ `completed_tasks` / `total_tasks` 现由 AI 手数，无任何护栏 |
| 改为 | 见下方命令块。**删除** yaml 块中 `status` / `finished_at` 两行（由 `complete-phase` 产出），其余字段走 `set` |
| 依据 | `complete-phase` 写 `<阶段>.status=completed` + `finished_at` 并推顶层 `phase`；`set` 支持多点路径与 JSON 字面量 |

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase build --next-phase verify

bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.build.build_mode=<subagent_dispatch|inline> \
  --set runtime.build.review_mode=<off|standard|thorough> \
  --set "runtime.build.final_review=<done|skipped:off|skipped:<reason>|accepted_risk>" \
  --set runtime.build.completed_tasks=<N> \
  --set runtime.build.total_tasks=<N> \
  --set "runtime.build.pause_reason="
```

#### P0-2 `plan` Step 4.4 写入**不存在的命名空间** `runtime.propose`

| 项 | 内容 |
|---|---|
| 位置 | `plan/SKILL.md:225` |
| 现状 | `- runtime.propose.opsx_propose_status: <ok\|failed>` |
| 危害 | **确定性错路径**。`propose` 是**旧阶段名**，官方口径明示「`propose` 顶层（旧结构，propose 阶段**已改名 plan**）→ `runtime.plan`」。正确路径是 `runtime.plan.opsx_propose_status`（同文件 `:398` 的 Step 6 脚本写的正是这个键）。写错后：`set` 的中路径**自动建对象且不报错** → 凭空长出 `runtime.propose` 孤儿段，而 Step 6 写的是 `runtime.plan.*` → **同一语义两个键，读端必踩空** |
| 改为 | 路径改 `runtime.plan.opsx_propose_status`（**或**整条删除，见 §三 Q2） |
| 依据 | 同文件 `:398` 的 Step 6 `--set runtime.plan.opsx_propose_status=<ok\|failed>`；`assets/shared/templates/state.example.yaml:167` 该字段位于 plan 段 |

### 2.2 🟠 P1（21 处：字段合法，补脚本护栏）

统一改法：**把「写入 `state.yaml`：<字段>」整句替换为一条 `task-state-entry.sh set` 调用**，`<...>` 占位符保持不变。

| # | 位置 | 写入字段 | 改为 |
|---|---|---|---|
| P1-1 | `build/SKILL.md:84` | `build_mode=inline` + `review_mode=standard`（tweak 档派生） | `set --set runtime.build.build_mode=inline --set runtime.build.review_mode=standard` |
| P1-2 | `build/SKILL.md:104` | `runtime.build.build_mode` | `set --set runtime.build.build_mode=<...>`（可与 P1-3 合并为一条命令） |
| P1-3 | `build/SKILL.md:114` | `runtime.build.review_mode` | `set --set runtime.build.review_mode=<...>` |
| P1-4 | `build/SKILL.md:180` | `runtime.build.pause_reason`（暂停写入 / 恢复置空） | `set --set "runtime.build.pause_reason=<原因与可选项>"`；恢复时 `--set "runtime.build.pause_reason="` |
| P1-5 | `build/SKILL.md:189` | `runtime.build.final_review: skipped:off` | 合并进 P0-1 的 Step 6（推荐，避免中间双写）；若续跑需要就地读，则就地 `set --set "runtime.build.final_review=skipped:off"` |
| P1-6 | `plan/SKILL.md:83-87` | `worktree.created_by_polaris_flow/path/branch/origin_repo/status` + `phase: plan` | **删除整块**。`worktree-create.sh` 已写入同名字段（同一次调用内完成）→ 技能重复声明属历史包袱。⚠️ 若保留，两条写路径争同一块，会产生**重复顶层键**（YAML 解析直接抛错） |
| P1-7 | `plan/SKILL.md:95-97` | `runtime.plan.worktree_decision: created` | `set --set runtime.plan.worktree_decision=created` |
| P1-8 | `plan/SKILL.md:103-107` | `worktree.created_by_polaris_flow: false` + `runtime.plan.worktree_decision: declined` + `phase: plan` | `set --set worktree.created_by_polaris_flow=false --set worktree.status=main --set runtime.plan.worktree_decision=declined`（顶层 `phase` 由后续 `complete-phase` 推，不再手写） |
| P1-9 | `plan/SKILL.md:210` | 顶层 `artifact_review_mode` | `set --set artifact_review_mode=<per_batch\|after_all>`（可与 P1-10 合并） |
| P1-10 | `plan/SKILL.md:212-217` | `runtime.plan.review_round: 0` / `runtime.plan.review_log_file` | `set --set runtime.plan.review_round=0 --set "runtime.plan.review_log_file=<path\|skipped:after_all>"` |
| P1-11 | `plan/SKILL.md:240` | intention 路径字段 | `set --set runtime.specify.intention_path=openspec/changes/<task_id>/intention.md` |
| P1-12 | `plan/SKILL.md:350-352` | `runtime.plan.review_round` + 1 | `set --set runtime.plan.review_round=<N>` |
| P1-13 | `plan/SKILL.md:449-454` | `runtime.design.status: skipped` + `review_report`（```yaml``` 块） | `set --set runtime.design.status=skipped --set "runtime.design.review_report=skipped:用户选择跳过深度设计"` |
| P1-14 | `tasks/SKILL.md:135` | intention 路径字段（tweak 档补建） | `set --set runtime.specify.intention_path=openspec/changes/<task_id>/intention.md` |
| P1-15 | `tasks/SKILL.md:176-182` | `runtime.tasks.tdd_policy`（```yaml``` 块） | `set --set runtime.tasks.tdd_policy=<prefer_tdd\|require_tdd\|prefer_direct>`。⚠️ Step 9.1（`:426`）会再写一次；本处保留是为让**续跑**读得到 |
| P1-16 | `verify/SKILL.md:250` | `runtime.verify.constitution_valid` | `set --set runtime.verify.constitution_valid=<true\|false>` |
| P1-17 | `verify/SKILL.md:405` | `runtime.verify.overall_score` / `scorer_results` | `set --set runtime.verify.overall_score=<N> --set 'runtime.verify.scorer_results=[{...}]'`（`set` 已支持 JSON 字面量）→ 顺带删除 `:815` 那句「复杂对象可用 get-json 读出后由 Agent 合并」 |
| P1-18 | `verify/SKILL.md:419` | `runtime.verify.score_level` | `set --set runtime.verify.score_level=<high\|low>` |
| P1-19 | `verify/SKILL.md:782-788` | `runtime.verify.semantics_review` | `set --set runtime.verify.semantics_review=<confirmed\|skipped_by_user>`；跳过时加 `--set "runtime.verify.semantics_skip_reason=<原因>"` |
| P1-20 | `ship/SKILL.md:63` | `phase: ship` | **删除**（Step 5 的 `:184` `--set phase=ship` 已覆盖）；或改 `enter-phase --phase ship` |
| P1-21 | `ship/SKILL.md:161-164` | `worktree.status: abandoned` + `runtime.ship.harness_sync` | `set --set worktree.status=abandoned --set runtime.ship.harness_sync=skipped_worktree_retained` |

**P1 的连带澄清（不新增改动）**

| 现象 | 澄清 |
|---|---|
| `verify:405` 与 `:815` 现在是「中途 AI 直写 + Step 17 脚本补写」双写 | 补脚本后双写**变幂等**，无需删任一处 |
| `plan:212-217` / `:350-352` 与 Step 6（`:395-403`）重复写 `review_round` / `review_log_file` | 同上：补脚本后为幂等双写，中间那次是为续跑保留 |
| `tasks:176-182` 与 Step 9.1（`:426`）重复写 `tdd_policy` | 同上 |

---

## 三、疑问清单（需裁定）

### 3.1 阻塞落盘的（不定就不动手）

| # | 疑问 | 张力对比 | 我的建议 |
|---|---|---|---|
| **Q1** | **build Step 6 是「全脚本化」还是「保留 yaml 块作落盘契约」？** | **A 全脚本化**：护栏齐（锁 + 阶段校验 + 写后回读），与 plan / design / tasks / verify / ship 五个技能一致；代价 —— 出口不再有一屏可读的字段清单。<br>**B 保留 yaml 块**：可读性好，review 时一眼看全；代价 —— 顶层 `phase` 永远无护栏，且与 `complete-phase` 的能力长期重复。 | **A**。可读性用注释解决：保留 yaml 块，但标注「字段来源：下方脚本命令产出」，**仅作说明、不作执行依据**。 |
| **Q2** | **`runtime.plan.opsx_propose_status` 是改路径还是整条删？** | **A 改路径**：Step 4.4 就地落盘，中断续跑能读到本次 propose 是否成功。<br>**B 删除**：Step 6 已写该字段，Step 4.4 属冗余。 | **A**。Step 4.4 与 Step 6 之间有 `4.5 迁入` 与 `5.1 / 5.2` 两轮评审，中途中断时 Step 4.4 是**唯一**的中途记录。 |
| **Q3** | **plan Step 2.3.A 的 worktree 块直写是否直接删除？** | **A 删除**：零重复写入，杜绝两条写路径争同一块；代价 —— 技能侧不再声明 `created_at` 等字段。<br>**B 保留但改为 `set`**：技能侧显式声明全部字段；代价 —— 与脚本写入争同一块，须依赖脚本侧行为改变才安全。 | **A**。但**有一个前提必须由你确认**：删掉后，`worktree` 块的产出**完全依赖脚本**（`worktree-create.sh` 在同一次调用内写入 6 个字段）。若你希望技能侧保留"字段清单"作为可读契约，就选 B，并把 B 记为"待脚本侧对齐后生效"。 |
| **Q4** | **`verify` Step 8 的中间落盘：补脚本还是取消中间落盘？** | **A 补脚本**（3 处）：Step 9 要消费 `score_level` 做强度升格判定，中断续跑必须读得到。<br>**B 只在 Step 17 一次性写**：写入点收敛为 1 处；代价 —— Step 8→17 之间中断则 `score_level` 丢失，而 Step 9 / 10 / 13 已按它选定了强度 → 续跑会**重算**，可能得出不同结论。 | **A**。B 的代价是"同一任务两次运行强度可能不同"，不可接受。 |
| **Q5** | **plan Step 2.1 的 worktree 判据是否收紧？** | 现状判据是「读 `worktree.created_by_polaris_flow`；已存在（`true` 或 `false`）→ 跳过；缺失 / 空 → 询问」。<br>**A 维持**：实测该字段当前确实不存在（族内 state 无骨架），判据**能工作**。<br>**B 改用 `runtime.plan.worktree_decision` 作判据**：该字段专为此决策存在，`''` 即未决策，无歧义；代价 —— 与 `created_by_polaris_flow` 语义重叠，须同时维护两处。 | **A 维持现状，本轮不碰**。理由：判据能工作，改动会牵动"谁先写谁后写"的顺序推理。**但它有一个族外依赖**（初始哨兵值不统一），已登记在「范围外登记」，待族外收口后再回看。 |

### 3.2 可后置的（不阻塞，仅需结论）

| # | 疑问 | 说明 |
|---|---|---|
| **Q6** | Changelog 口径 | `AGENTS.md`：「Skill 内容变更须等中英文完全同步后写 Changelog」。`assets/en/skills/` 为空 —— 是否即算同步完成？这与 `2026-10-14-zh-skills-cross-session-context-fix-plan.md` 的 **M1** 是同一问题，**至今未裁定**。本方案一并挂起。 |

---

## 四、验证口径

| 层 | 手段 |
|---|---|
| **旧串清零** | 各文件内 `grep "写入 \`state.yaml\`"` → 除 P0-1 保留的**说明性** yaml 块外应为零 |
| **脚本一致性** | 全族 `grep -c "task-state-entry.sh"` → 修复后每个写入型技能均 ≥2（`enter-phase` + `complete-phase`） |
| **路径正确性** | `grep -rn "runtime.propose" assets/zh/skills/coding` → **零命中**（P0-2 验证） |
| **阶段合法性** | `grep -rn "phase:" assets/zh/skills/coding` → 不应再出现手写顶层 `phase` 赋值 |
| **行为回放** | 按 P1 改后的每条命令各跑一次 `task-state-entry.sh get --path <字段>`，确认落到**期望路径**（尤其 P1-11 / P1-14 的 `runtime.specify.intention_path`） |
| **回归** | 批 1 / 批 2 各自跑一次技能资产测试（沿用既有 26 项口径） |

---

## 五、建议执行顺序（本轮仅两批）

```
批 1（🔴 P0 2 处）   P0-1(build 出口) + P0-2(plan 字段路径)   ← 独立、影响最大
     ↓ 插入一次完整行为回放（§四最后两行）—— P0-2 改的是字段路径，改错会静默丢数据
批 2（🟠 P1 21 处）  build 5 + plan 8 + tasks 2 + verify 4 + ship 2
```

> 批 1 与批 2 之间**必须**回放，不可合并成一次提交。

---

## 附：范围外登记（本轮不处理）

以下线索本轮**不检查、不建议、不改动**，仅登记以免丢失。需要处理时另立范围。

| 线索 | 越界原因 |
|---|---|
| 任务 `state.yaml` 不套骨架，字段靠增量长出 | 成因在 `src/`（初始化路径）与 `assets/shared/templates/`，不在族内 |
| `worktree-create.sh` 用追加方式写顶层 `worktree:` 块 | 代码在 `src/`；对族内的影响已由 P1-6 的"删除直写"规避 |
| `created_by_polaris_flow` 的初始哨兵值不统一 | 涉及 `state.example.yaml` 与 `src/`；族内影响见 Q5 |
| `assets/tmp/skills/coding/{normal,tweak}/` 遗留旧版 | 非生效资产（不在安装清单内），不属"coding 族"的检查面 |

---

> 本文为方案产出 + 落盘记录。所有改法均指向仓库现状（文件 + 行号），可直接复核。

---

## 落盘记录（2026-10-16）

### 已执行

| 批次 | 内容 | 涉及文件 |
|---|---|---|
| 批 1 | P0-1（build 出口整块直写 → `complete-phase` + `set`，yaml 块降级为字段来源表）、P0-2（`runtime.plan.opsx_propose_status` 路径修正 + 补 `set`） | `build/SKILL.md`、`plan/SKILL.md` |
| 批 2 | P1 21 处全部改为 `task-state-entry.sh set` | `build`(5) / `plan`(8) / `tasks`(2) / `verify`(4) / `ship`(2) |

裁定采用：**Q1=A** 全脚本化 ／ **Q2=A** 改路径 ／ **Q3=A** 删除 worktree 块直写 ／ **Q4=A** 补脚本 ／ **Q5=A** 判定维持现状未动。

### 验证结果

| 项 | 结果 |
|---|---|
| `grep "写入 \`state.yaml\`\|更新 \`state.yaml\`"` | **零命中** |
| `grep "runtime.propose"` | **零命中** |
| `grep "^\`\`\`yaml"`（族内） | 仅 `verify:681`（subagent constraints payload，非 state）+ `plan/policies/artifact-batch-generation.md:23`（字段形态说明，见 F2）—— **均非写入指令** |
| 各技能 `task-state-entry.sh` 调用数 | build 6 / plan 11 / tasks 5 / verify 9 / ship 3 / design 3 / specify 3 —— 全部 ≥2 |
| **字段落点回放**（临时 repo 实跑 CLI） | 24 条 `--set` 全部落到期望路径；`scorer_results` 正确解析为**数组对象**（非字符串）；`pause_reason` 空串、`created_by_polaris_flow=false` 布尔、顶层 `artifact_review_mode` 均正确 |
| `complete-phase --phase build --next-phase verify` | exit 0；产出 `runtime.build.status=completed` + `finished_at` + 顶层 `phase: verify`，且**未**凭空造骨架 |
| 含冒号值边界（`skipped:after_all`） | 完整保存，未被 YAML 截断 |
| **负例验证 P0-2 危害** | `--set runtime.propose.opsx_propose_status=ok` → **exit 0 静默写入**，且 `get` 能读出值 —— 证实错路径无任何报错，会静默造孤儿段 |
| `vitest run test/ts/skills-install.test.ts` | **14/14 通过**（含「当前 zh 技能资产无跨技能引用、无幽灵占位符」） |

### 附带发现（5 处，**本轮未改**，待裁定）

这三类都不是「AI 直写」，因此**未进 23 处清单**；但措辞会让后来的执行者误读为直写，建议顺手收口。零风险、零逻辑影响。

| # | 位置 | 现状 | 建议改法 |
|---|---|---|---|
| **F1** | `build:70`、`verify:107`、`tasks:114`、`design:70`（4 处） | 「通过后更新 `state.yaml`：`phase: build`，`runtime.build.status: in_progress`。」—— 紧跟其后**就是** `enter-phase` 脚本，本句是脚本行为的说明 | 改为「通过后由脚本进入本阶段（产出 `phase: build`、`runtime.build.status: in_progress`）」，与脚本绑定 |
| **F2** | `plan/policies/artifact-batch-generation.md:23` | 「进入本 policy 前，调用方必须已写入：」+ ```yaml``` 块（`artifact_review_mode: per_batch`）—— 是**字段形态说明**，非写入指令 | 去掉 yaml 块，改为一句话：「调用方必须已写入 `state.yaml` 顶层 `artifact_review_mode` ∈ {`per_batch`, `after_all`}（由 plan Step 4.3 走脚本落盘）」 |

> F1 / F2 合计 5 处。**不改不影响正确性**，改了能防止「读说明 → 按说明直写」的复发路径。需你裁定是否一并落。

