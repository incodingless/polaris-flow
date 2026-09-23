---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak
description: "面向简单需求的单入口开发流程：一次会话内串行完成轻量澄清（change-brief）→ 生成 tasks.md → 实施 → 出口检查，然后交给 ship 收尾。用户触发 /polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak、经 /flow 选择 P01 实现简单功能、或要求快速实现一个单模块 / 单文件级改动时必须使用本 skill。不要用于：需跨模块设计或多 delta spec 的需求（走 P02 polaris{{SKN_SPR}}coding{{SKN_SPR}}normal）、出口检查未通过就强行交付、或在本技能内重写 proposal / 高层 design 的范围结论。"
version: 0.1
---

# Polaris 工作流 - 简单需求快速通道（tweak）

<HARD-GATE>
本 skill **仅**负责：在**单模块 / 单文件级、低风险**范围内，一次会话内串行完成「轻量澄清 → tasks 生成 → 实施 → 出口检查」，然后把 `phase` 推到 `ship`，由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` 完成分支收尾与归档。

- **禁止**在 Step 3 升档检查完成前生成 `tasks.md` 或写任何 OpenSpec 制品
- **禁止**跳过 `change-brief.md` 的用户整体确认（Step 2.3）就 finalize 目录名 / 生成制品
- **禁止**生成 `tasks.md` 前未 `read_file ./templates/tweak-tasks-template.md`
- **禁止**跳过 `tasks-lint.sh` 或用脑补核对代替
- **禁止**未按 `tweak-tasks-template.md` 的任务类型规则自动标注 `<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->`；**禁止**用全局开关把「新功能 / Bug 修复 / 含分支逻辑」类任务标成非 TDD（Test-First 是 Constitution NON-NEGOTIABLE）
- **禁止**主代理在 `/opsx:apply` 之外直接编写业务实现代码
- **禁止**调用 `superpowers:subagent-driven-development` / `superpowers:executing-plans`（H13）
- **禁止**跳过 5 个 scorer 或伪造分数；**禁止**未写入 `.polaris/metrics/<timestamp>-metrics.json` 就把 `phase` 推到 ship
- **禁止**本阶段做分支合并 / PR / `/opsx:archive`（那是 ship）
- **禁止**未完成出口校验（Step 6）就写 `runtime.build.status` / `runtime.verify.status=completed` 或推进 phase
- **H8**（状态行）：每个 Step 入口输出 `[polaris-flow 开发]快速通道 - 进入 tweak Step <N>: <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]快速通道 - 进入阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak 技能。`

---

## 定位与边界

tweak 是 P01（简单功能）的执行体。它把完整链路的 `specify → plan → build → verify` 四段压缩进**一次会话、一份简报**，去掉独立 design / tasks 与阶段主审。

| 维度 | tweak（P01） | 完整链路（P02 / P03） |
|------|----------------|----------------------|
| 适用 | 单模块 / 单文件级、≤ 3 个顶层任务、≤ 1 个 delta spec、无跨模块设计 | 多模块协作、需详细设计与任务拆分 |
| 阶段数 | 1 个技能内部跑完 4 步 | specify → plan → design(可选) → tasks → build → verify → ship |
| 规格产物 | `change-brief.md` + `tasks.md` | OpenSpec 四件套 + `detailed-design.md` |
| 设计 / 评审 | 无独立 design / plan，无阶段主审 | design 主审 + tasks 主审 + 可选 Outside Voice |
| 用户确认 | 3 次（理解确认 / 任务名 / 简报定稿）；命中升档时 +1 | ≥ 10 次 |
| workflow 写入 | **仅 1 次**（出口推进 ship） | 每阶段 1 次 |
| 收尾 | 交 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship`（归档前补齐四件套） | `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` |
| metrics | 照写（scorer 与四件套无关，retro 趋势不断档） | 照写 |

**刻意不做**：worktree 决策询问、TDD 策略询问、执行方式询问、审查模式询问、详细设计、阶段主审。这些在简单需求里属于过度确认，且 `decision-point.md` 明确要求「只有一个安全下一步时不得制造确认」。

## 遵守的 Hard Stops

