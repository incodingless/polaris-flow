/**
 * 拷贝 Polaris skills 与包内公共内容（adapters/policies/templates/hooks 脚本）到平台目录。
 * 不负责 commands / agents / rules / hooks 注册——由 installPolarisForPlatform 显式编排。
 */
import path from 'path';

import { ensureDirSafe } from '../../utils/file-system.js';
import { Asset } from '../assets/manifest.js';
import type { Platform } from '../platforms.js';
import { runCopyJobs, type CopyJob } from '../../utils/file-system.js';
import { getAssetsDir } from '../assets/polaris-paths.js';
import { Language } from '../config/polaris-project-config.js';

/**
 * 拷贝 Polaris skills 与包内公共内容到指定平台。
 * 目标路径由 resolveInstallDest 按 nested/flat 布局决定。
 */
export async function copyPolarisSkillsForPlatform(
  baseDir: string,
  platform: Platform,
  language: Language,
  overwrite: boolean,
  assets: Asset,
): Promise<{ copied: number; skipped: number }> {
  const jobs: CopyJob[] = [];
  // 1. 准备要复制的共享文档路径
  const sharedDirs = assets.sharedAssets.filter(
    (item) =>
      item.startsWith('hooks/') || item.startsWith('scorers/') || item.startsWith('templates/'),
  );

  for (const sharedDir of sharedDirs) {
    jobs.push({
      label: 'shared_content',
      src: path.join(getAssetsDir(), language, sharedDir),
      dest: path.join(baseDir, sharedDir),
      type: 'file',
      overwrite: overwrite,
    });
  }

  // 2. 复制区分语言的共享文档路径
  const contentPaths = assets.langContentPaths.filter(
    (p) => p.startsWith('adapters/') || p.startsWith('policies/'),
  );
  for (const contentPath of contentPaths) {
    jobs.push({
      label: contentPath,
      src: path.join(getAssetsDir(), language, contentPath),
      dest: path.join(baseDir, contentPath),
      type: 'file',
      overwrite: overwrite,
    });
  }

  //3. 根据布局类型复制技能内容
  const skillFiles = assets.langContentPaths.filter((p) => p.startsWith('skills/'));
  if (platform.skillsLayout === 'flat') {
    // TODO: 扁平布局，需要处理技能目录名称
    // 扁平布局，技能内容直接复制到技能目录
    for (const skillFile of skillFiles) {
      // 提取技能目录名称
      const skillPath = skillFile.split('/');
      if (skillPath.length === 2) {
        jobs.push({
          label: 'skill',
          src: path.join(getAssetsDir(), language, skillFile),
          dest: path.join(baseDir, skillPath[1]),
          type: 'file',
          overwrite: overwrite,
        });
      } else {
        const flatSkillFile = '/polaris-flow-' + skillPath.slice(1).join('/');

        jobs.push({
          label: 'skill',
          src: path.join(getAssetsDir(), language, skillFile),
          dest: path.join(baseDir, flatSkillFile),
          type: 'file',
          overwrite: overwrite,
        });
      }
    }
  } else {
    // 嵌套布局
    for (const skillFile of skillFiles) {
      jobs.push({
        label: 'skill',
        src: path.join(getAssetsDir(), language, skillFile),
        dest: path.join(baseDir, skillFile.replace(/^skills\//, '')),
        type: 'dir',
        overwrite: overwrite,
      });
    }
  }

  return runCopyJobs(jobs);
}
