/**
 * hooks/scripts 资产安装改写：`@PLATFORM_ID@` 占位替换与可执行位。
 * `_polaris-cli.sh`（scripts/ 下共用薄包装）与 `session-start.mjs`（hooks/ 下宿主入口）
 * 都含 `@PLATFORM_ID@`，安装期替换为真实平台 id。
 */
import { chmod, readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

import { fileExists } from '../../utils/file-system.js';

/** `_polaris-cli.sh` 中由安装期替换的平台占位符 */
export const PLATFORM_ID_PLACEHOLDER = '@PLATFORM_ID@';

/**
 * 将 `scripts/_polaris-cli.sh` 与 `hooks/session-start.mjs` 中的 `@PLATFORM_ID@` 替换为真实
 * platform id，并为 hooks/ 与 scripts/ 下 `*.sh` 设置可执行位。
 * 无文件或无占位则跳过 rewrite；Unix 下尽量 chmod。
 * @param pluginRoot 插件根（skills/polaris）
 * @param platformId 平台 id（claude / cursor / trae 等）
 */
export async function rewritePolarisCliPlatformId(
  pluginRoot: string,
  platformId: string,
): Promise<{ rewritten: boolean }> {
  const scriptsDir = path.join(pluginRoot, 'scripts');
  const hooksDir = path.join(pluginRoot, 'hooks');
  const targets = [
    path.join(scriptsDir, '_polaris-cli.sh'),
    path.join(hooksDir, 'session-start.mjs'),
  ];

  let rewritten = false;
  for (const target of targets) {
    if (!(await fileExists(target))) continue;
    const original = await readFile(target, 'utf-8');
    if (!original.includes(PLATFORM_ID_PLACEHOLDER)) continue;
    const next = original.split(PLATFORM_ID_PLACEHOLDER).join(platformId);
    await writeFile(target, next, 'utf-8');
    rewritten = true;
  }

  await ensureShScriptsExecutable(scriptsDir);
  await ensureShScriptsExecutable(hooksDir);
  return { rewritten };
}

/**
 * 尽量为目录下 `*.sh` 设置可执行位（Windows 上可能无效，忽略错误）。
 * @param dir 脚本目录
 */
async function ensureShScriptsExecutable(dir: string): Promise<void> {
  if (!(await fileExists(dir))) {
    return;
  }
  try {
    const entries = await readdir(dir);
    for (const name of entries) {
      if (!name.endsWith('.sh')) continue;
      try {
        await chmod(path.join(dir, name), 0o755);
      } catch {
        // 非 Unix 或无权限时忽略
      }
    }
  } catch {
    // 列目录失败则忽略
  }
}
