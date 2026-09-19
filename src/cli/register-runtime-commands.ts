/**
 * 运行时 `polaris-flow` 子命令：hooks / scripts 薄包装调用，不出现在 `polaris --help`。
 */
import type { Command } from 'commander';

import { configGetCommand } from '../commands/config.js';
import { hostHookCommand, sessionStartCommand } from '../commands/hooks/host-hook.js';
import { stateNextCommand } from '../commands/hooks/state.js';
import { workflowEntryCommand } from '../commands/hooks/workflow-entry.js';
import { taskStateEntryCommand } from '../commands/hooks/task-state-entry.js';
import {
  constitutionValidityCommand,
  draftCreateCommand,
  harnessSyncCommand,
  hotfixBranchCreateCommand,
  gitBranchMergeCommand,
  shipCleanupCommand,
  taskFinalizeCommand,
  taskInitCommand,
  tasksLintCommand,
  intentionValidateCommand,
  worktreeCreateCommand,
  worktreeCommitRemoveCommand,
  worktreeMergeStatusCommand,
  worktreeRebaseFfCommand,
} from '../commands/hooks/hooks-rest.js';

/** hooks 薄包装经 `_polaris-cli.sh` 追加的平台选项 */
const PLATFORM_OPTION = ['--platform <id>', 'platform id (claude|cursor|trae)'] as const;

/**
 * 注册 polaris-flow 运行时命令（workflow / task-state / worktree / lint 等）。
 */
