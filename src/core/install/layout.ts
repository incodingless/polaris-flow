/**
 * init 阶段项目目录与配置初始化。
 * 路径一律经 `assets/polaris-paths` 解析；本文件只负责创建目录与复制模板。
 */
import { ensureDirSafe } from '../../utils/file-system.js';
import { getPolarisDir, getPolarisHomeDir, resolveWorktreeRoot } from '../assets/polaris-paths.js';
import { type InstallScope, type Language } from '../config/polaris-project-config.js';
import type { Platform } from '../platforms.js';
import path from 'path';
import os from 'os';

const POLARIS_FLOW_PLUGIN_NAME = 'polaris-flow';

export type ProjectLayoutOption = {
  /** 技能语言，写入 config.yaml */
  language: Language;
  /** 安装作用域：影响技能根与 worktree 落盘位置 */
  scope: InstallScope;
  /** 技能安装根目录（project→项目路径，global→用户主目录） */
  baseDir: string;
  /**
   * 需要预创建插件根的平台列表。
   * 调用方保证非空；config 的 platform / plugin_root 取 platforms[0]。
   */
  platform: Platform;
};

export type PlatformLayout = {
  baseDir: string;
  globalContextDir: string;
  projectContextDir: string;
  projectPath: string;
  skillsDir: string;
  commandsDir: string;
  agentsDir: string;
  rulesDir: string;
  hooksDir: string;
  platform: Platform;
};

/**
 * 创建Polaris公共工作目录结构与配置
 * @param projectPath 项目路径
 * @param scope 安装作用域
 */
export async function initializePolarisCommonLayout(
  projectPath: string,
  scope: InstallScope,
): Promise<string> {
  // 1. 全局 ~/.polaris/polaris.yaml
  await createGlobalPolarisDir();

  // 2. 项目 .polaris + 配置文件
  const polarisDir = getPolarisDir(projectPath);
  await ensureDirSafe(polarisDir);

  // 3. worktree
  const worktreeRoot = resolveWorktreeRoot(projectPath, scope);
  await ensureDirSafe(worktreeRoot);

  return polarisDir;
}

/**
 * 创建项目工作目录，以及按 scope 落盘的技能插件根。
 * 对 platforms 中每个平台，在技能根（project→项目，global→~/.polaris）下创建：
 *    skills / commands / agents / rules（若平台声明），以及
 *    skills/polaris-flow/{hooks,templates,adapters,policies,scorers}
 */
export async function initializeProjectLayout(
  projectPath: string,
  scope: InstallScope,
  platform: Platform,
): Promise<PlatformLayout> {
  scope ??= 'project';
  const globalContextDir = getPolarisHomeDir();
  const projectContextDir = path.join(projectPath, platform.contextDir);
  const contextDir = scope === 'global' ? globalContextDir : projectContextDir;

  const skillBase = path.join(contextDir, platform.skillsDir, POLARIS_FLOW_PLUGIN_NAME);
  const commandBase = path.join(contextDir, platform.commandsDir, POLARIS_FLOW_PLUGIN_NAME);
  const agentBase = path.join(contextDir, platform.agentsDir);
  const ruleBase = path.join(contextDir, platform.rulesDir);

  await ensureDirSafe(skillBase);
  await ensureDirSafe(commandBase);
  await ensureDirSafe(agentBase);
  await ensureDirSafe(ruleBase);

  return {
    baseDir: contextDir,
    globalContextDir: globalContextDir,
    projectContextDir: projectContextDir,
    projectPath: projectPath,
    skillsDir: skillBase,
    commandsDir: commandBase,
    agentsDir: agentBase,
    rulesDir: ruleBase,
    hooksDir: platform.hooksConfigFile,
    platform: platform,
  };
}

export function getPlatformContextDir(
  platform: Platform,
  scope: InstallScope,
  projectPath: string,
) {
  return scope === 'global'
    ? path.join(os.homedir(), platform.contextDir)
    : path.join(projectPath, platform.contextDir);
}

/**
 * 创建全局 ~/.polaris 目录，并写入 polaris.yaml
 */
async function createGlobalPolarisDir(): Promise<string> {
  const globalContextDir = getPolarisHomeDir();
  await ensureDirSafe(globalContextDir);
  return globalContextDir;
}
