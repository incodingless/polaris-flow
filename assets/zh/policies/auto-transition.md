# 自动衔接下一阶段协议

> 阶段守卫推进后的自动衔接规则。各skill 共同遵守的全局约束。

## 术语区分

「阶段推进」由**各阶段技能在自己的出口完成** —— 技能内联调用
`workflow-entry update-active --set phase=<下一阶段>`，持 `.polaris/.locks/workflow.lock`。
这一步**始终发生**，与 `auto_transition` 无关。本协议的「自动衔接」只决定**是否自动调用
下一个 skill**，由 `auto_transition` 控制。

> **2026-09-20 订正**：本节原写「由 guard `--apply` 完成，更新 `.polaris/workflow.yaml`
> 和 `.polaris/<change_id>/state.yaml` 的 `phase` 字段」。那个 guard **在代码里不存在**
> （全仓 grep 只命中本文件），且 `<change_id>` 路径早已失实（实际是
> `.polaris/tasks/<task_id>/`）。真实机制就是上面那句内联命令。
>
> 另需澄清：`state.yaml` 的 `phase` **不是**与游标同步维护的第二份真相，而是**只写不读的
> 镜像**（`src/` 内零读取方；coding 族从不调用 `enter-phase/complete-phase`，其值长期停在
> 建任务时写的入口阶段）。**权威始终是 `workflow.yaml` 的游标**，语义是「接下来要执行的
> 阶段」。完整调研见开发仓的 `docs/specs/2026-09-19-phase-truth-unification-design.md`。

## 执行方式

退出条件满足且阶段推进后，运行：

```bash
node polaris-flow state next <change-name>
```

脚本根据 `phase`、`workflow`、`auto_transition` 输出确定性的下一步：

- `NEXT: auto` → 调用 `SKILL` 指向的 skill 进入下一阶段
- `NEXT: manual` → 不要调用下一 skill，按 `HINT` 提示用户手动运行 `/<SKILL>`
- `NEXT: done` → 流程已完成，无需继续

约定只有一条：**游标 phase = 接下来要执行的阶段 ⇒ 同名映射**（游标是 `build` 就跑
`build` 技能）。例外（入口阶段、旁路阶段、技能名与阶段码未对齐的族）登记在阶段表的
`skill` 字段上，不在本文件里另立清单。

## 阶段名的合法值

**写入前请确认取值合法 —— 原语会校验**（2026-09-20 起）：`workflow-entry update-active
--set phase=X`、`append-active --phase=X`、`task-state-entry enter-phase/complete-phase
--phase|--next-phase` 都会拒绝未知阶段、打印合法集合并以退出码 3 中止。

- 合法值 = 该 kind 阶段表已登记阶段 ∪ `idle` ∪ 历史别名 `delivery`/`archive`
- `idle` 不是阶段（「无阶段」空值），不占进度分母，但**允许写入**（存量数据与 initPatches 都写它）
- 确需写入表外值（一次性修正存量数据）时加 `--force-phase`；**绕过不静默**，会记入
  `.polaris/overrides.log`（含当时合法集合，便于事后判断该不该放行）

## 预设路由

> ⚠️ **当前未实现**（2026-09-20 标注）。下面这段描述的是设想行为：`resolveNextSkillName`
> 曾有 `_channel` 参数但从未使用，非 debug 族不做任何 mode/channel 分派。实现与否另案。

`polaris-flow:hotfix` 时，`phase: build` 返回 `polaris{{SKN_SPR}}maintance{{SKN_SPR}}hotfix`；`polaris-flow:tweak` 时返回 `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak`。其余 phase（`verify`、`archive`）按标准 Skill 名称返回（`polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`、`polaris{{SKN_SPR}}coding{{SKN_SPR}}ship`），不受 workflow 类型影响。预设 Skill 内部的"连续执行模式"可能覆盖 `auto_transition` 行为——详见对应预设的 `<IMPORTANT>` 块。
