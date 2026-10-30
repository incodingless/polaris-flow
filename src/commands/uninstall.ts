/**
 * `polaris uninstall` 命令：从项目卸载 Polaris 组件。
 *
 * 卸载对象分三层（与 update 的 plan 对称）：
 * - assets（默认）：Polaris 自有资产 —— .polaris/、各平台 skills/polaris、
 *   commands/psfl、hooks 托管条目、.worktrees/
 * - deps：init 一并安装、且可精确识别的第三方组件（openspec / codegraph）的项目内落盘
 * - program：全局软件本体 —— ~/.polaris + npm 全局 polaris-flow / openspec / codegraph
 *
 * 边界沿用 core/update/prune.ts 的权威口径：Polaris 独占命名空间只有 skills 与 commands；
 * agents / rules 与用户自有内容共用目录，不参与卸载（避免误删，结果里给提示）。
 * superpowers 是独立技能包、落盘无所有权标记，也不自动删（结果里给手动卸载指引）。
 *
 * 删除是破坏性操作：默认列出待删路径并要求交互确认；--yes 跳过、--dry-run 只看不删。
 */
import path from 'path';
import { execFileSync } from 'child_process';
import { rm } from 'fs/promises';

import { confirm } from '@inquirer/prompts';

import { fileExists, readDir } from '../utils/file-system.js';
import { detectPlatforms, hasSkills } from '../core/integrations/detect.js';
import {
  PLATFORMS,
  getPlatformContextDir,
  getCommandLayout,
  type Platform,
} from '../core/domain/platforms.js';
import { getPolarisDir, getPolarisHomeDir } from '../core/assets/polaris-paths.js';
import { resolveWorktreeRoot } from '../core/install/layout.js';
import { removePolarisHooksForPlatform } from '../core/install/hooks.js';
import { POLARIS_PLUGIN_NAME, POLARIS_COMMAND_PREFIX } from '../core/config/polaris-constants.js';
import { PACKAGE_NAME } from '../core/deps/version.js';
import { detectPackageManager, type PackageManager } from '../core/deps/self-update.js';
import { getNodeToolExecutable } from '../core/deps/npm.js';
import { CODEGRAPH_PACKAGE } from '../core/integrations/codegraph.js';
import { bold, dim, green, yellow, red, cyan } from '../utils/color.js';

const OPENSPEC_PACKAGE = '@fission-ai/openspec';

/** --keep-data 时保留的 .polaris 运行时数据子目录 */
const KEEP_DATA_SUBDIRS = ['tasks', 'testcases', 'sessions', 'archive', 'metrics'];

export type UninstallTarget = 'assets' | 'deps' | 'program';

export type UninstallOptions = {
  /** 卸载对象；逗号分隔已在命令行层拆分。缺省 assets */
  targets?: string[];
  /** 保留 .polaris 运行时数据（tasks/sessions/metrics/archive 等），只删配置与技能 */
  keepData?: boolean;
  /** 跳过交互确认直接删除 */
  yes?: boolean;
  /** 只列出将删除的路径，不实际删除 */
  dryRun?: boolean;
  json?: boolean;
};

/** 一条待删除的文件/目录 */
type RemovalItem = { kind: 'dir' | 'file'; path: string; label: string };

/** 卸载计划：目录/文件删除 + hooks 条目移除 + npm 卸载命令 */
type RemovalPlan = {
  items: RemovalItem[];
  /** 平台 id → 待移除的托管 hook 条目数（执行阶段移除） */
  hooksRemovals: { platform: Platform; removed: number }[];
  /** program 层的 npm 全局卸载命令 */
  npmUninstalls: { command: string; args: string[] }[];
};

export type UninstallResult = {
  projectPath: string;
  targets: UninstallTarget[];
  dryRun: boolean;
  removed: string[];
  keptData: string[];
  removedHooks: number;
  npmUninstalled: string[];
  nothingToRemove: boolean;
};

/** 解析 --targets：'all' 展开为三层；空/非法回退 assets */
export function resolveUninstallTargets(raw: string[] | undefined): UninstallTarget[] {
  const requested = (raw ?? ['assets'])
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter(Boolean);

  const set = new Set<UninstallTarget>();
  for (const value of requested) {
    if (value === 'all') {
      set.add('assets');
      set.add('deps');
      set.add('program');
    } else if (value === 'assets' || value === 'deps' || value === 'program') {
      set.add(value);
    }
  }
  return set.size > 0 ? [...set] : ['assets'];
}

/** 列目录；不存在或不可读时返回空数组 */
async function readDirSafe(dirPath: string): Promise<string[]> {
  if (!(await fileExists(dirPath))) return [];
  try {
    return await readDir(dirPath);
  } catch {
    return [];
  }
}

