/**
 * runHostHook：按 event 分发到 HostHookHandler。
 */
import { Readable } from 'stream';
import { describe, expect, it, vi } from 'vitest';

import type { HostHookHandler } from '../../src/commands/hooks/host-hook-handler.js';
import { runHostHook } from '../../src/commands/hooks/run-host-hook.js';

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
    await expect(runHostHook([], {}, { stdin, isTty: false })).resolves.toBeUndefined();
  });
});
