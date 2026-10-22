# SessionStart subagent capability + agents cache — Implementation Plan

> 扩展：在能力注入之上增加 SessionStart agents 扫描与 `subagent-probe.json` 缓存。

**Goal:** SessionStart 注入能力字段并扫描 agents 落盘；probe 优先读缓存。

**Spec:** `docs/superpowers/specs/2026-09-15-session-subagent-capability-injection-design.md`

## Tasks

- [x] core `resolveSubagentCapability` + 单测
- [x] core `scanSubagents` / `buildSubagentProbeSnapshot` / `applyProbeFilters` + 单测
- [x] `getSubagentProbeCachePath`
- [x] SessionStart 落盘 + `SUBAGENT_PROBE_CACHE` 注入 + 单测
- [x] zh probe / platform-probe / 编排短文案
- [x] design 更新 + CHANGELOG 代码侧
