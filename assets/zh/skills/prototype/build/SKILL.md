---
name: polaris{{SKN_SPR}}prototype{{SKN_SPR}}build
description: "当用户要求做原型时使用。用户要求：制作原型 / 画原型 / 生成原型 / 做个 HTML 原型 / 画一下页面 / 照蓝图（或已确认的原型思路、页面清单）做原型 / 把需求转成原型 / 要能点击演示 / 原型要能交研发。不触发：先出原型制作思路或梳理页面清单（走 polaris:prototype:blueprint）、评审已有原型能否交研发（走 polaris:prototype:review）、修改已有原型、只写 PRD 或需求文档、只做需求澄清与需求评审、只要低保真线稿或页面流程图（走 lofi-prototype）、只要技术方案 / 接口设计 / 数据库设计、只要视觉走查或设计规范文档、只要前端代码实现。"
version: 3.0.0
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

### Step 0: 设置产物语言

读取 `.polaris/config.yaml` 的 `language`（规范化 ID，如 `en`、`zh`）；未配置时回退到当前用户请求语言。本阶段所有提问与澄清摘要均采用该语言。

### Step 1: 状态检查及中断恢复

使用 SessionStart 注入的路径（本 skill 内此后一律复用 `$REPO_ROOT` / `$PLUGIN_ROOT`）：

- 环境变量 `$PLUGIN_ROOT` / `$REPO_ROOT`（Trae `env`、 Cursor `env`、Claude `CLAUDE_ENV_FILE`，或 Agent 上下文中的同名赋值）
- 仍无 `$PLUGIN_ROOT` → 按 H12 阻断，提示用户重启会话以触发 SessionStart

```bash
if [ -z "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/scripts/workflow-entry.sh" ]; then
  echo "PLUGIN_ROOT unset or hooks missing — restart session to run SessionStart" >&2
  exit 2
fi

ACTIVE_RESULT=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind requirement --skill build --repo-root "$REPO_ROOT")
ACTIVE_EXIT=$?
echo "ACTIVE_EXIT=$ACTIVE_EXIT ACTIVE_RESULT=$ACTIVE_RESULT"
```

**输出解读**（读 `ACTIVE_RESULT` JSON 数组，元素为 `task_id`）：

| `ACTIVE_EXIT` | 含义 | 后续动作 |
| ------------- | ---- | -------- |
| 0 且数组非空 | 存在未完结需求任务 | 按决策点协议询问 A/B/C/D（见下） |
| 0 且数组为空 | 无活跃需求任务 | 进入 Step 2 开启新任务 |
| 非 0 | 参数/环境错误 | 按 H12 阻断 |

存在活跃任务时，**必须**按 `./policies/decision-point.md` 暂停询问：

- **A. 续写最新一个**：`task_id` = 列表最后一项 → 进入 Step 1.5
- **B. 选择一个**：列出所有 `task_id` 候选让用户选择之后，再发出以下询问：

  > 当前选择任务 <task_id>，请确认以下操作：
  >
  > - **A. 续写当前任务**：进入 Step 1.5
  > - **B. 重新开始任务**：对当前 dir 执行下列命令后，进入 Step 2（重新产出需求组并建目录）
  >

  ```bash
  rm -rf "$REPO_ROOT/.polaris/tasks/$task_id"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind requirement --skill build --repo-root "$REPO_ROOT" --where-task-id "$task_id"
  ```
- **C. 丢弃所有**：对每个 id 执行下列命令后，进入 Step 2

```bash
for d in <ACTIVE_RESULT 列表>; do
  rm -rf "$REPO_ROOT/.polaris/tasks/$d"
  bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind requirement --skill build --repo-root "$REPO_ROOT" --where-task-id "$d"
done
```

- **D. 取消退出**：结束本 skill

#### Step 1.5：读取任务进展，继续执行任务

读取 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml` 拿**身份与指针**（`task_id` / `phase` / `name` / `work_dir`），
**进度按落盘产物判定**——`state.yaml` 不记「做到第几步」，避免两个状态源打架：

| 落盘产物状态 | 判定 | 进入步骤 |
|---|---|---|
| 无蓝图产物（`blueprint.md` / `page-list.md` 缺失或未确认） | 本环节**不能开工** | **阻断**：提示先执行 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint`（flow.md R11）并完成人工确认 |
| 有蓝图、无 `page-structure.md` | 设计细化未开始 | 进入 **Step 3.1** |
| 有 `page-structure.md`、无原型 `.html` | 细化已完、未搭骨架 | 进入 **Step 4.1**（`scaffold init`） |
| 有原型、无 `flow.json` 或 `verify` 未跑过 | 骨架已落、未验证 | 进入 **Step 4.2** |
| 原型 + `flow.json` + `handoff.md` 齐备 | 已交接 | 提示本环节已完成；交付门禁由 flow.md **R13 评审**把关 |
| 无法判定 | — | 按 `./policies/decision-point.md` 询问用户从哪个步骤继续 |

