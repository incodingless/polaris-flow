# `assets/zh/skills/` 阻塞点审计

> 范围：`assets/zh/skills/` 下 34 个技能（含各自 `policies/`、`templates/`、`references/`）。
> 排除：`evals/`、`.work/`、`fixtures/`、`example/`、`PROVENANCE.md`。
> 结论以仓库现状为准；本文件为审计报告，不修改任何技能资产。

---

## 一、判定口径

### 1.1 什么是「阻塞点」

任何使流程**必须停止 / 暂停并等待外部条件**的强制节点。分五类：

| 类型 | 含义 | 典型形态 |
|---|---|---|
| **P1 用户决策点 / 人工确认门** | 必须等用户明确选择或确认才能继续 | 标注「阻塞点」的 Step、`decision-point.md` 协议、询问工具 |
| **P2 结构门禁 / 前置校验** | 前置产物缺失、字段不合法、状态未就绪、锁被占则中止 | 入口校验、`gate.passed=false`、互斥锁、`tasks-lint.sh` |
| **P3 停止条件** | 依赖缺失 / 状态损坏 / 路径越界 / 命令不可用 → 报阻塞与恢复条件 | `RTID_EXIT != 0 → 阻断`、零匹配阻断 |
| **P4 硬性禁令** | 某动作被明令禁止 | `HARD STOP`、`禁止跳过`、`禁止调用 X` |
| **P5 自检门** | 必须先生成自检话术 / 自检清单并通过才能继续 | 「未同时满足 N 条不得宣告完成」、`[已 read_file …]` |

**执行主体分两种**，是必要性判定的关键：

- **hard** —— 脚本退出码 / 校验器能真正拦截（如 `tasks-lint.sh`、`verify.mjs`、`ship.lock`）
- **soft** —— 仅文档劝导，模型可自行绕过

### 1.2 必要性判定（四档）

| 判定 | 含义 |
|---|---|
| **必要** | 在该技能语义下确有不可替代价值，保留 |
| **过重** | 有必要但形式过强 / 粒度过细 / 可降级为提示 |
| **冗余** | 与全局策略（`assets/zh/policies/`）或上下游技能重复，可删 |
| **失效** | 无执行主体、条件永不触发、自相矛盾、引用不存在的产物 / 命令 / 文件 |
| **存疑** | 证据不足以定档，需人工裁定 |

判定判据取自仓库既有约定：`decision-point.md`（只有「≥2 个均合法、改变范围 / 风险 / 不可逆结果的选项」才配设阻塞；「只有一个安全下一步」属自动处理，不得制造确认）、`hard-stops.md`（H8–H14）、`ask-question-react.md`（禁止在 SKILL 内写死 `AskUserQuestion`）。

---

## 二、总览

| 族 | 技能数 | 阻塞点条目 | 必要 | 过重 | 冗余 | 失效 | 存疑 |
|---|---:|---:|---:|---:|---:|---:|---:|
| coding（上：build/design/normal/plan/tasks/specify） | 6 | 117 | 96 | 5 | 4 | 1 | 4 |
| coding（下：tweak/verify/ship/retro） | 4 | 112 | 96 | 1 | 11 | 2 | 2 |
| prd | 7 | 89 | 71 | 7 | 1 | 6 | 4 |
| testing | 6 | 82 | 66 | 2 | 11 | 2 | 1 |
| prototype | 4 | 64 | 60 | 0 | 1 | 1 | 2 |
| debug / constitution / subagent / codereview | 7 | 114 | 84 | 4 | 4 | 10 | 3 |
| **合计** | **34** | **578** | **473** | **19** | **32** | **22** | **16** |

> 计数为「条目」口径（同一门禁在多处声明会重复计入）。去重后唯一阻塞位置约 480 处。
> **总体结论：约 82% 的阻塞点在其技能语义下确有必要**，问题集中在三类：① 全局条款的技能内复述（冗余）；② 陈旧引用（失效）；③ 形式化自检门（过重）。真正的「不该设卡」极少。

---

## 三、按技能分类汇总

### 3.1 coding 族（10 个技能）

#### `coding/build` — 阻塞点 16 条｜必要 13 · 过重 1 · 冗余 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:253-254` | 「每个 task 实施前必须输出 `[Constitution C]…`」 | P5 | **过重** | 仅打印一行话术，无主体可拦截；与 `implementer-prompt.md:13` 重复声明 |
| `SKILL.md:14` | 「禁止调用 `superpowers:subagent-driven-development`（H13）」 | P4 | **冗余** | `hard-stops.md` H13 已是全局条款 |

必要项分布：脚本硬拦截 2（`RTID_EXIT`、出口脚本）、结构门禁 5（入口校验 / 计划缺陷回退 / 出口硬阻断）、人确认 3（执行方式、审查模式、`paused` 决策）、停止条件 2、禁令 4。**门槛设计成立**：`build_mode` / `review_mode` 均为「≥2 个改变行为」的真实选项。

#### `coding/design` — 阻塞点 19 条｜必要 14 · 冗余 2 · 失效 1 · 存疑 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `policies/reframe-check.md`（整份） | 「否则必须输出至少 1 个 Reframe 候选并等待用户选择」 | P1 | **冗余 + 失效** | **✅ 已核验**：`design/SKILL.md` 全文 0 次提及 `reframe` → orphan；自身第 63/103 行引用 `pre_design.md`「Premise Challenge」，design 均无此产物与步骤；正文与 `specify/policies/reframe-check.md` 近乎逐字相同 |
| `policies/design-domain-model-policy.md:27`（另 repository:30 / data-model:34 / restful-api:32） | 「detailed-design.md 缺失 → 阻断」 | P2 | **冗余** | 同一句在 4 个专项 policy 各写一遍 |
| `policies/design-repository-policy.md:98` 等 | 「本 policy 不单独派发审查 subagent（忽略旧指令）」 | P4 | **存疑** | 若旧指令已不存在则为死文本，本仓无法证实 |

#### `coding/normal` — 阻塞点 23 条｜必要 19 · 过重 1 · 冗余 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:281` | 「强制前置：`read_file ./templates/design-template.md`，并输出 `[已 read_file …]`」 | P5 | **过重** | 只校验「打印了标记」，不能保证真的按模板生成；normal/plan/specify/tasks 四技能同型 |
| `SKILL.md:21` | 「禁止调用 superpowers 派发驱动器（H13）」 | P4 | **冗余** | 同 build |

必要项含中档核心守卫（`tier-gate` 双向档位门、`exit-check` 四种硬阻断、`constitution-audit` 三选项）——判据清晰，均属「≥2 合法选项」。`Step 5` 明确「命中才发问」，符合 decision-point「不得滥设」。

#### `coding/plan` — 阻塞点 18 条｜必要 15 · 过重 2 · 存疑 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:61` | 「Step 1：Worktree 决策（提示性，非阻断）…按 `./policies/decision-point.md` 协议」 | P1/P2 | **过重 + 自相矛盾** | 标题自称「提示性、非阻断」，正文却引用阻塞协议；`hard-stops.md` 第 24 行又明确「非阻断式提示」——**三处语义冲突**，AI 会在「是否阻塞」上摇摆 |
| `SKILL.md:13` | 「禁止…生成 `tasks.md` 之前未读取 `./templates/tasks-template.md`」 | P5 | **过重** | 同 normal |
| `SKILL.md:15` | 「禁止通过 `superpowers:using-git-worktrees` 创建 worktree」 | P4 | **存疑** | 未说明该 skill 为何不可用 |

#### `coding/tasks` — 阻塞点 20 条｜必要 17 · 存疑 2

本技能是全族**主审最硬**者：“主审不可跳过”，`PLATFORM_DEGRADATION=inline|unsupported` 直接阻断（与 design/plan 允许 decision-point 跳过刻意不同，设计意图明确、成立）。

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `policies/scope-challenge.md:42` | 「本 agent 禁止联网。跳过实际联网查询…」 | P4 | **存疑** | 约束而非阻塞点，且自带降级记录；「禁网」不可强制 |

#### `coding/specify` — 阻塞点 21 条｜必要 18 · 过重 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:153` | 「强制前置：写入前必须 `read_file ./templates/intention-template.md`」 | P5 | **过重** | 同 normal |

必要项中 `3.0「≥3 个探索性问题 + 覆盖 ≥3 类 + 等待用户回答」硬门`是本族最有价值的设计：把「澄清质量」变成可判定门槛，且带自检防「一轮问答充数」。

