---
name: polaris{{SKN_SPR}}subagent-probe
description: Subagent 探测技能。接收 platform（与可选的 subagent_id / task_type），按该平台专属扫描策略返回可用 subagent 列表、subagent_id 是否命中、按 task_type 预筛的 matched_agents 子集，以及 platform 级退化结论。纯数据采集，不做任何选 agent / 派发 / 降级决策——决策由调用方（编排型技能）完成。供需要委派独立上下文执行工作的编排型技能在派发前调用。
---

# subagent-probe

## 定位

**探测技能**：由编排型技能在需要 agents 清单或 `task_type`/`subagent_id` 过滤时调用。SessionStart 已写入 `$SUBAGENT_PROBE_CACHE` 时**优先读缓存**再过滤，**不做重复扫盘**；缓存缺失才按 `platform-probe.md` 扫描。**不做任何选 agent / 派发 / 降级决策**。

## 适用场景

调用方技能在以下情况调用本技能：

- 需要按 `task_type` 预筛 `matched_agents`，或检查 `subagent_id` 是否命中
- SessionStart **未**注入能力/缓存，需要完整探测
- 需要正式 probe 回执结构（与直接读 JSON 缓存等价过滤时，仍可用本技能统一出口）

**不设「可跳过」分支**：H10 是硬约束 —— 任何 subagent 派发之前都必须先调用本技能取得平台能力结论（见下方契约）。

**不适用**：
- 派发 subagent 执行任务（用 `polaris{{SKN_SPR}}subagent-dispatch`）
- 选定哪个 agent（由调用方决策）
- 降级 / inline 决策（由调用方决策）

## 调用方契约

**编排型技能在委派 subagent 前必须先调用本技能取得平台能力结论（H10 硬约束，不设跳过分支）：**

1. **必调**：传入 `platform`，等待返回。**不得**以「SessionStart 已注入 `SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION`」「只要默认通用」「已有 `$SUBAGENT_PROBE_CACHE`」为由跳过本技能
2. **按返回结论决策**：
   - `degradation` 为 `inline` / `unsupported` → 调用方回退 inline 或阻断，不派发
   - 否则由调用方从 `agents` 选 agent（`agent=null` = 默认通用），再调 `polaris{{SKN_SPR}}subagent-dispatch` 派发
3. `task_type` → `matched_agents` 预筛、`subagent_id` 命中检查，均在本技能内完成；不传 `task_type` 时 `matched_agents` = `agents` 全量
4. **缺注入且缺缓存**同样调用本技能（探测成本更高，但仍不可省）

拿到 agents 清单后，由调用方自行选 agent，再调用 `polaris{{SKN_SPR}}subagent-dispatch` 派发执行。本技能自身**不写缓存**（SessionStart hook 写入的 `SUBAGENT_PROBE_CACHE` 不算本技能写缓存）。

> **缓存是探测结果的复用，不是探测的替代**：`$SUBAGENT_PROBE_CACHE` 仅用于「本会话内二次取清单」，不得作为跨步骤跳过本技能的理由。

> **勿假定** additionalContext 含全量 agents 列表；全量在 `$SUBAGENT_PROBE_CACHE`（默认 `.polaris/.cache/subagent-probe.json`）。需要 `matched_agents` / `subagent_id` 时仍应调用本技能（可读该缓存），不要只靠上下文摘要。

调用方准备入参时应包含：
- `platform`：宿主平台 id（从 SessionStart 注入的 `PLATFORM_ID` 或项目配置读取）
- `subagent_id`（可选）：检查指定的专用 agent 是否存在。传入后返回中 `subagent_id_found` 标注命中结果
- `task_type`（可选）：用于预筛 `matched_agents`。未传 → `matched_agents` 等于 `agents` 全量

## 输入

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `platform` | string | 是 | 宿主平台 id（如 `claude` / `cursor` / `trae-cn` / `trae`）。调用方宜从 SessionStart `PLATFORM_ID` 或项目配置读取后传入 |
| `subagent_id` | string | 否 | 指定专用 agent 的 id。传入后返回中标注该 agent 是否命中（`subagent_id_found`）并在命中 agent 上标 `selected: true` |
| `task_type` | string | 否 | 任务类型（见 `./references/task-type-mapping.md`）。传入后返回 `matched_agents` 预筛子集 |