| ID | 在本 skill 的适用方式 |
|----|---------------------|
| H8 | 每个 Step 入口输出可见状态行 |
| H10 | **条件适用**：仅当用户显式要求 subagent 派发（Step 5.1）时。优先 SessionStart 注入；仅默认通用且支持 → 不调 probe 直接 dispatch(`agent=null`)；选清单时优先 `$SUBAGENT_PROBE_CACHE`，缺缓存/需过滤才 probe。默认 inline 路径不触发本条 |
| H12 | 写 `.polaris/workflow.yaml` 走 `scripts/workflow-entry.sh`（内含 workflow.lock + 写后校验），不自写文件 |
| H13 | 不调用两个 superpowers 派发驱动器 |

## 标识约定

| 项 | 路径 / 值 |
|----|-----------|
| 变更简报（唯一真相） | `openspec/changes/<task_id>/change-brief.md`（Step 4.3 迁入前在 `.polaris/tasks/<task_id>/`） |
| 实施计划 | `openspec/changes/<task_id>/tasks.md` |
| 运行态 | `.polaris/tasks/<task_id>/state.yaml` |
| 验证报告 | `openspec/changes/<task_id>/reviews/verify-report.md` |
| Metrics | `.polaris/metrics/<timestamp>-metrics.json` |
| workflow 游标 | `.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.sh`） |

> **链路**：`**tweak**（轻量澄清 → tasks → 实施 → 出口检查）→ ship`。
> 本技能不归档、不合分支；规格只有简报 + tasks 两份，四件套由 ship 在归档前按 `./policies/artifact-backfill.md` 补齐。

---

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：环境准备 + draft 初始化

使用 SessionStart 注入的路径（本 skill 内此后一律复用 `$REPO_ROOT` / `$PLUGIN_ROOT`）：

- 优先：环境变量 `$PLUGIN_ROOT` / `$REPO_ROOT`
- 兜底：source `.polaris/.cache/runtime-env`
- 仍无 `$PLUGIN_ROOT` → 按 H12 阻断，提示用户重启会话以触发 SessionStart

```bash
if [ -z "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/scripts/task-init.sh" ]; then
  echo "PLUGIN_ROOT unset or hooks missing — restart session to run SessionStart" >&2
  exit 2
fi

INIT_RESULT=$(bash "$PLUGIN_ROOT/scripts/task-init.sh" "$REPO_ROOT" --kind coding)
INIT_EXIT=$?
echo "INIT_EXIT=$INIT_EXIT INIT_RESULT=$INIT_RESULT"
```

| `INIT_EXIT` | `status` | 含义 | 后续动作 |
| ----------- | -------- | ---- | -------- |
| 0 | `"ok"` | 成功 | 取 `draft_name`，进入 Step 1 |
| 1 | `"existing"` | 存在未完成 draft | 按决策点协议询问 A/B/C/D（同 specify Step 1） |
| 2 | —（stderr） | 参数/环境错误 | 按 H12 阻断 |
| 3 | —（stderr） | workflow 写入失败 | 按 H12 阻断 |

`status="existing"` 时按 `./policies/decision-point.md` 暂停：**A 续写最新** / **B 选择指定** / **C 丢弃后重建** / **D 取消退出**。

**状态行（H8）**：`[polaris-flow 开发]快速通道 - 开始编写变更简报：.polaris/tasks/<draft_name>/; workflow: appended entry phase=specify`

### Step 1：轻量澄清（一次确认）

#### 1.1 消费附加上下文

`/flow` 路由交接的 `附加上下文` 若为文件 / 目录 / 文字说明，**必须先完整读取**再进入 1.2。读取失败或内容与诉求明显无关 → 先回报用户再决定是否继续，不得静默跳过。

#### 1.2 现场勘察

在提问（或起草摘要）之前先做一次最小勘察，避免问出用户一句话就能答的问题：

- 读目标文件 / 目录，grep 相关符号与调用方
- 确认改动落点是否集中在单一模块
- 结果记入后续简报的「影响面」节

#### 1.3 加载宪法（注入点 A）

读取 `openspec/memory/constitution.md`（若存在且无占位符），供简报「宪法对齐」节与 Step 5/6 的注入点 C/D 使用。

#### 1.4 一次理解确认（阻塞点）

基于 1.1 + 1.2 + 用户原始诉求，先输出**理解摘要**（不走多轮追问），然后按 `./policies/decision-point.md` 暂停。

理解摘要必须覆盖 6 项，缺项不得发问：

| # | 要素 | 内容 |
|---|------|------|
| 1 | 问题与目标 | 要解决什么、期望结果 |
| 2 | 非目标 | 本次明确不做 |
| 3 | 范围边界 | 涉及 / 不涉及的模块、文件、用户、平台 |
| 4 | 验收标准 | 可判定的成功条件（尽量可测） |
| 5 | 方案 | 一句话怎么改（含关键技术选择） |
| 6 | 前提与风险 | 依赖的假设、已知风险 |

