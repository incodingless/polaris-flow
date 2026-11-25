/**
 * 附带技能（第三方图表工具，如 archify / diagram-design）的获取与落地。
 *
 * 清单来源：`deps/registry.ts` 中所有 `method.kind === 'github-copy'` 的声明，
 * 本文件不再维护自己的 spec 数组（历史上 `BUNDLED_SKILL_SPECS` 与 `SOURCES` 各写一份，
 * 加一个技能要改两处且字段语义不同）。
 *
 * 通道顺序与其他组件一致 —— **优先上游，本地兜底**：
 * 1. GitHub 浅克隆（`ensureBundledSkillsSource`）→ 落到 `~/.polaris/components/bundled-skills/<id>/`
 * 2. 本地组件目录（离线包 preseed 写入，或上一次 init 的缓存；可被 `install.local-paths.<id>` 单条覆盖）
 * 3. 都没有 → 跳过并告警，**不阻断** init
 *
 * 与 Polaris 技能族的三点差别（因此不能放进 `assets/<lang>/skills/`）：
 * - 落 `<skills 根>/<targetDirName>/`，不进 `polaris/` 命名空间
 * - 内容原样，不改写 `{{SKN_SPR}}`
 * - 不做顶层 `policies/` 注入
 *
 * 源目录可用 `POLARIS_BUNDLED_SKILLS_SOURCE` 覆盖（整体覆盖；逐条覆盖走 `install.local-paths`）。
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
import {
  BUNDLED_REF_MARKER,
  githubCopyDependencies,
  pinExpectation,
  toRepoUrl,
  type GithubCopyDependency,
} from '../deps/registry.js';

/** 只服务维护者的文件，不随安装进用户项目 */
const NOT_INSTALLED_BASENAMES = new Set(['PROVENANCE.md', 'README.md', BUNDLED_REF_MARKER]);

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

/** 按 id 过滤附带技能声明；缺省全部 */
function selectDependencies(ids?: string[]): GithubCopyDependency[] {
  const all = githubCopyDependencies();
  if (!ids || ids.length === 0) return all;
  const wanted = new Set(ids);
  return all.filter((dep) => wanted.has(dep.spec.id));
}

/**
 * 判断某个附带技能在本地源里是否「齐备且版本正确」。
 *
 * `pin` 给了钉值时要求标记文件与钉值一致——否则视为缺失，触发重新拉取。
 * 没有标记文件的历史副本一律按缺失处理，宁可重拉一次。
 */
export async function isBundledSkillPresent(
  sourceDir: string,
  dep: GithubCopyDependency,
): Promise<boolean> {
  if (!(await fileExists(path.join(sourceDir, dep.spec.id, 'SKILL.md')))) {
    return false;
  }
  const expected = pinExpectation(dep.method);
  if (!expected) {
    return true;
  }
  try {
    const actual = (
      await readFile(path.join(sourceDir, dep.spec.id, BUNDLED_REF_MARKER), 'utf-8')
    ).trim();
    return actual === expected;
  } catch {
    return false;
  }
}

/**
 * 把用户指定的本机目录作为该技能的源：拷进组件目录并写版本标记。
 *
 * 用于 `install.local-paths.<id>` 的单条覆盖。组件目录仍是唯一载体，
 * 平台分发（`copyBundledSkillsToPlatform`）因此无需感知来源差异。
 */
