/**
 * 拷贝 Polaris skills 与包内公共内容（adapters/policies/templates/hooks 脚本）到平台目录。
 * 不负责 commands / agents / rules / hooks 注册——由 installPolarisForPlatform 显式编排。
 *
 * 安装流水线：
 * 1. 按 nested/flat 复制技能目录（源为 family/skill 或顶层叶技能）
 * 2. 替换 {{SKN_SPR}}（nested → `:` ；flat → `-`）
 * 3. 将语言包顶层 policies 注入每个叶技能的 policies/（同名按 overwrite 覆盖）
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
import { POLARIS_PLUGIN_NAME } from '../config/polaris-constants.js';
import { parseSkillAssetPath } from '../assets/layout.js';

/** 技能资产中的名称分隔符占位符 */
export const SKILL_NAME_PREFIX_PLACEHOLDER = '{{SKN_SPR}}';

/** 技能族目录名（其下为叶技能） */
const SKILL_FAMILIES = new Set(['coding', 'prd', 'test']);

/**
 * 是否应跳过该 skills 短路径。
 */
export function shouldSkipSkillShortPath(shortPath: string): boolean {
  const normalized = shortPath.replace(/\\/g, '/');
  if (normalized === 'README.md') {
    return true;
  }
  if (normalized.includes('/.workbuddy/') || normalized.startsWith('.workbuddy/')) {
    return true;
  }
  const top = normalized.split('/')[0];
  return top === 'backup' || top === 'requirements-engineering';
}

/**
 * 从 skills 资产相对路径取出顶层目录名（兼容旧调用）。
 * 例：`clarify/SKILL.md` → `clarify`；`coding/clarify/x` → `coding`。
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
 * 按布局解析 {{SKN_SPR}} 的替换值（仅为分隔符）。
 * nested → `:`；flat → `-`。
 */
export function resolveSkillNamePrefix(skillsLayout: SkillsLayout): string {
  return skillsLayout === 'nested' ? ':' : '-';
}

/**
 * 将文本中的 {{SKN_SPR}} 全部替换为给定分隔符。
 */
export function applySkillNamePrefix(raw: string, prefix: string): string {
  return raw.split(SKILL_NAME_PREFIX_PLACEHOLDER).join(prefix);
}

/** 叶技能安装根标识 */
export type SkillLeafRoot = {
  family: string | null;
  skill: string;
};

/**
 * 解析已安装叶技能根目录。
 */
export function resolveInstalledSkillRoot(
  polarisSkillsBaseDir: string,
  platformSkillsDir: string,
  skillsLayout: SkillsLayout,
  leaf: SkillLeafRoot | string,
): string {
  const parsed: SkillLeafRoot = typeof leaf === 'string' ? { family: null, skill: leaf } : leaf;
  if (skillsLayout === 'nested') {
    return parsed.family
      ? path.join(polarisSkillsBaseDir, parsed.family, parsed.skill)
      : path.join(polarisSkillsBaseDir, parsed.skill);
  }
  const flatName = parsed.family
    ? `${POLARIS_PLUGIN_NAME}-${parsed.family}-${parsed.skill}`
    : `${POLARIS_PLUGIN_NAME}-${parsed.skill}`;
  return path.join(platformSkillsDir, flatName);
}

/**
 * 解析 skills 资产文件落盘绝对路径。
 */
function resolveSkillDestPath(
  polarisSkillsBaseDir: string,
  platformSkillsDir: string,
  skillsLayout: SkillsLayout,
  shortPath: string,
): string | null {
  const normalized = shortPath.replace(/\\/g, '/');

  if (!normalized.includes('/')) {
    return path.join(polarisSkillsBaseDir, normalized);
  }

  const parsed = parseSkillAssetPath(normalized);
  if (!parsed) {
    return null;
  }

  const root = resolveInstalledSkillRoot(polarisSkillsBaseDir, platformSkillsDir, skillsLayout, {
    family: parsed.family,
    skill: parsed.skill,
  });
  return parsed.underSkill ? path.join(root, parsed.underSkill) : root;
}

/**
 * 写出文本文件：覆盖策略 + {{SKN_SPR}} 替换。
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
 * 构造带分隔符替换的拷贝任务。
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
 * 从 skills 资产收集叶技能根（含 family）。
 */
function collectSkillLeafRoots(assets: Assets): SkillLeafRoot[] {
  const keys = new Set<string>();
  const roots: SkillLeafRoot[] = [];
  for (const skillAsset of assets.langDirAssets.filter((a) => a.dir === 'skills')) {
    for (const file of skillAsset.files) {
      if (shouldSkipSkillShortPath(file.shortPath)) {
        continue;
      }
      const parsed = parseSkillAssetPath(file.shortPath);
      if (!parsed) {
        continue;
      }
      const key = parsed.family ? `${parsed.family}/${parsed.skill}` : parsed.skill;
      if (keys.has(key)) {
        continue;
      }
      keys.add(key);
      roots.push({ family: parsed.family, skill: parsed.skill });
    }
  }
  return roots.sort((a, b) => {
    const ka = a.family ? `${a.family}/${a.skill}` : a.skill;
    const kb = b.family ? `${b.family}/${b.skill}` : b.skill;
    return ka.localeCompare(kb);
  });
}

/**
 * 拷贝 Polaris skills 与包内公共内容到指定平台。
 */
export async function copyPolarisSkillsForPlatform(
  polarisSkillsBaseDir: string,
  platformSkillsDir: string,
  skillsLayout: SkillsLayout,
  overwrite: boolean,
  assets: Assets,
): Promise<{ copied: number; skipped: number }> {
  const jobs: CopyJob[] = [];
  const prefix = resolveSkillNamePrefix(skillsLayout);

  // Step 0：插件根公共内容
  const sharedDirs = assets.sharedAssets.filter((asset) =>
    ['hooks', 'scorers', 'templates', 'scripts'].includes(asset.dir),
  );
  for (const sharedDir of sharedDirs) {
    for (const file of sharedDir.files) {
      jobs.push({
        label: 'shared_' + sharedDir.dir,
        src: file.fullPath,
        dest: path.join(polarisSkillsBaseDir, sharedDir.dir, file.shortPath),
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
          path.join(polarisSkillsBaseDir, contentDir.dir, file.shortPath),
          overwrite,
          prefix,
        ),
      );
    }
  }

  // Step 1 + 2：按布局复制技能树
  const skillAssets = assets.langDirAssets.filter((asset) => asset.dir === 'skills');
  for (const skillAsset of skillAssets) {
    for (const skillFile of skillAsset.files) {
      if (shouldSkipSkillShortPath(skillFile.shortPath)) {
        continue;
      }
      const dest = resolveSkillDestPath(
        polarisSkillsBaseDir,
        platformSkillsDir,
        skillsLayout,
        skillFile.shortPath,
      );
      if (!dest) {
        continue;
      }
      jobs.push(makePrefixedCopyJob('skill', skillFile.fullPath, dest, overwrite, prefix));
    }
  }

  // Step 3：顶层 policies 注入每个叶技能
  const policyAsset = assets.langDirAssets.find((asset) => asset.dir === 'policies');
  if (policyAsset) {
    for (const leaf of collectSkillLeafRoots(assets)) {
      if (leaf.skill === 'subagent-probe' || leaf.skill === 'subagent-dispatch') {
        continue;
      }
      const skillRoot = resolveInstalledSkillRoot(
        polarisSkillsBaseDir,
        platformSkillsDir,
        skillsLayout,
        leaf,
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

export { SKILL_FAMILIES };
