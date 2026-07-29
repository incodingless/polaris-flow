/**
 * 支持的 AI 编码平台定义（skillsDir、rules、hooks、skillsLayout）与平台/插件路径助手。
 * 对齐 OpenSpec AI_TOOLS 配置思路；不写盘，仅提供元数据与路径辅助函数。
 */
import path from 'path';
import os from 'os';
import type { InstallScope } from './assets/polaris-paths.js';

/** polaris-flow 插件根下的公共子目录名 */
export const PLUGIN_SUBDIR_NAMES = [
  'hooks',
  'templates',
  'adapters',
  'policies',
  'scorers',
] as const;

/** 平台配置根下始终创建的目录名 */
export const PLATFORM_ROOT_DIR_NAMES = ['skills', 'commands', 'agents'] as const;

/** 技能目录布局：nested 嵌套进 polaris-flow；flat 子 skill 扁平为 polaris-flow-*（如 Trae） */
export type SkillsLayout = 'nested' | 'flat';

/** 平台元数据：探测路径、skills/rules/hooks 能力与布局 */
export interface Platform {
  id: string;
  name: string;
  contextDir: string;
  globalContextDir: string;
  skillsDir: string;
  commandsDir: string;
  agentsDir: string;
  /** 规则子目录，相对 rulesBaseDir；不支持则省略 */
  rulesDir: string;
  /** 规则文件格式 */
  rulesFormat?: 'md' | 'mdc';

  /** 技能安装布局，默认 nested */
  skillsLayout: SkillsLayout;
  /** 是否支持 PreToolUse hooks */
  supportsHooks?: boolean;
  hooksConfigFile: string;
  /** Hook 配置写入格式 */
  hookFormat?: 'claude-code';
  detectionPaths?: string[];
  openspecToolId: string;
}

/** 返回平台技能布局，缺省为 nested */
export function getSkillsLayout(platform: Platform): SkillsLayout {
  return platform.skillsLayout ?? 'nested';
}

/** 返回平台 settings 相对路径（project→settings.local.json，global→settings.json） */
export function getSettingsFilePath(platform: Platform, scope: InstallScope): string {
  // Project scope → settings.local.json (not committed)
  // Global scope → settings.json
  const fileName = scope === 'project' ? 'settings.local.json' : 'settings.json';
  return `${platform.skillsDir}/${fileName}`;
}

/**
 * 返回平台上下文目录（project→项目/.platform，global→~/.platform）
 * @param platform 平台
 * @param scope 安装作用域
 * @param projectRoot 项目根目录
 * @returns 平台上下文目录（project→项目/.platform，global→~/.platform）
 */
export function getPlatformContextDir(
  platform: Platform,
  scope: InstallScope = 'project',
  projectRoot: string,
): string {
  return scope === 'global'
    ? path.join(os.homedir(), platform.globalContextDir)
    : path.join(projectRoot, platform.contextDir);
}

/**
 * 返回平台技能目录（project→项目/skills，global→~/.platform/.skills）
 * @param platform 平台
 * @param scope 安装作用域
 * @param projectRoot 项目根目录
 * @returns 平台技能目录（project→项目/skills，global→~/.platform/.skills）
 */
export function getPlatformSkillsDir(
  platform: Platform,
  scope: InstallScope = 'project',
  projectRoot: string,
): string {
  return path.join(getPlatformContextDir(platform, scope, projectRoot), platform.skillsDir);
}

//---------------------------------
//     字符串版平台 / 插件路径
//---------------------------------

/** 规范化平台目录名（保证带前导点） */
function normalizePlatformDir(platform: string): string {
  const trimmed = platform.trim();
  if (!trimmed) {
    throw new Error('platform 不能为空');
  }
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

/**
 * 返回插件根相对路径：`.<platform>/skills/polaris-flow`（写入 config.plugin_root）。
 */
export function getPluginRootRelPath(platform: string): string {
  return path.posix.join(normalizePlatformDir(platform), 'skills', 'polaris-flow');
}

/**
 * 返回插件根绝对路径：`<baseDir>/.<platform>/skills/polaris-flow`。
 * `platform` 可为 `.trae` 或 `claude` 等。
 */
export function getPluginRoot(baseDir: string, platform: string): string {
  return path.join(baseDir, getPluginRootRelPath(platform));
}

/** 返回插件根下子目录（hooks / templates / adapters / policies / scorers） */
export function getPluginSubdir(pluginRoot: string, name: string): string {
  return path.join(pluginRoot, name);
}

/** 返回平台配置根绝对路径：`<baseDir>/.<platform>` */
export function getPlatformRoot(baseDir: string, platform: string): string {
  return path.join(baseDir, normalizePlatformDir(platform));
}

/** 返回平台 `skills` 目录 */
export function getPlatformSkillsPath(baseDir: string, platform: string): string {
  return path.join(getPlatformRoot(baseDir, platform), 'skills');
}

/** 返回平台 `commands` 目录 */
export function getPlatformCommandsPath(baseDir: string, platform: string): string {
  return path.join(getPlatformRoot(baseDir, platform), 'commands');
}

/** 返回平台 `agents` 目录 */
export function getPlatformAgentsPath(baseDir: string, platform: string): string {
  return path.join(getPlatformRoot(baseDir, platform), 'agents');
}

/** 返回平台 rules 目录（默认 `rules`） */
export function getPlatformRulesPath(
  baseDir: string,
  platform: string,
  rulesDir: string = 'rules',
): string {
  return path.join(getPlatformRoot(baseDir, platform), rulesDir);
}

export type HarnessType = 'rules' | 'skills' | 'commands' | 'agents' | 'hooks';

export enum HarnessTypes {
  Rules = 'rules',
  Skills = 'skills',
  Commands = 'commands',
  Agents = 'agents',
  Hooks = 'hooks',
}

/** 已注册平台列表（claude / cursor / trae 等） */
export const PLATFORMS: Platform[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    contextDir: '.claude',
    globalContextDir: '.claude',
    skillsDir: 'skills',
    commandsDir: 'commands',
    agentsDir: 'agents',
    rulesDir: 'rules',
    rulesFormat: 'md',
    skillsLayout: 'nested',
    supportsHooks: true,
    /** project/global 实际文件由 hooks.ts 按 scope 选择 settings.local.json / settings.json */
    hooksConfigFile: 'settings.local.json',
    hookFormat: 'claude-code',
    detectionPaths: ['/Users/jason/.claude/v1/history.json'],
    openspecToolId: 'claude',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    contextDir: '.cursor',
    globalContextDir: '.cursor',
    skillsDir: 'skills',
    commandsDir: 'commands',
    agentsDir: 'agents',
    rulesDir: 'rules',
    rulesFormat: 'mdc',
    skillsLayout: 'nested',
    supportsHooks: true,
    /** project/global 实际文件由 hooks.ts 按 scope 选择 settings.local.json / settings.json */
    hooksConfigFile: 'settings.local.json',
    hookFormat: 'claude-code',
    detectionPaths: ['/Users/jason/.cursor/v1/history.json'],
    openspecToolId: 'cursor',
  },
  {
    id: 'trae',
    name: 'Trae',
    contextDir: '.trae',
    globalContextDir: '.trae',
    skillsDir: 'skills',
    commandsDir: 'commands',
    agentsDir: 'agents',
    rulesDir: 'rules',
    rulesFormat: 'md',
    skillsLayout: 'flat',
    supportsHooks: true,
    hooksConfigFile: 'hooks.json',
    hookFormat: 'claude-code',
    detectionPaths: ['/Users/jason/.trae/v1/history.json'],
    openspecToolId: 'trae',
  },
];
