# phase 真相归一设计（枚举 + 转移）

日期：2026-09-19
状态：**提案** —— 调研完成，方案 A/B/C 与 5 项待决未定
触发：M2 实施期发现「kind → 阶段」在仓内有 12 处枚举、6 处转移声明，且 `state.yaml.phase` 与 `workflow.yaml` 游标是**两个字段**；进一步核实发现 `state-next` 的四张转移表里**两张偏移一位**（会跳阶段）
上游：`docs/plans/2026-09-18-dashboard-integration-m2.md`（Task 1 已完成第一步归一）
范围：phase 名的**枚举真相**与**转移真相**如何归一；不含 Dashboard 渲染、不含技能内部的分支逻辑

---

## 一、调研结论

### 1.1 有两个 `phase` 字段，权威是 workflow.yaml 的游标

| 字段 | 写入方 | 读取方 | 判定 |
| --- | --- | --- | --- |
| `workflow.yaml` → `<kind>_tasks[].phase` | `workflow-entry append-active/update-active --set phase=X`（技能内 27 处 `--set phase=` 中的 25 处） | **`polaris state next`**（`state-next.ts:204-213`，全仓唯一读取方） | ✅ **权威**：任务当前/接下来要执行的阶段 |
| `state.yaml` → `phase` | ① `task-kind-layout.initPatches`（建任务时，5 类）② `task-state-entry enter-phase/complete-phase`（仅 debug 族在用）③ 2 处 `--set phase=idle`（`coding/tasks`、`coding/verify`） | **src/ 内零读取方**（实测 `grep -rnE "state\.phase\|taskState\.phase" src/` 无输出） | ⚠️ **非权威**：只写不读的第二份，默认 `'idle'`（`task-state.ts:430`、`testcase-state.ts:70`） |

**为什么这是错位而非"双写"**：coding 族的技能**从不调用** `task-state-entry enter/complete-phase`（只走 `workflow-entry update-active`），所以编码任务的 `state.yaml.phase` 会**长期停在建任务时写入的 `specify`**，而真实阶段在 `workflow.yaml` 里推进。

> ⚠️ **这直接推翻 M1 契约的表述**：`docs/specs/2026-09-18-dashboard-api-contract.md` §三 写「`phase` 来源：**`state.yaml` 的 `phase` 为单一真相**」。按原契约实现，面板会给每个编码任务显示一个**停在 `specify` 的错误阶段**。这是我的判断错误（在 M1 定契约时把 state 模板的注释当成了运行时真相），修正项见 §五。

### 1.2 枚举真相：12 处

| # | 位置 | 宣告的集合 | 判定 |
| --- | --- | --- | --- |
| 1 | `src/core/config/task-kind-layout.ts` `phases`（2026-09-18 新增） | 5 类 kind 各自序列 + 分组 | ✅ **建立的单一表** |
| 2 | `src/core/config/polaris-project-config.ts:32` `TaskPhase` | `idle\|specify\|plan\|design\|tasks\|build\|verify\|ship \| string` | ⚠️ 第二处枚举；仅 coding；末尾 `\| string` 使其**完全无约束** |
| 3–7 | `assets/shared/templates/{state,debug-state,prd-state,testcase-state,prototype-state}.example.yaml` 注释 | 各 kind 一列 | 文档镜像（现与表一致，含 `idle`） |
| 8 | `workflow-template.yaml:16` 注释 | coding：`…design\|build\|verify\|delivery` | ❌ 陈旧：**缺 `tasks`、用 `delivery`** |
| 9 | `workflow-template.yaml:68` 注释 | debug 六段 | ❌ 陈旧 |
| 10 | `assets/zh/skills/README.md` §阶段一览 | coding 8 | ✅ 权威（技能自述） |
| 11 | `assets/zh/skills/debug/README.md:7` | debug 3 | ✅ 权威（含「以本 README 为准」声明） |
| 12 | `docs/specs/2026-09-16-debug-workflow-design.md` | debug 六段 | ❌ 陈旧（被 #11 声明作废） |
| 13 | `docs/specs/2026-09-18-dashboard-api-contract.md` §五 | 5 类 | ✅ 冻结镜像 |
| 14 | 前端 `dashboard/src/utils/workflow.js`（旧 9 步）、`changeMapper.js` `PHASE_STATUS`、`dashboardHelpers.js` `PHASE_ORDER` | openspec 时代 4 阶段 | ❌ 随 M2 退役 |

### 1.3 转移真相：6 处，其中两张表偏移一位

技能内推进游标有两种机制，共 34 处调用：

