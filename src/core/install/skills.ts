/**
 * 拷贝 Polaris skills 与包内公共内容（adapters/policies/templates/hooks 脚本）到平台目录。
 * 不负责 commands / agents / rules / hooks 注册——由 installPolarisForPlatform 显式编排。
 *
 * 安装流水线：
 * 1. 按 nested/flat 复制技能目录（源为短名）
 * 2. 替换 {{SKILL_NAME_PREFIX}}（nested → polaris-flow: ；flat → polaris-flow-）
 * 3. 将语言包顶层 policies 注入每个子技能的 policies/（同名按 overwrite 覆盖）
 */
import path from 'path';
import { readFile, writeFile } from 'fs/promises';

import type { SkillsLayout } from '../domain/platforms.js';
import {
  ensureDir,
  fileExists,
  runCopyJobs,
  type CopyJob,
  type CopyResult,
} from '../../utils/file-system.js';
import { Assets } from '../assets/manifest.js';
import { POLARIS_FLOW_PLUGIN_NAME } from '../config/polaris-constants.js';

/** 技能资产中的名称前缀占位符 */
export const SKILL_NAME_PREFIX_PLACEHOLDER = '{{SKILL_NAME_PREFIX}}';

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
 * 按布局解析 {{SKILL_NAME_PREFIX}} 的替换值。
 * nested 用冒号命名空间；flat 用连字符前缀（与落盘目录 polaris-flow-<skill> 对齐）。
 */
export function resolveSkillNamePrefix(skillsLayout: SkillsLayout): string {
  return skillsLayout === 'nested'
    ? `${POLARIS_FLOW_PLUGIN_NAME}:`
    : `${POLARIS_FLOW_PLUGIN_NAME}-`;
}

/**
 * 将文本中的 {{SKILL_NAME_PREFIX}} 全部替换为给定前缀。
 */
export function applySkillNamePrefix(raw: string, prefix: string): string {
  return raw.split(SKILL_NAME_PREFIX_PLACEHOLDER).join(prefix);
}

/**
 * 解析已安装技能根目录（不含文件相对路径）。
 */
export function resolveInstalledSkillRoot(
  polarisFlowSkillsBaseDir: string,
  platformSkillsDir: string,
  skillsLayout: SkillsLayout,
  skillDir: string,
): string {
  if (skillsLayout === 'nested') {
    return path.join(polarisFlowSkillsBaseDir, skillDir);
  }
  return path.join(platformSkillsDir, `${POLARIS_FLOW_PLUGIN_NAME}-${skillDir}`);
}

/**
 * 解析 skills 资产文件落盘绝对路径。
 * - skills 根下裸文件（如 README.md）：始终落在 polarisFlowSkillsBaseDir（skills/polaris-flow/）
 * - nested 子技能：polarisFlowSkillsBaseDir/<skill>/…
 * - flat 子技能：platformSkillsDir/polaris-flow-<skill>/…
 */
function resolveSkillDestPath(
  polarisFlowSkillsBaseDir: string,
  platformSkillsDir: string,
  skillsLayout: SkillsLayout,
  shortPath: string,
): string {
  const normalized = shortPath.replace(/\\/g, '/');

  // skills 根下的裸文件不是子 skill，两种布局都进插件根
  if (!normalized.includes('/')) {
    return path.join(polarisFlowSkillsBaseDir, normalized);
  }

  if (skillsLayout === 'nested') {
    return path.join(polarisFlowSkillsBaseDir, shortPath);
  }

  const skillDir = getSkillDirNameFromShortPath(normalized);
  if (!skillDir) {
    return path.join(polarisFlowSkillsBaseDir, shortPath);
  }
  const underSkill = normalized.slice(skillDir.length + 1);
  return path.join(platformSkillsDir, `${POLARIS_FLOW_PLUGIN_NAME}-${skillDir}`, underSkill);
}

/**
 * 写出文本文件：覆盖策略 + {{SKILL_NAME_PREFIX}} 替换。
 */
async function writePrefixedTextJob(job: CopyJob, prefix: string): Promise<CopyResult> {
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
 * 构造带前缀替换的拷贝任务。
 */
function makePrefixedCopyJob(
  label: string,
  src: string,
  dest: string,
  overwrite: boolean,
  prefix: string,
): CopyJob {
  const job: CopyJob = {
    label,
    src,
    dest,
    type: 'file',
    overwrite,
  };
  job.write = () => writePrefixedTextJob(job, prefix);
  return job;
}

/**
 * 从 skills 资产收集唯一顶层 skill 目录名。
 */
function collectSkillDirNames(assets: Assets): string[] {
  const names = new Set<string>();
  for (const skillAsset of assets.langDirAssets.filter((a) => a.dir === 'skills')) {
    for (const file of skillAsset.files) {
      const name = getSkillDirNameFromShortPath(file.shortPath);
      if (name) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

/**
 * 拷贝 Polaris skills 与包内公共内容到指定平台。
 * 目标路径按 nested/flat 布局决定；文本中的 {{SKILL_NAME_PREFIX}} 按布局替换。
 */
export async function copyPolarisSkillsForPlatform(
  polarisFlowSkillsBaseDir: string,
  platformSkillsDir: string,
  skillsLayout: SkillsLayout,
  overwrite: boolean,
  assets: Assets,
): Promise<{ copied: number; skipped: number }> {
  const jobs: CopyJob[] = [];
  const prefix = resolveSkillNamePrefix(skillsLayout);

  // Step 0：插件根公共内容（shared 原样拷贝；lang policies/templates/adapters 做前缀替换）
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
        overwrite,
      });
    }
  }

  const contentDirs = assets.langDirAssets.filter((asset) =>
    ['adapters', 'templates'].includes(asset.dir),
  );
  for (const contentDir of contentDirs) {
    for (const file of contentDir.files) {
      jobs.push(
        makePrefixedCopyJob(
          contentDir.dir,
          file.fullPath,
          path.join(polarisFlowSkillsBaseDir, contentDir.dir, file.shortPath),
          overwrite,
          prefix,
        ),
      );
    }
  }

  // Step 1 + 2：按布局复制技能树，并替换占位符
  const skillAssets = assets.langDirAssets.filter((asset) => asset.dir === 'skills');
  for (const skillAsset of skillAssets) {
    for (const skillFile of skillAsset.files) {
      // README.md 文件不复制
      if (skillFile.shortPath === 'README.md') {
        continue;
      }
      
      const dest = resolveSkillDestPath(
        polarisFlowSkillsBaseDir,
        platformSkillsDir,
        skillsLayout,
        skillFile.shortPath,
      );
      jobs.push(makePrefixedCopyJob('skill', skillFile.fullPath, dest, overwrite, prefix));
    }
  }

  // Step 3：顶层 policies 注入每个子技能的 policies/
  const policyAsset = assets.langDirAssets.find((asset) => asset.dir === 'policies');
  if (policyAsset) {
    for (const skillDir of collectSkillDirNames(assets)) {
      // 跳过 subagent-probe 技能，该技能不需要公用的 policies。
      if (skillDir === 'subagent-probe') {
        continue;
      }
      const skillRoot = resolveInstalledSkillRoot(
        polarisFlowSkillsBaseDir,
        platformSkillsDir,
        skillsLayout,
        skillDir,
      );
      for (const policyFile of policyAsset.files) {
        jobs.push(
          makePrefixedCopyJob(
            'skill_policy_inject',
            policyFile.fullPath,
            path.join(skillRoot, 'policies', policyFile.shortPath),
            overwrite,
            prefix,
          ),
        );
      }
    }
  }

  return runCopyJobs(jobs);
}
