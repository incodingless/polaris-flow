# coding 工作流 · 端到端走查（tweak 档）

> 用一个 tweak 档 change 走完整条链路，展示每个阶段「产什么、落哪、谁消费」。本文只关注**产物链**；各技能的详细步骤、HARD-GATE、退出条件见对应 `SKILL.md`，不在此重复。

## 0. 走查前提

| 项 | 值 |
|---|---|
| 需求 | 把登录页按钮文案「登录」改成「立即登录」 |
| 档位 | `tweak`（点 × 表层 → `trivial`） |
| 链路 | `specify → tasks → build → verify → ship`（跳过 `plan` / `design`） |
| `task_id`（示意） | `refine-login-button-label` |

## 1. 产物链总览

| 阶段 | 技能 | 产物 | 落点 | 消费方 |
|---|---|---|---|---|
| 澄清 | `specify` | `intention.md`（9 节极简） | `.polaris/tasks/<id>/`（暂存） | `tasks` |
| 任务 | `tasks` | `intention.md`（迁入）+ `tasks.md`（覆写） | `openspec/changes/<id>/` | `build` |
| 构建 | `build` | 代码改动 | 仓库源码文件 | `verify` |
| 验证 | `verify` | `verify-report.md` + `metrics` | `reviews/` + `.polaris/metrics/` | `ship` |
| 交付 | `ship` | 四件套补齐 + 归档 | `openspec/changes/archive/` + `.polaris/archive/` | 终点 |

> 链路里每个产物都有唯一的「下一站」：`intention` → `tasks` 读、`tasks.md` → `build` 执行、代码 → `verify` 验证、`verify-report`/`metrics` → `ship` 终验与归档。

## 2. 逐步走查

### 2.1 入口与建任务（`tweak` → `intake`）

用户说「把登录按钮文案改一下」。`tweak` 技能**只声明档位**，随即加载 `intake`；`intake` 做入口粗判（`trivial`）、建任务（目录名先取 `draft-*`）、注册游标，转交 `specify`。

- **产物**：无文档；仅 `.polaris/tasks/<draft>/` 目录 + `state.yaml` 游标。

### 2.2 `specify`：澄清（轻量调研）

tweak 档走 `lite-clarify`（不跑 normal/strict 的探索环节）：L1 现状勘察 + L2 六项一次理解确认 → 确认 `task_id` → 落盘 `intention.md`（9 节，内容极简）→ 意图 lint → 用户整体确认 → `finalize`（draft 目录改名为正式 `task_id`）。

- **产物**：`.polaris/tasks/<task_id>/intention.md`，首行 `# intention: <task_id>`（会话丢失后靠它恢复任务身份）。

### 2.3 `tasks`：拆任务

建 `openspec/changes/<id>/` 目录并把 `intention.md` 迁入（`.polaris` 不再留副本）→ 读 `intention`（tweak 档**唯一范围真理**）→ TDD 策略**自动标注**（不询问）→ 覆写 `tasks.md` → 自审 + `tasks-lint` → 定稿确认（人工，tweak 档无独立主审）。

- **产物**：`openspec/changes/<id>/intention.md`（迁入）+ `openspec/changes/<id>/tasks.md`（覆写，含 TDD 标注、Files、Interfaces、验证命令）。

### 2.4 `build`：实现

tweak 档由档位派生 `build_mode=inline` + `review_mode=standard`（不询问）→ 主代理执行 `/opsx:apply <task_id>` → 最终轻量审查。

- **产物**：仓库源码改动（本示例：登录按钮文案对应的前端文件）。

### 2.5 `verify`：验证

编译闸门 → 意图验收 → 自动检查项 → 单元测试 → 覆盖率打分 → 按启发式定 `verify_mode` → 按强度跑测试 → 独立代码评审（`review_mode=standard` 触发）→ 人工业务语义确认 → 落盘证据。

- **产物**：`openspec/changes/<id>/reviews/verify-report.md` + `.polaris/metrics/<UTC时间戳>-metrics.json`（含 `task_id`）+（可选）`reviews/code-review-report.md`。

### 2.6 `ship`：交付与归档

ship lock → 终验 → 分支管理 → 状态写入 → 归档补齐（tweak 档无 proposal/design/specs，补齐四件套）→ 归档询问 → 清理游标。

- **产物**：补齐 `proposal.md` / `design.md` / `specs/<capability>/spec.md` → 归档到 `openspec/changes/archive/YYYY-MM-DD-<id>/` + `.polaris/archive/<id>/`（state 运行态快照）。

## 3. 三档产物差异（一句话）

| 档 | 多产出的产物 |
|---|---|
| `tweak` | 仅 `intention` + `tasks` + 代码 + 验证报告；四件套由 `ship` 归档前补齐 |
| `normal` | 在 `tasks` 前多 `plan` 产出的四件套（proposal / specs / design / tasks 粗骨架） |
| `strict` | 再在 `plan` 后多 `design` 产出的 `detailed-design.md`（及可选专项 `*-design.md`） |