| 机制 | 处数 | 写在哪 | 用它的族 |
| --- | --- | --- | --- |
| `workflow-entry update-active --set phase=X` | 25 | `workflow.yaml` 游标 | 全部 5 族 |
| `task-state-entry complete-phase --phase X --next-phase Y` | 7 | `state.yaml` | debug / prd / prototype |
| `task-state-entry set … --set phase=idle` | 2 | `state.yaml` | coding（tasks / verify） |

`state-next.ts` 自持两张镜像表供自动衔接选技能。**关键发现：同一个 `resolveNextSkillName` 消费的两张表采用了两套相反的约定。**

先确立机制。`assets/zh/policies/auto-transition.md` §执行方式写的是：

> 退出条件满足且**阶段守卫推进 phase 后**，运行 `polaris-flow state next <change-name>`

即调用时**游标已经指向"接下来要跑的阶段"**（技能在出口把游标设为下一阶段，例如 `coding/plan/SKILL.md:393` 完成 plan 后 `--set phase=design`）。因此 `phase → 技能` **应当同名映射**（游标是 `build` 就跑 `build`）。

按此裁定四张表：

| 族 | 表内容 | 与机制是否一致 | 后果 |
| --- | --- | --- | --- |
| coding | `plan→plan`、`build→build`、`verify→verify`、`ship→ship` | ✅ 自映射，一致 | 正确 |
| prd | `draft→draft`、`refine→refine`、`ship→ship` | ✅ 自映射，一致 | 正确 |
| prototype | `blueprint→build`、`build→ship`、`review→ship` | ❌ **偏移一位** | 游标=`build` 时返回 `ship` → **跳过 `prototype:build`**；`review` 根本不是游标值（build 出口直接置 `ship`），是死键 |
| debug | `diagnose→patch`、`patch→closeout` | ❌ **偏移一位** | 游标=`diagnose`→返回 `patch`（跳过诊断）、`patch`→`closeout`（跳过修复）、`closeout`→`null`（**NEXT: done，跳过关单**），三段全跳 |

`testing` 族的表是 `{}`（空，该族未落地），故无此问题。

> 注意：`state-next.test.ts` 把这些偏移行为**作为期望断言了下来**（如 `('prototype','blueprint') === 'build'`、`('debug','diagnose') === 'patch'`）。所以这不是"没人发现"，而是"被测试固化"——修它必须同时改断言，属需要决策的行为变更（D13）。

### 1.4 另外三处结构性错误

1. **`auto-transition.md:7` 声称存在 `guard --apply`**，同时更新 `workflow.yaml` 与 `.polaris/<change_id>/state.yaml` 的 phase。**该 guard 在代码里不存在**（全仓 grep 只命中这份文档自身）；且 `<change_id>` 路径已失实（实际是 `.polaris/tasks/<id>/`）。真实机制是写死在 34 处技能调用里的 inline 命令。
2. **`auto-transition.md:25` 的「预设路由」未实现**：文档说 `phase: build` + hotfix/tweak 预设 → 返回预设技能（`maintance:hotfix` / `coding:tweak`）；而 `state-next.ts` 的 `resolveNextSkillName` 的 `_channel` 参数**根本没用到**（非 debug 族不做任何 mode/channel 分派）。
3. **`specify` / `discovery` 刻意无转移**：coding 与 prd 的入口阶段不进转移表（由入口命令显式进入），这一点由 `state-next.test.ts` 断言（`('coding','specify') === null`）确认是**有意设计**，不是缺陷 —— 归一时必须保留这个语义，否则会把"入口阶段"误判成"流程已完成"。

---

## 二、目标与非目标

### 目标

- **G1 一个枚举**：phase 名的合法集合只有一处可写、可改、可测。
- **G2 一条约定**：`游标 phase` 的语义（"接下来要执行的阶段"）在文档、代码、测试里只有一种解释。
- **G3 漂移在写入时暴露**：技能写错 phase 名时，**原语当场报错**，而不是等几个月后由面板显示「未知阶段」。
- **G4 文档不再自持枚举**：模板注释与 policy 不再写第二份 phase 列表。
- **G5 不新增需要维护的转移表**：不造会漂移的第二张图。

### 非目标

- 不改技能内部的**分支逻辑**（如 `coding/plan` 的 design/tasks 二分、`phases` 的可选项）。
- 不新建 `guard` 机制（那属 §三 方案 C）。
- 不改 Dashboard 渲染层（属 M2）。
- 不动存量 `.polaris/` 数据（不写迁移脚本）。

---

## 三、方案对比

