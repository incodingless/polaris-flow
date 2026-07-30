/**
 * hooks 资产安装改写：`_polaris-cli.sh` 的 `@PLATFORM_ID@` 占位替换与可执行位。
 */
import { chmod, readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

import { fileExists } from '../../utils/file-system.js';

/** `_polaris-cli.sh` 中由安装期替换的平台占位符 */
export const PLATFORM_ID_PLACEHOLDER = '@PLATFORM_ID@';

/**
 * 将 hooks 目录下 `_polaris-cli.sh` 中的 `@PLATFORM_ID@` 替换为真实 platform id。
 * 无文件或无占位则跳过；Unix 下尽量 chmod 可执行。
 */
export async function rewritePolarisCliPlatformId(
  hooksDir: string,
  platformId: string,
): Promise<{ rewritten: boolean }> {
  const cliPath = path.join(hooksDir, '_polaris-cli.sh');
  if (!(await fileExists(cliPath))) {
    return { rewritten: false };
  }

  const original = await readFile(cliPath, 'utf-8');
  if (!original.includes(PLATFORM_ID_PLACEHOLDER)) {
    await ensureHookScriptsExecutable(hooksDir);
    return { rewritten: false };
  }

  const next = original.split(PLATFORM_ID_PLACEHOLDER).join(platformId);
  await writeFile(cliPath, next, 'utf-8');
  await ensureHookScriptsExecutable(hooksDir);
  return { rewritten: true };
}

/**
 * 尽量为 hooks 目录下 `*.sh` 设置可执行位（Windows 上可能无效，忽略错误）。
 */
async function ensureHookScriptsExecutable(hooksDir: string): Promise<void> {
  if (!(await fileExists(hooksDir))) {
    return;
  }
  try {
    const entries = await readdir(hooksDir);
    for (const name of entries) {
      if (!name.endsWith('.sh')) continue;
      try {
        await chmod(path.join(hooksDir, name), 0o755);
      } catch {
        // 非 Unix 或无权限时忽略
      }
    }
  } catch {
    // 列目录失败则忽略
  }
}
