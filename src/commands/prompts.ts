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
 * 覆盖策略（已存在组件时）：
 * 1. 仅 `--overwrite`：四者均 overwrite
 * 2. 仅 `--skip-existing`：四者均 skip（按组件分别判断）
 * 3. 两者都传：OpenSpec / Superpowers / Codegraph → skip；Polaris → overwrite
 */
import { checkbox, select } from '@inquirer/prompts';

import { t } from './i18n/index.js';
import type { InstallScope, Languages } from '../core/config/polaris-project-config.js';
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
  lang?: Languages;
  platforms?: string[];
  json?: boolean | string;
};

export type ComponentPlan = {
  polarisAction: ComponentAction;
  spAction: ComponentAction;
  osAction: ComponentAction;
  codegraphAction: ComponentAction;
};

/** 单平台安装交互计划（动作已解析，含是否已存在） */
export type PlatformPlan = ComponentPlan & {
  platform: Platform;
  hasPolaris: boolean;
  hasSP: boolean;
  hasOS: boolean;
  hasCodegraph: boolean;
};

/** init 可安装的外部/内置组件，用于区分双 flag 时的覆盖策略 */
export type InstallComponent = 'polaris' | 'openspec' | 'superpowers' | 'codegraph';

/**
 * 根据已有安装与 CLI 选项决定组件动作。
 * @param hasExisting 该组件是否已安装
 * @param options CLI 选项
 * @param component 组件类型（双 flag 时 Polaris 与其它三者策略不同）
 */
export function resolveAction(
  hasExisting: boolean,
  options: InitPromptOptions,
  component: InstallComponent,
): ComponentAction {
  if (!hasExisting) return 'install';

  // 情况 3：--overwrite + --skip-existing → Polaris 重装，其余三者跳过
  if (options.overwrite && options.skipExisting) {
    return component === 'polaris' ? 'overwrite' : 'skip';
  }
  // 情况 1：仅 --overwrite → 已存在则覆盖
  if (options.overwrite) return 'overwrite';
  // 情况 2：仅 --skip-existing（或 --yes）→ 已存在则跳过
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

export async function promptSkillLanguage(lang?: string): Promise<Languages> {
  return select({
    message: t(lang, 'languagePrompt'),
    choices: [
      { name: '中文', value: 'zh' as const },
      { name: 'English', value: 'en' as const },
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
): Promise<Languages> {
  if (options.lang === 'zh' || options.lang === 'en') {
    return options.lang;
  }
  if (options.yes) return 'en';
  return promptSkillLanguage(langHint);
}

/**
 * 解析目标平台列表。
 * 1. 如果 options.platforms 有值，则直接返回
 * 2. 如果 options.yes 为 true，则优先已探测平台，否则默认 cursor + claude；
 * 3. 否则 checkbox 交互。
 */
export async function selectPlatforms(
  detectedPlatforms: Set<string>,
  options: InitPromptOptions,
  lang?: string,
): Promise<Platform[]> {
  if (options.platforms) {
    const fromOptions = PLATFORMS.filter((p) => options.platforms!.includes(p.id));
    if (fromOptions.length > 0) return fromOptions;
  }

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
  lang: Languages,
): Promise<PlatformPlan[]> {
  const plans: PlatformPlan[] = [];

  for (const platform of platforms) {
    const skillsBaseDir = getPlatformSkillsDir(platform, scope, baseDir);
    const hasPolaris = await hasSkills(skillsBaseDir, 'polaris');
    const hasSP = await hasSkills(skillsBaseDir, 'superpowers');
    const hasOS = await hasSkills(skillsBaseDir, 'openspec');
    const hasCodegraph = await hasSkills(skillsBaseDir, 'codegraph');

    let polarisAction = resolveAction(hasPolaris, options, 'polaris');
    let spAction = resolveAction(hasSP, options, 'superpowers');
    let osAction = resolveAction(hasOS, options, 'openspec');
    let codegraphAction = resolveAction(hasCodegraph, options, 'codegraph');

    if (!options.yes) {
      const existingComponents = [
        hasPolaris && polarisAction === 'install' ? 'Polaris' : null,
        hasSP && spAction === 'install' ? 'Superpowers' : null,
        hasOS && osAction === 'install' ? 'OpenSpec' : null,
        hasCodegraph && codegraphAction === 'install' ? 'Codegraph' : null,
      ].filter((c): c is string => Boolean(c));

      if (existingComponents.length > 1) {
        const bulkChoice = await promptBulkOverwriteChoice(platform.name, existingComponents, lang);
        if (bulkChoice !== 'choose') {
          const action: ComponentAction = bulkChoice === 'overwrite-all' ? 'overwrite' : 'skip';
          if (polarisAction === 'install') polarisAction = action;
          if (spAction === 'install') spAction = action;
          if (osAction === 'install') osAction = action;
          if (codegraphAction === 'install') codegraphAction = action;
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
      if (codegraphAction === 'install' && hasCodegraph) {
        codegraphAction = await promptOverwriteChoice('Codegraph', platform.name, lang);
      }
    }

    plans.push({
      platform,
      polarisAction,
      spAction,
      osAction,
      codegraphAction,
      hasPolaris,
      hasSP,
      hasOS,
      hasCodegraph,
    });
  }

  return plans;
}
