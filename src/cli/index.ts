import { Command } from 'commander';
import { createRequire } from 'module';

import { loadI18n } from '../commands/i18n/index.js';
import { initCommand } from '../commands/init.js';
import { updateCommand } from '../commands/update.js';
import { doctorCommand } from '../commands/doctor.js';
import { statusCommand } from '../commands/status.js';
import { hostHookCommand, sessionStartCommand } from '../commands/hooks/host-hook.js';
import { workflowEntryCommand } from '../commands/hooks/workflow-entry.js';
import {
  constitutionValidityCommand,
  draftCreateCommand,
  harnessSyncCommand,
  shipCleanupCommand,
  taskFinalizeCommand,
  taskInitCommand,
  tasksLintCommand,
  intentionValidateCommand,
  worktreeCreateCommand,
  worktreeMergeStatusCommand,
  worktreeRebaseFfCommand,
} from '../commands/hooks/hooks-rest.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const program = new Command();

program
  .name('polaris')
  .description('All-in-one Polaris workflow platform: install, schema, skills, and dashboard')
  .version(version);

program.hook('preAction', async (_thisCommand, actionCommand) => {
  const name = actionCommand.name();
  if (name === 'version' || name === 'help') {
    return;
  }
  await loadI18n();
});

program
  .command('init')
  .description('Initialize Polaris workflow in a project')
  .argument('[path]', 'target project directory', process.cwd())
  .option('--yes', 'non-interactive; use detected platforms')
  .option('--scope <scope>', 'install scope: project or global')
  .option('--overwrite', 'overwrite existing components')
  .option('--skip-existing', 'skip existing components')
  .option('--lang <lang>', 'skill language: zh or en')
  .option(
    '--platforms <ids>',
    'comma-separated platform ids (e.g. trae,claude,cursor); skips platform prompt',
    (value: string) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
  )
  .option('--json', 'output JSON')
  .action(async (path: string, options) => {
    try {
      await initCommand(path, {
        yes: options.yes,
        scope: options.scope,
        overwrite: options.overwrite,
        skipExisting: options.skipExisting,
        lang: options.lang,
        platforms: options.platforms,
        json: options.json,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log('\n  Cancelled.\n');
        process.exit(0);
      }
      throw error;
    }
  });

program
  .command('update')
  .description('Update bundled Polaris skills to latest version')
  .argument('[path]', 'target project directory', process.cwd())
  .option('--force', 'force re-copy all components')
  .option('--lang <lang>', 'skill language: zh or en')
  .option('--scope <scope>', 'install scope: project or global')
  .option('--json', 'output JSON')
  .action(async (path: string, options) => {
    await updateCommand(path, {
      force: options.force,
      lang: options.lang,
      scope: options.scope,
      json: options.json,
    });
  });

program
  .command('doctor')
  .description('Diagnose environment and installation health')
  .argument('[path]', 'target project directory', process.cwd())
  .option('--json', 'output JSON diagnostics')
  .option('--scope <scope>', 'install scope: project or global')
  .action(async (path: string, options) => {
    await doctorCommand(path, {
      json: options.json,
      scope: options.scope,
    });
  });

program
  .command('status')
  .description('Show active workflow changes (worktree-aware)')
  .argument('[path]', 'working directory', process.cwd())
  .option('--json', 'output JSON')
  .action(async (path: string, options) => {
    await statusCommand(path, { json: options.json });
  });

/** hooks 薄包装经 `_polaris-cli.sh` 追加的平台选项；多数子命令仅接受以免 unknown option */
const PLATFORM_OPTION = ['--platform <id>', 'platform id (claude|cursor|trae)'] as const;

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
  .argument(
    '<op>',
    'append-active|update-active|rename-active|delete-active|get-active-changes|upsert-pending-triage|delete-pending-triage',
  )
  .requiredOption('--skill <name>', 'lock writer id')
  .option('--repo-root <path>', 'main repo root')
  .option('--change-id <id>')
  .option('--phase <phase>')
  .option('--worktree-path <path>')
  .option('--started-at <iso>')
  .option('--where-change-id <id>')
  .option('--from <id>')
  .option('--to <id>')
  .option('--session-suffix <hex>')
  .option('--tier <tier>')
  .option('--t1 <result>')
  .option('--t2 <result>')
  .option('--timestamp <iso>')
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
      set: options.set,
    });
  });

program
  .command('draft-create')
  .description('Create .polaris/tasks/draft-* directory')
  .argument('<repo_root>', 'project root')
  .option(...PLATFORM_OPTION)
  .action(async (repoRoot: string) => {
    await draftCreateCommand(repoRoot);
  });

program
  .command('task-init')
  .description('Clarify: create draft task + state.yaml')
  .argument('<repo_root>', 'project root')
  .option(...PLATFORM_OPTION)
  .action(async (repoRoot: string) => {
    await taskInitCommand(repoRoot);
  });

program
  .command('task-finalize')
  .description('Clarify: rename draft to change_id + workflow rename-active')
  .argument('<repo_root>', 'project root')
  .argument('<draft_name>', 'draft-* name')
  .argument('<change_id>', 'final change id')
  .option(...PLATFORM_OPTION)
  .action(async (repoRoot: string, draftName: string, changeId: string) => {
    await taskFinalizeCommand(repoRoot, draftName, changeId);
  });

program
  .command('tasks-lint')
  .description('Lint tasks.md for propose/plan gate')
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
  .description('Validate intention.md required sections (propose gate)')
  .argument('<file>', 'path to intention.md')
  .option(...PLATFORM_OPTION)
  .action(async (file: string) => {
    await intentionValidateCommand(file);
  });

program.parse();
