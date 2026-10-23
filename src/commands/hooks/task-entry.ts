/**
 * `polaris task-entry` 命令：`intake`（任务管理与调度层）专用的「进入任务」原语
 * （见 core/hooks/task-entry.ts）。调用位置 = `intake` 的 Step 3。
 * stdout 输出一行 JSON（`TaskEntryPayload`）；参数 / 环境错误走 stderr + 非 0 退出码。
 */
import { runTaskEntry } from '../../core/hooks/task-entry.js';

export type TaskEntryCommandOptions = {
  kind?: string;
  /** 调用者名（族内相对名）—— 固定 `intake` */
  as?: string;
  /** 仅 create 时写入的 workflow.mode */
  mode?: string;
  /** 多个候选时，用户选定后重跑 */
  taskId?: string;
  startedAt?: string;
  repoRoot?: string;
};

/** 运行 task-entry */
export async function taskEntryCommand(options: TaskEntryCommandOptions): Promise<void> {
  const result = await runTaskEntry({
    kind: options.kind,
    as: options.as,
    mode: options.mode,
    taskId: options.taskId,
    startedAt: options.startedAt,
    repoRoot: options.repoRoot,
  });
  if (result.payload) {
    console.log(JSON.stringify(result.payload));
  }
  if (result.message) {
    console.error(`[task-entry] 阻断：${result.message}`);
  }
  process.exitCode = result.exitCode;
}
