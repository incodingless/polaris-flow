/**
 * 用户面 `polaris` 子命令：仅 README 列出的生命周期命令。
 */
import type { Command } from 'commander';

import { initCommand } from '../commands/init.js';
import { updateCommand } from '../commands/update.js';
import { doctorCommand } from '../commands/doctor.js';
import { statusCommand } from '../commands/status.js';
import { DEFAULT_DASHBOARD_PORT, dashboardCommand } from '../commands/dashboard.js';
import { UPDATE_TARGETS } from '../core/update/scope.js';

/** 逗号分隔列表选项 → 去空数组 */
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 注册 polaris 用户命令：init / status / dashboard / doctor / update / uninstall。
 */
export function registerUserCommands(program: Command): void {
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
      splitList,
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
    .command('status')
    .description('Show active workflow changes (worktree-aware)')
    .argument('[path]', 'working directory', process.cwd())
    .option('--json', 'output JSON')
    .action(async (path: string, options) => {
      await statusCommand(path, { json: options.json });
    });

  program
    .command('dashboard')
    .description('Start the local workbench (API + web UI on one port)')
    .argument('[path]', 'project root to visualize', process.cwd())
    .option('--port <n>', 'server port', String(DEFAULT_DASHBOARD_PORT))
    .option('--no-open', 'do not open the browser automatically')
    .option('--api-only', 'serve the API only (for `npm run dev` in dashboard/)')
    .action(
      async (
        projectPath: string,
        options: { port?: string; open?: boolean; apiOnly?: boolean },
      ) => {
        await dashboardCommand(projectPath, {
          port: options.port,
          open: options.open,
          apiOnly: options.apiOnly,
        });
      },
    );

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
    .command('update')
    .description('Update the Polaris program, bundled assets, and dependencies (scope selectable)')
    .argument('[path]', 'target project directory', process.cwd())
    .option(
      '--only <items>',
      'only update these targets (comma-separated); cannot be combined with --skip',
      splitList,
    )
    .option('--skip <items>', 'update all except these targets (comma-separated)', splitList)
    .option('--force', 'ignore source fingerprints and rewrite the selected targets')
    .option('--prune', 'remove stale files in Polaris-owned directories (skills, commands)')
    .option('--lang <lang>', 'skill language: zh or en (default: from .polaris/config.yaml)')
    .option('--scope <scope>', 'install scope: project or global (default: config.yaml)')
    .option('--json', 'output JSON')
    .addHelpText(
      'after',
      `\n  targets: groups are 'program' | 'assets' | 'deps' | 'all';\n` +
        `           members are '${UPDATE_TARGETS.filter((name) => name !== 'all').join("' | '")}'\n`,
    )
    .action(async (path: string, options) => {
      try {
        await updateCommand(path, {
          only: options.only,
          skip: options.skip,
          force: options.force,
          prune: options.prune,
          lang: options.lang,
          scope: options.scope,
          json: options.json,
        });
      } catch (error) {
        // 范围解析失败等属用户输入问题，给一行结论而不是堆栈
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  program
    .command('uninstall')
    .description('Uninstall Polaris components from a project')
    .argument('[path]', 'target project directory', process.cwd())
    .action(async () => {
      console.error('[uninstall] 尚未实现');
      process.exitCode = 1;
    });
}
