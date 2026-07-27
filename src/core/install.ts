/**
 * Polaris 安装编排入口。
 * 按以下顺序安装：
 * 1. 目录与配置初始化（install/layout）
 * 2. skills → commands → agents → rules → hooks
 * 3. 公共内容 adapters/policies/templates 随 skills 步骤落入 polaris-flow
 */
import type { Platform } from './platforms.js';
import type { InstallScope, Language } from './config/polaris-project-config.js';

import { getAssetsDir } from './assets/polaris-paths.js';
import { copyPolarisAgents } from './install/agents.js';
import { installPolarisCommandsForPlatform } from './install/commands.js';
import { installPolarisHooksForPlatform } from './install/hooks.js';
import { initializeProjectLayout } from './install/layout.js';
import { copyPolarisRules } from './install/rules.js';
import { copyPolarisSkillsForPlatform } from './install/skills.js';
import { readAssets } from './assets/manifest.js';

export type { LockFile, LockSourceEntry } from './install/lock.js';
export { writeLockFile } from './install/lock.js';
export { installSource } from './install/source-installer.js';

export { copyPolarisSkillsForPlatform } from './install/skills.js';
export type { Asset } from './assets/manifest.js';

export { copyPolarisRules, computeRuleDestPath } from './install/rules.js';
export { copyPolarisAgents } from './install/agents.js';
export { installPolarisHooksForPlatform } from './install/hooks.js';
export { createWorkingDirs, initializeProjectLayout } from './install/layout.js';
export type { ProjectLayoutOption } from './install/layout.js';

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

export type PlatformInstallResult = {
  platform: Platform;
  result: PolarisInstallResult;
};

/**
 * 按固定顺序为单平台安装 Polaris 资产：
 * layout → skills（含 adapters/policies/templates）→ commands → agents → rules → hooks。
 *
 * `baseDir` 为技能安装根（project→项目，global→主目录）；
 * `projectPath` 为项目运行时根（.polaris / config），缺省等于 baseDir。
 */
export async function installPolarisForPlatform(
  baseDir: string,
  platform: Platform,
  overwrite: boolean,
  language: Language = 'zh',
  scope: InstallScope = 'project',
  projectPath: string = baseDir,
): Promise<PolarisInstallResult> {
  const platformLayout = await initializeProjectLayout(projectPath, {
    language,
    scope,
    baseDir,
    platform: platform,
  });

  const assetsDir = getAssetsDir();
  const asset = await readAssets(language);

  // 3. 复制技能
  const skills = await copyPolarisSkillsForPlatform(
    platformLayout.skillsDir,
    platformLayout.platform,
    overwrite,
    asset,
  );

  // 4. 复制命令
  const commands = await installPolarisCommandsForPlatform(
    platformLayout.commandsDir,
    overwrite,
    asset,
  );

  // 5. 复制代理
  const agents = await copyPolarisAgents(platformLayout.agentsDir, overwrite, asset);

  // 6. 复制规则
  const rules = await copyPolarisRules(
    platformLayout.rulesDir,
    overwrite,
    platformLayout.platform,
    asset,
  );

  // 7. 复制钩子
  const hooks = await installPolarisHooksForPlatform(baseDir, platform, scope, asset);

  return { skills, commands, agents, rules, hooks };
}
