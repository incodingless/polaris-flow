import path from 'path';
import { readFile, writeFile } from 'fs/promises';

import { t } from './i18n/index.js';
import { detectPlatforms, getBaseDir, hasSkills } from '../core/detect.js';
import { getLanguageSkillsDir, readAssetManifest } from '../core/manifest.js';
import {
  copyPolarisRulesForPlatform,
  copyPolarisSkillsForPlatform,
  getAssetsDir,
  installPolarisHooksForPlatform,
} from '../core/skills.js';
import { PLATFORMS } from '../core/platforms.js';
import { printVersionInfo, PACKAGE_NAME } from '../core/version.js';
import { fileExists } from '../utils/file-system.js';
import type { InstallScope, SkillLanguage } from '../core/types.js';

export type UpdateOptions = {
  force?: boolean;
  lang?: SkillLanguage;
  scope?: InstallScope;
  json?: boolean;
};

export type UpdateResult = {
  projectPath: string;
  platforms: string[];
  skillsUpdated: number;
  manifestVersion: string;
};

async function getInstalledVersion(projectPath: string): Promise<string | null> {
  const versionPath = path.join(projectPath, '.polaris', 'installed-version');
  if (!(await fileExists(versionPath))) {
    return null;
  }
  return (await readFile(versionPath, 'utf-8')).trim();
}

async function writeInstalledVersion(projectPath: string, version: string): Promise<void> {
  const versionPath = path.join(projectPath, '.polaris', 'installed-version');
  await writeFile(versionPath, `${version}\n`, 'utf-8');
}

async function findInstalledPlatforms(
  projectPath: string,
  scope: InstallScope,
): Promise<(typeof PLATFORMS)[number][]> {
  const baseDir = getBaseDir(scope, projectPath);
  const detected = await detectPlatforms(projectPath);
  const installed = [];

  for (const platform of PLATFORMS) {
    if (!detected.has(platform.id)) {
      continue;
    }
    if (await hasSkills(baseDir, platform, 'polaris', [], scope)) {
      installed.push(platform);
    }
  }

  return installed;
}

export async function runUpdate(
  rawPath: string,
  options: UpdateOptions = {},
): Promise<UpdateResult> {
  const projectPath = path.resolve(rawPath || process.cwd());
  const scope = options.scope ?? 'project';
  const language = options.lang ?? 'en';
  const lang = language;
  const log = options.json ? () => {} : (msg: string) => console.log(msg);

  if (!options.json) {
    log(t(lang, 'updateTitle'));
    await printVersionInfo(log);
  }

  const platforms = await findInstalledPlatforms(projectPath, scope);
  if (platforms.length === 0) {
    const message = t(lang, 'noInstallsFound');
    if (options.json) {
      console.log(JSON.stringify({ error: message, platforms: [] }));
    } else {
      console.error(message);
    }
    process.exitCode = 1;
    return { projectPath, platforms: [], skillsUpdated: 0, manifestVersion: '' };
  }

  const assetsDir = getAssetsDir();
  const manifest = await readAssetManifest(assetsDir);
  const installedVersion = await getInstalledVersion(projectPath);
  const shouldCopy = options.force || installedVersion !== manifest.version;

  if (!shouldCopy) {
    log(t(lang, 'updateComplete'));
    const result = {
      projectPath,
      platforms: platforms.map((p) => p.id),
      skillsUpdated: 0,
      manifestVersion: manifest.version,
    };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    }
    return result;
  }

  log(`${t(lang, 'updatingSkillsOnTargets')} ${platforms.map((p) => p.name).join(', ')}`);

  const baseDir = getBaseDir(scope, projectPath);
  const languageSkillsDir = getLanguageSkillsDir(language);
  let skillsUpdated = 0;

  for (const platform of platforms) {
    log(`${t(lang, 'copyingSkillsFiles')} ${platform.name}...`);
    const skills = await copyPolarisSkillsForPlatform(
      baseDir,
      platform,
      Boolean(options.force),
      languageSkillsDir,
      scope,
    );
    const rules = await copyPolarisRulesForPlatform(
      baseDir,
      platform,
      Boolean(options.force),
      scope,
      languageSkillsDir,
    );
    await installPolarisHooksForPlatform(baseDir, platform, scope);
    skillsUpdated += skills.copied + rules.copied;

    if (!options.json) {
      log(`  ${platform.name}: ${skills.copied} skills, ${rules.copied} rules`);
    }
  }

  await writeInstalledVersion(projectPath, manifest.version);

  const result: UpdateResult = {
    projectPath,
    platforms: platforms.map((p) => p.id),
    skillsUpdated,
    manifestVersion: manifest.version,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    log('');
    log(t(lang, 'updateComplete'));
    log(`${t(lang, 'summary')} ${PACKAGE_NAME} ${manifest.version}`);
  }

  return result;
}

export async function updateCommand(projectPath: string, options: UpdateOptions): Promise<void> {
  await runUpdate(projectPath, options);
}
