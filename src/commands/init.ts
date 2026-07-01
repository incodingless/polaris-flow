import path from 'path';
import os from 'os';

import { t } from './i18n/index.js';
import {
  promptBulkOverwriteChoice,
  promptInstallScope,
  promptOverwriteChoice,
  promptPlatforms,
  promptSkillLanguage,
  resolveAction,
  type ComponentAction,
} from './prompts.js';
import { detectPlatforms, getBaseDir, hasSkills } from '../core/detect.js';
import { installOpenSpec } from '../core/openspec.js';
import { installSuperpowersForPlatforms, SUPERPOWERS_MIN_VERSION } from '../core/superpowers.js';
import { getLanguageSkillsDir, readAssetManifest } from '../core/manifest.js';
import { writeLockFile, type LockSourceEntry } from '../core/install.js';
import { getNpmPackageVersion } from '../core/npm.js';
import {
  copyPolarisRulesForPlatform,
  installPolarisHooksForPlatform,
  copyPolarisSkillsForPlatform,
  createWorkingDirs,
  getAssetsDir,
} from '../core/skills.js';
import {
  getPlatformSkillsDir,
  getSettingsFilePath,
  PLATFORMS,
  type Platform,
} from '../core/platforms.js';
import { bold, dim, cyan, green, yellow, red, blue, drawBox } from '../core/color.js';
import type { InstallScope, SkillLanguage } from '../core/types.js';

export type InitOptions = {
  yes?: boolean;
  scope?: InstallScope;
  overwrite?: boolean;
  skipExisting?: boolean;
  lang?: SkillLanguage;
  json?: boolean;
};

type InstallStatus = 'installed' | 'skipped' | 'failed';

export type InitPlatformResult = {
  platformId: string;
  platformName: string;
  openspec: InstallStatus;
  superpowers: InstallStatus;
  polaris: InstallStatus;
  skills: { copied: number; skipped: number };
  rules: { copied: number; skipped: number };
  hooks: { installed: boolean; reason?: string };
};

export type InitResult = {
  projectPath: string;
  scope: InstallScope;
  language: SkillLanguage;
  platforms: string[];
  results: InitPlatformResult[];
};

type Logger = (message: string) => void;

type ComponentPlan = {
  polarisAction: ComponentAction;
  spAction: ComponentAction;
  osAction: ComponentAction;
};

type PlatformPlan = ComponentPlan & {
  platform: Platform;
  hasPolaris: boolean;
  hasSP: boolean;
  hasOS: boolean;
};

const OPENSPEC_PACKAGE = '@fission-ai/openspec';

const POLARIS_BANNER = [
  ``,
  `${cyan('▄▄▄▄▄▄  ')}                                            ██                ${cyan('▄▄▄▄▄▄▄▄')} ▄▄▄▄                         `,
  `${cyan('██▀▀▀▀█▄')}                                            ▀▀                ${cyan('██▀▀▀▀▀▀')} ▀▀██                         `,
  `${cyan('██    ██')}  ▄████▄     ██       ▄█████▄   ██▄████   ████     ▄▄█████▄   ${cyan('██      ')}   ██       ▄████▄  ██      ██`,
  `${cyan('██████▀ ')} ██▀  ▀██    ██       ▀ ▄▄▄██   ██▀         ██     ██▄▄▄▄ ▀   ${cyan('███████ ')}   ██      ██▀  ▀██ ▀█  ██  █▀`,
  `${cyan('██      ')} ██    ██    ██      ▄██▀▀▀██   ██          ██      ▀▀▀▀██▄   ${cyan('██      ')}   ██      ██    ██  ██▄██▄██ `,
  `${cyan('██      ')} ▀██▄▄██▀    ██▄▄▄   ██▄▄▄███   ██       ▄▄▄██▄▄▄  █▄▄▄▄▄██   ${cyan('██      ')}   ██▄▄▄   ▀██▄▄██▀  ▀██  ██▀ `,
  `${cyan('▀▀      ')}   ▀▀▀▀       ▀▀▀▀    ▀▀▀▀ ▀▀   ▀▀       ▀▀▀▀▀▀▀▀   ▀▀▀▀▀▀    ${cyan('██')}          ▀▀▀▀     ▀▀▀▀     ▀▀  ▀▀  `,
  `${green(':'.repeat(106))}`,
  `  ${bold('OpenSpec')} + ${bold('Superpowers')} + ${bold('Polaris')} Workflow`,
  ``,
].join('\n');

function createLogger(json: boolean): Logger {
  return json ? () => {} : (message: string) => console.log(message);
}

