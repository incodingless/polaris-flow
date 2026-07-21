/**
 * 将 agent 定义安装到平台 agents 目录。
 */
import path from 'path';

import { fileExists, copyFile, readDir } from '../../utils/file-system.js';
import { resolveAgentInstallDest } from '../platform/layout.js';
import type { Platform } from '../platform/platforms.js';
import type { InstallScope, Language } from '../config/polaris-config.js';
import { runCopyJobs, type CopyJob } from './copy-jobs.js';

/**
 * 拷贝 assets/<lang>/agents/*.md 到 .<platform>/agents/。
 * 含 design-review-agent、plan-review-agent、openspec-review-agent 等。
 */
export async function copyPolarisAgentsForPlatform(
  assetsDir: string,
  baseDir: string,
  platform: Platform,
  lang: Language,
  overwrite: boolean,
  scope: InstallScope,
): Promise<{ copied: number; skipped: number }> {
  const agentSources: Array<{ srcRel: string; destName: string }> = [];

  const langAgentsDir = path.join(assetsDir, lang === 'zh' ? 'zh' : 'en', 'agents');
  if (await fileExists(langAgentsDir)) {
    try {
      const entries = await readDir(langAgentsDir);
      for (const entry of entries) {
        if (!entry.endsWith('.md')) {
          continue;
        }
        agentSources.push({
          srcRel: `agents/${entry}`,
          destName: entry,
        });
      }
    } catch {
      // 忽略无法读取的 agents 目录
    }
  }

  const jobs: CopyJob[] = [];
  for (const { srcRel, destName } of agentSources) {
    const src = path.join(assetsDir, lang === 'zh' ? 'zh' : 'en', srcRel);
    if (!(await fileExists(src))) {
      continue;
    }

    const destRel = resolveAgentInstallDest(destName, platform, scope);
    const dest = path.join(baseDir, destRel);
    jobs.push({
      label: srcRel,
      dest,
      write: () => copyFile(src, dest),
    });
  }

  return runCopyJobs(jobs, overwrite);
}
