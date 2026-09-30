# coding 复杂度 / 风险分级方案（结项稿）

> 状态：**已全部落地（2026-09-29）** —— 批次 1–4 已落盘；全量测试 11 failed / 416 passed，与基线同名同因、**0 新增失败**
> 日期：2026-09-29 ｜ 取代 `docs/specs/2026-09-25-verify-test-evidence-design.md` §八 ⑦ 的「挂起」
> 前身：`docs/specs/2026-09-10-verify-redesign-proposal.md` §4「功能测试开关策略（风险分级自动开关）」
> 改动面：`assets/` 下的 `.md` + 模板 + `src/core/config/task-state.ts`（两轴字段默认值 / 类型）——`config.example.yaml` **零改动**（理由见 §三）

---

## 〇、拍板记录

| # | 决策 | 结论 |
|---|------|------|
| D1 | 几条轴 | **两轴** |
| D2 | 命名与方向 | 沿用 `trivial ｜ standard ｜ critical`；**字段落 `state.yaml`**，不落 `config.yaml` |
| D3 | config 死块处置 | **config 完全不碰**（`tiers:` / `triage:` 另有血脉，见 §三） |
| D4 | 判定时机 | **两段式**：`specify` 初判 → `verify` 用 diff 复核（**只升不降**）；`state.yaml` 记**两轴 level + 最终值** |
| D5 | 风险信息源 | **glob 下限兜底 + 语义上限判断** |
| D6 | 消费点 | 按推荐（`verify` Step 8/12/13/16 · `plan` 5.1 / 3.3.1 · `ship`） |
| D7 | 与 `tier-gate` 的单源关系 | **信号表唯一 + 消费点多个** |
| 补 · 1 | 「两轴」口径 | 两轴 = **复杂度 + 风险**（各一档 level）；最终值 = 两轴取高 |
| 补 · 2 | 规则表落点 | 提取为独立 policy → **`zh/policies/risk-signals.md`**（顶层注入，全技能可见） |

---

## 一、要修的是什么

不是「没有评判」，是「**评判与消费之间断了**」。三个反直觉后果（spec §九 已记录）：

| # | 场景 | 现状走法 | 应有的走法 |
|---|------|----------|------------|
| 1 | 改 3 行鉴权（`auth/`） | 规模小 → `light`；不跨模块边界 → 不跑集成 → **只剩单测** | 认证是最高危路径，最该跑功能轨 |
| 2 | 改 30 个样式文件 | 规模大 → `full` → 跑全量（含功能轨） | 低风险，跑全量是浪费 |
| 3 | `specify` / `plan` 已判过复杂度 | 结论落在通道决策段（`workflow.signals`）或 prd 族状态里 | `verify` 读不到，等于白判 |

---

## 二、两轴定稿

| 轴 | 回答 | 决定 | 现状 | 本方案 |
|----|------|------|------|--------|
| **复杂度轴** | 实现有多难 | 做多**深** | ⚠️ 有评判、无落盘 | 落 `complexity_level` |
| **风险轴** | 出错有多**贵** | 做**不做** | ❌ 完全缺 | 落 `risk_level` |
| *规模*（不独立成轴） | 改动有多大 | 做多**深** | ✅ `verify_mode` 的规模启发式 | **退为 `verify_mode` 的廉价代理输入**，不单列字段 |

> 两轴不平权（spec §九）：**风险决定「做不做」，复杂度决定「做多深」**。风险与规模**正交** —— 场景 1/2 互为反例，故独立成轴；规模与复杂度同向，规模只作代理。

**档位与方向（写死，防止语义漂移）**：

- `critical` **>** `standard` **>** `trivial`；档越高 = 越复杂 / 越高危。**不得反向**。
- 三档判定（复用 `tier-gate` 既有门，不新造）：

| level | 判定 |
|-------|------|
| `trivial` | 降档门 **D1′–D4′ 全部满足** 且 glob / 语义均无命中 |
| `standard` | **默认档**：无升档信号、也不满足降档门，或信息不足 |
| `critical` | 命中任一**升档信号**（D1–D7），或 **glob 兜底命中**（一票升档） |

- **最终值** `current_tier = max(complexity_level, risk_level)`（升档门优先）。

