/**
 * Superpowers 技能包安装（GitHub clone 优先，失败回退 npx skills add）。
 * 按平台映射 skills CLI agent 名并写入宿主 skills 目录。
 */
import { getNodeToolExecutable } from './npm.js';
import { cleanupTemp, fetchRepo, resolveVersion } from './github.js';
import { installSource } from '../install/commands.js';
import {
  getSuperpowersSource,
  SUPERPOWERS_REPO,
  SUPERPOWERS_MIN_VERSION,
} from '../assets/sources.js';
import { getBaseDir } from '../platform/detect.js';
import { getPlatformSkillsDir, PLATFORMS } from '../platform/platforms.js';
import { printCommandErrorDetails } from '../command-error.js';
import { copyDirContents } from '../../utils/file-system.js';
import type { InstallScope } from '../types.js';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';

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
  codex: 'codex',
  opencode: 'opencode',
  windsurf: 'windsurf',
  cline: 'cline',
  roocode: 'roo',
  continue: 'continue',
  'github-copilot': 'github-copilot',
  gemini: 'gemini-cli',
  'amazon-q': 'universal',
  qwen: 'qwen-code',
  kilocode: 'kilo',
  auggie: 'augment',
  kiro: 'kiro-cli',
  kimicode: 'kimi-code-cli',
  lingma: null,
  junie: 'junie',
  codebuddy: 'codebuddy',
  costrict: 'universal',
  crush: 'crush',
  factory: 'droid',
  iflow: 'iflow-cli',
  pi: 'pi',
  qoder: 'qoder',
  antigravity: 'antigravity',
  bob: 'bob',
  forgecode: 'forgecode',
  trae: 'trae',
};

const VALID_PLATFORM_IDS = new Set(Object.keys(SKILLS_AGENT_MAP));
const SUPERPOWERS_INSTALL_TIMEOUT_MS = 300_000;
const LINGMA_PLATFORM_ID = 'lingma';
const LINGMA_STAGE_AGENT = 'claude-code';

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

function buildLingmaSuperpowersStageCommand(): { command: string; args: string[] } {
  return {
    command: getNodeToolExecutable('npx'),
    args: ['skills', 'add', 'obra/superpowers', '-y', '--agent', LINGMA_STAGE_AGENT],
  };
}

async function installSuperpowersForLingmaViaNpx(
  projectPath: string,
  scope: InstallScope,
): Promise<'installed' | 'failed'> {
  const lingmaPlatform = PLATFORMS.find((platform) => platform.id === LINGMA_PLATFORM_ID);
  if (!lingmaPlatform) {
    console.error('    Superpowers install failed: Lingma platform is not registered');
    return 'failed';
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-lingma-superpowers-'));
  try {
    const stageCommand = buildLingmaSuperpowersStageCommand();
    execFileSync(stageCommand.command, stageCommand.args, {
      cwd: tempDir,
      stdio: 'inherit',
      timeout: SUPERPOWERS_INSTALL_TIMEOUT_MS,
      shell: process.platform === 'win32',
    });

    const stagedSkillsDir = path.join(tempDir, '.claude', 'skills');
    const baseDir = getBaseDir(scope, projectPath);
    const lingmaSkillsDir = path.join(
      baseDir,
      getPlatformSkillsDir(lingmaPlatform, scope),
      'skills',
    );
    await copyDirContents(stagedSkillsDir, lingmaSkillsDir);
    return 'installed';
  } catch (error) {
    console.error(`    Lingma Superpowers install failed: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return 'failed';
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
  const shouldInstallLingma = platformIds.includes(LINGMA_PLATFORM_ID);
  let failed = false;

  if (skillsCliPlatformIds.length > 0) {
    const command = buildSuperpowersInstallCommand(scope, skillsCliPlatformIds);
    try {
      execFileSync(command.command, command.args, {
        cwd: projectPath,
        stdio: 'inherit',
        timeout: SUPERPOWERS_INSTALL_TIMEOUT_MS,
        shell: process.platform === 'win32',
      });
    } catch (error) {
      console.error(`    Superpowers (npx) install failed: ${(error as Error).message}`);
      printCommandErrorDetails(error);
      failed = true;
    }
  }

  if (shouldInstallLingma) {
    const lingmaStatus = await installSuperpowersForLingmaViaNpx(projectPath, scope);
    if (lingmaStatus === 'failed') failed = true;
  }

  if (skillsCliPlatformIds.length === 0 && !shouldInstallLingma) {
    return { status: 'failed', version: 'failed', method: 'npx' };
  }

  return failed
    ? { status: 'failed', version: 'failed', method: 'npx' }
    : { status: 'installed', version: 'npx-latest', method: 'npx' };
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
