# Design: SessionStart 注入平台 subagent 能力（可跳过空转 probe）

日期：2026-09-15  
状态：已实现（待 en skill 同步后再记 skill CHANGELOG 条）

## 目标

在 SessionStart 注入**平台级** subagent 能力结论（`supports_subagent` / `platform_degradation`），使编排技能在「无专用 Agent、只用平台默认通用 Agent」时可以**跳过** `subagent-probe`，直接 `subagent-dispatch`（`agent=null`）或按注入结果降级；需要 agents 清单、`subagent_id` 命中或 `task_type` 预筛时仍必须 probe。

## 非目标

- 不缓存、不注入 agents 清单
- SessionStart 不执行目录扫描 / 不调用 probe 技能
- 不改变 `subagent-probe` 的输出 schema；probe 自身仍**不写缓存**
- 不把现有传 `task_type: doc_review`（或其它预筛）的步骤改成默认可跳过
- 本变更不同步英文 skill（中文确认后再同步）
- 不在 runtime 强制拦截「编排方违规跳过」（契约约束，非代码闸门）

## 决策摘要

| 项 | 选择 |
|----|------|
| 缓存范围 | 仅平台能力（方案 A） |
| 跳过条件 | 有注入 + 无 `subagent_id` + 无 `task_type` 预筛 + 按 degradation 分支（方案 B） |
| 注入通道 | `additionalContext` + Cursor `env` + `runtime-env` + `CLAUDE_ENV_FILE`（方案 C，与 `PLUGIN_ROOT` 同套路） |
| 实现路径 | SessionStart 查 core 能力表（方案 1）；与 `platform-probe.md` 能力列双表同源 |
| `PLATFORM_DEGRADATION` 空值 | 空串 `""` 表示 probe 语义中的 `null`（平台支持） |

## 能力表（core 真相源之一）

模块：`src/core/domain/subagent-capability.ts`

```ts
resolveSubagentCapability(platformId: string): {
  supportsSubagent: boolean;
  platformDegradation: null | 'inline' | 'unsupported';
}
```

| 登记情况 | `supportsSubagent` | `platformDegradation` |
|---|---|---|
| 表中支持（`claude` / `codebuddy` / `cursor` / `trae` / `trae-cn`） | `true` | `null` |
| 表中强制 inline（如 `qoder`） | `false` | `'inline'` |
| 未登记 | `false` | `'unsupported'` |

必须与 `assets/zh/skills/subagent-probe/references/platform-probe.md` 的**能力列**保持一致；改一处必须改另一处。文档在 md 侧加同源注释指向该 TS 模块。

纯函数，无 I/O，不扫 agents。

## 注入字段

扩展现有 `SessionRuntimePaths`（`src/commands/hooks/session-start.ts`）：

| 变量 | 值 |
|---|---|
| `SUPPORTS_SUBAGENT` | `'true'` \| `'false'` |
| `PLATFORM_DEGRADATION` | `''` \| `'inline'` \| `'unsupported'` |

写入渠道（与路径变量同一套）：

1. `additionalContext`（`formatSessionPathContext` 追加两行变量 + 一行跳过规则摘要）
2. Cursor SessionStart `env`
3. `.polaris/.cache/runtime-env`
4. 若存在 `CLAUDE_ENV_FILE`，追加 `export`

`runSessionStart` 已返回 `paths` 时才注入（含能力字段）。无 `paths` 时不注入能力变量（与今日不注入路径一致）。

`additionalContext` 规则摘要意图（中英措辞实现时可微调，语义锁定）：

> 编排在仅用默认通用 Agent 且 `SUPPORTS_SUBAGENT=true`（且 `PLATFORM_DEGRADATION` 为空）时可跳过 probe；需要 `subagent_id` 或 `task_type` 预筛时仍须 probe。`inline`/`unsupported` 时直接降级，不 probe。

## 跳过规则（编排方）

以下**全部**满足才允许不调用 `subagent-probe`：

1. 会话已有注入：`SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION`（来自 env、`runtime-env` 或 additionalContext）
2. 本步不需要 `subagent_id` 命中检查
3. 本步不需要 `task_type` → `matched_agents` 预筛（接受 `agent=null` + 默认通用 subagent，或已决定 inline/阻断）
4. 按注入值分支：
   - `PLATFORM_DEGRADATION` 为 `inline` 或 `unsupported` → 直接走现有降级/阻断，**不 probe**
   - `SUPPORTS_SUBAGENT=true` 且 `PLATFORM_DEGRADATION` 为空 → 直接 `subagent-dispatch`（`agent=null`），**不 probe**

