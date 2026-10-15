---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}design
description: "把 plan 阶段的高层 design.md 深化为可实施的详细技术设计（detailed-design.md）并完成评审。当用户要求深化设计、细化技术方案、产出详细设计文档时使用。不要用于：生成高层方案（走 plan）、拆实施任务（走 tasks）、写代码（走 build）。"
---

# Polaris 工作流 - 阶段：深度设计（design）

<HARD-GATE>
本 skill **仅**负责把 plan 阶段的高层 `design.md` **深化**为 `openspec/changes/<task_id>/detailed-design.md`。

- **禁止**跳过 Superpowers `brainstorming`（不可用则阻断，禁止用普通对话替代）
- **禁止**跳过专项设计补充预检（`./policies/detailed-design-precheck.md`）：`detailed-design.md` 落盘后必须基于 proposal / design / detailed-design 给出专项建议，并经 decision-point 确认
- **禁止**未按 `./policies/decision-point.md` 获得用户对设计方案的明确确认，就落盘 `detailed-design.md`
- **禁止**重写 OpenSpec `proposal.md` / 高层 `design.md` / `tasks.md` 的结构或范围（深化 ≠ 替代）
- **禁止**在 Design Doc 中再造第二份需求 spec；缺口只能以 **Spec Patch** 回写 `openspec/changes/<task_id>/specs/*/spec.md`（仅限补充验收场景、修正歧义、添加边界条件）
- **禁止**跳过 Step 5 主审：必须派发 `design-review-agent`（评审逻辑在 agent 内，禁止在本 skill 内联重写或主代理自审冒充）
- **禁止**跳过 Step 5 Outside Voice **询问**（按 `.polaris/policies/outside-voice.md`；用户可选跳过 OV，但不得由 AI 代决）
- **禁止**在本阶段创建实施计划 / 调用 `writing-plans` / 进入 `/opsx:apply`（实施计划是 `tasks` 阶段；写代码是 `build` 阶段）
- **禁止**把本 skill 当成 tasks 主审：不派 `tasks-review-agent`、不写 `tasks-review-report.md`
- **禁止**将专项设计写成 `design.md` 或放入任何子目录；专项必须为变更根目录下的 `<slug>-design.md`
- **禁止**把设计/评审产物写回 `.polaris/tasks/`（运行态 `state.yaml` 除外）
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]设计 - 进入深度设计阶段: 使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}design 技能。`

## 标识约定

- **`task_id`**：与 specify finalize / plan 同值
- 任务目录（运行态）：`.polaris/tasks/<task_id>/state.yaml`
- 意图（只读）：`openspec/changes/<task_id>/intention.md`（plan 已迁入）
- 深度设计产物：`openspec/changes/<task_id>/detailed-design.md`
- 专项设计（可选，扁平）：`openspec/changes/<task_id>/<slug>-design.md`
- 设计主审报告：`openspec/changes/<task_id>/reviews/design-review-report.md`（由 Step 5 落盘）
- Outside Voice 报告（若运行）：`openspec/changes/<task_id>/reviews/openspec-review-report.md`
- 澄清检查点：`openspec/changes/<task_id>/brainstorm-summary.md`
- OpenSpec 四件套：`openspec/changes/<task_id>/`
- workflow 游标：`.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.sh`）

> **职责边界**：plan 的 `design.md` = 高层方案框架；本阶段 `detailed-design.md` = 深度技术细化。深化，不替代。  
> **专项命名**：禁止叫 `design.md`；例：领域模型 → `domain-model-design.md`。不建 `design/` 子目录。

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：设置产物语言

**执行**：`LANG=$(bash "$PLUGIN_ROOT/scripts/get-language-name.sh")`（输出语言显示名，如 `中文` / `English`）；退出码 `≠ 0` 时回退到当前用户请求语言。

本阶段均以 `$LANG` 为主语言。

### Step 1：接收 `intake` 交接

**前置**：根据交接中是否存在 `task_id`（由 `intake` 的 Step 4 给出；阶段出口的自动衔接同样会带），做以下操作：

| 情形 | 动作 |
| ---- | ---- |
| 有 | **采纳**；`worktree_path` 一并取（空 = 主仓；非空 ⇒ 后续读产物 / 跑命令一律以该 worktree 为仓库根）。中断续跑时按文末「上下文压缩恢复」表定位断点 |
| 没有 | **阻断**：告知「本技能须经 `intake` 进入，请从入口技能（`tweak` / `normal` / `strict`）重新开始」。|

**入口校验**（失败 → 阻断）：

| 检查 | 条件 |
| ---- | ---- |
| 四件套存在 | `openspec/changes/<task_id>/` 下 `proposal.md`、`design.md`、`tasks.md` 非空，且 `specs/` 含至少一个非空文件 |
| 提案评审 | 若存在 `reviews/plan-review-report.md` 且 Verdict=`BLOCK` / 未消化 Critical → 阻断，回 plan |
| 尚未锁定 | 若 `runtime.design.status=completed` 且 `detailed-design.md` 已存在 → 询问 A 续写修订 / B 退出（禁止静默覆盖） |

通过后更新 `state.yaml`：`phase: design`，`runtime.design.status: in_progress`。

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" enter-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase design
```
输出：`[polaris-flow 开发]设计: task_id=<task_id> ; phase=design`

