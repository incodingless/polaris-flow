/**
 * 平台 slash command 安装：经 command-adapters 写入各宿主命令路径。
 * installSource（外部源复用）在 source-installer.ts。
 */
import path from 'path';

import { type Platform } from '../platforms.js';
import { runCopyJobs, type CopyJob } from '../../utils/file-system.js';
import { Asset } from '../assets/manifest.js';
import { getAssetsDir } from '../assets/polaris-paths.js';
import { Language } from '../config/polaris-project-config.js';

/** 安装 Polaris bundled 命令（读取 assets 内 commands/） */

/**
 * 安装 commands 到指定平台
 * @param baseDir 基础目录
 * @param platform 平台
 * @param overwrite 是否覆盖
 * @param scope 安装作用域
 * @param asset 资产
 * @returns
 */
export async function installPolarisCommandsForPlatform(
  baseDir: string,
  overwrite: boolean,
  language: Language,
  asset: Asset,
): Promise<{ copied: number; skipped: number }> {
  const sources = asset.langContentPaths.filter((p) => p.startsWith('commands/'));
  const jobs: CopyJob[] = [];
  for (const source of sources) {
    jobs.push({
      label: source,
      src: path.join(getAssetsDir(), language, source),
      dest: path.join(baseDir, source.replace('commands/', '')),
      type: 'file',
      overwrite: overwrite,
    });
  }
  return runCopyJobs(jobs);
}