/** 平台 skills 根（`<ctx>/skills`）—— project scope */
function platformSkillsRoot(platform: Platform, projectPath: string): string {
  return path.join(getPlatformContextDir(platform, 'project', projectPath), platform.skillsDir);
}

/** 平台命令根（`<ctx>/commands`）—— project scope */
function platformCommandsRoot(platform: Platform, projectPath: string): string {
  return path.join(getPlatformContextDir(platform, 'project', projectPath), platform.commandsDir);
}

/** 收集去重：同一路径只记一次 */
function pushItem(
  items: RemovalItem[],
  seen: Set<string>,
  kind: 'dir' | 'file',
  targetPath: string,
  label: string,
): void {
  if (seen.has(targetPath)) return;
  seen.add(targetPath);
  items.push({ kind, path: targetPath, label });
}

/** 已装 polaris 的平台（detected ∩ hasSkills('polaris')） */
async function findInstalledPlatforms(projectPath: string): Promise<Platform[]> {
  const detected = await detectPlatforms(projectPath);
  const installed: Platform[] = [];
  for (const platform of PLATFORMS) {
    if (!detected.has(platform.id)) continue;
    if (await hasSkills(platformSkillsRoot(platform, projectPath), 'polaris')) {
      installed.push(platform);
    }
  }
  return installed;
}

/** 构造 npm 全局卸载命令（按探测到的包管理器） */
function buildGlobalUninstallInvocation(
  packageManager: PackageManager,
  packageName: string,
): { command: string; args: string[] } {
  const onWindows = process.platform === 'win32';
  switch (packageManager) {
    case 'pnpm':
      return { command: onWindows ? 'pnpm.cmd' : 'pnpm', args: ['remove', '-g', packageName] };
    case 'yarn':
      return { command: onWindows ? 'yarn.cmd' : 'yarn', args: ['global', 'remove', packageName] };
    case 'bun':
      return { command: onWindows ? 'bun.exe' : 'bun', args: ['remove', '-g', packageName] };
    default:
      return { command: getNodeToolExecutable('npm'), args: ['uninstall', '-g', packageName] };
  }
}

/** program 层：卸载软件本体与伴生 CLI（dry-run 时只打印不执行） */
function buildProgramUninstalls(): { command: string; args: string[] }[] {
  const pm = detectPackageManager();
  return [
    buildGlobalUninstallInvocation(pm, PACKAGE_NAME),
    buildGlobalUninstallInvocation(pm, OPENSPEC_PACKAGE),
    buildGlobalUninstallInvocation(pm, CODEGRAPH_PACKAGE),
  ];
}

