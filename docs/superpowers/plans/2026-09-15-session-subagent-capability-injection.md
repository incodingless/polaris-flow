# SessionStart subagent capability injection — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** SessionStart 注入 `SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION`；编排在仅用默认通用 Agent 时可跳过 probe。

**Architecture:** core 纯函数能力表 → commands SessionStart 双写 env/context；zh skill 契约改为跳过规则。不改 `SessionStartResult`。

**Tech Stack:** TypeScript, vitest, zh SKILL.md

**Spec:** `docs/superpowers/specs/2026-09-15-session-subagent-capability-injection-design.md`

## Global Constraints

- 能力表与 `platform-probe.md` 能力列同源
- 只改 zh skill；CHANGELOG 本阶段只记代码侧，追加 0.1.1
- `PLATFORM_DEGRADATION` 空串 = probe 的 `null`

## File map

| File | Role |
|------|------|
| `src/core/domain/subagent-capability.ts` | `resolveSubagentCapability` |
| `test/ts/subagent-capability.test.ts` | 能力表单测 |
| `src/commands/hooks/session-start.ts` | 注入扩展 |
| `test/ts/session-start-paths.test.ts` | 注入字段断言 |
| `assets/zh/skills/subagent-probe/**` | 契约 |
| `assets/zh/skills/subagent-dispatch/SKILL.md` | agent=null 合法 |
| 编排 SKILL（prd/prototype/coding） | 硬性 probe → 跳过规则 |
| `CHANGELOG.md` | Added 代码条 |

## Tasks

### Task 1: core 能力表 + 单测
- [ ] 写失败单测（claude/cursor/trae/trae-cn/codebuddy → support；qoder → inline；unknown → unsupported）
- [ ] 实现 `resolveSubagentCapability`
- [ ] 单测通过

### Task 2: SessionStart 注入
- [ ] 扩展 `SessionRuntimePaths` + `toSessionRuntimeEnv` / `formatSessionPathContext`
- [ ] 更新 `session-start-paths.test.ts`
- [ ] 单测通过

### Task 3: zh probe/dispatch 契约
- [ ] 改 probe SKILL、platform-probe.md、dispatch SKILL

### Task 4: zh 编排硬性 probe 句
- [ ] 改为跳过规则；保留 task_type 预筛须 probe

### Task 5: CHANGELOG
- [ ] 0.1.1 Added：SessionStart 能力注入
