# Polaris Flow — 项目长期记忆

## 引用与安装（最高优先，勿回退）
- 命令前缀 `psfl`（`POLARIS_COMMAND_PREFIX`）与技能插件名 `polaris`（`POLARIS_PLUGIN_NAME`）刻意解耦；改命令前缀必须先拆分。
- 引用形态仅两种，不得混用：**技能名** = `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`（无斜杠）；**命令名** = `/psfl{{CMD_SPR}}coding{{CMD_SPR}}tweak`（带斜杠）。**「技能名加斜杠」是坏引用**。
- ⚠️ 边界（2026-10-15 用户纠正）：正文里「转交/回退到某技能」（如 ship「终验失败 → 回 verify」）是描述流程逻辑，**合理、不算坏引用**；其中带斜杠只是措辞一致性问题（`/polaris:` 斜杠暗示命令、前缀应为 psfl），非逻辑错误，勿机械清理。
- 技能资产不得反向引用命令（`/psfl:*`、flow 菜单编号 C01/M01 等）；要表达档位用层内表述（`tweak`/`normal`/`strict`）。
- 占位符仅在 skills/commands 域展开；`install/skills.ts` 只替换 `{{SKN_SPR}}`；`{{CMD_SPR}}` 只在命令域。

## 三层架构（权威源 `src/core/config/task-kind-layout.ts`）
- 三层：入口层（tweak/normal/strict 薄编排，只声明档位）→ 调度层 `intake` → 执行层（specify→plan→design(可选)→tasks→build→verify→ship）+ 旁路 retro。
- 执行层唯一入口 = `intake`：不得被直接调用、不得互相调用、不得加载 intake；阶段出口的自动衔接也回 intake。
- 档位序列唯一真相 = `TaskKindLayout.modePhases`：tweak=跳过 plan/design；normal=跳过 design；strict=全序列。
- `workflow.mode` 三值 `tweak|normal|strict`（`full` 已改名，别名已删，存量 full/delivery 不再识别）；中文名「工作流」。
- 档位升降唯一位置 = `specify` 出口（Step 5.5），过即冻结；其余阶段纯按 `skill` 字段转交。

## intake（调度层）
- `task-entry` 原语 = intake 专用（六出口 resume/handover/create/select/resolve-drafts/block）；恢复分发用只读 `get-active-changes`。
- intake Step1–4：恢复分发 → 入口判档（仅零个）→ 任务初始化 → 转交；上游已指定 `task_id` 则跳过枚举（机器交接免提问）。
- 执行层 Step1「接收 intake 交接」：必给 `task_id` + `worktree_path`（空=主仓）；没有则阻断，不得自行枚举在途任务。
- retro = 调度层唯一豁免：不进场序列、不需 `task_id`、由用户直接调用（「看度量/复盘」），intake 不转交它。

## 值域（2026-10-12 裁定，勿再动）
- `complexity_level`/`risk_level`/`current_tier` = `trivial|standard|critical`（方向 critical > standard > trivial）。
- 分级→档位映射单源（`risk-signals.md` §1）：trivial→tweak / standard→normal / critical→strict；技能侧不内联。

## 用户约定
- 配置归代码（禁止 policy 承载配置表）；写 `state.yaml` 一律走 `scripts/task-state-entry.sh`（禁直写 yaml 块）。
- 双语言：先写中文（`assets/zh/skills/`），用户确认后再同步英文；未同步前不写 Changelog。当前英文版暂不处理。
- 候选呈现（用户手定）：单行 `<task_id> (工作流：<mode_label>，阶段：<phase_label>，技能：<skill_label>)`。
- 每轮改动后跑 26/26 技能测试通过方可提交。

## 测试与工具坑
- 测试族固定 `testing`（不可改 test）；coding 族 12 技能。
- 本机 BSD grep 不支持 `\|`；用 Grep 工具。用户用 Typora 打开 docs 会静默覆盖 AI 写入，写前 `lsof` 查占用。
- `state.example.yaml` 混有用户手改，回退禁用 `git checkout`。
