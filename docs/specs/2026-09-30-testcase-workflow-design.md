# 测试用例工作流设计（testing 族）

> 状态：设计稿（待评审）
> 日期：2026-09-30
> 关联：`src/core/config/task-kind-layout.ts`（`testcase` kind）、`src/core/hooks/state-next.ts`、`assets/shared/templates/testcase-state.example.yaml`
> 来源思路：《渐进式有效测试用例编写思路》（用户整理，五阶段：用例设计 → 分层 → 非功能 → 接口与自动化 → 闭环迭代）
> 同族既有文件：`assets/zh/skills/testing/case/SKILL.md`、`assets/zh/skills/testing/acceptance/SKILL.md` —— **内容为早期 AI 产物，不作为判据源**（见 §二）

---

## 一、结论

**本设计不新造工作流形态，而是把平台里已经存在的 `testcase` kind 填实。**

平台侧的骨架全部就位：kind 已登记、阶段序列已定、state 模板已入仓、`draft-create` / `task-state-entry` / `workflow-entry` / `state-next` / dashboard 扫描全部已支持 `testcase`。唯一缺口是**该族的四个阶段没有任何技能**——`task-kind-layout.ts` 中 testcase 四阶段的 `skill` 字段全部为 `null`，`state-next` 因此无法给出下一阶段技能名，游标推到阶段就断了。

设计工作 = 补齐 `assets/zh/skills/testing/{discovery,draft,refine,ship}/` 四个技能，并把 `skill: null` 对齐为同名。

---

## 二、权威边界（先说清哪些能当判据）

**判据唯一源原则**：只有「受版本控制、可 diff、可评审」且在仓库流程中真实被消费的文件才能作为判据出处。仅凭 `git ls-files` 存在不足以判定——需看内容来源。

| 文件 / 位置 | 是否可作为判据 | 判定依据 |
|---|---|---|
| `src/core/config/task-kind-layout.ts` 的 `testcase` 段 | ✅ **是** | 代码，可 diff；注释自述「权威口径 = 本表」 |
| `assets/shared/templates/testcase-state.example.yaml` | ✅ **是** | 入仓；与 kind 表互为守门件 |
| `src/core/assets/layout.ts` 的 `SKILL_FAMILIES` | ✅ **是** | 代码；`testing` 族已在册，且注释明确「测试族固定为 `testing`，**不可用 `test`**」 |
| `src/core/hooks/state-next.ts`（`testcase: 'testing'`） | ✅ **是** | 代码；声明 kind→族 映射 |
| `assets/zh/skills/coding/tasks/references/test-case-checklist.md` | ✅ **是**（今日新增、未提交） | 09-30 新写；自述「**场景分类的唯一语言**」，被 `test-review-methodology.md` 复用 |
| `assets/zh/skills/coding/verify/SKILL.md` | ✅ **是** | 测试执行口径唯一源（五槽 / 三级分叉 / 覆盖率 / 基线红名单） |
| `assets/zh/skills/maintance/codereview/references/security-checklist.md` | ✅ **是** | 安全清单唯一源 |
| `assets/zh/policies/*` | ✅ **是** | 顶层注入，跨技能共用规则的唯一合法位置 |
| `assets/zh/skills/testing/case/SKILL.md` | ❌ **否** | 内容为早期 AI 产物；虽已入库，但其「三类场景 / 7 类异常源 / 用例字段」等表述无上游依据 |
| `assets/zh/skills/testing/acceptance/SKILL.md` | ❌ **否** | 同上 |

> **处置结论**：两个既有文件**不是需要「上收」的资产**，而是需要被替换的空壳。新族的判据从「用户方法论 + 行业标准 + 上表真源」重新写，不继承其分类语言。

---

## 三、设计目标与非目标

**目标**

1. 四个技能与 `testcase` kind 的四阶段一一对应，命名与 requirement 族保持一致（`discovery` / `draft` / `refine` / `ship`）。
2. 把方法论的五阶段完整落位，且**每一阶段都有唯一判据源**，不新起第二套分类语言。
3. 与既有工作流的编写风格、命名、文档组织**逐项对齐**（HARD-GATE / 标识约定 / Step 0..N / 上下文压缩恢复 / 自动衔接）。

**非目标**

- 不新建 kind，不新建 stage，不改 dashboard 契约。
- 不在本族内定义测试执行口径（执行委托 `coding/verify`）。
- 不定义安全清单（引用 `maintance/codereview`）。
- 本批只做中文（`assets/en/skills/` 目前为空，不阻塞）。

---

