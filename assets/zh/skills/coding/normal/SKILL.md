---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}normal
description: "常规需求开发工作流的入口：只声明档位，然后交给任务管理与调度技能 intake。适用于多模块协作 / 需规格契约的中等需求。不要用于：单模块单文件的轻量改动（走 tweak）、跨服务高风险的复杂需求（走 strict）。"
version: 0.1
---

# coding 工作流入口 - 常规需求（normal）

<HARD-GATE>
本技能**只声明档位**，然后把控制权交给 `intake`（任务管理与调度）。

- **禁止**在本技能内做任何任务判定、建任务、或产出任何阶段产物
- **禁止**内联「档位 → 阶段序列」表（唯一源 = 代码表 `src/core/config/task-kind-layout.ts` 的 `phasesForMode`）
- **禁止**在本技能内判断档位升降 —— 升 / 降档只在 `specify` **出口**发生
- **H8**：Step 入口输出状态行
</HARD-GATE>

## 本档序列（取自代码表，本技能不复制）

`specify → plan → tasks → build → verify → ship`（跳过 `design`）

## 流程

### Step 0：设置产物语言

**执行**：`LANG=$(node "$PLUGIN_ROOT/scripts/get-language-name.mjs")`（输出语言显示名，如 `中文` / `English`）；退出码 `≠ 0` 时回退到当前用户请求语言。

### Step 1：交给任务管理技能

同会话加载 `polaris{{SKN_SPR}}coding{{SKN_SPR}}intake`，并在交接中**声明本次工作流**：

> 本次工作流 = **`normal`**（常规需求）。
> 它作为 `intake` 的 `--mode`：`intake` 可据此跳过入口判档，或按信号表复核后向用户提议升级。

本技能到此结束 —— **任务的建立、档位落盘、阶段转交全部由 `intake` 执行**（见其 Step 1–4）。
