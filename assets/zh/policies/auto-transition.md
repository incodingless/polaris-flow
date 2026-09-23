# 自动衔接下一阶段协议

> 阶段守卫推进后的自动衔接规则。各skill 共同遵守的全局约束。

## 术语区分

「阶段推进」由**各阶段技能在自己的出口完成** —— 技能内联调用
`workflow-entry update-active --set phase=<下一阶段>`，持 `.polaris/.locks/workflow.lock`。
这一步**始终发生**，与 `auto_transition` 无关。本协议的「自动衔接」决定**衔接方式**：
manual 停下并请用户新开会话，auto 则先压缩上下文再执行下一个 skill（见下方两节）。

> 推进机制只有这一条路径，**不存在** guard 之类的中间层。

**进度判据：`workflow.yaml` 的游标是唯一权威** —— 语义是「接下来要执行的阶段」。
`state.yaml` 的 `phase` 是**只写不读的镜像**（`src/` 内零读取方；coding 族从不调用`enter-phase/complete-phase`，其值长期停在建任务时写的入口阶段），**不得**用它判断进度。

## 执行方式

退出条件满足、阶段产物落盘且阶段推进后，运行：

```bash
polaris-flow state next <change-name>
```

它**只接收 `change-name`**（用于定位任务），三个判定值都由脚本自己读盘：

| 判定值 | 来源 |
|---|---|
| `phase` | `.polaris/workflow.yaml` 中该任务条目的 `phase` —— 即上文所说的**游标**（唯一权威） |
| `kind` | 同一条目的 `kind`，决定映射到哪个族的技能（coding / prd / prototype / debug） |
| `auto_transition` | `.polaris/config.yaml` **与** `.polaris/tasks/<task_id>/state.yaml`；任一为 `off` / `false` 即 manual |

输出确定性的下一步：

- `NEXT: auto` → **先压缩上下文，再执行 `SKILL`**（见下「auto 模式」）
- `NEXT: manual` → **不要**调用下一 skill；输出提示语，要求用户**新开会话并输入该技能名**（见下「manual 模式」）
- `NEXT: done` → 流程已完成，无需继续

约定只有一条：**游标 phase = 接下来要执行的阶段 ⇒ 同名映射**（游标是 `build` 就跑
`build` 技能）。例外（入口阶段、旁路阶段、技能名与阶段码未对齐的族）登记在阶段表的
`skill` 字段上，不在本文件里另立清单。

### manual 模式

命中条件：`auto_transition` 为 `false` / `'off'`，或任务 state 的 `auto_transition: false`。

**输出提示语后停下**，不调用任何技能。提示语**不在本节另立模板** —— 唯一来源是下方
「压缩时机与恢复清单」的**层级 C 提示语模板**；manual 下下一技能必为跨技能，故固定取
「**建议新开会话**」那一支（模板第 2 行的左支）。

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
   - 动作表与平台依据见开发仓的 `docs/specs/2026-09-22-context-boundary-and-compaction-design.md` §5.6.1。
5. 用户确认完成后，执行 `SKILL`；
6. 执行前重读恢复清单，校验落盘产物仍在（压缩后的防线）。

**配置约束**：`auto_transition: 'auto'` 蕴含 `context_compression ≠ off`。
写成 `auto` 而 `context_compression: off` = 「不能压缩却要自动跑」→ **非法组合**，
应拦截或降级为 manual；**不得**退化成「背着历史在同一会话继续跑」。

**恢复信号**：Claude Code 的 SessionStart `source=compact` 表示压缩确实发生过，可用于第 5→6 步的
校验；其余平台无此信号时以用户确认为准。改任一平台的动作描述，须同步本节的引用处与
`src/core/domain/platforms.ts` 的 `compressionAction`。

## 压缩时机与恢复清单

> **本节的用词与两个模板是唯一来源**。技能正文只填自己的「读什么 / 从哪继续」，不另立说法。

### 用词

- **压缩上下文** = 让宿主对会话历史做摘要（compact），**会话不重置**。这是唯一说法。
- **新开会话** = 用户关闭当前窗口并新开一个（历史归零、SessionStart 重跑）。**不要**用「清空」指代它 ——
  「清空」在本协议里已统一等于「用户新开会话」。
- **恢复清单** = 新会话（或压缩后）继续工作所需的**最小读取集**。

### 三个时机

| 层级 | 时机 | 前提 | 输出 |
|---|---|---|---|
| **A 步骤级** | 单个 Step 收尾 | 本步操作**已完成** **且** 产出**已落盘** | 可选的不阻塞提示（下模板） |
| **B 委派级** | 需要大段读取 / 调研 / 派发时 | 见 `subagent-dispatch/references/dispatch-execute.md` 的 D-0.1 / D-0.2 | `materials` 只给路径；回报只给状态 + 产物路径 + 短列表 |
| **C 阶段级** | `complete-phase` / `update-active` 成功后 | 退出条件已满足 | **必发**的不阻塞提示（下模板） |

### 层级 A 提示语模板

```text
本步已完成，产出已落盘：<路径>。
如当前会话上下文紧张，可压缩上下文；压缩后从 <文件> 的 <章节/字段> 恢复。
```

**禁止**：在步骤中途提压缩；用 shell 命令或摘要**伪造**压缩。

### 层级 C 提示语模板

**本模板是 manual / auto 两种衔接模式的共同来源**，两者差异只在第 2 行取值与后续动作：

```text
[<族> <技能>] <阶段名>完成，状态已落盘。
下一步：/<下一技能>（<建议新开会话 | 可同会话继续>）。
恢复：新会话中先读 <文件1>、<文件2> 的 <字段>，再从 <步骤/章节> 继续。
```

- **跨技能**（下一技能 ≠ 本技能）→ 写「建议新开会话」；
- **同技能内跨步骤** → 不必新开会话，按层级 A 处理；
- **存在未过的人工门禁** → **不得**提压缩，先等确认。

### 恢复清单四件

任何写「恢复清单」的地方**只写这四件**：

1. **任务身份**：`task_id` 与产出目录
2. **进度依据**：读哪个落盘产物判断做到哪 —— **不要**读 `state.yaml.phase`（它是非权威镜像）
3. **上一段产出**：本技能最近一次落盘的文件与字段
4. **起始步骤**：从本技能的哪个 Step 继续

> `state.yaml` 只记身份与指针、**不记进度** —— 进度一律以落盘产物为准（产物即状态）。

## 阶段名的合法值

**写入前请确认取值合法 —— 原语会校验**：
`workflow-entry update-active --set phase=X`、`append-active --phase=X`、`task-state-entry enter-phase/complete-phase --phase|--next-phase` 都会拒绝未知阶段、打印合法集合并以退出码 3 中止。

- 合法值 = 该 kind 阶段表已登记阶段 ∪ `idle` ∪ 历史别名 `delivery`/`archive`
- `idle` 不是阶段（「无阶段」空值），不占进度分母，但**允许写入**（存量数据与 initPatches 都写它）
- 确需写入表外值（一次性修正存量数据）时加 `--force-phase`；**绕过不静默**，会记入
  `.polaris/overrides.log`（含当时合法集合，便于事后判断该不该放行）
