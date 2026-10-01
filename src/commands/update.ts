/**
 * `polaris update` 命令编排：三层更新（程序本体 / Polaris 资产 / 第三方依赖），范围可选。
 *
 * 与 init 的语义差异：
 * - 门控从「manifest.version 与本地版本比对」改为「按平台、按类别的资产源指纹比对」
 *   （见 core/update/fingerprint.ts）；版本号不再代表内容是否变化
 * - 命中需更新的类别时以 overwrite=true 重写 —— 原实现非 --force 时只会新增文件、从不改写
 * - hooks 始终走合并（overwriteHooks=false），不整文件替换掉用户在宿主配置里的自有条目
 * - 状态记录在 `.polaris/skills-lock.json`（唯一事实来源），不再写 `.polaris/installed-version`
 *
 * 执行顺序刻意是「先资产、后程序」：程序更新后当前进程跑的仍是旧代码，先做完资产更安全。
 */
import path from 'path';

import { t } from './i18n/index.js';
import { detectPlatforms, getBaseDir, hasSkills } from '../core/integrations/detect.js';
import { installPolarisForPlatform, type PolarisAssetKind } from '../core/install.js';
import { getAssetsDir, loadManifestConfig, readAssets } from '../core/assets/manifest.js';
import { SOURCES } from '../core/assets/sources.js';
import { PLATFORMS, getPlatformSkillsDir, type Platform } from '../core/domain/platforms.js';
import { getCurrentVersion, printVersionInfo, PACKAGE_NAME } from '../core/deps/version.js';
import { getNpmPackageVersion } from '../core/deps/npm.js';
import {
  buildGlobalInstallInvocation,
  updatePolarisProgram,
  type SelfUpdateResult,
} from '../core/deps/self-update.js';
import { installOpenSpec } from '../core/integrations/openspec.js';
import { installSuperpowersForPlatforms } from '../core/integrations/superpowers.js';
import { installCodegraph } from '../core/integrations/codegraph.js';
import {
  readLockFile,
  saveLockFile,
  type LockFile,
  type LockSourceEntry,
  type PlatformAssetFingerprints,
} from '../core/install/lock.js';
import { computeAssetFingerprints } from '../core/update/fingerprint.js';
import { pruneOwnedFiles, type PrunableKind } from '../core/update/prune.js';
import { resolveUpdatePlan, type UpdateDependency, type UpdatePlan } from '../core/update/scope.js';
import {
  loadPolarisConfig,
  type InstallScope,
  type Languages,
} from '../core/config/polaris-project-config.js';

const OPENSPEC_PACKAGE =
  SOURCES.find((source) => source.id === 'openspec')?.npmPackage ?? '@fission-ai/openspec';

export type UpdateOptions = {
  /** 忽略指纹，强制重写所选类别 */
  force?: boolean;
  /** 删除所选类别下已不在资产清单中的陈旧产物 */
  prune?: boolean;
  /** 只更新这些项（组名或成员名） */
  only?: string[];
  /** 跳过这些项 */
  skip?: string[];
  lang?: Languages;
  scope?: InstallScope;
  json?: boolean;
};

/** 单平台资产更新结果 */
export type UpdatePlatformResult = {
  platform: string;
  /** 本次实际重写的类别 */
  updated: PolarisAssetKind[];
  /** 指纹未变、本次跳过的类别 */
  unchanged: PolarisAssetKind[];
  /** 各类别拷贝计数（仅含本次执行的类别） */
  copied: Partial<Record<PolarisAssetKind, number>>;
  /** 各类别跳过计数（仅含本次执行的类别） */
  skipped: Partial<Record<PolarisAssetKind, number>>;
  /** hooks 注册结果（仅本次执行 hooks 时存在） */
  hooks?: { installed: boolean; reason?: string };
  /** --prune 删除的陈旧路径 */
  pruned: string[];
};

/** 单个第三方依赖的更新结果 */
export type UpdateDependencyResult = {
  id: UpdateDependency;
  status: string;
  version?: string;
};

