import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, normalize, sep } from 'node:path';
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

/**
 * 判定绝对路径是否落在允许的项目根之内。
 *
 * 纯函数（不碰文件系统），便于穷尽单测。放在这里而不是内联，是因为它**是 `reveal`
 * 的唯一安全边界** —— 内联时无法对「空白名单」「前缀相同但不是子目录」这类边界写断言。
 *
 * 注意用 `sep` 而不是硬编码 `'/'`：Windows 上 `normalize()` 产出反斜杠，
 * 用 `'/'` 拼接会让 `/a/bc` 被误判为 `/a/b` 的子路径，也会让合法子路径被误拒。
 */
export function isWithinAllowedRoots(absPath: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((root) => {
    if (!root || !root.trim()) return false;
    const absRoot = normalize(resolve(root));
    return absPath === absRoot || absPath.startsWith(absRoot + sep);
  });
}

/**
 * 在系统文件管理器中打开目录或文件。
 *
 * **fail-closed**：`allowedRoots` 为空即拒绝。旧实现是 `if (allowedRoots.length > 0)`
 * 才校验 —— 传空数组等于放行任意路径（fail-open）。当下路由层总是传非空白名单，
 * 所以那条放行分支不可达；但「安全边界依赖调用方守约」是纸糊的，调用方一旦漏传
 * 就是任意路径可达。边界应由被调用方自己守住。
 */
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
  if (!Array.isArray(allowedRoots) || allowedRoots.filter((r) => r && r.trim()).length === 0) {
    return { error: '缺少允许的项目根白名单' };
  }

  const absPath = normalize(resolve(targetPath));

  // 先判授权、再判存在：反过来会先泄漏「该路径是否存在」，且对白名单外路径
  // 给出两种不同错误，等于把授权边界暴露给探测者。
  if (!isWithinAllowedRoots(absPath, allowedRoots)) {
    return { error: '路径不在允许的项目目录内' };
  }

  if (!existsSync(absPath)) {
    return { error: `路径不存在: ${absPath}` };
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