## 四、工作流形态

```mermaid
flowchart LR
  in["输入：定稿 PRD（含验收标准）· 交互原型 · 表设计 · 接口清单"] --> d
  d["discovery 澄清"] --> dr["draft 草稿"]
  dr --> rf["refine 完善"]
  rf --> sh["ship 交付"]
  sh -.缺陷反哺 / 需求变更重入.-> d
```

### 4.1 为何是「四阶段技能族」而非「单入口大技能」

| 方案 | 优点 | 缺点 | 判定 |
|---|---|---|---|
| 单入口（仿 `normal` / `tweak`） | 一次会话跑完、无跨技能衔接成本 | 五阶段判据塞进一个 SKILL.md → 极长；无法只做某一阶段；上下文必然溢出 | ✖ |
| **四阶段技能族（本设计）** | 与 platform 既有 `testcase` kind 天然对齐；可按需进入；上下文分片；`state next` 可自动衔接 | 需配套入口命令与 `skill` 字段对齐 | ✔ |

决定性理由：kind 与 state 已存在，单入口方案等于**绕过平台契约另造一套**，且会让 dashboard 的步骤条失去数据来源。

### 4.2 五阶段 → 四阶段的压缩映射

| 方法论阶段 | 落点 | 压缩理由 |
|---|---|---|
| 阶段一 基础筑基（意图拆解 / 骨架 / 正向 / 反向 / 数据脚本） | `discovery` 承载「意图 + 条目 + 范围 + 策略」；`draft` 承载「用例正文」 | 阶段一的「先定测试意图清单再写用例」是两道不同的动作，天然分属澄清与草稿 |
| 阶段二 L1-L4 分级 | `draft` | 分级是对**同一批用例**的标注，与用例正文同批产出，拆开会造成两次落盘和版本错位 |
| 阶段三 非功能 + 阶段四 接口/自动化 | `refine` | 两者同属「功能用例之外的增量拓展」，合并为一个阶段、三个子节 |
| 阶段五 闭环迭代与准出支撑 | `ship` | 准出报告与资产入库是一次性交付动作 |
| 阶段五的「持续迭代」（需求变更同步 / 缺陷反哺 / 回归集动态调优） | `ship` 内的**运营约定**章 + 重入 `discovery` | 持续迭代是**长期运营**，不是一次性阶段；写规则、由后续流程重入执行 |

---

## 五、技能设计

### 5.1 `testing/discovery` — 澄清

| 项 | 内容 |
|---|---|
| 定位 | 把「要测什么」钉死：测试意图、需求条目清单、范围与粒度、分层与自动化策略 |
| 输入（必需） | 定稿 PRD（含验收标准，唯一真相）；缺验收标准先走 `polaris{{SKN_SPR}}testing{{SKN_SPR}}acceptance` |
| 输入（可选） | 交互原型、数据库表设计、接口清单（后两者见 §九 决策 3） |
| 步骤 | ① 输入加载 + 需求条目编号（沿用 PRD 原编号，缺失按 `F{章节}-{序号}` 补编） ② **测试意图清单**（模块 → 子功能 → 功能点三级拆解，作为后续总纲） ③ 范围与粒度确认 ④ 分层策略（本版做几层）与自动化策略（哪些批次转自动化） ⑤ 出口门禁 |
| 产物 | `.polaris/testcases/<task_id>/testcase_plan.md`（**即 kind 的 bootstrap 文件名**，与 state 的 `plan_path` 字段对应） |
| 判据 | §六 表的「场景枚举语言」与「分层与优先级」 |
| 停顿点 | 范围/粒度未定时暂停等用户选；验收标准缺失时一次问全 |
| 阶段 `skill` | `null`（入口阶段，由命令显式进入，与 `coding/specify`、`prd/discovery` 同理） |

### 5.2 `testing/draft` — 草稿

| 项 | 内容 |
|---|---|
| 定位 | 产出功能用例全集 + 分层标注 + 追溯矩阵 |
| 输入 | `discovery` 的 `testcase_plan.md` |
| 步骤 | ① 正向主干（**单条用例只验证一个行为点**，避免失败无法定位） ② 反向场景（按统一枚举语言逐类过一遍，无对应场景必须显式标「无」） ③ 边界取点 ④ 数据构造脚本设计（入口 / 参数 / 清理方式） ⑤ **分层标注**（L1-L4 或 P 级，见 §九 决策 1） ⑥ 覆盖校验 + 需求↔用例双向追溯矩阵 |
| 产物 | `.polaris/testcases/<task_id>/test-cases.md`（用例集 + 追溯矩阵 + 数据构造脚本清单） |
| 判据 | 同上 |
| 停顿点 | 枚举不充分（某类无落点却未标「无」）→ 回补；覆盖不足 → 输出待补清单 |

