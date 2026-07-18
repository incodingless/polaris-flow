/**
 * 将 Polaris rule 文件安装到平台 rules 目录（md / mdc / copilot）。
 */
import path from 'path';
import { readFile, writeFile } from 'fs/promises';

import { fileExists, ensureDir } from '../../utils/file-system.js';
import { readManifest, resolveAssetSourcePath } from '../assets/manifest.js';
import { getAssetsDir } from '../assets/paths.js';
import { getPlatformSkillsDir, type Platform } from '../platform/platforms.js';
import type { InstallScope, Language } from '../types.js';
import { runCopyJobs, type CopyJob } from './copy-jobs.js';

/** 按平台 rulesFormat 拷贝 hard-stops 等规则文件 */
export async function copyPolarisRulesForPlatform(
  baseDir: string,
  platform: Platform,
  overwrite: boolean,
  scope: InstallScope = 'project',
  lang: Language = 'zh',
): Promise<{ copied: number; skipped: number }> {
  if (!platform.rulesDir || !platform.rulesFormat) {
    return { copied: 0, skipped: 0 };
  }

  const manifest = await readManifest(lang);
  const rulePaths = manifest.rules;
  if (!rulePaths || rulePaths.length === 0) {
    return { copied: 0, skipped: 0 };
  }

  const assetsDir = getAssetsDir();
  const rulesBase =
    platform.rulesBaseDir !== undefined
      ? platform.rulesBaseDir === ''
        ? baseDir
        : path.join(baseDir, platform.rulesBaseDir)
      : path.join(baseDir, getPlatformSkillsDir(platform, scope));

  const jobs: CopyJob[] = [];
  for (const ruleRelPath of rulePaths) {
    const src =
      (await resolveAssetSourcePath(assetsDir, lang, ruleRelPath)) ??
      path.join(assetsDir, 'skills', ruleRelPath);
    if (!(await fileExists(src))) {
      console.error(`    Rule source not found: ${ruleRelPath}`);
      continue;
    }

    const ruleFileName = path.basename(ruleRelPath);
    const rulesDestDir = path.join(rulesBase, platform.rulesDir);
    const dest = computeRuleDestPath(rulesDestDir, ruleFileName, platform.rulesFormat);
    jobs.push({
      label: ruleRelPath,
      dest,
      write: async () => {
        const content = await readFile(src, 'utf-8');
        await ensureDir(path.dirname(dest));
        const formatted = formatRuleContent(content, ruleFileName, platform.rulesFormat!);
        await writeFile(dest, formatted, 'utf-8');
      },
    });
  }

  return runCopyJobs(jobs, overwrite);
}

/** 按规则格式计算目标文件名（mdc / instructions.md / 原名） */
export function computeRuleDestPath(
  rulesDestDir: string,
  ruleFileName: string,
  rulesFormat: string,
): string {
  if (rulesFormat === 'mdc') {
    return path.join(rulesDestDir, ruleFileName.replace(/\.md$/, '.mdc'));
  }
  if (rulesFormat === 'copilot') {
    return path.join(rulesDestDir, ruleFileName.replace(/\.md$/, '.instructions.md'));
  }
  return path.join(rulesDestDir, ruleFileName);
}

function formatRuleContent(content: string, ruleFileName: string, rulesFormat: string): string {
  if (rulesFormat === 'mdc') {
    return `---
description: ${ruleFileName.replace(/\.md$/, '').replace(/-/g, ' ')}
globs:
alwaysApply: true
---

${content}`;
  }
  if (rulesFormat === 'copilot') {
    return `---
applyTo: "**"
---

${content}`;
  }
  return content;
}
