/**
 * 拷贝 Polaris skills 与包内公共内容（adapters/policies/templates/hooks 脚本）到平台目录。
 * 不负责 commands / agents / rules / hooks 注册——由 installPolarisForPlatform 显式编排。
 */
import path from 'path';

import type { SkillsLayout } from '../platforms.js';
import { runCopyJobs, type CopyJob } from '../../utils/file-system.js';
import { Assets } from '../assets/manifest.js';

/**
 * 拷贝 Polaris skills 与包内公共内容到指定平台。
 * 目标路径由 resolveInstallDest 按 nested/flat 布局决定。
 * @param polarisFlowSkillsBaseDir polaris-flow技能基础目录
 * @param platformSkillsDir 平台技能目录
 * @param skillsLayout 技能布局
 * @param overwrite 是否覆盖
 * @param assets 资产
 * @returns 拷贝结果
 */
export async function copyPolarisSkillsForPlatform(
  polarisFlowSkillsBaseDir: string,
  platformSkillsDir: string,
  skillsLayout: SkillsLayout,
  overwrite: boolean,
  assets: Assets,
): Promise<{ copied: number; skipped: number }> {
  const jobs: CopyJob[] = [];
  // 1. 准备要复制的共享文档路径

  const sharedDirs = assets.sharedAssets.filter((asset) =>
    ['hooks', 'scorers', 'templates'].includes(asset.dir),
  );

  for (const sharedDir of sharedDirs) {
    for (const file of sharedDir.files) {
      jobs.push({
        label: 'shared_' + sharedDir.dir,
        src: file.fullPath,
        dest: path.join(polarisFlowSkillsBaseDir, sharedDir.dir, file.shortPath),
        type: 'file',
        overwrite: overwrite,
      });
    }
  }

  // 2. 复制区分语言的共享文档路径
  const contentDirs = assets.langDirAssets.filter((asset) =>
    ['adapters', 'policies'].includes(asset.dir),
  );
  for (const contentDir of contentDirs) {
    for (const file of contentDir.files) {
      jobs.push({
        label: contentDir.dir,
        src: file.fullPath,
        dest: path.join(polarisFlowSkillsBaseDir, contentDir.dir, file.shortPath),
        type: 'file',
        overwrite: overwrite,
      });
    }
  }

  //3. 根据布局类型复制技能内容
  const skillDirs = assets.langDirAssets.filter((asset) => ['skills'].includes(asset.dir));

  for (const skillDir of skillDirs) {
    for (const skillFile of skillDir.files) {
      let realSkillFilePath = path.join(polarisFlowSkillsBaseDir, skillFile.shortPath);
      if (skillsLayout === 'flat') {
        if (skillFile.shortPath.includes('/')) {
          realSkillFilePath = path.join(platformSkillsDir, '/polaris-flow-' + skillFile.shortPath);
        } else {
          realSkillFilePath = path.join(platformSkillsDir, skillFile.shortPath);
        }
      }

      jobs.push({
        label: 'skill',
        src: skillFile.fullPath,
        dest: realSkillFilePath,
        type: 'file',
        overwrite: overwrite,
      });
    }
  }
  return runCopyJobs(jobs);
}