### Step 2：读取上游事实源

- `openspec/changes/<task_id>/proposal.md`
- `openspec/changes/<task_id>/design.md`
- `openspec/changes/<task_id>/tasks.md`
- `openspec/changes/<task_id>/specs/*/spec.md`
- 若存在：`openspec/changes/<task_id>/intention.md`（只读）

### Step 3：Brainstorming（带上下文）

#### 3.1 加载 Superpowers `brainstorming`

**立即执行：** 使用 Skill 工具加载 Superpowers `brainstorming`。禁止跳过。

ARGUMENTS 必须含 `Language: $LANG`（Step 0 已设）。

加载后上下文：

```text
Change: <task_id>
OpenSpec Context: openspec/changes/<task_id>/*.md

基于 OpenSpec 做深度技术设计（实现方案、技术风险、测试策略、边界条件）。
不清楚则继续提问，不得一轮问答就落盘。
不要重写 proposal / 高层 design.md；缺口仅 Spec Patch 回写 specs。
```

技能不可用 → 停止并提示安装。对话产出方案，**不**落盘 Design Doc。

#### 3.2 增量更新 `brainstorm-summary.md`

路径：`openspec/changes/<task_id>/brainstorm-summary.md`  
未确认内容标「待确认」/「候选」。非 Design Doc，不替代 Step 4 的 detailed-design.md 落盘。

#### 3.3 用户确认设计方案（阻塞点）

按 `./policies/decision-point.md` 暂停，展示技术方案 / 取舍风险 / 测试策略 / Spec Patch（如有）。确认前禁止落盘 `detailed-design.md`。确认 → Step 4；调整 → 回 3.1。

### Step 4：落盘深度设计

#### 4.1 写入 `detailed-design.md`

路径：`openspec/changes/<task_id>/detailed-design.md`

```yaml
---
change: <task_id>
role: technical-design
canonical_spec: openspec
---
```

正文至少含：实现方案、技术风险、测试策略、边界条件、Spec Patch 清单（无则写「无」）。  
有 Spec Patch 则同时改 `specs/*/spec.md`。  
输出：`[polaris-flow 开发]深度设计: wrote openspec/changes/<task_id>/detailed-design.md`

#### 4.2 专项设计补充预检 + 落盘（阻塞点）

**前置**：Step 4.1 的 `detailed-design.md` 已成功落盘。

`read_file ./policies/detailed-design-precheck.md` 并按其执行：

1. 对照 proposal / 高层 `design.md` / `detailed-design.md`，判断是否需补充专项、建议哪些、各自范围内外
2. 按 policy §4 输出预检结论与建议专项清单
3. 按 policy §5 + `./policies/decision-point.md` **阻塞等待**：将推荐项的「范围内/范围外」逐条呈现给用户多选（强烈建议/建议默认勾选；可选默认不勾）；也可选「不补充」或「自定义」

- 用户确认清单为空或不补充 → 跳过专项落盘，进 4.3
- 清单非空 → 按用户勾选的文件名与范围内外写入变更**根目录**（扁平，禁止子目录），模板见 policy §3

| 专项（预检推荐名）| 生成策略 | 文件名 |
|----------------|-----------------|-------------------|
| 领域 / 领域模型 | `./policies/design-domain-model-policy.md` | `domain-model-design.md` |
| 仓储服务 | `./policies/design-repository-policy.md` | `repository-design.md` |
| 数据模型 | `./policies/design-data-model-policy.md` | `data-model-design.md` |
| Rest API | `./policies/design-restful-api-policy.md` | `restful-api-design.md` |
| 其他 | - |用户确认英文 kebab `slug` → `<slug>-design.md` |

