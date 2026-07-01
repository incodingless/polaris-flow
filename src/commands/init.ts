import path from 'path';

import { t } from './i18n/index.js';
import {
  promptBulkOverwrite,
  promptInstallOpenSpec,
  promptInstallScope,
  promptInstallSuperpowers,
  promptOverwriteExisting,
  promptPlatforms,
  promptSkillLanguage,
  type OverwriteMode,
} from './prompts.js';
import { detectPlatforms, getBaseDir, hasSkills } from '../core/detect.js';
import { installOpenSpec } from '../core/openspec.js';
import { installSuperpowersForPlatforms } from '../core/superpowers.js';
import { getLanguageSkillsDir, readAssetManifest } from '../core/manifest.js';
import {copyPolarisRulesForPlatform, installPolarisHooksForPlatform, copyPolarisSkillsForPlatform, createWorkingDirs, getAssetsDir} from '../core/skills.js';
import { PLATFORMS, type Platform } from '../core/platforms.js';
import { printVersionInfo } from '../core/version.js';
import type { InstallScope, SkillLanguage } from '../core/types.js';

export type InitOptions = {
  yes?: boolean;
  scope?: InstallScope;
  overwrite?: boolean;
  skipExisting?: boolean;
  lang?: SkillLanguage;
  json?: boolean;
};

export type InitPlatformResult = {
  platformId: string;
  skills: { copied: number; skipped: number };
  rules: { copied: number; skipped: number };
  hooks: { installed: boolean; reason?: string };
};

export type InitResult = {
  projectPath: string;
  scope: InstallScope;
  language: SkillLanguage;
  platforms: string[];
  openspec: string;
  superpowers: string;
  platformResults: InitPlatformResult[];
};

type Logger = (message: string) => void;

function createLogger(json: boolean): Logger {
  return json ? () => {} : (message: string) => console.log(message);
}

async function resolveOverwriteMode(
  options: InitOptions,
  lang: string | undefined,
): Promise<OverwriteMode> {
  if (options.overwrite) return true;
  if (options.skipExisting) return false;
  if (options.yes) return false;
  return promptBulkOverwrite(lang);
}

async function shouldOverwriteComponent(
  exists: boolean,
  overwriteMode: OverwriteMode,
  lang: string | undefined,
): Promise<boolean> {
  if (!exists) return true;
  if (overwriteMode === true) return true;
  if (overwriteMode === false) return false;
  return promptOverwriteExisting(lang);
}

async function resolveInitConfig(
  projectPath: string,
  options: InitOptions,
): Promise<{
  scope: InstallScope;
  language: SkillLanguage;
  platforms: Platform[];
  installOpenSpecCli: boolean;
  installSuperpowers: boolean;
  overwriteMode: OverwriteMode;
}> {
  const detected = await detectPlatforms(projectPath);
  const langHint = options.lang;

  const scope =
    options.scope ?? (options.yes ? 'project' : await promptInstallScope(langHint));
  const language =
    options.lang ?? (options.yes ? 'en' : await promptSkillLanguage(langHint));

  let platforms: Platform[];
  if (options.yes) {
    platforms = PLATFORMS.filter((p) => detected.has(p.id));
    if (platforms.length === 0) {
      platforms = PLATFORMS.filter((p) => p.id === 'cursor' || p.id === 'claude');
    }
  } else {
    platforms = await promptPlatforms(detected, langHint);
  }

  if (platforms.length === 0) {
    throw new Error(t(langHint, 'noPlatforms'));
  }

  const overwriteMode = await resolveOverwriteMode(options, langHint);

  let installOpenSpecCli = true;
  let installSuperpowersFlag = true;

  if (!options.yes) {
    installOpenSpecCli = await promptInstallOpenSpec(langHint);
    installSuperpowersFlag = await promptInstallSuperpowers(langHint);
  }

  return {
    scope,
    language,
    platforms,
    installOpenSpecCli,
    installSuperpowers: installSuperpowersFlag,
    overwriteMode,
  };
}

