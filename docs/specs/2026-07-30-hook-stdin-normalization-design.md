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

单文件别名表 + 事件 `switch`（可演进拆 `hook-stdin-events.ts`）：

1. command 读 `process.stdin` → 文本  
2. core `parseHookStdinJson`：提取公共字段（含别名回退）  
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

- `parseHookStdinJson(text: string)`（`core/hooks`）：纯函数；非法 JSON → `{ event: 'Unknown', raw: {} }`。
- 读流 / 碰 `process.stdin`：放在 `commands/hooks`（TTY / 空则交给 parse 空串或直接 Unknown）。
- 消费方用 `payload.event === '…'` 收窄后再访问专有字段。
- `resolveHookPlatformId(projectPath, cliPlatformId?)`：见上文「平台身份识别」；`--platform` 优先且须为有效已知 id。

## 分层（I/O vs 领域）

| 职责 | 位置 |
| --- | --- |
| 读 stdin / 写 stdout·TTY / 设 `exitCode` | `commands/hooks` |
| 宿主 hook **处理接口与按事件实现** | `commands/hooks`（见下节） |
| `parseHookStdinJson`、事件专有字段、业务逻辑 | `core/hooks` |
| `HookIo` 创建与注入 | command 实现内创建并注入；core 不默认绑死 `console` |

## commands/hooks：先接口，再实现

宿主生命周期 hook（吃 stdin 的那类）在 `src/commands/hooks` **先定义统一处理接口**，再为各事件编写实现。Skill 用 argv 的命令（`hooks-rest` / `workflow-entry` 等）**不**塞进该接口。

### 接口（示意）

```ts
/** 宿主 hook 命令层处理契约：stdin 已归一，负责调 core 并写完 I/O */
export type HostHookHandler = {
  /** 匹配的内部事件名；Unknown 不注册专用 handler */
  readonly event: Exclude<HookStdinPayload['event'], 'Unknown'>;
  /**
   * 处理一次宿主触发。
   * @param payload 已是对应 event 收窄后的 stdin
   * @param ctx CLI 选项（如 --platform）、可选显式 projectPath
   */
  handle(payload: HookStdinPayload & { event: this['event'] }, ctx: HostHookContext): Promise<void>;
};

export type HostHookContext = {
  /** CLI `--platform` 原始值；有效性在 resolve 时判定 */
  platform?: string;
  /** CLI 位置参数路径；优先于 stdin.cwd */
  projectPath?: string;
};
```

共享编排（可放 `commands/hooks/run-host-hook.ts`）：

1. 读 `process.stdin` → `parseHookStdinJson`  
2. 按 `payload.event` 查找 `HostHookHandler`  
3. 无 handler（含 `Unknown`）→ 显式策略：SessionStart 兼容路径可走默认 handler，或 no-op + exit 0（本轮：**仅注册 SessionStart**；其它事件暂不注册，未知则 no-op）  
4. `handler.handle` 内：解析路径与 `resolveHookPlatformId` → 调 `core` → 写 stdout/TTY/`exitCode`

### 实现文件（本轮与后续）

| 文件 | 本轮 |
| --- | --- |
| `commands/hooks/host-hook-handler.ts`（或 `types.ts`） | 定义 `HostHookHandler` / `HostHookContext` |
| `commands/hooks/run-host-hook.ts` | 读 stdin + 分发 |
| `commands/hooks/session-start.ts` | 实现 `SessionStart` handler；CLI `session-start` 走同一实现 |
| PreToolUse / PostToolUse / Stop / SessionEnd / UserPromptSubmit | **本轮不实现**；接口与注册表预留，后续按同一模式加文件 |

`_polaris-cli.sh` / `polaris-flow session-start` 入口不变；内部改为「编排 + SessionStart handler」。

## 接入

| 组件 | 本轮行为 |
| --- | --- |
| `src/core/hooks/hook-stdin.ts` | 类型 + `parseHookStdinJson`（别名归一） |
| `src/core/hooks/resolve-platform.ts` | `--platform`（有效）→ config → null；无效 CLI 值回退 config |
| `src/commands/hooks/host-hook-handler.ts` | 处理接口定义 |
| `src/commands/hooks/run-host-hook.ts` | stdin 读取与按 event 分发 |
| `src/commands/hooks/session-start.ts` | `HostHookHandler` 的 SessionStart 实现 + 现有 CLI 导出 |
| 其它宿主事件 handler | 不实现；仅接口可扩展 |
| Skill 向 CLI（`hooks-rest` 等） | 不纳入 `HostHookHandler` |
| `.sh` / `_polaris-cli.sh` | 不变（`exec` 继承 stdin；`--platform` 由安装期写入） |

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
