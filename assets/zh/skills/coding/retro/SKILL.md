---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}retro
description: "输出可追溯复盘报告与改进建议。用户触发 /polaris{{SKN_SPR}}coding{{SKN_SPR}}retro，或要求查看度量趋势 / overrides 分布 / 阶段复盘 / 改进建议时必须使用本 skill。不要用于：伪造尚未存在的 metrics、在本阶段写业务实现、或替代 verify /ship 做验收与交付。"
---

# Polaris 工作流 - 阶段：复盘（retro）

<HARD-GATE>
本 skill **仅**负责：聚合主仓 `.polaris/metrics/` 与 `.polaris/overrides.log`，输出可追溯的回顾报告与改进建议。

- **禁止**凭空捏造分数、违规数、override 条数或趋势；无文件则明确告知，不得生成「空壳成功报告」
- **禁止**跳过 Step 1 的数据盘点直接写结论
- **禁止**把 archive 下的文件当作跨 change 趋势的主数据源（跨 change **只** glob 顶层 `.polaris/metrics/`）
- **禁止**清理或移动顶层 `.polaris/metrics/`（会破坏跨 change 趋势）
- **禁止**本阶段编写业务实现、改 specs、推进 `workflow.yaml` 的 phase
- **H8**（状态行）：每个 Step 入口输出 `[polaris-flow 开发]复盘 - 进入Step <N>: <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]复盘 - 进入阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}retro 技能。`

## 标识约定

| 项 | 路径 / 值 |
|----|-----------|
| Metrics（全局唯一） | `.polaris/metrics/*-metrics.json` |
| Overrides | `.polaris/overrides.log` |
| workflow 游标（只读） | `.polaris/workflow.yaml`（`coding_tasks`） |
| 进行中档案（可选追溯） | `.polaris/tasks/<change_id>/state.yaml` |
| 已交付快照（可选追溯） | `.polaris/archive/<change_id>/`（state 等；叙事文档在 openspec archive；**不含** metrics 副本） |
| OpenSpec 变更（可选叙事） | `openspec/changes/<change_id>/` 或 `openspec/changes/archive/*-<change_id>/` |
| 配置 | `.polaris/config.yaml`（`mode` 等） |

> **链路位置**：`specify → … → verify → ship` 之后的**旁路复盘**，不占用 phase 游标、不推进阶段。  
> verify 写入 metrics；ship 把 worktree 内 metrics / overrides 合回主仓顶层；retro 只读聚合。

## 触发与范围

| 触发 | 范围 |
|------|------|
| `/polaris{{SKN_SPR}}coding{{SKN_SPR}}retro` 或「看度量 / 复盘」 | **overview**：全部历史 metrics（默认最近 20 次；可按用户要求改 N） |
| `/polaris{{SKN_SPR}}coding{{SKN_SPR}}retro monthly` 或「月度回顾」 | **monthly**：`timestamp`（或文件名时间戳）落在**当前 UTC 自然月**内的记录 |
| 用户指定 `change_id` / 「回顾某次变更」 | **by-change**：顶层 metrics 中 `change_id` 等于该值的记录；可辅读 `tasks/` 或 `archive/` 的 state |

用户未说明时默认 overview。多种意图并存时按 decision-point 确认范围，再进入 Step 1。

## 数据源

### Metrics JSON（verify 写入）

每次 verify 一个文件：`.polaris/metrics/<UTC-YYYYMMDD-HHMMSS>-metrics.json`，顶层至少含：

- `timestamp`、`change_id`（缺失或 `""` → 桶名「未归因」）
- `overall_score`、`scorers[]`（`scorer` / `score` / `reason`）
- `audit.violations` / `audit.total_checks`（Constitution 计数；**字段名历史兼容，不是阶段名**）
- `mode`（若有）

### Overrides（尽力解析）

`.polaris/overrides.log`：一行一条。若行内可解析出时间 / `change_id` / 理由则纳入分布统计；无法解析的行计入「未结构化」条数，**不得丢弃不报**。

### Archive / tasks

- 跨 change 趋势：**只**用顶层 metrics  
- 单 change 叙事：用顶层 metrics 按 `change_id` 过滤；需要业务上下文时读 `.polaris/tasks/<id>/state.yaml` 或 `.polaris/archive/<id>/`；需要设计/规格上下文时读 `openspec/changes/<id>/`（或 archive 下对应目录）
- **禁止**假设 archive 内仍有 `metrics/*` 或独立 `overrides.log` 切片（ship 目标态不存副本）

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：解析范围 + 工作目录

