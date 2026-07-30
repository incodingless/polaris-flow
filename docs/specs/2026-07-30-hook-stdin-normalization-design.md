# Hook stdin 跨平台归一设计

日期：2026-07-30  
状态：已批准（待实现）

## 背景

宿主（Claude / Cursor / Trae）在触发 hooks 时经 stdin 注入 JSON，字段名与事件名不一致。Polaris 的 `hooks/*.sh` 经 `_polaris-cli.sh` `exec` 到 `polaris-flow`，stdin 由 TypeScript 侧消费。当前 `readHookStdin` 只抽了 `cwd` / `session_id` / `source`，不足以支撑后续多事件宿主 hooks。

说明：主链路里多数 `.sh` 由 Skill 以 argv 调用，不吃宿主 stdin；本设计面向**宿主生命周期 hook** 的 stdin 契约，供所有将注册到宿主 hooks 配置的命令复用。

## 目标

1. 在边界把三平台 stdin 归一为内部判别联合类型。
2. 覆盖主事件集的公共字段 + 事件专有字段。
3. 不依赖 `--platform` / config 猜测平台（避免与 cwd 解析循环依赖）。

## 非目标

- 不在本轮扩展 `hooks.json` 注册新事件。
- 不实现 stdout 决策协议（allow / deny / continue）。
- 不改 Skill 调用的 argv 约定。
- 不引入 Zod / 按平台 adapter 分流。

## 方案

单文件别名表 + 事件 `switch`（可演进拆 `hook-stdin-events.ts`）：

1. 读 stdin → JSON  
2. 提取公共字段（含别名回退）  
3. 映射 `hook_event_name`（Cursor camelCase → Claude PascalCase）  
4. 按内部事件名填充专有字段  
5. 返回判别联合；始终保留 `raw`

## 事件名映射

内部事件名统一为 Claude 风格：

| 宿主原始值 | 内部 `event` |
| --- | --- |
| `SessionStart` / `sessionStart` | `SessionStart` |
| `SessionEnd` / `sessionEnd` | `SessionEnd` |
| `PreToolUse` / `preToolUse` | `PreToolUse` |
| `PostToolUse` / `postToolUse` | `PostToolUse` |
| `Stop` / `stop` | `Stop` |
| `UserPromptSubmit` / `beforeSubmitPrompt` | `UserPromptSubmit` |
| 其它 / 缺失 | `Unknown` |

覆盖范围（第一版）：上表六类主事件 + `Unknown`。

## 数据模型

```ts
type HookStdinCommon = {
  cwd?: string;
  session_id?: string;
  hook_event_name?: string; // 映射前的原始值
  workspace_roots?: string[];
  raw: Record<string, unknown>;
};

type HookStdinPayload =
  | (HookStdinCommon & { event: 'SessionStart'; source?: string; model?: string })
  | (HookStdinCommon & { event: 'SessionEnd'; reason?: string })
  | (HookStdinCommon & {
      event: 'PreToolUse';
      tool_name?: string;
      tool_input?: unknown;
      tool_use_id?: string;
    })
  | (HookStdinCommon & {
      event: 'PostToolUse';
      tool_name?: string;
      tool_input?: unknown;
      tool_response?: unknown;
      tool_use_id?: string;
    })
  | (HookStdinCommon & { event: 'Stop' })
  | (HookStdinCommon & { event: 'UserPromptSubmit'; prompt?: string })
  | (HookStdinCommon & { event: 'Unknown' });
```

### 公共字段回退链

| 内部字段 | 来源优先级 |
| --- | --- |
| `cwd` | `cwd` → `workspace_roots[0]`（字符串数组首项） |
| `session_id` | `session_id` → `sessionId` → `conversation_id` |
| `workspace_roots` | 若为 `string[]` 则原样保留 |
| `hook_event_name` | 原始 `hook_event_name` 字符串（若有） |

缺字段为 `undefined`，不抛错。

### 事件专有字段（有则取字符串/原值，无则 `undefined`）

| `event` | 字段 |
| --- | --- |
| `SessionStart` | `source`, `model` |
| `SessionEnd` | `reason` |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id` |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_response`, `tool_use_id` |
| `Stop` | （第一版无强制专有字段；扩展时再加） |
| `UserPromptSubmit` | `prompt` |

## API

- `readHookStdin(stdin?, isTty?)`：生产入口；TTY / 空 / 解析失败 → `{ event: 'Unknown', raw: {} }`。
- `parseHookStdinJson(text: string)`：纯函数，便于单测与复用。
- 消费方用 `payload.event === '…'` 收窄后再访问专有字段。

## 接入

| 组件 | 本轮行为 |
| --- | --- |
| `src/core/hooks/hook-stdin.ts` | 实现归一与类型 |
| `sessionStartCommand` | 继续用 `cwd` / `session_id`；路径优先级不变：`CLI 路径 → cwd → process.cwd()`；手动 CLI（无宿主 JSON）视为 `Unknown` 仍可运行 |
| 其它 hook CLI | 不强制改；宿主日后挂事件时再调用 `readHookStdin` |
| `.sh` / `_polaris-cli.sh` | 不变（`exec` 继承 stdin） |

## 错误处理

- JSON 非法、非 object、TTY、空内容 → `Unknown` + 空 common。
- 未知事件名 → `event: 'Unknown'`，仍尽量填充 common。
- 不因缺字段失败；由调用方决定回退。

## 测试

新增或扩展单元测试（建议 `test/ts/hook-stdin.test.ts`）：

1. Claude SessionStart：`session_id` + `cwd` + `source` → `event: 'SessionStart'`
2. Trae：含 `workspace_roots` + `session_id` + `cwd`
3. Cursor：`conversation_id` + `workspace_roots` + `sessionStart` → `SessionStart`；`session_id` ← `conversation_id`；`cwd` ← `workspace_roots[0]`
4. Cursor `beforeSubmitPrompt` → `UserPromptSubmit` + `prompt`
5. Claude PreToolUse：`tool_name` / `tool_input`
6. 坏 JSON / TTY → `Unknown`

既有 `hook-platform-params.test.ts` 中 `readHookStdin` 用例随新类型更新。

## 实现备注

- 文件注释与函数注释保持中文（仓库约定）。
- Changelog：实现完成后追加到当前相对 master 的版本条目。
- 版本号：仅实现代码变更时再对照 master 决定是否 bump。
