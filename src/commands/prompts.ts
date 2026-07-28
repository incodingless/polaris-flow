/**
 * init 安装流程的交互提示层（commands 层）。
 *
 * 定位：
 * - 只负责「问用户」与「根据 CLI 标志解析动作」，不写盘、不安装。
 * - 依赖 `@inquirer/prompts` 做 select/checkbox；文案走 `./i18n`。
 * - 可调用 detect（如 hasSkills）以决定是否询问覆盖；当前由 `init.ts` 消费。
 * - `--yes` / `--overwrite` / `--skip-existing` 等非交互路径经本文件的
 *   `resolveAction` / `select*` / `buildInstallPlans` 统一落到 install | overwrite | skip。
 *
 * 覆盖的交互：
 * - 安装范围（project / global）及带 CLI 标志的 selectScope
 * - Skill 语言（en / zh）及 selectLanguage
 * - 目标平台多选（标注已探测项）及 selectPlatforms
 * - 已有组件时的覆盖策略（整批或逐项）及 buildInstallPlans
 */
import { checkbox, select } from '@inquirer/prompts';

import { t } from './i18n/index.js';
import type { InstallScope, Language } from '../core/config/polaris-project-config.js';
import { hasSkills } from '../core/integration/detect.js';
import { PLATFORMS, getPlatformSkillsDir, type Platform } from '../core/platforms.js';

export type ComponentAction = 'install' | 'overwrite' | 'skip';
export type BulkOverwriteChoice = 'overwrite-all' | 'skip-all' | 'choose';

/** init 交互/选项解析所需字段（含 CLI 标志与可选预填） */
export type InitPromptOptions = {
  yes?: boolean;
  overwrite?: boolean;
  skipExisting?: boolean;
  scope?: InstallScope;
  lang?: Language;
};

export type ComponentPlan = {
  polarisAction: ComponentAction;
  spAction: ComponentAction;
  osAction: ComponentAction;
};

/** 单平台安装交互计划（动作已解析，含是否已存在） */
export type PlatformPlan = ComponentPlan & {
  platform: Platform;
  hasPolaris: boolean;
  hasSP: boolean;
  hasOS: boolean;
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

/** 解析安装范围：CLI scope / --yes → project，否则交互询问 */
export async function selectScope(
  options: InitPromptOptions,
  lang?: string,
): Promise<InstallScope> {
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

/** 解析 Skill 语言：CLI lang / --yes → en，否则交互询问 */
export async function selectLanguage(
  options: InitPromptOptions,
  langHint?: string,
): Promise<Language> {
  if (options.lang === 'zh' || options.lang === 'en') {
    return options.lang;
  }
  if (options.yes) return 'en';
  return promptSkillLanguage(langHint);
}

/**
 * 解析目标平台列表。
 * --yes：优先已探测平台，否则默认 cursor + claude；否则 checkbox 交互。
 */
export async function selectPlatforms(
  detectedPlatforms: Set<string>,
  options: InitPromptOptions,
  lang?: string,
): Promise<Platform[]> {
  if (options.yes) {
    const fromDetected = PLATFORMS.filter((p) => detectedPlatforms.has(p.id));
    if (fromDetected.length > 0) return fromDetected;
    return PLATFORMS.filter((p) => p.id === 'cursor' || p.id === 'claude');
  }
  return promptPlatforms(detectedPlatforms, lang);
}

/**
 * 为各平台探测已装组件并解析覆盖策略，产出安装交互计划。
 * 不执行安装；由 init 编排消费 PlatformPlan[]。
 */
export async function buildInstallPlans(
  baseDir: string,
  platforms: Platform[],
  scope: InstallScope,
  options: InitPromptOptions,
  lang: Language,
): Promise<PlatformPlan[]> {
  const plans: PlatformPlan[] = [];

  for (const platform of platforms) {
    const skillsBaseDir = getPlatformSkillsDir(platform, scope, baseDir);
    const hasPolaris = await hasSkills(skillsBaseDir, 'polaris');
    const hasSP = await hasSkills(skillsBaseDir, 'superpowers');
    const hasOS = await hasSkills(skillsBaseDir, 'openspec');

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