发问三选项：

```text
A. 确认 — 按此摘要推进，生成变更简报
B. 需要修正 — 请直接说明要改哪一项（可自由输入）
C. 超出简单需求 — 升到常规通道（P02 normal）
```

| 用户选择 | 动作 |
|----------|------|
| A | 进入 1.5 |
| B | 修改摘要后**重新发问**；修正轮次 > 2 → 视为需求不稳，进入 Step 3 升档检查 |
| C | 直接进入 Step 3 升档（此刻无任何制品，转交成本为零） |

**信息不足时**：若用户诉求模糊到无法形成上述 6 项（例如只说「优化一下这个模块」），**不得臆测填充**——改为一次聚焦追问（最多 1 轮，合并成一条消息），拿到答复后再发理解确认。

#### 1.5 拆分预检

`read_file ./policies/task-split-precheck.md`，按 **§1 唯一判定门**判定。仅当**全部**满足才可跳过预检：

- 仅覆盖单一 capability、单一模块、单一用户路径
- 不存在可独立交付的子集
- 预计产出 ≤ 1 个 delta spec 且 ≤ 3 个大任务
- 不存在分阶段里程碑

**不满足** → 进入 Step 3 升档检查（此时仍未生成任何制品）。

### Step 2：任务名 + 简报定稿

#### 2.1 任务名确认（阻塞点）→ 得到 `task_id`

按 `./policies/decision-point.md` 暂停，让用户决定任务名（即后续目录名 / `task_id`）。**禁止**静默推断或自动落盘。

约束：`task_id` 必须是 **kebab-case 英文**（小写字母、数字、连字符），如 `fix-login-typo`。

暂停时必须展示：

- 基于理解摘要派生的 **2–3 个推荐名**，各附一行范围说明
- 「自行输入名称」选项
- 提示：非合规输入（含中文）会转换为 kebab-case，**转换结果须回显并再次确认**

名称与已有 `$REPO_ROOT/.polaris/tasks/` 目录冲突时，报告冲突并请用户另选。确认后**立即把 `task_id` 回填进 `change-brief.md` 首行** —— 该文件是名称的**唯一落盘载体**，**禁止**只留在会话上下文（会话丢失后无从恢复）。此时**尚未** `mv` 目录。

#### 2.2 写入 `change-brief.md`（仍在 draft 目录）

落盘路径：`$REPO_ROOT/.polaris/tasks/<draft_name>/change-brief.md`

**强制前置**：写入前必须 `read_file ./templates/change-brief-template.md`，并输出：`[polaris-flow 开发]快速通道：已读取变更简报模板 change-brief-template.md`

内容严格按模板节顺序填充。各节内容来源：

| 模板节 | 内容来源 |
|--------|----------|
| 一句话目标 / 问题与背景 / 范围 | 1.4 理解摘要要素 1–3 |
| 验收标准 | 1.4 要素 4 |
| 方案 | 1.4 要素 5 |
| 宪法对齐 | Step 1.3 |
| 前提与风险 | 1.4 要素 6 |
| 备选方案 | 勘察中考虑过但未采用的方案 + 拒绝理由；无则写「无」 |
| 待决问题 | 未关闭项；无则写「无」 |
| 影响面 | Step 1.2 勘察结果（模块清单 / 文件清单 / 是否触碰数据实体 / 是否触碰核心链路） |

首行任务标识暂用占位 `# 变更简报: <TBD>`，Step 2.4 回填为真实 `task_id`。

> 「影响面」节不是装饰——它是 Step 3 升档判定的唯一输入。

#### 2.3 用户整体确认 `change-brief.md`（阻塞点）

按 `./policies/decision-point.md` 暂停：

> 请**仔细**阅读完整变更简报（含目标、范围、验收标准、方案、前提与风险），**审查**后确认是否可以据此生成任务计划？
>
> （请回复「确认 / ok / 同意」等明确整体确认；若仅对某条目有意见，请直接指出以便修改）

| 用户回复 | 判定 | 后续动作 |
| -------- | ---- | -------- |
| 明确整体确认 | 完成 | 进入 2.4 |
| 仅对某条/某节反馈 | **不算确认** | 修改后**重新发问** |
| 模糊回复（「差不多」「可以吧」） | **不算确认** | 必须再问一次明确确认 |
| 沉默 / 无回复 | **不算确认** | 同上 |

