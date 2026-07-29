/**
 * 将 Polaris rule 文件安装到平台 rules 目录（md / mdc / copilot）。
 */
import path from 'path';

import { Assets } from '../assets/manifest.js';
import { type Platform } from '../platforms.js';
import { runCopyJobs, type CopyJob } from '../../utils/file-system.js';
import { Language } from '../config/polaris-project-config.js';
import { getAssetsDir } from '../assets/manifest.js';

/** 按平台 rulesFormat 拷贝 hard-stops 等规则文件 */
export async function copyPolarisRules(
  baseDir: string,
  overwrite: boolean,
  platform: Platform,
  language: Language,
  asset: Assets,
): Promise<{ copied: number; skipped: number }> {
  const ruleDirs = asset.langDirAssets.filter((asset) => asset.dir.startsWith('rules/'));
  const jobs: CopyJob[] = [];
  for (const ruleDir of ruleDirs) {
    for (const file of ruleDir.files) {
      jobs.push({
        label: ruleDir.dir,
        src: file.fullPath,
        dest: computeRuleDestPath(
          path.join(baseDir, ruleDir.dir, file.shortPath),
          platform.rulesFormat!,
        ),
        type: 'file',
        overwrite: overwrite,
      });
    }
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