/** 收集卸载计划（只读，不落盘、不删除） */
async function buildRemovalPlan(
  projectPath: string,
  targets: UninstallTarget[],
  keepData: boolean,
): Promise<RemovalPlan> {
  const items: RemovalItem[] = [];
  const seen = new Set<string>();
  const hooksRemovals: RemovalPlan['hooksRemovals'] = [];

  const platforms = await findInstalledPlatforms(projectPath);

  if (targets.includes('assets')) {
    // 1. .polaris/（Polaris 独占；--keep-data 时保留数据子目录）
    const polarisDir = getPolarisDir(projectPath);
    if (await fileExists(polarisDir)) {
      if (keepData) {
        for (const name of await readDirSafe(polarisDir)) {
          if (KEEP_DATA_SUBDIRS.includes(name)) continue;
          pushItem(items, seen, 'dir', path.join(polarisDir, name), '.polaris');
        }
      } else {
        pushItem(items, seen, 'dir', polarisDir, '.polaris');
      }
    }

    // 2. 各平台 skills / commands / hooks
    for (const platform of platforms) {
      const label = `${platform.name}`;

      // 插件根（nested 的 `<ctx>/skills/polaris`；flat 平台另有 `polaris-*`）
      pushItem(
        items,
        seen,
        'dir',
        path.join(platformSkillsRoot(platform, projectPath), POLARIS_PLUGIN_NAME),
        `${label} skills`,
      );
      if (platform.skillsLayout === 'flat') {
        const skillsRoot = platformSkillsRoot(platform, projectPath);
        for (const name of await readDirSafe(skillsRoot)) {
          if (name === POLARIS_PLUGIN_NAME) continue;
          if (name.startsWith(`${POLARIS_PLUGIN_NAME}-`)) {
            pushItem(items, seen, 'dir', path.join(skillsRoot, name), `${label} skills`);
          }
        }
      }

      // 命令：nested 整棵 psfl 命名空间；flat 逐个 psfl-*.md
      if (getCommandLayout(platform) === 'flat') {
        const commandsRoot = platformCommandsRoot(platform, projectPath);
        for (const name of await readDirSafe(commandsRoot)) {
          if (name.startsWith(`${POLARIS_COMMAND_PREFIX}-`) && name.endsWith('.md')) {
            pushItem(items, seen, 'file', path.join(commandsRoot, name), `${label} commands`);
          }
        }
      } else {
        pushItem(
          items,
          seen,
          'dir',
          path.join(platformCommandsRoot(platform, projectPath), POLARIS_COMMAND_PREFIX),
          `${label} commands`,
        );
      }

      // hooks：执行阶段移除托管条目（记平台即可）
      hooksRemovals.push({ platform, removed: 0 });
    }

    // 3. .worktrees/（project scope 的 worktree 根）
    const worktreeRoot = resolveWorktreeRoot(projectPath, 'project');
    if (await fileExists(worktreeRoot)) {
      pushItem(items, seen, 'dir', worktreeRoot, '.worktrees');
    }
  }

  if (targets.includes('deps')) {
    // openspec：项目根 openspec/ + 各平台 skills/openspec-* + commands/openspec*/opsx-*
    pushItem(items, seen, 'dir', path.join(projectPath, 'openspec'), 'openspec');
    pushItem(items, seen, 'dir', path.join(projectPath, '.codegraph'), 'codegraph');

    for (const platform of platforms) {
      const label = `${platform.name}`;
      const skillsRoot = platformSkillsRoot(platform, projectPath);
      for (const name of await readDirSafe(skillsRoot)) {
        if (name.startsWith('openspec-')) {
          pushItem(items, seen, 'dir', path.join(skillsRoot, name), 'openspec skills');
        } else if (name.startsWith('codegraph-')) {
          pushItem(items, seen, 'dir', path.join(skillsRoot, name), 'codegraph skills');
        }
      }

      const commandsRoot = platformCommandsRoot(platform, projectPath);
      for (const name of await readDirSafe(commandsRoot)) {
        if (name.startsWith('openspec') || name.startsWith('opsx-')) {
          pushItem(items, seen, 'dir', path.join(commandsRoot, name), `${label} openspec commands`);
        }
      }
    }
  }

  if (targets.includes('program')) {
    pushItem(items, seen, 'dir', getPolarisHomeDir(), '~/.polaris');
  }

  const npmUninstalls = targets.includes('program') ? buildProgramUninstalls() : [];

  return { items, hooksRemovals, npmUninstalls };
}

/** 执行目录/文件删除；失败逐项记录，不阻断 */
async function executeRemovals(items: RemovalItem[]): Promise<string[]> {
  const removed: string[] = [];
  for (const item of items) {
    try {
      await rm(item.path, { recursive: true, force: true });
      removed.push(item.path);
    } catch (err) {
      console.error(`    ${red('✗')} 删除失败 ${item.path}: ${(err as Error).message}`);
    }
  }
  return removed;
}

/** 打印待删清单（dry-run 与确认前共用） */
function printPlan(
  plan: RemovalPlan,
  projectPath: string,
  keepData: boolean,
  superpowersHint: boolean,
): void {
  console.log(`\n  ${bold('Polaris 卸载')}`);
  console.log(`  ${dim('项目')} ${bold(projectPath)}\n`);

  if (plan.items.length > 0) {
    console.log(`  ${bold('将删除')}：`);
    for (const item of plan.items) {
      console.log(`    ${yellow('•')} ${cyan(item.path)}  ${dim(`(${item.label})`)}`);
    }
  }

  if (plan.hooksRemovals.length > 0) {
    console.log(`\n  ${bold('将移除托管 hooks')}：`);
    for (const { platform } of plan.hooksRemovals) {
      console.log(`    ${yellow('•')} ${platform.name} 的 Polaris hook 条目`);
    }
  }

  if (plan.npmUninstalls.length > 0) {
    console.log(`\n  ${bold('将执行（卸载全局软件）')}：`);
    for (const { command, args } of plan.npmUninstalls) {
      console.log(`    ${yellow('•')} ${command} ${args.join(' ')}`);
    }
  }

  if (keepData) {
    console.log(
      `\n  ${dim('--keep-data：保留 .polaris 下的 tasks/testcases/sessions/archive/metrics')}`,
    );
  }

  console.log(`\n  ${dim('未删除：agents / rules 与用户自有内容共用目录，为避免误删不参与卸载')}`);
  if (superpowersHint) {
    console.log(
      `  ${dim('未删除：superpowers 是独立技能包，如需卸载请用 `npx skills remove obra/superpowers`')}`,
    );
  }
  console.log('');
}