### 5.3 `testing/refine` — 完善

| 项 | 内容 |
|---|---|
| 定位 | 在功能用例之外做三类增量拓展：非功能 / 接口 / 自动化 |
| 步骤 | **3.1 性能**：基准（单用户响应/吞吐基线）→ 并发（核心节点多用户 + 数据一致性）→ 压力与稳定性（超载 / 长稳），每条**必须带指标阈值**作为唯一判定依据<br>**3.2 安全**：按功能流程嵌入验证点（基础安全 + 业务安全）；清单**引用** `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 `references/security-checklist.md`，不复制<br>**3.3 接口**：单接口（正向 / 参数异常 / 边界 / 权限）→ 业务场景串（按 L1-L2 链路串联）；对齐 `coding/verify` 的 `contract` 槽语义<br>**3.4 自动化转化**：先核心后边缘、先正向后反向，分批次；保留业务语义、补齐元素定位 / 数据驱动 / 断言 |
| 产物 | `.polaris/testcases/<task_id>/` 下：非功能用例、接口用例、自动化脚本集与报告模板 |
| 停顿点 | 性能指标缺失 → 记入待确认清单，不编造阈值 |

### 5.4 `testing/ship` — 交付

| 项 | 内容 |
|---|---|
| 定位 | 准出材料 + 资产入库 + 持续迭代约定 |
| 步骤 | ① **准出报告**（分层通过率、需求覆盖率、自动化覆盖率、遗留缺陷）② 入库清单（用例资产 + 脚本资产）③ 归档 ④ **缺陷反哺规则**：测试 Bug 与线上问题均须反向补充对应层级用例，单点问题转通用回归校验点 |
| 产物 | `.polaris/testcases/<task_id>/testcase-report.md` + 归档 |
| 出口 | 准出判定形态可对齐 `prd/readiness` 的 PASS / CONDITIONAL / FAIL（形态复用，不共用判据） |

---

## 六、判据唯一源

| 判据 | 唯一源 | 消费方式 |
|---|---|---|
| **场景枚举语言** | `polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks` 的 `references/test-case-checklist.md`（6 大类 + 反模式 + 单行为原则） | 按其 6 大类逐类过；**扩展见 §九 决策 2** |
| **分层与优先级** | 待定 —— 见 §九 决策 1 | - |
| 执行口径（五槽 / 三级分叉 / 基线红名单 / 覆盖率） | `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` | 只给指针，本族不跑测试 |
| 安全清单 | `polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview` 的 `references/security-checklist.md` | 只给指针 |
| 跨技能共用规则（停顿协议 / 自动衔接 / 硬约束） | `assets/zh/policies/`（顶层注入） | 各技能一律 `./policies/<name>.md` |

**跨技能引用只能按技能名**（如「按 `polaris{{SKN_SPR}}coding{{SKN_SPR}}tasks` 的 `references/…`」），不得写跨技能相对路径——安装器会拒收，且该做法在 `verify` Step 14 已有先例。

---

## 七、命名与文档组织

| 项 | 约定 |
|---|---|
| 技能 name | `polaris{{SKN_SPR}}testing{{SKN_SPR}}<skill>`，后缀 = 目录名 |
| 目录 | `assets/zh/skills/testing/{discovery,draft,refine,ship}/{SKILL.md, policies/, references/, templates/}` |
| 族名 | 只能是 `testing`（**不可用 `test`**，与仓库根 `test/` 冲突） |
| 入口命令 | 新建 `assets/zh/commands/testing/`；命令文件**无需登记 manifest**（按目录扫描） |
| frontmatter | `name` + 只写路由信息的 `description`（≤1024）+ `version` |
| 正文骨架 | `# 标题` → `<HARD-GATE>` → 启动输出 → `## 标识约定` → `## 流程`（Step 0..N）→ 阻塞点 → `## 退出条件` → `## 上下文压缩恢复` → `## 自动衔接下一阶段` |
| 终端技能 | `ship` 只到「上下文压缩恢复」并声明链路终点 |
| 运行态 | `.polaris/testcases/<task_id>/state.yaml`（四阶段块 + `plan_path`） |

---

## 八、行业最佳实践对齐（作为各步判据背书）

