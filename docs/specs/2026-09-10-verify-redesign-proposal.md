# Verify 技能综合方案 — 现有设计 + 报告思路融合

> **状态**：综合方案 v2（职能方案已定稿，技术落地待细化）
> **对应技能**：`polaris:coding:verify`
> **参考材料**：
> - 现有 `verify/SKILL.md`（Step 0~5，完整保留）
> - 现有 `verify/policies/constitution-audit.md`
> - 《AICoding 中 Verify 过程的最佳实践研究报告》（13 页）

---

## 0. 融合原则（核心定位）

**现有 Step 0–5 的完整功能一条不丢，作为主线；报告思路作为增量注入；只在两处做结构增强。**

三条铁律：

1. **保留优先**：现有 HARD-GATE、5 Step、decision-point、重试上限、Constitution 注入点 D、metrics 时间戳约定、上下文压缩恢复，全部保留。
2. **增量有取舍**：报告增量按「纳入 / 裁剪 / 推迟」三档评估，不做过度工程化。
3. **调整最小化**：仅两处结构增强——意图验收前置、功能测试增强为可选环节。

---

## 1. 现有设计功能资产清单（不丢）

| 现有功能 | 具体内容 |
|---------|---------|
| HARD-GATE 硬约束 | 6 条禁令 + H8 状态行约定 |
| Step 0 入口校验 | change_id 定位 / 中断续跑 / build 完成 / tasks 勾完 / worktree |
| Step 1 dirty worktree | 三情况处理协议（change 内 dirty / 仅验证产物 / tasks 滞后） |
| Step 2 Constitution 审计 | 注入点 D + `constitution-validity.sh` + NON-NEGOTIABLE 分级 + 三选项 |
| Step 3 scorer 评分 | 5 个 scorer + `overall_score` 加权聚合 + solo/team 分发 |
| Step 4 规模评估 | light/full 启发式 + 轻量 6 项 + 完整 7 项 |
| 规格漂移检测 | Implementation Divergence 三选项 |
| Step 5 落盘推进 | verify-report / state.yaml / 推进 ship / 硬阻断 |
| 验证失败决策 | decision-point / 严重度分级 / 不确定性原则 / 重试上限 |
| 退出条件 + 压缩恢复 | 5 条退出 + 断点续跑 |

> **关键认知**：之前讨论的「意图验收 / 代码审查 / 功能测试」从来不是凭空新造——它们分别是现有 Step 4.2b、Step 2+3、Step 4 里已有功能的「重新归类 + 增强」。融合方案只是把这些已有功能显式化、前置化、深化。

---

## 2. 报告增量清单（三档评估）

| 增量 | 处置 | 理由 |
|------|------|------|
| 前置契约（Spec Freeze / 术语映射 / 最小改动） | ✅ 纳入 | PDF「验证前置」核心，现有确实缺失，成本低 |
| AI 幻觉检测（幽灵导入/死分支/空 catch/缺失 await） | ✅ 纳入 | AI 代码特有风险，规则化检测成本低 |
| 双轨测试（旧轨基线 + 新轨增量） | ✅ 纳入 | L3 核心，现有「相关测试通过」太弱 |
| 契约测试（接口/行为/安全） | ✅ 纳入 | 中高风险需要，低风险可跳过 |
| 风险分级 tier1/2/3 | ✅ 纳入 | 「功能测试可选」的触发依据，是 light/full 的细化 |
| No-Verification 声明 | ✅ 纳入 | 成本极低、合规收益高 |
| SAST 安全扫描 | ⚠️ 裁剪 | 不引 SonarQube/CodeQL 重型工具，用规则化清单 |
| L4（变异/属性/性能） | ⚠️ 裁剪 | 仅 tier3 启用，阈值可配，不当默认 |
| 多模型交叉审查 | ❌ 推迟 v2 | 成本高、收益不确定，留接口位 |

---

