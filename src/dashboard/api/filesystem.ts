import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, normalize } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getPolarisConfigPath } from '../../core/assets/polaris-paths.js';

const execFileAsync = promisify(execFile);

export interface DirEntry {
  name: string;
  path: string;
}

export function listDirs(parentPath: string): { dirs?: DirEntry[]; error?: string } {
  if (!parentPath || !parentPath.trim()) {
    return { error: '路径不能为空' };
  }
  if (parentPath.includes('..')) {
    return { error: '无效的路径' };
  }
  if (!existsSync(parentPath)) {
    return { error: `目录不存在: ${parentPath}` };
  }

  try {
    const entries = readdirSync(parentPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        path: join(parentPath, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { dirs };
  } catch {
    return { error: `无法读取目录: ${parentPath}` };
  }
}

/**
 * 判断目录是否已 `polaris init`。
 *
 * 判据是 `.polaris/config.yaml` 存在（走 `polaris-paths` 的路径助手，不自己拼路径）。
 * 旧实现名为 `checkOpenspec`、判的是 `<dir>/openspec` 子目录 —— 那是 openspec 时代的
 * 判据，与"能否作为工作台项目"无关。
 */
export function checkInitialized(targetPath: string): { exists: boolean; error?: string } {
  if (!targetPath || !targetPath.trim()) {
    return { exists: false, error: '路径不能为空' };
  }
  if (targetPath.includes('..')) {
    return { exists: false, error: '无效的路径' };
  }

  return { exists: existsSync(getPolarisConfigPath(targetPath)) };
}

/** 在系统文件管理器中打开目录或文件 */
export async function revealPath(
  targetPath: string,
  allowedRoots: string[] = [],
): Promise<{ ok?: boolean; error?: string }> {
  if (!targetPath || !targetPath.trim()) {
    return { error: '路径不能为空' };
  }
  if (targetPath.includes('..')) {
    return { error: '无效的路径' };
  }

  const absPath = normalize(resolve(targetPath));
  if (!existsSync(absPath)) {
    return { error: `路径不存在: ${absPath}` };
  }

  if (allowedRoots.length > 0) {
    const allowed = allowedRoots.some((root) => {
      const absRoot = normalize(resolve(root));
      return absPath === absRoot || absPath.startsWith(absRoot + '/');
    });
    if (!allowed) {
      return { error: '路径不在允许的项目目录内' };
    }
  }

  try {
    if (process.platform === 'darwin') {
      await execFileAsync('open', [absPath]);
    } else if (process.platform === 'win32') {
      await execFileAsync('explorer', [absPath]);
    } else {
      await execFileAsync('xdg-open', [absPath]);
    }
    return { ok: true };
  } catch (err) {
    return { error: `无法打开路径: ${(err as Error).message}` };
  }
}
