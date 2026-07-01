/**
 * 上游技能来源 — GitHub 拉取、bundled 资产或 npm CLI。
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** npm 包内 bundled assets/ 绝对路径 */
export function getBundledAssetsPath(): string {
  return path.resolve(__dirname, '..', '..', 'assets');
}

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

export const POLARIS_COMMAND_PREFIX = 'polaris';

export const SUPERPOWERS_REPO = 'https://github.com/obra/superpowers';
export const SUPERPOWERS_MIN_VERSION = '4.0.0';

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

export function getPolarisSource(): SkillSource {
  const source = SOURCES.find((s) => s.id === 'polaris');
  if (!source) {
    throw new Error('Polaris bundled source is not configured');
  }
  return source;
}

export function getSuperpowersSource(): SkillSource {
  const source = SOURCES.find((s) => s.id === 'superpowers');
  if (!source) {
    throw new Error('Superpowers source is not configured');
  }
  return source;
}
