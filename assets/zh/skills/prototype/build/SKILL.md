---
name: polaris{{SKN_SPR}}prototype{{SKN_SPR}}build
description: "当《原型蓝图》已确认、要把它做成 HTML 原型时使用。通常由 blueprint 确认后推进，或由 ship 的返工回路调用；用户直接说接续语义的话时也走这里。用户要求：照蓝图做原型 / 蓝图确认了开始做 / 按页面清单出原型 / 继续做原型 / 重做某几个页面 / 修改已有原型 / 补页面与交互状态 / 原型要能点击演示 / 原型要能交研发。不触发：还没有蓝图、要先出原型制作思路或梳理页面清单（走 polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint）、只评审已有原型能否交研发（走 polaris{{SKN_SPR}}prototype{{SKN_SPR}}review）、交付归档与任务收尾（走 polaris{{SKN_SPR}}prototype{{SKN_SPR}}ship）、只写 PRD 或需求文档、只做需求澄清与需求评审、只要低保真线稿或页面流程图（走 lofi-prototype）、只要技术方案 / 接口设计 / 数据库设计、只要视觉走查或设计规范文档、只要前端代码实现。"
version: 3.7.0
---

# 产品原型制作与研发交付

用途：Web 原型 / 高保真原型 / HTML 交互原型 / 页面模式 / 页面结构 / 交互状态 / 视觉规范 / 响应式布局 / 研发交付

**前置**：《原型蓝图》已由 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint` 产出并**经人工确认**——至少含 `blueprint.md` 与 `page-list.md`。
本技能**不产蓝图、不改蓝图**：只按已确认的蓝图做设计细化与实现。发现蓝图缺口一律标记 `WEB-DESIGN-CHANGE-XXX` 回报，不自行改写。

## 标识约定

产物一律落 `$REPO_ROOT/.polaris/tasks/$task_id/`；用户显式指定输出目录时以用户为准（并把最终路径写进 `state.yaml` 的 `work_dir`）。

| 项 | 文件 | 说明 |
|---|---|---|
| 原型（核心成果） | `<原型名>.html` | 单文件、零外部依赖、可离线双击打开 |
| 黄金流（机器读） | `<原型名>.flow.json` | 《核心用户任务流》的机器可读孪生，供 `verify --flow=` 消费；模板取 `verify.mjs --print-flow-example`。**与蓝图环节的 `golden-flow.md` 同源，不额外计入 6+1** |
| 页面结构、状态与交互 | `page-structure.md` | Step 3.2–3.3 |
| 研发交接说明 | `handoff.md` | Step 5 |

**蓝图环节的产物**（`task-card.md` / `golden-flow.md` / `ia.md` / `page-list.md`）由 `blueprint` 落盘，
本技能**只读不改**——它们是本环节的输入，不是产出。

---

**启动时必须先输出**：`[polaris-flow 原型] 开发原型: 使用 polaris{{SKN_SPR}}prototype{{SKN_SPR}}build 技能。`

## 流程

### Step 0：定位任务标识 + 入口校验

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind prototype --skill build --repo-root "$REPO_ROOT" --phase build)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `task_id`
- **多个匹配**：按 `./policies/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 构建 阶段的 active change，请先执行 /polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint」

> 若选择的任务已是 `phase=build`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。
> 若上次中断在 “构建” 中（`build.status=in_progress`），从中断点续跑；不得因「已是 build」而报零匹配。

**入口校验**（已完成 → 阻断重跑）：

| 检查 | 条件 |
|------|------|
| 蓝图 已完成 | `state.yaml` 中 `blueprint.status=completed` |

输出：`[polaris-flow 原型] 开发原型: 任务标识=<task_id>`

执行：
1. 更新 `state.yaml`：`phase: build`，`build.status: in_progress`。

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind prototype --phase build
```

2. 设置语言

执行脚本：
```bash
LANG = $(bash "$PLUGIN_ROOT/scripts/get-language-name.sh")
LANG_EXIT = $?
```

- `LANG_EXIT != 0` → 使用当前用户请求语言
- `LANG_EXIT == 0` → 本阶段所有提问与澄清摘要均采用 $LANG。

#### Step 1.5：读取任务进展，继续执行任务

读取 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml` 拿**身份与指针**（`task_id` / `phase` / `name` / `work_dir`），
**进度按落盘产物判定**——`state.yaml` 不记「做到第几步」，避免两个状态源打架：

