import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getNpmExecutable } from './openspec.js';
import { resolveCliExecutable, resolveCliInstallTarget } from '../deps/npm.js';
import { printCommandErrorDetails } from '../command-error.js';
import { getCodegraphSource } from '../assets/sources.js';
import { resolveInstallChannelConfig } from '../install/channels.js';
import {
  buildNpmGlobalInstallArgs,
  installCliFromGitRepo,
  installCliFromLocalDir,
} from '../install/cli-installer.js';

import type { InstallScope } from '../config/polaris-project-config.js';

/** CodeGraph CLI 的 npm 包名 */
export const CODEGRAPH_PACKAGE = '@colbymchenry/codegraph';

function hasCodegraphProjectIndex(projectPath: string): boolean {
  const codegraphDir = path.join(projectPath, '.codegraph');
  try {
    if (!fs.statSync(codegraphDir).isDirectory()) return false;
    return fs.readdirSync(codegraphDir).some((entry) => entry !== '.gitignore');
  } catch {
    return false;
  }
}

/**
 * 解析 codegraph 可执行文件：PATH → 用户级 `~/.polaris/cli/bin` → pnpm 全局 bin。
 * 返回绝对路径优先（用户级安装不在 PATH 上也能直接执行）。
 */
function resolveCodegraphCommand(): string | null {
  return resolveCliExecutable('codegraph');
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

  // 全局目录不可写时改装到用户目录，不要求 sudo（sudo 装出来的文件属主是 root）
  const target = resolveCliInstallTarget();
  if (!existingCommand && target.kind === 'user') {
    console.warn(`    ↳ 全局目录不可写，改装用户目录: ${target.prefix}/bin`);
  }

  const source = getCodegraphSource();
  const channel = await resolveInstallChannelConfig();

  // --- 1. npm 通道 ---
  try {
    execFileSync(
      getNpmExecutable(),
      buildNpmGlobalInstallArgs(`${CODEGRAPH_PACKAGE}@latest`, channel.npmRegistry, target.prefix),
      {
        cwd: projectPath,
        stdio: 'inherit',
        timeout: 180_000,
        shell: process.platform === 'win32',
      },
    );
    const resolved = resolveCodegraphCommand();
    if (resolved) return resolved;
  } catch (error) {
    console.error(`    Failed to install CodeGraph CLI via npm: ${(error as Error).message}`);
    printCommandErrorDetails(error);
  }

  // --- 2. git 镜像通道 ---
  if (source.repo) {
    console.warn(`    ↳ git 镜像通道: ${source.repo} ...`);
    const ok = await installCliFromGitRepo(
      source.repo,
      source.minVersion,
      channel.githubMirror,
      channel.npmRegistry,
      target.prefix,
    );
    if (ok) {
      const resolved = resolveCodegraphCommand();
      if (resolved) return resolved;
    }
  }

  // --- 3. 本地目录通道 ---
  const localPath = channel.localPaths.codegraph;
  if (localPath) {
    if (!fs.existsSync(localPath)) {
      console.warn(`    ↳ 本地目录不存在: ${localPath}`);
    } else {
      console.warn(`    ↳ 本地目录通道: ${localPath} ...`);
      const ok = installCliFromLocalDir(localPath, channel.npmRegistry, target.prefix);
      if (ok) {
        const resolved = resolveCodegraphCommand();
        if (resolved) return resolved;
      }
    }
  }

  // 升级失败时既有命令仍可用，不阻断后续步骤
  return existingCommand;
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
      `    CodeGraph CLI not available. Install manually: npm install -g ${CODEGRAPH_PACKAGE}`,
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
