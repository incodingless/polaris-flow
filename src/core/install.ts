/**
 * Polaris 安装编排入口。
 * 按以下顺序安装：
 * 1. 目录与配置初始化（install/layout）
 * 2. skills → commands → agents → rules → hooks
 * 3. 公共内容 adapters/policies/templates 随 skills 步骤落入 polaris
 */
import path from 'path';
import { getCommandLayout, getPlatformSkillsDir, type Platform } from './domain/platforms.js';
import {
  type InstallScope,
  type Languages,
  loadPolarisConfig,
  resolveReviewAgentModel,
} from './config/polaris-project-config.js';

import { getPolarisConfigPath, getPolarisGitignorePath } from './assets/polaris-paths.js';
import { getConfigExampleYamlSrc, getSharedGitignoreSrc } from './assets/manifest.js';
import { copyPolarisAgents } from './install/agents.js';
import { installPolarisCommandsForPlatform } from './install/commands.js';
import { rewritePolarisCliPlatformId } from './install/hook-assets.js';
import { installPolarisHooksForPlatform } from './install/hooks.js';
import { initializeProjectLayout, resolveWorktreeRoot } from './install/layout.js';
import { copyPolarisRules } from './install/rules.js';
import { copyPolarisSkillsForPlatform } from './install/skills.js';
import { POLARIS_ASSET_KINDS, type CopyStats, type PolarisAssetKind } from './install/types.js';
import { Assets, readAssets } from './assets/manifest.js';
import { ensureWorkflowStateFile } from './config/workflow-state.js';
import { copyIfMissing, fileExists } from '../utils/file-system.js';
import { writeYamlFromTemplate } from '../utils/yaml-io.js';

export type { LockFile, LockSourceEntry } from './install/lock.js';
export { writeLockFile } from './install/lock.js';
export { installSource } from './install/source-installer.js';

export { copyPolarisSkillsForPlatform } from './install/skills.js';
export type { Assets } from './assets/manifest.js';
export { POLARIS_ASSET_KINDS } from './install/types.js';
export type { CopyStats, PolarisAssetKind } from './install/types.js';

export { copyPolarisRules, computeRuleDestPath } from './install/rules.js';
export { copyPolarisAgents } from './install/agents.js';
export { installPolarisHooksForPlatform } from './install/hooks.js';
export { initializePolarisCommonLayout, initializeProjectLayout } from './install/layout.js';
export type { ProjectLayoutOption } from './install/layout.js';

/** 单平台安装结果汇总 */
export type PolarisInstallResult = {
  skills: CopyStats;
  commands: CopyStats;
  agents: CopyStats;
  rules: CopyStats;
  hooks: { installed: boolean; reason?: string };
  /**
   * 本次安装实际落盘的资产文件，按类别分组（绝对路径，含既有未改写的文件）。
   * update 用它做托管文件清理（--prune）；init 不消费。
   */
  installedFiles: Record<PolarisAssetKind, string[]>;
};

/**
 * 安装范围选项。缺省 = 全类别安装，与 init 的历史行为一致。
 */
