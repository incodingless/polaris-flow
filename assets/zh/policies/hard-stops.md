# Polaris-Flow Hard Stops

> 跨阶段的硬约束清单。各skill 共同遵守的全局约束。

## 适用范围

本文档列出的 Hard Stops 是 polaris-flow 各 skill 在执行时**必须遵守**的全局约束。每个 skill 在自己的 SKILL.md 中通过引用本文档的 ID（H8/H9/H10）声明遵守哪些条款。

任何 skill 即将违反某条 Hard Stop 时，必须**先输出对应自检话术，然后停止动作**，等用户介入。

## Hard Stops 清单

| ID | 规则 | 适用 skill | 违规后果 |
|----|------|-----------|---------|
| H8 | 每次状态切换**必须**在回复中输出一行 `[polaris-flow] 进入阶段: <verb>` 或 `[polaris-flow] worktree: ...` 等可见状态行，让用户能可视化路径 | 所有 `/polaris:*` 命令对应的 skill 入口与关键步骤 | 重写当前回复 |
| H9 | `state.yaml` 中 `worktree.created_by_polaris_flow=true` 时，ship 阶段**必须**在 `superpowers:finishing-a-development-branch` 完成后追加 **三段式**：(1) **harness 产物合回**（`.polaris/metrics/*` / `overrides.log` / `state.yaml` 终态 / `intention.md` 修订 → 主仓 `.polaris/` 顶层 + `.polaris/archive/<change_id>/`）；(2) git 合回（已合并则跳过）；(3) worktree 清理。**禁止**只 finishing 不清理 worktree；**禁止**未执行产物合回就 `git worktree remove`（会蒸发本次 reflect/审计数据） | `ship`（Step 3） | 立即停止 |
| H10 | 任何派发点 skill（`build` / `audit`）在执行 subagent 派发之前，**必须**先 `use_skill("{{SKILL_NAME_PREFIX}}subagent-probe")` 并传入 `platform`，等待返回；**禁止**跳过 Subagent Probe 直接派发 implementer/scorer subagent | 所有派发点 skill | 立即停止 |
| H11 | ship 阶段**必须**在 Step 1 之前先按 `ship/policies/ship-lock.md` 在主仓 `.polaris/.locks/ship.lock` 上获取互斥锁；锁内容含 `change_id`+PID+启动时间；`trap EXIT INT TERM HUP` 自动释放；存在锁且 < 30min → 阻断；≥ 30min 视为 stale → `ask_followup_question` 让用户显式确认清理。跨机器并发不在本约束 scope（lock 不入仓） | `ship`（Step 0） | 立即停止 |
| H12 | 任何对主仓 `.polaris/workflow.yaml` 的写操作（read-modify-write 全文重写）**必须**先按 `policies/workflow-lock.md` 获取 `.polaris/.locks/workflow.lock` 互斥锁；写后**必须**回读校验自己修改是否生效；锁内容含 `skill_name`+PID+启动时间；`trap` 自动释放；stale 阈值 5s（正常 RMW < 100ms）。ship 内嵌套使用时锁顺序固定为 ship.lock → workflow.lock，避免死锁 | `design`/`plan`/`ship` 中所有写 workflow.yaml 的位置 | 立即停止 |
| H13 | **禁止**任何 skill / 主代理 / subagent 调用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 这两个派发驱动器。所有 subagent 派发统一由主代理使用宿主原生 Task / AgentTool 完成;可用 agent 由 `polaris-flow:subagent-probe` 按 platform 探测;当 probe 返回 `degradation=inline`/`unsupported` 时主代理在自己会话内 inline 执行,绝不回退到 superpowers 派发。**不在禁令范围**:`superpowers:brainstorming`、`superpowers:test-driven-development`、`superpowers:verification-before-completion`、`superpowers:finishing-a-development-branch`、`superpowers:using-git-worktrees` 等被动方法论 / 工具 skill 仍可使用——它们不派发 subagent | 所有 polaris-flow skill;所有由 polaris-flow 派发的 subagent | 立即停止 |
| H14 | **禁止**开发类路径（M01 / P01–P03 / M03）在 `需求内容` 为 `待预检` 或 `无` 时加载任何技能——必须先走完 `polaris:flow` 的零步（前置需求预检：0.1 识别 → 0.2 强制附需求 → 0.3 询问自动评估 → 0.4 自动路由），把 `需求内容` 填到非 `待预检` 且非 `无`，才能进入第四步。空需求 / 仅"实现 XX"无细节的需求**禁止**靠 Step 0.4 自动评估蒙混过关（自动评估的输入必须含完整三要素） | `polaris:flow`（零步） | 立即停止 |

> 注：原 H3（强制 worktree 决策）已删除。worktree 创建改为非阻断式提示——由 `plan` skill 的 Step 1 在 `/polaris:plan` 入口询问用户即可，无需全局硬约束，无需独立的 worktree skill。

## 自检话术（即将违规时必须先输出后停止）

| Hard Stop | 自检话术 |
|-----------|---------|
| H8 | （无阻断话术，仅"重写回复"——补上缺失的 `[polaris-flow] ...` 状态行后再继续） |
| H9 | `[polaris-flow] 阻断：本次流程创建过 worktree，ship 必须完成 harness 产物合回 + git 合回 + 清理三段式后才能输出交付摘要（HARD STOP H9）。先确认 .polaris/metrics、overrides.log、state.yaml 终态、intention.md 修订已拷回主仓 .polaris/ 与 .polaris/archive/<change_id>/，再执行 git worktree remove。` |
| H10 | `[polaris-flow] 阻断：派发 subagent 前必须先调用 {{SKILL_NAME_PREFIX}}subagent-probe（HARD STOP H10）。当前 platform=<id> 未完成 Subagent Probe，禁止启动 subagent。` |
| H11 | `[polaris-flow] 阻断：ship 必须先获取 .polaris/.locks/ship.lock 互斥锁（HARD STOP H11）。检测到既有锁 <lock_content> 持有 <age>s（< 30min 视为活跃 / ≥ 30min 视为 stale 需用户确认）。请按 policies/ship-lock.md 处理或等待对方 ship 完成。` |
| H12 | `[polaris-flow] 阻断：写 workflow.yaml 必须先获取 .polaris/.locks/workflow.lock（HARD STOP H12）。6s 内未获取到锁，持有者 <lock_content>。请按 policies/workflow-lock.md 处理。`（或写后校验失败时：`[polaris-flow] 阻断：workflow.yaml 写后校验未通过（HARD STOP H12）。期望 <expected>，实际 <actual>，请手动修复后重试。`） |
| H13 | `[polaris-flow] 阻断:即将调用 <superpowers:subagent-driven-development \| superpowers:executing-plans>,该派发驱动器已被全局禁用(HARD STOP H13)。请改为:① 先调 {{SKILL_NAME_PREFIX}}subagent-probe(platform=<id>) 取得 agents/degradation;② 主代理用宿主原生 Task / AgentTool 直接派发(agent 路径、builtin id 或默认 subagent),或 inline 执行(degradation 为 inline/unsupported 时);③ 绝不回退到 superpowers 派发驱动器。` |
| H14 | `[polaris-flow] 阻断:开发类路径(已选功能 = P01/P02/P03/M01/M03)必须先走完 polaris:flow 零步,把 需求内容 填到非 待预检 且非 无(HARD STOP H14)。当前 需求内容=<值>,应停在 Step 0.1 识别 → 0.2 强制附需求 → 0.3 询问自动评估 → 0.4 自动路由,而不是直接加载技能。` |