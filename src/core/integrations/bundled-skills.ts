/**
 * 附带技能（第三方图表工具，如 archify / diagram-design）的获取与落地。
 *
 * 通道顺序与 `deps/cli-installer` 之外的其余组件一致——**优先上游，本地兜底**：
 * 1. GitHub 浅克隆（`ensureBundledSkillsSource`）→ 落到 `~/.polaris/components/bundled-skills/<name>/`
 * 2. 本地组件目录（离线包 preseed 写入，或上一次 init 的缓存）
 * 3. 都没有 → 跳过并告警，**不阻断** init
 *
 * 与 Polaris 技能族的三点差别（因此不能放进 `assets/<lang>/skills/`）：
 * - 落 `<skills 根>/<name>/`，不进 `polaris/` 命名空间
 * - 内容原样，不改写 `{{SKN_SPR}}`
 * - 不做顶层 `policies/` 注入
 *
 * 源目录可用 `POLARIS_BUNDLED_SKILLS_SOURCE` 覆盖（离线包与测试用）。
 */
import path from 'path';
import { readFile, writeFile } from 'fs/promises';

import {
  copyDirContents,
  ensureDir,
  fileExists,
  type CopyDirOptions,
} from '../../utils/file-system.js';
import { getPolarisHomeDir } from '../assets/polaris-paths.js';
import { cleanupTemp, fetchRepo, fetchRepoAtCommit } from '../deps/github.js';

/** 单个附带技能的来源声明 */
export type BundledSkillSpec = {
  /** 落盘目录名，即 `<skills 根>/<name>/` */
  name: string;
  /** GitHub 仓库，形如 `owner/repo` */
  repo: string;
  /**
   * 上游 tag（不带 `v` 前缀也可，`fetchRepo` 会先试 `v<version>`）。
   * 与 `commit` 二选一；两者都给时以 `commit` 为准。
   */
  version?: string | null;
  /** 上游 commit SHA。上游没有发 tag 时用它钉版本，否则每次 init 拿到的内容会漂移 */
  commit?: string;
  /** 仓库内技能所在子目录；缺省为仓库根 */
  subdir?: string;
  /** 裁剪规则：返回 true 表示不拷 */
  exclude?: (relPath: string) => boolean;
};

/**
 * 本地副本的版本标记文件名。
 *
 * 作用是让「已装过」不等于「永远不更新」：仅凭 `SKILL.md` 是否存在判齐备，
 * 会导致钉值改了以后老用户（包括开发者本机）永远拿不到新版。
 */
const REF_MARKER = '.polaris-bundled-ref';

/** 只服务维护者的文件，不随安装进用户项目 */
const NOT_INSTALLED_BASENAMES = new Set(['PROVENANCE.md', 'README.md', REF_MARKER]);

/**
 * 当前随 polaris 分发的附带技能。
 *
 * **升级上游版本就改这里**（全仓唯一口径，`PROVENANCE.md` 与本表的版本需一致）：
 * - 有 tag 的技能：改 `version`
 * - 没 tag 的技能：改 `commit`（取上游 `git rev-parse HEAD` 或 GitHub 提交页的完整 SHA）
 */
export const BUNDLED_SKILL_SPECS: BundledSkillSpec[] = [
  {
    name: 'archify',
    repo: 'tt-a1i/archify',
    version: '3.2.0',
    subdir: 'archify',
    // 渲染后的成品演示，SKILL.md 引用的是同目录 .json；裁掉省 12MB
    exclude: (rel) => rel.startsWith('examples/') && rel.endsWith('.html'),
  },
  {
    name: 'diagram-design',
    repo: 'cathrynlavery/diagram-design',
    // 上游没有 release tag，只能钉 SHA：钉了才不会「今天装的和下月装的不一样」
    commit: '7a12007b5a4246894f342a2e52e78facbc62eca3',
    subdir: 'skills/diagram-design',
  },
];

/**
 * 附带技能本地源目录：默认 `~/.polaris/components/bundled-skills`，
 * 可用 `POLARIS_BUNDLED_SKILLS_SOURCE` 覆盖。
 */
export function getBundledSkillsSourceDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.POLARIS_BUNDLED_SKILLS_SOURCE?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(getPolarisHomeDir(), 'components', 'bundled-skills');
}

/**
 * 判断某个附带技能在本地源里是否「齐备且版本正确」。
 *
 * `spec` 给了钉值时，还要求版本标记与钉值一致——否则视为缺失，触发重新拉取。
 * 没有标记文件的历史副本（本机制之前装的）一律按缺失处理，宁可重拉一次。
 */
export async function isBundledSkillPresent(
  sourceDir: string,
  name: string,
  spec?: BundledSkillSpec,
): Promise<boolean> {
  const skillDir = path.join(sourceDir, name);
  if (!(await fileExists(path.join(skillDir, 'SKILL.md')))) {
    return false;
  }
  if (!spec) {
    return true;
  }
  const expected = spec.commit ?? spec.version ?? '';
  if (!expected) {
    return true;
  }
  try {
    const actual = (await readFile(path.join(skillDir, REF_MARKER), 'utf-8')).trim();
    return actual === expected;
  } catch {
    return false;
  }
}