export type UpdateResult = {
  projectPath: string;
  scope: InstallScope;
  language: Languages;
  plan: UpdatePlan;
  /** 程序本体结果；未选该层时为 null */
  program: SelfUpdateResult | null;
  assets: UpdatePlatformResult[];
  /** assets 层因未检测到 Polaris 安装而未执行 */
  assetsSkipped: boolean;
  deps: UpdateDependencyResult[];
  /** deps 层因未检测到 Polaris 安装而未执行 */
  depsSkipped: boolean;
  /** 本次写出的 lock 路径；未写时为 null */
  lockPath: string | null;
};

type Logger = (message: string) => void;

/** 语言：显式选项 > `.polaris/config.yaml` > zh（en 技能资产尚未填充，zh 是唯一可用默认） */
function resolveLanguage(
  fromOption: Languages | undefined,
  fromConfig: Languages | undefined,
): Languages {
  if (fromOption === 'zh' || fromOption === 'en') return fromOption;
  return fromConfig ?? 'zh';
}

/** 作用域：显式选项 > `.polaris/config.yaml` > project */
function resolveScope(
  fromOption: InstallScope | undefined,
  fromConfig: InstallScope | undefined,
): InstallScope {
  if (fromOption === 'project' || fromOption === 'global') return fromOption;
  return fromConfig ?? 'project';
}

/** 已检测平台 ∩ 目标 skills 目录下确实装了 polaris */
async function findInstalledPlatforms(
  projectPath: string,
  scope: InstallScope,
): Promise<Platform[]> {
  const baseDir = getBaseDir(scope, projectPath);
  const detected = await detectPlatforms(projectPath);
  const installed: Platform[] = [];

  for (const platform of PLATFORMS) {
    if (!detected.has(platform.id)) {
      continue;
    }
    const skillsBaseDir = getPlatformSkillsDir(platform, scope, baseDir);
    if (await hasSkills(skillsBaseDir, 'polaris')) {
      installed.push(platform);
    }
  }

  return installed;
}

/** 仅 skills / commands 具备独占命名空间，可安全清理 */
function isPrunableKind(kind: PolarisAssetKind): kind is PrunableKind {
  return kind === 'skills' || kind === 'commands';
}

/** 程序层结果的人类可读行 */
function reportProgram(result: SelfUpdateResult, log: Logger, lang: Languages): void {
  const prefix = t(lang, 'summaryNpm');

  switch (result.status) {
    case 'updated':
      log(
        `  ${prefix} ${t(lang, 'updateUpdatedTo')} v${result.latestVersion} (${result.packageManager})`,
      );
      return;
    case 'up-to-date':
      log(`  ${prefix} ${t(lang, 'updateUpToDate')} (v${result.currentVersion})`);
      return;
    case 'skipped':
      log(`  ${prefix} ${t(lang, 'updateSkippedTransient')}`);
      return;
    case 'unreachable':
      log(`  ${prefix} ${t(lang, 'updateRegistryUnreachable')}`);
      return;
    default: {
      const { command, args } = buildGlobalInstallInvocation(result.packageManager ?? 'npm');
      log(`  ${prefix} ${t(lang, 'npmPackageFailed')}`);
      log(`    ${t(lang, 'updateRunManually')} ${[command, ...args].join(' ')}`);
    }
  }
}

/** 单个平台的资产层结果的人类可读行 */
function reportPlatformAssets(result: UpdatePlatformResult, log: Logger, lang: Languages): void {
  const platform = PLATFORMS.find((candidate) => candidate.id === result.platform);
  const name = platform?.name ?? result.platform;

  if (result.updated.length === 0) {
    log(`  ${name}: ${t(lang, 'updateUpToDate')}`);
    return;
  }

  const parts = result.updated.map((kind) => {
    if (kind === 'hooks') {
      const status = result.hooks?.installed
        ? t(lang, 'updateStatusInstalled')
        : (result.hooks?.reason ?? t(lang, 'skip'));
      return `hooks (${status})`;
    }
    return `${kind} ${result.copied[kind] ?? 0}`;
  });

  log(`  ${name}: ${t(lang, 'updateUpdatedTo')} ${parts.join(', ')}`);

  if (result.pruned.length > 0) {
    log(`    ${t(lang, 'updatePruned')} ${result.pruned.length} ${t(lang, 'updateStalePaths')}`);
    for (const stalePath of result.pruned) {
      log(`      - ${stalePath}`);
    }
  }
}

