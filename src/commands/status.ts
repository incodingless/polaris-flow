/**
 * `polaris status`：展示主仓与 `.polaris/workflow.yaml` 中的三类任务游标。
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
    const payload = {
      error: 'not a git repository',
      change_tasks: [],
      requirement_tasks: [],
      testcase_tasks: [],
    };
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('Not a git repository.');
    }
    process.exitCode = 1;
    return;
  }

  const changeTasks = state?.change_tasks ?? [];
  const requirementTasks = state?.requirement_tasks ?? [];
  const testcaseTasks = state?.testcase_tasks ?? [];

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          mainRepo,
          workflowPath: getWorkflowStatePath(mainRepo),
          change_tasks: changeTasks,
          requirement_tasks: requirementTasks,
          testcase_tasks: testcaseTasks,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Main repository: ${mainRepo}`);
  console.log('');

  const printSection = (
    title: string,
    entries: Array<{ task_id: string; phase: string; worktree_path: string }>,
  ) => {
    console.log(`${title}:`);
    if (entries.length === 0) {
      console.log('  (none)');
      return;
    }
    for (const entry of entries) {
      const worktree = entry.worktree_path ? ` @ ${entry.worktree_path}` : '';
      console.log(`  • ${entry.task_id} [${entry.phase || 'unknown'}]${worktree}`);
    }
  };

  printSection('Change tasks', changeTasks);
  console.log('');
  printSection('Requirement tasks', requirementTasks);
  console.log('');
  printSection('Testcase tasks', testcaseTasks);
}

/**
 * status 命令入口。
 */
export async function statusCommand(projectPath: string, options: StatusOptions): Promise<void> {
  await runStatus(projectPath, options);
}