输出：`[polaris-flow 复盘] 0.确定复盘范围`

- 确认范围：overview / monthly / by-change  
- 以**主仓**为数据根（metrics / overrides 合回后在主仓；勿只在已删 worktree 里找）  
- 只读 `.polaris/config.yaml` 的 `mode`（solo / team），供报告标注；缺省则写「未配置」

不写 `workflow.yaml`，不改任何 phase。

### Step 1：数据盘点（空则退出）

输出：`[polaris-flow 复盘] 1.数据盘点`

```bash
ls -1 .polaris/metrics/*-metrics.json 2>/dev/null | wc -l
# overrides 可选
test -f .polaris/overrides.log && wc -l < .polaris/overrides.log || echo 0
```

| 情况 | 动作 |
|------|------|
| 零个 `*-metrics.json` | **停止**。告知：「尚无 verify 度量（`.polaris/metrics/*-metrics.json` 为空）。请先对至少一个 change 跑完 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`（若在 worktree 内验证，还需 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` 合回主仓）。」**禁止**编造报告正文 |
| 有 metrics，无 overrides | 继续；Override 节写「无记录」 |
| monthly 筛选后为零 | **停止**。告知本月无度量文件，可建议改跑 overview |
| by-change 筛选后为零 | **停止**。列出顶层 metrics 中出现过的 `change_id`（及「未归因」），请用户重选 |

盘点输出须含：`[MACHINE_VERIFIED]` 文件数、时间跨度（最早/最晚 timestamp）、范围内 change_id 桶列表。

### Step 2：聚合 Scorer 与 Constitution

输出：`[polaris-flow 复盘] 2.聚合评分`

对范围内每个 metrics 文件解析 JSON（坏文件：记入「解析失败」列表，跳过该文件，**不**填假分）：

1. **Overall**：按时间序列列出 `overall_score`（overview 默认最近 N 次）  
2. **分 scorer 趋势**：对 5 个标准名分别取最近 N 次 `score`（`audit-violation-rate` / `constitution-violation-count` / `test-coverage` / `complexity` / `doc-sync`；JSON 里名称以实际 `scorer` 字段为准）  
3. **Constitution**：汇总 `audit.violations` 与 `audit.total_checks`；按 change_id 分桶  
4. **低分项**：`overall_score` 或任一 scorer 持续偏低（相对同范围均值或显式阈值）的条目，供 Step 4 使用  

全部表格与数字标记 `[MACHINE_VERIFIED]`。缺字段写「字段缺失」，不得默认 0 除非 JSON 里真是 0。

### Step 3：综合分析

输出：`[polaris-flow 复盘] 3.综合分析`

读 `.polaris/overrides.log`（若存在）：

- 总行数、可解析行数、未结构化行数  
- 按理由关键词 / 原文聚类的频率（能分则分）  
- 同一 `change_id` 或同一理由反复出现 → 标「反复违规候选」  

无可靠「响应时间」「阻塞时长」字段时：**不要**输出假的团队响应 SLA。team 模式下可额外统计 override 条数与低分 blocking 相关叙述（仅基于已读到的行 + metrics 的 `mode`/`score`），仍标 `[MACHINE_VERIFIED]` 或标明样本不足。

### Step 4：改进建议

输出：`[polaris-flow 复盘] 4.改进建议`

基于 Step 2–3 给出 **2–3 条**可操作建议，标记 `[LLM_SELF_CHECK]`：

- 必须能指回具体低分 scorer、违规计数或 override 聚类  
- 禁止与数据矛盾的空话（如数据全绿却写「测试覆盖急需提升」）  
- 建议指向流程动作时用现行命令：`/polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`、`/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`、`/polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` 等

### Step 5：输出报告

输出：`[polaris-flow 复盘] 5.输出复盘报告`

先读取模板`read_file ./templates/retro-template.md`，生成复盘报告（直接输出，**默认不落盘**）；
按 `./reference/decision-point.md` 列出候选让用户选择(单选)。
> 复盘报告已经输出，是否需要保存到`.polaris/retro/<UTC>-report.md`中：
> - 需要
> - 不需要
如果用户选择需要则将复盘报告写入到文件 `.polaris/retro/<UTC>-report.md`中。