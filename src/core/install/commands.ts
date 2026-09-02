/**
 * 平台 slash command 安装：经 command-adapters 写入各宿主命令路径。
 * installSource（外部源复用）在 source-installer.ts。
 *
 * 命令文件与技能共享 `{{SKN_SPR}}` 分隔符占位符：落盘时按平台技能布局展开为
 * `:`（nested）或 `-`（flat），保证命令体内引用的技能名与落盘技能名一致。
 */
import path from 'path';
import { readFile, writeFile } from 'fs/promises';

import {
  ensureDir,
  fileExists,
  runCopyJobs,
  type CopyJob,
  type CopyResult,
} from '../../utils/file-system.js';
import type { SkillsLayout } from '../domain/platforms.js';
import { Assets } from '../assets/manifest.js';
import { applySkillNamePrefix, resolveSkillNamePrefix } from './skills.js';

/** 安装 Polaris bundled 命令（读取 assets 内 commands/） */

/**
 * 写出单个命令文件：覆盖策略 + {{SKN_SPR}} 展开。
 * @param job 拷贝任务
 * @param prefix 技能名分隔符（nested → `:`；flat → `-`）
 * @returns 拷贝结果
 */
async function writeCommandFile(job: CopyJob, prefix: string): Promise<CopyResult> {
  const existed = await fileExists(job.dest);
  if (existed && !job.overwrite) {
    return { job, result: 'skipped' };
  }
  const raw = await readFile(job.src, 'utf-8');
  const rewritten = applySkillNamePrefix(raw, prefix);
  await ensureDir(path.dirname(job.dest));
  await writeFile(job.dest, rewritten, 'utf-8');
  return { job, result: 'copied' };
}

/**
 * 安装 commands 到指定平台
 * @param commandsDir 命令目录
 * @param overwrite 是否覆盖
 * @param asset 资产
 * @param skillsLayout 平台技能布局，决定 {{SKN_SPR}} 展开成的分隔符
 * @returns 拷贝结果
 */
export async function installPolarisCommandsForPlatform(
  commandsDir: string,
  overwrite: boolean,
  asset: Assets,
  skillsLayout: SkillsLayout,
): Promise<{ copied: number; skipped: number }> {
  const prefix = resolveSkillNamePrefix(skillsLayout);
  const commandDirs = asset.langDirAssets.filter((asset) => ['commands'].includes(asset.dir));
  const jobs: CopyJob[] = [];
  for (const commandDir of commandDirs) {
    for (const file of commandDir.files) {
      const job: CopyJob = {
        label: commandDir.dir,
        src: file.fullPath,
        dest: path.join(commandsDir, file.shortPath),
        type: 'file',
        overwrite: overwrite,
      };
      job.write = () => writeCommandFile(job, prefix);
      jobs.push(job);
    }
  }
  return runCopyJobs(jobs);
}
