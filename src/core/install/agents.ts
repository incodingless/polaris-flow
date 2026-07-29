/**
 * 将 agent 定义安装到平台 agents 目录。
 */
import path from 'path';

import { runCopyJobs, type CopyJob } from '../../utils/file-system.js';
import { Asset } from '../assets/manifest.js';
import { Language } from '../config/polaris-project-config.js';
import { getAssetsDir } from '../assets/polaris-paths.js';

/**
 * 拷贝 assets/<lang>/agents/*.md 到 .<platform>/agents/。
 * 含 design-review-agent、plan-review-agent、openspec-review-agent 等。
 */
export async function copyPolarisAgents(
  baseDir: string,
  overwrite: boolean,
  language: Language,
  asset: Asset,
): Promise<{ copied: number; skipped: number }> {
  const sources = asset.langContentPaths.filter((p) => p.startsWith('agents/'));

  const jobs: CopyJob[] = [];
  for (const source of sources) {
    jobs.push({
      label: source,
      src: path.join(getAssetsDir(), language, source),
      dest: path.join(baseDir, source.replace('agents/', '')),
      type: 'file',
      overwrite: overwrite,
    });
  }

  return runCopyJobs(jobs);
}