function statusSymbol(status: InstallStatus): string {
  if (status === 'installed') return green('✓');
  if (status === 'skipped') return dim('○');
  return red('✗');
}

function statusLabel(status: InstallStatus, lang: SkillLanguage): string {
  if (status === 'installed') return green('installed');
  if (status === 'skipped') return dim(t(lang, 'skip'));
  return red(t(lang, 'failedStatus'));
}

async function selectScope(options: InitOptions, lang?: string): Promise<InstallScope> {
  if (options.scope) {
    if (options.scope === 'project' || options.scope === 'global') {
      return options.scope;
    }
    console.warn(
      `  Warning: invalid scope "${options.scope}", expected "project" or "global". Falling back to prompt.`,
    );
  }
  if (options.yes) return 'project';
  return promptInstallScope(lang);
}

async function selectLanguage(options: InitOptions, langHint?: string): Promise<SkillLanguage> {
  if (options.lang === 'zh' || options.lang === 'en') {
    return options.lang;
  }
  if (options.yes) return 'en';
  return promptSkillLanguage(langHint);
}

async function selectPlatforms(
  detected: Set<string>,
  options: InitOptions,
  lang?: string,
): Promise<Platform[]> {
  if (options.yes) {
    const fromDetected = PLATFORMS.filter((p) => detected.has(p.id));
    if (fromDetected.length > 0) return fromDetected;
    return PLATFORMS.filter((p) => p.id === 'cursor' || p.id === 'claude');
  }
  return promptPlatforms(detected, lang);
}

async function buildInstallPlans(
  baseDir: string,
  platforms: Platform[],
  scope: InstallScope,
  options: InitOptions,
  lang: SkillLanguage,
): Promise<PlatformPlan[]> {
  const plans: PlatformPlan[] = [];

  for (const platform of platforms) {
    const hasPolaris = await hasSkills(baseDir, platform, 'polaris', platforms, scope);
    const hasSP = await hasSkills(baseDir, platform, 'superpowers', platforms, scope);
    const hasOS = await hasSkills(baseDir, platform, 'openspec', platforms, scope);

    let polarisAction = resolveAction(hasPolaris, options);
    let spAction = resolveAction(hasSP, options);
    let osAction = resolveAction(hasOS, options);

    if (!options.yes) {
      const existingComponents = [
        hasPolaris && polarisAction === 'install' ? 'Polaris' : null,
        hasSP && spAction === 'install' ? 'Superpowers' : null,
        hasOS && osAction === 'install' ? 'OpenSpec' : null,
      ].filter((c): c is string => Boolean(c));

      if (existingComponents.length > 1) {
        const bulkChoice = await promptBulkOverwriteChoice(platform.name, existingComponents, lang);
        if (bulkChoice !== 'choose') {
          const action: ComponentAction = bulkChoice === 'overwrite-all' ? 'overwrite' : 'skip';
          if (polarisAction === 'install') polarisAction = action;
          if (spAction === 'install') spAction = action;
          if (osAction === 'install') osAction = action;
        }
      }

      if (polarisAction === 'install' && hasPolaris) {
        polarisAction = await promptOverwriteChoice('Polaris', platform.name, lang);
      }
      if (spAction === 'install' && hasSP) {
        spAction = await promptOverwriteChoice('Superpowers', platform.name, lang);
      }
      if (osAction === 'install' && hasOS) {
        osAction = await promptOverwriteChoice('OpenSpec', platform.name, lang);
      }
    }

    plans.push({ platform, polarisAction, spAction, osAction, hasPolaris, hasSP, hasOS });
  }

  return plans;
}

function displaySummary(
  results: InitPlatformResult[],
  scope: InstallScope,
  lang: SkillLanguage,
): void {
  const scopeLabel = scope === 'global' ? os.homedir() : 'project';

  console.log(
    `\n  ${green(bold('✓'))}  ${bold(t(lang, 'setupComplete'))} ${dim(`${t(lang, 'summaryScope')} ${scopeLabel}`)}\n`,
  );

  const installed = results.filter(
    (r) => r.polaris === 'installed' || r.superpowers === 'installed' || r.openspec === 'installed',
  );
  const skipped = results.filter(
    (r) => r.polaris === 'skipped' && r.superpowers === 'skipped' && r.openspec === 'skipped',
  );
  const failed = results.filter(
    (r) => r.polaris === 'failed' || r.superpowers === 'failed' || r.openspec === 'failed',
  );

  if (installed.length > 0) {
    console.log(`  ${green(t(lang, 'installed'))}`);
    for (const r of installed) {
      const platform = PLATFORMS.find((p) => p.id === r.platformId);
      if (!platform) continue;
      console.log(
        `    ${green('✓')}  ${bold(r.platformName)} ${dim(`${getPlatformSkillsDir(platform, scope)}/skills/`)}`,
      );
    }
  }
  if (skipped.length > 0) {
    console.log(
      `  ${yellow(t(lang, 'skippedLabel'))}  ${skipped.map((r) => r.platformName).join(', ')}`,
    );
  }
  if (failed.length > 0) {
    console.log(
      `  ${red(t(lang, 'failedLabel'))}   ${failed.map((r) => r.platformName).join(', ')}`,
    );
  }

  console.log(`\n  ${bold(t(lang, 'getStarted'))}`);
  console.log(`    ${cyan(t(lang, 'getStartedPolaris'))}`);
  console.log(`    ${cyan(t(lang, 'getStartedHotfix'))}`);
  console.log(`    ${cyan(t(lang, 'getStartedTweak'))}\n`);
}

