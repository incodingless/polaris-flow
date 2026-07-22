/**
 * 拷贝 Polaris skills 与包内公共内容（adapters/policies/templates/hooks 脚本）到平台目录。
 * 不负责 commands / agents / rules / hooks 注册——由 installPolarisForPlatform 显式编排。
 */
import path from 'path';

import { copyFile } from '../../utils/file-system.js';
import {
  collectSharedDirFiles,
  getManifestSkills,
  readManifest,
  resolveAssetSourcePath,
  resolveManifestAssets,
  type Manifest,
} from '../assets/manifest.js';
import type { InstallScope, Language } from '../config/polaris-config.js';
import { getAssetsDir } from '../config/polaris-paths.js';
import { resolveInstallDest } from '../platform/layout.js';
import type { Platform } from '../platform/platforms.js';
import { runCopyJobs, type CopyJob } from '../../utils/copy-jobs.js';

/** 再导出 Manifest 类型，保持历史 import 路径 */
export type { Manifest };

/**
 * 拷贝 Polaris skills 与包内公共内容到指定平台。
 * 目标路径由 resolveInstallDest 按 nested/flat 布局决定。
 */
export async function copyPolarisSkillsForPlatform(
  baseDir: string,
  platform: Platform,
  overwrite: boolean,
  lang: Language = 'zh',
  scope: InstallScope = 'project',
): Promise<{ copied: number; skipped: number }> {
  const assetsDir = getAssetsDir();
  const resolved = await resolveManifestAssets(assetsDir, lang);

  const contentPaths = resolved.skills.filter(
    (p) =>
      p.startsWith('skills/') ||
      p.startsWith('adapters/') ||
      p.startsWith('policies/') ||
      p.startsWith('templates/') ||
      p.includes('/scripts/') ||
      p.endsWith('SKILL.md'),
  );

  const sharedHookPaths = Object.keys(resolved.hooks ?? {});
  const sharedTemplatePaths = await collectSharedDirFiles(assetsDir, 'templates');
  const allPaths = [...new Set([...contentPaths, ...sharedHookPaths, ...sharedTemplatePaths])];

  const jobs: CopyJob[] = [];
  for (const assetRelPath of allPaths) {
    const destRel = resolveInstallDest(assetRelPath, platform, scope);
    if (!destRel) {
      continue;
    }

    const src = await resolveAssetSourcePath(assetsDir, lang, assetRelPath);
    if (!src) {
      console.error(`    Skill source not found: ${assetRelPath}`);
      continue;
    }

    const dest = path.join(baseDir, destRel);
    jobs.push({
      label: assetRelPath,
      dest,
      write: () => copyFile(src, dest),
    });
  }

  return runCopyJobs(jobs, overwrite);
}

export { getManifestSkills, readManifest };
