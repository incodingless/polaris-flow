/**
 * OpenSpec CLI 安装与 init 调用封装。
 * 负责全局 npm 安装、旧本地安装清理及按平台执行 openspec init。
 * `--tools` 使用 openspecToolId；落盘目标以 Platform.contextDir / skillsDir / commandsDir 为准。
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import { rm, readdir, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { PLATFORMS, type Platform, getPlatformContextDir } from '../domain/platforms.js';
import { printCommandErrorDetails } from '../command-error.js';
import { copyDirContents, copyFile, ensureDir, fileExists } from '../../utils/file-system.js';
import { readJsonObjectOrEmpty } from '../../utils/json-io.js';
import {
  getNodeToolExecutable,
  resolveCliExecutable,
  resolveCliInstallTarget,
} from '../deps/npm.js';
import { getBaseDir } from './detect.js';
import { getOpenspecSource } from '../assets/sources.js';
import { resolveInstallChannelConfig } from '../install/channels.js';
import {
  buildNpmGlobalInstallArgs,
  installCliFromGitRepo,
  installCliFromLocalDir,
} from '../install/cli-installer.js';

import type { InstallScope } from '../config/polaris-project-config.js';

/** OpenSpec CLI 认可的 tool id 集合 */
const VALID_TOOL_IDS = new Set(PLATFORMS.map((p) => p.openspecToolId));

/**
 * OpenSpec AI_TOOLS 中 toolId → 原生 context 目录（与 polaris `contextDir` 可能不同，如 trae vs trae-cn）。
 */
const OPENSPEC_NATIVE_CONTEXT_DIR: Record<string, string> = {
  claude: '.claude',
  cursor: '.cursor',
  trae: '.trae',
};

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

/** 返回 OpenSpec CLI 对某 toolId 写入的原生 context 目录（如 trae → `.trae`） */
function getOpenSpecNativeContextDir(toolId: string): string {
  return OPENSPEC_NATIVE_CONTEXT_DIR[toolId] ?? `.${toolId}`;
}

/**
 * 构造 `openspec init` 调用参数。
 * `toolIds` 仅为 CLI `--tools` 值，不决定 polaris 平台落盘目录。
 */
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
  // 用解析出的绝对路径：用户级安装的 openspec 不在 PATH 上
  return { command: resolveCliExecutable('openspec') ?? 'openspec', args };
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

/**
 * 判断命令是否可用：PATH 之外还查用户级 `~/.polaris/cli/bin` 与 pnpm 全局 bin。
 * 用户级目录不在 PATH 上也算可用 —— 调用方拿 `resolveCliExecutable` 的绝对路径执行。
 */
function isCommandAvailable(command: string): boolean {
  return resolveCliExecutable(command) !== null;
}

function buildOpenSpecCliInstallArgs(registry?: string, prefix?: string): string[] {
  // CLI 工具始终全局安装，避免在目标项目目录产生 node_modules；
  // 全局目录不可写时 prefix 指向 ~/.polaris/cli（用户级安装）
  return buildNpmGlobalInstallArgs('@fission-ai/openspec@latest', registry, prefix);
}