| 维度 | **A 收敛（推荐）** | B 护栏（暂停在现状） | C 收权（阶段性终点） |
| --- | --- | --- | --- |
| 做法 | 枚举进单一表；`state-next` 表改为从表派生；**原语加白名单校验**；模板/policy 去掉自持枚举；`TaskPhase` 去枚举 | 只保留 Task 1 已做的漂移护栏测试；转移仍由技能与 `state-next` 各自维护 | 技能不再写 phase，改由统一的「阶段守卫」原语在**一处**完成「完成当前 + 前移游标 + 同步 state.yaml」 |
| 改动面 | `task-kind-layout.ts`（+派生函数）、`state-next.ts`（去表）、2 个原语（+校验）、3 处模板注释、1 份 policy、`TaskPhase` | 无 src 改动 | 12 个技能文件（34 处调用）+ 新增 guard 原语 + `auto-transition.md` 重写 |
| 破坏性 | 中：校验可能拦掉存量/第三方技能的写法（需 `--force` 兜底） | 零 | 高：改的是所有技能的执行路径 |
| 能否在**写入时**拦住漂移 | ✅ 能（这是与 B 的本质差别） | ❌ 只能事后在 CI 红 | ✅ 能，且从根上消除多写入点 |
| 能否修 D13（偏移一位） | ✅ 结构性修（表只剩一种约定） | ❌ 不动 | ✅ 修 |
| 是否引入新机制 | 否（只加校验） | 否 | 是（guard） |
| 与「禁止新造流程」的关系 | 合规：只收敛既有约定 | 合规 | 边缘：guard 是 `auto-transition.md` 早就声明过的东西（属"补齐未实现的声明"而非新造） |
| 独立可交付 | ✅ 单个 PR | ✅ 已完成 | ❌ 需 A 先落地 |

**推荐：A 作为本轮目标，C 作为 A 之后的独立里程碑；B 是 A 的第一阶段（Task 1 已完成）。**

理由：A 用最小的机制代价买到 G3（写入时暴露），且**不需要维护转移表**——因为"下一阶段"是技能自己决定并写进游标的（`coding/plan` 的 design/tasks 二分支就是证据），任何集中式转移表都注定与技能分支冲突。C 的价值真实（消除 34 个写入点），但它改的是所有技能的执行路径，不该和契约修正混在一个 PR 里。

---

## 四、推荐方案（A）的目标形态

### 4.1 枚举与语义

```ts
// src/core/config/task-kind-layout.ts（已建，A 案在此基础上补两件事）

/** 各 kind 的合法 phase 集合 = phases.map(code) ∪ { idle }（idle 为「无阶段」空值，非阶段） */
export function isKnownPhase(kind: WorkflowTaskKind, phase: string): boolean;   // ✅ 已有
export function getKindPhases(kind, opts?): KindPhaseDef[];                      // ✅ 已有

/**
 * 新增：游标 phase → 应执行的技能名（族的相对名）。
 * 约定：游标 phase = 接下来要执行的阶段 ⇒ 同名映射为默认，例外显式登记。
 * 返回 null 表示「无后续」（终结阶段、idle、或入口阶段）。
 */
export function skillForPhase(kind: WorkflowTaskKind, phase: string): string | null;
```

`skillForPhase` 的实现语义（**不再有第二张图**）：

| 输入 | 输出 | 依据 |
| --- | --- | --- |
| `idle` / 空串 | `null` | 无阶段 |
| 入口阶段（coding 的 `specify`、prd/testing 的 `discovery`、prototype 的 `blueprint`、debug 的 `diagnose`） | `null` | 由入口命令显式进入；`state-next.test.ts` 已固化此语义，**保留** |
| 终结阶段（`ship`、`closeout`） | 该阶段自身的技能名 | 游标推进后仍需执行它；执行完由 ship-cleanup 清游标 |
| 其余已登记阶段 | **同名** | 游标语义即"待执行阶段" |
| 未登记值 | `null` | 未知值不崩（面板/CLI 都走兜底） |

> 例外清单当前为空。若将来某阶段的技能名与 phase 名不同（如 `maintance:hotfix` 那种预设路由，见 §1.4-2），**在此处显式登记一行**，就是全部改动。

### 4.2 原语校验

| 原语 | 现在 | A 案 |
| --- | --- | --- |
| `workflow-entry update-active --set phase=X` | 不校验，写什么是什么 | 校验 `X ∈ getKindPhases(kind) ∪ {idle}`；不合法 → 报错退出并**打印合法集合** |
| `task-state-entry enter-phase/complete-phase --phase X` | 仅校验非空 | 同上 |
| 兜底 | — | `--force-phase` 显式放行（用于一次性修正存量数据），并写入 `overrides.log`（`polaris-paths.getOverridesLogPath` 已存在） |

