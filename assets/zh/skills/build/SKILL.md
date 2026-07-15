name: build
description: "用户触发 /poflo:build 或要求实施 / 执行 tasks.md 时必须使用本 skill。选定 implementer subagent，由该 subagent 在自己的会话内执行 /opsx:apply——主代理禁止直接编写实现代码。"

# Polaris Flow 阶段4：计划与构建

<HARD-GATE>
禁止主代理在自己会话内直接编写实现代码。禁止在 Step 1（通过 polaris-flow:agent-selector 完成 Agent Selection）之前调用 /opsx:apply。/opsx:apply 必须由 implementer subagent 执行，而非主代理；subagent 启动 prompt 中必须注入 Constitution C 约束。
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入阶段: build — 使用 polaris-flow:build skill。`

## 前置条件

- Design Doc 已创建（阶段 2 完成）
- 活跃 change 存在

## 遵守的 Hard Stops

本 skill 遵守 `hard-stops.md` 中的：

- **H8**（状态行输出）：每个 Step 入口输出`[polaris-flow] 进入 build Step <N>: <动作>` 等可见状态行
- **H10**（agent-selector 前置）：Step 1 必须先调`polaris-flow:agent-selector`，启动 implementer subagent 前不得跳过 Agent Selection
- **H13**（禁用 superpowers 派发驱动器）：Step 1 返回`"inline"` 时必须由主代理 inline 跑`/opsx:apply`,绝不回退到`superpowers:subagent-driven-development` /`:executing-plans`

## 流程

按以下顺序**逐步**执行，每一步未完成不得进入下一步：

### Step 0：定位 change_id

```bash
WORKFLOW_FILE="$REPO_ROOT/.polaris/workflow.yaml"
yq '.active_changes | map(select(.phase == "build"))'
```

读取 `.polaris/workflow.yaml: active_changes`，筛选 `phase=build` 的 entry：

- **唯一匹配**：取其`change_id`
- **多个匹配**：用`ask_followup_question` 让用户选择
- **零匹配**：阻断，提示"未找到 design 阶段的 active change，请先执行 /poflo:design"

### Step 1：选择工作方式

如果恢复时检测到 `build_pause: plan-ready` 且 `plan` 文件存在，不要重新运行 `writing-plans`。先告知用户当前停在 plan-ready 暂停点；用户确认继续后，设置：

```bash
node "$COMET_STATE" set <name> build_pause null
```

然后继续由用户选择执行方式、TDD 模式和代码审查模式。

在开始执行前，**一次性询问用户**选择执行方式、TDD 模式和代码审查模式：

**执行方式**：

**执行方式推荐规则**：

- 任务数 ≥ 3 → 推荐 A
- 任务数 ≤ 2 且无跨模块依赖 → 推荐 B
- 来自 hotfix 路径 → 推荐 B

运行 `node "$COMET_STATE" set <name> build_mode <subagent_dispatch|inline>`

**TDD 模式**：


| 选项     | 含义                         | 适用场景                                                                            |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| `tdd`    | 每个任务先写失败测试再写实现 | 推荐。变更涉及业务逻辑、新功能、API                                                 |
| `direct` | 直接实现，不强制 TDD 流程    | 变更不需要测试覆盖，或用户选择跳过测试直接写代码。hotfix/tweak 预设默认使用`direct` |

运行 `node "$COMET_STATE" set <name> tdd_mode <tdd|direct>`

**代码审查模式**：


| 选项       | 含义                                                                                             | 适用场景                           |
| ------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `off`      | 不自动派发代码审查                                                                               | 文档、配置、文案、小范围低风险任务 |
| `standard` | 默认不为每任务派发 reviewer，仅当任务命中风险信号时派发每任务 reviewer，外加一次最终轻量代码审查 | 默认推荐，适合大多数普通改动       |
| `thorough` | 为每个任务派发每任务 reviewer（spec + quality），外加一次最终完整审查                            | 高风险、多模块、架构或安全相关改动 |

运行 `node "$COMET_STATE" set <name> review_mode <off|standard|thorough>`

这是用户决策点。**必须按 `comet/reference/decision-point.md` 的协议暂停并等待用户明确选择执行方式、TDD 模式和代码审查模式**，不得根据推荐规则自行选择执行方式、TDD 模式或代码审查模式。推荐规则只能用于说明建议，不能替代用户确认。

`subagent_dispatch` 是脚本级硬约束。`build_mode: subagent_dispatch` 离开 build 阶段前必须同时满足 `subagent_dispatch: confirmed`，否则 `comet-guard.mjs build --apply` 和 `comet-state transition build-complete` 都会失败。

`tdd_mode` 是脚本级硬约束。full workflow 离开 build 阶段前 `tdd_mode` 必须已选择为 `tdd` 或 `direct`，否则 `comet-guard.mjs build --apply` 和 `comet-state transition build-complete` 都会失败。

`review_mode` 是脚本级硬约束。新建 full workflow 离开 build 阶段前 `review_mode` 必须已选择为 `off`、`standard` 或 `thorough`，否则 `comet-guard.mjs build --apply` 和 `comet-state transition build-complete` 都会失败。旧状态文件若没有该字段，按兼容路径继续，但恢复时应补写该字段。

`build_mode` 默认仅 hotfix/tweak 预设使用 `direct`。full workflow 不得默认使用 `direct`。只有用户明确要求跳过计划执行技能，且你已记录显式 override 时，才允许：

```bash
node "$COMET_STATE" set <name> direct_override true
node "$COMET_STATE" set <name> build_mode direct
```

没有 `direct_override: true` 时，full workflow 的 `build_mode=direct` 会被 guard 和状态转换同时拦截。

### Step 2：确定执行agent

如果build-mode == "inline"，表示不用子代理执行，返回"inline"，直接执行Step 3。

build-mode == "subagent-dispatch"，选择系统支持的subagent：

```bash
CONFIG_FILE="$REPO_ROOT/.polaris/config.yaml"
PLUGIN_ROOT="$(cat "$CONFIG_FILE" | grep "plugin_root" | awk -F'"' '{print $2}')"
PLATFORM="$(cat "$CONFIG_FILE" | grep "platform" | awk -F'"' '{print $2}')"
```

**【硬约束】** 在启动 implementer subagent 之前，**必须**先：

1. `use_skill("polaris-flow:agent-selector" platform="$PLATFORM")`
2. 等待返回三态之一(见 selector SKILL.md "输出"节):
   - **agent 文件路径(string)** — 用户从扫描结果中选定一个项目级 agent
   - **`"default-subagent"`** — 用户选 D,主代理用宿主原生 subagent 能力派发,不指定 agent 文件
   - **`"inline"`** — 用户选 I 或取消,主代理在自己会话内 inline 执行,不派发 subagent

返回值用于本次 build 的 implementer 派发(见 Step 2):

- 返回 agent 路径 → 主代理用宿主原生 Task / AgentTool,以该路径作为`subagent_path` 派发
- 返回`"default-subagent"` → 主代理用宿主原生 subagent 能力派发,不指定 agent 文件
- 返回`"inline"` → 主代理在自己会话内 inline 执行`/opsx:apply`(注入点 C 由主代理负责)
- 宿主无 subagent 能力 →**强制退化为 `"inline"`**:跳过 Step 2 的 subagent 启动,直接由主代理执行`/opsx:apply`

### Step 3：用选择的agent `/opsx:apply`

**组装启动 prompt**：`read_file $PLUGIN_ROOT/skills/build/assets/implementer-prompt.md` 取 prompt 模板原文（含三段：任务 / Constitution 注入点 C / 返回契约），把模板中的占位符 `<change_id 或省略>` 用 Step 0 定位结果替换（trivial 路径下保持 `<省略>` 含义即整个方括号删掉，让 apply 自行推断）；其它 `<N.M>` / `<...>` 等占位符是 subagent 运行时自填，**保持原样**不要替换。

按 Step 2 返回值分三个分支:

#### 3.1 — 返回 agent 文件路径(string)

主代理通过宿主原生 Task / AgentTool 派发 subagent:

- `subagent_path` = Step 1 返回的 agent 路径
- `prompt` = 上一步组装的启动 prompt

主代理在 subagent 运行期间**不得干预**,只接收最终汇报。

#### 3.2 — 返回 `"default-subagent"`

主代理通过宿主原生 Task / AgentTool 派发 subagent,**不指定 `subagent_path`**(由宿主默认 subagent 接管):

- `prompt` = 上一步组装的启动 prompt

主代理在 subagent 运行期间**不得干预**,只接收最终汇报。

#### 3.3 — 返回 `"inline"`(主代理 inline 执行)

主代理在自己的会话内执行 — 不派发任何 subagent
`/opsx:apply` 返回（或 subagent 返回汇报）后，校验：

1. `tasks.md` 中所有任务 checkbox 已勾选完成（`- [x]`）——**存在任何 `- [ ]` 即视为未完成**
2. apply 输出`Implementation Complete` 摘要（参考`apply-change.ts` 输出格式）
3. 主代理未直接编写实现代码（违反 Step 1 跳过自检即视为流程失败）

### Step 4：出口校验

`/opsx:apply` 返回（或 subagent 返回汇报）后，校验：

1. `tasks.md` 中所有任务 checkbox 已勾选完成（`- [x]`）——**存在任何 `- [ ]` 即视为未完成**
2. apply 输出`Implementation Complete` 摘要（参考`apply-change.ts` 输出格式）
3. 主代理未直接编写实现代码（违反 Step 1 跳过自检即视为流程失败）

**硬阻断(任一项不满足 → 禁止标记 build.status=completed)**:

- 校验 1 不通过(有`- [ ]`) →**阻断**,输出`[easy-flow] 阻断：tasks.md 存在未完成任务,禁止标记 build 完成。` + 列出未完成 task 编号,等待用户指示(继续实施 / 手动标记 / 放弃)
- 校验 2 不通过(apply paused/errored) →**阻断**,呈现 pause 原因与可选项,等待用户指示
- 校验 3 不通过 →**阻断**,流程视为失败
- **全部通过** → 提交 worktree 内改动后标记完成:

```bash
cd "$WORKTREE_PATH"
git add -A && git commit -m "feat($change_id): implementation complete"
```

写 `build.status: completed` 到 state.yaml,输出 `[polaris-flow] build 完成，下一步建议执行 /ezfl:audit`

## Constitution 注入点 C

- 由 implementer subagent(2.A / 2.B 分支)在执行每个 task 前输出`[Constitution C] Task <N.M>: 适用原则 = ...`
- 主代理在 Step 2 组装 prompt 时把本约束作为强制条款注入 subagent 启动 prompt
- 走 2.C 主代理 inline 时,由主代理在执行 apply 前一次性输出本次 build 的原则清单作为 inline 形态,并在每个 task 前补输`[Constitution C] Task <N.M>: ...`