/** 清理旧版 init 在目标项目误装的本地 OpenSpec CLI 产物 */
async function cleanupLegacyLocalOpenSpecInstall(projectPath: string): Promise<void> {
  const openspecModulePath = path.join(projectPath, 'node_modules', '@fission-ai', 'openspec');
  if (!(await fileExists(openspecModulePath))) {
    return;
  }

  const packageJsonPath = path.join(projectPath, 'package.json');
  let shouldCleanup: boolean;

  if (!(await fileExists(packageJsonPath))) {
    shouldCleanup = true;
  } else {
    try {
      const pkg = await readJsonObjectOrEmpty(packageJsonPath);
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

  // 全局目录不可写时改装到用户目录，不要求 sudo（sudo 装出来的文件属主是 root）
  const target = resolveCliInstallTarget();
  if (target.kind === 'user') {
    console.warn(`    ↳ 全局目录不可写，改装用户目录: ${target.prefix}/bin`);
  }

  const source = getOpenspecSource();
  const channel = await resolveInstallChannelConfig();

  // --- 1. npm 通道 ---
  try {
    execFileSync(
      getNpmExecutable(),
      buildOpenSpecCliInstallArgs(channel.npmRegistry, target.prefix),
      {
        stdio: 'inherit',
        timeout: 120_000,
        shell: process.platform === 'win32',
      },
    );
    if (isCommandAvailable('openspec')) {
      return 'ready';
    }
  } catch (error) {
    console.warn(`    OpenSpec npm 安装失败，回退 git 镜像通道...`);
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
    if (ok && isCommandAvailable('openspec')) {
      return 'ready';
    }
  }

  // --- 3. 本地目录通道 ---
  const localPath = channel.localPaths.openspec;
  if (localPath) {
    if (!(await fileExists(localPath))) {
      console.warn(`    ↳ 本地目录不存在: ${localPath}`);
    } else {
      console.warn(`    ↳ 本地目录通道: ${localPath} ...`);
      const ok = installCliFromLocalDir(localPath, channel.npmRegistry, target.prefix);
      if (ok && isCommandAvailable('openspec')) {
        return 'ready';
      }
    }
  }

  if (alreadyInstalled) {
    console.warn(`    OpenSpec upgrade failed, using existing version`);
    return 'ready';
  }
  console.error(`    Failed to install OpenSpec CLI`);
  return 'failed';
}

/** 判断是否为 OpenSpec 技能目录名 */
function isOpenSpecSkillName(name: string): boolean {
  return name.startsWith('openspec-');
}

/** 判断是否为 OpenSpec 命令文件/目录名（含 Trae `opsx-*`） */
function isOpenSpecCommandName(name: string): boolean {
  return name.startsWith('openspec') || name.startsWith('opsx-');
}

/**
 * 将 srcDir 下匹配条目拷到 destDir（目录递归、文件覆盖）。
 */
async function copyMatchingEntries(
  srcDir: string,
  destDir: string,
  match: (name: string) => boolean,
): Promise<void> {
  if (!(await fileExists(srcDir))) {
    return;
  }
  await ensureDir(destDir);
  const entries = await readdir(srcDir);
  for (const name of entries) {
    if (!match(name)) continue;
    const srcPath = path.join(srcDir, name);
    const destPath = path.join(destDir, name);
    const st = await stat(srcPath);
    if (st.isDirectory()) {
      await copyDirContents(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * 删除 srcDir 下匹配的 OpenSpec 产物（仅中间目录清理用）。
 */
async function removeMatchingEntries(
  srcDir: string,
  match: (name: string) => boolean,
): Promise<void> {
  if (!(await fileExists(srcDir))) {
    return;
  }
  const entries = await readdir(srcDir);
  for (const name of entries) {
    if (!match(name)) continue;
    await rm(path.join(srcDir, name), { recursive: true, force: true });
  }
}

/**
 * OpenSpec CLI 写入原生目录后，按 Platform.contextDir / skillsDir / commandsDir 迁入目标平台目录。
 * 若某原生目录没有任何选中平台以其为最终 contextDir，则清理其中的 OpenSpec 产物，避免残留错误路径。
 */
async function relocateOpenSpecToPlatformDirs(
  baseDir: string,
  platforms: Platform[],
  scope: InstallScope,
): Promise<void> {
  const finalContextDirs = new Set(
    platforms.map((p) => path.resolve(getPlatformContextDir(p, scope, baseDir))),
  );

  for (const platform of platforms) {
    const nativeRel = getOpenSpecNativeContextDir(platform.openspecToolId);
    const nativeRoot = path.join(baseDir, nativeRel);
    const targetRoot = getPlatformContextDir(platform, scope, baseDir);

    if (path.resolve(nativeRoot) === path.resolve(targetRoot)) {
      continue;
    }

    console.warn(
      `    ↳ 将 OpenSpec 产物从 ${nativeRel}/ 迁入 ${platform.contextDir}/（平台 ${platform.id}）`,
    );

    await copyMatchingEntries(
      path.join(nativeRoot, 'skills'),
      path.join(targetRoot, platform.skillsDir),
      isOpenSpecSkillName,
    );
    await copyMatchingEntries(
      path.join(nativeRoot, 'commands'),
      path.join(targetRoot, platform.commandsDir),
      isOpenSpecCommandName,
    );
  }

  const nativeRels = new Set(platforms.map((p) => getOpenSpecNativeContextDir(p.openspecToolId)));
  for (const nativeRel of nativeRels) {
    const nativeRoot = path.join(baseDir, nativeRel);
    if (finalContextDirs.has(path.resolve(nativeRoot))) {
      continue;
    }
    await removeMatchingEntries(path.join(nativeRoot, 'skills'), isOpenSpecSkillName);
    await removeMatchingEntries(path.join(nativeRoot, 'commands'), isOpenSpecCommandName);
  }
}

/**
 * 按 polaris 平台列表安装 OpenSpec：CLI 用 openspecToolId，落盘对齐 Platform 目录配置。
 */
async function installOpenSpec(
  projectPath: string,
  platforms: Platform[],
  scope: InstallScope,
  shouldInstallCli = true,
): Promise<'installed' | 'failed' | 'skipped'> {
  if (platforms.length === 0) {
    return 'skipped';
  }

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

  const toolIds = [...new Set(platforms.map((p) => p.openspecToolId).filter(Boolean))];
  const unknownIds = toolIds.filter((id) => !VALID_TOOL_IDS.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown OpenSpec tool IDs: ${unknownIds.join(', ')}`);
  }
  if (toolIds.length === 0) {
    return 'skipped';
  }

  const baseDir = getBaseDir(scope, projectPath);

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

    await relocateOpenSpecToPlatformDirs(baseDir, platforms, scope);

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
  getOpenSpecNativeContextDir,
  relocateOpenSpecToPlatformDirs,
};
