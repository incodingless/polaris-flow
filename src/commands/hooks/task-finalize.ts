/**
 * `polaris task-finalize` 命令。
 */
import { finalize } from '../../core/hooks/task.js';

/** 运行 task-finalize */
export async function taskFinalizeCommand(
  repoRoot: string,
  draftName: string,
  changeId: string,
): Promise<void> {
  const result = await finalize(repoRoot, draftName, changeId);
  if (result.payload) {
    console.log(JSON.stringify(result.payload));
  }
  if (result.message) {
    console.error(`[task-finalize] 阻断：${result.message}`);
  }
  process.exitCode = result.exitCode;
}
