import { Command } from 'commander';
import { createRequire } from 'module';

import { loadI18n } from '../commands/i18n/index.js';
import { initCommand } from '../commands/init.js';
import { updateCommand } from '../commands/update.js';
import { doctorCommand } from '../commands/doctor.js';
import { statusCommand } from '../commands/status.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const program = new Command();

program
  .name('polaris-flow')
  .description(
    'All-in-one Polaris workflow platform: install, schema, skills, and dashboard',
  )
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
  .option('--json', 'output JSON')
  .action(async (path: string, options) => {
    await initCommand(path, {
      yes: options.yes,
      scope: options.scope,
      overwrite: options.overwrite,
      skipExisting: options.skipExisting,
      lang: options.lang,
      json: options.json,
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

program.parse();