---

## 三、config 完全不碰 —— 死块归属说明

`config.example.yaml` 的 `tiers:` / `triage:` **一个字都不动**。核实结论：它们对应的是 **`polaris-cli` 那条独立血脉**，不是本仓的垃圾：

| 位置 | 内容 | 说明 |
|------|------|------|
| `polaris-cli/assets/shared/templates/change-state-template.yaml:11` | `current_tier: ""  # trivial ｜ standard ｜ critical（triage 写入）` | cli 侧 change 状态 |
| `polaris-cli/assets/shared/templates/harness.example.toml:19-25` | `[triage]` `mechanical_script` / `sensitive_keywords_file` / `default_tier_when_unclear`；`[triage.tiers]` | cli 侧 harness |
| `polaris-cli/assets/shared/hooks/workflow-entry.sh` | `upsert-pending-triage` / `pending_triages` | cli 侧游标机制 |

> 因此本方案**不删、不改、不引用** config 的任何 tier 配置；分级一律落 `state.yaml`。

**仍待另议的一处**（本方案不碰）：`state.yaml` 的 `triage:` 块（`state.example.yaml:130-139`，零读写）。是否清理需动 `src/core/config/task-state.ts`，列入批次 4。

---

## 四、设计内核

```
本次变更 ── 分级 ──┬─ 复杂度轴（做多深）── complexity_level ──┐
                   │                                          ├─ max → current_tier（最终值）
                   └─ 风险轴（做不做）── risk_level ─────────┘
                                             │
                                             └─ 闸门：critical → 强制 full + 功能轨 + 完整清单 + 禁跳深化
```

三条原则，全部来自既有约定：

1. **两轴不平权**（spec §九）—— 风险是闸门，复杂度是刻度。
2. **宁严勿松 / 高危一票升档**（`prd/discovery/policies/complexity-assessment-policy.md` §4）—— 风险轴只升不降。
3. **升档门优先**（`tier-gate.md` §3）—— 两轴同时命中时取高档。

---

## 五、`state.yaml` 字段定稿（顶层，跨阶段可读）

```yaml
# 复杂度轴（specify 初判；trivial-简单 | standard-标准 | critical-复杂）
complexity_level: ""

# 风险轴（specify 初判；verify 用 diff 复核，只升不降）
# 可选值: trivial-简单 | standard-标准 | critical-关键
risk_level: ""

# 当前层级 = 最终值 = max(complexity_level, risk_level)（升档门优先）
# 可选值: trivial-简单 | standard-标准 | critical-关键
current_tier: ""
```

- `current_tier` **沿用既有键**（`state.example.yaml:48`，deepread 三色徽章已有真消费方）—— 不新造名字。
- **两段写入**：
  - `specify` Step 5.4（finalize）：三字段初判值。
  - `verify` Step 8（复核）：只可能**上调** `risk_level`，随之重算 `current_tier`；升档时记 `runtime.verify.risk_escalation_reason`。
- `setByPath` 是**通用点路径、无白名单** → 三字段现在就能写，**不必先动 src**。

---

## 六、信号表唯一：`zh/policies/risk-signals.md`

**为什么是这里**：`zh/policies/*` 由安装器**注入每个叶技能的 `policies/`**（`src/core/install/skills.ts:426` `skill_policy_inject`），各技能一律按 `./policies/<name>.md` 引用。install 有单测**拒收** `../specify/policies/...` 这类跨技能相对路径 —— 所以共用规则**只能**放顶层，放某个技能目录下必然断链。

**表内容**（把 `tier-gate` 的 D1–D7 升格为跨通道唯一表，并补 `轴` 列供分级消费）：

| # | 信号 | 判定依据 | 影响轴 |
|---|------|----------|--------|
| D1 | 跨服务 / 跨系统 | 改动跨进程 / 服务边界，需协调多部署单元 | 风险 ↑ |
| D2 | 需专项设计 | 数据模型 / 接口契约 / 领域模型需 `<slug>-design.md` 级专项设计 | 复杂度 ↑ |
| D3 | 数据迁移 | 需 schema 变更含存量数据改写 / 迁移脚本 | 风险 ↑ |
| D4 | 破坏性契约变更 | 对外 API 契约、鉴权、权限、数据一致性的破坏性变更 | 风险 ↑ |
| D5 | 任务超编 | 预计顶层任务 > 8 | 复杂度 ↑ |
| D6 | 需求不稳 | 理解确认修正轮次 > 2 | 复杂度 ↑ |
| D7 | 高危领域 | 涉及合规、资金、安全审计等高危场景 | 风险 ↑（一票 `critical`） |

