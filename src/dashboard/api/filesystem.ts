import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, normalize } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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

export function checkOpenspec(parentPath: string): { exists: boolean; error?: string } {
  if (!parentPath || !parentPath.trim()) {
    return { exists: false, error: '路径不能为空' };
  }
  if (parentPath.includes('..')) {
    return { exists: false, error: '无效的路径' };
  }

  const openspecDir = join(parentPath, 'openspec');
  return { exists: existsSync(openspecDir) };
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
