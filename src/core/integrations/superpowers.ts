/**
 * Superpowers 技能包安装（按 npm → git 镜像 → 本地目录 三通道顺序尝试）。
 * 通道配置统一走 `install/channels.ts`（CLI flag > env > polaris.yaml）；按平台映射
 * skills CLI agent 名并写入宿主 skills 目录。
 */
import { getNodeToolExecutable } from '../deps/npm.js';
import { cleanupTemp, fetchRepo, resolveVersion } from '../deps/github.js';
import { installSource } from '../install/source-installer.js';
import {
  dependencyMinVersion,
  dependencyRepo,
  requireDependency,
  toRepoUrl,
} from '../deps/registry.js';
import { resolveInstallChannelConfig } from '../install/channels.js';
import { getBaseDir } from './detect.js';
import { PLATFORMS } from '../domain/platforms.js';
import { printCommandErrorDetails } from '../command-error.js';
import type { InstallScope } from '../config/polaris-project-config.js';
import { execFileSync } from 'child_process';
import { fileExists } from '../../utils/file-system.js';

/** Superpowers 安装结果 */
export type SuperpowersInstallResult = {
  status: 'installed' | 'failed' | 'skipped';
  version: string;
  /** 实际使用的安装通道 */
  method?: 'github' | 'npx' | 'local';
};

/** skills CLI 的 --agent 必须用平台 id（trae-cn），不能用展示名（Trae-CN） */
const SKILLS_AGENT_MAP: Record<string, string> = PLATFORMS.reduce(
  (acc, platform) => {
    acc[platform.id] = platform.id;
    return acc;
  },
  {} as Record<string, string>,
);
const VALID_PLATFORM_IDS = new Set(Object.keys(SKILLS_AGENT_MAP));

/**
 * superpowers 的登记声明。取 method 前先窄化——`npx-skills` 才有 repo / placement，
 * 表里改了 kind 而没同步本文件时，这里会立刻抛错而不是静默装错位置。
 */
function superpowersMethod(): Extract<
  ReturnType<typeof requireDependency>['method'],
  { kind: 'npx-skills' }
> {
  const method = requireDependency('superpowers').method;
  if (method.kind !== 'npx-skills') {
    throw new Error('superpowers must be declared as method.kind = "npx-skills"');
  }
  return method;
}

function buildSuperpowersInstallCommand(
  scope: InstallScope,
  platformIds: string[],
): { command: string; args: string[] } {
  const agentNames = [
    ...new Set(
      platformIds.map((id) => SKILLS_AGENT_MAP[id]).filter((name): name is string => Boolean(name)),
    ),
  ];

  if (agentNames.length === 0) {
    throw new Error(`No skills CLI agent names resolved for platforms: ${platformIds.join(', ')}`);
  }

  // `--yes` 必须放在包名之前 —— 那是给 npx 的：允许它自动安装 skills 包本体。
  // 末尾的 `-y` 是给 skills CLI 的：跳过它自己的交互确认。两者缺一不可：
  // 少了 npx 的 `--yes`，首次运行会停在 "Ok to proceed? (y)" 等输入，
  // 非交互环境（CI / hook / 管道）直接挂死。
  const args = ['--yes', 'skills', 'add', dependencyRepo(requireDependency('superpowers')), '-y'];
  if (scope === 'global') {
    args.push('-g');
  }
  for (const name of agentNames) {
    args.push('--agent', name);
  }
  return { command: getNodeToolExecutable('npx'), args };
}

/** 本地目录通道：channels 配置的 localPaths.superpowers 指向已 clone 的仓库 */
async function installSuperpowersFromLocalPath(
  localPath: string | undefined,
  baseDir: string,
  platforms: (typeof PLATFORMS)[number][],
  scope: InstallScope,
): Promise<SuperpowersInstallResult | null> {
  if (!localPath) {
    return null;
  }
  if (!(await fileExists(localPath))) {
    console.warn(`    ↳ 本地目录不存在: ${localPath}`);
    return null;
  }

  console.warn(`    ↳ 使用本地目录 ${localPath} ...`);
  const placement = superpowersMethod().placement;
  for (const platform of platforms) {
    await installSource(placement, localPath, baseDir, platform, scope);
  }
  return { status: 'installed', version: 'local', method: 'local' };
}

