---
name: polaris{{SKN_SPR}}debug{{SKN_SPR}}bugfix
description: "测试阶段缺陷修复通道（装配入口）。按「triage → diagnose → prescribe（可折叠）→ patch → closeout」五段装配缺陷修复：定性（triage）→ 定位（diagnose）→ 方案（prescribe）→ 实现与自验（patch）→ 关闭Bug（closeout）。本技能只负责场景分流与装配编排，不承载任何阶段的执行细节。用户触发 /polaris{{SKN_SPR}}debug{{SKN_SPR}}bugfix、报告测试环境或提测后回归发现的缺陷、给出用例失败 / 接口报错 / 页面异常等测试证据、或说「测试环境这个功能坏了帮我修」时使用。不要用于：线上 / 生产故障（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}hotfix）、根因其实是需求本身有误（走 polaris{{SKN_SPR}}coding{{SKN_SPR}}normal 或 tweak）、重构与性能优化（走 M03）、根因未定位就要直接改代码。"
---

# 测试缺陷修复通道 · bugfix（装配）

<HARD-GATE>
- 本技能**只做装配**：场景分流 + 决定走哪些阶段 + 每段的档位与加严项 + 人确认点。**禁止在本技能内出现任何阶段的执行细节**（不许写「怎么复现」「怎么跑 lint」）
- 阶段执行逻辑一律在各阶段技能内：`triage` / `diagnose` / `prescribe` / `patch` / `closeout`
- 命中生产信号 → 停止并转 `polaris{{SKN_SPR}}debug{{SKN_SPR}}hotfix`
- 场景分流与边界见 `./policies/scene-routing.md`；能力分档见 `./policies/capability-tiers.md`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 调试]缺陷修复 - 进入测试通道：使用 polaris{{SKN_SPR}}debug{{SKN_SPR}}bugfix 技能。`

## 装配表（测试通道）

```
triage → diagnose → prescribe（可折叠）→ patch → closeout
```

- 不装 `prove`：测试环境没有「类生产」这一层，自验即终验。
- `prescribe` **可折叠**：`prescribe` 与 `patch` 之间无分叉（唯一路径）+ 不跨模块 + 不触发转 normal 的退出条件时，可内联进 `patch`；折叠时仍须产出 `tasks.md` 并过 `tasks-lint`，且不跳过「方案」本身（无分叉即无需询问）。

## 人确认点（本通道 1–2 处）

1. **根因确认（必选）**：`diagnose` 出口，对象是 `reviews/rca-report.md`。
2. **方案确认（仅存在分叉时）**：`prescribe` 出口。唯一路径不询问。

## 各阶段技能（本通道的交接顺序）

| 序 | 阶段技能 | 中文名 | 出口 |
|----|---------|--------|------|
| 1 | `polaris{{SKN_SPR}}debug{{SKN_SPR}}triage` | 定性 | 最小可重复失败 |
| 2 | `polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose` | 定位 | 根因报告 + 人确认 |
| 3 | `polaris{{SKN_SPR}}debug{{SKN_SPR}}prescribe` | 方案 | tasks.md + tasks-lint |
| 4 | `polaris{{SKN_SPR}}debug{{SKN_SPR}}patch` | 实现与自验 | 红绿 + 边界 + 回归 |
| 5 | `polaris{{SKN_SPR}}debug{{SKN_SPR}}closeout` | 关闭Bug | 交付物齐全 + 归档回读 |

## 工作区策略

- `triage` 段询问是否创建 **worktree**（基于当前开发分支，隔离本次修复）；`closeout` 段提交 worktree 并清理（执行细节见 `triage` / `closeout` 技能）

## 运行态

- 任务游标：`workflow-entry append-active --kind debug --channel bugfix ...`（`channel` 固定 `bugfix`）
- 阶段推进：每段 `complete-phase --phase <cur> --next-phase <next>` + `update-active --set phase=<next>`
- 产物契约见 `./policies/artifacts.md`

## 分流出口

- 命中生产信号 → `polaris{{SKN_SPR}}debug{{SKN_SPR}}hotfix`
- 根因是需求有误 / 跨 3+ 模块 / schema 或数据迁移 / 对外 API breaking → `coding/normal`（或 tweak）
- 无法复现也无证据 → 补观测后重新提单