export async function importBundledSkillFromDir(
  dep: GithubCopyDependency,
  localDir: string,
  sourceDir: string,
): Promise<void> {
  await copyDirContents(localDir, path.join(sourceDir, dep.spec.id), {
    shouldCopy: makeShouldCopy(dep),
  });
  await writeFile(
    path.join(sourceDir, dep.spec.id, BUNDLED_REF_MARKER),
    `${pinExpectation(dep.method)}\n`,
    'utf-8',
  );
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
  options: {
    sourceDir?: string;
    /** 只处理这些依赖 id；缺省全部 github-copy 依赖 */
    ids?: string[];
    allowFetch?: boolean;
  } = {},
): Promise<{ fetched: string[]; missing: string[]; errors: Record<string, string> }> {
  const sourceDir = options.sourceDir ?? getBundledSkillsSourceDir();
  const deps = selectDependencies(options.ids);
  const allowFetch = options.allowFetch ?? !process.env.POLARIS_BUNDLED_SKILLS_SOURCE?.trim();
  const fetched: string[] = [];
  const missing: string[] = [];
  const errors: Record<string, string> = {};

  for (const dep of deps) {
    if (await isBundledSkillPresent(sourceDir, dep)) {
      continue;
    }
    if (!allowFetch) {
      missing.push(dep.spec.id);
      continue;
    }
    let tempPath: string | null = null;
    try {
      // fetchRepo / fetchRepoAtCommit 期望完整 URL（镜像改写只对 https://github.com 生效）
      const repoUrl = toRepoUrl(dep.method.repo);
      const repo =
        'commit' in dep.method.pin
          ? await fetchRepoAtCommit(repoUrl, dep.method.pin.commit)
          : await fetchRepo(repoUrl, 'version' in dep.method.pin ? dep.method.pin.version : null);
      tempPath = repo.localPath;
      const src = dep.method.subdir ? path.join(repo.localPath, dep.method.subdir) : repo.localPath;
      if (!(await fileExists(path.join(src, 'SKILL.md')))) {
        throw new Error(`${dep.method.repo} 内未找到 ${dep.method.subdir ?? '.'}/SKILL.md`);
      }
      await copyDirContents(src, path.join(sourceDir, dep.spec.id), {
        shouldCopy: makeShouldCopy(dep),
      });
      // 写完标记才算「这一版已就位」；标记缺失/不一致会触发下次重拉
      await writeFile(
        path.join(sourceDir, dep.spec.id, BUNDLED_REF_MARKER),
        `${pinExpectation(dep.method)}\n`,
        'utf-8',
      );
      fetched.push(dep.spec.id);
    } catch (error) {
      missing.push(dep.spec.id);
      // 失败原因必须带出来：只报「没装上」无法区分网络问题与配置问题
      errors[dep.spec.id] = (error as Error).message.split('\n')[0].slice(0, 200);
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
 * 按声明里的裁剪规则与「不安装维护者文件」构造过滤谓词。
 */
function makeShouldCopy(dep: GithubCopyDependency): CopyDirOptions['shouldCopy'] {
  return (rel) => {
    const base = rel.includes('/') ? rel.slice(rel.lastIndexOf('/') + 1) : rel;
    if (NOT_INSTALLED_BASENAMES.has(base)) {
      return false;
    }
    return !(dep.method.exclude?.(rel) ?? false);
  };
}

/**
 * 把本地源里的附带技能拷到平台 skills 根目录。
 * 本地源缺失某一技能时**静默跳过**（不阻断安装），由调用方汇报。
 *
 * @param ids 只处理这些依赖；缺省全部附带技能
 */
export async function copyBundledSkillsToPlatform(
  platformSkillsDir: string,
  overwrite: boolean,
  options: { sourceDir?: string; ids?: string[] } = {},
): Promise<{ installed: string[]; skipped: string[] }> {
  const sourceDir = options.sourceDir ?? getBundledSkillsSourceDir();
  const deps = selectDependencies(options.ids);
  const installed: string[] = [];
  const skipped: string[] = [];

  for (const dep of deps) {
    const name = dep.method.targetDirName;
    const src = path.join(sourceDir, dep.spec.id);
    if (!(await fileExists(path.join(src, 'SKILL.md')))) {
      skipped.push(name);
      continue;
    }
    const dest = path.join(platformSkillsDir, name);
    if ((await fileExists(dest)) && !overwrite) {
      skipped.push(name);
      continue;
    }
    await ensureDir(platformSkillsDir);
    await copyDirContents(src, dest, { shouldCopy: makeShouldCopy(dep) });
    installed.push(name);
  }

  return { installed, skipped };
}

/**
 * 列出本地源里已齐备的附带技能名（供 doctor / 汇报使用）。
 */
export async function listInstalledBundledSkills(
  options: { sourceDir?: string; ids?: string[] } = {},
): Promise<string[]> {
  const sourceDir = options.sourceDir ?? getBundledSkillsSourceDir();
  const names: string[] = [];
  for (const dep of selectDependencies(options.ids)) {
    if (await isBundledSkillPresent(sourceDir, dep)) {
      names.push(dep.spec.id);
    }
  }
  return names;
}
