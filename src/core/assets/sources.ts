/**
 * 上游技能来源 — GitHub 拉取、bundled 资产或 npm CLI。
 * assets 目录路径请用 config/polaris-paths.getAssetsDir，本文件不重复实现。
 */

/** 上游技能来源描述（bundled / github / npm） */
export interface SkillSource {
  id: string;
  name: string;
  type: 'github' | 'npm' | 'bundled';
  repo?: string;
  npmPackage?: string;
  minVersion: string;
  skillsPath?: string;
  extraPaths?: string[];
  commandsPath?: string;
  manifestPath?: string;
  targetDir?: string;
  commandsDirName?: string;
}

/** Polaris 命令目录名前缀 */
export const POLARIS_COMMAND_PREFIX = 'polaris';

/** Superpowers 仓库地址 */
export const SUPERPOWERS_REPO = 'https://github.com/obra/superpowers';
/** Superpowers 最低支持版本 */
export const SUPERPOWERS_MIN_VERSION = '4.0.0';

/** 已注册的技能来源表 */
export const SOURCES: SkillSource[] = [
  {
    id: 'polaris',
    name: 'polaris',
    type: 'bundled',
    minVersion: '0.1.0',
    skillsPath: 'zh/skills',
    commandsPath: 'zh/commands',
    manifestPath: 'manifest.json',
    targetDir: 'polaris',
    commandsDirName: POLARIS_COMMAND_PREFIX,
  },
  {
    id: 'superpowers',
    name: 'superpowers',
    type: 'github',
    repo: SUPERPOWERS_REPO,
    minVersion: SUPERPOWERS_MIN_VERSION,
    skillsPath: 'skills',
    targetDir: '',
  },
  {
    id: 'openspec',
    name: 'openspec',
    type: 'npm',
    npmPackage: '@fission-ai/openspec',
    minVersion: '1.4.0',
  },
];

/** 返回 polaris bundled 来源；未配置则抛错 */
export function getPolarisSource(): SkillSource {
  const source = SOURCES.find((s) => s.id === 'polaris');
  if (!source) {
    throw new Error('Polaris bundled source is not configured');
  }
  return source;
}

/** 返回 superpowers github 来源；未配置则抛错 */
export function getSuperpowersSource(): SkillSource {
  const source = SOURCES.find((s) => s.id === 'superpowers');
  if (!source) {
    throw new Error('Superpowers source is not configured');
  }
  return source;
}
