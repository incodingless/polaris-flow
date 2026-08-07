/**
 * 拷贝 Polaris skills 与包内公共内容（adapters/policies/templates/hooks 脚本）到平台目录。
 * 不负责 commands / agents / rules / hooks 注册——由 installPolarisForPlatform 显式编排。
 * 安装 SKILL.md 时按落盘目录改写 frontmatter `name` 为 `polaris-flow-<skill>`。
 */
import path from 'path';
import { readFile, writeFile } from 'fs/promises';

import type { SkillsLayout } from '../platforms.js';
import {
  ensureDir,
  fileExists,
  runCopyJobs,
  type CopyJob,
  type CopyResult,
} from '../../utils/file-system.js';
import { Assets } from '../assets/manifest.js';
import { POLARIS_FLOW_PLUGIN_NAME } from '../config/polaris-constants.js';

/**
 * 从 skills 资产相对路径取出顶层 skill 目录名。
 * 例：`clarify/SKILL.md` → `clarify`；裸文件返回 null。
 */
export function getSkillDirNameFromShortPath(shortPath: string): string | null {
  const normalized = shortPath.replace(/\\/g, '/');
  const slash = normalized.indexOf('/');
  if (slash === -1) {
    return null;
  }
  const name = normalized.slice(0, slash);
  return name || null;
}

/**
 * 根据布局得到 skill 的规范 name（与落盘目录名对齐）。
 * flat / nested 均为 `polaris-flow-<skillDir>`。
 */
export function resolveInstalledSkillName(skillDirName: string): string {
  if (skillDirName.startsWith(`${POLARIS_FLOW_PLUGIN_NAME}-`)) {
    return skillDirName;
  }
  return `${POLARIS_FLOW_PLUGIN_NAME}-${skillDirName}`;
}

/**
 * 改写 SKILL.md frontmatter 的 name 行（不触碰正文）。
 */
export function rewriteSkillFrontmatterName(raw: string, name: string): string {
  if (/^name:\s*/m.test(raw)) {
    return raw.replace(/^name:.*$/m, `name: ${name}`);
  }
  // 无 name 行时插入到 frontmatter 开头（`---` 之后）
  return raw.replace(/^---\s*\n/, `---\nname: ${name}\n`);
}

/**
 * 解析 skill 文件落盘绝对路径。
 */
function resolveSkillDestPath(
  polarisFlowSkillsBaseDir: string,
  platformSkillsDir: string,
  skillsLayout: SkillsLayout,
  shortPath: string,
): string {
  if (skillsLayout !== 'flat') {
    return path.join(polarisFlowSkillsBaseDir, shortPath);
  }
  const normalized = shortPath.replace(/\\/g, '/');
  if (!normalized.includes('/')) {
    return path.join(platformSkillsDir, shortPath);
  }
  const skillDir = getSkillDirNameFromShortPath(normalized);
  if (!skillDir) {
    return path.join(platformSkillsDir, shortPath);
  }
  const underSkill = normalized.slice(skillDir.length + 1);
  const flatRoot = path.join(platformSkillsDir, resolveInstalledSkillName(skillDir));
  return underSkill ? path.join(flatRoot, underSkill) : flatRoot;
}

/**
 * 写入单个 SKILL.md：覆盖策略 + frontmatter name 改写。
 */
async function writeSkillMdJob(job: CopyJob, installedName: string): Promise<CopyResult> {
  const existed = await fileExists(job.dest);
  if (existed && !job.overwrite) {
    return { job, result: 'skipped' };
  }
  const raw = await readFile(job.src, 'utf-8');
  const rewritten = rewriteSkillFrontmatterName(raw, installedName);
  await ensureDir(path.dirname(job.dest));
  await writeFile(job.dest, rewritten, 'utf-8');
  return { job, result: 'copied' };
}

/**
 * 拷贝 Polaris skills 与包内公共内容到指定平台。
 * 目标路径按 nested/flat 布局决定；SKILL.md 的 frontmatter name 与落盘 skill 目录对齐。
 */
export async function copyPolarisSkillsForPlatform(
  polarisFlowSkillsBaseDir: string,
  platformSkillsDir: string,
  skillsLayout: SkillsLayout,
  overwrite: boolean,
  assets: Assets,
): Promise<{ copied: number; skipped: number }> {
  const jobs: CopyJob[] = [];

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

  const contentDirs = assets.langDirAssets.filter((asset) =>
    ['adapters', 'policies', 'templates'].includes(asset.dir),
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

  const skillDirs = assets.langDirAssets.filter((asset) => ['skills'].includes(asset.dir));

  for (const skillDir of skillDirs) {
    for (const skillFile of skillDir.files) {
      const dest = resolveSkillDestPath(
        polarisFlowSkillsBaseDir,
        platformSkillsDir,
        skillsLayout,
        skillFile.shortPath,
      );
      const baseName = path.posix.basename(skillFile.shortPath.replace(/\\/g, '/'));
      const skillDirName = getSkillDirNameFromShortPath(skillFile.shortPath);

      if (baseName === 'SKILL.md' && skillDirName) {
        const installedName = resolveInstalledSkillName(skillDirName);
        const job: CopyJob = {
          label: 'skill',
          src: skillFile.fullPath,
          dest,
          type: 'file',
          overwrite,
        };
        job.write = () => writeSkillMdJob(job, installedName);
        jobs.push(job);
      } else {
        jobs.push({
          label: 'skill',
          src: skillFile.fullPath,
          dest,
          type: 'file',
          overwrite,
        });
      }
    }
  }

  return runCopyJobs(jobs);
}
