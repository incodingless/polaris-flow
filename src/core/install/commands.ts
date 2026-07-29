/**
 * 平台 slash command 安装：经 command-adapters 写入各宿主命令路径。
 * installSource（外部源复用）在 source-installer.ts。
 */
import path from 'path';

import { type Platform } from '../platforms.js';
import { runCopyJobs, type CopyJob } from '../../utils/file-system.js';
import { Assets } from '../assets/manifest.js';
import { getAssetsDir } from '../assets/manifest.js';
import { Language } from '../config/polaris-project-config.js';

/** 安装 Polaris bundled 命令（读取 assets 内 commands/） */

/**
 * 安装 commands 到指定平台
 * @param commandsDir 命令目录
 * @param platform 平台
 * @param overwrite 是否覆盖
 * @param asset 资产
 * @returns 拷贝结果
 */
export async function installPolarisCommandsForPlatform(
  commandsDir: string,
  overwrite: boolean,
  asset: Assets,
): Promise<{ copied: number; skipped: number }> {
  const commandDirs = asset.langDirAssets.filter((asset) => ['commands'].includes(asset.dir));
  const jobs: CopyJob[] = [];
  for (const commandDir of commandDirs) {
    for (const file of commandDir.files) {
      jobs.push({
        label: commandDir.dir,
        src: file.fullPath,
        dest: path.join(commandsDir, file.shortPath),
        type: 'file',
        overwrite: overwrite,
      });
    }
  }
  return runCopyJobs(jobs);
}