**平台补齐**：若调用方未传 `platform`，按未登记平台退化（见输出）。

## 输出

必须返回以下结构化结果（字段齐全；`agents` 可以为空数组）：

```text
platform: <$PLATFORM_ID 或 "">
supports_subagent: true|false
platform_degradation: null | "inline" | "unsupported"
agents:
  - id: <可选，builtin 时为 subagent_type；目录型为文件名 stem>
    path: <可选，相对 repo 根的 .md 路径；builtin 可省略>
    description: <摘要>
    tools: <数组：agent frontmatter 声明的工具清单；无声明或 builtin 置 []>
    task_types: <数组：agent 声明支持的任务类型；空数组为通用型>
    source: directory | builtin
    selected: <bool，仅当 subagent_id 命中该 agent 时为 true；其余 false>
subagent_id_found: true|false
matched_agents: <按 task_type 预筛的候选子集数组；task_type 未传则为 agents 全量>
reason: <短说明>
```

| `platform_degradation` | 含义 | 调用方应执行 |
|---|---|---|
| `null` | 平台支持 subagent 且扫描完成 | 消费 `agents` / `matched_agents` / `subagent_id_found`，自行选 agent 后调用 `subagent-dispatch` |
| `"inline"` | 平台已登记但明确不支持 subagent | 调用方决定 inline 执行或 abort |
| `"unsupported"` | 平台未登记 | 调用方决定 inline 执行或 abort |

> **`agents` 为空** 不再返回 `degradation=empty`——"agents 是否为空"是数据事实，"是否回退默认 subagent / inline"是调用方的决策。probe 只返回数据。
>
> **`null` 作为整份返回值不合法。** 必须始终返回上述结构。
>
> **`tools` 字段约束**：仅反映 frontmatter 声明，**不保证宿主实际授予**。已知部分宿主（如 Trae Task 工具）会忽略 frontmatter `tools:` 字段。调用方据此决定派发时走「路径引用型」/「内容注入型」（见 `subagent-dispatch` 技能）。

## 完整流程

```
[1] 解析 platform（入参优先；SessionStart 的 PLATFORM_ID；否则读项目配置；仍空 → 跳 [6] unsupported）

[2] 缓存优先（SessionStart 快照）
    - 读取 $SUBAGENT_PROBE_CACHE（或 .polaris/.cache/subagent-probe.json）
    - 文件存在且 JSON.platform 与当前 platform 一致
      → 取其中的 supports_subagent / platform_degradation / agents / reason 作为基底
      → 跳到 [4]（不再扫盘）
    - 否则继续 [3]

[3] 能力表 + 扫描（缓存未命中）
    - read_file ./references/platform-probe.md（或与 core `Platform.supportsSubagent` / `resolveSubagentCapability` / `scanSubagents` 等价）
    - 未登记 → supports_subagent=false, platform_degradation=unsupported, agents=[]
    - 已登记且 supports_subagent=false → platform_degradation=inline, agents=[]
    - 已登记且 supports_subagent=true → 按该 platform 专属策略扫描
      - 目录型：见策略表 + ./references/platform-probe.md
      - cursor 额外：目录空时回退 builtin Task 清单（策略表内写死）
      - 对每个 agent 读取 frontmatter 的 description / tools / task_types

[4] 解析 subagent_id（如传入）
    - 在 agents 中按 id 精确定位（目录型匹配文件名 stem；builtin 匹配 id 字段）
    - 命中 → 该 agent 标 selected: true，subagent_id_found=true
    - 未命中 → subagent_id_found=false（不报错，不删除 agents）

[5] 解析 task_type（如传入）
    - read_file ./references/task-type-mapping.md
    - 按 task_type 对 agents 做匹配预筛：
      - 专精型（task_types 含 T）优先
      - 通用型（task_types 为空）次之
    - matched_agents = 预筛结果（专精在前，通用在后）
    - task_type 未传 → matched_agents = agents 全量

[6] 返回完整结构；不弹菜单、本技能不写缓存、不做关键词推荐、不决策
```
## references

| Policy | 路径 | 职责 |
|---|---|---|
| 平台扫描策略 | `./references/platform-probe.md` | platform → 能力 + 扫描方式 |
| 任务类型映射 | `./references/task-type-mapping.md` | task_type 定义 + agent 能力推断与匹配规则（用于 matched_agents 预筛） |