#### `coding/tweak` — 阻塞点 38 条｜必要 31 · 冗余 6 · 存疑 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `policies/task-split-precheck.md:86,191` | 「§4 用户决策点…禁止进入 Reframe Check、Premise Challenge」 | P1/P4 | **冗余** | tweak 仅消费 §1（`SKILL.md:154` 明示），§4/§5/§7 指向 specify 的步骤，tweak 不可达 |
| `policies/upgrade-check.md:105` | 「停在 §2 未选 → 重新呈现，不得默认走 B」 | P1 | **冗余** | `decision-point.md` 已含「不得代选」通则 |
| `SKILL.md:308` / `SKILL.md:312` / `tweak-tasks-template.md:87` | read_file 模板自检；「>3 个顶层任务 → 停止生成」 | P5/P2 | **冗余** | 模板与 SKILL 同规则双写 |
| `SKILL.md:18` | H13 禁令复述 | P4 | **冗余** | 全局条款 |
| `SKILL.md:107` | 「读取失败或内容与诉求明显无关 → 先回报用户再决定」 | P1 | **存疑** | 「明显无关」为主观判断，报告+标注后继续也在安全范围内 |

#### `coding/verify` — 阻塞点 40 条｜必要 36 · 冗余 1 · 失效 1 · 存疑 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:329` | 「**默认走 A（全绿才放行）**，红名单为可选逃生门」 | P2 | **存疑（口径分歧）** | ⚠️ **已核验并下调**：这**不是**与仓库冲突的失效项 —— `docs/specs/2026-09-25-verify-test-evidence-design.md:101` 明载「基线红名单｜默认 A（全绿才放行）；红名单作可选逃生门｜用户同意」。技能正文与该 spec 一致；同段判读 b「存量轨红且在红名单 → 放行」即 red-list 语义。**仅当项目后续已裁定改走纯 B 时**，此句才需改。请在两者间确认唯一裁定 |
| `SKILL.md:612` | 「7 项完整验证…被 normal 与 tweak 的 `exit-check.md` 引用」 | P2 | **失效** | tweak 实际压到 6 项（C1–C6），跨技能契约描述陈旧 |
| `policies/constitution-audit.md:42-46` | 「有 Critical/Major → 停等用户三选项」 | P1 | **冗余** | **✅ 已核验**：与 `tweak/policies/constitution-audit.md` **逐字相同（diff 为空）** |

> 说明：`SKILL.md:784`（Step 15 在 `light`/`full` 都必现）经核验与 spec 第 392–393 行一致（「业务语义误读与改动规模无关」），判定为**过重但设计有据**，不作整改项。

#### `coding/ship` — 阻塞点 23 条｜必要 19 · 冗余 4

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:11` / `:12` | H11 / H9 禁令复述 | P4 | **冗余** | 全局 `hard-stops.md` 已声明 |
| `SKILL.md:80` | 「≥30min 视为 stale，须用户显式确认清理（H11）」 | P1 | **冗余** | `ship-lock.md:45-56` 已完整定义 |
| `policies/artifact-backfill.md` | 「缺节或为空 → 补齐后重跑」 | P2 | **冗余 + 分叉** | **✅ 已核验**：与 tweak 同名文件仅 3 行不同 —— **tweak 版指向 `normal`，ship 版指向 `plan`**。需确认哪一版为准（升档目标是 normal，ship 侧路径疑为陈旧） |

#### `coding/retro` — 阻塞点 11 条｜必要 10 · 过重 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:144-148` | 「按 decision-point 列出候选让用户选择(单选) **是否保存**」 | P1 | **过重** | 保存与否均可逆，属低价值确认；可默认不落盘、由用户显式索要 |

---

### 3.2 prd 族（7 个技能）

> ⚠️ **口径校准**：requirement kind 实为 **4 阶段 `discovery → draft → refine → ship`**（`src/core/config/task-kind-layout.ts:168-173`、`requirement-state.ts:11`）—— 已核验。「6 阶段（含 detail/archive）」为过时记忆，本报告不据此判失效。

#### `prd/discovery` — 阻塞点 12 条｜必要 8 · 过重 1 · 失效 2 · 存疑 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:79`（另 `:98`、`:197`） | 「仍无 `$PLUGIN_ROOT` → 按 **H12** 阻断」 | P3 | **失效** | **✅ 已核验**：`hard-stops.md:19` 的 H12 是「写 `.polaris/workflow.yaml` 须持 `workflow.lock`」，与 `$PLUGIN_ROOT` 缺失无关（三处错引） |
| `SKILL.md:251` | 「单次询问的选项数上限以 ask-question-react 注册表为准（**当前 10 个**）」 | P1 | **失效** | **✅ 已核验**：`ask-question-react.md:24-36` 明定「有效 ≤4 + 其他 1 = ≤5」，10 是**文本降级**软上限，口径混淆 |
| `SKILL.md:557` | 「再次硬性校验六项必问项是否全部闭环」 | P5 | **过重** | 与 4.1 的「6 项强制校验」重复设卡，可并入一次终检 |
| `SKILL.md:603` | 「仅对某条/某节反馈｜不算确认｜修改后重新执行 **5.2**」 | P1 | **存疑** | Step 5.2 是「增量补充需求基线」，非终审步骤，回流目标疑漂移 |

#### `prd/draft` — 阻塞点 18 条｜必要 16 · 失效 2

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:219` | 「阈值规则：**保留率低于 95%，不允许进入交付阶段**」 | P2 | **失效（冲突）** | **✅ 已核验**：`policies/key-points-management.md:50` 写「保留率 **85%~95%**：输出缺失清单，用户确认是否可接受」；`<85%` 才强制回补。两处阈值互斥，须二选一 |

#### `prd/refine` — 阻塞点 21 条｜必要 18 · 过重 1 · 冗余 1 · 失效 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:255` | 「章节自检机制（每章生成后强制执行…）」 | P5 | **过重** | 8 项 / 章的逐章粒度，可降为提示 |
| `SKILL.md:27` | 「禁止省略模板强制章节：角色与权限（第2章）…」 | P4 | **冗余** | `prd_template.md` 的 `[必填]` 已是真源 |
| `SKILL.md:573-576` | 「无 `prd_final_draft.md`｜从 **Step 2.5** 合并开始」 | P3 | **失效** | 正文标题为 Step 3 合并 / Step 4 评审（`:277`、`:291`），恢复表编号自相矛盾 → 中断恢复会定位错 |

#### `prd/review` — 阻塞点 7 条｜必要 5 · 过重 2

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:296` | 「**配对要求**：每条问题必须在两处同时出现且配对完整」 | P5 | **过重** | 纯格式义务，不影响结论正确性 |
| `SKILL.md:314` | 「Step 1–4 是原子流程…中间**不设恢复点**」 | P3 | **过重** | 大文档中断须全量重跑，代价高 |

#### `prd/testability` — 阻塞点 7 条｜必要 4 · 过重 2 · 存疑 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:196` | 配对要求（同 review） | P5 | **过重** | 同上 |
| `SKILL.md:211` | 「Step 1–4 是原子流程…中断即从 Step 1 重跑」 | P3 | **过重** | 同上 |
| `SKILL.md:46` | 「确认评审范围｜**默认全量评审**｜如用户指定章节…」 | P1 | **存疑** | 与 `review` 的「必须询问范围」不对称，静默默认易漏 |

#### `prd/readiness` — 阻塞点 11 条｜必要 10 · 过重 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:216` | 「Step 0–4 是原子流程…中断即从 Step 0 重跑」 | P3 | **过重** | 证据收集+打分较重，可保留部分恢复点 |

本技能是全族唯一准出门（五维加权 + 双门槛 + 一票否决），且「连续免评 2 次后第 3 次强制全评」防漂移设计成立。

#### `prd/ship` — 阻塞点 13 条｜必要 10 · 失效 1 · 存疑 2

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:96` | 「与 refine **Step 3.0/3.1** 相同」 | P4 | **失效** | refine 的 probe 实为 Step 4.0/4.1（`refine/SKILL.md:302`、`:323`），跨技能步骤引用失效 |
| `SKILL.md:113` vs `:129` | 「FAIL｜**硬阻断**：不得进入确认交付」 vs 「B. 仍要交付（须填风险接受理由）」 | P2/P1 | **存疑** | 「硬阻断」措辞与「仍要交付」逃生口并存，须明确是合规逃生口还是误留 |

---

### 3.3 testing 族（6 个技能）

#### `testing/discovery` — 阻塞点 16 条｜必要 13 · 过重 1 · 冗余 2

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:118` | 「2.1 命名与来源确认（阻塞点）…暂停让用户选定或自拟」 | P1 | **过重** | 已有推荐默认名且改名可逆，可降为回显确认 |
| `SKILL.md:48` | 「禁止在步骤中途提压缩，禁止伪造压缩」 | P4 | **冗余** | 复述 `auto-transition.md` 层级 A 模板 |
| `SKILL.md:277` | 「门禁不通过 → 不得推进，回到对应 Step 补正后重跑」 | P5 | **冗余** | 与 `:311-319` 退出条件重复 |

#### `testing/draft` — 阻塞点 13 条｜必要 10 · 冗余 3

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:37` | 「禁止在步骤中途提压缩」 | P4 | **冗余** | 全局策略复述 |
| `SKILL.md:128` | 「禁止静默跳过——review 只能凭此处区分」 | P4 | **冗余** | 与 `:12` 同义重复 |
| `references/01-case-design-criteria.md:48` | 「E7/E8 一律归 refine…」 | P4 | **冗余** | 复述 `SKILL.md:15` |

#### `testing/refine` — 阻塞点 17 条｜必要 14 · 冗余 3

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:120` | 「必须调用 `use_skill("polaris:subagent-probe")`」 | P4 | **冗余** | 复述全局 H10 |
| `references/01-…automation.md:12`、`templates/test-cases-nonfunctional-template.md:9` | 「指标缺失…禁止编造阈值」 | P4 | **冗余** | 二次、三次复述 `SKILL.md:11` |