| 落盘产物状态 | 判定 | 进入步骤 |
|---|---|---|
| 无蓝图产物（`blueprint.md` / `page-list.md` 缺失或未确认） | 本环节**不能开工** | **阻断**：提示先执行 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint`（flow.md R11）并完成人工确认 |
| 有蓝图、无 `page-structure.md` | 设计细化未开始 | 进入 **Step 3.1** |
| 有 `page-structure.md`、无原型 `.html` | 细化已完、未搭骨架 | 进入 **Step 4.1**（`scaffold init`） |
| 有原型、无 `flow.json` 或 `verify` 未跑过 | 骨架已落、未验证 | 进入 **Step 4.2** |
| 原型 + `flow.json` + `handoff.md` 齐备 | 本环节已完成 | 进入 **Step 5** 的交付阻塞点——是否进 `ship` 由用户选择，不自作主张 |
| 无法判定 | — | 按 `./policies/decision-point.md` 询问用户从哪个步骤继续 |

**命名标识补齐**（续写既有任务时先查 `state.yaml`）：

| `name` 状态 | 后续动作 |
|---|---|
| 缺失| 补走 **Step 2.1** 确认中文名与编号前缀后，再进入对应步骤继续 |
| 存在 | 直接沿用，后续步骤的编号与文档名一律以该前缀为准 |

### Step 2: 初始化

#### Step 2.1: 校验蓝图已确认（硬门禁）

在 `work_dir`（或 `blueprint` 环节的产物目录）里读取 `blueprint.md` 与 `page-list.md`：

| 情况 | 处理 |
|---|---|
| 两份齐备且 `blueprint.md` 有确认记录 | 通过，进入 Step 2.2 |
| 有文件但**无确认记录**（草稿） | **阻断**：提示走 `blueprint` 完成人工确认；不得拿草稿当依据开工 |
| 文件缺失，**但 `work_dir` 里已有落盘的原型 `.html`**（改已有原型场景） | **不阻断**：按用户明确指定的改动点做**最小改动**（增删页面 / 图标走 `scaffold` 定点插入，不得整份重写）；同时提示蓝图缺失会削弱「范围与页面职责」判据，建议先走 `blueprint` 补一份，或先走 `review` 取问题清单再改 |
| 文件缺失且无原型 | **阻断**：提示先执行 flow.md **R11** |

**蓝图确认后即冻结**：本环节发现范围、页面职责、任务流的缺口时，只标记 `WEB-DESIGN-CHANGE-XXX` 并在 `handoff.md` 里列出，
**不得直接改写蓝图产物**——改蓝图等于绕过需求方已经做过的确认。

#### Step 2.2: 加载必读信息

`read_file` `./references/00-basis.md`，理解角色定位与方法论、能力 / 决策边界、核心原则与冻结规则、AI 交互专项、视觉与布局红线、一票否决高频 8 条、最终判断标准。

**三条不可协商的红线**（全文见 `references/00-basis.md §三` / `§六`）：上游已确认的名称与范围不得改写，缺口一律标记 `WEB-DESIGN-CHANGE-XXX`；交付前必须跑 `scripts/verify.mjs` 全三层并取得退出码 0；原型骨架与增删一律走 `scripts/scaffold.mjs`，不手工编辑区域标记外的内容。

### Step 3: 设计细化

把已确认的蓝图细化到「可以直接写页面」的颗粒度。四步**顺序是建议而非锁**：
后一步推翻前一步是正常的，**但回填后必须复检受影响的下游产出物**（改了页面模式就重看结构，改了结构就重看状态覆盖），并在 `page-structure.md` 里留一句回填说明。
**前置假设**：蓝图已经需求方确认，故不设需求复核回路；发现需求本身的缺陷按 `references/00-basis.md §二（§31）` 报回产品经理，不自行改写。

#### Step 3.1 确定页面模式

不得所有页面都用「查询 + 表格 + 弹窗」，按蓝图里每个页面的主任务自动选模式。九种模式：

| 模式 | 适用 | 结构 / 要点 |
|---|---|---|
| 标准工作台 | 高频入口、待办、提醒、关键任务、重点指标 | 今日待办 / 高优任务 / 异常提醒 / 最近处理 / 快捷发起；**不要把工作台做成纯大屏** |
| 标准列表页 | 查询、筛选、批量管理、业务对象管理 | 页面标题 → 查询区域 → 工具栏 → 数据表格 → 分页 |
| 对象详情页 | 项目、合同、任务、隐患、档案、人员等业务对象 | 标题 / 状态 / 关键操作 → 关键基础信息 → Tabs / 分区 → 业务记录 / 时间线 / 附件 / 关联对象；信息量大时优先独立详情页，不强制弹窗 |
| 主从式工作页 | 左侧任务 / 对象列表 + 右侧详情 | 切换快、上下文连续；适合审核、处理、任务中心 |
| 对照审核页 | 合同审查、档案审核、图纸核验、AI 审查 | 左：原文 / 原对象；右：AI 结果 / 风险 / 差异；下或侧：依据 / 修改建议 / 人工确认 |
| 流程办理页 | 审批、审核、整改、复核 | 显示当前状态、当前节点、历史记录、待办事项、当前操作 |
| 配置管理页 | 规则、知识、模板、标签、参数 | 左侧目录 / 树 + 右侧配置 / 编辑 |
| 分步向导页 | 上传 → 配置 → AI 处理 → 人工确认 → 完成 | 优先用 Stepper 清晰表达当前进度 |
| AI 工作台 | Agent、AI 分析、AI 审查、AI 生成 | 必须含：任务输入、AI 当前状态、AI 执行步骤、结构化结果、依据、人工确认、后续业务动作 |

- 产出：写回 `page-structure.md` 的模式列（**不改写 `page-list.md`**）　判据：非全部「查询 + 表格 + 弹窗」；模式与页面主任务对得上　门禁：无

#### Step 3.2 页面结构设计

每个 P0 页面定义 12 项（Page ID、名称、角色、目标、进入条件、看到什么、做什么、页面区域、离开方式、业务状态、响应式行为、密度模式与容器高度策略）。每页先用"任务—信息—操作"三层法自查，不支持其一的区域审查必要性。其中**密度模式见 `references/05 §15.5`**，**容器高度策略与内容感知布局（Auto Content / Adaptive Data / Full Workspace）见 `§16.2–16.3`**——这两段在结构阶段就要定，等写完页面再补就是大面积空白类返工。**12 项定义与「任务—信息—操作」三层法的完整展开见 `references/04 §11`**——本步只列项，判据与示例在那份里。

- 产出：`page-structure.md`　判据：12 项无缺项；密度模式与容器高度策略已选定（不是留到写页面时再说）　门禁：无

#### Step 3.3 交互与状态设计

高质量原型不能只有"正常页面"。每个 P0 页面至少考虑 11 种状态：**Initial、Loading、AI Processing（显示"正在解析→检索→分析→生成"而非只转圈）、Skeleton、Empty、Success、Partial Success、Error（必须给出下一步：重试/修改/重新上传/转人工）、Human Review、No Permission、Disabled**。每种状态该长什么样、判据是什么，见 `references/04 §12`（12.1–12.11）；AI Processing 与 Human Review 的额外要求见 `§13`——本步只列状态清单。

- 产出：并入 `page-structure.md`　判据：每个 P0 页面覆盖适用状态；Error 有下一步；AI 有过程、有依据、有人工确认　门禁：无

#### Step 3.4 视觉设计系统

确定视觉系统的**规则与阈值**（接口契约、对比度硬指标、视觉比例基线、密度一致性判据），并把取值落到原型自己的 Token 区（详见 `references/05`）。**具体取值不写在技能里**：需求方给了设计规范就用它（`init --tokens` / `set-tokens --tokens`），没有才用技能兜底基线 `assets/default-tokens.css`。高级感来源按"图标体系 > 板块细节 > 交互形式 > 色彩微调"优先级投入，禁止以换主题色回应"不够高级"类反馈。

- 产出：落进原型的 Token 区（不是独立文档）　判据：取值来源已定（需求方规范 or 兜底基线）；对比度 / 字号 / 密度阈值已定　门禁：无

### Step 4: 实现与验证

#### Step 4.1 实现

页面清单（`page-list.md`）是 `scaffold.mjs init` 的直接输入；**不必等 Step 3.2–3.4 全部结束**即可先落骨架，随后按细化结论逐页替换占位块填主体，并把 11 种状态写入对应页面；增删页面 / 图标一律走 `scaffold.mjs add-page` / `add-icon`，不手工编辑区域外内容。同步落 `<原型名>.flow.json`。

`scripts/scaffold.mjs` —— 原型骨架生成器。一次性产出 App Shell、设计 Token、图标 symbol 库、页面容器、路由与导航，并用 4 个区域标记（`@TOKENS` / `@ICONS` / `@NAV` / `@PAGES`）圈出可增长的部分；此后新增页面与图标走带守卫的定点插入（标记必须唯一命中，否则中止且不写盘）。**有了骨架就不存在千行级手工并行编辑的场景**——大文件编辑纪律因此从「要求照做」变成「工具保证」。脚手架只产骨架，页面主体（信息层级、状态覆盖、交互）一律留白，不替业务做决定。

```bash
node scripts/scaffold.mjs init --out=<原型.html> --title=… --app=… --pages="workbench:工作台:i-dashboard,order-list:订单列表:i-list" [--tokens=<需求方规范.css>]    # 不传则用技能兜底基线 assets/default-tokens.css
node scripts/scaffold.mjs add-page <原型.html> <page-id> --title=… [--icon=i-list] [--no-nav] [--after=<已有页面 id>]
node scripts/scaffold.mjs set-tokens <原型.html> [--tokens=<规范.css>]   # 中途拿到规范 / 换品牌时用
node scripts/scaffold.mjs add-icon <原型.html> <icon-id> (--builtin=<内置名> | --path="<SVG 子元素>")
node scripts/scaffold.mjs list <原型.html>   # 页面 / 导航 / 图标 / Token 对比度 / 区域标记总览
node scripts/scaffold.mjs icons              # 内置 20 个线性图标
```

> 两个脚本共享同一套页面机制约定——`<section id>` 页面容器、`data-goto` 跳转、`<symbol id="i-*">` 图标、`--text-*` Token 命名。**改动任一约定必须同步改两个脚本**，否则会出现「脚本全绿但规范已变」的假通过。完整契约表见 `references/05 §14.1`。
>
> **取值可整套替换，命名不可替换。** 换设计规范只换 Token 文件，命名契约不变——`scaffold.mjs` 会校验命名契约与覆盖率（模板用到的变量缺一个就失败），`verify.mjs` 则按同一契约查对比度。这样"规范全绿但什么都没查"的假通过无处发生。

#### Step 4.2 验证

跑全三层（静态 → 逐页冒烟 → 黄金流链路 + 三档分辨率）验证：

```bash
node scripts/verify.mjs <原型.html> --flow=<黄金流.json> --strict   # 退出码 0 才算过
node scripts/verify.mjs --print-flow-example                        # 取 --flow 的 JSON 模板
node scripts/verify.mjs --help                                      # 全部选项
```

| 退出码 | 含义 | 后续动作 |
|---|---|---|
| 0 | 三层全过 | 进入 Step 5 |
| 1 | 有 HARD 项 | **阻断**：修复后重跑，不得进入 Step 5 |
| 2 | 用法 / 参数错误 | 修正命令后重跑 |
| 3 | `--strict` 下必需层被跳过 | **按未完成计**，不得进入 Step 5 |

脚本报 WARN 的项需人工判断——**脚本全绿 ≠ 设计合格**，设计质量仍按 `§33` 审查（见评审技能的 `references/01-quality-criteria.md`）。

脚本只判可判定项（语法、标签配平、跳转与图标引用完整性、Token 对比度、字号底线、接口字符图标、演示数据去个人化、页面空壳、运行时 JS 错误、三档横向溢出、黄金流是否走通）。**设计是否专业、状态取舍是否恰当，脚本不表态。**

**规格与规则出处**：三层验证的完整规格见 `references/07 §27.1`（本步的脚本就是它的执行体）；三档分辨率的自适应规则与多分辨率验收矩阵见 `references/06 §25`（App Shell / 宽高自适应 / Dead Space / 表格图表 / 超宽屏），对比度与键盘基线见 `§26`——脚本报了分辨率类 WARN 时按 `§25` 判，不要凭感觉调。

推荐顺序：`scaffold init` → `verify --layer=1` 取静态基线（骨架应即刻全绿）→ 填页面主体 → `verify --flow=… --strict` 全三层 → 进入 **Step 5** 的交付阻塞点（是否进 `ship` 由用户选择，flow.md **R11** 制作链的收尾段）。

### Step 5: 自检（阻塞点）

输出《研发交接说明》（`handoff.md`）与需求追踪，即 6+1 交付物中归本环节的 4 份（原型 + `flow.json` + `page-structure.md` + `handoff.md`；另 4 份由 `blueprint` 产出）。

交接材料（供 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}ship` 派发评审时消费）：原型 `.html` + `<原型名>.flow.json` + 需求文档 + 蓝图产物 + `page-structure.md` + 设计规范（如有）。

