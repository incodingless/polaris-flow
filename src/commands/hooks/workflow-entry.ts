/**
 * `polaris workflow-entry` 命令：workflow.yaml 持锁 RMW。
 */
import { runWorkflowEntry, type WorkflowEntryOp } from '../../core/hooks/workflow-entry.js';

export type WorkflowEntryCommandOptions = {
  /** 锁文件写者标识（写 op 必填；get-active-changes 只读，可省） */
  skill?: string;
  kind?: string;
  repoRoot?: string;
  taskId?: string;
  worktreePath?: string;
  startedAt?: string;
  whereTaskId?: string;
  from?: string;
  to?: string;
  set?: string[];
  channel?: string;
  /** get-active-changes：ids（默认）| full */
  format?: 'ids' | 'full';
  /** get-active-changes：按 state.yaml 的阶段过滤 */
  phase?: string;
};

/**
 * 解析 --set worktree-path=y
 */
function parseSets(sets: string[] | undefined): { setWorktreePath?: string } {
  const out: { setWorktreePath?: string } = {};
  for (const raw of sets ?? []) {
    const eq = raw.indexOf('=');
    if (eq < 0) continue;
    const k = raw.slice(0, eq).replace(/-/g, '_');
    const v = raw.slice(eq + 1);
    if (k === 'worktree_path') out.setWorktreePath = v;
    else {
      console.error(`[workflow-entry] 阻断：--set 不支持的 key: ${k}（只支持 worktree-path）`);
      process.exitCode = 3;
      return out;
    }
  }
  return out;
}

/**
 * 运行 workflow-entry；按契约设置 process.exitCode。
 */
export async function workflowEntryCommand(
  op: string,
  options: WorkflowEntryCommandOptions,
): Promise<void> {
  if (process.exitCode === 3) return;

  const sets = parseSets(options.set);
  if (process.exitCode === 3) return;

  const result = await runWorkflowEntry({
    op: op as WorkflowEntryOp,
    skill: options.skill,
    kind: options.kind,
    repoRoot: options.repoRoot,
    taskId: options.taskId,
    worktreePath: options.worktreePath,
    startedAt: options.startedAt,
    whereTaskId: options.whereTaskId,
    from: options.from,
    to: options.to,
    setWorktreePath: sets.setWorktreePath,
    channel: options.channel,
    format: options.format,
    phase: options.phase,
  });

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}