/** git 镜像通道：shallow clone（镜像来自 channels 配置） */
async function installSuperpowersViaGitHub(
  baseDir: string,
  platforms: (typeof PLATFORMS)[number][],
  scope: InstallScope,
  mirror?: string,
): Promise<SuperpowersInstallResult | null> {
  const spec = requireDependency('superpowers');
  const repoUrl = toRepoUrl(dependencyRepo(spec));
  let localPath: string | undefined;

  try {
    const resolved = resolveVersion(repoUrl, dependencyMinVersion(spec), mirror);
    const version = resolved.version;

    if (version) {
      console.warn(`    ↳ v${version}`);
    } else if (resolved.reason === 'network-error') {
      console.warn(`    ↳ 无法访问 GitHub 获取版本 tag，将 clone 默认分支...`);
    } else {
      console.warn(`    ↳ 无可用 tag，将 clone 默认分支...`);
    }

    console.warn(`    ↳ git clone ${dependencyRepo(spec)} ...`);

    const fetched = await fetchRepo(repoUrl, version, mirror);
    localPath = fetched.localPath;

    for (const platform of platforms) {
      await installSource(
        superpowersMethod().placement,
        fetched.localPath,
        baseDir,
        platform,
        scope,
      );
    }

    return {
      status: 'installed',
      version: fetched.version,
      method: 'github',
    };
  } catch (error) {
    console.warn(`    ↳ GitHub 拉取失败: ${(error as Error).message}`);
    return null;
  } finally {
    if (localPath) {
      await cleanupTemp(localPath);
    }
  }
}

/** npm 通道：npx skills add（内部仍会 clone GitHub，不是国内网络逃逸舱） */
async function installSuperpowersViaNpx(
  projectPath: string,
  scope: InstallScope,
  platformIds: string[],
): Promise<SuperpowersInstallResult> {
  console.warn('    ↳ npx skills add obra/superpowers ...');

  const skillsCliPlatformIds = platformIds.filter((id) => SKILLS_AGENT_MAP[id]);
  if (skillsCliPlatformIds.length === 0) {
    return { status: 'failed', version: 'failed', method: 'npx' };
  }

  const command = buildSuperpowersInstallCommand(scope, skillsCliPlatformIds);
  try {
    execFileSync(command.command, command.args, {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: superpowersMethod().timeoutMs,
      shell: process.platform === 'win32',
    });
    return { status: 'installed', version: 'npx-latest', method: 'npx' };
  } catch (error) {
    console.error(`    Superpowers (npx) install failed: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return { status: 'failed', version: 'failed', method: 'npx' };
  }
}

/**
 * 安装 Superpowers：按 npm → git 镜像 → 本地目录 顺序尝试，任一通道成功即返回。
 */
export async function installSuperpowersForPlatforms(
  projectPath: string,
  scope: InstallScope,
  platformIds: string[],
  shouldInstall = true,
): Promise<SuperpowersInstallResult> {
  if (!shouldInstall || platformIds.length === 0) {
    return { status: 'skipped', version: 'skipped' };
  }

  const unknownIds = platformIds.filter((id) => !VALID_PLATFORM_IDS.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown platform IDs: ${unknownIds.join(', ')}`);
  }

  const baseDir = getBaseDir(scope, projectPath);
  const platforms = PLATFORMS.filter((p) => platformIds.includes(p.id));
  const channel = await resolveInstallChannelConfig();

  // 1. npm 通道
  const npxResult = await installSuperpowersViaNpx(projectPath, scope, platformIds);
  if (npxResult.status === 'installed') {
    return npxResult;
  }

  // 2. git 镜像通道
  const githubResult = await installSuperpowersViaGitHub(
    baseDir,
    platforms,
    scope,
    channel.githubMirror,
  );
  if (githubResult?.status === 'installed') {
    return githubResult;
  }

  // 3. 本地目录通道
  const localResult = await installSuperpowersFromLocalPath(
    channel.localPaths.superpowers,
    baseDir,
    platforms,
    scope,
  );
  if (localResult?.status === 'installed') {
    return localResult;
  }

  return {
    status: 'failed',
    version: 'failed',
    method: undefined,
  };
}

export { SKILLS_AGENT_MAP, buildSuperpowersInstallCommand };