**命名标识补齐**（续写既有任务时先查 `state.yaml` 的 `naming` 块）：

| `naming` 状态 | 后续动作 |
|---|---|
| 缺失 / `status: pending` | 补走 **Step 2.1** 确认中文名与编号前缀后，再进入对应步骤继续 |
| `status: confirmed` | 直接沿用，后续步骤的编号与文档名一律以该前缀为准 |

### Step 2: 初始化

#### Step 2.1: 命名

确认原型中文名与 Page ID 前缀，写回 `state.yaml` 的 `naming` 块（`status: confirmed`）。
后续所有页面 id、文件名、Header 主名称一律以该前缀为准——**已确认的名称不得改写**，冲突时标记 `WEB-DESIGN-CHANGE-XXX` 回报。

#### Step 2.2: 校验蓝图已确认（硬门禁）

在 `work_dir`（或 `blueprint` 环节的产物目录）里读取 `blueprint.md` 与 `page-list.md`：

| 情况 | 处理 |
|---|---|
| 两份齐备且 `blueprint.md` 有确认记录 | 通过，进入 Step 2.3 |
| 有文件但**无确认记录**（草稿） | **阻断**：提示走 `blueprint` 完成人工确认；不得拿草稿当依据开工 |
| 文件缺失 | **阻断**：提示先执行 flow.md **R11** |

**蓝图确认后即冻结**：本环节发现范围、页面职责、任务流的缺口时，只标记 `WEB-DESIGN-CHANGE-XXX` 并在 `handoff.md` 里列出，
**不得直接改写蓝图产物**——改蓝图等于绕过需求方已经做过的确认。

#### Step 2.3: 加载必读信息

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

每个 P0 页面定义 12 项（Page ID、名称、角色、目标、进入条件、看到什么、做什么、页面区域、离开方式、业务状态、响应式行为、密度模式与容器高度策略）。每页先用"任务—信息—操作"三层法自查，不支持其一的区域审查必要性。其中**密度模式见 `references/05 §15.5`**，**容器高度策略与内容感知布局（Auto Content / Adaptive Data / Full Workspace）见 `§16.2–16.3`**——这两段在结构阶段就要定，等写完页面再补就是大面积空白类返工。

- 产出：`page-structure.md`　判据：12 项无缺项；密度模式与容器高度策略已选定（不是留到写页面时再说）　门禁：无

#### Step 3.3 交互与状态设计

高质量原型不能只有"正常页面"。每个 P0 页面至少考虑 11 种状态：**Initial、Loading、AI Processing（显示"正在解析→检索→分析→生成"而非只转圈）、Skeleton、Empty、Success、Partial Success、Error（必须给出下一步：重试/修改/重新上传/转人工）、Human Review、No Permission、Disabled**。

- 产出：并入 `page-structure.md`　判据：每个 P0 页面覆盖适用状态；Error 有下一步；AI 有过程、有依据、有人工确认　门禁：无

#### Step 3.4 视觉设计系统

确定视觉系统的**规则与阈值**（接口契约、对比度硬指标、视觉比例基线、密度一致性判据），并把取值落到原型自己的 Token 区（详见 `references/05`）。**具体取值不写在技能里**：需求方给了设计规范就用它（`init --tokens` / `set-tokens --tokens`），没有才用技能兜底基线 `assets/default-tokens.css`。高级感来源按"图标体系 > 板块细节 > 交互形式 > 色彩微调"优先级投入，禁止以换主题色回应"不够高级"类反馈。

- 产出：落进原型的 Token 区（不是独立文档）　判据：取值来源已定（需求方规范 or 兜底基线）；对比度 / 字号 / 密度阈值已定　门禁：无

### Step 4: 实现与验证

#### Step 4.1 实现

页面清单（`page-list.md`）是 `scaffold.mjs init` 的直接输入；**不必等 Step 3.2–3.4 全部结束**即可先落骨架，随后按细化结论逐页替换占位块填主体，并把 11 种状态写入对应页面；增删页面 / 图标一律走 `scaffold.mjs add-page` / `add-icon`，不手工编辑区域外内容。同步落 `<原型名>.flow.json`。

