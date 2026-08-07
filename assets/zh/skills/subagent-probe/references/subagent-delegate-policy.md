# Subagent 派发策略

规范路径：`polaris-flow/references/subagent-delegate-policy.md`

本文件是 **所有派发点 skill 共用** 的通用派发机制。当 `subagent-probe` 返回 `degradation=null`（选定 `agents[i]`）后，调用方必须按本文件执行派发；不得在各自 SKILL 内重写派发分支逻辑。

本文件 **不包含** 各 SKILL 的材料清单——材料清单由调用方 SKILL 作为参数传入本机制。本文件只定义：判定规则 + prompt 模板 + Materials 拼接格式 + 通用约束。

## 适用范围

- propose / design / plan 阶段的主审 subagent 派发
- propose / design / plan 阶段的 Outside Voice `openspec-review-agent` 派发
- 任何其它「需要 subagent 读取材料后评审」的派发场景
- 任何其它 「需要 subagent独立工作」的派发场景

不适用：
- `degradation=inline` / `unsupported` / `empty` 的退化分支（见 `degradation.md`）
- build 阶段的 implementer 派发（如适用，由 build skill 自定）

## 输入参数

调用方在派发前必须准备以下参数交给本机制：

| 参数 | 必填 | 说明 |
|---|---|---|
| `change_id` | 是 | OpenSpec change 标识 |
| `subagent_type` | 是 | 选定的 subagent（如 `plan-review-agent` / `openspec-review-agent`） |
| `stage_fields` | 否 | 阶段特定字段（如 `Stage: plan` / `tdd_policy: prefer_tdd` / `StandardsRoot: <path>`），由调用方按阶段拼成多行字符串 |
| `materials` | 是 | 材料清单数组，每项是一个相对路径或绝对路径；调用方按各自 SKILL 的「评审材料清单」节构造；可包含 `PrimaryReport`（OV 派发时） |

## 派发三步式

### Step D-0：工具可用性判定（必走）

选定 `agents[i]` 后、构造 prompt 前，按下列顺序判定该 agent 是否具备「读文件」能力：

1. 取 `agents[i].tools` 数组（由 `subagent-probe` 扫描 agent frontmatter `tools:` 行返回）
2. 若数组含 `read_file` 或 `Read`（任一即可，覆盖 MCP 命名与 Trae/Cursor 工具命名）→ **判定为「路径引用型」** → 走 Step D-1
3. 若数组**不含**上述任一 → **判定为「内容注入型」** → 走 Step D-2

> **`tools` 字段语义**：仅反映 frontmatter 声明，**不保证宿主实际授予**。已知部分宿主（如 Trae Task 工具）会忽略 frontmatter `tools:` 字段，按宿主默认工具集挂载 subagent，导致 frontmatter 声明了 `read_file` 但 subagent 实际跑起来「自述无读文件能力」。
>
> **保守策略**：调用方不确定宿主是否真的授予 frontmatter `tools` 时，**应直接走「内容注入型」**——成本是多读几个文件，收益是消除派发后失败的不确定性。已知 Trae 平台默认走内容注入型。

### Step D-1：路径引用型（工具可用时）

subagent 自读材料，启动 prompt 只给路径清单 + 必填字段。

**prompt 模板**（调用方按参数填充）：

```text
Change: <change_id>
<stage_fields，每行一个字段>
Materials:
  - <materials[0]>
  - <materials[1]>
  ...
```

subagent 按 agent.md 的「输入」节自读 `materials` 中列出的路径。

### Step D-2：内容注入型（工具不可用时）

主代理在派发前先 `Read` `materials` 数组中每个路径的全文，按统一格式拼入 prompt 的 `Materials:` 段；subagent 不需读文件能力即可评审。

**Materials 拼接格式**：

```text
## File: <materials[i]>
<文件全文>

## File: <materials[i+1]>
<文件全文>

...
```

每条以 `## File: <相对路径>` 起始，后接文件全文，文件之间空行分隔。**禁止**摘要替代全文。

**prompt 模板**（调用方按参数填充）：

```text
Change: <change_id>
<stage_fields；StandardsRoot 类字段在注入型下仅作溯源标注用>
Materials:
## File: <materials[0]>
<全文>

## File: <materials[1]>
<全文>

...（按 materials 数组顺序全部注入）...
```

注入型下 subagent 不需读文件能力，直接基于 `Materials:` 段评审。

## 通用约定

1. **不附带用户决策**：启动 prompt **禁止**包含用户对前序主审 findings 的采纳/拒绝决策（保独立性）。OV 派发尤其严格执行。
2. **不假设下一步**：subagent 评审结束后**禁止**建议「下一步跑哪个 skill」；由主代理决定。
3. **不向用户提问**：subagent 不得向用户提问；缺信息 → 输出 `NEEDS_CONTEXT` 并列出所需上下文。
4. **不修改任何文件**：subagent 只读 + 评审；落盘由主代理负责。
5. **执行命令禁令**：subagent **禁止**执行 git/npm/pytest 等命令（读代码规则见各 agent.md）。
6. **材料顺序**：注入型下 Materials 按 `materials` 数组顺序拼接，不得自调。
7. **OV 的 PrimaryReport**：OV 派发时若 `materials` 包含 `PrimaryReport`，路径引用型下作为 `Materials` 列表的一项；内容注入型下其全文拼入 `Materials` 段（与其它材料同等处理）。

## 与 degradation.md 的关系

- `degradation.md`：负责 `degradation` 结论的消费（null/empty/inline/unsupported 四分支）+ 「工具可用性判定」的入口提示
- 本文件：负责 `degradation=null` 后的派发执行细节（三分支判定 + prompt 模板 + Materials 格式 + 通用约定）

调用方流程：

```text
subagent-probe → degradation
  ├── null      → 本文件（D-0 判定 → D-1 或 D-2 派发；materials 由调用方传入）
  ├── empty     → degradation.md「empty」分支
  ├── inline   → degradation.md「inline」分支
  └── unsupported → degradation.md「unsupported」分支
```
