/**
 * 平台探测与组件是否已安装判定（openspec / superpowers / polaris）。
 * 路径探测依赖 platform/platforms 定义，不负责实际拷贝。
 */
import path from 'path';
import os from 'os';

import { fileExists, readDir, readJson } from '../../utils/file-system.js';
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

async function hasSuperpowersInPluginCache(pluginsCacheDir: string): Promise<boolean> {
  const marketplaceEntries = await readDir(pluginsCacheDir);
  for (const marketplace of marketplaceEntries) {
    const superpowersDir = path.join(pluginsCacheDir, marketplace, 'superpowers');
    if (!(await fileExists(superpowersDir))) continue;

    const versionEntries = await readDir(superpowersDir);
    for (const version of versionEntries) {
      const skillsDir = path.join(superpowersDir, version, 'skills');
      const skills = await readDir(skillsDir);
      if (SUPERPOWERS_SKILLS.some((name) => skills.includes(name))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查 Claude Code 插件缓存中是否已有 Superpowers。
 * 仅用于 doctor 等诊断，不参与 init 的「是否已安装」判定。
 */
async function hasPluginSuperpowers(): Promise<boolean> {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const pluginsCacheDir = path.join(claudeDir, 'plugins', 'cache');

  return hasSuperpowersInPluginCache(pluginsCacheDir);
}

async function hasCodexPluginSuperpowers(): Promise<boolean> {
  const codexDir =
    process.env.CODEX_HOME || process.env.CODEX_CONFIG_DIR || path.join(os.homedir(), '.codex');
  const pluginsCacheDir = path.join(codexDir, 'plugins', 'cache');

  return hasSuperpowersInPluginCache(pluginsCacheDir);
}

async function hasOpenCodePluginSuperpowers(): Promise<boolean> {
  const opencodeDir =
    process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), '.config', 'opencode');

  const pluginSkillsDir = path.join(opencodeDir, 'superpowers', 'skills');
  if (await fileExists(pluginSkillsDir)) {
    const skills = await readDir(pluginSkillsDir);
    if (SUPERPOWERS_SKILLS.some((name) => skills.includes(name))) {
      return true;
    }
  }

  const configPath = path.join(opencodeDir, 'opencode.json');
  if (await fileExists(configPath)) {
    try {
      const config = (await readJson(configPath)) as Record<string, unknown>;
      const plugins = config.plugin;
      if (Array.isArray(plugins)) {
        if (plugins.some((entry) => typeof entry === 'string' && entry.includes('superpowers'))) {
          return true;
        }
      }
    } catch {
      // 无效 JSON — 跳过
    }
  }

  return false;
}

async function hasOpenCodePolarisCommands(baseDir: string, skillsDir: string, entries: string[]) {
  const polarisEntries = entries.filter((entry) => entry.startsWith('polaris'));
  if (polarisEntries.length === 0) return false;

  const commandsDir = path.join(baseDir, skillsDir, 'commands');
  if (!(await fileExists(commandsDir))) return false;

  const commandEntries = await readDir(commandsDir);
  return polarisEntries.every((entry) => commandEntries.includes(`${entry}.md`));
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
  const skillDirEntries = [{ skillsDir, entries }];

  switch (component) {
    case 'openspec':
      if (entries.some((e) => e.startsWith('openspec-'))) return true;
      break;
    case 'superpowers':
      if (SUPERPOWERS_SKILLS.some((name) => entries.includes(name))) return true;
      break;
    case 'polaris':
      if (platform.id === 'opencode') {
        for (const dir of skillDirEntries) {
          if (await hasOpenCodePolarisCommands(baseDir, dir.skillsDir, dir.entries)) return true;
        }
        break;
      }
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

export {
  detectPlatforms,
  hasSkills,
  hasPluginSuperpowers,
  hasCodexPluginSuperpowers,
  hasOpenCodePluginSuperpowers,
  getBaseDir,
};
