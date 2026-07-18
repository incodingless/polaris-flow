/**
 * 平台探测与组件是否已安装判定（openspec / superpowers / polaris）。
 * 路径探测依赖 platform/platforms 定义，不负责实际拷贝。
 */
import path from 'path';
import os from 'os';

import { fileExists, readDir } from '../../utils/file-system.js';
import { PLATFORMS, getPlatformSkillsDir, type Platform } from './platforms.js';

import type { InstallScope } from '../types.js';

const SUPERPOWERS_SKILLS = [
  'brainstorming',
  'using-superpowers',
  'writing-plans',
  'test-driven-development',
  'subagent-driven-development',
];

/** 返回安装目标根目录：project 用项目路径，global 用用户主目录 */
function getBaseDir(scope: InstallScope, projectPath: string): string {
  return scope === 'global' ? os.homedir() : projectPath;
}

/** 根据 detectionPaths / skillsDir 是否存在，探测项目可能使用的平台集合 */
async function detectPlatforms(projectPath: string): Promise<Set<string>> {
  const detected = new Set<string>();

  for (const platform of PLATFORMS) {
    if (platform.detectionPaths && platform.detectionPaths.length > 0) {
      for (const p of platform.detectionPaths) {
        if (await fileExists(path.join(projectPath, p))) {
          detected.add(platform.id);
          break;
        }
      }
    } else {
      const skillsDir = getPlatformSkillsDir(platform, 'project');
      if (await fileExists(path.join(projectPath, skillsDir))) {
        detected.add(platform.id);
      }
    }
  }

  return detected;
}

/**
 * 检查指定 scope 的 baseDir 下，某平台组件是否已安装。
 * 只检查当前安装目标目录（project 或 global），不跨 scope 查主目录，避免误报。
 */
async function hasSkills(
  baseDir: string,
  platform: Platform,
  component: 'openspec' | 'superpowers' | 'polaris',
  _selectedPlatforms: Platform[] = [],
  scope: InstallScope = 'project',
): Promise<boolean> {
  const skillsDir = getPlatformSkillsDir(platform, scope);
  const fullPath = path.join(baseDir, skillsDir, 'skills');
  const entries = (await fileExists(fullPath)) ? await readDir(fullPath) : [];

  switch (component) {
    case 'openspec':
      if (entries.some((e) => e.startsWith('openspec-'))) return true;
      break;
    case 'superpowers':
      if (SUPERPOWERS_SKILLS.some((name) => entries.includes(name))) return true;
      break;
    case 'polaris':
      // polaris-flow（嵌套包根）或 polaris-flow-*（Trae 扁平子 skill）或旧版 polaris*
      if (
        entries.some(
          (e) => e === 'polaris-flow' || e.startsWith('polaris-flow-') || e.startsWith('polaris'),
        )
      ) {
        return true;
      }
      break;
  }

  return false;
}

export { detectPlatforms, hasSkills, getBaseDir };
