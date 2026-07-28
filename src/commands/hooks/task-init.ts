/**
 * `polaris task-init` 命令。
 */
import { init } from '../../core/hooks/task.js';

/** 运行 task-init */
export async function taskInitCommand(repoRoot: string): Promise<void> {
  const result = await init(repoRoot);
  if (result.payload) {
    console.log(JSON.stringify(result.payload));
  }
  if (result.message) {
    console.error(`[task-init] 阻断：${result.message}`);
  }
  process.exitCode = result.exitCode;
}
