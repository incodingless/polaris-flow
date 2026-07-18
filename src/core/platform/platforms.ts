/**
 * 支持的 AI 编码平台定义（skillsDir、rules、hooks、skillsLayout）。
 * 对齐 OpenSpec AI_TOOLS 配置思路；不写盘，仅提供元数据与路径辅助函数。
 */
import type { InstallScope } from '../types.js';

/** 技能目录布局：nested 嵌套进 polaris-flow；flat 子 skill 扁平为 polaris-flow-*（如 Trae） */
export type SkillsLayout = 'nested' | 'flat';

/** 平台元数据：探测路径、skills/rules/hooks 能力与布局 */
export interface Platform {
  id: string;
  name: string;
  skillsDir: string;
  globalSkillsDir?: string;
  detectionPaths?: string[];
  openspecToolId: string;
  /** 技能安装布局，默认 nested */
  skillsLayout?: SkillsLayout;
  /** 规则子目录，相对 rulesBaseDir；不支持则省略 */
  rulesDir?: string;
  /** 规则根目录覆盖（默认基于 skillsDir） */
  rulesBaseDir?: string;
  /** 规则文件格式 */
  rulesFormat?: 'md' | 'mdc';
  /** 是否支持 PreToolUse hooks */
  supportsHooks?: boolean;
  /** Hook 配置写入格式 */
  hookFormat?: 'claude-code';
}

/** 返回平台技能布局，缺省为 nested */
export function getSkillsLayout(platform: Platform): SkillsLayout {
  return platform.skillsLayout ?? 'nested';
}

/** 按 scope 返回平台 skills 配置根目录名（如 .claude） */
export function getPlatformSkillsDir(platform: Platform, scope: InstallScope): string {
  if (scope === 'global' && platform.globalSkillsDir) {
    return platform.globalSkillsDir;
  }
  return platform.skillsDir;
}

/** 返回平台 settings 相对路径（project→settings.local.json，global→settings.json） */
export function getSettingsFilePath(platform: Platform, scope: InstallScope): string {
  // Project scope → settings.local.json (not committed)
  // Global scope → settings.json
  const fileName = scope === 'project' ? 'settings.local.json' : 'settings.json';
  return `${platform.skillsDir}/${fileName}`;
}

/** 已注册平台列表（claude / cursor / trae 等） */
export const PLATFORMS: Platform[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    skillsDir: '.claude',
    globalSkillsDir: '.claude',
    openspecToolId: 'claude',
    skillsLayout: 'nested',
    rulesDir: 'rules',
    rulesFormat: 'md',
    supportsHooks: true,
    hookFormat: 'claude-code',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    skillsDir: '.cursor',
    globalSkillsDir: '.cursor',
    openspecToolId: 'cursor',
    skillsLayout: 'nested',
    rulesDir: 'rules',
    rulesFormat: 'mdc',
  },
  {
    id: 'trae',
    name: 'Trae',
    skillsDir: '.trae',
    globalSkillsDir: '.trae',
    openspecToolId: 'trae',
    skillsLayout: 'flat',
    rulesDir: 'rules',
    rulesFormat: 'md',
  },
];
