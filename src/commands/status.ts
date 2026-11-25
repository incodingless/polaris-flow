/**
 * `polaris status`：展示主仓与 `.polaris/workflow.yaml` 中的五类在途任务。
 *
 * 阶段**不在游标里**：逐任务读其 `state.yaml`（位置由条目的 `worktree_path` 决定），
 * 读不到时打印 `unknown` 而不是猜。
 */
import path from 'path';

import { resolveTaskStatePath } from '../core/assets/polaris-paths.js';
import {
  getWorkflowStatePath,
  loadWorkflowFromCwd,
  type WorkflowTaskEntry,
  type WorkflowTaskKind,
} from '../core/config/workflow-state.js';
import { loadTaskStateFromFile } from '../core/config/task-state.js';
import { resolveProjectLanguage, t, tf } from './i18n/index.js';

export type StatusOptions = {
  json?: boolean;
};

/**
 * 输出当前仓库工作流状态。
 */
export async function runStatus(rawPath: string, options: StatusOptions = {}): Promise<void> {
  const cwd = path.resolve(rawPath || process.cwd());
  // 交互输出语言跟随 init 时写入 `.polaris/config.yaml` 的 language；JSON 输出保持机器可读，不本地化
  const lang = await resolveProjectLanguage(cwd);
  const { mainRepo, state } = await loadWorkflowFromCwd(cwd);

  if (!mainRepo) {
    const payload = {
      error: 'not a git repository',
      coding_tasks: [],
      requirement_tasks: [],
      testcase_tasks: [],
      prototype_tasks: [],
      debug_tasks: [],
    };
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(t(lang, 'statusNotGitRepo'));
    }
    process.exitCode = 1;
    return;
  }

  const codingTasks = state?.coding_tasks ?? [];
  const requirementTasks = state?.requirement_tasks ?? [];
  const testcaseTasks = state?.testcase_tasks ?? [];
  const prototypeTasks = state?.prototype_tasks ?? [];
  const debugTasks = state?.debug_tasks ?? [];

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          mainRepo,
          workflowPath: getWorkflowStatePath(mainRepo),
          coding_tasks: codingTasks,
          requirement_tasks: requirementTasks,
          testcase_tasks: testcaseTasks,
          prototype_tasks: prototypeTasks,
          debug_tasks: debugTasks,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(tf(lang, 'statusMainRepo', { path: mainRepo }));
  console.log('');

  const printSection = async (
    titleKey: string,
    kind: WorkflowTaskKind,
    entries: WorkflowTaskEntry[],
  ) => {
    console.log(`${t(lang, titleKey)}:`);
    if (entries.length === 0) {
      console.log(`  ${t(lang, 'statusNone')}`);
      return;
    }
    for (const entry of entries) {
      const statePath = resolveTaskStatePath(mainRepo, kind, entry.task_id, entry.worktree_path);
      const taskState = await loadTaskStateFromFile(statePath);
      const phase = String(taskState?.phase ?? '') || t(lang, 'statusUnknownPhase');
      const worktree = entry.worktree_path ? ` @ ${entry.worktree_path}` : '';
      console.log(`  • ${entry.task_id} [${phase}]${worktree}`);
    }
  };

  await printSection('statusSectionCoding', 'coding', codingTasks);
  console.log('');
  await printSection('statusSectionRequirement', 'requirement', requirementTasks);
  console.log('');
  await printSection('statusSectionTestcase', 'testcase', testcaseTasks);
  console.log('');
  await printSection('statusSectionPrototype', 'prototype', prototypeTasks);
  console.log('');
  await printSection('statusSectionDebug', 'debug', debugTasks);
}

/**
 * status 命令入口。
 */
export async function statusCommand(projectPath: string, options: StatusOptions): Promise<void> {
  await runStatus(projectPath, options);
}