export async function runUpdate(
  rawPath: string,
  options: UpdateOptions = {},
): Promise<UpdateResult> {
  const json = Boolean(options.json);
  const projectPath = path.resolve(rawPath || process.cwd());
  const log: Logger = json ? () => {} : (message: string) => console.log(message);

  const plan = resolveUpdatePlan(options.only, options.skip);
  const config = await loadPolarisConfig(projectPath);
  const language = resolveLanguage(options.lang, config?.language);
  const scope = resolveScope(options.scope, config?.scope);
  const lang = language;

  if (!json) {
    log(t(lang, 'updateTitle'));
    await printVersionInfo(log);
  }

  // ---- 1. 程序本体（npm 包） ----
  const program = plan.program ? await updatePolarisProgram({ json }) : null;
  if (program) {
    reportProgram(program, log, lang);
  }

  const wantsAssets = plan.assets.length > 0;
  const wantsDeps = plan.deps.length > 0;
  const platforms = await findInstalledPlatforms(projectPath, scope);
  const platformIds = platforms.map((platform) => platform.id);
  // 资产与依赖都要落进平台目录，没有已装平台时两层都无从执行（程序层不受影响）
  const nothingInstalled = platforms.length === 0 && (wantsAssets || wantsDeps);

  const previousLock = await readLockFile(projectPath);
  const assetResults: UpdatePlatformResult[] = [];
  const fingerprints: Record<string, PlatformAssetFingerprints> = {};

  // ---- 2. Polaris 资产 ----
  if (wantsAssets && nothingInstalled) {
    log(`  ${t(lang, 'updateAssetsSkipped')}`);
  } else if (wantsAssets) {
    const assets = await readAssets(language);
    const baseDir = getBaseDir(scope, projectPath);

    log('');
    log(`  ${t(lang, 'updatingSkillsOnTargets')} ${platforms.map((p) => p.name).join(', ')}`);

    for (const platform of platforms) {
      const fresh = await computeAssetFingerprints(assets, platform, config, scope);
      fingerprints[platform.id] = fresh;

      const previous = previousLock?.assets?.[platform.id] ?? {};
      // 指纹未变即跳过该类；--force 时全部视为需重写
      const needsRewrite = (kind: PolarisAssetKind): boolean =>
        Boolean(options.force) || previous[kind] !== fresh[kind];
      const updated = plan.assets.filter(needsRewrite);
      const result: UpdatePlatformResult = {
        platform: platform.id,
        updated,
        unchanged: plan.assets.filter((kind) => !updated.includes(kind)),
        copied: {},
        skipped: {},
        pruned: [],
      };

      if (updated.length > 0) {
        log(`  ${t(lang, 'copyingSkillsFiles')} ${platform.name}...`);

        const installed = await installPolarisForPlatform(
          baseDir,
          platform,
          true,
          language,
          scope,
          projectPath,
          { only: updated, overwriteHooks: false },
        );

        for (const kind of updated) {
          if (kind === 'hooks') {
            result.hooks = installed.hooks;
            continue;
          }
          result.copied[kind] = installed[kind].copied;
          result.skipped[kind] = installed[kind].skipped;
        }

        if (options.prune) {
          for (const kind of updated.filter(isPrunableKind)) {
            const pruned = await pruneOwnedFiles({
              platform,
              scope,
              projectPath,
              kind,
              expectedFiles: installed.installedFiles[kind],
            });
            result.pruned.push(...pruned.deleted);
          }
        }
      }

      assetResults.push(result);
    }
  }

  // ---- 3. 第三方依赖 ----
  const deps: UpdateDependencyResult[] = [];
  const sourceEntries = new Map<string, LockSourceEntry>(
    (previousLock?.sources ?? []).map((entry) => [entry.id, entry]),
  );

  if (wantsDeps && nothingInstalled) {
    log(`  ${t(lang, 'updateDepsSkipped')}`);
  } else if (wantsDeps) {
    if (plan.deps.includes('openspec')) {
      log(`\n  ${OPENSPEC_PACKAGE}...`);
      const status = await installOpenSpec(projectPath, platforms, scope, true);
      const version = status === 'installed' ? getNpmPackageVersion(OPENSPEC_PACKAGE) : undefined;
      deps.push({ id: 'openspec', status, version });
      if (version) {
        sourceEntries.set('openspec', { id: 'openspec', version });
      }
    }

    if (plan.deps.includes('superpowers')) {
      log('\n  Superpowers...');
      const result = await installSuperpowersForPlatforms(projectPath, scope, platformIds, true);
      deps.push({ id: 'superpowers', status: result.status, version: result.version });
      if (result.status === 'installed') {
        sourceEntries.set('superpowers', { id: 'superpowers', version: result.version });
      }
    }

    if (plan.deps.includes('codegraph')) {
      log('\n  Codegraph...');
      // upgradeCli=true：已装 CLI 也重新拉 @latest，但已有 .codegraph 索引时不重建
      const status = await installCodegraph(projectPath, scope, true, true);
      deps.push({ id: 'codegraph', status, version: 'latest' });
    }
  }

  // ---- 4. 写回 lock ----
  const manifest = await loadManifestConfig(getAssetsDir());
  let lockPath: string | null = null;

  if (!nothingInstalled && (wantsAssets || wantsDeps)) {
    const nextAssets: Record<string, PlatformAssetFingerprints> = {
      ...(previousLock?.assets ?? {}),
    };
    for (const [platformId, fresh] of Object.entries(fingerprints)) {
      const merged: PlatformAssetFingerprints = { ...(nextAssets[platformId] ?? {}) };
      for (const kind of plan.assets) {
        merged[kind] = fresh[kind];
      }
      nextAssets[platformId] = merged;
    }
    sourceEntries.set('polaris', { id: 'polaris', version: manifest.version });

    const lock: LockFile = {
      version: 1,
      lang: language,
      scope,
      platforms: platformIds.length > 0 ? platformIds : (previousLock?.platforms ?? []),
      sources: [...sourceEntries.values()],
      installedAt: previousLock?.installedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (Object.keys(nextAssets).length > 0) {
      lock.assets = nextAssets;
    }

    await saveLockFile(projectPath, lock);
    lockPath = path.join(projectPath, '.polaris', 'skills-lock.json');
  }

  if (nothingInstalled) {
    console.error(t(lang, 'noInstallsFound'));
    process.exitCode = 1;
  }

  const result: UpdateResult = {
    projectPath,
    scope,
    language,
    plan,
    program,
    assets: assetResults,
    assetsSkipped: wantsAssets && nothingInstalled,
    deps,
    depsSkipped: wantsDeps && nothingInstalled,
    lockPath,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  log('');
  for (const entry of assetResults) {
    reportPlatformAssets(entry, log, lang);
  }
  for (const entry of deps) {
    log(`  ${entry.id}: ${entry.status}${entry.version ? ` (${entry.version})` : ''}`);
  }

  log('');
  log(`  ${t(lang, 'summary')}`);
  log(`  ${t(lang, 'summaryScope')} ${scope}  ${t(lang, 'summaryLanguage')} ${language}`);
  log(`  ${PACKAGE_NAME}@${getCurrentVersion()} (assets ${manifest.version})`);
  log(t(lang, 'updateComplete'));

  return result;
}

export async function updateCommand(projectPath: string, options: UpdateOptions): Promise<void> {
  await runUpdate(projectPath, options);
}
