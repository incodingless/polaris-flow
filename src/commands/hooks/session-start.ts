/**
 * `polaris session-start` 命令：执行 SessionStart hook 核心逻辑并设置进程退出码。
 */
import path from 'path';

import { readHostHookStdin } from './read-host-stdin.js';
import { resolveHookPlatformId } from '../../core/hooks/resolve-platform.js';
import { runSessionStart } from '../../core/hooks/session-start.js';

export type SessionStartCommandOptions = {
  /** CLI `--platform`；优先于 config */
  platform?: string;
};

/**
 * 运行 SessionStart；有 WARN/FAIL 时设置 process.exitCode = 1。
 * 路径优先级：CLI 位置参数 → stdin.cwd → process.cwd()。
 */
export async function sessionStartCommand(
  projectPath?: string,
  options: SessionStartCommandOptions = {},
): Promise<void> {
  const stdin = await readHostHookStdin();
  const resolved = path.resolve(projectPath || stdin.cwd || process.cwd());
  const platformId = await resolveHookPlatformId(resolved, options.platform);
  const result = await runSessionStart({
    projectPath: resolved,
    platformId: platformId ?? undefined,
    sessionId: stdin.session_id,
  });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}
