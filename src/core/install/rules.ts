/**
 * 将 Polaris rule 文件安装到平台 rules 目录（md / mdc / copilot）。
 */
import path from 'path';

import { Asset } from '../assets/manifest.js';
import { type Platform } from '../platforms.js';
import { runCopyJobs, type CopyJob } from '../../utils/file-system.js';
import { Language } from '../config/polaris-project-config.js';
import { getAssetsDir } from '../assets/polaris-paths.js';

/** 按平台 rulesFormat 拷贝 hard-stops 等规则文件 */
export async function copyPolarisRules(
  baseDir: string,
  overwrite: boolean,
  platform: Platform,
  language: Language,
  asset: Asset,
): Promise<{ copied: number; skipped: number }> {
  const sources = asset.langContentPaths.filter((p) => p.startsWith('rules/'));
  const jobs: CopyJob[] = [];
  for (const source of sources) {
    jobs.push({
      label: source,
      src: path.join(getAssetsDir(), language, source),
      dest: computeRuleDestPath(
        path.join(baseDir, source.replace('rules/', '')),
        platform.rulesFormat!,
      ),
      type: 'file',
      overwrite: overwrite,
    });
  }
  return runCopyJobs(jobs);
}

/** 按规则格式计算目标文件名（mdc / 原名） */
export function computeRuleDestPath(ruleFilePath: string, rulesFormat: string): string {
  if (rulesFormat === 'mdc') {
    return ruleFilePath.replace(/\.md$/, '.mdc');
  }
  return ruleFilePath;
}
