/**
 * 宿主生命周期 hook 的命令层处理契约（先接口，再按事件实现）。
 */
import type { HookStdinPayload } from '../../core/hooks/hook-stdin.js';

/** 可注册专用 handler 的内部事件名（不含 Unknown） */
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
  handle(payload: Extract<HookStdinPayload, { event: E }>, ctx: HostHookContext): Promise<void>;
};