**禁止**把 Step 1.4 的「确认」当作本步整体确认。

#### 2.4 敲定目录名并更新 state（finalize）

> **会话丢失后的恢复**：`task_id` 从 `change-brief.md` 首行读（2.1 已回填真值）；`draft_name` 从 `.polaris/tasks/` 下的 `draft-*` 目录推断 —— **两者都不依赖会话记忆**，本步因此可在新会话中执行。

```bash
FINAL_RESULT=$(bash "$PLUGIN_ROOT/scripts/specify-finalize.sh" "$REPO_ROOT" "<draft_name>" "<task_id>")
FINAL_EXIT=$?
echo "FINAL_EXIT=$FINAL_EXIT FINAL_RESULT=$FINAL_RESULT"
```

| `FINAL_EXIT` | 含义 | 后续动作 |
| ------------ | ---- | -------- |
| 0 | 成功 | 进入 Step 3 |
| 1 | 目标目录已存在 | 按 H12 阻断 |
| 2 | 参数/环境错误 | 按 H12 阻断 |
| 3 | workflow rename 失败 | 按 H12 阻断 |

回填 `change-brief.md` 首行为真实 `task_id`。

### Step 3：升档检查（阻塞点）

`read_file ./policies/upgrade-check.md`，按其中的信号表对简报做一次判定。这是 tweak 唯一的「规模守门」，位置刻意放在 **brief 定稿之后、tasks 生成之前**——此前转交成本为零。

- **命中任一信号** → 按 `./policies/decision-point.md` 暂停：**A 升到 P02** / **B 继续 tweak 并记录风险**
  - A → 按 `upgrade-check.md` 的转交动作执行，本 skill 结束
  - B → 把命中信号写入 `state.yaml: workflow.tweak.signals[]`，在简报「前提与风险」节追加风险接受记录，进入 Step 4
- **未命中** → 直接进入 Step 4

### Step 4：生成 `tasks.md`

#### 4.1 worktree（默认不创建）

tweak 默认留在主仓库，不询问。写入 `.polaris/tasks/<task_id>/state.yaml`：

```yaml
worktree:
  created_by_polaris_flow: false
phase: plan
```

用户**显式**要求 worktree 时，按以下步骤创建并同步元信息（等价 plan 的 worktree 创建流程；此时 ship 的 Step 3 合回逻辑照常生效）：

```bash
WT_RESULT=$(bash "$PLUGIN_ROOT/scripts/worktree-create.sh" "$task_id" "$REPO_ROOT")
WT_EXIT=$?
```

- `WT_EXIT=0` → `$WT_RESULT` 含 JSON（`target_path` / `target_branch` / `snapshot_path`），继续同步
- `WT_EXIT=1` → **阻断**，按 stderr 处理

创建成功后，写入 `.polaris/tasks/<task_id>/state.yaml`（worktree 内路径优先）：

```yaml
worktree:
  created_by_polaris_flow: true
  path: "<target_path>"
  branch: "<target_branch>"
  origin_repo: "<REPO_ROOT>"
  status: active
phase: plan
```

同步主仓 workflow.yaml（脚本内含锁 + 写后校验，见 H12）：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind coding --skill tweak --where-task-id "$task_id" --set phase=plan --set worktree-path="$target_path"
```

输出：`[polaris-flow 开发]快速通道 - worktree：created at <target_path> on branch <target_branch>`。

#### 4.2 创建 change 骨架

**立即执行：** 使用 Skill 工具加载 `opsx:new` / `openspec-new-change`。禁止跳过此步骤。

> 必须创建骨架——否则 `openspec/changes/<task_id>/` 目录不合法，ship 的 `openspec-cn archive` 会失败。

#### 4.3 迁入 `change-brief.md`（唯一真相）

```bash
mv "$REPO_ROOT/.polaris/tasks/$task_id/change-brief.md" \
   "$REPO_ROOT/openspec/changes/$task_id/change-brief.md"