export async function runInit(rawPath: string, options: InitOptions = {}): Promise<InitResult> {
  const projectPath = path.resolve(rawPath || process.cwd());
  const log = createLogger(Boolean(options.json));
  const langHint = options.lang;

  if (!options.json) {
    log(`\n${POLARIS_BANNER}`);
    log(`  ${dim(t(langHint, 'settingUp'))} ${bold(projectPath)}\n`);
    log(
      drawBox(
        [
          `${cyan('◆')}  OpenSpec + Superpowers + Polaris skills`,
          `${cyan('◆')}  /polaris workflow commands`,
        ],
        42,
      ),
    );
    log('');
  }

  const detected = await detectPlatforms(projectPath);
  const scope = await selectScope(options, langHint);
  const language = await selectLanguage(options, langHint);
  const lang = language;
  const platforms = await selectPlatforms(detected, options, lang);

  if (platforms.length === 0) {
    if (options.json) {
      console.log(
        JSON.stringify({ projectPath, scope, language, platforms: [], results: [] }, null, 2),
      );
      return { projectPath, scope, language, platforms: [], results: [] };
    }
    log(`\n  ${t(lang, 'noPlatforms')}\n`);
    return { projectPath, scope, language, platforms: [], results: [] };
  }

  const baseDir = getBaseDir(scope, projectPath);
  const languageSkillsDir = getLanguageSkillsDir(language);
  const plans = await buildInstallPlans(baseDir, platforms, scope, options, lang);
  const lockSources: LockSourceEntry[] = [];
  const platformResults: InitPlatformResult[] = [];

  // --- 1. OpenSpec ---
  const osToolIds = [
    ...new Set(
      plans
        .filter((p) => p.osAction !== 'skip' && p.platform.openspecToolId)
        .map((p) => p.platform.openspecToolId),
    ),
  ];
  let osGlobalStatus: InstallStatus = 'skipped';

  if (osToolIds.length > 0) {
    log(
      `\n  ${blue('⏳')} ${bold('OpenSpec')} ${dim(`${t(lang, 'installingOS')} ${osToolIds.join(', ')}`)}`,
    );
    osGlobalStatus = await installOpenSpec(projectPath, osToolIds, scope, true);
    log(`  ${statusSymbol(osGlobalStatus)}  OpenSpec ${statusLabel(osGlobalStatus, lang)}`);
    const installedVersion =
      osGlobalStatus === 'installed' ? getNpmPackageVersion(OPENSPEC_PACKAGE) : '0.0.0';
    lockSources.push({
      id: 'openspec',
      version: osGlobalStatus === 'installed' ? installedVersion : 'skipped',
    });
  } else {
    log(`\n  ${dim('○')}  OpenSpec ${dim(t(lang, 'skip'))}`);
  }

  // --- 2. Superpowers ---
  const spPlatformIds = plans.filter((p) => p.spAction !== 'skip').map((p) => p.platform.id);
  let spGlobalStatus: InstallStatus = 'skipped';

  if (spPlatformIds.length > 0) {
    log(`\n  ${blue('⏳')} ${bold('Superpowers')} ${dim(`>= ${SUPERPOWERS_MIN_VERSION}`)}...`);
    const spResult = await installSuperpowersForPlatforms(projectPath, scope, spPlatformIds, true);
    spGlobalStatus = spResult.status;
    log(`  ${statusSymbol(spGlobalStatus)}  Superpowers ${statusLabel(spGlobalStatus, lang)}`);
    if (spGlobalStatus === 'installed') {
      lockSources.push({ id: 'superpowers', version: spResult.version });
    }
  } else {
    log(`\n  ${dim('○')}  Superpowers ${dim(t(lang, 'skip'))}`);
  }

  // --- 3. Polaris bundled skills ---
  const polarisNeeded = plans.some((p) => p.polarisAction !== 'skip');
  let polarisGlobalStatus: InstallStatus = 'skipped';

  if (polarisNeeded) {
    log(`\n  ${blue('⏳')} ${bold('Polaris')} ${dim('(bundled)')}...`);
    try {
      for (const plan of plans) {
        if (plan.polarisAction === 'skip') continue;

        const overwrite =
          plan.polarisAction === 'overwrite' ||
          (plan.polarisAction === 'install' && !plan.hasPolaris);

        const skills = await copyPolarisSkillsForPlatform(
          baseDir,
          plan.platform,
          overwrite,
          languageSkillsDir,
          scope,
        );
        const rules = await copyPolarisRulesForPlatform(
          baseDir,
          plan.platform,
          overwrite,
          scope,
          languageSkillsDir,
        );

        platformResults.push({
          platformId: plan.platform.id,
          platformName: plan.platform.name,
          openspec:
            plan.osAction !== 'skip' && plan.platform.openspecToolId ? osGlobalStatus : 'skipped',
          superpowers: plan.spAction !== 'skip' ? spGlobalStatus : 'skipped',
          polaris: 'installed',
          skills,
          rules,
          hooks: { installed: false },
        });

        log(
          `  ${green('✓')}  Polaris ${dim('→')} ${plan.platform.name} ${dim(`(${skills.copied} ${t(lang, 'skillsCopiedSkipped')} ${skills.skipped} ${t(lang, 'hooksSkipped')})`)}`,
        );
      }
      polarisGlobalStatus = 'installed';

      const assetsDir = getAssetsDir();
      const manifest = await readAssetManifest(assetsDir);
      lockSources.push({ id: 'polaris', version: manifest.version });
    } catch (err) {
      log(`  ${red('✗')}  Polaris: ${red((err as Error).message)}`);
      polarisGlobalStatus = 'failed';
    }
  } else {
    log(`\n  ${dim('○')}  Polaris ${dim(t(lang, 'skip'))}`);
  }

  // --- 4. Hooks（Polaris 安装成功时注册）---
  if (polarisGlobalStatus === 'installed') {
    log(`\n  ${blue('⏳')} ${bold('Hooks')}...`);
    for (const plan of plans) {
      if (plan.polarisAction === 'skip') continue;

      const result = platformResults.find((r) => r.platformId === plan.platform.id);
      const hooks = await installPolarisHooksForPlatform(baseDir, plan.platform, scope);
      if (result) {
        result.hooks = hooks;
      }

      if (hooks.installed) {
        const hooksLocation = getSettingsFilePath(plan.platform, scope);
        log(
          `  ${green('✓')}  Hooks ${dim('→')} ${plan.platform.name} ${dim(`(${hooksLocation})`)}`,
        );
      } else if (hooks.reason?.includes('already')) {
        log(`  ${dim('○')}  Hooks: ${plan.platform.name} ${dim('already registered')}`);
      } else if (hooks.reason === 'platform does not support hooks') {
        log(`  ${dim('○')}  Hooks: ${plan.platform.name} ${dim('not supported')}`);
      } else if (hooks.reason === 'no hooks defined in manifest') {
        log(`  ${dim('○')}  Hooks: ${plan.platform.name} ${dim('none in manifest')}`);
      }
    }
  }

  // 补齐仅跳过 Polaris 但仍需记录状态的平台
  for (const plan of plans) {
    if (platformResults.some((r) => r.platformId === plan.platform.id)) continue;
    platformResults.push({
      platformId: plan.platform.id,
      platformName: plan.platform.name,
      openspec:
        plan.osAction !== 'skip' && plan.platform.openspecToolId ? osGlobalStatus : 'skipped',
      superpowers: plan.spAction !== 'skip' ? spGlobalStatus : 'skipped',
      polaris: plan.polarisAction === 'skip' ? 'skipped' : polarisGlobalStatus,
      skills: { copied: 0, skipped: 0 },
      rules: { copied: 0, skipped: 0 },
      hooks: { installed: false },
    });
  }

  if (scope === 'project') {
    await createWorkingDirs(projectPath);
  }

  if (lockSources.length > 0) {
    await writeLockFile(
      projectPath,
      language,
      scope,
      platforms.map((p) => p.id),
      lockSources,
    );
  }

  const result: InitResult = {
    projectPath,
    scope,
    language,
    platforms: platforms.map((p) => p.id),
    results: platformResults,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    displaySummary(platformResults, scope, lang);
    log(t(lang, 'workingDirs'));
  }

  return result;
}

export async function initCommand(projectPath: string, options: InitOptions): Promise<void> {
  await runInit(projectPath, options);
}
