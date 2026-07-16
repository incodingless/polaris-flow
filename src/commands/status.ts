import path from 'path';

import { loadWorkflowFromCwd } from '../core/config/workflow-state.js';

export type StatusOptions = {
  json?: boolean;
};

export async function runStatus(rawPath: string, options: StatusOptions = {}): Promise<void> {
  const cwd = path.resolve(rawPath || process.cwd());
  const { mainRepo, state } = await loadWorkflowFromCwd(cwd);

  if (!mainRepo) {
    const payload = { error: 'not a git repository', changes: [] };
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('Not a git repository.');
    }
    process.exitCode = 1;
    return;
  }

  const changes = state?.changes ?? [];

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          mainRepo,
          workflowPath: path.join(mainRepo, '.harness', 'workflow.yaml'),
          changes,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Main repository: ${mainRepo}`);
  console.log('');

  if (changes.length === 0) {
    console.log('No active changes.');
    return;
  }

  console.log('Active changes:');
  for (const change of changes) {
    const title = change.title ? ` — ${change.title}` : '';
    const worktree = change.worktree ? ` @ ${change.worktree}` : '';
    console.log(`  • ${change.id} [${change.status}]${title}${worktree}`);
  }
}

export async function statusCommand(projectPath: string, options: StatusOptions): Promise<void> {
  await runStatus(projectPath, options);
}
