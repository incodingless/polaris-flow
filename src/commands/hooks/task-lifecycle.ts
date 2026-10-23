/**
 * `polaris task-init` / `task-finalize` 命令薄包装聚合。
 */
import { finalize } from '../../core/hooks/task.js';
import { taskInitCommand as runTaskInit, type TaskInitCommandOptions } from './task-init.js';

/** 运行 task-init */
export async function taskInitCommand(
  repoRoot: string,
  options: TaskInitCommandOptions,
): Promise<void> {
  await runTaskInit(repoRoot, options);
}

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
