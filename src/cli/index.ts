/**
 * CLI 入口：按 bin 名分流。
 * - `polaris`：用户生命周期命令（init/status/dashboard/doctor/update/uninstall）
 * - `polaris-flow`：hooks/scripts 运行时命令
 */
import { Command } from 'commander';
import { createRequire } from 'module';

import { loadI18n, resolveProjectLanguage, t } from '../commands/i18n/index.js';
import type { Languages } from '../core/config/polaris-project-config.js';
import { resolveCliEntry } from './resolve-entry.js';
import { registerUserCommands } from './register-user-commands.js';
import { registerRuntimeCommands } from './register-runtime-commands.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

/**
 * 把 Commander 内置的 help 段标题与固定提示语替换为当前语言。
 * 各命令自身的 description / option 文案在注册时已走 t()，这里只兜内置英文。
 */
function localizeHelpOutput(command: Command, lang: Languages): void {
  const original = command.helpInformation.bind(command);
  command.helpInformation = () =>
    original()
      .replaceAll('Usage:', t(lang, 'helpUsage'))
      .replaceAll('Arguments:', t(lang, 'helpArguments'))
      .replaceAll('Options:', t(lang, 'helpOptions'))
      .replaceAll('Commands:', t(lang, 'helpCommands'))
      .replaceAll('display help for command', t(lang, 'helpDisplayHelpFor'))
      .replaceAll('output the version number', t(lang, 'helpOutputVersion'));
  for (const sub of command.commands) {
    localizeHelpOutput(sub, lang);
  }
}

const entry = resolveCliEntry();
const program = new Command();

if (entry === 'polaris') {
  // help 在命令动作之外输出，i18n 与语言必须在注册前就绪（此前 preAction 懒加载只覆盖动作内输出）
  await loadI18n();
  const lang = await resolveProjectLanguage(process.cwd());
  program.name('polaris').description(t(lang, 'cliDescription')).version(version);
  registerUserCommands(program, lang);
  localizeHelpOutput(program, lang);
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