```

确认 `.polaris` 侧已不存在、目标路径存在且非空。**禁止**在 `.polaris` 保留简报副本。

输出：`[polaris-flow 开发]快速通道 - 简报：moved to openspec/changes/<task_id>/change-brief.md（.polaris 无备份）`

#### 4.4 生成 `tasks.md`

**强制前置**：`read_file ./templates/tweak-tasks-template.md`，并输出：`[已 read_file templates/tweak-tasks-template.md]`

与完整链路的关键差异：plan 产出的是**粗骨架**（等 tasks 覆写），tweak **没有 tasks 阶段**，因此必须一次写成**可执行细计划**——含 Files / Interfaces / 可直接复制的验证命令。

规模硬约束：**顶层任务 ≤ 3**（文档同步组不计入）。推导过程中发现需要 > 3 个顶层任务 → 停止生成，回到 Step 3 升档。

#### 4.5 tasks lint

```bash
LINT_RESULT=$(bash "$PLUGIN_ROOT/scripts/tasks-lint.sh" "openspec/changes/$task_id/tasks.md")
LINT_EXIT=$?
```

- exit 0 → 通过
- exit 1 → **阻断**，输出 `$LINT_RESULT`，修正后重跑

#### 4.6 状态写入

```yaml
runtime:
  tweak:
    mode: tweak
    status: in_progress
    tdd_mode: auto_by_task_type
    build_mode: inline        # 或 subagent_dispatch（仅用户显式要求）
    signals: []               # 命中的升档信号（Step 3 选 B 时记录）
  build:
    status: in_progress
    build_mode: inline
phase: build
```

输出：`[polaris-flow 开发]快速通道: task_id=<task_id> ; worktree=main ; tasks=<N> 顶层任务`

### Step 5：实施

#### 5.1 执行方式（默认 inline，不询问）

默认 `build_mode=inline`：主代理在本会话内执行 `/opsx:apply`。**不发起询问**（简单需求问执行方式属于过度确认）。

仅当用户**显式**要求 subagent 时（H10）：

1. 读 SessionStart 注入；若 `PLATFORM_DEGRADATION=inline|unsupported` → 强制 inline，输出原因（**不调** probe）
2. 若只要默认通用且 `SUPPORTS_SUBAGENT=true`（degradation 空）→ **不调** probe，`subagent-dispatch`（`agent=null`）
3. 若要从清单选 agent：优先读 `$SUBAGENT_PROBE_CACHE` 选 id；仅当**缺缓存/缺注入**或需正式过滤时，才 `use_skill("polaris{{SKN_SPR}}subagent-probe")`（probe 优先读缓存），再 dispatch
4. probe（若调用）返回 `degradation=inline|unsupported` → 强制回退 inline，输出原因

#### 5.2 Constitution 注入点 C

在每个 task 的实施动作**之前**，必须输出一行：

```text
[Constitution C] Task <N.M>: 适用原则 = <从 openspec/memory/constitution.md 识别的相关 Core Principle>
```

inline 与 subagent 分支同样适用（subagent 分支须写入启动 prompt）。

#### 5.3 执行 apply

调用 `/opsx:apply <task_id>`。

- **禁止**在 `/opsx:apply` 之外手写业务实现代码（补丁、新模块、改 API）
- **禁止**用全局开关覆盖 `tasks.md` 内的 `<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->` 标注
- **禁止**借机重写 `change-brief.md` 的目标与范围结论；发现计划缺陷 → 暂停回报用户，不静默改 Scope

#### 5.4 apply 中途 pause / error

- **paused**：按 apply 给出的原因与选项，用 decision-point 问用户；用户选继续 → 再次 `/opsx:apply`
- **errored**：阻断，报告错误；不写 `runtime.build.status=completed`

#### 5.5 轻量代码审查（固定 `standard`，不询问）

apply 完成后跑**一次** `superpowers:requesting-code-review`，范围 = 本次 diff + `tasks.md` + 测试结果，只查正确性 / 安全 / 边界。

| 发现级别 | 处理 |
|----------|------|
| CRITICAL | **阻断**，回 5.3 修复 |
| IMPORTANT | 不阻断本步，但必须记入 `reviews/verify-report.md`，并在 Step 6.4 由用户逐条决策 |
| 技能不可用 | 标注跳过原因，记入报告；不阻断 |

### Step 6：出口检查

`read_file ./policies/exit-check.md` 并按其执行，包含四部分：

1. **6 项检查**（tasks 勾完 / 改动一致 / 构建通过 / 测试通过 / 无明显安全问题 / 验收标准可追溯）
2. **Constitution 合规审计**（注入点 D，轻量版）
3. **5 个 scorer + metrics 落盘**（`.polaris/metrics/<timestamp>-metrics.json`，格式与 verify 完全一致）
4. **写 `reviews/verify-report.md`**

**硬阻断（不得推进 phase）**：

- 任一 CRITICAL 未解决
- `exit-check.md` 定义的 metrics 文件未写入
- `verify-report.md` 未落盘

失败决策的严重程度判定、重试上限（3 轮后收敛为两选项）、不确定性原则（宁可标轻）均按 `exit-check.md` 执行，与 verify 保持一致。

### Step 7：状态批量补写 + 推进 ship

出口校验全部通过后，**一次性**完成所有状态写入——这是 tweak 与完整链路的第二个关键差异：中间不推 phase，全程只有这一 workflow 写。

```yaml
runtime:
  tweak:
    status: completed
    finished_at: "<ISO>"
  build:
    status: completed
    build_mode: <inline|subagent_dispatch>
    review_mode: standard
    final_review: <done|skipped:<reason>|accepted_risk>
    completed_tasks: <N>
    total_tasks: <N>
    finished_at: "<ISO>"
  verify:
    status: completed
    constitution_valid: <true|false>
    overall_score: <N>
    score_level: <high|low>
    verify_mode: light
    blocked: false
    verification_report: "openspec/changes/<task_id>/reviews/verify-report.md"
    scorer_results: { ... }
    finished_at: "<ISO>"
