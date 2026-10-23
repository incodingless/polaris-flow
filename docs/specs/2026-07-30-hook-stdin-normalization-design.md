# Hook stdin 跨平台归一设计

日期：2026-07-30  
状态：已批准（待实现）

## 背景

宿主（Claude / Cursor / Trae）在触发 hooks 时经 stdin 注入 JSON，字段名与事件名不一致。Polaris 的 `hooks/*.sh` 经 `_polaris-cli.sh` `exec` 到 `polaris-flow`，stdin 由 TypeScript 侧消费。当前 `readHookStdin` 只抽了 `cwd` / `session_id` / `source`，不足以支撑后续多事件宿主 hooks。

说明：主链路里多数 `.sh` 由 Skill 以 argv 调用，不吃宿主 stdin；本设计面向**宿主生命周期 hook** 的 stdin 契约，供所有将注册到宿主 hooks 配置的命令复用。

## 目标

1. 在边界把三平台 stdin 归一为内部判别联合类型。
2. 覆盖主事件集的公共字段 + 事件专有字段。
3. **stdin 字段归一**不按 platform 分支（别名回退链即可，避免与 cwd 循环依赖）。
4. **平台身份识别**与 stdin 归一分离：先 `--platform`，无有效值再用其它手段。
5. 在 `src/commands/hooks` **先定义宿主 hook 处理接口**，再按事件实现（本轮只落地 SessionStart）。

## 非目标

- 不在本轮扩展 `hooks.json` 注册新事件。
- 不实现 stdout 决策协议（allow / deny / continue）。
- 不改 Skill 调用的 argv 约定。
- 不引入 Zod / 按平台 adapter 分流解析 stdin。

## 平台身份识别（与 stdin 归一分离）

宿主 hook 业务（插件探测、agents 路径等）需要 `platformId`。解析优先级：

1. **CLI `--platform`**（含安装期写入 `_polaris-cli.sh` 的固定值）：经 `coercePlatformId` 得到**已知** `PLATFORMS` id 则采用。
2. **无效或未传**：再试其它手段——当前为 `.polaris/config.yaml` 的 `platform` / `platforms[0]`（同样经 `coercePlatformId`）。
3. 仍无有效值 → `null`，由 command/core 报 FAIL（提示传 `--platform` 或写 config）。

约定：

- 「有效值」= 能映射到已注册 `PLATFORMS` 条目的 id；未知字符串**不**当作成功（应继续回退或失败），避免脏 `--platform` 挡住 config。
- **禁止**用 stdin 字段（如 `hook_event_name`）推断平台。
- stdin 归一**不读取** platform；platform 解析在 command 取得 `cwd`（stdin 或 argv）之后调用 `resolveHookPlatformId(projectPath, options.platform)`。

## 方案（stdin 归一）

命令层别名表 + 事件 `switch`（`commands/hooks/parse-hook-stdin.ts`）：

1. command 读 `process.stdin` → 文本  
2. `parseHookStdinJson`：提取公共字段（含别名回退）  
3. 映射 `hook_event_name`（Cursor camelCase → Claude PascalCase）  
4. 按内部事件名填充专有字段  
5. 返回判别联合；始终保留 `raw`  
6. handler 内 `resolveHookPlatformId` 后调用 core（只传归一后的 cwd / sessionId / platformId）

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

- `parseHookStdinJson(text: string)`（`commands/hooks`）：纯函数；非法 JSON → `{ event: 'Unknown', raw: {} }`。
- 读流 / 碰 `process.stdin`：`commands/hooks/read-host-stdin.ts`。
- 消费方用 `payload.event === '…'` 收窄后再访问专有字段。
- `resolveHookPlatformId(projectPath, cliPlatformId?)`（`commands/hooks`）：见上文「平台身份识别」。

## 分层（I/O vs 领域）

| 职责 | 位置 |
| --- | --- |
| 读 stdin / 解析 stdin / 写 stdout·TTY / 设 `exitCode` / 解析 platform | `commands/hooks` |
| 宿主 hook **处理接口与按事件实现** | `commands/hooks` |
| SessionStart 等业务（写 session、探测插件、注入 agents） | `core/hooks`；只收已归一的 `projectPath` / `sessionId` / `platformId` |
| `HookIo` 注入 | command 创建并注入；core 经接口写过程日志 |

## commands/hooks：分发器 + 事件实现

宿主生命周期 hook 在 `src/commands/hooks`：

1. **`HostHookHandler`（分发器）**：读/解析 stdin → 按 `event` 派发 → 写 stdout / `exitCode`
2. **`HostHookEventHandler`（事件实现）**：只处理已收窄的 payload，返回 `HostHookEventResult`
3. **CLI**：`polaris-flow host-hook`；各宿主生命周期 `.sh` 只调此入口（`session-start.sh` 另传 `--fallback-event SessionStart`）
4. Skill 用 argv 的命令（`hooks-rest` 等）**不**走分发器

### 类型（示意）

```ts
export type HostHookEventHandler<E extends HostHookEvent> = {
  readonly event: E;
  handle(
    payload: Extract<HookStdinPayload, { event: E }>,
    ctx: HostHookContext,
  ): Promise<HostHookEventResult>;
};

export type HostHookHandler = {
  handle(ctx: HostHookContext, io?: HostHookIoOptions): Promise<void>;
};

export function createHostHookHandler(
  eventHandlers: ReadonlyArray<HostHookEventHandler>,
): HostHookHandler;
```

### 实现文件

| 文件 | 职责 |
| --- | --- |
| `host-hook-handler.ts` | 分发器类型 + `createHostHookHandler` |
| `host-hook.ts` | CLI `host-hook` / 兼容 `session-start`；事件注册表 |
| `session-start.ts` | `HostHookEventHandler<'SessionStart'>` |
| `parse-hook-stdin.ts` / `read-host-stdin.ts` / `resolve-platform.ts` | 协议与平台解析 |
| PreToolUse 等 | 后续追加事件实现并注册 |

`session-start.sh` → `exec_polaris host-hook --fallback-event SessionStart`。

## 接入

| 组件 | 本轮行为 |
| --- | --- |
| `src/commands/hooks/parse-hook-stdin.ts` | 类型 + `parseHookStdinJson` |
| `src/commands/hooks/resolve-platform.ts` | `--platform`（有效）→ config → null |
| `src/commands/hooks/host-hook-handler.ts` | 分发器 |
| `src/commands/hooks/host-hook.ts` | CLI 入口 + 注册表 |
| `src/commands/hooks/session-start.ts` | SessionStart 事件实现 |
| `src/core/hooks/session-start.ts` | 业务；不解析 stdin / 不 resolve platform |
| `assets/shared/hooks/session-start.sh` | 调 `host-hook --fallback-event SessionStart` |
| Skill 向 CLI（`hooks-rest` 等） | 不纳入分发器 |

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

既有 `hook-platform-params.test.ts` 中 `readHookStdin` / `resolveHookPlatformId` 用例随新类型与「无效 `--platform` 回退 config」行为更新。

## 实现备注

- 文件注释与函数注释保持中文（仓库约定）。
- Changelog：实现完成后追加到当前相对 master 的版本条目。
- 版本号：仅实现代码变更时再对照 master 决定是否 bump。
