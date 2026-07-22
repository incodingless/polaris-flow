/**
 * Polaris 安装编排入口。
 * 按以下顺序安装：
 * 1. 安装与平台关联的内容：skills → commands → subagents → rules → hooks
 * 2. 复制公共内容：adapters/policies/templates 至 polaris-flow Skill目录（含于 skills 步骤）
 */
import type { Platform } from './platform/platforms.js';
import type { InstallScope, Language } from './config/polaris-config.js';

import { getAssetsDir } from './config/polaris-paths.js';
import { getPolarisSource } from './assets/sources.js';
import { copyPolarisAgentsForPlatform } from './install/agents.js';
import { installPolarisCommands } from './install/commands.js';
import { installPolarisHooksForPlatform } from './install/hooks.js';
import { copyPolarisRulesForPlatform } from './install/rules.js';
import { copyPolarisSkillsForPlatform } from './install/skills.js';

export type { LockFile, LockSourceEntry } from './install/lock.js';
export { writeLockFile } from './install/lock.js';

export {
  installCommands,
  installPolarisCommands,
  parseFrontmatter,
  resolveCommandsDir,
} from './install/commands.js';
export { installSource } from './install/source-installer.js';

export { copyPolarisSkillsForPlatform, getManifestSkills, readManifest } from './install/skills.js';
export type { Manifest } from './install/skills.js';

export { copyPolarisRulesForPlatform, computeRuleDestPath } from './install/rules.js';
export { copyPolarisAgentsForPlatform } from './install/agents.js';
export {
  buildHookCommand,
  installPolarisHooksForPlatform,
  isManagedHookCommand,
} from './install/hooks.js';
export { createWorkingDirs } from './config/polaris-config.js';

/** 单类文件拷贝结果 */
export type CopyStats = { copied: number; skipped: number };

/** 单平台安装结果汇总 */
export type PolarisInstallResult = {
  skills: CopyStats;
  commands: CopyStats;
  agents: CopyStats;
  rules: CopyStats;
  hooks: { installed: boolean; reason?: string };
};

/**
 * 按固定顺序为单平台安装 Polaris 资产：
 * skills（含 adapters/policies/templates）→ commands → agents → rules → hooks。
 */
export async function installPolarisForPlatform(
  baseDir: string,
  platform: Platform,
  overwrite: boolean,
  language: Language = 'zh',
  scope: InstallScope = 'project',
): Promise<PolarisInstallResult> {
  const skills = await copyPolarisSkillsForPlatform(baseDir, platform, overwrite, language, scope);

  const commands = await installPolarisCommands(
    getAssetsDir(),
    baseDir,
    platform,
    scope,
    language,
    overwrite,
    getPolarisSource(),
  );

  const agents = await copyPolarisAgentsForPlatform(
    getAssetsDir(),
    baseDir,
    platform,
    language,
    overwrite,
    scope,
  );

  const rules = await copyPolarisRulesForPlatform(baseDir, platform, overwrite, scope, language);

  const hooks = await installPolarisHooksForPlatform(baseDir, platform, scope);

  return { skills, commands, agents, rules, hooks };
}