export function registerRuntimeCommands(program: Command): void {
  const configProgram = program.command('config').description('Read .polaris/config.yaml values');

  configProgram
    .command('get <key>')
    .description('Get a config value (currently supports: language)')
    .argument('[path]', 'project root', process.cwd())
    .option('--json', 'output JSON (language includes language_name)')
    .action(async (key: string, path: string, options: { json?: boolean }) => {
      await configGetCommand(key, path, { json: options.json });
    });

  program
    .command('host-hook')
    .description('Host lifecycle hook dispatcher: parse stdin and route by event')
    .argument('[path]', 'project root directory')
    .option(...PLATFORM_OPTION)
    .option(
      '--fallback-event <name>',
      'when stdin lacks hook_event_name, treat as this event (e.g. SessionStart)',
    )
    .action(
      async (
        projectPath: string | undefined,
        options: { platform?: string; fallbackEvent?: string },
      ) => {
        await hostHookCommand(projectPath, {
          platform: options.platform,
          fallbackEvent: options.fallbackEvent,
        });
      },
    );

  program
    .command('session-start')
    .description('Alias of host-hook with --fallback-event SessionStart')
    .argument('[path]', 'project root directory')
    .option(...PLATFORM_OPTION)
    .action(async (projectPath: string | undefined, options: { platform?: string }) => {
      await sessionStartCommand(projectPath, { platform: options.platform });
    });

  program
    .command('workflow-entry')
    .description('RMW .polaris/workflow.yaml under workflow.lock (H12)')
    .argument('<op>', 'append-active|update-active|rename-active|delete-active|get-active-changes')
    .requiredOption('--skill <name>', 'lock writer id')
    .requiredOption('--kind <kind>', 'task kind: coding|requirement|testcase|prototype|debug')
    .option('--repo-root <path>', 'main repo root')
    .option('--task-id <id>')
    .option('--phase <phase>')
    .option('--channel <name>', 'debug 族通道：bugfix|hotfix')
    .option('--worktree-path <path>')
    .option('--started-at <iso>')
    .option('--where-task-id <id>')
    .option('--from <id>')
    .option('--to <id>')
    .option(...PLATFORM_OPTION)
    .option(
      '--set <kv...>',
      'phase=... and/or worktree-path=...',
      (val, prev: string[]) => {
        prev.push(val);
        return prev;
      },
      [] as string[],
    )
    .action(async (op: string, options) => {
      await workflowEntryCommand(op, {
        skill: options.skill,
        kind: options.kind,
        repoRoot: options.repoRoot,
        taskId: options.taskId,
        phase: options.phase,
        worktreePath: options.worktreePath,
        startedAt: options.startedAt,
        whereTaskId: options.whereTaskId,
        from: options.from,
        to: options.to,
        set: options.set,
        channel: options.channel,
      });
    });

  program
    .command('task-state-entry')
    .description(
      'RMW .polaris/tasks/<id>/state.yaml (get/set/enter-phase/complete-phase/identity) 与 tasks.md 复选框 (set-checkbox)',
    )
    .argument(
      '<op>',
      'get|get-json|set|enter-phase|complete-phase|set-identity|get-identity|set-checkbox',
    )
    .option('--repo-root <path>', 'main repo root')
    .option('--task-id <id>', 'task id under .polaris/tasks (or testcases)')
    .option('--state-path <path>', 'override absolute state.yaml path')
    .option('--kind <kind>', 'coding|requirement|testcase|prototype|debug (block-style hint)')
    .option(
      '--path <dotted>',
      'get: dotted path (repeatable)',
      (val, prev: string[]) => {
        prev.push(val);
        return prev;
      },
      [] as string[],
    )
    .option('--paths <csv>', 'get-json: comma-separated paths subset')
    .option(
      '--set <kv>',
      'set: path=value (repeatable)',
      (val, prev: string[]) => {
        prev.push(val);
        return prev;
      },
      [] as string[],
    )
    .option('--phase <phase>', 'enter-phase / complete-phase')
    .option('--next-phase <phase>', 'complete-phase: advance top-level phase')
    .option('--block-style <style>', 'runtime|top-level|auto')
    .option('--skill <name>', 'lock writer id')
    .option('--req-name <v>')
    .option('--req-name-cn <v>')
    .option('--req-prefix <v>')
    .option('--name <v>')
    .option('--page-prefix <v>')
    .option('--work-dir <v>')
    .option('--delivered-name <v>')
    .option('--file <relpath>', 'set-checkbox: tasks.md 的项目根相对路径')
    .option('--index <n>', 'set-checkbox: 复选框序号（0-based，按出现顺序）')
    .option('--checked <bool>', 'set-checkbox: true|false')
    .option(...PLATFORM_OPTION)
    .action(async (op: string, options) => {
      await taskStateEntryCommand(op, {
        repoRoot: options.repoRoot,
        taskId: options.taskId,
        statePath: options.statePath,
        kind: options.kind,
        path: options.path,
        paths: options.paths,
        set: options.set,
        phase: options.phase,
        nextPhase: options.nextPhase,
        blockStyle: options.blockStyle,
        skill: options.skill,
        reqName: options.reqName,
        reqNameCn: options.reqNameCn,
        reqPrefix: options.reqPrefix,
        name: options.name,
        pagePrefix: options.pagePrefix,
        workDir: options.workDir,
        deliveredName: options.deliveredName,
        file: options.file,
        index: options.index,
        checked: options.checked,
      });
    });

  const stateProgram = program.command('state').description('Workflow phase transition helper');

  stateProgram
    .command('next')
    .description(
      'Resolve next skill from workflow phase + auto_transition (NEXT: auto|manual|done)',
    )
    .argument('<change-name>', 'coding / requirement / testcase / prototype id')
    .option('--repo-root <path>', 'main repo root')
    .option(...PLATFORM_OPTION)
    .action(async (changeName: string, options: { repoRoot?: string }) => {
      await stateNextCommand(changeName, { repoRoot: options.repoRoot });
    });

  program
    .command('draft-create')
    .description('Create .polaris/<tasks|testcases>/draft-* directory by kind')
    .argument('<repo_root>', 'project root')
    .requiredOption('--kind <kind>', 'task kind: coding|requirement|testcase|prototype')
    .option(...PLATFORM_OPTION)
    .action(async (repoRoot: string, options: { kind: string }) => {
      await draftCreateCommand(repoRoot, options.kind);
    });

  program
    .command('task-init')
    .description(
      'Init task dir + state.yaml by kind (requirement/prototype/debug need --task-id, no draft)',
    )
    .argument('<repo_root>', 'project root')
    .requiredOption('--kind <kind>', 'task kind: coding|requirement|testcase|prototype|debug')
    .option('--task-id <id>', 'formal task id (required when kind does not use draft)')
    .option(...PLATFORM_OPTION)
    .action(async (repoRoot: string, options: { kind: string; taskId?: string }) => {
      await taskInitCommand(repoRoot, { kind: options.kind, taskId: options.taskId });
    });

  program
    .command('task-finalize')
    .description('Specify: rename draft to change_id + workflow rename-active')
    .argument('<repo_root>', 'project root')
    .argument('<draft_name>', 'draft-* name')
    .argument('<change_id>', 'final change id')
    .option(...PLATFORM_OPTION)
    .action(async (repoRoot: string, draftName: string, changeId: string) => {
      await taskFinalizeCommand(repoRoot, draftName, changeId);
    });

  program
    .command('tasks-lint')
    .description('Lint tasks.md for plan/tasks gate')
    .argument('<file>', 'path to tasks.md')
    .option(...PLATFORM_OPTION)
    .action(async (file: string) => {
      await tasksLintCommand(file);
    });

  program
    .command('constitution-validity')
    .description('Check constitution.md validity')
    .argument('[path]', 'project root', process.cwd())
    .option(...PLATFORM_OPTION)
    .action(async (projectPath: string) => {
      await constitutionValidityCommand(projectPath);
    });

  program
    .command('worktree-create')
    .description('Create isolated git worktree for a change')
    .argument('<change_id>', 'change id')
    .argument('<main_repo_root>', 'main repo root')
    .option(...PLATFORM_OPTION)
    .action(async (changeId: string, mainRepoRoot: string) => {
      await worktreeCreateCommand(changeId, mainRepoRoot);
    });

  program
    .command('worktree-commit-remove')
    .description('Commit all changes in a worktree then git worktree remove')
    .argument('<worktree_path>', 'worktree absolute or relative path')
    .requiredOption('-m, --message <msg>', 'commit message')
    .option(...PLATFORM_OPTION)
    .action(async (worktreePath: string, options: { message: string }) => {
      await worktreeCommitRemoveCommand(worktreePath, options.message);
    });

  program
    .command('hotfix-branch-create')
    .description('Create hotfix/<issue_id> from main/master and check it out')
    .argument('<issue_id>', 'issue id (e.g. PROJ-123)')
    .argument('<repo_root>', 'repository root')
    .option(...PLATFORM_OPTION)
    .action(async (issueId: string, repoRoot: string) => {
      await hotfixBranchCreateCommand(issueId, repoRoot);
    });

  program
    .command('git-branch-merge')
    .description('Merge a local branch into main/master with --no-ff')
    .argument('<source_branch>', 'branch to merge into main')
    .argument('<repo_root>', 'repository root')
    .option(...PLATFORM_OPTION)
    .action(async (sourceBranch: string, repoRoot: string) => {
      await gitBranchMergeCommand(sourceBranch, repoRoot);
    });

  program
    .command('worktree-merge-status')
    .description('Worktree dirty check + merge ancestor status')
    .argument('<worktree_path>')
    .argument('<origin_repo>')
    .argument('<branch>')
    .option(...PLATFORM_OPTION)
    .action(async (wt: string, origin: string, branch: string) => {
      await worktreeMergeStatusCommand(wt, origin, branch);
    });

  program
    .command('worktree-rebase-ff')
    .description('Rebase worktree onto default branch then ff-only merge')
    .argument('<worktree_path>')
    .argument('<origin_repo>')
    .argument('<branch>')
    .option(...PLATFORM_OPTION)
    .action(async (wt: string, origin: string, branch: string) => {
      await worktreeRebaseFfCommand(wt, origin, branch);
    });

  program
    .command('harness-sync')
    .description('Sync worktree .polaris artifacts back to origin')
    .argument('<worktree_path>')
    .argument('<origin_repo>')
    .argument('<change_id>')
    .argument('[conflict_mode]', '--overwrite|--suffix|--skip')
    .option(...PLATFORM_OPTION)
    .action(async (wt: string, origin: string, changeId: string, mode?: string) => {
      await harnessSyncCommand(wt, origin, changeId, mode);
    });

  program
    .command('ship-cleanup')
    .description('Delete workflow active entry and .polaris/tasks leftovers')
    .argument('<change_id>')
    .argument('<origin_repo>')
    .option(...PLATFORM_OPTION)
    .action(async (changeId: string, originRepo: string) => {
      await shipCleanupCommand(changeId, originRepo);
    });

  program
    .command('intention-validate')
    .description('Validate intention.md required sections (plan gate)')
    .argument('<file>', 'path to intention.md')
    .option(...PLATFORM_OPTION)
    .action(async (file: string) => {
      await intentionValidateCommand(file);
    });
}
