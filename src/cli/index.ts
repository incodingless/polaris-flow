/**
 * CLI 入口：按 bin 名分流。
 * - `polaris`：用户生命周期命令（init/status/dashboard/doctor/update/uninstall）
 * - `polaris-flow`：hooks/scripts 运行时命令
 */
import { Command } from 'commander';
import { createRequire } from 'module';

import { loadI18n } from '../commands/i18n/index.js';
import { resolveCliEntry } from './resolve-entry.js';
import { registerUserCommands } from './register-user-commands.js';
import { registerRuntimeCommands } from './register-runtime-commands.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const entry = resolveCliEntry();
const program = new Command();

if (entry === 'polaris') {
  program
    .name('polaris')
    .description('Polaris workflow platform: init, status, dashboard, doctor, update, uninstall')
    .version(version);
  registerUserCommands(program);
} else {
  program
    .name('polaris-flow')
    .description('Polaris Flow runtime CLI for hooks and skill scripts')
    .version(version);
  registerRuntimeCommands(program);
}

program.hook('preAction', async (_thisCommand, actionCommand) => {
  const name = actionCommand.name();
  if (name === 'version' || name === 'help') {
    return;
  }
  await loadI18n();
});

program.parse();