| 方法论要点 | 对应实践 |
|---|---|
| 需求拆解 + 双向追溯矩阵 | ISO/IEC/IEEE 29119-3 的 test case / procedure / traceability；RTM 需求-用例-缺陷矩阵 |
| 反向场景与边界取点 | 等价类划分、边界值分析（BVA）、判定表、状态迁移法 |
| L1-L4 分层与准入闸门 | 风险驱动测试（RBT）+ 冒烟准入门禁；可挂既有 `policies/risk-signals.md` 的两轴 |
| 接口串联与自动化转化排序 | 测试金字塔 / Testing Trophy；「先核心后边缘、先正向后反向」= smoke 优先 |
| 数据可构造 / 可清理 / 不依赖执行顺序 | Fixture 与 Test Data Builder 模式 |
| 准出判定 | Exit Criteria（覆盖率 / 通过率 / 遗留缺陷阈值） |
| 缺陷反哺回归 | Defect-driven regression（每个缺陷生成回归用例） |

---

## 九、待裁决决策点

### 决策 1：L1-L4 与 P0/P1/P2 的关系（最尖锐）

| 选项 | 说明 |
|---|---|
| A1 | 二者等价，二选一 |
| **A2（推荐）** | 保留 P 级为**唯一优先级轴**（已被 `test-case-checklist.md` 使用、被 verify 消费），L1-L4 降为**执行批次 / 准入视图**，写死映射 `L1 ⊇ P0 主流程` |
| A3 | 反过来，以 L1-L4 为分层主语言 |

**推荐 A2 的理由**：P 级的独有价值是「单条用例重要性」，已被现有两处消费者锁定；L1-L4 的独有价值是 **L1 的准入闸门语义**（L1 100% 通过才放行）——P 级没有这层含义。二者是不同轴，强行二选一必丢功能。

### 决策 2：需求级场景枚举是否扩展 6 大类

`test-case-checklist.md` 的 6 大类面向**代码级单元测试**（其 GWT 直接映射 AAA 断言）。方法论要求的业务级场景中，**「权限异常」「弱网 / 中断」「业务规则违例」在 6 大类中无落点**。

| 选项 | 说明 |
|---|---|
| B1 | 扩写 6 大类 —— 会牵动 `coding/tasks`、`coding/verify` 与 `tasks-review-agent`，风险外溢 |
| **B2（推荐）** | 在 `testing` 族内新增「需求级场景扩展表」，**逐条映射到 6 大类**并显式标注 6 大类未覆盖项；与 `maintance/codereview` 的「§一 粗切 / §二 细切必须互为落点」同一处理法 |

### 决策 3：两个新输入源

方法论阶段一要求「数据库表设计」、阶段四要求「ApiFox 接口清单」——仓库现有 PRD / 原型链路**没有**这两类输入的约定位。

| 选项 | 说明 |
|---|---|
| **C1（推荐）** | 降为**可选输入**：有则用（提升数据落库断言与接口用例质量），无则记 `No-Input` 并在报告中声明，不阻断 |
| C2 | 新增输入约定，要求这些文档必须存在 |

### 决策 4：`testing/case` 与 `testing/acceptance` 的处置

- `case`：**删除**（其职责由 `draft` 承接，内容不继承）。
- `acceptance`：**建议保留** —— 它产出的是需求侧 GWT 验收标准，供 `discovery` 作输入，属链路**上游**而非同层。若确认其内容同样是 AI 产物，则需重写而非保留。

---

## 十、落地清单与改动面

| # | 动作 | 位置 | 是否属「先问范围」 |
|---|---|---|---|
| 1 | 新建 4 个 `SKILL.md` + 判据 references + 模板 | `assets/zh/skills/testing/` | 否，可直接动 |
| 2 | 删除 `testing/case`；处置 `testing/acceptance` | `assets/zh/skills/testing/` | 否（删除需确认，见决策 4） |
| 3 | 对齐四阶段 `skill` 字段（`null` → 同名） | `src/core/config/task-kind-layout.ts` | **是（`src/`）** |
| 4 | 新建入口命令 | `assets/zh/commands/testing/` | 否 |
| 5 | `T01` 路由改指 `testing/discovery` | `assets/zh/commands/flow.md` | **是（改既有命令）** |
| 6 | 补登记核实的产物路径 | `task-kind-layout.ts` 的 `testcase.artifacts` | **是（`src/`）** |

> 现状备注：`test-case-checklist.md` 今日新增但**尚未提交**；`testing/case` 与 `acceptance` 已提交（commit `5b078af`）。本设计的改动面落在 `assets/` 与 `src/` 两处，`src/` 部分需先获授权。
