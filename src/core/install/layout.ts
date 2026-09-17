/**
 * init 阶段项目目录与配置初始化。
 * 含 scope/worktree 布局路径；其余路径经 `assets/polaris-paths` / `platforms` 解析。
 */
import os from 'os';
import path from 'path';
import { ensureDirSafe } from '../../utils/file-system.js';
import {
  getPolarisDir,
  getPolarisHomeDir,
  getWorktreeRoot,
  type InstallScope,
} from '../assets/polaris-paths.js';
import { type Languages } from '../config/polaris-project-config.js';
import { getCommandLayout, getPlatformContextDir, type Platform } from '../domain/platforms.js';

import { POLARIS_PLUGIN_NAME } from '../config/polaris-constants.js';

/**
 * 与 `config.example.yaml` 的 `layout.docs` 子键一致（相对 docs.root 的目录名）。
 * 避免 init 再解析 YAML；改模板时须同步此常量。
 */
export const PROJECT_DOCS_SUBDIRS = [
  'prd',
  'prototype',
  'architecture',
  'design',
  'testcases',
] as const;

export type ProjectLayoutOption = {
  /** 技能语言，写入 config.yaml */
  language: Languages;
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
 * 返回技能安装根：project → 项目路径，global → 用户主目录。
 */
export function getInstallSkillBase(scope: InstallScope, projectPath: string): string {
  return scope === 'global' ? os.homedir() : projectPath;
}

/**
 * 按 scope 返回 worktree 根目录。
 * project → `<project>/.worktrees`；global → `~/.polaris/.worktrees`。
 */
export function resolveWorktreeRoot(projectPath: string, scope: InstallScope): string {
  if (scope === 'global') {
    return path.join(getPolarisHomeDir(), '.worktrees');
  }
  return getWorktreeRoot(projectPath);
}

/**
 * 创建 Polaris 公共工作目录结构（与平台无关）。
 * 对齐 config.example.yaml 的 layout：`.polaris/tasks`、`openspec`、`docs` 及文档子目录、worktree。
 * @param projectPath 项目路径
 * @param scope 安装作用域
 */
export async function initializePolarisCommonLayout(
  projectPath: string,
  scope: InstallScope,
): Promise<string> {
  // 1. 全局 ~/.polaris
  await createGlobalPolarisDir();

  // 2. 项目 .polaris + tasks 根（layout.tasks.root）
  const polarisDir = getPolarisDir(projectPath);
  await ensureDirSafe(polarisDir);
  await ensureDirSafe(path.join(polarisDir, 'tasks'));

  // 3. openspec（layout.openspec）
  await ensureDirSafe(path.join(projectPath, 'openspec'));

  // 4. docs 根及子目录（layout.docs）
  const docsRoot = path.join(projectPath, 'docs');
  await ensureDirSafe(docsRoot);
  for (const name of PROJECT_DOCS_SUBDIRS) {
    await ensureDirSafe(path.join(docsRoot, name));
  }

  // 5. worktree
  const worktreeRoot = resolveWorktreeRoot(projectPath, scope);
  await ensureDirSafe(worktreeRoot);

  return polarisDir;
}

/**
 * 创建项目工作目录，以及按 scope 落盘的技能插件根。
 * 对 platforms 中每个平台，在技能根（project→项目，global→~/.polaris）下创建：
 *    skills / commands / agents / rules（若平台声明），以及
 *    skills/polaris/{hooks,templates,adapters,policies,scorers}
 */
export async function initializeProjectLayout(
  projectPath: string,
  scope: InstallScope,
  platform: Platform,
): Promise<PlatformLayout> {
  scope ??= 'project';
  const globalContextDir = getPolarisHomeDir();
  const projectContextDir = path.join(projectPath, platform.contextDir);
  const contextDir =
    scope === 'global' ? globalContextDir : getPlatformContextDir(platform, scope, projectPath);

  const skillBase = path.join(contextDir, platform.skillsDir, POLARIS_PLUGIN_NAME);
  // 命令根：nested 带 polaris 命名空间目录；flat 直接落平台命令目录
  // （Cursor CLI 不递归子目录，多一层 polaris/ 就完全读不到）
  const commandBase =
    getCommandLayout(platform) === 'flat'
      ? path.join(contextDir, platform.commandsDir)
      : path.join(contextDir, platform.commandsDir, POLARIS_PLUGIN_NAME);
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

/**
 * 创建全局 ~/.polaris 目录，并写入 polaris.yaml
 */
async function createGlobalPolarisDir(): Promise<string> {
  const globalContextDir = getPolarisHomeDir();
  await ensureDirSafe(globalContextDir);
  return globalContextDir;
}
