/**
 * `polaris status`：展示主仓与 `.polaris/workflow.yaml` 中的 active_changes。
 */
import path from 'path';

import { getWorkflowStatePath, loadWorkflowFromCwd } from '../core/config/workflow-state.js';

export type StatusOptions = {
  json?: boolean;
};

/**
 * 输出当前仓库工作流状态。
 */
export async function runStatus(rawPath: string, options: StatusOptions = {}): Promise<void> {
  const cwd = path.resolve(rawPath || process.cwd());
  const { mainRepo, state } = await loadWorkflowFromCwd(cwd);

  if (!mainRepo) {
    const payload = { error: 'not a git repository', active_changes: [] };
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('Not a git repository.');
    }
    process.exitCode = 1;
    return;
  }

  const active = state?.active_changes ?? [];

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          mainRepo,
          workflowPath: getWorkflowStatePath(mainRepo),
          active_changes: active,
          pending_triages: state?.pending_triages ?? [],
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Main repository: ${mainRepo}`);
  console.log('');

  if (active.length === 0) {
    console.log('No active changes.');
    return;
  }

  console.log('Active changes:');
  for (const change of active) {
    const worktree = change.worktree_path ? ` @ ${change.worktree_path}` : '';
    console.log(`  • ${change.change_id} [${change.phase || 'unknown'}]${worktree}`);
  }
}

/**
 * status 命令入口。
 */
export async function statusCommand(projectPath: string, options: StatusOptions): Promise<void> {
  await runStatus(projectPath, options);
}
