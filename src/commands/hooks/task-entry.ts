/**
 * `polaris task-entry` 命令：入口技能「进入任务」的唯一原语（见 core/hooks/task-entry.ts）。
 * stdout 输出一行 JSON（`TaskEntryPayload`）；参数 / 环境错误走 stderr + 非 0 退出码。
 */
import { runTaskEntry } from '../../core/hooks/task-entry.js';

export type TaskEntryCommandOptions = {
  kind?: string;
  /** 本技能名（族内相对名，如 tweak） */
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
