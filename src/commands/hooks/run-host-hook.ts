/**
 * 宿主 hook 编排：读 stdin → 按 event 分发到 HostHookHandler。
 */
import type { HostHookContext, HostHookHandler, HostHookEvent } from './host-hook-handler.js';
import { readHostHookStdin } from './read-host-stdin.js';
import type { HookStdinPayload } from '../../core/hooks/hook-stdin.js';

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
  const run = handler.handle as (
    p: Extract<HookStdinPayload, { event: HostHookEvent }>,
    c: HostHookContext,
  ) => Promise<void>;
  await run(payload as Extract<HookStdinPayload, { event: HostHookEvent }>, ctx);
}
