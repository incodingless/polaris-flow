/**
 * SessionStart：HostHookHandler 实现 + CLI 入口。
 */
import path from 'path';

import { createHookIo } from '../../core/hooks/hook-io.js';
import type { HookStdinPayload } from '../../core/hooks/hook-stdin.js';
import { resolveHookPlatformId } from '../../core/hooks/resolve-platform.js';
import { runSessionStart } from '../../core/hooks/session-start.js';
import type { HostHookHandler } from './host-hook-handler.js';
import { readHostHookStdin } from './read-host-stdin.js';

export type SessionStartCommandOptions = {
  /** CLI `--platform`；优先于 config */
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
