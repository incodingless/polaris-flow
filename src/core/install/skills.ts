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
import { parseSkillAssetPath, SKILL_FAMILIES } from '../assets/layout.js';

/** 技能资产中的名称分隔符占位符 */
export const SKILL_NAME_PREFIX_PLACEHOLDER = '{{SKN_SPR}}';

/**
 * 匹配技能文本中的 `../` 相对引用（如 `../specify/x.md`、`../../../../policies/y.md`）。
 * 负向前瞻 `(?<!\.)` 排除 `.../`（省略号 / shell glob），避免误报。
 */
const CROSS_SKILL_PARENT_REF_RE = /(?<!\.)\.\.\/[A-Za-z0-9._\-\/]+/g;

/** 幽灵占位符：源码中从未定义 / 替换，安装后会原样残留，必须清理。 */
const GHOST_SKILL_NAME_PLACEHOLDER = '{{SKILL_NAME_PREFIX}}';

/** 再导出技能族清单：唯一来源是 `core/assets/layout.ts`，此处禁止再抄一份。 */
export { SKILL_FAMILIES };

/**
 * 是否应跳过该 skills 短路径。
 */
export function shouldSkipSkillShortPath(shortPath: string): boolean {
  const normalized = shortPath.replace(/\\/g, '/');
  const base = normalized.includes('/')
    ? normalized.slice(normalized.lastIndexOf('/') + 1)
    : normalized;
  // 与 manifest ignoredFiles 兜底对齐：任意层级 README / .DS_Store 不安装
  if (base === 'README.md' || base === '.DS_Store') {
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
 * 例：`specify/SKILL.md` → `specify`；`coding/specify/x` → `coding`。
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
 * 从技能资产相对路径解析出技能根（相对 skills 根）与文件所在目录。
 * 返回 null 表示该文件不是可校验的技能叶文件。
 */
function resolveSkillAssetLocation(shortPath: string): { skillRootRel: string; fileDirRel: string } | null {
  const normalized = shortPath.replace(/\\/g, '/');
  if (shouldSkipSkillShortPath(normalized)) {
    return null;
  }
  // 仅校验 Markdown 内容；跳过 .DS_Store / .gitkeep 等非文本文件，也跳过 README 文档页。
  if (!normalized.endsWith('.md') || normalized.endsWith('README.md')) {
    return null;
  }
  const parsed = parseSkillAssetPath(normalized);
  if (!parsed) {
    return null;
  }
  const skillRootRel = parsed.family ? `${parsed.family}/${parsed.skill}` : parsed.skill;
  const slash = normalized.lastIndexOf('/');
  const fileDirRel = slash === -1 ? '' : normalized.slice(0, slash);
  return { skillRootRel, fileDirRel };
}

/**
 * 扫描技能资产，找出「逃出技能自身目录」的 `../` 相对引用与幽灵占位符 {{SKILL_NAME_PREFIX}}。
 *
 * 背景：flat 安装布局把每个叶技能平铺为独立目录（如 `polaris-coding-tweak/`），
 * 源文件里的跨技能 `../specify/...`、跨层 `../../../../policies/...` 相对路径在 flat 下必然断裂。
 * 正确做法是技能名引用（`use_skill` / `/命令`）或技能内自包含路径（`./policies/`、`./templates/`）。
 * 安装器只替换 `{{SKN_SPR}}`，不重写 `../` 与 `{{SKILL_NAME_PREFIX}}`，因此源资产扫描等价于产物扫描。
 */
export async function findSkillAssetRefViolations(assets: Assets): Promise<string[]> {
  const targets: { file: Assets['langDirAssets'][number]['files'][number]; location: { skillRootRel: string; fileDirRel: string } }[] = [];
  for (const skillAsset of assets.langDirAssets.filter((a) => a.dir === 'skills')) {
    for (const file of skillAsset.files) {
      const location = resolveSkillAssetLocation(file.shortPath);
      if (location) {
        targets.push({ file, location });
      }
    }
  }

  // 并发读取全部技能文件（源文件量约几十到上百个，串行读在慢盘上会明显拖慢安装）。
  const contents = await Promise.all(targets.map(({ file }) => readFile(file.fullPath, 'utf-8')));

  const violations: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    const { file, location } = targets[i];
    const content = contents[i];

    if (content.includes(GHOST_SKILL_NAME_PLACEHOLDER)) {
      violations.push(`${file.shortPath}: 残留幽灵占位符 {{SKILL_NAME_PREFIX}}`);
    }

    const { skillRootRel, fileDirRel } = location;
    for (const ref of content.match(CROSS_SKILL_PARENT_REF_RE) ?? []) {
      const resolved = path.posix.normalize(path.posix.join(fileDirRel, ref));
      if (resolved !== skillRootRel && !resolved.startsWith(`${skillRootRel}/`)) {
        violations.push(
          `${file.shortPath}: 跨技能/跨层引用 \`${ref}\`（解析为 ${resolved}，逃出技能目录 ${skillRootRel}）`,
        );
      }
    }
  }
  return violations;
}

/**
 * 校验技能资产无跨技能 `../` 引用与幽灵占位符；命中即抛错，阻断安装。
 */
export async function validateSkillAssetsNoCrossSkillParentRefs(assets: Assets): Promise<void> {
  const violations = await findSkillAssetRefViolations(assets);
  if (violations.length > 0) {
    throw new Error(
      `技能资产校验失败：发现 ${violations.length} 处跨技能 ../ 引用或幽灵占位符，禁止安装。\n` +
        violations.map((v) => `  - ${v}`).join('\n'),
    );
  }
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
  // 构建期校验：命中跨技能 ../ 引用或幽灵占位符即阻断安装（防回归）。
  await validateSkillAssetsNoCrossSkillParentRefs(assets);

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
