/**
 * 平台差异化安装目标路径映射。
 * 将 assets 相对路径解析为 nested/flat 布局下的落盘相对路径（相对 baseDir）。
 * 发布包 assets 源路径见 `manifest.ts`。
 */
import path from 'path';

import { getSkillsLayout, type Platform } from '../domain/platforms.js';
import type { InstallScope } from './polaris-paths.js';
import { POLARIS_PLUGIN_NAME } from '../config/polaris-constants.js';

/** 包内公共目录前缀（装入 polaris 插件根，两种 layout 相同） */
const PACKAGE_COMMON_PREFIXES = ['adapters/', 'policies/', 'templates/', 'hooks/', 'scripts/'] as const;

/**
 * 技能族目录（其下为叶技能）。
 * 注意：族名必须与 `assets/<lang>/skills/` 下的实际目录名一致，否则族目录会被误判为独立技能。
 * 测试族固定为 `testing`——**不可用 `test`**，与仓库根 `test/`（单元测试）及保留目录冲突。
 */
const SKILL_FAMILIES = new Set(['coding', 'prd', 'testing']);

/** 应忽略的空壳 / 备份路径前缀 */
const SKIP_PREFIXES = [
  'skills/backup/',
  'skills/requirements-engineering/',
] as const;

/**
 * 返回平台上下文相对目录名（project→contextDir，global→globalContextDir）。
 */
function getPlatformContextRel(platform: Platform, scope: InstallScope = 'project'): string {
  return scope === 'global' ? platform.globalContextDir : platform.contextDir;
}

/**
 * 返回插件根目录相对路径（相对 baseDir）。
 * 例：`.claude/skills/polaris`
 */
export function getPluginRootRel(
  platform: Platform,
  scope: InstallScope = 'project',
  _projectPath?: string,
): string {
  return path.posix.join(getPlatformContextRel(platform, scope), 'skills', POLARIS_PLUGIN_NAME);
}

/**
 * 判断 manifest 资产路径是否应跳过安装。
 */
export function shouldSkipAsset(assetRelPath: string): boolean {
  const normalized = assetRelPath.replace(/\\/g, '/');
  if (normalized.includes('/.workbuddy/')) {
    return true;
  }
  return SKIP_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
}

/**
 * 判断是否为包内公共内容（adapters/policies/templates/hooks/scripts）。
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
 * 解析 skills 资产相对路径中的族 / 叶技能。
 * - `coding/specify/SKILL.md` → family=coding, skill=specify
 * - `subagent-probe/SKILL.md` → family=null, skill=subagent-probe
 */
export function parseSkillAssetPath(shortPath: string): {
  family: string | null;
  skill: string;
  underSkill: string;
} | null {
  const normalized = shortPath.replace(/\\/g, '/');
  if (!normalized || normalized === 'README.md' || !normalized.includes('/')) {
    return null;
  }
  const parts = normalized.split('/');
  if (parts[0] === 'backup' || parts[0] === 'requirements-engineering') {
    return null;
  }
  if (SKILL_FAMILIES.has(parts[0])) {
    if (parts.length < 2) {
      return null;
    }
    return {
      family: parts[0],
      skill: parts[1],
      underSkill: parts.slice(2).join('/'),
    };
  }
  return {
    family: null,
    skill: parts[0],
    underSkill: parts.slice(1).join('/'),
  };
}

/**
 * @deprecated 使用 parseSkillAssetPath；保留仅取叶技能名以兼容旧调用。
 */
export function getTopLevelSkillName(assetRelPath: string): string | null {
  const normalized = assetRelPath.replace(/\\/g, '/');
  if (!normalized.startsWith('skills/')) {
    return null;
  }
  const rest = normalized.slice('skills/'.length);
  const parsed = parseSkillAssetPath(rest);
  return parsed?.skill ?? null;
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

  if (isPackageCommonAsset(normalized)) {
    if (normalized === 'skills/hard-stops.md' || normalized === 'hard-stops.md') {
      return path.posix.join(pluginRoot, 'hard-stops.md');
    }
    return path.posix.join(pluginRoot, normalized);
  }

  if (!normalized.startsWith('skills/')) {
    return null;
  }
  const rest = normalized.slice('skills/'.length);
  const parsed = parseSkillAssetPath(rest);
  if (!parsed) {
    if (!rest.includes('/')) {
      return path.posix.join(pluginRoot, rest);
    }
    return null;
  }

  const { family, skill, underSkill } = parsed;
  if (getSkillsLayout(platform) === 'flat') {
    const flatName = family
      ? `${POLARIS_PLUGIN_NAME}-${family}-${skill}`
      : `${POLARIS_PLUGIN_NAME}-${skill}`;
    const flatRoot = path.posix.join(skillsRoot, flatName);
    return underSkill ? path.posix.join(flatRoot, underSkill) : flatRoot;
  }

  const nestedRoot = family
    ? path.posix.join(pluginRoot, family, skill)
    : path.posix.join(pluginRoot, skill);
  return underSkill ? path.posix.join(nestedRoot, underSkill) : nestedRoot;
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
 * 获取项目的 Polaris 插件根路径。
 */
export async function getPolarisPluginRootPath(
  projectPath: string,
  platform: Platform,
): Promise<string> {
  return path.posix.join(projectPath, platform.contextDir, platform.skillsDir, POLARIS_PLUGIN_NAME);
}