必要项含本族出口硬门（`refine.review_blocking_count=0`）与「禁止本族内定义测试执行口径」（口径唯一源在 `coding/verify`）——边界清晰。

#### `testing/review` — 阻塞点 14 条｜必要 11 · 过重 1 · 冗余 1 · 失效 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:154` | 「Step 0–4 是原子流程…中断即从 Step 0 重跑」 | P4/P2 | **过重** | 与 `auto-transition` 恢复清单冲突，阻断了按维度续跑 |
| `SKILL.md:84` | 「逐维度执行，不得跳过任何维度」 | P4 | **冗余** | 与 `:24` 同义 |
| `references/01-review-criteria.md:55` | 「按 `./01-case-design-criteria.md §四` 核对」 | P2 | **失效** | 该文件不在 `review/references/` 下（唯一源在 `draft/references/`）；同文件 L4 用的是全限定名，此处不一致 |

#### `testing/acceptance` — 阻塞点 7 条｜必要 5 · 失效 1 · 存疑 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:131` | 「输出到 `openspec/changes/<task_id>/test/acceptance-criteria.md`」 | P2 | **失效** | **✅ 已核验**：testcase kind 的登记产物全部落 `.polaris/testcases/<id>/`（`task-kind-layout.ts:220-236`），无一处用 `openspec/changes/.../test/`；acceptance 作为服务型技能未被登记 → 路径与族约定不一致 |
| `SKILL.md:27` | 「必需：需求条目 / 功能点清单」 | P2 | **存疑** | 声明「必需」但未定义缺失时的阻断动作，门槛仅文档级 |

#### `testing/ship` — 阻塞点 15 条｜必要 13 · 冗余 2

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:59` | 「C1 用例集质量 = 评审报告 Critical=0」 | P2 | **冗余** | 与 refine 出口门 `review_blocking_count=0` 同源重判（应引用字段而非重读报告） |
| `templates/testcase-report-template.md:5` | 「禁止编造通过率」 | P4 | **冗余** | 复述 `SKILL.md:72` |

> **✅ 已核验**：全族无 `ship.lock` / H11 引用 —— testing/ship **未**重复 coding/ship 的锁语义，符合预期（见 §四.3 关于 H11 适用范围的歧义）。

---

### 3.4 prototype 族（4 个技能）

#### `prototype/blueprint` — 阻塞点 12 条｜**全部必要**

唯一环节间硬门禁（Step 4 人工确认→冻结）判据充分：「模糊回复不算确认、沉默不算确认」防「默认同意」；Page ID 前缀冻结是机器契约。

> 备注：`SKILL.md:42/61/134` 把「`$PLUGIN_ROOT` 缺失」归为 H12 —— 同 §四.2 的系统性错引。

#### `prototype/build` — 阻塞点 21 条｜必要 19 · 冗余 1 · 失效 1 · 存疑 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:87` / `:112` / `:209` | 「阻断：提示先执行 `blueprint`（flow.md **R11**）」 | P2 | **失效** | 菜单已改为 P01，`flow.md` 无 R11 → 悬空引用 |
| `references/00-basis.md:110` | 「完整 31 条见 review §34——那里是唯一来源。本节只列…8 条」 | P4/P2 | **冗余** | 与 review 判据重复且需人工同步，可只留指针 |
| `scripts/verify.mjs:21,120` | `--blocklist=<file>` 真实姓名/内部项目名黑名单 | P2 | **存疑** | 机制已实现但**无任何技能正文指示传入** → 「未接通的黑名单门」 |

必要项核心是三层验证硬门（`verify.mjs` 退出码 0 + `--strict` 下跳层按未完成计）与 §34 一票否决 —— 均 hard，设计成立。

#### `prototype/review` — 阻塞点 17 条｜必要 15 · 存疑 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:105` | 「入口 A…先声明再动手，**等用户确认**」 | P1 | **存疑** | 「只评不改」既已声明，唯一安全下一步即继续评审，可能落入「不该制造确认」；但用户可能需先纠正评审对象路径，故未直接判过重 |

#### `prototype/ship` — 阻塞点 14 条｜**全部必要**

> ⚠️ **对分族扫描结论的修正**：`ship-lock` 缺失**不是**本技能的缺陷。**✅ 已核验**：`ship.lock` / H11 仅存在于 `coding/ship`（`SKILL.md:34,78,80` 与 `ship-lock.md`），本仓无 `prototype/ship/policies/ship-lock.md`。真正的问题是 `hard-stops.md:18` H11 的「适用 skill：**`ship`**（Step 0）」表述未限定 `coding:ship`，易被误读为覆盖全部同名 ship 技能（testing/ship 同此）。

---

### 3.5 debug 族（3 个技能）

> **✅ 已核验**：debug kind 为三阶段 `diagnose → patch → closeout`（`task-kind-layout.ts:269-283`），**无 `build` 阶段**。
> **✅ 已核验**：门禁级人确认恰好两处 —— `diagnose/SKILL.md:287`（5.6 根因确认，**无条件必停**）与 `:321`（6.5 方案确认，**仅分叉时**），与「6 阶段流程 + 两处人确认」的设计一致，无缺失。三道结构门禁与 `diagnose-brief.md` / `rca-report.md` / `tasks.md` 一一对应。

#### `debug/diagnose` — 阻塞点 34 条｜必要 29 · 过重 2 · 冗余 1 · 失效 2

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:26` / `:53` | 「缺失 `$REPO_ROOT`/`$PLUGIN_ROOT`…按 H12 阻断」「参数/环境错误 → 按 H12 阻断」 | P3 | **失效** | **✅ 已核验**：H12 是 workflow.yaml 写锁，与 env 前置无关（见 §四.2，全仓 ≥8 处同类错引） |
| `SKILL.md:92` | 「issue_id 命名结果暂停等用户确认（不得静默落盘）」 | P1 | **过重** | 仅一个自动命名值，按 decision-point 应「说明后直接采用」 |
| `SKILL.md:143/148` | 「暂停等用户选：是否创建 worktree」 | P1 | **过重** | `hard-stops.md:24` 明确 worktree 决策为「**非阻断式提示**」，此处升级为阻塞 → 口径冲突 |
| `SKILL.md:103` vs `policies/scene-routing.md:37` | 「信号不足必须暂停等用户选，不得默认某一通道」 | P1 | **冗余** | 同义重复声明 |

#### `debug/patch` — 阻塞点 14 条｜必要 11 · 冗余 1 · 失效 2

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:23` | 「复用 `$REPO_ROOT`/`$PLUGIN_ROOT`（缺失按 H12 阻断）」 | P3 | **失效** | 同上 |
| `SKILL.md:59` | 「更新 `state.yaml`：`phase: build`，`build.status: in_progress`」 | P2 | **失效（自相矛盾）** | **✅ 已核验**：debug 合法阶段无 `build`；紧接的脚本命令用的是 `--phase patch`。按其自身约定，写表外阶段会被校验器以退出码 3 拒绝 |
| `SKILL.md:24/44` | 「找任务多条则暂停等用户选」 | P1 | **冗余** | 与 `closeout:24/43` 完全同构，跨阶段重复实现 |

#### `debug/closeout` — 阻塞点 15 条｜必要 14 · 冗余 1 · 失效 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:23` | 「缺失按 H12 阻断」 | P3 | **失效** | 同上（系统性错引） |
| `SKILL.md:24/43` | 「找任务多条则暂停等用户选」 | P1 | **冗余** | 与 patch 重复 |

> 生产通道的人确认点（release 确认 `:136`）与「未建 worktree 时提交方式 A/B/C」均判必要 —— 不可逆操作的真实决策。

---

### 3.6 其余族（4 个技能）

#### `constitution` — 阻塞点 11 条｜必要 3 · 失效 5 · 存疑 1

**全仓陈旧度最高的技能**，整套注入机制已断链：

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `policies/constitution-injection.md:11,19,27,35` | 「**位置**：`/ezfl:design` / `/ezfl:lock` / `/ezfl:build` / `/ezfl:audit` command」 | — | **失效** | **✅ 已核验**：`assets/zh/commands/` 下无任何 `ezfl` 命令（现为 `/polaris:*`，见 `flow.md` 等），四个注入点全部指向不存在的入口 |
| `policies/constitution-injection.md:37` | 「详见 `constitution-audit.md`」 | P1 | **失效** | **✅ 已核验**：`assets/zh/skills/constitution/` 下仅 4 个文件，无 `constitution-audit.md`（该文件只在 coding 族存在） |
| `policies/constitution-create.md:28` | 「并输出 `[**easy-flow** constitution] 已 read_file …`」 | P5 | **失效** | 自检话术前缀为旧命名 `easy-flow`，且无消费者校验 → 形同虚设 |
| `SKILL.md:48` | 「required=true 时未生成有效宪法的项目阻断 plan/apply」 | P2 | **存疑** | 技能内仅为注释，真正拦截在下游，本处不产生阻塞 |