## 3. 综合方案：Step 主线 + 增量注入

```
verify（阶段级入口）
│
├── Step 0：入口校验 + 前置契约（增强）
│   ├── 保留：change_id 定位 / 中断续跑 / build 完成 / tasks 勾完 / worktree
│   └── 新增：Spec Freeze 检查 / 业务术语映射 / 最小改动白名单校验
│
├── Step 1：dirty worktree（不变）
│   └── 保留：三情况处理协议
│
├── Step 2：意图验收（结构调整：从 Step 4.2b 前置）
│   ├── 保留（从 4.2b 原样搬来）：proposal 目标满足 / design 符合
│   │        / detailed-design 符合 / spec scenario 可追溯 / 规格漂移三选项
│   └── 本质：位置前置，内容零增删——先验方向（Validation），再验质量
│
├── Step 3：Constitution + 代码审查（增强）
│   ├── 保留：Constitution 审计（注入点 D）/ 5 scorer / overall_score / mode 分发
│   └── 新增：AI 幻觉检测 / SAST 安全扫描（规则化清单）
│
├── Step 4：功能测试（结构调整：增强为可选环节）
│   ├── 保留：light/full 分流 / verify_mode 启发式 / 相关测试通过
│   └── 新增：双轨测试（旧轨+新轨）/ 契约测试 / 风险分级 tier1/2/3 作为开关
│       └── 裁剪：L4（变异/属性/性能）仅 tier3 启用；多模型交叉推迟 v2
│
└── Step 5：落盘 + 出口（增强）
    ├── 保留：verify-report / state.yaml / 推进 ship / 硬阻断
    └── 新增：No-Verification 声明（未验证项清单）
```

### 两处结构调整的说明

**调整 1：意图验收前置（Step 4.2b → Step 2）**

- 现有：意图核验散在 Step 4.2b 完整验证的 7 项里（proposal 目标满足、design 符合、detailed-design 符合、spec scenario 可追溯、规格漂移）。
- 调整：把这 5 项原样提前到 Step 2，作为「先验方向」的第一道闸门。
- 依据：PDF 4.3「AI 最容易错在业务语义而非技术实现」+ 测试左移「先验方向再验质量」。

**调整 2：功能测试增强（Step 4 弱检查 → 可选环节）**

- 现有：Step 4 的「相关测试通过」是一句带过的弱检查（轻量 6 项第 4 条）。
- 调整：增强为可选的完整功能测试（双轨 + 契约 + 可选 L4），按风险分级自动开关。
- 依据：PDF L3 双轨安全网 + 第 6 节风险分级验证策略。

---

## 4. 功能测试开关策略（风险分级自动开关）

> 已确认：功能测试「可选」= 风险分级自动开关，非纯手动。

### 4.1 风险分级推断

- tier3（高风险）：`auth/payment/crypto/concurrency/migration/infra/secrets` 等路径
- tier2（中风险）：`api/services/models/repositories/controllers` 等路径
- tier1（低风险）：其余（文档/测试/样式/纯函数/工具脚本）

> 已确认 Q1：提供 `.polaris/config.yaml` 的 `risk_inference` 覆盖机制，默认内置 glob + 用户可自定义。

### 4.2 开关决策表

| verify_mode | risk_tier | 默认 functional | 可被用户覆盖 | 强制 |
|-------------|-----------|----------------|--------------|------|
| light | tier1 | 关闭 | ✅ 可开 | 否 |
| light | tier2 | 开启 | ✅ 可关（记 override） | 否 |
| light | tier3 | 开启 | ⚠️ 仅 team 可关 | team 必跑 |
| full | tier1/2 | 开启 | ✅ 可关 | 否 |
| full | tier3 | 开启 | ❌ 不可关 | **必跑全量（含 L4）** |

### 4.3 CLI 接口（落地时）

