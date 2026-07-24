/**
 * init 阶段项目目录与配置初始化。
 * 路径一律经 `assets/polaris-paths` 解析；本文件只负责创建目录与复制模板。
 */
import { copyIfMissing, ensureDirSafe, fileExists } from '../../utils/file-system.js';
import { writeYamlFile } from '../../utils/yaml-io.js';
import {
  getConfigExampleYamlSrc,
  getGlobalPolarisConfigPath,
  getHarnessGitignoreSrc,
  getPolarisConfigPath,
  getPolarisDir,
  getPolarisGitignorePath,
  getPolarisHomeDir,
  getWorkflowTemplateYamlSrc,
  getWorkflowYamlPath,
  resolveWorktreeRoot,
} from '../assets/polaris-paths.js';
import {
  type InstallScope,
  type Language,
  type GlobalPolarisConfig,
} from '../config/polaris-config.js';
import type { Platform } from '../platforms.js';
import path from 'path';
import os from 'os';
import { getCurrentVersion } from '../deps/version.js';

const POLARIS_FLOW_PLUGIN_NAME = 'polaris-flow';

export type ProjectLayoutOptions = {
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
  platforms: Platform[];
};

export type PlatformLayout = {
  baseDir: string;
  projectPath: string;
  skillsDir: string;
  commandsDir: string;
  agentsDir: string;
  rulesDir: string;
  hooksDir: string;
  platform: Platform;
};

/**
 * 在安装任何 harness 组件之前：创建目录结构，并写入/补齐项目 config.yaml。
 * 项目结构始终建在 `projectPath`；技能根与 worktree 按 scope。
 */
export async function initializeProjectLayout(
  projectPath: string,
  options: ProjectLayoutOptions,
): Promise<PlatformLayout[]> {
  // 1. 全局 ~/.polaris/polaris.yaml
  await createGlobalPolarisDir();

  // 2. 项目 .polaris + 配置文件
  await ensureDirSafe(getPolarisDir(projectPath));
  await copyIfMissing(getConfigExampleYamlSrc(), getPolarisConfigPath(projectPath));
  await copyIfMissing(getWorkflowTemplateYamlSrc(), getWorkflowYamlPath(projectPath));
  await copyIfMissing(getHarnessGitignoreSrc(), getPolarisGitignorePath(projectPath));

  // 3. worktree
  const worktreeRoot = resolveWorktreeRoot(projectPath, options.scope);
  await ensureDirSafe(worktreeRoot);

  // 1. 创建目录结构
  return await createWorkingDirs(projectPath, {
    scope: options.scope,
    platforms: options.platforms,
  });
}

/**
 * 创建项目工作目录，以及按 scope 落盘的技能插件根。
 * 1. 在 ~/.polaris 下始终确保 polaris.yaml（源：assets/shared/templates/polaris.example.yaml）
 * 2. 在项目根创建 .polaris，并复制：
 *    2.1 config.yaml ← assets/shared/templates/config.example.yaml
 *    2.2 workflow.yaml ← assets/shared/templates/workflow-template.yaml
 *    2.3 .gitignore ← assets/shared/harness/.gitignore
 * 3. worktree：
 *    3.1 project → 项目根/.worktrees
 *    3.2 global → ~/.polaris/.worktrees
 * 4. 对 platforms 中每个平台，在技能根（project→项目，global→~）下创建：
 *    skills / commands / agents / rules（若平台声明），以及
 *    skills/polaris-flow/{hooks,templates,adapters,policies,scorers}
 */
export async function createWorkingDirs(
  projectPath: string,
  options: {
    scope: InstallScope;
    platforms: Platform[];
  },
): Promise<PlatformLayout[]> {
  const scope = options.scope ?? 'project';
  const platformLayouts: PlatformLayout[] = [];
  // 4. 平台目录 + polaris-flow 子目录
  for (const platform of options.platforms) {
    const contextDir =
      scope === 'global'
        ? path.join(os.homedir(), platform.contextDir)
        : path.join(projectPath, platform.contextDir);
    const skillBase = path.join(contextDir, platform.skillsDir, POLARIS_FLOW_PLUGIN_NAME);
    const commandBase = path.join(contextDir, platform.commandsDir, POLARIS_FLOW_PLUGIN_NAME);
    const agentBase = path.join(contextDir, platform.agentsDir);
    const ruleBase = path.join(contextDir, platform.rulesDir);

    await ensureDirSafe(skillBase);
    await ensureDirSafe(commandBase);
    await ensureDirSafe(agentBase);
    await ensureDirSafe(ruleBase);

    platformLayouts.push({
      baseDir: contextDir,
      projectPath: projectPath,
      skillsDir: skillBase,
      commandsDir: commandBase,
      agentsDir: agentBase,
      rulesDir: ruleBase,
      hooksDir: platform.hooksConfigFile,
      platform: platform,
    });
  }

  return platformLayouts;
}

/**
 * 创建全局 ~/.polaris 目录，并写入 polaris.yaml
 */
async function createGlobalPolarisDir(): Promise<void> {
  await ensureDirSafe(getPolarisHomeDir());
  const configPath = getGlobalPolarisConfigPath();
  if (await fileExists(configPath)) {
    return;
  }

  const config: GlobalPolarisConfig = {
    version: getCurrentVersion(),
    dashboard_port: 19009,
    install_time: new Date().toISOString(),
  };
  await writeYamlFile(configPath, config);
}