**先做完文末「交付前人工复核」（12 条）再进阻塞点**——那是 `verify.mjs` 判不了的判断项；脚本能判的已在 Step 4.1 / 4.2 执行过，不重复。

- **能修的当场修掉**，改了原型就重跑 `verify --strict`
- **修不了或不该自行改的**（如与已确认蓝图有出入）标记 `WEB-DESIGN-CHANGE-XXX`，作为 ⚠️ 交给用户定夺——不得自行改写蓝图，也不得把 ⚠️ 藏起来只报「已复核完毕」

**是否进入交付是本环节的阻塞点**，不自动往下跑。按 `./policies/decision-point.md` 暂停并发起问答询问：

> 原型已制作完成并通过三层验证。定稿标识：任务 `<task_id>`｜原型 `<原型名>.html`｜`verify.mjs --strict` 退出码 0
>
> 本环节交付物：原型 `.html` / `<原型名>.flow.json` / `page-structure.md` / `handoff.md`（另 4 份蓝图产物由 `blueprint` 产出）
>
> **12 条人工复核结果**（判据见文末「交付前人工复核」，这里只给结论）：
> ✓ 按蓝图开工　✓ 黄金流闭环　✓ 页面划分一致　✓ P0 状态覆盖　✓ AI 结果五要素　✓ 命名一致　✓ 跨页统一　✓ 容器高度　✓ 交接信息　✓ 视觉升级落点　✓ 示例数据自洽　✓ 交付物形态
> ⚠️ `<逐条列出；没有就写「无」>`
>
> 是否进入交付环节（由 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}ship` 派发独立评审 → 你确认报告 → 归档 → 任务收尾）？
>
> - **A. 进入交付** —— 推进 `ship`，评审在独立上下文执行
> - **B. 我先自己看原型** —— 停在这里，等你给出下一步指令
> - **C. 还要改** —— 回到 Step 3 / 4 按你的意见修改，改完重新走本 Step

复核结论必须**逐条给出**（12 条一条不能少），不得只写「已复核完毕」——用户要能看见核了什么、结果怎样。
任一 ⚠️ 须写明是哪一条 + 一句话说明（有出入的还要带上变更单号）；没有就写「无」。

| 用户回复 | 判定 | 后续动作 |
|---|---|---|
| A /「可以交付」「归档吧」「走交付流程」 | 确认交付 | 推进 `ship` |
| B /「先看看」「等一下」 | **不算继续** | 停止等待，不推进、不写状态 |
| C / 提出具体修改意见 | 返工 | 按意见修改（→ 重跑 Step 4.2）后**重新执行本 Step** |
| 模糊回复 / 无回复 | **不算决策** | 再问一次，直到得到明确选择 |

**用户选择前不得推进 `ship`、不得写入交付状态**，也不得以「链还没走完」为由替用户决定。
评审结论为「不得交付」时回本环节修复（→ 重跑 Step 4.2 → 重新执行本 Step），**P0 未清零不得对外交接**。

### Step 6: 收尾

**仅在用户在 Step 5 选择 A（进入交付）后执行**——选 B / C 时不推进阶段、不写任何状态。

1. 推进 workflow 阶段至 ship，并更新 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml`

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind prototype --skill build --repo-root "$REPO_ROOT" --where-task-id "$task_id" --set phase=ship
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind prototype \
  --phase build --next-phase ship