其余（CREATE/AMEND 的写入前确认、`constitution-validity.sh` 退出码校验）判必要。

#### `subagent-dispatch` — 阻塞点 8 条｜**全部必要**

D-0.1 的 `materials ≤300 行` 闸门是父会话上下文成本的硬保护，阈值明确；回报契约（「只给状态+路径+短列表」「禁止粘贴原文/diff」）与 `auto-transition.md` 层级 B 一致。

> ⚠️ 一致性缺口：本技能正文**未声明 H10 / H13**，而其 `agent=null` 路径与 H10「禁止跳过 Subagent Probe 直接派发」存在张力（见 §四.4）。

#### `subagent-probe` — 阻塞点 7 条｜必要 6 · 存疑 1

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:34` | 「必须调用本技能当本步需要 task_type 预筛 / subagent_id 命中 / 缺注入缓存」 | P2 | **存疑** | 与 H10「必须 probe、禁止跳过」的绝对措辞冲突 —— 是**全局条款与技能正文的口径冲突**（见 §四.4） |

#### `maintance/codereview` — 阻塞点 25 条｜必要 23 · 过重 2

| 位置 | 原文摘录 | 类型 | 判定 | 理由 |
|---|---|---|---|---|
| `SKILL.md:18` | 「禁止对单个小文件输出数百行的冗长报告」 | P4 | **过重** | 「数百行」无阈值、无主体，宜降为提示 |
| `SKILL.md:214` | 「停：高危面走完即停。禁止为清单完整而补『建议关注』」 | P3 | **过重** | 停止条件主观且无执行主体 |

必要项含 8 种评审范围单选（超 4 选项故走文本降级，**处理正确**）、SonarQube 两个决策点、以及**脚本级硬拦截**（`analyze.sh:32` / `analyze.py:609` 目标不存在即 `exit 1`）。

> **✅ 已核验·边界清晰**：`codereview` 与 `coding/verify` **无实质重复** —— verify 以 codereview 为 `review-rubric.md` / 报告模板 / SonarQube 口径的唯一出处，只引用不复制。
> **✅ 已核验·冗余**：`debug/{diagnose,patch,closeout}` 三份 `references/artifacts.md` 内容完全同文（md5 一致），应为单一来源 + 引用。

---

## 四、跨技能的系统性问题

### 4.1 全局条款被逐字复述（冗余主因，32 条中的多数）

> ⚠️ **本节经二轮核对后收窄**：`hard-stops.md:7` 明文要求各技能**声明**自己遵守哪些 ID，
> 故「H 条款声明表」与「H8 各技能的状态行格式」**属必需、不算复述**。精确清单与处置见 §7.2。

| 全局条款 | 复述位置 | 建议 |
|---|---|---|
| **H13**（禁 superpowers 派发器） | `coding/build:14`、`normal:21`、`tweak:18`（**`tasks` 无此行，上一轮系误记**） | 改为按 ID 引用 |
| **H9 / H11**（worktree 合回 / ship lock） | `coding/ship:11,12,80` | 同上（细则留 `ship-lock.md`） |
| **H10**（派发前 probe） | `testing/refine:120` | 同上 |
| **「禁止中途提压缩」** | `testing/discovery:48`、`testing/draft:37`、`prd/discovery:66`、`prd/draft:23`、`coding/design:174` —— 均已声明以 `auto-transition.md` 为唯一源，属轻度复述 | 🔵 建议保留（该禁令被忽略的代价高） |
| **`constitution-audit.md`** | `coding/{normal,tweak,verify}` **3 份**（normal 52 行、另两份 50 行，差异仅头部） | 抽为 `assets/zh/policies/constitution-audit.md` |
| **`artifact-backfill.md`** | `coding/tweak` 与 `coding/ship` 3 行分叉 | 上轮已裁定「保留两版 + 加说明」；正式收敛与 §7.4 一并裁定 |
| **`intention-template.md`** | 4 份 / **3 个有意变体**（normal、specify、tweak≡ship；差异在各通道的来源注释） | **不合并**；仅修 `plan:142` 悬空引用、处置 ship 侧死资产（§7.1） |
| **`references/artifacts.md`** | `debug/` 三份**字节相同** | 单一来源 + 引用（`references/` 无注入机制，需迁为共享 policy，见 §7.1） |

### 4.2 H12 被系统性错引（实为 14 行，已修）

`hard-stops.md` H12 = 「写 `.polaris/workflow.yaml` 须持 `workflow.lock`」。但以下位置把「`$PLUGIN_ROOT` 缺失 / 参数环境错误」也题为 H12（**已在第二轮修正，见 §6.2 D**）：

`coding/tweak:79,96` · `prototype/blueprint:42` · `prd/discovery:79` · `debug/diagnose:26,53` · `debug/patch:23` · `debug/closeout:23`

**这不是单点 typo，而是口径问题**：要么 H12 的表述需要扩充（覆盖「workflow 脚本环境前置」），要么这 8 处需改引到独立的「环境依赖缺失」停止条件。否则触发时会输出**错误的 H12 自检话术**（内容讲 workflow.lock，与现场无关）。

### 4.3 H12 的「适用 skill」清单与正文不一致

`hard-stops.md:19` 列 H12 适用 `design`/`plan`/`ship`/`diagnose`/`patch`/`closeout`，**未含** `tweak`、`verify`、`build`、`specify`、`normal`；但 `coding/tweak:52` 在自声明表中明确适用 H12 并使用，`verify` 亦经 `workflow-entry.sh` 写 workflow.yaml。同理 H11 的「适用 skill：`ship`」未限定 `coding:ship` **（已核验：`ship.lock`/H11 仅 coding/ship 有实现）**。

### 4.4 H10 与技能正文直接冲突

`hard-stops.md:17` H10：「**禁止**跳过 Subagent Probe 直接派发」。但：

- `coding/tweak:51`：「**条件适用**：仅当用户显式要求 subagent 派发时…仅默认通用且支持 → **不调 probe 直接 dispatch（`agent=null`）**」
- `debug/patch:82`：「SUPPORTS_SUBAGENT=true 且只要默认通用 → 不调 probe 直接 dispatch」
- `subagent-probe/SKILL.md:20,35-40`：给出「可跳过 probe」的条件分支

三者与 H10 的绝对禁止措辞**不一致**。必须二选一：放宽 H10 措辞（写明可跳过条件），或删掉各技能的「跳过 probe」分支。

### 4.5 结构性断链 / 悬空引用（失效主因，22 条）

| 位置 | 问题 |
|---|---|
| `constitution/policies/constitution-injection.md` | 整套注入机制指向 `/ezfl:*`（不存在）+ `constitution-audit.md`（不存在） |
| `coding/design/policies/reframe-check.md` | orphan（SKILL.md 0 次引用）+ 引用不存在的 `pre_design.md` |
| `prototype/build/SKILL.md:87,112,209` | 引用 `flow.md R11`（现存菜单为 P01） |
| `prd/ship/SKILL.md:96` | 引用 `refine Step 3.0/3.1`（实为 4.0/4.1） |
| `testing/review/references/01-review-criteria.md:55` | 引用本目录不存在的 `./01-case-design-criteria.md` |
| `testing/acceptance/SKILL.md:131` | 落盘到 `openspec/changes/<task_id>/test/`，与 testcase kind 的 `.polaris/testcases/<id>/` 不一致 |
| `debug/patch/SKILL.md:59` | 写 `phase: build`（debug 无此阶段） |
| `coding/verify/SKILL.md:612` | 引用「7 项验证契约」，tweak 实际为 6 项 |

---

## 五、整改建议（按优先级）

- 🟠 **严重**
  1. **裁定 verify 基线唯一口径**：`coding/verify:329`「默认 A」与 `docs/specs/2026-09-25:101`（已标注"用户同意"）一致；若项目记忆中的「改走 B」是更晚裁定，须同步技能与 spec，二者只能留一个。
  2. **清除 constitution 注入断链**：重写 `constitution-injection.md` 为 `/polaris:*` 入口，或整份删除。
  3. **统一 H10 口径**：放宽 `hard-stops.md` H10 措辞或删除 `tweak`/`patch`/`subagent-probe` 的「跳过 probe」分支。
  4. **修正 H12 系统性错引（≥8 处）**，并补全 H12/H11 的「适用 skill」清单（含 `coding:tweak`/`verify`，限定 `coding:ship`）。
  5. **修 `debug/patch:59` 的 `phase: build`**（应为 `patch`，否则被阶段校验器拒绝）。

- 🟡 **建议**
  6. **收敛同名重复文件**：`constitution-audit.md`（tweak≡verify 逐字）、`intention-template.md`（tweak≡ship 逐字）、`debug/artifacts.md`（三份同文）抽为单一来源；`artifact-backfill.md` 裁定 target 技能。
  7. **修 prd draft 保留率阈值冲突**（`SKILL.md:219` <95% 硬阻断 vs `key-points-management.md:50` 85–95% 可接受）。
  8. **修 `coding/design/policies/reframe-check.md`**：orphan + 引用不存在产物，建议砍掉（Reframe 属 specify 职责）或改为一行指针。
  9. **修 `prototype/build` 的 `R11` 悬空引用**，`prd/refine` 步骤编号漂移，`testing/review` 判据引用路径。
  10. **接通或删除 `prototype/build` 的 `--blocklist` 黑名单门**。
  11. **收敛 testing 的 Critical 门禁**：`refine:14/169/188` 三处同技能自重复 + `ship:59` 跨技能重判，改为引用 `review_blocking_count` 字段。

- 🔵 **可选**
  12. **降低形式化自检门**：`normal/plan/specify/tasks` 的「read_file 模板 + 打印 `[已 read_file …]`」四技能同型，建议降为提示或抽公共 policy。
  13. **降级三处原子流程约束**（`prd/review:314`、`prd/testability:211`、`prd/readiness:216`）：允许指纹式增量恢复，避免中断即全量重跑。
  14. **降级低价值确认**：`coding/retro:144`（是否保存报告）、`debug/diagnose:92`（issue_id 命名）、`debug/diagnose:143`（worktree 升级为阻塞）、`testing/discovery:118`（命名确认）。
  15. **统一 testing/review · prd/review · prd/readiness 的结论词汇**（通过/不通过 ↔ PASS/FAIL ↔ 有条件通过）。

---

## 六、修复记录（2026-10-09）

### 6.1 已修复（客观错误，无需决策）

| # | 文件 | 修改 | 依据 |
|---|---|---|---|
| 1 | `debug/patch/SKILL.md:59` | `phase: build` / `build.status: in_progress` → `phase: patch` / `runtime.patch.status: in_progress` | `assets/shared/templates/debug-state.example.yaml`（合法阶段只有 `idle/diagnose/patch/closeout`，运行态在 `runtime.<phase>`）；且同一段落的脚本命令本就是 `--phase patch` |
| 2 | `prototype/build/SKILL.md:87,112,209` | `flow.md R11` → `flow.md P01` | `assets/zh/commands/flow.md` 的原型菜单是 **P01 制作原型 / P02 评审已有原型**，`R11` 不存在（`R11` 只出现在陈旧的 `PROVENANCE.md` 与退役备份里） |
| 3 | `constitution/policies/constitution-create.md:28` | 自检话术前缀 `[easy-flow constitution]` → `[polaris-flow constitution]` | 全仓已无 `easy-flow` 品牌名 |
| 4 | `prd/refine/SKILL.md:573-576` | 恢复表步骤号 `2.5 / 3 / 3.3 / 4` → `3（合并终稿全文）/ 4（完整评审）/ 4.3（问题分级与修复机制）/ 5（定稿输出）` | 与该技能正文标题一致（`:277` Step 3、`:291` Step 4、`:442` 4.3、`:478` Step 5） |
| 5 | `coding/verify/SKILL.md:612` | 删除错误论断「『7 项完整验证』被 normal 与 tweak 的 `exit-check.md` 引用，改项数会破坏跨技能契约」→ 说明两者各有自己的六项检查表（C1–C6），相互独立 | `normal/policies/exit-check.md:13`「## 1. 六项检查」、`tweak/policies/exit-check.md:5`「把 7 项完整验证压到 6 项」 |
| 6 | `testing/review/references/01-review-criteria.md:55-56` | `./01-case-design-criteria.md §四`、`§五` → 全限定为 `polaris:testing:draft` 的 `references/01-case-design-criteria.md §四/§五` | 该文件不在 `review/references/` 下；同文件 L4 已用全限定写法；`draft/references/01-case-design-criteria.md:68,78` 确有「## 四、优先级」「## 五、执行分层」 |
| 7 | `testing/acceptance/SKILL.md:131` | 删除 `openspec/changes/<task_id>/test/acceptance-criteria.md` → 改为三级落盘优先级（调用方给定 → 有任务目录时写 `.polaris/testcases/<task_id>/` → 皆无则请用户指定） | 该路径出自**已退役**的 `testing/case`（`assets/tmp/backup/testing-case-retired-20260930/`）；本技能无 `task_id` 语义（`commands/testing/acceptance.md:9` 只要求需求条目清单），不能假定任务目录存在 |
| 8 | `prd/draft/SKILL.md:219` | 单档「<95% 不允许进入交付」→ 三档（≥95% 通过 / 85–95% 用户确认可接受 / <85% 强制回补），并标注唯一出处 | `policies/key-points-management.md` 的「阈值机制」节是该口径的拥有者；两处原本互斥 |
| 9 | `assets/zh/policies/hard-stops.md` H11 | 「适用 skill：`ship`」→ **`coding:ship`**，并注明 `prototype:ship` / `testing:ship` 不持此锁 | `ship-lock.md` 只存在于 `assets/zh/skills/coding/ship/policies/`（全仓检索确认） |
| 10 | `assets/zh/policies/hard-stops.md` H12 | 适用 skill 由 6 个旧技能名 → 「所有经 `workflow-entry.sh` 写 workflow.yaml 的位置（4 个 kind 的全部阶段技能）」；并显式声明「`$PLUGIN_ROOT` 缺失等**环境依赖问题不属本条**」 | 全仓 `workflow-entry.sh update-active/append-active/delete-active` 覆盖 4 个 kind 的阶段技能，远多于原清单 |
| 11 | 删除 `coding/design/policies/reframe-check.md` | 删除该 orphan 策略文件 | `design/SKILL.md` 全文 0 次引用；自身引用不存在的 `pre_design.md`；正文与 `specify/policies/reframe-check.md` 重复；全仓无任何引用方（`git grep` 确认） |

> 依据仓库 `AGENTS.md`「Remove obsolete paths instead of adding compatibility layers」，第 11 项采用删除而非加兼容层。
> **未写 Changelog**：`AGENTS.md` 规定 Skill 内容修改须等中英文同步后再写；本轮只改中文版，待英文版同步。

### 6.2 已裁定并执行（第二轮，2026-10-09）

以下四项经用户裁定后执行：

| # | 事项 | 用户裁定 | 执行结果 |
|---|---|---|---|
| A | **verify 基线唯一口径** | **保留为用户的决定，本轮不改** | 未改动。技能与 `docs/specs/2026-09-25` 一致，待你另行裁定 |
| B | **`artifact-backfill.md` 两版分叉** | **保留两版，仅加说明** | 在两份副本头部各加「同名副本说明」：tweak 侧承载 §2 升档路径（目标 `normal`）、ship 侧只消费 §3 归档路径且 §2 无调用方；并注明 ship 副本 §2 的 `plan` 目标**以 tweak 侧为准**、改动其一须同步另一 |
| C | **H10 与技能正文冲突** | **删除技能内「可跳过 probe」分支** | 改 3 处：`coding/tweak`（H 条款表 + Step 5.1 四步重写）、`debug/patch:82`、`subagent-probe`（「可不必调用」段 + 调用方契约整段重写）。统一为「派发前必须先 probe，不设跳过分支」，并强调「缓存是探测结果的复用，不是探测的替代」 |
| D | **H12 错引** | **改这 12 处，去掉 H12 引用** | 实际改 **14 行 / 6 文件**：`coding/tweak`（4）、`prototype/blueprint`（3）、`prd/discovery`（3）、`debug/diagnose`（2）、`debug/patch`（1）、`debug/closeout`（1）。全部改为「停止并报告阻塞原因（按 stderr / SessionStart 未注入环境变量）」；**保留** 3 处 `workflow.yaml` 语境下的正确 H12 引用（`tweak:97,234` 的 workflow 写入/rename 失败、`diagnose:181` 的 workflow 同步） |

> 盘点修正：审计正文原写「≥8 处」，逐文件核对后实为 **14 行**（其中 `prototype/blueprint` 与 `prd/discovery` 各有 3 处，含 subagent 初报未覆盖的 `blueprint:61,134`、`discovery:98,197`）。

**回归验证**（两轮改动后）：

| 套件 | 结果 |
|---|---|
| `manifest` / `install-layout` / `task-kind-phases` / `phase-validation` | **4 文件 / 67 用例全绿** |
| `skills-install` / `manifest` / `install-layout` / `phase-validation` | **4 文件 / 41 用例全绿**，含「zh 技能资产无跨技能 `../` 引用、无幽灵占位符」检查 |

> 全量 `npx vitest run` 的失败集中在 `session-start*`（5s/60s 超时，属既有 timeout 债）与
> `detect-test-command.integration` / `session-start-sh.integration`（本机未全局安装 polaris-flow CLI），
> **均与本次改动无关**；安装类套件同命令三次重跑得到 9 → 1 → 0 失败，是同一超时债的抖动。

### 6.3 待你裁定 / 待定的下一批

**仍待你裁定的 1 项**：

- **verify 基线口径**（上文 A）：`coding/verify:329`「默认走 A（全绿才放行），红名单为可选逃生门」与 `docs/specs/2026-09-25-verify-test-evidence-design.md:101` 完全一致（该 spec 标注「用户同意」）；项目记忆中另有「改走 B（仅阻止新增失败）」的裁定。两者只能留一个。

**清理类（建议先出方案再动）**：

- **同名策略文件收敛为单一来源**：`tweak/policies/constitution-audit.md` ≡ `verify/policies/constitution-audit.md`（逐字）；`tweak/templates/intention-template.md` ≡ `ship/templates/intention-template.md`（逐字）；`debug/{diagnose,patch,closeout}/references/artifacts.md` 三份同文。合并涉及「放到 `assets/zh/policies/` 还是某族」与安装注入路径，需一次性定方案。`artifact-backfill.md` 本轮已按「保留两版 + 加说明」处理，正式收敛另案。
- **H13 / H9 / H11 / 「禁止中途压缩」的技能内复述**（约 12 处）统一改为按 ID 引用。
- **`constitution/policies/constitution-injection.md` 整套重写或删除**：四个注入点全指 `/ezfl:*`（命令已不存在），并引用 constitution/ 下不存在的 `constitution-audit.md`。这是全仓最严重的断链簇，但重写需要先确定「宪法注入在本仓由谁承担」。
- **`upgrade-check.md` 内部自相矛盾**：§3.2 把 workflow 游标置 `plan`，§3.3 却输出「下一步执行 normal」并写 `upgrade_target: normal` —— 与 B 项同源，建议与 artifact-backfill §2 一并裁定。
- **形式化自检门降级**：`normal` / `plan` / `specify` / `tasks` 的「`read_file` 模板 + 打印 `[已 read_file …]`」四技能同型。

---

## 七、清理批：方案与执行记录（批 0–3 已完成）

### 7.0 处置判据与批次顺序

三条处置判据（均取自仓库既有约定）：

1. **安装器可用性** —— `src/core/install/skills.ts` Step 3 把 `assets/zh/policies/*` 注入**每个叶技能**的 `policies/`（`subagent-probe` / `subagent-dispatch` 除外，同名 overwrite）。因此「收敛到 `assets/zh/policies/`」对策略类文件是**现成机制**，技能内 `./policies/xxx.md` 引用无需改动。
2. **自包含** —— 同文件 `:284-285` 明令：源文件里的跨技能 `../specify/...`、跨层 `../../../../policies/...` 在 flat 布局下必然断裂，**正确做法是技能名引用或技能内自包含路径（`./policies/`、`./templates/`）**。`skills-install.test.ts` 有专门用例拦这类引用。
3. **`templates/` 不逐技能注入** —— 包级 `templates/` 落到插件根 `skills/polaris/templates/`，不进入各技能目录。故技能内 `./templates/xxx.md` **只能**是技能自带副本。

批次顺序（低风险 → 高风险）：**批 0 机械修补 → 批 1 唯一源收敛 → 批 2 复述清理 → 批 3 需裁定项**。每批后跑 `skills-install` / `manifest` / `install-layout` / `phase-validation` 四个套件。

### 7.1 同名文件收敛

先纠正上一轮的口径：**「同名即冗余」不成立**，逐份比对后分三类。

| 文件 | 副本与差异（已 `md5` / `diff` 核对） | 性质 | 处置 |
|---|---|---|---|
| `coding/{normal,tweak,verify}/policies/constitution-audit.md` | 3 份；normal 52 行、tweak 50、verify 50，**差异仅头部「由谁引用」**（normal 写「由 normal Step 9 引用」、tweak 写「audit command 的 Step 1」——后者是陈旧措辞） | **真冗余**（同一套审计规则三份，改一处必漏两处） | 迁为 `assets/zh/policies/constitution-audit.md`（合并为一份中性头部），**删 3 副本**；技能内 `./policies/constitution-audit.md` 引用**不动** |
| `coding/{normal,specify,tweak,ship}/templates/intention-template.md` | 4 份 / **3 个有意变体**：normal（`2e647cf5`）、specify（`0e89ea12`）、tweak≡ship（`a8c428cc`）。差异在「使用约定」头部与**行内来源注释**（各自标注本节内容来自本通道的哪个 Step） | **非冗余** —— 变体承载各自通道的来源映射，合并会丢失「这节从哪来」 | **不合并**。仅处置两个真问题：① `plan/SKILL.md:142` 的**悬空引用**（见批 0）；② `ship` 副本是**死资产**——它只被 `ship/policies/artifact-backfill.md §2` 引用，而 §2 在 ship 侧无调用方（见 7.4） |
| `debug/{diagnose,patch,closeout}/references/artifacts.md` | 3 份**字节相同**（md5 均为 `cec2717a…`）；各被对应 `SKILL.md` 以 `./references/artifacts.md` 引用 | **真冗余**（`references/` 无共享注入机制，只能靠复制） | **两个方案**：① 迁为 `assets/zh/policies/debug-artifacts.md`，3 处引用改 `./policies/debug-artifacts.md`（借注入机制做到唯一源；代价：语义从 reference 变 policy、文件名变更）；② 保留 3 份 + 头部加「同名副本，改动须同步」说明（同 `artifact-backfill` 上一轮处理） |
| `coding/{tweak,ship}/policies/artifact-backfill.md` | 3 行分叉（§2 目标 `normal` vs `plan`） | 上轮已裁定「保留两版 + 加说明」 | **本轮不动**；正式收敛与 7.4 的 `upgrade-check` 读法**一并裁定** |

### 7.2 H 条款复述 —— 口径修正，实际范围远小于上一轮所称

**先修正**：上一轮写「约 12 处复述」有误，需分两类：

| 类别 | 判定 | 依据 |
|---|---|---|
| **H 条款声明表**（`normal:57-60`、`tweak:50-53`） | **必需，保留** | `hard-stops.md:7` 明文规定「每个 skill 在自己的 SKILL.md 中**通过引用本文档的 ID 声明遵守哪些条款**」 |
| **H8 的状态行格式**（各技能一套 `[polaris-flow 开发]常规通道 - 进入 normal Step <N>`） | **必需，保留** | H8 要求的是「可见状态行」，每技能的串是**特化**而非复述 |
| **把条款正文抄进技能** | **冗余** | 见下表 |

真正的复述清单（逐条 grep 核对）：

| 位置 | 抄了什么 | 建议 |
|---|---|---|
| `coding/build:14`、`coding/normal:21`、`coding/tweak:18` | H13 的**完整禁令句**（「禁止调用 `superpowers:subagent-driven-development` / `executing-plans`」） | 缩为 ID 引用（声明表已有）；**注意：`coding/tasks` 无此行**，上一轮把它列入系误记 |
| `coding/ship:11` | H11 禁令复述 | 缩为 ID 引用 |
| `coding/ship:12` | H9 的完整要求复述（含「跳过 Step 3.5 产物合回」细节） | 缩为 ID 引用 |
| `coding/ship:80` | H11 的**规则正文**（trap、30min stale、确认清理）——细则已在 `ship-lock.md` | 缩为「按 `./policies/ship-lock.md`」，保留 `ship.lock` 这一点不可省 |

**明确排除（不动）**：`coding/verify:629,657,715` 引 H10/H13 是在**陈述论证理由**（解释为何必须派发独立 subagent 而非自审），属正当引用，不是复述。

🔵 **可选**：`testing/discovery:48`、`testing/draft:37`、`prd/discovery:66`、`prd/draft:23`、`coding/design:174` 五处已先声明「以 `./policies/auto-transition.md` 为唯一来源」，随后又复述一句「禁止在步骤中途提压缩」。属轻度冗余，删则更纯，留则更醒目 —— 建议**保留**（该禁令一旦被忽略，代价是上下文污染，值得重复一次）。

### 7.3 constitution 断链 —— 且发现两处**用户可见**的更高危项

| 级别 | 位置 | 问题 | 方案 |
|---|---|---|---|
| 🟠 | `assets/zh/templates/constitution-template.md:18` | 模板正文写「通过 `/ezfl:constitution amend` 命令进行」。**这是 CREATE 读入后写入 `openspec/memory/constitution.md` 的模板** —— 即每个新建宪法都会带上这条失效命令，用户直接可见 | 改为 `/polaris{{SKN_SPR}}constitution`（AMEND 模式） |
| 🟠 | `assets/zh/adapters/hook-registration.md:47` | 「command 入口（`/ezfl:*`）」 | 改为 `/polaris:*` |
| 🟠 | `skills/constitution/SKILL.md:14` | 状态行拼写错误：`[polairs-flow 宪法]`（应为 `polaris-flow`），且用「进入阶段: constitution」而非 H8 的「进入 <verb>」式 | 修正拼写，对齐 H8 格式 |
| 🟠 | `skills/constitution/policies/constitution-injection.md`（46 行） | 四注入点全指 `/ezfl:design` `/ezfl:lock` `/ezfl:build` `/ezfl:audit`（命令均不存在）；`:37` 引用 `constitution-audit.md` 而该文件不在 constitution/ 下。**且 A/C/D 三个注入点已内联落地在各阶段技能**（A→`normal:127`、`tweak:117`；C→`build:251`、`normal:457`、`tweak:355`、`build/assets/implementer-prompt.md:8`；D→`verify:242,896`、`normal/policies/exit-check.md:42`）；**注入点 B 无任何宿主**——原 `/ezfl:lock` 相位（tasks-review）已退役，评审现由 `tasks` 技能承担 | **方案 A（建议）**：删除该文件 + 从 `constitution/SKILL.md` 的 Policies 表移除 Injection 行 + 把 HARD-GATE 的「注入点 A/B/C/D」改为「A/C/D（B 已随 lock 相位退役）」。**方案 B**：改写为指针文件（保留心智模型，代价是新增一处需维护的真相，违背唯一源） |
| 🟡 | `skills/constitution/SKILL.md:44` | 代码围栏写成 ```` ```ymal ````（应为 `yaml`），且 config 块用 `required = false` / `path = "…"` 的 `=` 语法（伪 YAML） | 修正围栏与语法 |
| 🔵 | `assets/zh/constitutions/` | **空目录**（0 文件） | 确认无引用后删除，或说明用途 |

### 7.4 `upgrade-check` 的自相矛盾 —— 需先确认读法

证据：`§3.2` 用 `update-active --set phase=plan` 置游标；`§3.3` 写 `upgrade_target: normal` 并输出「下一步执行 `/polaris:coding:normal`」。

两种读法：

- **读法 1（游标 = 下一技能）** → 二者矛盾，应把游标改成 `normal`。**但 `normal` 不是合法阶段值**（coding 合法集为 `specify|plan|design|tasks|build|verify|ship|retro|idle|delivery|archive`），写入会被校验器以退出码 3 拒绝 → **读法 1 不成立**。
- **读法 2（`normal` 是编排通道，内部从游标处续跑）** → `phase=plan` 正确（`intention.md` 即 specify 的产物，下一件该做的是 plan），§3.3 的「下一步执行 normal」是给人的交接文案 —— **两者不矛盾，只是措辞让读者误以为冲突**。

→ **倾向读法 2 成立**，处置为纯措辞澄清（在 §3.3 写明「游标已置 `plan`；由 `normal` 通道从该 phase 续跑」），并据此把 `artifact-backfill §2` 的目标统一为 `normal`（`plan` 只是游标，不是接手技能）。**请确认读法后再动**。

### 7.5 模板自检门降级 —— 范围收窄到「打印标记」

`强制前置 read_file` 共 16 处，须分两类：

| 类别 | 位置 | 判定 |
|---|---|---|
| **A 类（保留）** | `testing/{draft,discovery,refine,review,ship}`、`prd/refine`、`coding/specify:153`、`coding/tweak:183,308` —— 「按其章节结构写入（**不得增删章节**）」 | 模板是**结构基准与唯一格式来源**，读它是产出合规的前提，**不是形式主义** |
| **B 类（判「过重」）** | `coding/normal:167,281,349`、`coding/specify:153`、`coding/tweak:183,308`、`constitution-create:28` —— 读完**额外打印标记**（`[已 read_file templates/xxx.md]`） | 标记无执行主体、不能真正拦截，且与 H8 状态行叠加成噪音。**建议：保留 read_file 要求，删掉打印标记**（7 处） |

### 7.6 批次与验证

| 批次 | 内容 | 风险 | 需你确认 |
|---|---|---|---|
| **批 0** | `plan:142` 悬空引用改内联必含节；`constitution/SKILL.md` 状态行拼写 + `ymal` 围栏 + config 语法；`constitution-template.md:18` 与 `adapters/hook-registration.md:47` 的 `/ezfl` 文本 | 极低（文本修订） | 不需要 |
| **批 1** | `constitution-audit.md` → `assets/zh/policies/`（删 3 副本）；`debug/artifacts.md` 二选一 | 低（依赖注入机制，有测试覆盖） | **Q1** |
| **批 2** | 复述清理：H13×3、ship H9/H11 | 低 | 不需要 |
| **批 3** | `constitution-injection.md` 删除/改写；`upgrade-check` 读法；`ship` 侧 `intention-template.md` 与 `artifact-backfill §2` 正式收敛；模板打印标记 | 中（涉及机制归属） | **Q2–Q5** |

验证口径：每批后跑 `skills-install` / `manifest` / `install-layout` / `phase-validation`（现基线 4 文件 / 67 用例 + 41 用例全绿）。
**Changelog**：全部为 Skill 内容改动，按 `AGENTS.md` 须**中英文完全同步后**再写；本批只动 `zh`，故不动 `CHANGELOG.md`、不升版本号。

### 7.7 需要你拍板的 5 个点

| # | 问题 | 选项 |
|---|---|---|
| **Q1** | `debug/*/references/artifacts.md` 三份同文 | ① 迁为共享 policy（唯一源）　② 保留 3 份 + 加同步说明 |
| **Q2** | `constitution-injection.md`（整套 `/ezfl:*` 断链，A/C/D 已内联、B 无宿主） | ① 删除　② 改写为指针文件 |
| **Q3** | `upgrade-check` §3.2/§3.3 的读法 | ① 确认读法 2（游标 `plan` + `normal` 接手），仅做措辞澄清　② 其他 |
| **Q4** | `ship` 侧 `intention-template.md`（死资产）+ `artifact-backfill §2` | ① 一并收敛到 tweak 侧　② 保留并加说明 |
| **Q5** | 7 处「打印 `[已 read_file …]`」标记 | ① 删除标记、保留 read_file 要求　② 保留现状 |

### 7.8 执行记录（2026-10-09，批 0–3 已完成）

| 批次 | 实际改动 | 备注 |
|---|---|---|
| **批 0** | `plan:142` 悬空引用 → 内联 8 个必含节（自包含）；`constitution/SKILL.md` 状态行拼写 `polairs-flow`→`polaris-flow`、围栏 `ymal`→`yaml`、config 块 `=`→`:`；`templates/constitution-template.md:18` `/ezfl:constitution amend`→`/polaris:coding:constitution` AMEND 模式、`:19` 「design / lock / build / audit 4 个注入点」→「A/C/D 三个注入点」；`adapters/hook-registration.md:47` `/ezfl:*`→`/polaris:*` | 全部文本修订，零结构变更 |
| **批 1** | ① `coding/{normal,tweak,verify}/policies/constitution-audit.md` 三份 → **新建 `assets/zh/policies/constitution-audit.md`**（合并三版、中性头部），删 3 副本（引用方 `./policies/constitution-audit.md` 不变，靠注入生效）<br>② `debug/{diagnose,patch,closeout}/references/artifacts.md` **保留 3 份 + 各加同步说明** | 见下「Q1 的分别处置理由」 |
| **批 2** | `coding/{build,normal,tweak}` 的 H13 完整禁令句 → 缩为「调用 superpowers 的两个派发驱动器（H13，规则见 `./policies/hard-stops.md`）」；`ship:80` 的 H11 规则正文 → 指向 `./policies/ship-lock.md` | **范围修正**：`ship:11`（H11 禁令）与 `ship:12`（H9）经复核是**技能自己的步骤实例化**（含 Step 3.5 / `polaris-sync.sh`），不是条款正文 → **保留**。故批 2 实为 4 处，非 §7.2 所列 6 处 |
| **批 3** | **Q2**：删除 `constitution/policies/constitution-injection.md`；`constitution/SKILL.md` 同步（HARD-GATE 改「A/C/D」、Policies 表移除 Injection 行并加「注入点落地位置不在本技能」说明、有效性判定节补「每个注入点入口先跑脚本」的规则）<br>**Q3**：`upgrade-check §3.2` 后插入游标语义说明（`plan` 是阶段游标、接手者是 `normal` 通道、`normal` 不可写入游标）<br>**Q5**：删除 7 处打印标记（`normal:167,281,349`、`specify:153`、`tweak:183,308`、`constitution-create:28`）**+ 追加 `plan:284`**（原清单遗漏的第 8 处） | Q4 按上一轮「保留两版」裁定，**本轮不动** |

**Q1 的分别处置理由**（按内容性质分流，而非一律迁走）：
- `constitution-audit.md` —— 内容是**跨切面的合规规则**（任何阶段都可能审计宪法），语义与 `hard-stops.md` / `decision-point.md` 同类 → 适合放进顶层 `policies/`（会被注入每个叶技能）。
- `debug/.../artifacts.md` —— 内容是**族内专用**的产物契约。若迁到顶层会被注入**全部叶技能**（连 `prd/*`、`testing/*` 都会带上 `policies/debug-artifacts.md`），属机制滥用 → 保留 3 份 + 同步说明（与上一轮 `artifact-backfill` 的处置同构）。

**回归验证**：`skills-install` / `manifest` / `install-layout` / `phase-validation` **4 文件 / 41 用例全绿**（`--no-file-parallelism` 串行跑）。
> 四个套件并发时会因资源饥饿出现 5 个超时失败（该套件单用例实测 17–22s）；单独跑 `skills-install.test.ts` 为 13/13 —— 属既有超时抖动，与本次改动无关。

### 7.9 本轮新发现

| 状态 | 级别 | 内容 |
|---|---|---|
| 未处理 | 🟠 | **上轮 H10 修复不完整**。`normal:58,453`、`verify:638`、`prd/refine:304`、`prd/ship:96` 仍有「只要默认通用 → 不调 probe」式分支；更关键的是 **`subagent-dispatch` 的设计文档明确支持免 probe**（`SKILL.md:16,31,45`「合法，不要求 probe 回执」、`references/dispatch-execute.md:220`「多数编排步骤都用 `agent=null`…可跳过 probe」）。上轮裁定「删除技能内跳过分支」时的前提是「改 3 处技能」，**实际涉及 5+ 处且推翻一个刻意设计** → 建议**重新裁定**（我的建议是回到上轮的选项 ①：放宽 H10 措辞，写明免 probe 的合法条件） |
| ✅ 已修 | 🟠 | **`assets/zh/adapters/hook-registration.md` 已按当前实现整份重写**（原为 ezfl/harness 时代内容，见 §7.10） |
| ✅ 已修 | 🟡 | **`assets/zh/adapters/README.md`**：文件清单里 `agent-directory-probe.md` **全仓不存在**（幻影条目）；支持的宿主写「Trae / CodeBuddy / Claude Code」（CodeBuddy 不是平台，缺 Cursor / Trae-CN）→ 已按 `platforms.ts` 重写。**⚠️ 但该文件不入仓、不安装**（见下方说明），此修复只影响本机 |
| 未处理 | 🟡 | **`deepread` 是死功能**：`config.example.yaml:125-131` 有 `deepread.template_path` / `output_dir`、`state.example.yaml:371` 有 `deepread:` 段、`templates/deepread-template.html` 也在，但**全仓无任何技能 / 命令实现它**（唯二引用方就是那两份 example）。需裁定：删除整套 deepread 面（配置键 + 状态段 + 模板），还是补齐实现 |
| 未处理 | 🔵 | `assets/zh/constitutions/` 空目录，用途未明 |

**⚠️ 更正一处上一轮的错误结论**：我在批 0 说「ezfl 全仓清零」是**错的** —— 当时只 grep 了 `assets/zh/`。补查 `assets/shared/` 后仍有两处：
- ✅ 已修：`assets/shared/scorers/README.md:48,66` 的 `/ezfl:audit` → 「verify 阶段跑 scorer 之前 / 再进入 verify 阶段打分」（scorer 现由 `coding/verify` 驱动）。
- 未修：`assets/shared/templates/deepread-template.html` 的 4 处 `ezfl-flow` 品牌名 —— 因该功能已死（见上表），改品牌名会让它「看起来是活的」，故留待 deepread 的命运一并裁定。
- 不计入：`assets/.workbuddy/memory/*.md`（记忆归档，记录历史）与 `assets/tmp/explore-router/`（已退役草稿目录）。

**⚠️ 另一处需要你知道的事实：`assets/**/README.md` 既不入仓也不安装。**

- 本机 `~/.gitignore_global` 忽略所有 `README.md` → 仓库里 18 个 `README.md` 只有 **1 个**被 git 跟踪。
- `assets/manifest.json` 的 `ignoredFiles: ["README.md", "PROVENANCE.md", ".DS_Store"]` → 也不随安装分发。
- 即 `adapters/README.md`、`scorers/README.md`、`skills/*/README.md`、`shared/hooks/README.md` 等都是**本机笔记**。
- 推论：**要长期生效的内容必须写进被跟踪的文件**；`README.md` 里写的东西换台机器就没了（这也解释了为什么
  `assets/zh/skills/README.md` 能长期引用不存在的 `delivery/`、`explore-router/` 而不被任何人发现）。
  本次对 `adapters/README.md`、`scorers/README.md` 的修改因此属**本机局部收益**。

### 7.10 `hook-registration.md` 重写的依据（新内容的事实来源）

原文件是 ezfl / `.harness/` 时代的产物（`.harness/.cache/.plugin_root`、把 `constitution-validity.sh` 与 5 个 scorer 说成「hook」、宿主配置写 CodeBuddy、`.cmd` Windows 批处理）。重写后每一条都取自当前实现：

| 新文档的论断 | 事实来源 |
|---|---|
| 只有 1 个 hook：SessionStart | `assets/shared/hooks/` 仅 `session-start.sh`；`assets/shared/hooks.json` 只注册 `SessionStart`（matcher `startup\|resume`） |
| hook 是薄转发器，逻辑在 CLI | `session-start.sh` → `source ../scripts/_polaris-cli.sh` → `exec_polaris host-hook --fallback-event SessionStart` |
| `constitution-validity.sh` / `scorers/*.sh` **不是** hook | 二者由技能在流程内显式调用；hooks 目录只有 `session-start.sh` |
| 配置落盘：claude/cursor → `settings.local.json`（项目）/ `settings.json`（全局）；trae → `<contextDir>/hooks.json`；trae-cn → `~/.trae-cn/hooks.json` | `src/core/install/hooks.ts` 的 `resolveHooksConfigPath()` |
| command 被改写为**项目相对路径**，不依赖 `CLAUDE_PLUGIN_ROOT` | 同上文件头注释 + `buildPolarisHookCommand()`；模板写 `${CLAUDE_PLUGIN_ROOT}` 只是改写前的形态 |
| 合并而非覆盖（幂等） | `isManagedHookCommand()` 白名单含 `polaris/hooks`、`polaris-flow/hooks`、`/hooks/session-start.sh` 三种历史形态 |
| hook 资产**语言中立**（`assets/shared/`，非 `{zh,en}`） | 目录结构：`assets/shared/hooks/`（`assets/zh/hooks/` 不存在） |
| 环境注入到 `.polaris/.cache/runtime-env` | `src/commands/hooks/session-start.ts:108-118` |
| 五个平台与 hooks 支持 | `src/core/domain/platforms.ts`（claude / cursor / trae / trae-cn / qoder；qoder `supportsHooks: false`）。**代码里没有 codebuddy 这个平台** |
| 脚本跨平台要求 | `AGENTS.md`「Shell 脚本规范」（禁 `sed -i`、`grep` 加 `|| true`）；已无 `.cmd` 双份脚本 |

---

## 附：本次复核的核验清单

以下结论由人工命令（`diff` / `grep` / `sed` / `rg`）逐条落地确认，非纯文档推断：

| # | 结论 | 核验方式 |
|---|---|---|
| 1 | requirement 族为 4 阶段 `discovery/draft/refine/ship` | `task-kind-layout.ts:154-188`、`requirement-state.ts:11` |
| 2 | testcase 产物全部落 `.polaris/testcases/<id>/` | `task-kind-layout.ts:220-236` |
| 3 | debug 族为三阶段、无 `build` | `task-kind-layout.ts:269-283` |
| 4 | `tweak/policies/constitution-audit.md` ≡ `verify/policies/constitution-audit.md` | `diff` 输出为空 |
| 5 | `artifact-backfill.md` tweak 版指 normal、ship 版指 plan | `diff` 3 行差异 |
| 6 | `design/SKILL.md` 0 次引用 `reframe` | `grep -c` = 0 |
| 7 | `design/policies/reframe-check.md` 引用不存在的 `pre_design.md` | `grep pre_design` 命中 :63/:103 |
| 8 | verify「默认 A」与 `docs/specs/2026-09-25` 一致 | 该 spec :101、:324、:331 |
| 9 | `ship.lock` / H11 仅存在于 `coding/ship` | 全目录 `rg` 命中仅 coding/ship |
| 10 | constitution 注入点 `/ezfl:*` 全部不存在；`constitution-audit.md` 不在 constitution/ | `ls commands/`、`find constitution/`、`rg ezfl` |
| 11 | `constitution-create.md:28` 自检话术用旧名 `easy-flow` | `sed -n '24,32p'` |
| 12 | prd draft 保留率阈值 `SKILL:219`（<95% 阻断）与 `policy:50`（85–95% 可接受）互斥 | 双向 `sed` 比对 |
| 13 | `debug/patch:59` 写 `phase: build` 但脚本用 `--phase patch` | `sed -n '56,62p'` |
| 14 | `testing/acceptance:131` 落盘 `openspec/changes/<task_id>/test/` | `sed -n '125,140p'` |
| 15 | debug 门禁级人确认恰好两处（5.6 无条件 / 6.5 仅分叉） | `sed -n '285,289p;319,323p'` |
| 16 | H10 冲突：`tweak:51` 明确「不调 probe 直接 dispatch」 | `rg "H1[0-4]" tweak/SKILL.md` |
| 17 | H12 错引 ≥8 处（tweak/blueprint/discovery/diagnose/patch/closeout） | `rg "H12"` 跨族 |