export type PolarisInstallOptions = {
  /** 只安装这些类别；缺省全部 */
  only?: PolarisAssetKind[];
  /**
   * hooks 是否整文件覆盖宿主配置。
   * 缺省跟随 `overwrite` 参数（init 的「覆盖」语义）；update 传 false 走合并，
   * 避免整文件替换掉用户在 `hooks.json` 里的自有条目。
   */
  overwriteHooks?: boolean;
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
 * `options.only` 可只执行部分类别（update 用）；未选中的类别返回零值且不计入 installedFiles。
 */
export async function installPolarisForPlatform(
  baseDir: string,
  platform: Platform,
  overwrite: boolean,
  language: Languages = 'zh',
  scope: InstallScope = 'project',
  projectPath: string = baseDir,
  options: PolarisInstallOptions = {},
): Promise<PolarisInstallResult> {
  const selected = new Set<PolarisAssetKind>(options.only ?? POLARIS_ASSET_KINDS);
  const selectedKinds = (kind: PolarisAssetKind): boolean => selected.has(kind);
  const emptyStats = (): CopyStats => ({ copied: 0, skipped: 0, files: [] });

  const platformLayout = await initializeProjectLayout(projectPath, scope, platform);

  //2. 复制gitignore
  await copyIfMissing(getSharedGitignoreSrc(), getPolarisGitignorePath(projectPath));

  // 3. 复制 Polaris 资产
  const asset = await readAssets(language);

  // 3.1 复制技能
  const skills = selectedKinds('skills')
    ? await copyPolarisSkillsForPlatform(
        platformLayout.skillsDir,
        getPlatformSkillsDir(platform, scope, projectPath),
        platform.skillsLayout,
        overwrite,
        asset,
      )
    : emptyStats();

  // 3.1.1 替换 scripts/_polaris-cli.sh 平台占位符，并为 hooks/scripts 设可执行位
  // 脚本由 skills 步骤落盘；hooks 单独更新时也补一遍，保证可执行位与占位符已就绪（幂等）
  if (selectedKinds('skills') || selectedKinds('hooks')) {
    await rewritePolarisCliPlatformId(platformLayout.skillsDir, platform.id);
  }

  // 3.2 复制命令（落盘路径按平台 commandLayout：nested 保留子目录；flat 扁平为 polaris-<路径>）
  const commands = selectedKinds('commands')
    ? await installPolarisCommandsForPlatform(
        platformLayout.commandsDir,
        overwrite,
        asset,
        platform.skillsLayout,
        getCommandLayout(platform),
      )
    : emptyStats();

  // 3.3 复制代理（按平台映射 tools，写入 config 解析的 model）
  const agents = selectedKinds('agents')
    ? await copyPolarisAgents(projectPath, platformLayout.agentsDir, overwrite, asset, platform)
    : emptyStats();

  // 3.4 复制规则
  const rules = selectedKinds('rules')
    ? await copyPolarisRules(
        platformLayout.rulesDir,
        overwrite,
        platformLayout.platform,
        language,
        asset,
      )
    : emptyStats();

  // 3.5 复制钩子（baseDir 为平台 context 根，如 project/.claude）
  const hooks = selectedKinds('hooks')
    ? await installPolarisHooksForPlatform(
        platformLayout.baseDir,
        platform,
        scope,
        asset,
        options.overwriteHooks ?? overwrite,
      )
    : { installed: false, reason: 'not selected' };

  return {
    skills,
    commands,
    agents,
    rules,
    hooks,
    installedFiles: {
      skills: skills.files,
      commands: commands.files,
      agents: agents.files,
      rules: rules.files,
      // hooks 写的是宿主配置文件，不参与托管文件清理
      hooks: [],
    },
  };
}

/**
 * 基于 config.example.yaml 生成 `.polaris/config.yaml`。
 * 保留模板注释；覆盖 language / platforms / scope / install-time /
 * main-repo-root / worktree-dir，以及 layout 下各绝对路径。
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

  const repoRoot = path.resolve(projectPath);
  const worktreeRoot = resolveWorktreeRoot(projectPath, scope);

  await writeYamlFromTemplate(getConfigExampleYamlSrc(), polarisConfigPath, {
    keepComments: true,
    transform: (doc) => {
      doc.set('language', language);
      // 模板键名为 platform；运行时统一写 platforms，并删除旧键
      doc.set(
        'platforms',
        platforms.map((p) => p.id),
      );
      if (doc.has('platform')) {
        doc.delete('platform');
      }
      doc.set('scope', scope);
      doc.set('install-time', new Date().toISOString());
      doc.set('main-repo-root', repoRoot);
      doc.set('worktree-dir', worktreeRoot);

      doc.setIn(['layout', 'worktree'], worktreeRoot);
      doc.setIn(['layout', 'openspec'], path.join(repoRoot, 'openspec'));
      doc.setIn(['layout', 'tasks', 'root'], path.join(repoRoot, '.polaris', 'tasks'));
      doc.setIn(['layout', 'docs', 'root'], path.join(repoRoot, 'docs'));
    },
  });
}

/**
 * 物化 `.polaris/workflow.yaml`：按模板写出数据，不保留注释，不写入 version / install-time。
 */
async function generateWorkflowConfig(projectPath: string): Promise<void> {
  await ensureWorkflowStateFile(projectPath);
}
