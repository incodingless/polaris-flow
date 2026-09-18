/**
 * 用户面 `polaris` 子命令：仅 README 列出的生命周期命令。
 */
import type { Command } from 'commander';

import { initCommand } from '../commands/init.js';
import { updateCommand } from '../commands/update.js';
import { doctorCommand } from '../commands/doctor.js';
import { statusCommand } from '../commands/status.js';
import { startDashboard } from '../dashboard/server.js';

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
    .command('status')
    .description('Show active workflow changes (worktree-aware)')
    .argument('[path]', 'working directory', process.cwd())
    .option('--json', 'output JSON')
    .action(async (path: string, options) => {
      await statusCommand(path, { json: options.json });
    });

  program
    .command('dashboard')
    .description('Start local Dashboard (launches sibling polaris-web)')
    .argument('[path]', 'project root to visualize', process.cwd())
    .option('--port <n>', 'Vue frontend port (POLARIS_WEB_PORT)', '5173')
    .option('--api-port <n>', 'API port via polaris-cli (POLARIS_API_PORT)', '3700')
    .option('--open', 'open browser after start')
    .action(async (projectPath: string, options: { port?: string; apiPort?: string; open?: boolean }) => {
      const port = Number(options.port ?? 5173);
      const apiPort = Number(options.apiPort ?? 3700);
      try {
        await startDashboard({
          port: Number.isFinite(port) ? port : 5173,
          apiPort: Number.isFinite(apiPort) ? apiPort : 3700,
          projectPath,
          open: Boolean(options.open),
        });
      } catch (err) {
        console.error(`[dashboard] ${(err as Error).message}`);
        process.exitCode = 1;
      }
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
    .command('uninstall')
    .description('Uninstall Polaris components from a project')
    .argument('[path]', 'target project directory', process.cwd())
    .action(async () => {
      console.error('[uninstall] 尚未实现');
      process.exitCode = 1;
    });
}
