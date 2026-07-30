/**
 * createHostHookHandler：stdin 分发与按平台 stdout JSON / exitCode。
 */
import { Readable } from 'stream';
import { describe, expect, it, vi } from 'vitest';

import {
  createHostHookHandler,
  type HostHookEventHandler,
} from '../../src/commands/hooks/handler/host-hook-handler.js';

describe('createHostHookHandler', () => {
  it('按 SessionStart 派发并写 Claude JSON + exitCode', async () => {
    const handle = vi.fn(async () => ({
      exitCode: 1 as number,
      additionalContext: 'warn',
    }));
    const eventHandler: HostHookEventHandler<'SessionStart'> = {
      event: 'SessionStart',
      handle,
    };
    const dispatcher = createHostHookHandler([eventHandler]);
    const stdin = Readable.from([
      JSON.stringify({
        hook_event_name: 'SessionStart',
        cwd: '/p',
        session_id: 's',
        source: 'startup',
      }),
    ]);
    const lines: string[] = [];
    const prev = process.exitCode;
    process.exitCode = undefined;
    await dispatcher.handle(
      { platform: 'claude' },
      { stdin, isTty: false, writeStdout: (l) => lines.push(l) },
    );
    expect(handle).toHaveBeenCalledOnce();
    expect(handle.mock.calls[0][0].event).toBe('SessionStart');
    expect(process.exitCode).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: 'warn',
      },
    });
    process.exitCode = prev;
  });

  it('Cursor 平台写 additional_context', async () => {
    const eventHandler: HostHookEventHandler<'SessionStart'> = {
      event: 'SessionStart',
      handle: async () => ({ exitCode: 0, additionalContext: 'ready' }),
    };
    const dispatcher = createHostHookHandler([eventHandler]);
    const stdin = Readable.from([
      JSON.stringify({ hook_event_name: 'SessionStart', cwd: '/p', session_id: 's' }),
    ]);
    const lines: string[] = [];
    await dispatcher.handle(
      { platform: 'cursor' },
      { stdin, isTty: false, writeStdout: (l) => lines.push(l) },
    );
    expect(JSON.parse(lines[0]!)).toEqual({ additional_context: 'ready' });
  });

  it('无 handler → no-op', async () => {
    const dispatcher = createHostHookHandler([]);
    const stdin = Readable.from([
      JSON.stringify({ hook_event_name: 'PreToolUse', cwd: '/p', tool_name: 'Bash' }),
    ]);
    await expect(dispatcher.handle({}, { stdin, isTty: false })).resolves.toBeUndefined();
  });

  it('Unknown + fallbackEvent SessionStart → 派发', async () => {
    const handle = vi.fn(async () => ({ exitCode: 0 }));
    const eventHandler: HostHookEventHandler<'SessionStart'> = {
      event: 'SessionStart',
      handle,
    };
    const dispatcher = createHostHookHandler([eventHandler]);
    const stdin = Readable.from([JSON.stringify({ cwd: '/tmp', session_id: 's' })]);
    const lines: string[] = [];
    await dispatcher.handle(
      { fallbackEvent: 'SessionStart', platform: 'claude' },
      { stdin, isTty: false, writeStdout: (l) => lines.push(l) },
    );
    expect(handle).toHaveBeenCalledOnce();
    expect(handle.mock.calls[0][0].event).toBe('SessionStart');
    expect(lines[0]).toBeTruthy();
    expect(JSON.parse(lines[0]!).hookSpecificOutput).toBeDefined();
  });
});