**禁止**：文件名 `design.md`（与四件套冲突）；写入 `design/` 或任何子目录；在 4.1 完成前跑本预检；确认后再发明另一套专项菜单。

#### 4.3 主动式上下文压缩
若配置 `context-compression: beta`，且在 **`detailed-design.md`、专项设计（若有）、状态证据均已成功持久化落盘后** 考虑主动式压缩。这样压缩后可从文件恢复，不会丢失尚未写入的设计判断。

- 上下文窗口确有压力且存在可调用的原生压缩机制时触发一次，并按 `./policies/auto-transition.md` 的**层级 A 提示语模板**给出落盘产物与恢复点（`task_id`、Step 4 完成、`detailed-design.md` / `*-design.md`（若有）/ `brainstorm-summary.md` / OpenSpec 四件套）。然后进入 Step 5。
- 压缩只能由用户手动触发时，给出一次非阻塞建议并继续；**不得阻塞**、不得额外制造确认点
- **不得**用 shell 命令或摘要伪造压缩 —— 「压缩上下文」与「新开会话」两词、两个提示语模板均以 `./policies/auto-transition.md` 的「压缩时机与恢复清单」为唯一来源

### Step 5：设计评审（阻塞点）

本步派发主审 subagent，再按 Outside Voice 协议询问是否交叉评审；禁止在本 skill 内联重写评审标准。

#### 5.1 主审 — `design-review-agent`

1. **能力**：读 SessionStart 注入（`SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION`；清单见 `$SUBAGENT_PROBE_CACHE`）。
   - `PLATFORM_DEGRADATION=inline|unsupported` → 标注跳过并 decision-point：A 接受跳过进 Step 6 / B 阻断。不得 inline 假评审。**不派发 → 不涉及 probe**。
   - `SUPPORTS_SUBAGENT=true` → **仍须 probe（H10）**：调用 `polaris{{SKN_SPR}}subagent-probe`（传 `platform`），随后派发固定 `design-review-agent`。
   - **缺注入** → 调用 `polaris{{SKN_SPR}}subagent-probe`（传入 `platform`；优先读 `$SUBAGENT_PROBE_CACHE`）。`inline` / `unsupported` → 同上 decision-point。
2. **派发**：注册名 / `subagent_type` = `design-review-agent`（init 已装到 `.<platform>/agents/`）。文件缺失 → 阻断，提示先 `polaris-flow init/update`。

   调用 `use_skill("polaris{{SKN_SPR}}subagent-dispatch")` 执行派发（D-0 工具判定 → D-1 路径引用型 / D-2 内容注入型，见该技能 `references/dispatch-execute.md`）。传入 `platform`、`agent`（probe 结果中 `id=design-review-agent` 的项）、`task_spec`：

   - `task_type`: `doc_review`
   - `task_description`: 对 detailed-design 与各专项设计做独立评审；评审标准在 `design-review-agent` 定义内（frontmatter 已载入）。
   - `materials`（按以下顺序构造）：
     1. `openspec/changes/<task_id>/detailed-design.md`（必审）
     2. `openspec/changes/<task_id>/*-design.md`（有则必审的专项；排除四件套 `design.md`）
     3. `openspec/changes/<task_id>/design.md`（对照只读）
     4. `openspec/changes/<task_id>/proposal.md`（对照只读）
     5. `openspec/changes/<task_id>/specs/**/*.md`（对照只读，每个非空文件）
     6. `openspec/changes/<task_id>/tasks.md`（对照只读）
     7. 若有：`openspec/changes/<task_id>/intention.md`
   - `constraints`:
     - `output_path: openspec/changes/<task_id>/reviews/design-review-report.md`（报告写入该文件后只回报路径）
     - 只评审，**禁止**修改任何文件
   - `language`: 跟随主会话语言

3. **落盘**：确保 `openspec/changes/<task_id>/reviews/` 存在；将完整 **Design Review Report** 写入 `openspec/changes/<task_id>/reviews/design-review-report.md`。

#### 5.2 Outside Voice（询问后可选）

主审已落盘（未因无 subagent 整步跳过）后：