这一步是 A 的核心收益：把"几个月后才在面板上看到未知阶段"变成"提交前就红"。

### 4.3 其余收敛项

| 项 | 处置 |
| --- | --- |
| `polaris-project-config.ts:32` `TaskPhase` | 删除手写联合（含形同虚设的 `\| string`），改为 `type TaskPhase = string` + 注释指向单一表；枚举的正确性由守卫测试承担（TS 无法从常量派生字面量联合） |
| `workflow-template.yaml:16` / `:68` 注释 | 删掉枚举，改为「合法值见 `src/core/config/task-kind-layout.ts` 的 `phases`」 |
| `auto-transition.md:7` | 订正：去掉不存在的 `guard --apply` 描述，改述真实机制（技能内 inline `workflow-entry` 调用；A 案后由原语校验） |
| `auto-transition.md:25` | 标注「预设路由**当前未实现**」；实现与否另案（`resolveNextSkillName` 的 `_channel` 参数当下是死参数） |
| 各 `*.example.yaml` 注释 | 保留（它们是给写 state 的人看的**镜像**），但加守卫测试：注释里的枚举 ⊆ 单一表 |
| `state.yaml.phase` | **本轮不动**（保留为非权威镜像）。它的去留依赖 C（D14） |

---

## 五、对 M2 的即时影响（必须先改，否则 M2 会做错）

| M2 处 | 现状 | 必须改为 |
| --- | --- | --- |
| 契约 §三 | 「`phase` 来源：`state.yaml` 的 `phase` 为单一真相」 | 「`phase` 来源：**`workflow.yaml` 游标的 `phase`**（本设计 §1.1）；`state.yaml.phase` 为非权威镜像，M2 不读它」 |
| M2 计划 Task 2 Step 2 | `scan/state.ts` 的 `readTaskRuntime(…)` 从 `state.yaml` 取 `phase` | 从 `workflow.yaml` 的 entry 取 `phase`；`state.yaml` 只用于 `channel` / `workflow.mode` / 名字字段 / `stateMissing` 判据 |
| M2 计划 §一 事实 #5 | 「只有 requirement / prototype 的 state.yaml 有名字字段」 | 仍成立，但 `title` 与 `phase` 的来源不同文件，需在契约里分别注明 |

Task 1 已建的表（`phases` / `artifacts` / 派生函数）**不受影响**，继续有效 —— 它管的是"枚举与序位"，与"哪个文件是权威"是正交的两件事。

---

## 六、待决

| # | 问题 | 我的建议 |
| --- | --- | --- |
| **D12** | 取 A / B / C | **A**；C 立为后续独立里程碑；B 已被 Task 1 覆盖 |
| **D13** | prototype 与 debug 两张表偏移一位，怎么修 | 按 A 从结构上消除（表只剩"同名映射 + 例外"），**并改 `state-next.test.ts` 的对应断言**。注意这会让 debug 的自动衔接从"三段全跳"变成正常推进 —— 是行为变更，建议单独一个提交便于回退 |
| **D14** | `state.yaml.phase` 最终去留 | 保留为非权威镜像，待 C 落地时决定「原语双写」还是「删字段」。理由：本轮动它会牵动 debug 族的 `enter-phase/complete-phase` 链 |
| **D15** | `idle` 是否入 `phases` 表 | **不入表**。它是「无阶段」空值而非阶段；但 `isKnownPhase` 与校验白名单必须显式接受它（否则存量数据与 initPatches 默认值会被判非法） |
| **D16** | `TaskPhase` 类型 | 退化为 `string` + 注释指向表；枚举正确性交给守卫测试 |

---

## 七、落地步骤（A 案，若获批）

1. `task-kind-layout.ts`：加 `skillForPhase` 与合法集合（含 `idle`）；守测试扩到覆盖 §4.1 的五行语义表。
2. `state-next.ts`：删 `PHASE_TO_SKILL` / `DEBUG_PHASE_TO_SKILL`，改调 `skillForPhase`；`state-next.test.ts` 同步改断言（D13）。
3. 两个原语加白名单校验 + `--force-phase` + `overrides.log` 留痕；补原语单测。
4. 文档收敛：2 处模板注释、`auto-transition.md`、`TaskPhase`。
5. 全量自检 + 单独提交（与 M2 解耦，可独立回退）。
