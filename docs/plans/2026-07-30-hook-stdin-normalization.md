# Hook stdin 跨平台归一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Claude / Cursor / Trae 宿主 hook stdin 归一为判别联合类型，并在 `commands/hooks` 以 `HostHookHandler` 接口落地 SessionStart 编排。

**Architecture:** `core/hooks/hook-stdin.ts` 只做纯解析；`commands/hooks` 读 `process.stdin`、定义 `HostHookHandler`、分发并写 stdout/TTY/`exitCode`。平台 id：`--platform`（须为已知 PLATFORMS）→ config → null。本轮只实现 SessionStart handler。

**Tech Stack:** TypeScript、Vitest、现有 `src/commands` → `src/core` 分层。

**Spec:** `docs/specs/2026-07-30-hook-stdin-normalization-design.md`

## Global Constraints

- 依赖方向：`cli → commands → core → utils`，禁止反向。
- 代码文件与函数注释用中文。
- 文件名 kebab-case；导出 camelCase。
- stdin 归一不按 platform 分支；禁止用 stdin 猜平台。
- Skill 向 CLI（`hooks-rest` 等）不纳入 `HostHookHandler`。
- 本轮不扩展 `hooks.json`、不做 stdout 决策协议。
- Changelog 追加到相对 main 的当前版本条目（main=`0.1.0`，分支已有 `0.1.1` 则追加到 `0.1.1`）。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `src/core/hooks/hook-stdin.ts` | `HookStdinPayload` 判别联合 + `parseHookStdinJson` |
| `src/core/hooks/resolve-platform.ts` | `coercePlatformId` 仅返回已知 id；无效 `--platform` 回退 config |
| `src/commands/hooks/read-host-stdin.ts` | 读 `process.stdin` → 调 `parseHookStdinJson` |
| `src/commands/hooks/host-hook-handler.ts` | `HostHookHandler` / `HostHookContext` + 注册表类型 |
| `src/commands/hooks/run-host-hook.ts` | 按 `event` 查找 handler 并调用；无 handler 则 no-op |
| `src/commands/hooks/session-start.ts` | SessionStart `HostHookHandler` + `sessionStartCommand` |
| `src/core/hooks/session-start.ts` | 可选：要求注入 `io` 或保留 `options.io ?? createHookIo()`（本轮最小改动：command 注入 `createHookIo()`） |
| `test/ts/hook-stdin.test.ts` | 解析单测 |
| `test/ts/hook-platform-params.test.ts` | 更新 stdin / platform 用例 |
| `CHANGELOG.md` | 行为变更条目 |

---

### Task 1: `parseHookStdinJson` 判别联合（TDD）

**Files:**
- Create: `test/ts/hook-stdin.test.ts`
- Modify: `src/core/hooks/hook-stdin.ts`
- Modify: `test/ts/hook-platform-params.test.ts`（删除或改写旧 `readHookStdin` 断言，改为测 `parseHookStdinJson` 或命令层 `readHostHookStdin`——本 task 只保证 core parse；`readHookStdin` 可暂留薄封装转调 parse，Task 3 再迁走）

**Interfaces:**
- Produces: `parseHookStdinJson(text: string): HookStdinPayload`；`HookStdinPayload` 判别联合（见 spec）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { parseHookStdinJson } from '../../src/core/hooks/hook-stdin.js';

