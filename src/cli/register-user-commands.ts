/**
 * 用户面 `polaris` 子命令：仅 README 列出的生命周期命令。
 *
 * 帮助文案（description / option / addHelpText）按 `.polaris/config.yaml` 的 `language`
 * 输出：语言在 CLI 入口注册命令前解析并传入，Commander 的帮助是注册期静态字符串。
 */
import type { Command } from 'commander';

import { initCommand } from '../commands/init.js';
import { updateCommand } from '../commands/update.js';
import { uninstallCommand } from '../commands/uninstall.js';
import { doctorCommand } from '../commands/doctor.js';
import { statusCommand } from '../commands/status.js';
import { DEFAULT_DASHBOARD_PORT, dashboardCommand } from '../commands/dashboard.js';
import { UPDATE_DEPENDENCIES, UPDATE_TARGETS } from '../core/update/scope.js';
import { parseLocalPathPairs } from '../core/install/channels.js';
import { t, tf } from '../commands/i18n/index.js';
import type { Languages } from '../core/config/polaris-project-config.js';

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
export function registerUserCommands(program: Command, lang: Languages): void {
  program
    .command('init')
    .description(t(lang, 'cmdInitDesc'))
    .argument('[path]', t(lang, 'argTargetDir'), process.cwd())
    .option('--yes', t(lang, 'optYes'))
    .option('--scope <scope>', t(lang, 'optScopePlain'))
    .option('--overwrite', t(lang, 'optOverwrite'))
    .option('--skip-existing', t(lang, 'optSkipExisting'))
    .option('--lang <lang>', t(lang, 'optLangInit'))
    .option('--platforms <ids>', t(lang, 'optPlatforms'), splitList)
    .option('--github-mirror <url>', t(lang, 'optGithubMirror'))
    .option('--npm-registry <url>', t(lang, 'optNpmRegistry'))
    .option(
      '--local-path <component=dir>',
      t(lang, 'optLocalPath'),
      (value: string, previous: string[]) => previous.concat(value),
      [] as string[],
    )
    .option('--json', t(lang, 'optJson'))
    .action(async (path: string, options) => {
      try {
        const { localPaths, invalid } = parseLocalPathPairs(options.localPath ?? []);
        if (invalid.length > 0) {
          console.error(
            `Invalid --local-path value(s): ${invalid.join(', ')} (expected <openspec|superpowers|codegraph>=<dir>)`,
          );
          process.exitCode = 1;
          return;
        }
        await initCommand(path, {
          yes: options.yes,
          scope: options.scope,
          overwrite: options.overwrite,
          skipExisting: options.skipExisting,
          lang: options.lang,
          platforms: options.platforms,
          githubMirror: options.githubMirror,
          npmRegistry: options.npmRegistry,
          localPaths,
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
    .description(t(lang, 'cmdStatusDesc'))
    .argument('[path]', t(lang, 'argWorkingDir'), process.cwd())
    .option('--json', t(lang, 'optJson'))
    .action(async (path: string, options) => {
      await statusCommand(path, { json: options.json });
    });

  program
    .command('dashboard')
    .description(t(lang, 'cmdDashboardDesc'))
    .argument('[path]', t(lang, 'argProjectRoot'), process.cwd())
    .option('--port <n>', t(lang, 'optPort'), String(DEFAULT_DASHBOARD_PORT))
    .option('--no-open', t(lang, 'optNoOpen'))
    .option('--api-only', t(lang, 'optApiOnly'))
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
    .description(t(lang, 'cmdDoctorDesc'))
    .argument('[path]', t(lang, 'argTargetDir'), process.cwd())
    .option('--json', t(lang, 'optJson'))
    .option('--scope <scope>', t(lang, 'optScopePlain'))
    .action(async (path: string, options) => {
      await doctorCommand(path, {
        json: options.json,
        scope: options.scope,
      });
    });

  program
    .command('update')
    .description(t(lang, 'cmdUpdateDesc'))
    .argument('[path]', t(lang, 'argTargetDir'), process.cwd())
    .option('--only <items>', t(lang, 'optOnly'), splitList)
    .option('--skip <items>', t(lang, 'optSkip'), splitList)
    .option('--force', t(lang, 'optForce'))
    .option('--prune', t(lang, 'optPrune'))
    .option('--lang <lang>', t(lang, 'optLangUpdate'))
    .option('--scope <scope>', t(lang, 'optScopeUpdate'))
    .option('--json', t(lang, 'optJson'))
    .addHelpText(
      'after',
      `\n  ${tf(lang, 'helpUpdateTargets', {
        targets: UPDATE_TARGETS.map((name) => `'${name}'`).join(' | '),
      })}\n` + `  ${tf(lang, 'helpUpdateDefault', { deps: UPDATE_DEPENDENCIES.join(' / ') })}\n`,
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
    .description(t(lang, 'cmdUninstallDesc'))
    .argument('[path]', t(lang, 'argTargetDir'), process.cwd())
    .option('--targets <items>', t(lang, 'optTargets'), splitList)
    .option('--keep-data', t(lang, 'optKeepData'))
    .option('--yes', t(lang, 'optYesUninstall'))
    .option('--dry-run', t(lang, 'optDryRun'))
    .option('--json', t(lang, 'optJson'))
    .addHelpText('after', `\n  ${t(lang, 'helpUninstallAfter').replaceAll('\n', '\n  ')}\n`)
    .action(async (path: string, options) => {
      await uninstallCommand(path, {
        targets: options.targets,
        keepData: options.keepData,
        yes: options.yes,
        dryRun: options.dryRun,
        json: options.json,
      });
    });
}
