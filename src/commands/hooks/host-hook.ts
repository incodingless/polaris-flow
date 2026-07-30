/**
 * `polaris-flow host-hook`：宿主 hook 统一入口（stdin 分发）。
 * 各宿主生命周期 .sh 薄包装只应调用本命令。
 */
import {
  createHostHookHandler,
  type HostHookEvent,
  type HostHookEventHandler,
} from './handler/host-hook-handler.js';
import { sessionStartEventHandler } from './session-start.js';

/** 已注册的宿主事件实现（后续 PreToolUse 等在此追加） */
const DEFAULT_EVENT_HANDLERS: HostHookEventHandler[] = [
  sessionStartEventHandler as HostHookEventHandler,
];

export type HostHookCommandOptions = {
  /** CLI `--platform`；优先于 config */
  platform?: string;
  /** stdin 无 event 时回退（session-start.sh 传 SessionStart） */
  fallbackEvent?: string;
};

/**
 * 将 CLI 字符串规范为已知 HostHookEvent。
 */
function parseFallbackEvent(raw?: string): HostHookEvent | undefined {
  if (!raw?.trim()) return undefined;
  const allowed: HostHookEvent[] = [
    'SessionStart',
    'SessionEnd',
    'PreToolUse',
    'PostToolUse',
    'Stop',
    'UserPromptSubmit',
  ];
  const hit = allowed.find((e) => e === raw.trim());
  return hit;
}

/**
 * 运行宿主 hook 分发器。
 */
export async function hostHookCommand(
  projectPath?: string,
  options: HostHookCommandOptions = {},
): Promise<void> {
  const dispatcher = createHostHookHandler(DEFAULT_EVENT_HANDLERS);
  await dispatcher.handle({
    platform: options.platform,
    projectPath,
    fallbackEvent: parseFallbackEvent(options.fallbackEvent),
  });
}

/**
 * 兼容旧 CLI `session-start`：等价于 host-hook --fallback-event SessionStart。
 */
export async function sessionStartCommand(
  projectPath?: string,
  options: { platform?: string } = {},
): Promise<void> {
  await hostHookCommand(projectPath, {
    platform: options.platform,
    fallbackEvent: 'SessionStart',
  });
}
