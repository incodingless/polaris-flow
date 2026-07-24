/**
 * 拷贝 Polaris skills 与包内公共内容（adapters/policies/templates/hooks 脚本）到平台目录。
 * 不负责 commands / agents / rules / hooks 注册——由 installPolarisForPlatform 显式编排。
 */
import path from 'path';

import { ensureDirSafe } from '../../utils/file-system.js';
import { Asset } from '../assets/manifest.js';
import type { Platform } from '../platforms.js';
import { runCopyJobs, type CopyJob } from '../../utils/file-system.js';

/**
 * 拷贝 Polaris skills 与包内公共内容到指定平台。
 * 目标路径由 resolveInstallDest 按 nested/flat 布局决定。
 */
export async function copyPolarisSkillsForPlatform(
  baseDir: string,
  platform: Platform,
  overwrite: boolean,
  assets: Asset,
): Promise<{ copied: number; skipped: number }> {
  // 1. 创建技能目录
  await ensureDirSafe(baseDir);

  const jobs: CopyJob[] = [];
  // 2. 准备要复制的共享文档路径
  const sharedDirs = assets.langContentPaths.filter(
    (p) => p.startsWith('hooks/') || p.startsWith('scorers/') || p.startsWith('templates/'),
  );

  for (const sharedDir of sharedDirs) {
    jobs.push({
      label: 'shared_content',
      src: sharedDir,
      dest: path.join(baseDir, sharedDir),
      type: 'dir',
      overwrite: overwrite,
    });
  }

  // 3. 复制区分语言的共享文档路径
  const contentPaths = assets.langContentPaths.filter(
    (p) => p.startsWith('adapters/') || p.startsWith('hooks/'),
  );
  for (const contentPath of contentPaths) {
    jobs.push({
      label: contentPath,
      src: contentPath,
      dest: path.join(baseDir, contentPath),
      type: 'file',
      overwrite: overwrite,
    });
  }

  //4. 根据布局类型复制技能内容
  const skillDirs = assets.langContentPaths.filter((p) => p.startsWith('skills/'));
  if (platform.skillsLayout === 'flat') {
    // TODO: 扁平布局，需要处理技能目录名称
    // 扁平布局，技能内容直接复制到技能目录
    for (const skillDir of skillDirs) {
      jobs.push({
        label: 'skill',
        src: skillDir,
        dest: baseDir,
        type: 'dir',
        overwrite: overwrite,
      });
    }
  } else {
    // 嵌套布局
    for (const skillDir of skillDirs) {
      jobs.push({
        label: 'skill',
        src: skillDir,
        dest: baseDir,
        type: 'dir',
        overwrite: overwrite,
      });
    }
  }

  return runCopyJobs(jobs);
}
