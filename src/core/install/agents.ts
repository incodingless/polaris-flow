/**
 * 将 agent 定义安装到平台 agents 目录。
 */
import path from 'path';

import { fileExists, copyFile, readDir } from '../../utils/file-system.js';
import { resolveAssetSourcePath } from '../assets/manifest.js';
import { resolveAgentInstallDest } from '../platform/layout.js';
import type { Platform } from '../platform/platforms.js';
import type { InstallScope, Language } from '../types.js';
import { runCopyJobs, type CopyJob } from './copy-jobs.js';

/** 拷贝 cross-review-agent 等定义到 .<platform>/agents/ */
export async function copyPolarisAgentsForPlatform(
  assetsDir: string,
  baseDir: string,
  platform: Platform,
  lang: Language,
  overwrite: boolean,
  scope: InstallScope,
): Promise<{ copied: number; skipped: number }> {
  const agentSources: Array<{ srcRel: string; destName: string }> = [
    {
      srcRel: 'skills/plan-review/agents/cross-review-agent.md',
      destName: 'cross-review-agent.md',
    },
  ];

  const langAgentsDir = path.join(assetsDir, lang === 'zh' ? 'zh' : 'en', 'agents');
  if (await fileExists(langAgentsDir)) {
    try {
      const entries = await readDir(langAgentsDir);
      for (const entry of entries) {
        agentSources.push({
          srcRel: `agents/${entry}`,
          destName: entry.endsWith('.md') ? entry : `${entry}.md`,
        });
      }
    } catch {
      // 忽略无法读取的 agents 目录
    }
  }

  const jobs: CopyJob[] = [];
  for (const { srcRel, destName } of agentSources) {
    const src = srcRel.startsWith('agents/')
      ? path.join(assetsDir, lang === 'zh' ? 'zh' : 'en', srcRel)
      : await resolveAssetSourcePath(assetsDir, lang, srcRel);
    if (!src || !(await fileExists(src))) {
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
