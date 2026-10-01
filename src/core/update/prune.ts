/**
 * 托管文件清理（`polaris update --prune`）。
 *
 * 增量拷贝只增不减：资产里被删除或改名的技能/命令会在目标目录永久残留
 * （安装器的覆盖策略只作用于「源清单里存在」的路径）。
 *
 * 清理边界刻意收窄到 **Polaris 独占整个命名空间** 的落盘区：
 * - skills：`<ctx>/skills/polaris`（nested 与 flat 都有的插件根）
 *           以及 flat 布局下每个 `polaris-<family>-<skill>/` 目录
 * - commands：nested → `<ctx>/commands/polaris`；flat → `<ctx>/commands/polaris-*.md`
 *
 * agents / rules / hooks 与用户自有内容共用目录（用户会在 `.claude/agents` 放自己的 agent、
 * 在 `.claude/rules` 放自己的规则），无法在不误删的前提下判定归属，因此**不参与清理**。
 */
import path from 'path';
import { readdir, rm } from 'fs/promises';

import { fileExists } from '../../utils/file-system.js';
import { POLARIS_PLUGIN_NAME } from '../config/polaris-constants.js';
import type { InstallScope } from '../config/polaris-project-config.js';
import { getCommandLayout, type Platform } from '../domain/platforms.js';
import { initializeProjectLayout } from '../install/layout.js';

/** 支持清理的资产类别 */
export type PrunableKind = 'skills' | 'commands';

/** 清理结果 */
export type PruneResult = {
  /** 被删除的绝对路径（文件或目录） */
  deleted: string[];
  /** 未执行清理时的原因 */
  reason?: string;
};

/** 统一为 posix 分隔符，便于跨平台比较 */
function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

/** 是否为 Polaris 托管的条目名（`polaris` 或 `polaris-*`） */
function isOwnedEntryName(name: string): boolean {
  return name === POLARIS_PLUGIN_NAME || name.startsWith(`${POLARIS_PLUGIN_NAME}-`);
}

/** 列目录；不存在或不可读时返回空数组 */
async function readDirSafe(dirPath: string): Promise<string[]> {
  if (!(await fileExists(dirPath))) return [];
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

/**
 * 递归清理 `root` 下不在 `expected` 中的文件，并移除因此变空的子目录。
 * `root` 自身即使变空也保留（安装器会重建，避免误删用户可能保留的插件根）。
 * @returns 被删除的绝对路径
 */
async function pruneTree(root: string, expected: Set<string>): Promise<string[]> {
  if (!(await fileExists(root))) return [];
  const deleted: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        const remaining = await readDirSafe(full);
        if (remaining.length === 0) {
          await rm(full, { recursive: true, force: true });
          deleted.push(full);
        }
        continue;
      }
      if (!expected.has(toPosix(full))) {
        await rm(full, { force: true });
        deleted.push(full);
      }
    }
  };

  await walk(root);
  return deleted;
}

/**
 * 清理某平台某类别下已不在当前资产清单中的托管文件。
 * @param expectedFiles 本次安装返回的落盘文件清单（绝对路径）
 */
export async function pruneOwnedFiles(options: {
  platform: Platform;
  scope: InstallScope;
  projectPath: string;
  kind: PrunableKind;
  expectedFiles: string[];
}): Promise<PruneResult> {
  const { platform, scope, projectPath, kind, expectedFiles } = options;
  const expected = new Set(expectedFiles.map(toPosix));
  const layout = await initializeProjectLayout(projectPath, scope, platform);

  if (kind === 'skills') {
    // 插件根（hooks / scripts / templates / adapters + nested 布局下的技能树）
    const deleted = await pruneTree(layout.skillsDir, expected);

    if (platform.skillsLayout === 'flat') {
      // flat 布局：每个叶技能是 <ctx>/skills/polaris-<family>-<skill>/
      const skillsRoot = path.join(layout.baseDir, platform.skillsDir);
      const skillsRootPosix = `${toPosix(skillsRoot)}/`;
      const expectedTopDirs = new Set(
        [...expected]
          .filter((file) => file.startsWith(skillsRootPosix))
          .map((file) => file.slice(skillsRootPosix.length).split('/')[0]),
      );

      for (const name of await readDirSafe(skillsRoot)) {
        if (!isOwnedEntryName(name)) continue;
        const dir = path.join(skillsRoot, name);
        if (dir === layout.skillsDir) continue;
        if (expectedTopDirs.has(name)) continue;
        await rm(dir, { recursive: true, force: true });
        deleted.push(dir);
      }
    }

    return { deleted };
  }

  if (getCommandLayout(platform) === 'flat') {
    const commandsRoot = path.join(layout.baseDir, platform.commandsDir);
    const deleted: string[] = [];
    for (const name of await readDirSafe(commandsRoot)) {
      if (!isOwnedEntryName(name) || !name.endsWith('.md')) continue;
      const file = path.join(commandsRoot, name);
      if (expected.has(toPosix(file))) continue;
      await rm(file, { force: true });
      deleted.push(file);
    }
    return { deleted };
  }

  // nested：commands/polaris 整棵子树归 Polaris 独占
  return { deleted: await pruneTree(layout.commandsDir, expected) };
}
