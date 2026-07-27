/**
 * init 安装流程的交互提示层（commands 层）。
 *
 * 定位：
 * - 只负责「问用户」与「根据 CLI 标志解析动作」，不写盘、不探测、不安装。
 * - 依赖 `@inquirer/prompts` 做 select/checkbox；文案走 `./i18n`。
 * - 当前由 `init.ts` 消费；`--yes` / `--overwrite` / `--skip-existing` 等非交互路径
 *   经 `resolveAction` 在本文件统一落到 install | overwrite | skip。
 *
 * 覆盖的交互：
 * - 安装范围（project / global）
 * - Skill 语言（en / zh）
 * - 目标平台多选（标注已探测项）
 * - 已有组件时的覆盖策略（整批或逐项）
 */
import { checkbox, select } from '@inquirer/prompts';

import { t } from './i18n/index.js';
import type { InstallScope, Language } from '../core/config/polaris-project-config.js';
import { PLATFORMS, type Platform } from '../core/platforms.js';

export type ComponentAction = 'install' | 'overwrite' | 'skip';
export type BulkOverwriteChoice = 'overwrite-all' | 'skip-all' | 'choose';

export type InitPromptOptions = {
  yes?: boolean;
  overwrite?: boolean;
  skipExisting?: boolean;
};

/** 根据已有安装与 CLI 选项决定组件动作（与 easyflow resolveAction 一致） */
export function resolveAction(hasExisting: boolean, options: InitPromptOptions): ComponentAction {
  if (!hasExisting) return 'install';
  if (options.overwrite) return 'overwrite';
  if (options.skipExisting) return 'skip';
  if (options.yes) return 'skip';
  return 'install';
}

export async function promptInstallScope(lang?: string): Promise<InstallScope> {
  return select({
    message: t(lang, 'installScope'),
    choices: [
      { name: t(lang, 'scopeProject'), value: 'project' as const },
      { name: t(lang, 'scopeGlobal'), value: 'global' as const },
    ],
  });
}

export async function promptSkillLanguage(lang?: string): Promise<Language> {
  return select({
    message: t(lang, 'languagePrompt'),
    choices: [
      { name: 'English', value: 'en' as const },
      { name: '中文', value: 'zh' as const },
    ],
  });
}

export async function promptPlatforms(detected: Set<string>, lang?: string): Promise<Platform[]> {
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

export async function promptBulkOverwriteChoice(
  platformName: string,
  components: string[],
  lang?: string,
): Promise<BulkOverwriteChoice> {
  return select({
    message: `${platformName} ${t(lang, 'bulkOverwrite')} ${components.join(', ')}. ${t(lang, 'overwriteChoice')}`,
    choices: [
      { name: t(lang, 'overwriteAll'), value: 'overwrite-all' as const },
      { name: t(lang, 'skipAll'), value: 'skip-all' as const },
      { name: t(lang, 'choosePer'), value: 'choose' as const },
    ],
  });
}

export async function promptOverwriteChoice(
  componentName: string,
  platformName: string,
  lang?: string,
): Promise<'overwrite' | 'skip'> {
  return select({
    message: `${componentName} ${t(lang, 'alreadyExists')} on ${platformName}. ${t(lang, 'overwriteChoice')}`,
    choices: [
      { name: t(lang, 'overwrite'), value: 'overwrite' as const },
      { name: t(lang, 'skip'), value: 'skip' as const },
    ],
  });
}