任一不满足（缺注入、要专用 id、要预筛）→ **仍必须 probe**。

当前传 `task_type: doc_review` 等的步骤：**默认仍走 probe**（本设计不改为可跳过）。

## 数据流

```
SessionStart
  → resolveSubagentCapability(platformId)
  → SUPPORTS_SUBAGENT / PLATFORM_DEGRADATION
  → additionalContext + env + runtime-env (+ CLAUDE_ENV_FILE)

编排技能（要派发时）
  → 读注入
  → 若缺注入 → 必须 probe（能力 + 清单）
  → 若 degradation=inline|unsupported → 不 probe，走现有降级/阻断
  → 若支持且本步只要默认通用（无 subagent_id、无 task_type 预筛）
        → 不 probe，dispatch(agent=null)
  → 否则 → probe → 选 agent → dispatch
```

## 契约改点（zh skill）

| 目标 | 改动 |
|---|---|
| `subagent-probe/SKILL.md` | 「派发前必须先 probe」改为：须先有平台能力结论；SessionStart 注入可充当能力结论；需要 agents / `subagent_id` / `task_type` 时仍须本技能。流程与「不写缓存」不变 |
| `subagent-probe/references/platform-probe.md` | 能力列旁注与 core 模块同源 |
| `subagent-dispatch/SKILL.md` | 明确：在「已确认平台支持且编排方按跳过规则未 probe」时，`agent=null` 合法，不要求 probe 回执 |
| prd / prototype / coding 中硬性「派发前必须 probe」句 | 改为引用上述跳过规则；保留 `task_type` 预筛步骤的 probe 要求 |

## 错误与边界

| 情况 | 行为 |
|---|---|
| SessionStart 失败无 `paths` | 不注入能力变量；编排方视为无注入 → 必须 probe |
| 注入与日后改表不一致 | 以**当前会话注入**为准；新会话 SessionStart 刷新；双表同步 + 单测锁登记集 |
| 编排方误跳过但仍有预筛意图 | 契约禁止；无 runtime 强制拦截 |
| `PLATFORM_DEGRADATION` 空串 | 等同 probe 的 `null` |
| worktree | 能力只依赖 `platformId`；agents 扫描仅在真正 probe 时发生 |

## 代码落点

| 层 | 路径 | 职责 |
|---|---|---|
| core | `src/core/domain/subagent-capability.ts` | 能力解析纯函数 |
| commands | `src/commands/hooks/session-start.ts` | 用 `paths.platformId` 调 `resolveSubagentCapability`；扩展 runtime env / context / 落盘。**不**改 `SessionStartResult` 形状 |
| skills | `assets/zh/skills/subagent-probe/**`、`subagent-dispatch/**`、相关编排 SKILL | 契约与跳过规则文案 |
| tests | `test/ts/` | 能力表 + SessionStart 注入回归 |

## 测试

- 单测 `resolveSubagentCapability`：每个登记平台 + 未知平台
- SessionStart 注入：`toSessionRuntimeEnv` / `formatSessionPathContext` 含新字段；`runtime-env` 含两键；不回归丢失 `PLUGIN_ROOT` / `REPO_ROOT` / `PLATFORM_ID`
- 不测 LLM 是否遵守跳过规则

## 验收标准

1. 支持 subagent 的平台开新会话后，上下文 / env / `runtime-env` 可见 `SUPPORTS_SUBAGENT=true` 且 `PLATFORM_DEGRADATION` 为空
2. inline 平台为 `false` + `inline`；未知平台为 `false` + `unsupported`
3. 仅默认通用派发的编排步骤，技能文案允许不调 probe 直接 dispatch
4. 带 `task_type` / `subagent_id` 的步骤文案仍要求 probe
5. probe 技能本身仍不写缓存、仍可独立完整探测

## Changelog 约定（实现时）

- 对照 master 版本号：仅比 master 大一个 patch（或沿用已有未发布 bump）
- 本变更含代码时：CHANGELOG 记 SessionStart / core 能力注入
- skill 条目：中英文完全同步后再写入 CHANGELOG（AGENTS.md）；本变更只改 zh 时实现阶段**只记代码侧**，en 同步后再补 skill 条

## 实现顺序建议

1. core 能力表 + 单测
2. SessionStart 注入扩展 + 单测/集成
3. zh：`subagent-probe` / `platform-probe.md` / `subagent-dispatch`
4. zh：编排技能硬性 probe 句改为跳过规则
5. CHANGELOG（按上节约定）