export async function runUninstall(
  rawPath: string,
  options: UninstallOptions = {},
): Promise<UninstallResult> {
  const projectPath = path.resolve(rawPath || process.cwd());
  const targets = resolveUninstallTargets(options.targets);
  const keepData = Boolean(options.keepData);
  const dryRun = Boolean(options.dryRun);
  const json = Boolean(options.json);
  const log: (message: string) => void = json
    ? () => {}
    : (message: string) => console.log(message);

  const plan = await buildRemovalPlan(projectPath, targets, keepData);
  const nothingToRemove =
    plan.items.length === 0 && plan.hooksRemovals.length === 0 && plan.npmUninstalls.length === 0;

  // deps 层会卸载第三方，superpowers 属第三方但不自动删 → 提示手动
  const superpowersHint = targets.includes('deps');

  if (nothingToRemove) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            projectPath,
            targets,
            dryRun,
            removed: [],
            keptData: [],
            removedHooks: 0,
            npmUninstalled: [],
            nothingToRemove: true,
          } satisfies UninstallResult,
          null,
          2,
        ),
      );
      return {
        projectPath,
        targets,
        dryRun,
        removed: [],
        keptData: [],
        removedHooks: 0,
        npmUninstalled: [],
        nothingToRemove: true,
      };
    }
    log(
      `\n  ${yellow('未检测到可卸载的 Polaris 组件。')} ${dim('（先运行 polaris init 安装）')}\n`,
    );
    return {
      projectPath,
      targets,
      dryRun,
      removed: [],
      keptData: [],
      removedHooks: 0,
      npmUninstalled: [],
      nothingToRemove: true,
    };
  }

  if (!json) {
    printPlan(plan, projectPath, keepData, superpowersHint);
  }

  if (dryRun) {
    log(`  ${dim('--dry-run：未删除任何内容。')}\n`);
    if (json) {
      console.log(
        JSON.stringify(
          {
            projectPath,
            targets,
            dryRun: true,
            removed: [],
            keptData: [],
            removedHooks: 0,
            npmUninstalled: plan.npmUninstalls.map((c) => `${c.command} ${c.args.join(' ')}`),
            nothingToRemove: false,
          } satisfies UninstallResult,
          null,
          2,
        ),
      );
    }
    return {
      projectPath,
      targets,
      dryRun: true,
      removed: [],
      keptData: [],
      removedHooks: 0,
      npmUninstalled: [],
      nothingToRemove: false,
    };
  }

  if (!options.yes) {
    if (!process.stdin.isTTY) {
      console.error(`\n  ${red('非交互环境')}：请使用 --yes 或 --dry-run。\n`);
      process.exitCode = 1;
      return {
        projectPath,
        targets,
        dryRun,
        removed: [],
        keptData: [],
        removedHooks: 0,
        npmUninstalled: [],
        nothingToRemove: false,
      };
    }
    const answer = await confirm({ message: '确认删除以上内容？', default: false });
    if (!answer) {
      log(`\n  ${dim('已取消，未删除任何内容。')}\n`);
      return {
        projectPath,
        targets,
        dryRun,
        removed: [],
        keptData: [],
        removedHooks: 0,
        npmUninstalled: [],
        nothingToRemove: false,
      };
    }
  }

  // 执行删除
  const removed = await executeRemovals(plan.items);

  // 移除 hooks 托管条目
  let removedHooks = 0;
  for (const { platform } of plan.hooksRemovals) {
    const baseDir = getPlatformContextDir(platform, 'project', projectPath);
    const result = await removePolarisHooksForPlatform(baseDir, platform, 'project');
    removedHooks += result.removed;
  }

  // program 层：npm 全局卸载（失败不阻断，逐个报告）
  const npmUninstalled: string[] = [];
  for (const { command, args } of plan.npmUninstalls) {
    try {
      execFileSync(command, args, {
        stdio: json ? 'ignore' : 'inherit',
        shell: process.platform === 'win32',
      });
      npmUninstalled.push(`${command} ${args.join(' ')}`);
    } catch (err) {
      console.error(
        `    ${red('✗')} 卸载失败 ${command} ${args.join(' ')}: ${(err as Error).message}`,
      );
    }
  }

  const keptData = keepData
    ? KEEP_DATA_SUBDIRS.map((name) => path.join(projectPath, '.polaris', name))
    : [];

  const result: UninstallResult = {
    projectPath,
    targets,
    dryRun,
    removed,
    keptData,
    removedHooks,
    npmUninstalled,
    nothingToRemove: false,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  log(`\n  ${green('✓')} ${bold('卸载完成')}`);
  log(
    `    ${dim('删除')} ${removed.length} ${dim('项')}${removedHooks > 0 ? ` · ${dim('移除 hook 条目')} ${removedHooks} ${dim('条')}` : ''}`,
  );
  if (keptData.length > 0) {
    log(`    ${dim('保留数据')} ${keptData.map((p) => path.basename(p)).join(', ')}`);
  }
  log('');

  return result;
}

export async function uninstallCommand(
  projectPath: string,
  options: UninstallOptions = {},
): Promise<void> {
  await runUninstall(projectPath, options);
}