```

未关闭的 `WEB-DESIGN-CHANGE-XXX` 与 Step 5 复核里的 ⚠️ 项随交接材料一并交给 `ship`，作为它派发评审时的取证输入

2. 输出阶段完成状态行：`[polaris-flow 原型] 交付原型 - 已完成构建，机器人工双自检评审，当前任务成功完成。`

3. 输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**）。
   先按「自动衔接下一阶段」一节运行 `state next`，**下一步的技能名与括注均取自其输出**
   —— `SKILL` 直填；括注按 `NEXT` 取（`manual` → 「建议新开会话」；`auto` → 「可同会话继续」）。**两者都不得写死**：

```text
[polaris-flow 原型] 原型交付 - 环节完成，状态已落盘。
下一步：/<SKILL>（建议新开会话 | 可同会话继续）。
恢复：先读 .polaris/tasks/<task_id>/state.yaml 的 work_dir，再核对该目录下的交付物、page-structure.md、flow.json 与 verify 最近一次退出码，从下一步技能的 Step 0 开始。
```

**本技能到此结束**——评审、归档与任务收尾都属于 `ship`，不在本环节代做。

##  退出条件

1. 归本环节的 4 份交付物**全部落盘**（不是只在对话里出现过）
2. `verify.mjs --strict` 退出码 0
3. 骨架与增删页面走的是 `scaffold.mjs`，未手工编辑区域标记外的内容
4. 蓝图缺口已全部标记 `WEB-DESIGN-CHANGE-XXX` 并写进 `handoff.md`，**未私自改写蓝图**
5. 已在 Step 5 的交付阻塞点发起询问并**等待用户选择**——选择前不推进 `ship`，也不得结束流程（评审结论不属本技能的退出条件）
6. 用户选择 A 后已执行 **Step 6** 的推进与收尾（`phase: ship` 与 `build.status: completed` 已落盘、阶段完成提示已输出），交接材料已交出（选 B / C 时本条不适用）

---

## 上下文压缩恢复

重载：原型路径、输出目录、已完成到哪个 Step、`page-structure.md` 是否落盘、`flow.json` 是否生成、
`verify` 最近一次退出码、未关闭的 `WEB-DESIGN-CHANGE-XXX`。

- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 **Step 3.x** → 按已落盘的最后一份文档续做
- 停在 **Step 4.1** → 从 `scaffold` / 页面主体续写；停在 **Step 4.2** → 从 `verify` 重跑；停在 **Step 5** → 补齐缺失交付物
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```

