/**
 * `polaris task-init` 命令。
 */
import { init } from '../../core/hooks/task.js';
import { getTaskKindLayout, parseTaskKind } from '../../core/config/task-kind-layout.js';
import { workflowTaskKindErrorMessage } from '../../core/config/workflow-state.js';

export type TaskInitCommandOptions = {
  kind: string;
  taskId?: string;
};

/** 运行 task-init */
export async function taskInitCommand(
  repoRoot: string,
  options: TaskInitCommandOptions,
): Promise<void> {
  const kind = parseTaskKind(options.kind);
  if (!kind) {
    console.error(`[task-init] 阻断：${workflowTaskKindErrorMessage()}`);
    process.exitCode = 2;
    return;
  }
  const layout = getTaskKindLayout(kind);
  if (!layout.usesDraft && !(options.taskId ?? '').trim()) {
    console.error(`[task-init] 阻断：kind=${kind} 不使用 draft，须提供 --task-id`);
    process.exitCode = 2;
    return;
  }
  const result = await init(repoRoot, kind, { taskId: options.taskId });
  if (result.payload) {
    console.log(JSON.stringify(result.payload));
  }
  if (result.message) {
    console.error(`[task-init] 阻断：${result.message}`);
  }
  process.exitCode = result.exitCode;
}