#### Step 4.2 验证

跑全三层（静态 → 逐页冒烟 → 黄金流链路 + 三档分辨率）验证：

```bash
node scripts/verify.mjs <原型.html> --flow=<黄金流.json> --strict
```

| 退出码 | 含义 | 后续动作 |
|---|---|---|
| 0 | 三层全过 | 进入 Step 5 |
| 1 | 有 HARD 项 | **阻断**：修复后重跑，不得进入 Step 5 |
| 2 | 用法 / 参数错误 | 修正命令后重跑 |
| 3 | `--strict` 下必需层被跳过 | **按未完成计**，不得进入 Step 5 |

脚本报 WARN 的项需人工判断——**脚本全绿 ≠ 设计合格**，设计质量仍按 `§33` 审查（见评审技能的 `references/01-quality-criteria.md`）。

### Step 5: 交付

输出《研发交接说明》（`handoff.md`）与需求追踪，即 6+1 交付物中归本环节的 4 份（原型 + `flow.json` + `page-structure.md` + `handoff.md`；另 4 份由 `blueprint` 产出）。

交接材料（供 flow.md **R13 评审**消费）：原型 `.html` + `<原型名>.flow.json` + 需求文档 + 蓝图产物 + `page-structure.md` + 设计规范（如有）。

**交付门禁不在本技能内**：评审由 `flow.md` 在 R13 调用 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}review` 执行，
结论为「不得交付」时回本环节修复（→ 重跑 Step 4.2 → 重评审），**P0 未清零不得对外交接**。

##  退出条件

1. 归本环节的 4 份交付物**全部落盘**（不是只在对话里出现过）
2. `verify.mjs --strict` 退出码 0
3. 骨架与增删页面走的是 `scaffold.mjs`，未手工编辑区域标记外的内容
4. 蓝图缺口已全部标记 `WEB-DESIGN-CHANGE-XXX` 并写进 `handoff.md`，**未私自改写蓝图**
5. 交接材料已备齐并移交 flow.md **R13**（评审结论不属本技能的退出条件）

### 上下文压缩恢复

重载：原型路径、输出目录、已完成到哪个 Step、`page-structure.md` 是否落盘、`flow.json` 是否生成、`verify` 最近一次退出码、未关闭的 `WEB-DESIGN-CHANGE-XXX`。

- **恢复依据就是落盘的产出物**——`state.yaml` 只存身份与指针，不存进度，产物即状态
- 停在 Step 3.x → 按已落盘的最后一份文档续做
- 停在 Step 4.1 → 从 `scaffold` / 页面主体续写；停在 Step 4.2 → 从 `verify` 重跑；停在 Step 5 → 补齐缺失交付物

---

## 附录 A、参考文件与工具（`00` 开工必读 · `01`–`07` 按需加载）

| 文件 | 内容 | 何时读 |
|---|---|---|
| **`references/00-basis.md`** | **必读基础**：`§一` 角色定位与方法论、`§二` 能力 / 决策边界、`§三` 核心原则与冻结规则、`§五` AI 交互专项、`§六` 视觉与布局红线、`§七` 研发交付与需求追踪、`§八` 一票否决高频 8 条、`§十一` 最终判断标准 | **开工第一步读全文**（见 `Step 2.3`）——不是按需参考 |
| `references/01-methodology-roles.md` | 编号壳：第 2—3 章已上移至 `references/00-basis.md §一`（五种角色）与 `§三`（第一原则） | 无需加载——内容在 `00-basis.md` |
| `references/04-page-interaction-ai.md` | 第 11—13 章：P0 页面 12 项定义、任务—信息—操作三层法、11 种交互状态细则、键盘轻交互基线、AI 交互专项 6 节、AI 工作台视觉组织、AI 对话式交互体验专项 | 定义页面结构、设计交互状态、设计 AI/Agent 页面或对话式助手时**必读** |
| `references/05-visual-system-components.md` | 第 14—24 章：视觉设计系统全量（**按时机分 7 段**，见下表） | **不要整份加载**——按下方「按需加载路由」选段读 |
| `references/06-responsive-accessibility.md` | 第 25—26 章：五类自适应目标、三档桌面基线、App Shell、宽度/高度自适应、Dead Space 判断、表格/图表/Drawer/Dialog 自适应、超宽屏控制、禁止截图式布局、多分辨率验收矩阵、对比度/键盘基线、新 CSS 兼容门槛 | 实现响应式布局、做多分辨率验收时**必读** |
| `references/07-delivery-quality-review.md` | 第 27—32、35—37 章：HTML 原型输出要求、运行时验证三层法（`§27.1`）、大文件编辑纪律、演示数据去个人化、技术栈、研发交接清单、需求追踪、6+1 交付物、标准调用方式（建造 5 种）、最终判断标准、核心公式。**`§33` 质量审查清单与 `§34` 一票否决已上移至评审技能，`§31` 决策边界已上移至 `references/00-basis.md §二`**（本文档保留编号壳 + 指针） | 交付前自检、研发交接、对外演示前**必读** |

> `references/02` 已于 2026-09-15 **迁至 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint`**（接收原始需求、承接上游方案属蓝图环节）；
> `references/03` 已于 2026-09-14 **并入正文并废弃**，其原第 6—10 章的做法现分属两处：需求理解 / 黄金流 / IA / 页面清单归 `blueprint`，
> 页面模式归本技能 `Step 3.1`。两个编号均不再复用，`04`–`07` 沿用原号不重排。

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

