# intent research 模板

> **使用约定**：本模板由 `clarify` skill Step 4.1 引用。clarify 主代理读取本模板后，按节顺序填充 `.polaris/tasks/<draft_or_id>/intention.md`（propose 成功后迁入 `openspec/changes/<change_id>/intention.md`，不留备份）；各节内容来源标注见行内注释。
---

# 任务意图调研结果: <task_id>

## Reframe 历程
<!-- 来自 design Step 3.2，一行 -->
- 原始诉求 X → 用户接受 Reframe 为 Y（或："用户拒绝 Reframe，保留原始 framing X"）

## 宪法对齐
<!-- 来自 design Step 2，逐条对齐 Core Principle -->
- Principle 1: <如何对齐>
- Principle 2: <如何对齐>
- ...

## 前提
<!-- 来自 design Step 3.4，用户已逐条确认的前提 -->
1. <前提原文>
2. <前提原文>

## 前提历史
<!-- 来自 design Step 3.4，被拒绝/修改过的前提及其历史 -->
- <历史前提> → <修正后的前提>，原因：<...>

## 目标
<!-- 任务的需要达成的目标概述 -->

## 结论（架构 + 技术选型）
<!-- 来自 design Step 3.3 用户选定方案 -->

### 架构
<...>

### 技术选型
<...>

## 备选方案
<!-- 来自 design Step 3.3 未选方案 -->

### 方案 B（未选）
- 优点：…
- 缺点：…
- 拒绝理由：…

### 方案 C（未选）
- ...

## 任务范围（Scope）
- 包含：<...>
- 不包含：<...>

## 验收场景及标准
<!-- 来自 Step 3.3 验收场景及标准 -->

## 待决问题
<!-- openspec-explore 中悬而未决、留给 design 阶段消化的问题 -->
- <...>

## 下游约束

- tasks.md 生成：propose 出粗骨架；**plan 阶段**覆写细计划前需 `read_file templates/tasks-template.md`（TDD=5步 / 非TDD=3步）
- propose / plan 出口均由 `hooks/tasks-lint.sh` 脚本校验，不合规即阻断
- plan 完成后须经 `plan-review`（STATUS 门禁）方可进入 build


---


