# Constitution Audit — 合规审计规则

> 由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`（注入点 D）、`polaris{{SKN_SPR}}coding{{SKN_SPR}}normal`（注入点 D，轻量版）与 `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak`（出口检查）共同引用。
> **本文件是宪法合规审计规则的唯一来源**，各技能只引用、不复制。

## 核心原则

Constitution Audit 是「宪法注入点 D」的执行规则：逐条核对实施产出是否符合宪法 Core Principles。

## 前置条件

1. `constitution-validity.sh` 返回 exit 0（宪法有效）
2. 若 exit 1 或 2 → 按 `constitution_required` 配置处理

## 审计流程

### 1. 读取宪法

```
read openspec/memory/constitution.md
提取所有 Core Principles（## Core Principles 下的 ### 节）
```

### 2. 逐条核对

对每条 Principle：
- 检查实施产出是否有违规
- 违规分级：
  - `NON-NEGOTIABLE` 标记的原则 → **Critical**（必须修复）
  - 其他原则 → **Major**（应修复）

### 3. 输出违规清单

```markdown
## Constitution Compliance Audit

| # | Principle | 状态 | 违规描述 |
|---|-----------|------|---------|
| I | Test-First (NON-NEGOTIABLE) | ✅ / ❌ | {{DETAIL}} |
| II | Library-First | ✅ / ❌ | {{DETAIL}} |
```

**落盘**：违规清单作为**调用方报告的一节**嵌入 —— `verify` / `normal` / `tweak` 均写入各自的 `openspec/changes/<change_id>/reviews/verify-report.md` 的 Constitution 摘要节；独立调用时由调用方给定路径，未指定则仅会话输出（**无恢复点**）。

### 4. 违规处理

若有任何 Critical 或 Major 违规：
- 停等用户三选项：
  1. 自己修复违规代码
  2. 接受违规（记录到 overrides.log）
  3. 重做整个任务组

## STATUS 聚合规则

取 Constitution Audit 与其他审查中更严者作为最终 STATUS。