> 本表是「什么时候读哪一段」的**唯一定义处**——`references/05` 文件头只有章节地图（段落在哪），不重复时机；
> 改触发时机只改本表。定位方式：章节号沿用原书编号（第 14—24 章，不连续），先按标题检索拿行号
> （如搜 `^# 24. ` / `^## 16.1 `），再用 `Read` 的 offset / limit 读该段。行数会随编辑漂移，标题不会。

**可执行脚本（两个，配套使用，零外部依赖）**

`scripts/verify.mjs` —— §27.1 三层验证的可执行实现（静态检查 / 无头浏览器逐页冒烟 / 黄金流链路 + 三档分辨率实测）。交付前必须运行并全绿。

```bash
node scripts/verify.mjs <原型.html> --flow=<黄金流.json>    # 退出码 0 才算过
node scripts/verify.mjs --print-flow-example                # 取 --flow 的 JSON 模板
node scripts/verify.mjs --help                              # 全部选项
```

`scripts/scaffold.mjs` —— 原型骨架生成器。一次性产出 App Shell、设计 Token、图标 symbol 库、页面容器、路由与导航，并用 4 个区域标记（`@TOKENS` / `@ICONS` / `@NAV` / `@PAGES`）圈出可增长的部分；此后新增页面与图标走带守卫的定点插入（标记必须唯一命中，否则中止且不写盘）。**§27.2 的大文件编辑纪律因此从「要求模型照做」变成「工具保证」**——有了骨架就不存在千行级手工并行编辑的场景。脚手架只产骨架，页面主体（信息层级、状态覆盖、交互）一律留白，不替业务做决定。

```bash
node scripts/scaffold.mjs init --out=<原型.html> --title=… --app=… --pages="workbench:工作台:i-dashboard,order-list:订单列表:i-list" \
                                  [--tokens=<需求方规范.css>]    # 不传则用技能兜底基线 assets/default-tokens.css
node scripts/scaffold.mjs add-page <原型.html> <page-id> --title=… [--icon=i-list] [--no-nav] [--after=<已有页面 id>]
node scripts/scaffold.mjs set-tokens <原型.html> [--tokens=<规范.css>]   # 中途拿到规范 / 换品牌时用
node scripts/scaffold.mjs add-icon <原型.html> <icon-id> (--builtin=<内置名> | --path="<SVG 子元素>")
node scripts/scaffold.mjs list <原型.html>   # 页面 / 导航 / 图标 / Token 对比度 / 区域标记总览
node scripts/scaffold.mjs icons              # 内置 20 个线性图标
```

推荐顺序：`scaffold init` → `verify --layer=1` 取静态基线（骨架应即刻全绿）→ 填页面主体 → `verify --flow=… --strict` 全三层 → 移交评审（flow.md **R13**）。

**样例与评测（自带，用于校准与回归）**

`example/` —— 一份走完整条链路的完整样例：输入需求包（`requirement.md`）、6+1 交付物（`deliverables.md`）、
成品原型（`prototype.html`）、黄金流定义（`flow.json`）。设计前可先读它对齐交付物形态；
它的原型本身就是回归样本：`node scripts/verify.mjs example/prototype.html --flow=example/flow.json --strict` 应退出码 0。

`evals/` —— 三个评测用例（能力基线 / 设计系统覆盖 / 一票否决）+ 零依赖评测器：

```bash
node evals/run.mjs --selftest                        # 参照物应 PASS、反例应 FAIL（证明断言有牙齿）
node evals/run.mjs --case=e1 --artifact=<原型.html>   # 拿自己的产出跑能力基线
node evals/run.mjs --case=e2                         # 自带夹具，验证设计规范覆盖与三道守卫
```

