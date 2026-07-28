/**
 * `polaris session-start` 命令：执行 SessionStart hook 核心逻辑并设置进程退出码。
 */
import path from 'path';

import { runSessionStart } from '../../core/hooks/session-start.js';

export type SessionStartCommandOptions = {
  /** 可选；默认 cwd */
  path?: string;
};

/**
 * 运行 SessionStart；有 WARN/FAIL 时设置 process.exitCode = 1。
 */
export async function sessionStartCommand(
  projectPath?: string,
  _options: SessionStartCommandOptions = {},
): Promise<void> {
  const resolved = path.resolve(projectPath || process.cwd());
  const result = await runSessionStart({ projectPath: resolved });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}
