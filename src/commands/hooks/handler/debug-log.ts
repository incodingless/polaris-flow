/**
 * 宿主 hook handler 调试日志：默认关闭，开启后写 stderr（不污染宿主 stdout JSON）。
 *
 * 开启方式（任一即可）：
 *   POLARIS_HOOK_DEBUG=1
 *   POLARIS_HOOK_DEBUG=true
 *   DEBUG=polaris-hook
 */
const PREFIX = '[polaris-hook:debug]';

/**
 * 是否启用 handler 调试日志。
 */
export function isHookDebugEnabled(): boolean {
  const v = (process.env.POLARIS_HOOK_DEBUG ?? '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') {
    return true;
  }
  const debug = (process.env.DEBUG ?? '').trim();
  if (!debug) return false;
  return debug.split(/[\s,]+/).some((t) => t === 'polaris-hook' || t === 'polaris-hook:*');
}

/**
 * 写一行调试日志到 stderr（始终不走 stdout）。
 */
export function hookDebug(message: string, detail?: unknown): void {
  if (!isHookDebugEnabled()) return;
  if (detail === undefined) {
    console.error(`${PREFIX} ${message}`);
    return;
  }
  let rendered: string;
  try {
    rendered = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2);
  } catch {
    rendered = String(detail);
  }
  console.error(`${PREFIX} ${message}\n${rendered}`);
}