```
/polaris:coding:verify                    # 按决策表自动
/polaris:coding:verify --skip-functional-test      # 显式跳过（记 override）
/polaris:coding:verify --enable-functional-test    # 强制开启
/polaris:coding:verify --risk-tier tier3           # 显式覆盖风险等级
/polaris:coding:verify --no-l4                     # 跳过 L4（仅 full 允许）
```

---

## 5. 产物与状态机

### 5.1 verify-report.md（在现有模板上扩展）

```
# Verify Report — <change_id>

## 0. 元信息
change_id / verify_mode / risk_tier / mode / 时间 / functional 开关状态

## 1. 前置契约（Step 0）
Spec Freeze / 术语映射 / 最小改动白名单

## 2. 意图验收（Step 2）
proposal 覆盖 / design 符合 / detailed-design 符合 / spec scenario 追溯 / 规格漂移

## 3. 代码审查（Step 3）
Constitution 违规（critical/important）/ AI 幻觉 / SAST / 5 scorer + overall_score

## 4. 功能测试（Step 4，如启用）
旧轨 / 新轨 / 契约 / L4（如启用）

## 5. No-Verification 声明（Step 5 新增）
结构化列出未验证项 + 原因

## 6. 裁决
overall_score / score_level / status / blocked / next: ship
```

### 5.2 state.yaml 扩展（在现有 `runtime.verify.*` 上新增字段）

```yaml
runtime:
  verify:
    status: completed
    verify_mode: light | full
    risk_tier: tier1 | tier2 | tier3       # 新增
    constitution_valid: true | false        # 保留
    overall_score: 90                       # 保留
    score_level: high | low                 # 保留
    blocked: false                          # 保留
    functional_test:                        # 新增
      enabled: true | false
      skip_reason: null
    intent:                                 # 新增（Step 2 产物）
      proposal_coverage: "3/3"
      design_match: full | partial | skipped
      detailed_design_match: full | partial | skipped
      spec_scenarios: { total: 10, automated: 8, manual: 2 }
      drift_count: 0
    no_verification: []                     # 新增（Step 5 产物）
    verification_report: "openspec/changes/<change_id>/reviews/verify-report.md"
    finished_at: "ISO"
```

### 5.3 metrics JSON 扩展（保留时间戳叠加语义）

```json
{
  "timestamp": "20260909-133000",
  "change_id": "<id>",
  "mode": "solo",
  "verify_mode": "full",
  "risk_tier": "tier2",
  "functional_test_enabled": true,
  "audit": { "violations": 0, "total_checks": 12 },
  "overall_score": 88,
  "scorers": [...],
  "intent_match": { "proposal_coverage": 1.0, "drift_count": 0 },
  "functional": { "baseline_pass_rate": 1.0, "contract": "pass" },
  "no_verification": ["L4 mutation: skipped (verify_mode=light)"]
}
```

---

## 6. 决策点（保留 + 扩展）

沿用现有 decision-point 协议 + 不确定性原则（宁可标轻）+ 重试上限（3 次循环后第 4 次仅两选项）。

| 决策点 | 触发 | 选项 |
|--------|------|------|
| Step 0 失败 | Spec 未冻结 / 术语映射缺失 / 白名单外文件 | 回 build/specify 修复 / 接受记 override / 阻断 |
| Step 2 失败 | 目标未覆盖 / 规格漂移 / scenario 未追溯 | A 记 Divergence / B 回 design/build / C 接受偏差 |
| Step 3 失败 | Constitution critical / 幻觉 / SAST / scorer blocked | 回 build 修复 / 接受记 overrides.log / 重做任务组 |
| Step 4 失败 | 旧轨回归 / 新轨覆盖不足 / 契约失败 / L4 杀死率 < 70% | 回 build 补测试 / 接受偏差 / 降级 verify_mode |
| Step 5 出口 | blocked / 未解决 CRITICAL / metrics 未写 / report 未落盘 | **硬阻断** |

---

## 7. 与 PDF 关键原则的映射校验

