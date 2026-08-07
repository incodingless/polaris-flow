/**
 * 平台差异化安装目标路径映射。
 * 将 assets 相对路径解析为 nested/flat 布局下的落盘相对路径（相对 baseDir）。
 * 发布包 assets 源路径见 `manifest.ts`。
 */
import path from 'path';

import { getSkillsLayout, type Platform } from '../platforms.js';
import type { InstallScope } from './polaris-paths.js';
import { loadPolarisConfig } from '../config/polaris-project-config.js';

/** 包内公共目录前缀（装入 polaris-flow 插件根，两种 layout 相同） */
const PACKAGE_COMMON_PREFIXES = ['adapters/', 'policies/', 'templates/', 'hooks/'] as const;

/** 应忽略的空壳路径前缀 */
const SKIP_PREFIXES = ['skills/polaris/'] as const;

/**
 * 返回平台上下文相对目录名（project→contextDir，global→globalContextDir）。
 */
function getPlatformContextRel(platform: Platform, scope: InstallScope = 'project'): string {
  return scope === 'global' ? platform.globalContextDir : platform.contextDir;
}

/**
 * 返回插件根目录相对路径（相对 baseDir）。
 * 例：`.claude/skills/polaris-flow`
 */
export function getPluginRootRel(
  platform: Platform,
  scope: InstallScope = 'project',
  _projectPath?: string,
): string {
  return path.posix.join(getPlatformContextRel(platform, scope), 'skills', 'polaris-flow');
}

/**
 * 判断 manifest 资产路径是否应跳过安装（如空壳 polaris/）。
 */
export function shouldSkipAsset(assetRelPath: string): boolean {
  const normalized = assetRelPath.replace(/\\/g, '/');
  return SKIP_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
}

/**
 * 判断是否为包内公共内容（adapters/policies/templates/hooks/hard-stops）。
 */
export function isPackageCommonAsset(assetRelPath: string): boolean {
  const normalized = assetRelPath.replace(/\\/g, '/');
  if (PACKAGE_COMMON_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }
  if (normalized === 'skills/hard-stops.md' || normalized === 'hard-stops.md') {
    return true;
  }
  return false;
}

/**
 * 从 `skills/<name>/...` 路径取出顶层 skill 名；非 skill 树则返回 null。
 */
export function getTopLevelSkillName(assetRelPath: string): string | null {
  const normalized = assetRelPath.replace(/\\/g, '/');
  if (!normalized.startsWith('skills/')) {
    return null;
  }
  const rest = normalized.slice('skills/'.length);
  if (!rest || rest === 'hard-stops.md') {
    return null;
  }
  const slash = rest.indexOf('/');
  const name = slash === -1 ? rest : rest.slice(0, slash);
  // skills 根下的裸文件（含扩展名）不是子 skill
  if (slash === -1 && name.includes('.')) {
    return null;
  }
  if (!name || name === 'polaris') {
    return null;
  }
  return name;
}

/**
 * 将 hooks 清单相对路径（hooks/foo.sh）转为插件根下的相对片段。
 */
export function hookScriptPluginRel(scriptRelPath: string): string {
  const normalized = scriptRelPath.replace(/\\/g, '/');
  const file = normalized.startsWith('hooks/') ? normalized.slice('hooks/'.length) : normalized;
  return path.posix.join('hooks', file);
}

/**
 * 解析资产在目标项目中的相对路径（相对 baseDir）。
 * 返回 null 表示跳过。
 */
export function resolveInstallDest(
  assetRelPath: string,
  platform: Platform,
  scope: InstallScope = 'project',
  projectPath?: string,
): string | null {
  const normalized = assetRelPath.replace(/\\/g, '/');

  if (shouldSkipAsset(normalized)) {
    return null;
  }

  const pluginRoot = getPluginRootRel(platform, scope, projectPath);
  const skillsRoot = path.posix.join(getPlatformContextRel(platform, scope), 'skills');

  // 包内公共内容
  if (isPackageCommonAsset(normalized)) {
    if (normalized === 'skills/hard-stops.md' || normalized === 'hard-stops.md') {
      return path.posix.join(pluginRoot, 'hard-stops.md');
    }
    // adapters/foo → plugin_root/adapters/foo
    // hooks/foo.sh → plugin_root/hooks/foo.sh
    return path.posix.join(pluginRoot, normalized);
  }

  // 子 skill
  const skillName = getTopLevelSkillName(normalized);
  if (skillName) {
    const underSkill = normalized.slice(`skills/${skillName}/`.length);
    if (getSkillsLayout(platform) === 'flat') {
      const flatRoot = path.posix.join(skillsRoot, `polaris-flow-${skillName}`);
      return underSkill ? path.posix.join(flatRoot, underSkill) : flatRoot;
    }
    const nestedRoot = path.posix.join(pluginRoot, skillName);
    return underSkill ? path.posix.join(nestedRoot, underSkill) : nestedRoot;
  }

  return null;
}

/**
 * 解析 agent 文件应安装到的平台 agents 目录路径（相对 baseDir）。
 */
export function resolveAgentInstallDest(
  agentFileName: string,
  platform: Platform,
  scope: InstallScope = 'project',
): string {
  const baseName = agentFileName.endsWith('.md') ? agentFileName : `${agentFileName}.md`;
  return path.posix.join(getPlatformContextRel(platform, scope), 'agents', baseName);
}

/**
 * 获取项目的Polaris插件根路径
 * @param projectPath 项目根路径
 * @param platform 平台
 * @returns Polaris插件根路径
 */
export async function getPolarisPluginRootPath(projectPath: string, platform: Platform): Promise<string> {
  return path.posix.join(projectPath, platform.contextDir, platform.skillsDir, 'polaris-flow');
}