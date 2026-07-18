/**
 * Superpowers 技能包安装（GitHub clone 优先，失败回退 npx skills add）。
 * 按平台映射 skills CLI agent 名并写入宿主 skills 目录。
 */
import { getNodeToolExecutable } from './npm.js';
import { cleanupTemp, fetchRepo, resolveVersion } from './github.js';
import { installSource } from '../install/source-installer.js';
import {
  getSuperpowersSource,
  SUPERPOWERS_REPO,
  SUPERPOWERS_MIN_VERSION,
} from '../assets/sources.js';
import { getBaseDir } from '../platform/detect.js';
import { PLATFORMS } from '../platform/platforms.js';
import { printCommandErrorDetails } from '../command-error.js';
import type { InstallScope } from '../types.js';
import { execFileSync } from 'child_process';

/** Superpowers 安装结果 */
export type SuperpowersInstallResult = {
  status: 'installed' | 'failed' | 'skipped';
  version: string;
  /** 实际使用的安装通道 */
  method?: 'github' | 'npx';
};

const SKILLS_AGENT_MAP: Record<string, string | null> = {
  claude: 'claude-code',
  cursor: 'cursor',
  trae: 'trae',
};

const VALID_PLATFORM_IDS = new Set(Object.keys(SKILLS_AGENT_MAP));
const SUPERPOWERS_INSTALL_TIMEOUT_MS = 300_000;

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

  const args = ['skills', 'add', 'obra/superpowers', '-y'];
  if (scope === 'global') {
    args.push('-g');
  }
  for (const name of agentNames) {
    args.push('--agent', name);
  }
  return { command: getNodeToolExecutable('npx'), args };
}

/** 优先通道：GitHub shallow clone */
async function installSuperpowersViaGitHub(
  baseDir: string,
  platforms: (typeof PLATFORMS)[number][],
  scope: InstallScope,
): Promise<SuperpowersInstallResult | null> {
  const source = getSuperpowersSource();
  let localPath: string | undefined;

  try {
    const resolved = resolveVersion(SUPERPOWERS_REPO, SUPERPOWERS_MIN_VERSION);
    const version = resolved.version;

    if (version) {
      console.warn(`    ↳ v${version}`);
    } else if (resolved.reason === 'network-error') {
      console.warn(`    ↳ 无法访问 GitHub 获取版本 tag，将 clone 默认分支...`);
    } else {
      console.warn(`    ↳ 无可用 tag，将 clone 默认分支...`);
    }

    console.warn(`    ↳ git clone ${SUPERPOWERS_REPO} ...`);

    const fetched = await fetchRepo(SUPERPOWERS_REPO, version);
    localPath = fetched.localPath;

    for (const platform of platforms) {
      await installSource(source, fetched.localPath, baseDir, platform, scope);
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

/** 回退通道：npx skills add（国内网络或 git HTTP/2 问题时更稳定） */
async function installSuperpowersViaNpx(
  projectPath: string,
  scope: InstallScope,
  platformIds: string[],
): Promise<SuperpowersInstallResult> {
  console.warn('    ↳ 回退: npx skills add obra/superpowers ...');

  const skillsCliPlatformIds = platformIds.filter((id) => SKILLS_AGENT_MAP[id]);
  if (skillsCliPlatformIds.length === 0) {
    return { status: 'failed', version: 'failed', method: 'npx' };
  }

  const command = buildSuperpowersInstallCommand(scope, skillsCliPlatformIds);
  try {
    execFileSync(command.command, command.args, {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: SUPERPOWERS_INSTALL_TIMEOUT_MS,
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
 * 安装 Superpowers：优先 GitHub clone，失败时回退 npx skills add。
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

  const githubResult = await installSuperpowersViaGitHub(baseDir, platforms, scope);
  if (githubResult?.status === 'installed') {
    return githubResult;
  }

  return installSuperpowersViaNpx(projectPath, scope, platformIds);
}

export {
  SUPERPOWERS_MIN_VERSION,
  SUPERPOWERS_REPO,
  SKILLS_AGENT_MAP,
  buildSuperpowersInstallCommand,
};