| PDF 原则 | 融合方案如何体现 |
|----------|----------------|
| 生成与裁决分离 | Constitution 由独立模块执行；Step 2 意图验收不调 build agent；L4 变异测试由独立工具注入缺陷 |
| 自报告不是证据 | metrics + verify-report 双产物；每项结论附命令日志路径 |
| 测试先于实现 | tasks 阶段已强制 TDD；Step 2 校验 spec scenario 是否 build 前定义 |
| 验证悖论破解 | 双轨旧轨由历史用例组成；L4 变异测试独立；多模型（v2） |
| 风险分级 | §4 决策表 tier1/2/3 差异化强制 Step 4 |
| 证据即交付 | Step 5 强制 No-Verification 声明；metrics 必含 intent_match + functional |
| 知识持续回流 | 失败时在 decision-point 记录失败模式（不设独立目录） |
| 最小改动原则 | Step 0 白名单校验 + Step 2 规格漂移检测拦截无关重构 |

---

## 8. 对现有 SKILL.md 的改造点（落地时）

| 现 SKILL.md | 新 SKILL.md | 改动性质 |
|-------------|-------------|---------|
| Step 0 入口校验 | Step 0 + 前置契约 | 增强（+Spec Freeze/术语/白名单） |
| Step 1 dirty worktree | Step 1 | 不变 |
| Step 2 Constitution | Step 3 前半 | 后移（+AI 幻觉/SAST） |
| Step 3 scorer | Step 3 后半 | 不变（+聚合不变） |
| Step 4.2b 完整验证 | Step 2 意图验收 | **前置**（内容不变） |
| Step 4 相关测试 | Step 4 功能测试 | 增强（+双轨/契约/L4/分级） |
| Step 5 落盘 | Step 5 + No-Verification | 增强 |

> 关键：这是「位置调整 + 增量注入」，不是「删除重写」。现有每一条 HARD-GATE、每一段协议都保留。

### 新增参考文件

```
verify/
├── SKILL.md                      # 重写（保留现有全部功能 + 增量注入）
├── policies/
│   ├── constitution-audit.md     # 沿用
│   ├── intent-acceptance.md      # 新增：Step 2 细则（从 4.2b 抽出）
│   ├── code-review.md            # 新增：Step 3 细则（+AI 幻觉/SAST）
│   ├── functional-test.md        # 新增：Step 4 细则（双轨/契约/L4）
│   └── risk-inference.md         # 新增：tier1/2/3 推断规则
└── assets/
    ├── verify-report-template.md # 扩展模板（+No-Verification）
    └── hallucination-checklist.md # 新增：AI 幻觉检测清单
```

---

## 9. 落地顺序（增量推进）

1. **Step 2 意图验收前置**——把现有 4.2b 的 5 项抽出，前置为 Step 2，先跑通「先验方向」
2. **Step 4 功能测试可选 + 风险分级**——引入 tier1/2/3，双轨 + 契约，L4 仅 tier3
3. **Step 0 前置契约增强**——Spec Freeze / 术语映射 / 白名单
4. **Step 3 代码审查增强**——AI 幻觉检测 + SAST 规则化清单
5. **Step 5 No-Verification 声明**——未验证项清单
6. **policies/ 拆分**——intent-acceptance / code-review / functional-test 三个 policy 文件

---

## 10. 待决问题

| # | 问题 | 状态 |
|---|------|------|
| Q1 | risk_inference 配置机制 | ✅ 已决：config.yaml 覆盖机制 |
| Q2 | 多模型交叉是否入 v1 | 待决（建议推迟 v2） |
| Q3 | decision-point.md 归属（全局 vs 各技能） | 待决 |
| Q4 | 知识回流去向（去 E 后） | 待决（建议：失败时记录到 report，不设独立目录） |
| Q5 | 功能测试关闭后 spec scenario 追溯要求 | 待决 |
