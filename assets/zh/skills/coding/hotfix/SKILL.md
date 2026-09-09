---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}hotfix
description: "面向紧急 bug 修复的极简通道：一次会话内串行完成 bug 复现+根因（change-brief）→ 生成 tasks.md → 写 fix + 跑测试 → 推进 ship，跳过 constitution / split-precheck / exit-check 全部守门，但保留 ship 的归档守门与 TDD 强约束。用户触发 /polaris{{SKN_SPR}}coding{{SKN_SPR}}hotfix、报告线上 bug 要求快速修复、或明确声明「紧急修复，先上线再补」时必须使用本 skill。不要用于：需跨模块重构或新功能（走 P02 polaris{{SKN_SPR}}coding{{SKN_SPR}}normal）、根因未定位（先回 normal 做 specify）、或想跳过 ship 守门（hotfix 不接受）。"
version: 0.1
---

# Polaris 工作流 - 紧急 bug 修复通道（hotfix）

<HARD-GATE>
本 skill **仅**负责：在**根因已定位、修复范围明确**的紧急 bug 修复场景下，一次会话内串行完成「bug 简报 → tasks → 写 fix → 推进 ship」，然后把 `phase` 推到 `ship`，由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` 完成分支收尾与归档。

- **禁止**在根因未定位 / 修复范围未明确时进入本 skill（先回 normal/specify 走诊断）
- **禁止**跳过 `change-brief.md` 的 bug 复现+根因填写
- **禁止**未确认 bug 影响面（影响用户、影响数据、影响安全）就生成 tasks
- **禁止**未 `read_file ./policies/incident-recap-template.md` 就生成 tasks（写修复任务时需带「回写 incident 复盘」任务）
- **禁止**未 `read_file ./templates/hotfix-tasks-template.md` 就生成 tasks
- **禁止**跳过 `tasks-lint.sh`
- **禁止**未按 `hotfix-tasks-template.md` 的任务类型规则自动标注 `<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->`；**禁止**用全局开关把「Bug 修复」类任务标成非 TDD（Test-First 是 Constitution NON-NEGOTIABLE，bug 修复的回归测试必写）
- **禁止**主代理在 `/opsx:apply` 之外直接编写业务实现代码
- **禁止**调用 `superpowers:subagent-driven-development` / `superpowers:executing-plans`（H13）
- **禁止**跳过 5 个 scorer 或伪造分数；**禁止**未写入 `.polaris/metrics/<timestamp>-metrics.json` 就把 `phase` 推到 ship
- **禁止**本阶段做分支合并 / PR / `/opsx:archive`（那是 ship）
- **禁止**跳过 ship 守门——hotfix 的「紧急」是相对 tweak 的"轻量澄清"而言，不接受绕过 ship 的归档与 artifact-backfill
- **H8**（状态行）：每个 Step 入口输出 `[polaris-flow 开发]紧急通道 - 进入 hotfix Step <N>: <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]紧急通道 - 进入阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}hotfix 技能。`

---

## 定位与边界

hotfix 是 P01（紧急 bug 修复）的执行体。它把完整链路的 `specify → plan → build → verify` 四段压缩进**一次会话、一份简报**，相比 tweak 进一步**去掉轻量澄清**，但**保留 ship 守门**（tweak 唯一可跳过的步骤也是 ship，但 hotfix 不能）。

| 维度 | hotfix（P01 紧急） | tweak（P01 简单） | 完整链路（P02 / P03） |
|------|--------------------|-------------------|----------------------|
| 适用 | 根因已定位的 bug 修复，影响面已知 | 单模块 / 单文件级新功能或小改动 | 多模块协作、需详细设计与任务拆分 |
| 阶段数 | 1 个技能内部跑完 4 步 | 1 个技能内部跑完 4 步 | specify → plan → design(可选) → tasks → build → verify → ship |
| 入口确认 | 0 次（用户提供 bug 描述+复现即可） | 3 次（理解确认 / 任务名 / 简报定稿） | ≥ 10 次 |
| 规格产物 | `change-brief.md`（bug 简报） + `tasks.md` | `change-brief.md`（需求简报） + `tasks.md` | OpenSpec 四件套 + `detailed-design.md` |
| constitution 审计 | **跳过**（紧急修复不阻塞审计） | 跳过 | 强制 |
| task-split-precheck | **跳过**（≤3 个 task 是强约束） | 跳过 | 强制 |
| exit-check（出口检查） | **跳过**（bug 修复靠 ship 守门） | 强制 | 强制 |
| artifact-backfill | ship 仍补 | ship 仍补 | ship 仍补 |
| 收尾 | 交 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` | 交 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` | `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` |
| TDD | **强约束**（bug 修复必写回归测试） | 强约束 | 强约束 |
| metrics | 照写（scorer 跑空 5 项，retro 趋势不断档） | 照写 | 照写 |

**刻意不做**：bug 根因诊断（属于 normal/specify 的 clarify 阶段）、多根因分析、worktree 决策询问、详细设计、constitution 审计、任务拆分检查、出口检查。这些在紧急修复里属于过度确认。

**与 tweak 的边界**：
- 用户给的是「bug 描述+复现+根因」→ hotfix
- 用户给的是「我想加个 XX 功能」→ tweak
- 用户给的 bug 根因不明 / 影响面不明 → **不要走 hotfix**，回 normal/specify 做诊断

## 遵守的 Hard Stops

| ID | 在本 skill 的适用方式 |
|----|---------------------|
| H8 | 每个 Step 入口输出可见状态行 |
| H10 | **条件适用**：仅当用户显式要求 subagent 派发（Step 3.1）时，派发前必须先 `use_skill("polaris{{SKN_SPR}}subagent-probe")` 并传入 `platform`。默认 inline 路径不派发 subagent，不触发本条 |
| H12 | 写 `.polaris/workflow.yaml` 走 `scripts/workflow-entry.sh`（内含 workflow.lock + 写后校验），不自写文件 |
| H13 | 不调用两个 superpowers 派发驱动器 |

## 标识约定

| 项 | 路径 / 值 |
|----|-----------|
| `change_id` | 与 specify / ship 同值，kebab-case，**强烈建议带日期前缀**（如 `2026-09-08-fix-npe`）便于事故回溯 |
| bug 简报（唯一真相） | `openspec/changes/<change_id>/change-brief.md`（Step 1.3 落盘） |
| 实施计划 | `openspec/changes/<change_id>/tasks.md` |
| 运行态 | `.polaris/tasks/<change_id>/state.yaml` |
| 验证报告 | `openspec/changes/<change_id>/reviews/verify-report.md` |
| Metrics | `.polaris/metrics/<timestamp>-metrics.json` |
| workflow 游标 | `.polaris/workflow.yaml`（写入走 `scripts/workflow-entry.sh`） |
| incident 复盘（可选） | `docs/incidents/<change_id>.md`（由 tasks 中的「incident 复盘」任务产出） |

> **链路**：`**hotfix**（bug 简报 → tasks → 写 fix → 推进 ship）→ ship`。
> 本技能不归档、不合分支；规格只有简报 + tasks 两份，四件套由 ship 在归档前按 `./policies/artifact-backfill.md` 补齐。

---

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 1：bug 复现+根因 + change-brief.md 落盘

使用 SessionStart 注入的路径（本 skill 内此后一律复用 `$REPO_ROOT` / `$PLUGIN_ROOT`）：

- 优先：环境变量 `$PLUGIN_ROOT` / `$REPO_ROOT`
- 兜底：source `.polaris/.cache/runtime-env`
- 仍无 `$PLUGIN_ROOT` → 按 H12 阻断，提示用户重启会话以触发 SessionStart

**Step 1.1：bug 影响面与根因确认**

- 必填项（拒绝进入 Step 2 直至全部就绪）：
  1. **复现步骤**（命令 / 输入 / 期望 vs 实际）
  2. **根因**（哪个文件、哪个函数、哪一行；用户已诊断好）
  3. **影响面**（影响哪些用户 / 数据 / 业务 / 安全）
  4. **修复方向**（改哪 / 加哪 / 删哪）
- 任一项缺失 → **不走 hotfix**，回 `/polaris:normal` 走 clarify 阶段做诊断

**Step 1.2：change_id 命名**

- kebab-case，**必须带日期前缀**（如 `2026-09-08-fix-npe-in-checkout`），便于事故回溯
- 询问用户是否同意命名（一次性确认）

**Step 1.3：change-brief.md 落盘**

- 路径：`openspec/changes/<change_id>/change-brief.md`
- **不**读 `./templates/tweak-change-brief-template.md`（那是 tweak 的需求简报模板）
- 直接按以下骨架写：

```markdown
# <change_id> - 紧急 bug 修复简报