phase: idle
```

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" update-active --kind coding --skill tweak --where-task-id "$task_id" --set phase=ship
```

输出：

```text
快速通道完成：
  task_id : <task_id>
  tasks.md  : openspec/changes/<task_id>/tasks.md（全部 [x]）
  score     : <overall_score> (<score_level>)
  report    : openspec/changes/<task_id>/reviews/verify-report.md
下一步建议 /polaris{{SKN_SPR}}coding{{SKN_SPR}}ship（归档前会按 artifact-backfill 补齐 OpenSpec 四件套）。
```

---

## TDD 策略：为什么这里不询问

完整链路在 tasks 阶段会询问 `prefer_tdd / require_tdd / prefer_direct`。tweak **不询问**，改为按 `tweak-tasks-template.md` 的规则**逐任务自动判定**：

- 新功能 / Bug 修复 / 含分支逻辑 → `<!-- TDD 任务 -->`（5 步）
- 配置修改 / 重命名 / 文档更新 / 依赖升级 / 构建脚本 / 脚手架 → `<!-- 非 TDD 任务 -->`（3 步）
- 无法判定 → **默认 TDD**

理由：Constitution 里 Test-First 是 `NON-NEGOTIABLE`。若用全局开关把小新功能标成非 TDD，会在 Step 6 的 Constitution 审计上直接撞 Critical。tweak 的「省事」来自**少切换、少确认**，不是来自降低测试纪律；而 ≤ 3 个顶层任务的规模上限保证了 TDD 成本可控。

## 上下文压缩恢复

重载：`task_id`、draft 是否已 finalize、`change-brief.md` 当前所在路径、顶层任务数与勾选进度、`tweak.*` / `build.*` / `verify.*`、本 skill 停在哪一步。

| 中断位置 | 恢复动作 |
|----------|----------|
| Step 1.4 / 2.1 / 2.3 | 从该决策点续，不得跳过确认 |
| Step 3 | 重跑升档判定（简报内容未变则结论不变） |
| Step 4.5 lint 失败 | 修 `tasks.md` 后重跑 lint，勿重生成整份 |
| Step 5.3 apply pause | 从 5.3 续，勿重选模式 |
| Step 6 失败决策 | 从决策点续，勿重跑已通过的检查项 |
| Step 7 之后 | 只补 ship 交接，勿重跑 apply |

## 退出条件

- `change-brief.md` 已迁入 `openspec/changes/<task_id>/`，`.polaris` 无副本
- `tasks.md` 全部 checkbox 为 `- [x]`，且 `tasks-lint.sh` 通过
- 5 个 scorer 已跑完，`.polaris/metrics/<timestamp>-metrics.json` 已写入且含 `task_id`
- `reviews/verify-report.md` 存在且 `runtime.verify.verification_report` 指向它
- 无未解决的 CRITICAL；IMPORTANT 已逐条决策
- `runtime.build.status` / `runtime.verify.status=completed`，且 `phase=ship`

## 自动衔接下一阶段

按 `./policies/auto-transition.md` 执行 —— manual / auto 两种模式的行为、提示语模板与执行序，
**以该文件为唯一来源，本技能不内联副本**。关键命令：

```bash
node polaris-flow state next <change-name>
```