**glob 下限兜底**（D5，命中即 `risk_level = critical`，不给总分抵消）：

| 类别 | 路径片段 |
|------|----------|
| 认证 / 鉴权 | `auth` `oauth` `session` `token` `jwt` |
| 权限 | `permission` `rbac` `acl` |
| 支付 / 资金 | `payment` `billing` `invoice` `settle` `wallet` |
| 加密 / 密钥 | `crypto` `cipher` `secret` `keystore` `keychain` |
| 并发 / 事务 | `concurrency` `lock` `mutex` `transaction` |
| 数据迁移 | `migration` `migrate` `schema` |
| 基础设施 | `infra` `deploy` `terraform` `k8s` |
| 合规 / 审计 | `audit` `compliance` `consent` `gdpr` |

> **职责分工**（D5）：glob 兜**漏判**（机械、可复现），语义兜**误判**（判得准）。与 PRD「高危一票升档」同构。

**同一张表的三个消费切片**（D7 —— 不是「同一件事两处判定」）：

| 消费点 | 取哪片 | 用来决定 |
|--------|--------|----------|
| `normal` Step 5 | 全表 | **通道**（tweak / normal / design） |
| `specify` Step 5.4 | 需求侧切片（D2/D6/D7 等） | **初判** `complexity_level` / `risk_level` |
| `verify` Step 8 | 实现侧切片（diff × glob + D1/D3/D4） | **复核** `risk_level`（只升不降） |

---

## 七、消费点与最终触发规则（D6）

| 消费点 | 现有行为 | 加两轴后 |
|--------|----------|----------|
| `verify` Step 0 | 定 task_id | 读 `current_tier` / `risk_level` 进上下文 |
| `verify` Step 8 | `verify_mode` = 规模启发式 + `score_level` 补强 | **两轴复核**（glob × 实现侧信号，只升不降）+ **第三行补强：`risk_level=critical` → 强制 `full`**；**写回 `risk_level` / `current_tier` / `risk_escalation_reason`** |
| `verify` Step 12 | 功能轨触发 = `verify_mode=full` **且** smoke 槽存在 | 加第二条件 `risk_level=critical`（兜住人工覆盖 `light` 的例外；关掉现状「已知缺口」） |
| `verify` Step 13 | 按 `verify_mode` 选轻量 6 / 完整 7 | `risk_level=critical` → **强制完整清单**（优先级高于 `verify_mode`） |
| `verify` Step 16 | 落盘证据 | 报告与出口摘要纳入分级三字段 |
| `plan` §3.3.1 | `current_tier` 弱读（「若有」） | 改为**必有**（specify 已落） |
| `plan` §5.1 | 深化设计决策点（A 深化 / **B 跳过**） | `risk_level=critical` → **不允许跳过深化**（只留 A） |
| `ship` Step 6 | 输出模板 `tier : <tier>` **空转** | 填真实 `current_tier` |
| `deepread` | 徽章已实现 | **无需改动**（自动受益） |

---

## 八、改动面清单

