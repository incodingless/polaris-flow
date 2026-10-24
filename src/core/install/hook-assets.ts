/**
 * hooks/scripts 资产安装改写：`@PLATFORM_ID@` 占位替换。
 * `_polaris-cli.mjs`（scripts/ 下共用薄包装）与 `session-start.mjs`（hooks/ 下宿主入口）
 * 都含 `@PLATFORM_ID@`，安装期替换为真实平台 id。
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

import { fileExists } from '../../utils/file-system.js';

/** `_polaris-cli.mjs` 中由安装期替换的平台占位符 */
export const PLATFORM_ID_PLACEHOLDER = '@PLATFORM_ID@';

/**
 * 将 `scripts/_polaris-cli.mjs` 与 `hooks/session-start.mjs` 中的 `@PLATFORM_ID@` 替换为真实
 * platform id。无文件或无占位则跳过 rewrite。
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
    path.join(scriptsDir, '_polaris-cli.mjs'),
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

  return { rewritten };
}