describe('parseHookStdinJson', () => {
  it('Claude SessionStart', () => {
    const p = parseHookStdinJson(
      JSON.stringify({
        session_id: 's1',
        cwd: '/tmp/a',
        hook_event_name: 'SessionStart',
        source: 'startup',
        model: 'claude',
      }),
    );
    expect(p.event).toBe('SessionStart');
    if (p.event !== 'SessionStart') throw new Error('narrow');
    expect(p.session_id).toBe('s1');
    expect(p.cwd).toBe('/tmp/a');
    expect(p.source).toBe('startup');
    expect(p.model).toBe('claude');
  });

  it('Trae 保留 workspace_roots', () => {
    const p = parseHookStdinJson(
      JSON.stringify({
        session_id: 't1',
        cwd: '/ws',
        hook_event_name: 'PreToolUse',
        workspace_roots: ['/ws', '/other'],
      }),
    );
    expect(p.event).toBe('PreToolUse');
    expect(p.workspace_roots).toEqual(['/ws', '/other']);
    expect(p.cwd).toBe('/ws');
  });

  it('Cursor sessionStart：conversation_id + workspace_roots', () => {
    const p = parseHookStdinJson(
      JSON.stringify({
        conversation_id: 'c1',
        hook_event_name: 'sessionStart',
        workspace_roots: ['/cursor/proj'],
      }),
    );
    expect(p.event).toBe('SessionStart');
    expect(p.session_id).toBe('c1');
    expect(p.cwd).toBe('/cursor/proj');
  });

  it('Cursor beforeSubmitPrompt → UserPromptSubmit', () => {
    const p = parseHookStdinJson(
      JSON.stringify({
        hook_event_name: 'beforeSubmitPrompt',
        prompt: 'hello',
        workspace_roots: ['/p'],
      }),
    );
    expect(p.event).toBe('UserPromptSubmit');
    if (p.event !== 'UserPromptSubmit') throw new Error('narrow');
    expect(p.prompt).toBe('hello');
  });

  it('Claude PreToolUse tool 字段', () => {
    const p = parseHookStdinJson(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_use_id: 'u1',
        cwd: '/x',
      }),
    );
    expect(p.event).toBe('PreToolUse');
    if (p.event !== 'PreToolUse') throw new Error('narrow');
    expect(p.tool_name).toBe('Bash');
    expect(p.tool_input).toEqual({ command: 'ls' });
    expect(p.tool_use_id).toBe('u1');
  });

  it('非法 JSON → Unknown', () => {
    const p = parseHookStdinJson('not-json');
    expect(p.event).toBe('Unknown');
    expect(p.raw).toEqual({});
  });

  it('空串 → Unknown', () => {
    expect(parseHookStdinJson('').event).toBe('Unknown');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ts/hook-stdin.test.ts`

Expected: FAIL（`parseHookStdinJson` 不存在或行为不符）

- [ ] **Step 3: 实现 `hook-stdin.ts`**

替换为（保持文件头中文注释）：

```ts
/**
 * 宿主 hook stdin JSON 归一：公共字段别名 + 事件判别联合。
 */

export type HookStdinCommon = {
  cwd?: string;
  session_id?: string;
  hook_event_name?: string;
  workspace_roots?: string[];
  raw: Record<string, unknown>;
};

export type HookStdinPayload =
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

const EVENT_ALIASES: Record<string, Exclude<HookStdinPayload['event'], 'Unknown'>> = {
  SessionStart: 'SessionStart',
  sessionStart: 'SessionStart',
  SessionEnd: 'SessionEnd',
  sessionEnd: 'SessionEnd',
  PreToolUse: 'PreToolUse',
  preToolUse: 'PreToolUse',
  PostToolUse: 'PostToolUse',
  postToolUse: 'PostToolUse',
  Stop: 'Stop',
  stop: 'Stop',
  UserPromptSubmit: 'UserPromptSubmit',
  beforeSubmitPrompt: 'UserPromptSubmit',
};

/** 将宿主 hook_event_name 映射为内部事件名 */
function mapEventName(raw?: string): HookStdinPayload['event'] {
  if (!raw) return 'Unknown';
  return EVENT_ALIASES[raw] ?? 'Unknown';
}

/** 提取 string 字段 */
function str(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

/** 从原始对象提取公共字段 */
function extractCommon(obj: Record<string, unknown>): HookStdinCommon {
  const roots = Array.isArray(obj.workspace_roots)
    ? obj.workspace_roots.filter((x): x is string => typeof x === 'string')
    : undefined;
  const cwd =
    str(obj, 'cwd') ??
    (roots && roots.length > 0 ? roots[0] : undefined);
  const session_id =
    str(obj, 'session_id') ?? str(obj, 'sessionId') ?? str(obj, 'conversation_id');
  return {
    cwd,
    session_id,
    hook_event_name: str(obj, 'hook_event_name'),
    workspace_roots: roots,
    raw: obj,
  };
}

/**
 * 解析宿主 hook stdin JSON 文本为判别联合。
 * 非法 / 空 / 非 object → `{ event: 'Unknown', raw: {} }`。
 */
export function parseHookStdinJson(text: string): HookStdinPayload {
  if (!text.trim()) {
    return { event: 'Unknown', raw: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { event: 'Unknown', raw: {} };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { event: 'Unknown', raw: {} };
  }
  const obj = parsed as Record<string, unknown>;
  const common = extractCommon(obj);
  const event = mapEventName(common.hook_event_name);

  switch (event) {
    case 'SessionStart':
      return { ...common, event, source: str(obj, 'source'), model: str(obj, 'model') };
    case 'SessionEnd':
      return { ...common, event, reason: str(obj, 'reason') };
    case 'PreToolUse':
      return {
        ...common,
        event,
        tool_name: str(obj, 'tool_name'),
        tool_input: obj.tool_input,
        tool_use_id: str(obj, 'tool_use_id'),
      };
    case 'PostToolUse':
      return {
        ...common,
        event,
        tool_name: str(obj, 'tool_name'),
        tool_input: obj.tool_input,
        tool_response: obj.tool_response,
        tool_use_id: str(obj, 'tool_use_id'),
      };
    case 'Stop':
      return { ...common, event };
    case 'UserPromptSubmit':
      return { ...common, event, prompt: str(obj, 'prompt') };
    default:
      return { ...common, event: 'Unknown' };
  }
}

/** @deprecated 兼容旧调用；新代码用 parseHookStdinJson + commands 读流 */
export async function readHookStdin(
  stdin: NodeJS.ReadableStream = process.stdin,
  isTty: boolean = Boolean((stdin as NodeJS.ReadStream).isTTY),
): Promise<HookStdinPayload> {
  if (isTty) return { event: 'Unknown', raw: {} };
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
  } catch {
    return { event: 'Unknown', raw: {} };
  }
  return parseHookStdinJson(Buffer.concat(chunks).toString('utf-8'));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ts/hook-stdin.test.ts`

Expected: PASS

- [ ] **Step 5: 更新 `hook-platform-params.test.ts` 中旧断言**

将 `readHookStdin` 用例改为断言 `event` / 新字段；TTY 期望 `{ event: 'Unknown', raw: {} }`。

Run: `npx vitest run test/ts/hook-platform-params.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/core/hooks/hook-stdin.ts test/ts/hook-stdin.test.ts test/ts/hook-platform-params.test.ts
git commit -m "$(cat <<'EOF'
feat: normalize host hook stdin into discriminated union

EOF
)"
```

---

### Task 2: 平台 id — 已知有效才采纳，否则回退 config

**Files:**
- Modify: `src/core/hooks/resolve-platform.ts`
- Modify: `test/ts/hook-platform-params.test.ts`

**Interfaces:**
- Consumes: `PLATFORMS`
- Produces: `coercePlatformId(token): string | null` 仅已知 id；`resolveHookPlatformId`：CLI 有效 → config → null

- [ ] **Step 1: 写失败测试**

在 `hook-platform-params.test.ts` 的 `resolveHookPlatformId` describe 中追加：

```ts
  it('无效 --platform 回退 config', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-plat-bad-'));
    await mkdir(path.join(tmp, '.polaris'), { recursive: true });
    await writeFile(path.join(tmp, '.polaris', 'config.yaml'), 'platform: claude\n', 'utf-8');
    expect(await resolveHookPlatformId(tmp, 'not-a-platform')).toBe('claude');
  });

  it('coercePlatformId 未知返回 null', async () => {
    const { coercePlatformId } = await import('../../src/core/hooks/resolve-platform.js');
    expect(coercePlatformId('nope')).toBeNull();
    expect(coercePlatformId('trae')).toBe('trae');
    expect(coercePlatformId('.cursor')).toBe('cursor');
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ts/hook-platform-params.test.ts -t '无效|coercePlatformId'`

Expected: FAIL（当前 `coercePlatformId('nope')` 返回 `'nope'`）

- [ ] **Step 3: 改 `coercePlatformId` 与 `resolveHookPlatformId`**

```ts
/**
 * 将标记归一为已知 platform id；无法识别返回 null。
 */
export function coercePlatformId(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const bare = trimmed.replace(/^\./, '');
  const byId = PLATFORMS.find((p) => p.id === bare);
  if (byId) return byId.id;
  const byName = PLATFORMS.find((p) => p.name === trimmed || p.name === bare);
  if (byName) return byName.id;
  return null;
}

/**
 * 解析 hook 使用的 platform id。
 * 优先级：有效的 CLI `--platform` → config `platform` / `platforms[0]` → null。
 */
export async function resolveHookPlatformId(
  projectPath: string,
  cliPlatformId?: string,
): Promise<string | null> {
  const fromCli = cliPlatformId?.trim();
  if (fromCli) {
    const known = coercePlatformId(fromCli);
    if (known) return known;
    // 无效 CLI 值：继续回退 config
  }

  const config = await loadPolarisConfig(projectPath);
  if (!config) return null;

  const raw = config as typeof config & { platform?: unknown };
  const fromSingular = extractPlatformId(raw.platform);
  if (fromSingular) return fromSingular;

  return extractFirstPlatformId(raw.platforms);
}
```

同步更新文件头注释。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ts/hook-platform-params.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/hooks/resolve-platform.ts test/ts/hook-platform-params.test.ts
git commit -m "$(cat <<'EOF'
fix: fall back to config when --platform is unknown

EOF
)"
```

---

### Task 3: `HostHookHandler` 接口 + 读 stdin + 分发骨架

**Files:**
- Create: `src/commands/hooks/host-hook-handler.ts`
- Create: `src/commands/hooks/read-host-stdin.ts`
- Create: `src/commands/hooks/run-host-hook.ts`
- Create: `test/ts/run-host-hook.test.ts`（分发 no-op / 命中）

**Interfaces:**
- Consumes: `parseHookStdinJson`, `HookStdinPayload`
- Produces:
  - `HostHookContext`, `HostHookHandler<E>`, `HostHookEvent`
  - `readHostHookStdin(stdin?, isTty?): Promise<HookStdinPayload>`
  - `runHostHook(handlers, ctx, opts?): Promise<void>`

- [ ] **Step 1: 写失败测试（分发）**

```ts
import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'stream';
import { runHostHook } from '../../src/commands/hooks/run-host-hook.js';
import type { HostHookHandler } from '../../src/commands/hooks/host-hook-handler.js';

describe('runHostHook', () => {
  it('命中 SessionStart handler', async () => {
    const handle = vi.fn(async () => {});
    const handler: HostHookHandler<'SessionStart'> = {
      event: 'SessionStart',
      handle,
    };
    const stdin = Readable.from([
      JSON.stringify({
        hook_event_name: 'SessionStart',
        cwd: '/p',
        session_id: 's',
        source: 'startup',
      }),
    ]);
    await runHostHook([handler], { platform: 'claude' }, { stdin, isTty: false });
    expect(handle).toHaveBeenCalledOnce();
    expect(handle.mock.calls[0][0].event).toBe('SessionStart');
  });

  it('无 handler → no-op', async () => {
    const stdin = Readable.from([
      JSON.stringify({ hook_event_name: 'PreToolUse', cwd: '/p', tool_name: 'Bash' }),
    ]);
    await expect(
      runHostHook([], {}, { stdin, isTty: false }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ts/run-host-hook.test.ts`

Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现三个文件**

`host-hook-handler.ts`:

```ts
/**
 * 宿主生命周期 hook 的命令层处理契约（先接口，再按事件实现）。
 */
import type { HookStdinPayload } from '../../core/hooks/hook-stdin.js';

export type HostHookEvent = Exclude<HookStdinPayload['event'], 'Unknown'>;

export type HostHookContext = {
  /** CLI `--platform` 原始值；有效性在 resolve 时判定 */
  platform?: string;
  /** CLI 位置参数路径；优先于 stdin.cwd */
  projectPath?: string;
};

/**
 * 单个宿主事件的命令层处理器。
 */
export type HostHookHandler<E extends HostHookEvent = HostHookEvent> = {
  readonly event: E;
  handle(
    payload: Extract<HookStdinPayload, { event: E }>,
    ctx: HostHookContext,
  ): Promise<void>;
};
```

`read-host-stdin.ts`:

```ts
/**
 * 从 process.stdin（或注入流）读取宿主 hook JSON 并归一。
 */
import { parseHookStdinJson, type HookStdinPayload } from '../../core/hooks/hook-stdin.js';

async function readStreamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * 读取宿主 hook stdin；TTY / 读失败 → Unknown。
 */
export async function readHostHookStdin(
  stdin: NodeJS.ReadableStream = process.stdin,
  isTty: boolean = Boolean((stdin as NodeJS.ReadStream).isTTY),
): Promise<HookStdinPayload> {
  if (isTty) return { event: 'Unknown', raw: {} };
  try {
    const text = await readStreamToString(stdin);
    return parseHookStdinJson(text);
  } catch {
    return { event: 'Unknown', raw: {} };
  }
}
```

`run-host-hook.ts`:

```ts
/**
 * 宿主 hook 编排：读 stdin → 按 event 分发到 HostHookHandler。
 */
import type { HostHookContext, HostHookHandler } from './host-hook-handler.js';
import { readHostHookStdin } from './read-host-stdin.js';

export type RunHostHookIo = {
  stdin?: NodeJS.ReadableStream;
  isTty?: boolean;
};

/**
 * 执行一次宿主 hook 分发；无匹配 handler（含 Unknown）则 no-op。
 */
export async function runHostHook(
  handlers: ReadonlyArray<HostHookHandler>,
  ctx: HostHookContext,
  io: RunHostHookIo = {},
): Promise<void> {
  const payload = await readHostHookStdin(io.stdin ?? process.stdin, io.isTty);
  if (payload.event === 'Unknown') return;
  const handler = handlers.find((h) => h.event === payload.event);
  if (!handler) return;
  await (handler as HostHookHandler<typeof payload.event>).handle(
    payload as Extract<typeof payload, { event: typeof payload.event }>,
    ctx,
  );
}
```

（若 TS 对 `handle` 转型报错，用更宽松的内部断言：`(handler.handle as (p: typeof payload, c: HostHookContext) => Promise<void>)(payload, ctx)`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/ts/run-host-hook.test.ts`

Expected: PASS

- [ ] **Step 5: 从 `hook-stdin.ts` 移除 `readHookStdin`（若无其它引用）**

Run: `rg readHookStdin src test` — 仅剩旧测试则改为 `readHostHookStdin` / `parseHookStdinJson`。

- [ ] **Step 6: Commit**

```bash
git add src/commands/hooks/host-hook-handler.ts src/commands/hooks/read-host-stdin.ts src/commands/hooks/run-host-hook.ts test/ts/run-host-hook.test.ts src/core/hooks/hook-stdin.ts test/ts/hook-platform-params.test.ts
git commit -m "$(cat <<'EOF'
feat: add HostHookHandler interface and stdin dispatch

EOF
)"
```

---

### Task 4: SessionStart `HostHookHandler` 实现

**Files:**
- Modify: `src/commands/hooks/session-start.ts`
- Modify: `src/core/hooks/session-start.ts`（command 注入 `io`；成功摘要由 command 写 stdout）
- Modify: `test/ts/hook-platform-params.test.ts` / `test/ts/session-start.test.ts`（若依赖旧 command 行为）

**Interfaces:**
- Consumes: `HostHookHandler`, `readHostHookStdin`, `resolveHookPlatformId`, `runSessionStart`, `createHookIo`
- Produces: `sessionStartHandler`, `sessionStartCommand(projectPath?, options?)`

- [ ] **Step 1: 写/更新失败测试**

在 `test/ts/hook-platform-params.test.ts` 或新建用例：用 `Readable` 注入 Cursor 风格 stdin，调用 `sessionStartCommand`，断言 session 文件写入 `conversation_id`（可复用现有「使用宿主 session_id」夹具，改为经 stdin）。

最小断言也可测 handler 直接调用：

```ts
import { sessionStartHandler } from '../../src/commands/hooks/session-start.js';
// …准备 tmp config + fakeHome…
await sessionStartHandler.handle(
  {
    event: 'SessionStart',
    session_id: 'from-handler',
    cwd: tmp,
    raw: {},
  },
  { platform: 'claude', projectPath: tmp },
);
// 读 .polaris/sessions/<ppid>.id —— 注意 ppid 难控：优先继续测 runSessionStart 注入 sessionId；
// command 层测：mock 困难时改为测 sessionStartCommand 解析路径逻辑的纯函数抽取。
```

实用策略：保留现有 `runSessionStart({ sessionId })` 测试；新增 `parse` + command 集成：对 `sessionStartCommand` 用 vitest mock `runSessionStart` **仅当**项目已有此模式。否则：

新增纯函数测试不足时，集成测：

```ts
it('sessionStartCommand 从 Cursor stdin 取 session_id 与 cwd', async () => {
  // 与现有「使用宿主 session_id」相同夹具，但通过把 stdin 换成 Readable 并
  // 临时替换：导出内部 resolve 不便时，直接测 sessionStartHandler.handle + 显式 payload
  await sessionStartHandler.handle(
    { event: 'SessionStart', session_id: 'host-session-xyz', cwd: tmp, raw: {} },
    { platform: 'claude', projectPath: tmp },
  );
  // 需要 handler 把 ppid 可测：runSessionStart 已支持 ppid 注入——handler 应把测试用 ppid
  // 本轮 handler 生产路径不注入 ppid；集成测继续用 runSessionStart。
  // Command 层：至少静态保证 sessionStartHandler.event === 'SessionStart'
  expect(sessionStartHandler.event).toBe('SessionStart');
});
```

更稳的集成：扩展 `session-start-sh.integration.test.ts` 若已有 stdin 管道；否则本 task 保证：

1. `sessionStartHandler.event === 'SessionStart'`
2. 现有 `runSessionStart` / `hook-platform-params` 全绿
3. `sessionStartCommand` 源码路径：`readHostHookStdin` → resolve path → `resolveHookPlatformId` → `runSessionStart` + `createHookIo` + `exitCode`

- [ ] **Step 2: 实现 `session-start.ts`（commands）**

```ts
/**
 * SessionStart：HostHookHandler 实现 + CLI 入口。
 */
import path from 'path';

import { createHookIo } from '../../core/hooks/hook-io.js';
import { resolveHookPlatformId } from '../../core/hooks/resolve-platform.js';
import { runSessionStart } from '../../core/hooks/session-start.js';
import type { HostHookContext, HostHookHandler } from './host-hook-handler.js';
import { readHostHookStdin } from './read-host-stdin.js';
import type { HookStdinPayload } from '../../core/hooks/hook-stdin.js';

export type SessionStartCommandOptions = {
  platform?: string;
};

/**
 * SessionStart 宿主 hook 处理：解析平台、调 core、设 exitCode、写成功摘要。
 */
export const sessionStartHandler: HostHookHandler<'SessionStart'> = {
  event: 'SessionStart',
  async handle(payload, ctx) {
    const resolved = path.resolve(ctx.projectPath || payload.cwd || process.cwd());
    const platformId = await resolveHookPlatformId(resolved, ctx.platform);
    const io = createHookIo();
    const result = await runSessionStart({
      projectPath: resolved,
      platformId: platformId ?? undefined,
      sessionId: payload.session_id,
      io,
    });
    if (result.exitCode === 0) {
      console.log('');
      console.log('=== polaris-flow ready ===');
    }
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
  },
};

/**
 * `polaris session-start`：读 stdin；Unknown 亦按 SessionStart 公共字段处理（手动 CLI）。
 */
export async function sessionStartCommand(
  projectPath?: string,
  options: SessionStartCommandOptions = {},
): Promise<void> {
  const payload = await readHostHookStdin();
  const asSession: Extract<HookStdinPayload, { event: 'SessionStart' }> =
    payload.event === 'SessionStart'
      ? payload
      : {
          ...payload,
          event: 'SessionStart',
          source: undefined,
          model: undefined,
        };
  await sessionStartHandler.handle(asSession, {
    platform: options.platform,
    projectPath,
  });
}
```

- [ ] **Step 3: 收紧 core `runSessionStart` 成功摘要**

删除（或跳过）core 内：

```ts
  if (!options.io) {
    console.log('');
    console.log('=== polaris-flow ready ===');
  }
```

成功摘要改由 command handler 写出（Step 2 已写）。保留 `options.io ?? createHookIo()` 以便单测直接调 core；生产路径由 command 注入 `io`。

- [ ] **Step 4: 跑相关测试**

Run:

```bash
npx vitest run test/ts/hook-platform-params.test.ts test/ts/session-start.test.ts test/ts/session-start-sh.integration.test.ts test/ts/hook-stdin.test.ts test/ts/run-host-hook.test.ts
```

Expected: PASS。若集成测依赖 stdout「ready」文案，确认仍由 command 路径输出或集成仍走 sh→CLI。

- [ ] **Step 5: Commit**

```bash
git add src/commands/hooks/session-start.ts src/core/hooks/session-start.ts test/ts/
git commit -m "$(cat <<'EOF'
feat: implement SessionStart HostHookHandler with stdin I/O at commands layer

EOF
)"
```

---

### Task 5: Changelog + 全量回归

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 追加 `0.1.1` 条目（若已存在该版本标题则追加 bullet）**

```markdown
### Added
- **宿主 hook stdin 归一**: Claude/Cursor/Trae 字段别名与事件判别联合（`parseHookStdinJson`）；commands 层 `HostHookHandler` + SessionStart 实现

### Changed
- **platform 解析**: 无效 `--platform` 回退 `.polaris/config.yaml`，不再把未知字符串当有效 id
- **SessionStart I/O**: stdin 读取与成功摘要上移到 `commands/hooks`，core 通过注入 `HookIo` 输出
```

- [ ] **Step 2: 全量测试与格式**

Run:

```bash
pnpm format:check
pnpm lint
pnpm test
```

Expected: 全部通过（按需 `pnpm format` 修格式）

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: changelog for hook stdin normalization

EOF
)"
```

---

## Spec coverage checklist

| Spec 要求 | Task |
| --- | --- |
| 判别联合 + 六事件字段 | Task 1 |
| Cursor 别名映射 | Task 1 |
| cwd / session_id 回退链 | Task 1 |
| `--platform` 有效优先，否则 config | Task 2 |
| 不从 stdin 猜平台 | Task 1–2（无此类逻辑） |
| commands 读 stdin / 写 I/O | Task 3–4 |
| 先 `HostHookHandler` 再实现 | Task 3–4 |
| 本轮仅 SessionStart handler | Task 4 |
| 不改 hooks.json / 决策协议 / Skill argv | 全计划未触及 |
| Changelog | Task 5 |

## Execution Handoff

Plan 已保存到 `docs/plans/2026-07-30-hook-stdin-normalization.md`。

**两种执行方式：**

1. **Subagent-Driven（推荐）** — 每 task 新开 subagent，task 间复查  
2. **Inline Execution** — 本会话按 executing-plans 连续做完，设检查点  

选哪个？
