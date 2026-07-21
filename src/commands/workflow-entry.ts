/**
 * `polaris workflow-entry` 命令：workflow.yaml 持锁 RMW。
 */
import { runWorkflowEntry, type WorkflowEntryOp } from '../core/hooks/workflow-entry.js';

export type WorkflowEntryCommandOptions = {
  skill: string;
  repoRoot?: string;
  changeId?: string;
  phase?: string;
  worktreePath?: string;
  startedAt?: string;
  whereChangeId?: string;
  from?: string;
  to?: string;
  sessionSuffix?: string;
  tier?: string;
  t1?: string;
  t2?: string;
  timestamp?: string;
  set?: string[];
};

/**
 * 解析 --set phase=x / worktree-path=y
 */
function parseSets(sets: string[] | undefined): { setPhase?: string; setWorktreePath?: string } {
  const out: { setPhase?: string; setWorktreePath?: string } = {};
  for (const raw of sets ?? []) {
    const eq = raw.indexOf('=');
    if (eq < 0) continue;
    const k = raw.slice(0, eq).replace(/-/g, '_');
    const v = raw.slice(eq + 1);
    if (k === 'phase') out.setPhase = v;
    else if (k === 'worktree_path') out.setWorktreePath = v;
    else {
      console.error(`[workflow-entry] 阻断：--set 不支持的 key: ${k}`);
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
    repoRoot: options.repoRoot,
    changeId: options.changeId,
    phase: options.phase,
    worktreePath: options.worktreePath,
    startedAt: options.startedAt,
    whereChangeId: options.whereChangeId,
    from: options.from,
    to: options.to,
    sessionSuffix: options.sessionSuffix,
    tier: options.tier,
    t1: options.t1,
    t2: options.t2,
    timestamp: options.timestamp,
    setPhase: sets.setPhase,
    setWorktreePath: sets.setWorktreePath,
  });

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}