---

## 参考文件与工具（`00` 开工必读 · `04`–`07` 按需加载）

| 文件 | 内容 | 何时读 |
|---|---|---|
| **`references/00-basis.md`** | **必读基础**：`§一` 角色定位与方法论、`§二` 能力 / 决策边界、`§三` 核心原则与冻结规则、`§五` AI 交互专项、`§六` 视觉与布局红线、`§七` 研发交付与需求追踪、`§八` 一票否决高频 8 条、`§十一` 最终判断标准 | **开工第一步读全文**（`Step 2.2`）——不是按需参考 |
| `references/04-page-interaction-ai.md` | 页面结构方法（P0 页面 12 项 + 任务—信息—操作三层法）、11 种交互状态细则、AI 交互专项 | `Step 3.2` / `Step 3.3` |
| `references/05-visual-system-components.md` | 视觉设计系统全量（约 1000 行，**按下方路由分段读，不要整份加载**） | `Step 3.2` / `Step 3.4` / `Step 4.1` |
| `references/06-responsive-accessibility.md` | 三档自适应、App Shell、Dead Space 判断、多分辨率验收矩阵、对比度与键盘基线 | `Step 4.2`（报分辨率类 WARN 时） |
| `references/07-delivery-quality-review.md` | `§27.1` 三层验证规格、`§29` 研发交接、`§30` 需求追踪、`§32` 6+1 交付物（`§31` / `§33` / `§34` / `§36` 已上移，留编号壳 + 指针） | `Step 4.2` / `Step 5` |

