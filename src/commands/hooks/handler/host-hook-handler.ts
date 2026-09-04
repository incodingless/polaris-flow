/**
 * 宿主 hook 命令层契约：分发器（HostHookHandler）解析 stdin / 按平台包装 stdout，
 * 再按事件派发到 HostHookEventHandler。
 */
import path from 'path';

import { hookDebug } from './debug-log.js';
import type { HookStdinPayload } from './hook-stdin-parser.js';
import { formatHostHookStdout } from './format-host-stdout.js';
import { readHostHookStdin } from './read-host-stdin.js';
import { resolveHookPlatformId } from './resolve-platform.js';

/** 可注册专用 handler 的内部事件名（不含 Unknown） */
export type HostHookEvent = Exclude<HookStdinPayload['event'], 'Unknown'>;

export type HostHookContext = {
  /** CLI `--platform` 原始值；有效性在 resolve 时判定 */
  platform?: string;
  /** CLI 位置参数路径；优先于 stdin.cwd */
  projectPath?: string;
  /**
   * stdin 无有效 event 时的回退事件（如 session-start.sh 传 SessionStart）。
   * 宿主正规 payload 应自带 hook_event_name。
   */
  fallbackEvent?: HostHookEvent;
  /**
   * 分发器 resolve 后的已知 platform id，供事件实现与 stdout 格式化使用。
   */
  resolvedPlatformId?: string | null;
};

/** 单次事件处理后的领域结果；由分发器按平台序列化到 stdout */
export type HostHookEventResult = {
  exitCode: number;
  /**
   * 解析后的平台 id（claude / cursor / trae）。
   * 由通用分发器在事件 handler 返回后统一写入，事件实现不必自行填充。
   */
  PLATFORM_ID?: string;
  /** 注入宿主会话的上下文文本（平台无关语义） */
  additionalContext?: string;
  /** Cursor SessionStart 等可选环境变量（分发器会确保含 PLATFORM_ID） */
  env?: Record<string, string>;
  /** Cursor PreToolUse / beforeSubmitPrompt */
  continue?: boolean;
  permission?: 'allow' | 'deny' | 'ask';
  userMessage?: string;
  /** Claude PreToolUse */
  permissionDecision?: 'allow' | 'deny' | 'ask';
  permissionDecisionReason?: string;
};

/**
 * 将分发器解析到的 platform id 写入返回结果（及 Cursor 用 env）。
 */
export function enrichHookResultWithPlatformId(
  result: HostHookEventResult,
  platformId: string | null | undefined,
): HostHookEventResult {
  const id = platformId?.trim();
  if (!id) {
    return result;
  }
  return {
    ...result,
    PLATFORM_ID: id,
    env: {
      ...result.env,
      PLATFORM_ID: id,
    },
  };
}

/**
 * 单个宿主事件的业务适配（不读 stdin、不写宿主 stdout、不设 process.exitCode）。
 */
export type HostHookEventHandler<E extends HostHookEvent = HostHookEvent> = {
  readonly event: E;
  handle(
    payload: Extract<HookStdinPayload, { event: E }>,
    ctx: HostHookContext,
  ): Promise<HostHookEventResult>;
};

export type HostHookIoOptions = {
  stdin?: NodeJS.ReadableStream;
  isTty?: boolean;
  /** 可注入，默认 console.log（一整行宿主 JSON） */
  writeStdout?: (line: string) => void;
};

/**
 * 宿主 hook 分发器：读 stdin → 按 event 派发 → 按平台写 stdout / exitCode。
 */
export type HostHookHandler = {
  handle(ctx: HostHookContext, io?: HostHookIoOptions): Promise<void>;
};

/**
 * 将 Unknown payload 提升为指定事件（仅公共字段可用）。
 */
