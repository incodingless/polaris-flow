# 自动衔接下一阶段协议

> 阶段守卫推进后的自动衔接规则。各skill 共同遵守的全局约束。

## 术语区分

「阶段推进」由**各阶段技能在自己的出口完成** —— 技能内联调用
`workflow-entry update-active --set phase=<下一阶段>`，持 `.polaris/.locks/workflow.lock`。
这一步**始终发生**，与 `auto_transition` 无关。本协议的「自动衔接」决定**衔接方式**：
manual 停下并请用户新开会话，auto 则先压缩上下文再执行下一个 skill（见下方两节）。

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

退出条件满足、阶段产物落盘且阶段推进后，运行：

```bash
node polaris-flow state next <change-name>
```

脚本根据 `phase`、`workflow`、`auto_transition` 输出确定性的下一步：

- `NEXT: auto` → **先压缩上下文，再执行 `SKILL`**（见下「auto 模式」）
- `NEXT: manual` → **不要**调用下一 skill；输出提示语，要求用户**新开会话并输入该技能名**（见下「manual 模式」）
- `NEXT: done` → 流程已完成，无需继续

约定只有一条：**游标 phase = 接下来要执行的阶段 ⇒ 同名映射**（游标是 `build` 就跑
`build` 技能）。例外（入口阶段、旁路阶段、技能名与阶段码未对齐的族）登记在阶段表的
`skill` 字段上，不在本文件里另立清单。

### manual 模式（出厂默认）

命中条件：`auto_transition` 为 `false` / `'off'`，或任务 state 的 `auto_transition: false`。

**输出提示语后停下**，不调用任何技能：

```text
[<族> <技能>] <阶段>完成，状态已落盘。
请新开会话，执行 /<下一技能>。
恢复：先读 <文件1>、<文件2> 的 <字段>，再从 <步骤> 继续。
```

> 「清空上下文」在本协议中**统一等于「用户新开会话」**，不存在第二种清空动作。

### auto 模式

命中条件：`auto_transition: 'auto'`（config 或任务 state），**且** `context_compression ≠ off`。

**agent 没有压缩原语**：五个平台（Claude Code / Cursor / Trae / Trae-CN / Qoder）的压缩入口全部
需要用户操作（点按钮 / 输入斜杠命令）或宿主在阈值自动触发。因此 auto 是**半自动**，执行序六步：

1. 落盘本阶段全部产物（出口契约四件）；
2. 运行 `state next`，取得 `NEXT: auto` 与 `SKILL`；
3. 把「下一步 = `SKILL`」与恢复清单**写进落盘文件**——压缩后当前会话不再可靠记得它；
4. 按**本平台本形态的压缩动作**输出提示，**停下等用户完成压缩**：
   - 动作直接取自 SessionStart 注入的 `CONTEXT_COMPRESSION_ACTION`；
   - 宿主形态未知时该值为两种形态的合并描述（自动降级为双形式提示），无需技能侧写条件分支；
   - 动作表与平台依据见 `docs/specs/2026-09-22-context-boundary-and-compaction-design.md` §5.6.1。
5. 用户确认完成后，执行 `SKILL`；
6. 执行前重读恢复清单，校验落盘产物仍在（压缩后的防线）。

**配置约束**：`auto_transition: 'auto'` 蕴含 `context_compression ≠ off`。
写成 `auto` 而 `context_compression: off` = 「不能压缩却要自动跑」→ **非法组合**，
应拦截或降级为 manual；**不得**退化成「背着历史在同一会话继续跑」。

**恢复信号**：Claude Code 的 SessionStart `source=compact` 表示压缩确实发生过，可用于第 5→6 步的
校验；其余平台无此信号时以用户确认为准。改任一平台的动作描述，须同步本节的引用处与
`src/core/domain/platforms.ts` 的 `compressionAction`。

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
