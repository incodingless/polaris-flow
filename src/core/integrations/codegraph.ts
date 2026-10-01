import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { isCommandAvailable, getNpmExecutable } from './openspec.js';
import { printCommandErrorDetails } from '../command-error.js';

import type { InstallScope } from '../config/polaris-project-config.js';

function getPnpmExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function hasCodegraphProjectIndex(projectPath: string): boolean {
  const codegraphDir = path.join(projectPath, '.codegraph');
  try {
    if (!fs.statSync(codegraphDir).isDirectory()) return false;
    return fs.readdirSync(codegraphDir).some((entry) => entry !== '.gitignore');
  } catch {
    return false;
  }
}

function resolvePnpmGlobalCommand(command: string): string | null {
  try {
    const binDir = execFileSync(getPnpmExecutable(), ['bin', '-g'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
      shell: process.platform === 'win32',
    }).trim();
    if (!binDir) return null;

    const candidates =
      process.platform === 'win32'
        ? [`${command}.cmd`, `${command}.exe`, `${command}.ps1`, command]
        : [command];

    for (const candidate of candidates) {
      const candidatePath = path.join(binDir, candidate);
      if (fs.existsSync(candidatePath)) return candidatePath;
    }
  } catch {
    // pnpm may not be installed or may not have a global bin configured.
  }

  return null;
}

function resolveCodegraphCommand(): string | null {
  if (isCommandAvailable('codegraph')) return 'codegraph';
  return resolvePnpmGlobalCommand('codegraph');
}

/**
 * 确保 CodeGraph CLI 可用。
 * @param upgrade 为 true 时即使已安装也执行一次全局升级（`polaris update` 用）
 */
async function ensureCodegraphCli(
  projectPath: string,
  shouldInstall = true,
  upgrade = false,
): Promise<string | null> {
  const existingCommand = resolveCodegraphCommand();
  if (existingCommand && !upgrade) return existingCommand;
  if (!shouldInstall) return existingCommand;

  console.log(`    ${existingCommand ? 'Upgrading' : 'Installing'} CodeGraph CLI...`);
  try {
    execFileSync(getNpmExecutable(), ['install', '-g', '@colbymchenry/codegraph@latest'], {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: 180_000,
      shell: process.platform === 'win32',
    });
    return resolveCodegraphCommand();
  } catch (error) {
    console.error(`    Failed to install CodeGraph CLI: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    // 升级失败时既有命令仍可用，不阻断后续步骤
    return existingCommand;
  }
}

/**
 * 安装 / 升级 CodeGraph 并按 scope 建索引。
 * @param upgradeCli 为 true 时只升级 CLI：已存在 `.codegraph` 索引则跳过重建（重建代价高）
 */
async function installCodegraph(
  projectPath: string,
  scope: InstallScope,
  shouldInstallCli = true,
  upgradeCli = false,
): Promise<'installed' | 'failed' | 'skipped'> {
  if (hasCodegraphProjectIndex(projectPath)) {
    console.log('    CodeGraph: existing .codegraph index detected');
    if (!upgradeCli) {
      return 'skipped';
    }
    const upgraded = await ensureCodegraphCli(projectPath, shouldInstallCli, true);
    return upgraded ? 'installed' : 'failed';
  }

  const codegraphCommand = await ensureCodegraphCli(projectPath, shouldInstallCli);
  if (!codegraphCommand) {
    if (!shouldInstallCli) {
      console.log('    CodeGraph CLI not installed, skipping setup');
      return 'skipped';
    }
    console.error(
      '    CodeGraph CLI not available. Install manually: npm install -g @colbymchenry/codegraph',
    );
    return 'failed';
  }

  try {
    console.log('    Running: codegraph install --yes');
    execFileSync(codegraphCommand, ['install', '--yes'], {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: 120_000,
      shell: process.platform === 'win32',
    });
  } catch (error) {
    console.error(`    CodeGraph install failed: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return 'failed';
  }

  if (scope === 'project') {
    try {
      console.log('    Running: codegraph init -i');
      execFileSync(codegraphCommand, ['init', '-i'], {
        cwd: projectPath,
        stdio: 'inherit',
        timeout: 300_000,
        shell: process.platform === 'win32',
      });
    } catch (error) {
      console.error(`    CodeGraph init failed: ${(error as Error).message}`);
      printCommandErrorDetails(error);
      return 'failed';
    }
  }

  return 'installed';
}

export { installCodegraph, hasCodegraphProjectIndex, resolveCodegraphCommand };