## 影响面
- 影响范围：<用户群 / 数据 / 业务 / 安全>
- 严重程度：<P0 / P1 / P2>
- 触发条件：<何时触发>

## 复现步骤
1. ...
2. ...
3. ...

## 根因
- 文件：`<path>:<line>`
- 函数：`<func>`
- 原因：<一句话描述>

## 修复方向
- 改：<path:line> <改什么>
- 加：<新增什么>
- 删：<删除什么>

## 影响面回归
- 涉及模块：<list>
- 涉及下游：<list>
- 涉及对外接口：<list>
```

**Step 1.4：state.yaml 初始化**

- 走 `scripts/workflow-entry.sh --repo-root "$REPO_ROOT" --phase hotfix` 物化运行态目录与 state.yaml
- 写入 `runtime.hotfix.status = in_progress`（hotfix 不在 PHASE_TO_SKILL 映射里，**直接用 phase=hotfix 写入**，由 ship 在 Step 4 推进时改 phase=ship）

### Step 2：生成 tasks.md（≤3 个 task，强 TDD）

**Step 2.1：读模板**

- 必读：`./templates/hotfix-tasks-template.md`
- 不读：tweak / normal / design 的 tasks 模板（语义不同）

**Step 2.2：写 tasks**

- 任务数 **≤3**（不读 `task-split-precheck`，强约束）
- 任务类型规则（**必须自动标注**，禁止全局开关）：
  - 「写回归测试 / 写 fix / 跑测试」→ `<!-- TDD 任务 -->`
  - 「incident 复盘 / 文档同步」→ `<!-- 非 TDD 任务 -->`
- bug 修复场景：至少 1 个 `<!-- TDD 任务 -->`（回归测试必写）
- 推荐任务结构：
  1. 写回归测试（红）
  2. 写 fix（绿）
  3. incident 复盘（可选）

**Step 2.3：tasks-lint**

- 执行 `scripts/tasks-lint.sh`（`grep` 校验任务数 / TDD 标注 / 路径合规）
- 不通过 → 修 tasks，不通过就阻塞

### Step 3：写 fix + 跑测试

**Step 3.1：实施**

- 顺序：先写回归测试（红）→ 写 fix（绿）→ 重构
- 复杂 bug 可派发 subagent（用户显式要求时）—— 派发前 `use_skill("polaris{{SKN_SPR}}subagent-probe")` 注入 `platform`
- 默认 inline：主代理按 `tasks.md` 逐项 `apply` 即可

**Step 3.2：metrics 写盘**

- 走 `scripts/metrics-write.sh` 落 `.polaris/metrics/<timestamp>-metrics.json`（**不**走五维 scorer——hotfix 紧急，5 项跑空写骨架）
- 不写 / 写错 → 阻塞 Step 4

### Step 4：推进 ship（移交归档）

**Step 4.1：状态批量补写**

- 走 `scripts/workflow-entry.sh --repo-root "$REPO_ROOT" --phase ship`
- 不自写 `runtime.build.status` / `runtime.verify.status`——hotfix 跳过 build/verify，由 ship 接管

**Step 4.2：移交 ship**

- 加载 `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` 技能
- ship 的核心职责：commit / push / 归档 / artifact-backfill / PR
- 状态行：`[polaris-flow 开发]紧急通道 - hotfix 完成，移交 ship 收尾。`

---

## 与 ship 的交接清单

ship 接手时需要看到（hotfix 在 state.yaml 里留下的）：

- `runtime.hotfix.status = completed`
- `runtime.hotfix.change_id = <change_id>`
- `openspec/changes/<change_id>/change-brief.md`（含影响面 / 复现 / 根因 / 修复方向）
- `openspec/changes/<change_id>/tasks.md`（≤3 task，至少 1 个 TDD）
- `.polaris/metrics/<timestamp>-metrics.json`（即便 5 维跑空也要写骨架）

ship 仍会做：
- artifact-backfill（按 `./policies/artifact-backfill.md` 补 proposal/specs/tasks/design）
- commit + push + PR
- `/opsx:archive` 归档
- 回写 incident 复盘（若 tasks 含该任务）

---

## 禁止与回退

| 触发条件 | 处理 |
|---------|------|
| 根因未定位 | 拒绝进入 Step 1.3，提示「回 /polaris:normal 走 specify 做诊断」 |
| 修复范围跨 3+ 模块 | 拒绝进入 Step 1.3，提示「回 /polaris:normal」 |
| 涉及 schema 变更 / 数据迁移 | 拒绝 hotfix，强制 normal（含迁移脚本与回滚预案） |
| 涉及对外 API breaking change | 拒绝 hotfix，强制 normal |
| 用户中途要求回完整链路 | 中断 hotfix，回 `/polaris:normal` 重新走 specify（保留 change-brief.md 作为 specify 输入） |
| ship 守门失败（artifacts 缺失 / lint 不通过） | 阻塞归档，由 hotfix owner 在 hotfix 阶段补齐后重提 |