**改动页面机制、Token 命名契约或脚本判定后，必须重跑 `--selftest`**，否则会出现「脚本全绿但规范已变」的假通过。

脚本只判可判定项（语法、标签配平、跳转与图标引用完整性、Token 对比度、字号底线、接口字符图标、演示数据去个人化、页面空壳、运行时 JS 错误、三档横向溢出、黄金流是否走通）。**设计是否专业、状态取舍是否恰当，脚本不表态**，仍须人工按 `§33` 审查（见评审技能的 `references/01-quality-criteria.md`）。

> 两个脚本共享同一套页面机制约定——`<section id>` 页面容器、`data-goto` 跳转、`<symbol id="i-*">` 图标、`--text-*` Token 命名。**改动任一约定必须同步改两个脚本**，否则会出现「脚本全绿但规范已变」的假通过。完整契约表见 `references/05 §14.1`。
>
> **取值可整套替换，命名不可替换。** 换设计规范只换 Token 文件，命名契约不变——`scaffold.mjs` 会校验命名契约与覆盖率（模板用到的变量缺一个就失败），`verify.mjs` 则按同一契约查对比度。这样"规范全绿但什么都没查"的假通过无处发生。

---

## 附录 B、交付前自检（先跑这 16 条）

（1）是否按已确认的蓝图开工，而不是自己重新推一遍页面清单；
（2）原型是否走通蓝图里的黄金任务流，形成完整业务闭环；
（3）每个页面是否服务真实用户任务，页面划分是否与 `page-list.md` 一致（有出入的都已标记变更单）；
（4）每个 P0 页面是否覆盖 Loading / Empty / Error / AI Processing / 人工确认等状态，错误是否给出下一步；
（5）AI 结果是否有结论、事实、依据、建议和人工确认入口，失败是否有降级策略；
（6）Header 是否只有一个主系统名称，系统名称是否全站一致、未自创上级平台；
（7）字号、控件高度、间距、圆角、密度是否跨页面统一，1920×1080 下是否保持正式产品可读性；
（8）容器高度模式（Auto Content / Adaptive Data / Full Workspace）是否选对，有无大面积无效空白或无意义内部滚动；
（9）1366×768 / 1440×900 / 1920×1080 三档下核心任务是否都可完成，无横向异常溢出；
（10）研发交接信息（字段、行为、状态、API、响应式规则）是否足以让研发直接实现，需求追踪链是否完整；
（11）若做过视觉升级：升级是否落在图标体系、板块细节、交互形式上，而不是只换了主题色；图标是否一套线性风格、无字符图标/emoji 混入；
（12）示例数据是否自洽：同一单号跨页面状态一致、费用数字口径统一、Tab 计数与实际数据一致、动态内容（问候/日期）非硬编码；
（13）原型骨架是否由 `scripts/scaffold.mjs` 生成（而非手写整份大文件后再做破坏性编辑）；页面与图标的新增是否走 `add-page` / `add-icon` 的定点插入；
（14）Token 取值是否来自正确的来源：需求方提供了设计系统 / 视觉规范时，是否已用它覆盖（`--tokens`），而不是留着技能兜底基线？换过规范后是否重跑了 verify（对比度阈值与取值来源无关，换规范后仍须 ≥4.5:1）；
（15）是否已运行 `node scripts/verify.mjs <原型.html> --flow=<黄金流.json> --strict` 且退出码为 0：静态检查 → 无头浏览器逐页冒烟（多入口、零运行时错误）→ 黄金流链路 + 三档分辨率实测（规格见 references/07 §27.1，脚本是其执行体）。退出码非 0 不得交付；脚本报 WARN 的项需人工判断；演示数据去个人化已并入脚本（L1-15），无需另行人工扫描。**脚本过了只说明 Step 4.2 完成——交付门禁是 flow.md R13 的评审结论，不是脚本退出码**。

（16）交付物形态是否对照 `example/deliverables.md` 校准过（6+1 交付物各自是否到位，而不是只有一份原型）；若本次改动涉及页面机制、Token 命名契约或脚本判定，是否已重跑 `node evals/run.mjs --selftest` 并全绿——`example/` 与 `evals/` 是活的，改了规范不改它们，就等于把假通过留在仓库里。

完整五维质量审查清单见 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}review` → `references/01-quality-criteria.md` 的 `§33`。任一关键项缺失必须明确标记，不得假装设计已完成。