function coerceToEvent(
  payload: HookStdinPayload,
  event: HostHookEvent,
): Extract<HookStdinPayload, { event: HostHookEvent }> {
  hookDebug('coerceToEvent', { from: payload.event, to: event, cwd: payload.cwd });
  switch (event) {
    case 'SessionStart':
      return {
        ...payload,
        event: 'SessionStart',
        source: undefined,
        model: undefined,
      };
    case 'SessionEnd':
      return { ...payload, event: 'SessionEnd', reason: undefined };
    case 'PreToolUse':
      return {
        ...payload,
        event: 'PreToolUse',
        tool_name: undefined,
        tool_input: undefined,
        tool_use_id: undefined,
      };
    case 'PostToolUse':
      return {
        ...payload,
        event: 'PostToolUse',
        tool_name: undefined,
        tool_input: undefined,
        tool_response: undefined,
        tool_use_id: undefined,
      };
    case 'Stop':
      return { ...payload, event: 'Stop' };
    case 'UserPromptSubmit':
      return { ...payload, event: 'UserPromptSubmit', prompt: undefined };
  }
}

/**
 * 创建宿主 hook 分发器；eventHandlers 按 event 注册，重复 event 取先注册者。
 */
export function createHostHookHandler(
  eventHandlers: ReadonlyArray<HostHookEventHandler>,
): HostHookHandler {
  const byEvent = new Map<HostHookEvent, HostHookEventHandler>();
  for (const h of eventHandlers) {
    if (!byEvent.has(h.event)) {
      byEvent.set(h.event, h);
    }
  }
  hookDebug('createHostHookHandler', {
    registered: [...byEvent.keys()],
  });

  return {
    async handle(ctx, io = {}) {
      hookDebug('dispatcher.handle start', {
        platform: ctx.platform,
        projectPath: ctx.projectPath,
        fallbackEvent: ctx.fallbackEvent,
      });

      let payload = await readHostHookStdin(io.stdin ?? process.stdin, io.isTty);
      hookDebug('stdin parsed', {
        event: payload.event,
        hook_event_name: payload.hook_event_name,
        cwd: payload.cwd,
        session_id: payload.session_id,
        workspace_roots: payload.workspace_roots,
      });

      if (payload.event === 'Unknown' && ctx.fallbackEvent) {
        payload = coerceToEvent(payload, ctx.fallbackEvent);
      }
      if (payload.event === 'Unknown') {
        hookDebug('no-op: event still Unknown after fallback');
        return;
      }

      const eventHandler = byEvent.get(payload.event);
      if (!eventHandler) {
        hookDebug('no-op: no event handler registered', { event: payload.event });
        return;
      }

      const resolvedPath = path.resolve(ctx.projectPath || payload.cwd || process.cwd());
      const resolvedPlatformId = await resolveHookPlatformId(resolvedPath, ctx.platform);
      hookDebug('platform resolved', {
        resolvedPath,
        cliPlatform: ctx.platform,
        resolvedPlatformId,
      });

      const enrichedCtx: HostHookContext = {
        ...ctx,
        projectPath: resolvedPath,
        resolvedPlatformId,
      };

      const run = eventHandler.handle as (
        p: Extract<HookStdinPayload, { event: HostHookEvent }>,
        c: HostHookContext,
      ) => Promise<HostHookEventResult>;
      const rawResult = await run(
        payload as Extract<HookStdinPayload, { event: HostHookEvent }>,
        enrichedCtx,
      );
      const result = enrichHookResultWithPlatformId(rawResult, resolvedPlatformId);
      hookDebug('event handler result', {
        event: payload.event,
        exitCode: result.exitCode,
        PLATFORM_ID: result.PLATFORM_ID,
        additionalContext: result.additionalContext,
        permissionDecision: result.permissionDecision,
        continue: result.continue,
        permission: result.permission,
      });

      const writeStdout = io.writeStdout ?? ((line: string) => console.log(line));
      const stdoutJson = formatHostHookStdout(resolvedPlatformId, payload.event, result);
      hookDebug('stdout JSON for host', stdoutJson);
      writeStdout(stdoutJson);

      if (result.exitCode !== 0) {
        process.exitCode = result.exitCode;
        hookDebug('set process.exitCode', result.exitCode);
      }
      hookDebug('dispatcher.handle done');
    },
  };
}
