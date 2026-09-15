# Design: SessionStart 注入平台 subagent 能力 + agents 扫描缓存

日期：2026-09-15  
状态：已实现（待 en skill 同步后再记 skill CHANGELOG 条）

## 目标

在 SessionStart：

1. 注入**平台级** subagent 能力结论（`supports_subagent` / `platform_degradation`）
2. 按 `platform-probe.md` / `subagent-probe` 算法扫描当前宿主平台 agents，落盘与 probe **同构**的 JSON 快照

使编排技能在「无专用 Agent、只用平台默认通用 Agent」时可**跳过** `subagent-probe`；需要清单 / `subagent_id` / `task_type` 预筛时仍调用 probe，但 **优先读 SessionStart 缓存** 再过滤，避免会话内重复扫盘。

## 非目标

- 不把全量 agents 塞进 `additionalContext`（只注入缓存路径 + 短摘要）
- 不扫 `config.platforms` 全表；只扫当前 hook 宿主 `platformId`
- 不扫 `$HOME/.../agents/`
- SessionStart 不做 `task_type` / `subagent_id` 过滤（无调用方入参）
- 不改变 `subagent-probe` 输出 schema；probe **技能自身**仍不写缓存（hook 写缓存不算违规）
- 不把现有传 `task_type: doc_review` 的步骤改成默认可跳过
- 本变更不同步英文 skill
- 不在 runtime 强制拦截「编排方违规跳过」

## 决策摘要

| 项 | 选择 |
|----|------|
| 能力缓存 | SessionStart 注入 `SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION` |
| agents 缓存 | `.polaris/.cache/subagent-probe.json` + 注入 `SUBAGENT_PROBE_CACHE` |
| 消费方式 | probe 优先读缓存再过滤；仅默认通用可跳过 probe |
| 扫描实现 | core `scanSubagents` / `buildSubagentProbeSnapshot` |
| `PLATFORM_DEGRADATION` 空值 | 空串 `""` = probe 的 `null` |

## 能力表

模块：`src/core/domain/platforms.ts` 的 `Platform.supportsSubagent` + `resolveSubagentCapability`（与 `platform-probe.md` 能力列同源）。

## 扫描与快照

模块：`src/core/subagent/scan-agents.ts`

- 目录：始终 `.agents/`；仅 `cursor` 追加 `.cursor/agents/`
- cursor 目录空 → builtin：`generalPurpose` / `explore` / `shell`
- 快照字段：`platform` / `supports_subagent` / `platform_degradation` / `agents` / `matched_agents`(=agents) / `subagent_id_found: false` / `reason`
- 路径：`getSubagentProbeCachePath` → `.polaris/.cache/subagent-probe.json`
- 扫描失败：写空 agents + `reason=scan_failed`

## 注入字段

| 变量 | 值 |
|---|---|
| `SUPPORTS_SUBAGENT` | `'true'` \| `'false'` |
| `PLATFORM_DEGRADATION` | `''` \| `'inline'` \| `'unsupported'` |
| `SUBAGENT_PROBE_CACHE` | 快照绝对路径 |

渠道：`additionalContext`（含 `subagent_agents_summary=count=…; ids=…`）+ Cursor `env` + `runtime-env` + `CLAUDE_ENV_FILE`。

## 跳过规则与 probe 缓存命中

跳过 probe（编排方）：已有能力注入 + 无 `subagent_id` + 无 `task_type` 预筛 +（inline/unsupported 直接降级 **或** 支持则 `dispatch(agent=null)`）。

调用 probe 时：若 `$SUBAGENT_PROBE_CACHE` 存在且 `platform` 匹配 → 读 JSON → 再应用 `subagent_id` / `task_type`；否则扫盘。

## 代码落点

| 层 | 路径 |
|---|---|
| core | `platforms.ts`（`supportsSubagent`）、`subagent/scan-agents.ts`、`polaris-paths` 缓存路径 |
| commands | `session-start.ts`：扫描落盘 + 注入 |
| skills zh | `subagent-probe`、`platform-probe.md`、编排短补丁 |

## Changelog

- 代码侧记 0.1.1 Added
- skill 条等中英文同步后再写
