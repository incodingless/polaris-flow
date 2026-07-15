---
name: polaris-flow-retro
description: "用户触发 /polaris-flow-retro 或要求查看度量 / overrides / 改进建议时必须使用本 skill。聚合 .harness/metrics/ 与 .polaris/overrides.log，输出回顾报告。"
---

# Polaris Flow 阶段X：复盘(retro)

<HARD-GATE>
禁止凭空捏造度量数据或跳过 .polaris/metrics 聚合环节。若不存在度量数据（尚未运行过 audit），必须明确告知用户，禁止生成空报告或编造内容。
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入阶段: 复盘 — 使用 polaris-flow-retro skill。`

## Overview

度量回顾 skill。聚合 `.polaris/metrics/` 下的历史数据，分析趋势，生成改进建议。

## 触发模式

- `/polaris-flow-retro` — 输出当前项目度量概览
- `/polaris-flow-retro monthly` — 输出月度回顾报告

## 数据源

1. `.polaris/metrics/*-metrics.json` — 各次 audit 的 scorer 结果（**全局聚合视图**：含 ship 阶段从 worktree 合回的历史，跨 change 趋势分析直接 glob 用）。**稳定契约**：本路径是 reflect 全局视图的唯一数据源；archive 子目录下的 metrics 副本仅供"按 change_id 回看"，**不可视为冗余而清理顶层目录**——否则破坏跨 change 趋势分析。每个 metrics JSON 顶层带 `change_id` 字段（v0.3.7 起），reflect 可按 change 归因分桶；缺失或为空字符串视为"未归因"，单独一桶展示
2. `.polaris/overrides.log` — 所有 override 记录（team 模式；含 ship 合回的 worktree override 追加）
3. `.polaris/workflow.yaml` — 全局工作流游标（`active_changes` 列出未 ship 的 change，每项含 phase / worktree_path / started_at）
4. `.polaris/changes/<change_id>/state.yaml` — 进行中 change 的业务档案（design→audit 各阶段产物）
5. `.polaris/archive/<change_id>/` — 已 ship 完成的单 change 完整快照（可选追溯入口）：
   - `state.yaml` — 该 change 的 design→ship 终态档案
   - `metrics/*-metrics.json` — 该 change 期间产生的 metrics 副本
   - `overrides.log` — 该 change 期间产生的 override 切片
   - `pre_design.md` — 设计阶段产出（含 worktree 内修订）

> 跨 change 趋势分析仍走数据源 1（顶层 `metrics/`），不必遍历 `archive/*`；archive 仅供"按 change_id 回看单次变更"。

## 输出内容

1. **Scorer 趋势**：每个 scorer 的历史得分曲线（最近 N 次）
2. **Override 分析**：频率、理由分布、是否有反复违规
3. **Constitution 合规**：违规次数和分布
4. **改进建议**：基于低分项和频繁违规提出 2-3 条可操作建议
5. **团队健康度**（team 模式）：阻塞频率、响应时间

## 约束

- 度量计算为 `[MACHINE_VERIFIED]`
- 改进建议为 `[LLM_SELF_CHECK]`
