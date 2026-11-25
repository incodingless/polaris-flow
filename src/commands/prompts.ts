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
import type { ChannelComponentId } from '../core/install/channels.js';
import { hasSkills } from '../core/integrations/detect.js';
import { DEPENDENCIES } from '../core/deps/registry.js';
import { PLATFORMS, getPlatformSkillsDir, type Platform } from '../core/domain/platforms.js';

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
  /** 三通道安装配置覆盖（--github-mirror / --npm-registry / --local-path，见 core/install/channels.ts） */
  githubMirror?: string;
  npmRegistry?: string;
  localPaths?: Partial<Record<ChannelComponentId, string>>;
};

/**
 * 平台安装动作计划：按依赖 id 记录动作与是否已存在。
 *
 * 由 registry 派生，不再为每个组件写死字段（原先是 polarisAction / spAction /
 * osAction / codegraphAction 四个硬编码键，加一个组件就要改这里的类型与全部消费点）。
 */
export type PlatformPlan = {
  platform: Platform;
  /** depId → 动作 */
  actions: Record<string, ComponentAction>;
  /** depId → 该平台 skills 目录下是否已存在 */
  presence: Record<string, boolean>;
};

/**
 * 根据已有安装与 CLI 选项决定组件动作。
 * @param hasExisting 该组件是否已安装
 * @param options CLI 选项
 * @param depId 依赖 id（双 flag 时 Polaris 与其它组件策略不同）
 */
export function resolveAction(
  hasExisting: boolean,
  options: InitPromptOptions,
  depId: string,
): ComponentAction {
  if (!hasExisting) return 'install';

  // 情况 3：--overwrite + --skip-existing → Polaris 重装，其余跳过
  if (options.overwrite && options.skipExisting) {
    return depId === 'polaris' ? 'overwrite' : 'skip';
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

/**
 * 解析 Skill 语言：CLI lang → 已有 config 的语言 → 交互询问。
 *
 * 非交互（`--yes`）时缺省 **zh**：`assets/en/skills/` 目前是空目录（仅 .gitkeep），
 * 默认 en 会装出 0 个技能；`fallback` 用于复用已有 `.polaris/config.yaml` 的语言。
 */
export async function selectLanguage(
  options: InitPromptOptions,
  langHint?: string,
  fallback?: Languages,
): Promise<Languages> {
  if (options.lang === 'zh' || options.lang === 'en') {
    return options.lang;
  }
  if (options.yes) return fallback ?? 'zh';
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
 *
 * 交互只覆盖非 `optional` 依赖：少一个可选工具不该在 init 时拦人。
 * `--yes` / `--overwrite` 等非交互路径仍对全部依赖生效。
 */
export async function buildInstallPlans(
  baseDir: string,
  platforms: Platform[],
  scope: InstallScope,
  options: InitPromptOptions,
  lang: Languages,
): Promise<PlatformPlan[]> {
  const plans: PlatformPlan[] = [];
  const promptable = DEPENDENCIES.filter((dep) => dep.requiredness !== 'optional');

  for (const platform of platforms) {
    const skillsBaseDir = getPlatformSkillsDir(platform, scope, baseDir);

    const presence: Record<string, boolean> = {};
    for (const dep of DEPENDENCIES) {
      presence[dep.id] = await hasSkills(skillsBaseDir, dep.id);
    }

    const actions: Record<string, ComponentAction> = {};
    for (const dep of DEPENDENCIES) {
      actions[dep.id] = resolveAction(presence[dep.id], options, dep.id);
    }

    if (!options.yes) {
      const existingComponents = promptable
        .filter((dep) => presence[dep.id] && actions[dep.id] === 'install')
        .map((dep) => dep.label);

      if (existingComponents.length > 1) {
        const bulkChoice = await promptBulkOverwriteChoice(platform.name, existingComponents, lang);
        if (bulkChoice !== 'choose') {
          const action: ComponentAction = bulkChoice === 'overwrite-all' ? 'overwrite' : 'skip';
          for (const dep of promptable) {
            if (actions[dep.id] === 'install') actions[dep.id] = action;
          }
        }
      }

      for (const dep of promptable) {
        if (actions[dep.id] === 'install' && presence[dep.id]) {
          actions[dep.id] = await promptOverwriteChoice(dep.label, platform.name, lang);
        }
      }
    }

    plans.push({ platform, actions, presence });
  }

  return plans;
}