const POLARIS_BANNER = [
  ``,
  `  ${cyan('░█████████ ')}            ░██                     ░██            ${cyan('░██████████')}░██`,
  `  ${cyan('░██     ░██')}            ░██                                    ${cyan('░██        ')}░██`,
  `  ${cyan('░██     ░██')} ░███████   ░██  ░██████   ░██░████ ░██ ░███████   ${cyan('░██        ')}░██  ░███████  ░██    ░██    ░██`,
  `  ${cyan('░█████████ ')} ░██    ░██ ░██       ░██  ░███     ░██░██         ${cyan('░█████████ ')}░██ ░██    ░██ ░██    ░██    ░██`,
  `  ${cyan('░██        ')} ░██    ░██ ░██  ░███████  ░██      ░██ ░███████   ${cyan('░██        ')}░██ ░██    ░██  ░██  ░████  ░██ `,
  `  ${cyan('░██        ')} ░██    ░██ ░██ ░██   ░██  ░██      ░██       ░██  ${cyan('░██        ')}░██ ░██    ░██   ░██░██ ░██░██  `,
  `  ${cyan('░██        ')}  ░███████  ░██  ░█████░██ ░██      ░██ ░███████   ${cyan('░██        ')}░██  ░███████     ░███   ░███   `,
  ``,
].join('\n');

export async function runInit(rawPath: string, options: InitOptions = {}): Promise<InitResult> {
  const projectPath = path.resolve(rawPath || process.cwd());
  const log = createLogger(Boolean(options.json));

  if (!options.json) {
    await printVersionInfo(log);
    log(`${t(options.lang, 'settingUp')} ${projectPath}`);
  }

  const config = await resolveInitConfig(projectPath, options);
  const { scope, language, platforms, installOpenSpecCli, installSuperpowers, overwriteMode } =
    config;
  const baseDir = getBaseDir(scope, projectPath);
  const languageSkillsDir = getLanguageSkillsDir(language);
  const lang = language;

  const toolIds = [...new Set(platforms.map((p) => p.openspecToolId))];
  const platformIds = platforms.map((p) => p.id);

  log(`${t(lang, 'installingOS')} ${toolIds.join(', ')}`);
  const openspecStatus = await installOpenSpec(
    projectPath,
    toolIds,
    scope,
    installOpenSpecCli,
  );

  log(`${t(lang, 'installingSP')} ${platformIds.join(', ')}`);
  const superpowersStatus = await installSuperpowersForPlatforms(
    projectPath,
    scope,
    platformIds,
    installSuperpowers,
  );

  const platformResults: InitPlatformResult[] = [];

  for (const platform of platforms) {
    const hasPolaris = await hasSkills(baseDir, platform, 'polaris', platforms, scope);
    const overwriteSkills = await shouldOverwriteComponent(
      hasPolaris,
      overwriteMode,
      lang,
    );

    const skills = await copyPolarisSkillsForPlatform(
      baseDir,
      platform,
      overwriteSkills,
      languageSkillsDir,
      scope,
    );
    const rules = await copyPolarisRulesForPlatform(
      baseDir,
      platform,
      overwriteSkills,
      scope,
      languageSkillsDir,
    );
    const hooks = await installPolarisHooksForPlatform(baseDir, platform, scope);

    platformResults.push({
      platformId: platform.id,
      skills,
      rules,
      hooks,
    });

    if (!options.json) {
      log(
        `  ${platform.name}: ${skills.copied} ${t(lang, 'skillsCopiedSkipped')} ${skills.skipped} ${t(lang, 'hooksSkipped')}`,
      );
    }
  }

  if (scope === 'project') {
    await createWorkingDirs(projectPath);
    const assetsDir = getAssetsDir();
    const manifest = await readAssetManifest(assetsDir);
    const versionPath = path.join(projectPath, '.polaris', 'installed-version');
    const { writeFile } = await import('fs/promises');
    await writeFile(versionPath, `${manifest.version}\n`, 'utf-8');
  }

  const result: InitResult = {
    projectPath,
    scope,
    language,
    platforms: platformIds,
    openspec: openspecStatus,
    superpowers: superpowersStatus,
    platformResults,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    log('');
    log(t(lang, 'setupComplete'));
    log(`${t(lang, 'installed')} ${platformIds.join(', ')}`);
    log(t(lang, 'workingDirs'));
    log(t(lang, 'getStarted'));
    log(t(lang, 'getStartedPolaris'));
    log(t(lang, 'getStartedHotfix'));
    log(t(lang, 'getStartedTweak'));
  }

  return result;
}

export async function initCommand(projectPath: string, options: InitOptions): Promise<void> {
  await runInit(projectPath, options);
}