| 批次 | 文件 | 改动 | 落地 |
|------|------|------|------|
| **1** | `zh/policies/risk-signals.md` | **新增**（信号表唯一源，见 §六） | ✅ |
| **2** | `shared/templates/state.example.yaml` | `current_tier` 补注释；**新增** `complexity_level` / `risk_level` | ✅ |
| **3a** | `coding/normal/policies/tier-gate.md` | §1/§2 的 D1–D7 表改为**引用** `./policies/risk-signals.md`；保留降档门 D1′–D4′ 与通道转交 | ✅ |
| **3b** | `coding/specify/SKILL.md` | Step 5.4.1 落三字段；状态行；「上下文压缩恢复」补字段 | ✅ |
| **3c** | `coding/verify/SKILL.md` | Step 0 读 · Step 8 补强与写回 · Step 12 触发 · Step 13 清单 · Step 16 摘要 · HARD-GATE · 恢复清单（**多处一并改**） | ✅ |
| **3d** | `coding/plan/SKILL.md` | §3.3.1 改「必有」· §5.1 高危禁跳深化 | ✅ |
| **3e** | `coding/ship/SKILL.md` | 填 `<tier>` 占位 | ✅ |
| **4a** | `src/core/config/task-state.ts` | `TaskState` 加 `complexity_level` / `risk_level` 类型 + `createDefaultTaskState` 默认值；`triage` 死块**未动**（见 §十一） | ✅ |
| **4b** | `docs/specs/2026-09-29-risk-grading-design.md` | 本稿迁入；09-25 spec 的 ⑦ 状态回写 | ✅ |

> `en/`：`assets/en/skills` 为空壳，**无需镜像**；en 填充时再同步。

---

## 九、实施顺序（已执行）

1. **批次 1+2**（纯新增，零消费方）—— 可独立提交，随时可回退 ✅
2. **批次 3a–3e**（技能文本）—— 一次提交；改完跑技能测试 ✅（`skills-install` 13/13 通过）
3. **批次 4**（src + docs/specs）✅

---

## 十、对齐检查

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | **命名撞名** | ⚠️ `critical` vs `review-rubric.md` 的 `Critical` —— **域隔离可解**：前者**变更级**只出现在 `state.yaml`，后者**发现级**只出现在 `reviews/code-review-report.md`，从不同句，大小写惯例亦不同 |
| 2 | **严重度口径唯一源** | ✅ 不冲突（同上：不同维度） |
| 3 | **阶段枚举权威** | ✅ 只引用 `task-kind-layout.ts` 的现行阶段名 |
| 4 | **单源判据** | ✅ 信号表唯一（`zh/policies/risk-signals.md`）；config 零改动；`tier-gate` 由「拥有者」改「引用者」 |
| 5 | **跨技能引用** | ✅ 只走 `./policies/`（install 链接校验会拒 `../`） |
| 6 | **metrics 落点** | 建议 `metrics.json` 顶层加 `risk_tier`（与 `verify_mode` 并列），守「只写顶层 `.polaris/metrics/`」 |
| 7 | **不改阶段数 / 游标语义** | ✅ 不新增阶段，不改 `phase` 取值 |
| 8 | **默认值原则** | ✅ 无命中 → `standard`（宁严勿松的中档）；仅降档门全满足才 `trivial` |
| 9 | **config 零改动** | ✅ 硬约束（D2/D3），§三 已留证 |

---

## 十一、落地记录与遗留

**已完成（2026-09-29）**：

1. 本稿迁入 `docs/specs/2026-09-29-risk-grading-design.md`；`2026-09-25-verify-test-evidence-design.md` 的 ⑦ 状态已回写（§三 决策总表 · §八 挂起段 · §11.7）
2. 批次 4a：`src/core/config/task-state.ts` —— `TaskState` 增 `complexity_level` / `risk_level` 两字段类型；`createDefaultTaskState` 增对应默认值。`tsc --noEmit` 通过；全量测试 **11 failed / 416 passed**，与基线同名同因
   - 目测 `task-state.test.ts` 仍有 2 条失败（`changeId` vs `task_id` 漂移）→ **存量**，HEAD 版同样无 `change_id` 赋值

**遗留 1 项（未动，需单独拍板）**：`state.yaml` 的 `triage:` 块（`tier` / `t1_result` / `t2_result` / `timestamp`）。

- 本仓**零读写** —— `09-25 spec:543` 已记，`task-state.ts` 里仅类型声明与默认值，无阶段决策消费
- 但 2026-09-29 核实：它与 `polaris-cli` 的 `assets/shared/templates/change-state-template.yaml` **同构**（`current_tier` 注释「triage 写入」、`triage:` 块四字段逐一对应），cli 侧另有 `workflow-entry.sh` 的 `upsert-pending-triage`
- 故按 D3 的保守口径**不删**：若日后要接 cli 的 triage 机制，它就是现成落点；若确认永不接，再单独一轮清（会连动 `state.example.yaml` + `task-state.ts`）
