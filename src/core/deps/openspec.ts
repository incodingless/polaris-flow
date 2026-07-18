/**
 * OpenSpec CLI 安装与 init 调用封装。
 * 负责全局 npm 安装、旧本地安装清理及按平台执行 openspec init。
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import { rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { PLATFORMS } from '../platform/platforms.js';
import { printCommandErrorDetails } from '../command-error.js';
import { fileExists, readJson } from '../../utils/file-system.js';
import { getNodeToolExecutable } from './npm.js';

import type { InstallScope } from '../types.js';

const VALID_TOOL_IDS = new Set(PLATFORMS.map((p) => p.openspecToolId));
const ALL_OPENSPEC_WORKFLOWS = [
  'propose',
  'explore',
  'new',
  'continue',
  'apply',
  'ff',
  'sync',
  'archive',
  'bulk-archive',
  'verify',
  'onboard',
] as const;

function getNpmExecutable(platform: NodeJS.Platform = process.platform): string {
  return getNodeToolExecutable('npm', platform);
}

function buildOpenSpecInitInvocation(
  projectPath: string,
  toolIds: string[],
  scope: InstallScope,
  homeDir = os.homedir(),
  includeProfileFlag = true,
): { command: string; args: string[] } {
  const targetPath = scope === 'global' ? homeDir : projectPath;
  const args = ['init', targetPath, '--tools', toolIds.join(',')];
  if (includeProfileFlag) {
    args.push('--profile', 'custom');
  }
  return { command: 'openspec', args };
}

const ALL_WORKFLOWS_CONFIG =
  JSON.stringify(
    {
      featureFlags: {},
      profile: 'custom',
      delivery: 'both',
      workflows: [...ALL_OPENSPEC_WORKFLOWS],
    },
    null,
    2,
  ) + '\n';

function getOpenSpecDefaultConfigDir(): string {
  const platform = os.platform();
  if (platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      return path.join(appData, 'openspec');
    }
    return path.join(os.homedir(), 'AppData', 'Roaming', 'openspec');
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, 'openspec');
  }
  return path.join(os.homedir(), '.config', 'openspec');
}

function getOpenSpecDefaultConfigPath(): string {
  return path.join(getOpenSpecDefaultConfigDir(), 'config.json');
}

function createOpenSpecAllWorkflowsEnv(): { env: NodeJS.ProcessEnv; configHome: string } {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'polaris-openspec-profile-'));
  try {
    const openspecConfigDir = path.join(configHome, 'openspec');
    fs.mkdirSync(openspecConfigDir, { recursive: true });
    fs.writeFileSync(path.join(openspecConfigDir, 'config.json'), ALL_WORKFLOWS_CONFIG, 'utf-8');

    return {
      configHome,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: configHome,
      },
    };
  } catch (error) {
    fs.rmSync(configHome, { recursive: true, force: true });
    throw error;
  }
}

interface ConfigBackup {
  configPath: string;
  backupPath: string;
  hadExisting: boolean;
}

function writeAllWorkflowsToDefaultConfig(): ConfigBackup | null {
  const configPath = getOpenSpecDefaultConfigPath();
  const backupPath = configPath + '.polaris-backup';
  let hadExisting = false;

  try {
    hadExisting = fs.existsSync(configPath);
    if (hadExisting) {
      fs.copyFileSync(configPath, backupPath);
    }

    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, ALL_WORKFLOWS_CONFIG, 'utf-8');

    return { configPath, backupPath, hadExisting };
  } catch {
    if (hadExisting) {
      try {
        fs.unlinkSync(backupPath);
      } catch {
        // Best-effort cleanup
      }
    }
    return null;
  }
}

function restoreDefaultConfig(backup: ConfigBackup | null): void {
  if (!backup) return;
  try {
    if (backup.hadExisting) {
      fs.copyFileSync(backup.backupPath, backup.configPath);
      fs.unlinkSync(backup.backupPath);
    } else {
      if (fs.existsSync(backup.configPath)) {
        fs.unlinkSync(backup.configPath);
      }
    }
  } catch {
    // Best-effort restore
  }
}

function isCommandAvailable(command: string): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [command], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function buildOpenSpecCliInstallArgs(): string[] {
  // CLI 工具始终全局安装，避免在目标项目目录产生 node_modules
  return ['install', '-g', '@fission-ai/openspec@latest'];
}

/** 清理旧版 init 在目标项目误装的本地 OpenSpec CLI 产物 */
async function cleanupLegacyLocalOpenSpecInstall(projectPath: string): Promise<void> {
  const openspecModulePath = path.join(projectPath, 'node_modules', '@fission-ai', 'openspec');
  if (!(await fileExists(openspecModulePath))) {
    return;
  }

  const packageJsonPath = path.join(projectPath, 'package.json');
  let shouldCleanup = false;

  if (!(await fileExists(packageJsonPath))) {
    shouldCleanup = true;
  } else {
    try {
      const pkg = await readJson<{ dependencies?: Record<string, string> }>(packageJsonPath);
      const deps = Object.keys(pkg.dependencies ?? {});
      shouldCleanup = deps.length === 1 && deps[0] === '@fission-ai/openspec';
    } catch {
      return;
    }
  }

  if (!shouldCleanup) {
    return;
  }

  const pathsToRemove = [
    path.join(projectPath, 'node_modules'),
    path.join(projectPath, 'package-lock.json'),
    packageJsonPath,
  ];

  for (const target of pathsToRemove) {
    if (!(await fileExists(target))) continue;
    try {
      await rm(target, { recursive: true, force: true });
    } catch {
      // 尽力清理，失败不阻断 init
    }
  }
}

