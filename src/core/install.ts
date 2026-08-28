/**
 * Polaris 安装编排入口。
 * 按以下顺序安装：
 * 1. 目录与配置初始化（install/layout）
 * 2. skills → commands → agents → rules → hooks
 * 3. 公共内容 adapters/policies/templates 随 skills 步骤落入 polaris-flow
 */
import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { parseDocument } from 'yaml';
import { getPlatformSkillsDir, type Platform } from './domain/platforms.js';
import {
  type InstallScope,
  type Languages,
  loadPolarisConfig,
  resolveReviewAgentModel,
} from './config/polaris-project-config.js';

import {
  getPolarisConfigPath,
  getPolarisGitignorePath,
  getWorkflowConfigPath,
} from './assets/polaris-paths.js';
import {
  getConfigExampleYamlSrc,
  getSharedGitignoreSrc,
  getWorkflowTemplateYamlSrc,
} from './assets/manifest.js';
import { copyPolarisAgents } from './install/agents.js';
import { installPolarisCommandsForPlatform } from './install/commands.js';
import { rewritePolarisCliPlatformId } from './install/hook-assets.js';
import { installPolarisHooksForPlatform } from './install/hooks.js';
import { initializeProjectLayout, resolveWorktreeRoot } from './install/layout.js';
import { copyPolarisRules } from './install/rules.js';
import { copyPolarisSkillsForPlatform } from './install/skills.js';
import { Assets, readAssets } from './assets/manifest.js';
import { copyIfMissing, fileExists } from '../utils/file-system.js';

export type { LockFile, LockSourceEntry } from './install/lock.js';
export { writeLockFile } from './install/lock.js';
export { installSource } from './install/source-installer.js';

export { copyPolarisSkillsForPlatform } from './install/skills.js';
export type { Assets } from './assets/manifest.js';

export { copyPolarisRules, computeRuleDestPath } from './install/rules.js';
export { copyPolarisAgents } from './install/agents.js';
export { installPolarisHooksForPlatform } from './install/hooks.js';
export { initializePolarisCommonLayout, initializeProjectLayout } from './install/layout.js';
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
 * 初始化项目 Polaris 配置、工作流占位与 .gitignore。
 */
export async function initPolarisConfig(
  projectPath: string,
  language: Languages,
  scope: InstallScope,
  platforms: Platform[],
  overwrite: boolean = false,
): Promise<void> {
  await generatePolarisConfig(projectPath, language, scope, platforms, overwrite);
  await generateWorkflowConfig(projectPath);
  await copyIfMissing(getSharedGitignoreSrc(), getPolarisGitignorePath(projectPath));
}

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
  language: Languages = 'zh',
  scope: InstallScope = 'project',
  projectPath: string = baseDir,
): Promise<PolarisInstallResult> {
  const platformLayout = await initializeProjectLayout(projectPath, scope, platform);

  //2. 复制gitignore
  await copyIfMissing(getSharedGitignoreSrc(), getPolarisGitignorePath(projectPath));

  // 3. 复制 Polaris 资产
  const asset = await readAssets(language);

  // 3.1 复制技能
  const skills = await copyPolarisSkillsForPlatform(
    platformLayout.skillsDir,
    getPlatformSkillsDir(platform, scope, projectPath),
    platform.skillsLayout,
    overwrite,
    asset,
  );

  // 3.1.1 替换 scripts/_polaris-cli.sh 平台占位符，并为 hooks/scripts 设可执行位
  await rewritePolarisCliPlatformId(platformLayout.skillsDir, platform.id);

  // 3.2 复制命令
  const commands = await installPolarisCommandsForPlatform(
    platformLayout.commandsDir,
    overwrite,
    asset,
  );

  // 3.3 复制代理（按平台映射 tools，写入 config 解析的 model）
  const agents = await copyPolarisAgents(
    projectPath,
    platformLayout.agentsDir,
    overwrite,
    asset,
    platform,
  );

  // 3.4 复制规则
  const rules = await copyPolarisRules(
    platformLayout.rulesDir,
    overwrite,
    platformLayout.platform,
    language,
    asset,
  );

  // 3.5 复制钩子（baseDir 为平台 context 根，如 project/.claude）
  const hooks = await installPolarisHooksForPlatform(
    platformLayout.baseDir,
    platform,
    scope,
    asset,
    overwrite,
  );

  return { skills, commands, agents, rules, hooks };
}

/**
 * 基于 config.example.yaml 生成 `.polaris/config.yaml`。
 * 保留模板注释；仅覆盖 language / platform / scope / install-time / main-repo-root / worktree-dir。
 * @param overwrite 为 true 时即使文件已存在也整文件按模板重写
 */
export async function generatePolarisConfig(
  projectPath: string,
  language: Languages,
  scope: InstallScope,
  platforms: Platform[],
  overwrite: boolean = false,
): Promise<void> {
  const polarisConfigPath = getPolarisConfigPath(projectPath);
  if (!overwrite && (await fileExists(polarisConfigPath))) {
    return;
  }

  const templateText = await readFile(getConfigExampleYamlSrc(), 'utf-8');
  const doc = parseDocument(templateText, { keepSourceTokens: true });

  doc.set('language', language);
  doc.set(
    'platforms',
    platforms.map((p) => p.id),
  );
  doc.set('scope', scope);
  doc.set('install-time', new Date().toISOString());
  doc.set('main-repo-root', path.resolve(projectPath));
  doc.set('worktree-dir', resolveWorktreeRoot(projectPath, scope));

  const text = String(doc);
  await writeFile(polarisConfigPath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}

/**
 * 生成 Polaris 工作流配置文件。
 * 保留模板注释；仅覆盖 version / install-time / plugins。
 * @param overwrite 为 true 时即使文件已存在也整文件按模板重写
 */
async function generateWorkflowConfig(
  projectPath: string,
  overwrite: boolean = false,
): Promise<void> {
  const workflowConfigPath = getWorkflowConfigPath(projectPath);
  if (!overwrite && (await fileExists(workflowConfigPath))) {
    return;
  }

  const templateText = await readFile(getWorkflowTemplateYamlSrc(), 'utf-8');
  const doc = parseDocument(templateText, { keepSourceTokens: true });

  doc.set('version', '0.1.0');
  doc.set('install-time', new Date().toISOString());

  const text = String(doc);
  await writeFile(workflowConfigPath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}