1. `read_file` `./policies/outside-voice.md` 并按其执行。
2. 按复杂度给出建议，decision-point：**A 启动** / **B 跳过**（AI 不得代决）。
3. 用户选 A → 填充 `./templates/outside-voice-prompt.tmpl.md`，派发 `openspec-review-agent`。

   调用 `use_skill("polaris{{SKN_SPR}}subagent-dispatch")` 执行派发（D-0 判定 → D-1 路径引用型 / D-2 内容注入型，见该技能 `references/dispatch-execute.md`）。传入 `platform`、`agent`（probe 结果中 `id=openspec-review-agent` 的项）、`task_spec`：

   - `task_type`: `doc_review`
   - `task_description`: 填充后的 `./templates/outside-voice-prompt.tmpl.md`（`Change` / `Stage` / `PrimaryReport` + 主审 findings 摘录；摘录从刚落盘的 `design-review-report.md` 提取，**不含**用户对 findings 的采纳决策）
   - `materials`:
     1. `openspec/changes/<task_id>/detailed-design.md`
     2. `openspec/changes/<task_id>/*-design.md`（有则列，排除四件套 `design.md`）
     3. `openspec/changes/<task_id>/proposal.md`
     4. `openspec/changes/<task_id>/design.md`
     5. `openspec/changes/<task_id>/specs/**/*.md`（每个非空文件）
     6. `openspec/changes/<task_id>/tasks.md`
   - `constraints`:
     - `output_path: openspec/changes/<task_id>/reviews/openspec-review-report.md`（报告写入该文件后只回报路径）
     - 只评审，**禁止**修改任何文件；挑战标准在 `openspec-review-agent` 定义内（frontmatter 已载入）
   - `language`: 跟随主会话语言

4. 通过可信度门禁后写入 `openspec/changes/<task_id>/reviews/openspec-review-report.md`；失败则标注 OV 作废并告知用户。
5. 宿主无 subagent → 按协议自动跳过 OV 并标注（主审已在 5.1 处理）。

#### 5.3 消化

1. 主审 `Verdict`：`BLOCK` / 未消化 Critical → 不得完成；`APPROVE_WITH_CONCERNS` → decision-point 确认或修订。
2. 若有 OV：与主审 tension / P0/P1 按 outside-voice 用户主权逐条决策；**禁止**自动改设计。
3. 修订 `detailed-design.md` / 专项后 → 重跑 5.1（最多 3 轮）；主审重跑后再询 OV。

### Step 6：完成 design 阶段

更新 `state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding --phase design --next-phase tasks
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind coding \
  --set runtime.design.path=openspec/changes/<task_id>/detailed-design.md \
  --set runtime.design.review_report=openspec/changes/<task_id>/reviews/design-review-report.md \
  --set "runtime.design.outside_voice=<ran|skipped:<reason>|not_run:<reason>>" \
  --set runtime.design.outside_voice_report=openspec/changes/<task_id>/reviews/openspec-review-report.md
```

输出：`[polaris-flow 开发]深度设计 - 阶段完成：openspec/changes/<task_id>/detailed-design.md 已锁定。`

输出阶段完成提示（按 `./policies/auto-transition.md` 的**层级 C 模板**）。
先按「自动衔接下一阶段」一节运行 `state next`，**下一步的技能名与括注均取自其输出**
—— `SKILL` 直填；括注按 `NEXT` 取（`manual` → 「建议新开会话」；`auto` → 「可同会话继续」）。**两者都不得写死**：

```text
[polaris-flow 开发]深度设计 - 阶段完成，状态已落盘。
下一步：<SKILL> 阶段（建议新开会话 | 可同会话继续）。
恢复：先读 openspec/changes/<task_id>/detailed-design.md、reviews/design-review-report.md 与 reviews/openspec-review-report.md（若有），再从下一步技能的 Step 0 开始。
```

## 退出条件

- `detailed-design.md` 已落盘且 frontmatter 合法
- Step 3.3 用户已确认方案
- Step 5 主审已派发（或用户接受主审 SKIPPED）且无未消化 Critical
- Outside Voice 已询问并完成（ran / 用户跳过 / 宿主无法运行已标注）
- `phase=tasks`

## 上下文压缩恢复

重载：`task_id`、`brainstorm-summary.md` / `detailed-design.md` / `*-design.md`（若有）的落盘状态、
`reviews/design-review-report.md`、`reviews/openspec-review-report.md`（若有）、本 skill 停在哪一步。

- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 **Step 3.3** → 从决策点续；**不得**因为「`brainstorm-summary.md` 已写」自行判定为已确认
- 停在 **Step 4.2（专项预检决策）** → 从决策点续，已确认过的专项不再重问
- 停在 **Step 4.3（主动式压缩）** → 产物已落盘，直接进 Step 5
- 停在 **Step 5.1 / 5.2** → 先完成 5.3 消化（未消化 Critical 不得完成）
- 停在 **Step 6** → 只补状态写入与阶段推进，**不重做** Step 4
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
polaris-flow state next <change-name>
```