**`references/05` 按需加载路由（约 1000 行，分段读，段间无依赖）**

| 段落 | 章节区间 | 内容 | 什么时候读 |
|---|---|---|---|
| 契约与阈值 | §14.1–14.3 | 接口契约（脚本与产出物的约定）、Token 取值来源与覆盖优先级、对比度硬指标 | **Step 3.4 一开工必读**；换设计规范 / 改 Token 时 |
| 比例与字体密度 | §14.4 + §15 | 企业级视觉比例基线、字体层级映射、字号底线、字重与行高、三种页面密度与同类一致性、1920×1080 可读性 | Step 3.2 定密度与容器高度策略；Step 3.4 定字号层级 |
| **命名与品牌** | §16.1 | 产品身份、Header 单一主名称、多层品牌、名称一致性、名称冲突处理、菜单命名去冗余 | **命名复核时必读**（`blueprint` 环节定 IA 与命名时也要用）——此处最易漏用，对应一票否决第 17 条 |
| 容器与内容感知布局 | §16.2–16.3 | Content Card / Workspace 高度策略与判断公式、内容感知三模式、看板规则、空置率与内部滚动门槛、首屏占用 | Step 3.2 定容器高度策略；Step 4.1 搭骨架、处理「大面积空白」类返工 |
| 组件规范 | §17–21 | 按钮、表格、表单、Dialog 与 Drawer、复杂交互组件 | Step 4.1 写到对应组件时**按需读**（要画表格就别加载整份） |
| 图表与动效 | §22–23 | 数据可视化规范、动效规范 | 只有该页面有图表 / 动效时才读 |
| 视觉质量与高级感 | §24 | 构图、首屏比例、一致性检查、页面级验收基线、避免项、高级感正确来源、升级方向自查 | Step 4.1 视觉收口；收到「不够高级 / 不够科技感」反馈时**必读** |

