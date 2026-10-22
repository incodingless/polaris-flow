---
name: polaris{{SKN_SPR}}constitution
description: "用户触发 /polaris{{SKN_SPR}}constitution，或要求创建 / 修正 / 查看项目宪法时必须使用本 skill。管理 openspec/memory/constitution.md 的 CREATE / AMEND / SHOW 三种模式。"
---

# constitution

<HARD-GATE>
禁止在未进入显式 CREATE / AMEND 模式的情况下修改 constitution.md（不允许静默编辑）。禁止在没有用户明确确认的情况下把某条 Core Principle 标记为 (NON-NEGOTIABLE)。宪法驱动下游注入点 A（加载宪法）/ C（实施前）/ D（验证审计），任何变更都会向后传导。
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 宪法] 进入阶段: constitution — 使用 polaris{{SKN_SPR}}constitution 技能。`

## Overview

宪法管理 skill。三模式：CREATE / AMEND / SHOW。

## 三模式

| 检测条件 | 模式 |
|---------|------|
| constitution.md 不存在 | CREATE |
| 存在但含 `[ALL_CAPS_PLACEHOLDER]` | CREATE |
| 存在且无占位符 | AMEND |
| 用户传入 `show` | SHOW |

## Policies

| Policy | 文件 | 作用 |
|--------|------|------|
| CREATE | `./policies/constitution-create.md` | 引导用户填写模板 |
| AMEND | `./policies/constitution-amend.md` | 修正流程 + 版本号 + Sync Impact Report |

> **注入点的落地位置不在本技能**：A / C / D 三点分别内联在 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal`（加载宪法）、`polaris{{SKN_SPR}}coding{{SKN_SPR}}build`（实施前）、`polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`（验证审计）等阶段技能里；审计规则见 `./policies/constitution-audit.md`。原「注入点 B（lock 完成后）」随 lock 相位退役，评审已由 `tasks` 承担。

## 有效性判定（Law #4 升级为 MACHINE_VERIFIED）

脚本驻留 plugin 内部；缺失则按"不存在"处理并提示重启会话。

```bash
bash "$PLUGIN_ROOT/scripts/constitution-validity.sh"
# 退出码：0=有效 / 1=无效（含未替换占位符）/ 2=不存在
```

**每个注入点入口**（A / C / D）先跑本脚本：exit 0 → 执行注入；exit 1 或 2 → `constitution_required=true` 时阻断，`=false` 时警告后跳过。

## 配置

```yaml
constitution:
  required: false       # true 时未生成有效宪法的项目阻断 plan/apply
  path: "openspec/memory/constitution.md"
```