/**
 * 补齐本地源：只拉缺失的技能，已存在的跳过。
 *
 * 失败（网络超时、仓库不可达）只记录在 `missing`，**不抛异常**——
 * 调用方据此提示用户，初始化流程继续。
 *
 * `POLARIS_BUNDLED_SKILLS_SOURCE` 显式指定了本地源时默认**不联网**：
 * 那意味着「源就在这里，别去别处找」，测试与离线部署都依赖这个语义。
 */
export async function ensureBundledSkillsSource(
  options: { sourceDir?: string; specs?: BundledSkillSpec[]; allowFetch?: boolean } = {},
): Promise<{ fetched: string[]; missing: string[]; errors: Record<string, string> }> {
  const sourceDir = options.sourceDir ?? getBundledSkillsSourceDir();
  const specs = options.specs ?? BUNDLED_SKILL_SPECS;
  const allowFetch = options.allowFetch ?? !process.env.POLARIS_BUNDLED_SKILLS_SOURCE?.trim();
  const fetched: string[] = [];
  const missing: string[] = [];
  const errors: Record<string, string> = {};

  for (const spec of specs) {
    if (await isBundledSkillPresent(sourceDir, spec.name, spec)) {
      continue;
    }
    if (!allowFetch) {
      missing.push(spec.name);
      continue;
    }
    let tempPath: string | null = null;
    try {
      // fetchRepo / fetchRepoAtCommit 期望完整 URL（镜像改写只对 https://github.com 生效）
      const repoUrl = spec.repo.startsWith('http') ? spec.repo : `https://github.com/${spec.repo}`;
      const repo = spec.commit
        ? await fetchRepoAtCommit(repoUrl, spec.commit)
        : await fetchRepo(repoUrl, spec.version ?? null);
      tempPath = repo.localPath;
      const src = spec.subdir ? path.join(repo.localPath, spec.subdir) : repo.localPath;
      if (!(await fileExists(path.join(src, 'SKILL.md')))) {
        throw new Error(`${spec.repo} 内未找到 ${spec.subdir ?? '.'}/SKILL.md`);
      }
      await copyDirContents(src, path.join(sourceDir, spec.name), {
        shouldCopy: makeShouldCopy(spec),
      });
      // 写完标记才算「这一版已就位」；标记缺失/不一致会触发下次重拉
      await writeFile(
        path.join(sourceDir, spec.name, REF_MARKER),
        `${spec.commit ?? spec.version ?? ''}\n`,
        'utf-8',
      );
      fetched.push(spec.name);
    } catch (error) {
      missing.push(spec.name);
      // 失败原因必须带出来：只报「没装上」无法区分网络问题与配置问题
      errors[spec.name] = (error as Error).message.split('\n')[0].slice(0, 200);
    } finally {
      // fetchRepo 的临时目录必须清掉，否则每次 init 泄漏一份仓库副本
      if (tempPath) {
        await cleanupTemp(tempPath).catch(() => {});
      }
    }
  }

  return { fetched, missing, errors };
}

/**
 * 按 spec 的裁剪规则与「不安装维护者文件」构造过滤谓词。
 */
function makeShouldCopy(spec: BundledSkillSpec): CopyDirOptions['shouldCopy'] {
  return (rel) => {
    const base = rel.includes('/') ? rel.slice(rel.lastIndexOf('/') + 1) : rel;
    if (NOT_INSTALLED_BASENAMES.has(base)) {
      return false;
    }
    return !(spec.exclude?.(rel) ?? false);
  };
}

/**
 * 把本地源里的附带技能拷到平台 skills 根目录。
 * 本地源缺失某一技能时**静默跳过**（不阻断安装），由调用方汇报。
 */
export async function copyBundledSkillsToPlatform(
  platformSkillsDir: string,
  overwrite: boolean,
  options: { sourceDir?: string; specs?: BundledSkillSpec[] } = {},
): Promise<{ installed: string[]; skipped: string[] }> {
  const sourceDir = options.sourceDir ?? getBundledSkillsSourceDir();
  const specs = options.specs ?? BUNDLED_SKILL_SPECS;
  const installed: string[] = [];
  const skipped: string[] = [];

  for (const spec of specs) {
    const src = path.join(sourceDir, spec.name);
    if (!(await fileExists(path.join(src, 'SKILL.md')))) {
      skipped.push(spec.name);
      continue;
    }
    const dest = path.join(platformSkillsDir, spec.name);
    if ((await fileExists(dest)) && !overwrite) {
      skipped.push(spec.name);
      continue;
    }
    await ensureDir(platformSkillsDir);
    await copyDirContents(src, dest, { shouldCopy: makeShouldCopy(spec) });
    installed.push(spec.name);
  }

  return { installed, skipped };
}

/**
 * 列出本地源里已齐备的技能名（供 doctor / 汇报使用）。
 */
export async function listInstalledBundledSkills(
  options: { sourceDir?: string; specs?: BundledSkillSpec[] } = {},
): Promise<string[]> {
  const sourceDir = options.sourceDir ?? getBundledSkillsSourceDir();
  const specs = options.specs ?? BUNDLED_SKILL_SPECS;
  const names: string[] = [];
  for (const spec of specs) {
    if (await isBundledSkillPresent(sourceDir, spec.name, spec)) {
      names.push(spec.name);
    }
  }
  return names;
}