async function ensureOpenSpecCli(shouldInstall = true): Promise<'ready' | 'missing' | 'failed'> {
  const alreadyInstalled = isCommandAvailable('openspec');
  if (!shouldInstall) {
    return alreadyInstalled ? 'ready' : 'missing';
  }
  const label = alreadyInstalled ? 'Upgrading' : 'Installing';
  console.warn(`    ${label} OpenSpec CLI (global)...`);
  try {
    execFileSync(getNpmExecutable(), buildOpenSpecCliInstallArgs(), {
      stdio: 'inherit',
      timeout: 120_000,
      shell: process.platform === 'win32',
    });
    return isCommandAvailable('openspec') ? 'ready' : 'failed';
  } catch (error) {
    if (alreadyInstalled) {
      console.warn(
        `    OpenSpec upgrade failed, using existing version: ${(error as Error).message}`,
      );
      return 'ready';
    }
    console.error(`    Failed to install OpenSpec CLI: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return 'failed';
  }
}

async function installOpenSpec(
  projectPath: string,
  toolIds: string[],
  scope: InstallScope,
  shouldInstallCli = true,
): Promise<'installed' | 'failed' | 'skipped'> {
  await cleanupLegacyLocalOpenSpecInstall(projectPath);

  const cliStatus = await ensureOpenSpecCli(shouldInstallCli);
  if (cliStatus === 'failed') {
    console.error(
      `    OpenSpec CLI not available. Install manually: npm install -g @fission-ai/openspec@latest`,
    );
    return 'failed';
  }
  if (cliStatus === 'missing') {
    return 'skipped';
  }

  const unknownIds = toolIds.filter((id) => !VALID_TOOL_IDS.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown tool IDs: ${unknownIds.join(', ')}`);
  }

  let configHome: string | undefined;
  let configBackup: ConfigBackup | null = null;
  try {
    const openspecEnv = createOpenSpecAllWorkflowsEnv();
    configHome = openspecEnv.configHome;

    configBackup = writeAllWorkflowsToDefaultConfig();

    const invocation = buildOpenSpecInitInvocation(projectPath, toolIds, scope);
    try {
      execFileSync(invocation.command, invocation.args, {
        cwd: projectPath,
        env: openspecEnv.env,
        stdio: ['inherit', 'inherit', 'pipe'],
        timeout: 120_000,
        shell: process.platform === 'win32',
      });
    } catch (firstError) {
      const stderrText = (firstError as { stderr?: Buffer }).stderr?.toString() ?? '';
      if (stderrText.includes('unknown option') && stderrText.includes('--profile')) {
        console.warn('    OpenSpec does not support --profile flag, retrying without it...');
        const fallbackInvocation = buildOpenSpecInitInvocation(
          projectPath,
          toolIds,
          scope,
          os.homedir(),
          false,
        );
        execFileSync(fallbackInvocation.command, fallbackInvocation.args, {
          cwd: projectPath,
          env: openspecEnv.env,
          stdio: 'inherit',
          timeout: 120_000,
          shell: process.platform === 'win32',
        });
      } else {
        throw firstError;
      }
    }

    return 'installed';
  } catch (error) {
    console.error(`    OpenSpec init failed: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return 'failed';
  } finally {
    restoreDefaultConfig(configBackup);
    if (configHome) {
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  }
}

export {
  installOpenSpec,
  isCommandAvailable,
  buildOpenSpecInitInvocation,
  buildOpenSpecCliInstallArgs,
  getNpmExecutable,
};
