import { checkbox, confirm, select } from '@inquirer/prompts';

import { t } from './i18n/index.js';
import type { InstallScope, SkillLanguage } from '../core/types.js';
import { PLATFORMS, type Platform } from '../core/platforms.js';

export type OverwriteMode = boolean | 'ask' | 'bulk';

export async function promptInstallScope(lang?: string): Promise<InstallScope> {
  return select({
    message: t(lang, 'installScope'),
    choices: [
      { name: t(lang, 'scopeProject'), value: 'project' as const },
      { name: t(lang, 'scopeGlobal'), value: 'global' as const },
    ],
  });
}

export async function promptSkillLanguage(lang?: string): Promise<SkillLanguage> {
  return select({
    message: t(lang, 'languagePrompt'),
    choices: [
      { name: 'English', value: 'en' as const },
      { name: '中文', value: 'zh' as const },
    ],
  });
}

export async function promptPlatforms(
  detected: Set<string>,
  lang?: string,
): Promise<Platform[]> {
  const choices = PLATFORMS.map((platform) => ({
    name: `${platform.name}${detected.has(platform.id) ? ` (${t(lang, 'detected')})` : ''}`,
    value: platform,
    checked: detected.has(platform.id),
  }));

  const selected = await checkbox({
    message: t(lang, 'selectPlatforms'),
    choices,
    required: true,
  });

  return selected;
}

export async function promptBulkOverwrite(lang?: string): Promise<OverwriteMode> {
  const choice = await select({
    message: t(lang, 'bulkOverwrite'),
    choices: [
      { name: t(lang, 'overwriteAll'), value: 'overwrite-all' },
      { name: t(lang, 'skipAll'), value: 'skip-all' },
      { name: t(lang, 'choosePer'), value: 'choose-per' },
    ],
  });

  if (choice === 'overwrite-all') return true;
  if (choice === 'skip-all') return false;
  return 'bulk';
}

export async function promptOverwriteExisting(lang?: string): Promise<boolean> {
  return confirm({
    message: `${t(lang, 'overwriteChoice')} ${t(lang, 'overwrite')}?`,
    default: false,
  });
}

export async function promptInstallOpenSpec(lang?: string): Promise<boolean> {
  return confirm({
    message: t(lang, 'npmDepOpenSpec'),
    default: true,
  });
}

export async function promptInstallSuperpowers(lang?: string): Promise<boolean> {
  return confirm({
    message: t(lang, 'npmDepSuperpowers'),
    default: true,
  });
}