**样例与评测（自带，用于校准与回归）**

`example/` —— 完整链路样例：输入需求包（`requirement.md`）、6+1 交付物（`deliverables.md`）、成品原型（`prototype.html`）、黄金流（`flow.json`）。设计前可先读它对齐交付物形态；它的原型本身是回归样本：`node scripts/verify.mjs example/prototype.html --flow=example/flow.json --strict` 应退出码 0。

`evals/` —— 三个评测用例（能力基线 / 设计系统覆盖 / 一票否决）+ 零依赖评测器：`node evals/run.mjs --selftest`（参照物应 PASS、反例应 FAIL，证明断言有牙齿）、`--case=e1 --artifact=<原型.html>`（拿自己的产出跑能力基线）、`--case=e2`（自带夹具验证设计规范与三道守卫）。

**改动页面机制、Token 命名契约或脚本判定后，必须重跑 `--selftest`**——`example/` 与 `evals/` 是活的，改了规范不改它们，就等于把假通过留在仓库里。

---

## 交付前人工复核（脚本判不了的 12 条）

进入 Step 5 的交付阻塞点前逐条过一遍。**已由脚本与 Step 4 判过的不在这里重复**——三档分辨率与横向溢出、黄金流是否走通、`verify --strict` 退出码见 `Step 4.2`；骨架来源与定点插入、Token 取值来源与 `--tokens` 覆盖见 `Step 4.1`。**判据出处**：第（9）项的研发交接清单见 `references/07 §29`、需求追踪链见 `§30`，第（12）项的 6+1 交付物形态见 `references/07 §32`。

（1）是否按已确认的蓝图开工，而不是自己重新推一遍页面清单；
（2）原型是否走通蓝图里的黄金任务流，形成完整业务闭环；
（3）每个页面是否服务真实用户任务，页面划分是否与 `page-list.md` 一致（有出入的都已标记变更单）；
（4）每个 P0 页面是否覆盖 Loading / Empty / Error / AI Processing / 人工确认等状态，错误是否给出下一步；
（5）AI 结果是否有结论、事实、依据、建议和人工确认入口，失败是否有降级策略；
（6）Header 是否只有一个主系统名称，系统名称是否全站一致、未自创上级平台；
（7）字号、控件高度、间距、圆角、密度是否跨页面统一，1920×1080 下是否保持正式产品可读性；
（8）容器高度模式（Auto Content / Adaptive Data / Full Workspace）是否选对，有无大面积无效空白或无意义内部滚动；
（9）研发交接信息（字段、行为、状态、API、响应式规则）是否足以让研发直接实现，需求追踪链是否完整；
（10）若做过视觉升级：升级是否落在图标体系、板块细节、交互形式上，而不是只换了主题色；图标是否一套线性风格、无字符图标 / emoji 混入；
（11）示例数据是否自洽：同一单号跨页面状态一致、费用数字口径统一、Tab 计数与实际数据一致、动态内容（问候 / 日期）非硬编码；
（12）交付物形态是否对照 `example/deliverables.md` 校准过（6+1 交付物各自是否到位，而不是只有一份原型）；涉及页面机制、Token 命名契约或脚本判定的改动，是否已重跑 `evals --selftest` 并全绿（见上文「样例与评测」）。

完整五维质量审查清单见 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}review` → `references/01-quality-criteria.md` 的 `§33`。任一关键项缺失必须明确标记，不得假装设计已完成。
