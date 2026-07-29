/**
 * 将 agent 定义安装到平台 agents 目录。
 */
import path from 'path';

import { runCopyJobs, type CopyJob } from '../../utils/file-system.js';
import { Assets } from '../assets/manifest.js';

/**
 * 拷贝 assets/<lang>/agents/*.md 到 .<platform>/agents/。
 * 含 design-review-agent、plan-review-agent、openspec-review-agent 等。
 * @param agentsDir 代理目录
 * @param overwrite 是否覆盖
 * @param asset 资产
 * @returns 拷贝结果
 */
export async function copyPolarisAgents(
  agentsDir: string,
  overwrite: boolean,
  asset: Assets,
): Promise<{ copied: number; skipped: number }> {
  const agentDirs = asset.langDirAssets.filter((asset) => ['agents'].includes(asset.dir));

  const jobs: CopyJob[] = [];
  for (const agentDir of agentDirs) {
    for (const file of agentDir.files) {
      jobs.push({
        label: agentDir.dir,
        src: file.fullPath,
        dest: path.join(agentsDir, file.shortPath),
        type: 'file',
        overwrite: overwrite,
      });
    }
  }

  return runCopyJobs(jobs);
}
