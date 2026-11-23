/**
 * `polaris update` 命令编排：三层更新（程序本体 / Polaris 资产 / 第三方依赖），范围可选。
 *
 * 与 init 的语义差异：
 * - 门控从「manifest.version 与本地版本比对」改为「按平台、按类别的资产源指纹比对」
 *   （见 core/update/fingerprint.ts）；版本号不再代表内容是否变化
 * - 命中需更新的类别时以 overwrite=true 重写 —— 原实现非 --force 时只会新增文件、从不改写
 * - hooks 始终走合并（overwriteHooks=false），不整文件替换掉用户在宿主配置里的自有条目
 * - 状态记录在 `.polaris/skills-lock.json`（唯一事实来源），不再写 `.polaris/installed-version`
 * - 第三方依赖按「lock 中记录的已装版本 vs 上游最新版本」判定（见 core/update/dep-version.ts）：
 *   版本未变或上游版本无法确认时跳过安装，避免每次 update 都重装组件并重写项目配置
 *
 * 程序本体由外部包管理器更新，当前进程仍执行旧代码；资产与依赖都在这个进程内完成。
 */
import path from 'path';

import { t } from './i18n/index.js';
import { detectPlatforms, getBaseDir, hasSkills } from '../core/integrations/detect.js';
import { installPolarisForPlatform, type PolarisAssetKind } from '../core/install.js';
import { getAssetsDir, loadManifestConfig, readAssets } from '../core/assets/manifest.js';
import { SOURCES, SUPERPOWERS_MIN_VERSION, SUPERPOWERS_REPO } from '../core/assets/sources.js';
import { PLATFORMS, getPlatformSkillsDir, type Platform } from '../core/domain/platforms.js';
import { getCurrentVersion, printVersionInfo, PACKAGE_NAME } from '../core/deps/version.js';
import { getLatestNpmVersion } from '../core/deps/npm.js';
import { resolveVersion } from '../core/deps/github.js';
import {
  buildGlobalInstallInvocation,
  updatePolarisProgram,
  type SelfUpdateResult,
} from '../core/deps/self-update.js';
import { installOpenSpec } from '../core/integrations/openspec.js';
import { installSuperpowersForPlatforms } from '../core/integrations/superpowers.js';
import { CODEGRAPH_PACKAGE, installCodegraph } from '../core/integrations/codegraph.js';
import {
  readLockFile,
  saveLockFile,
  type LockFile,
  type LockSourceEntry,
  type PlatformAssetFingerprints,
} from '../core/install/lock.js';
import { computeAssetFingerprints } from '../core/update/fingerprint.js';
import { resolveDepUpdateAction } from '../core/update/dep-version.js';
import { resolveInstallChannelConfig } from '../core/install/channels.js';
import { localIso } from '../utils/time.js';
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

/** 第三方依赖的更新状态；unreachable 表示上游版本无法确认，本次跳过安装 */
export type UpdateDependencyStatus =
  'up-to-date' | 'unreachable' | 'installed' | 'failed' | 'skipped';

/** 单个第三方依赖的更新结果 */
export type UpdateDependencyResult = {
  id: UpdateDependency;
  status: UpdateDependencyStatus;
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

/** 依赖 id → 人类可读展示名（与 runDependencyUpdate 传入的 label 保持一致） */
const DEP_LABELS: Record<UpdateDependency, string> = {
  openspec: OPENSPEC_PACKAGE,
  superpowers: 'Superpowers',
  codegraph: 'Codegraph',
};

/** 依赖状态 → i18n key（summary 段复用已有短词，避免再造一套状态文案） */
const DEP_STATUS_KEYS: Record<UpdateDependencyStatus, string> = {
  'up-to-date': 'updateUpToDate',
  unreachable: 'depStatusUnreachable',
  installed: 'updateStatusInstalled',
  failed: 'failedStatus',
  skipped: 'depStatusSkipped',
};

/** 资产类别 → i18n key */
const ASSET_KIND_KEYS: Record<PolarisAssetKind, string> = {
  skills: 'assetKindSkills',
  commands: 'assetKindCommands',
  agents: 'assetKindAgents',
  rules: 'assetKindRules',
  hooks: 'assetKindHooks',
};

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

/** 依赖更新编排共享的状态，避免三个组件各自重复传递同一组参数 */
type DepUpdateContext = {
  sourceEntries: Map<string, LockSourceEntry>;
  deps: UpdateDependencyResult[];
  force: boolean;
  log: Logger;
  lang: Languages;
};

/**
 * 单个依赖的编排：探测上游版本 → 判定是否重装 → 跳过或调用安装器 → 仅安装成功时回写 lock。
 *
 * 「已装版本」只读 lock，不再用 `npm list -g` 现场探测（用户级 CLI 不在全局 prefix 下会
 * 误报未安装）；回写的是本次解析到的上游版本，使「已装」与「上游」始终处于同一版本坐标系。
 */
async function runDependencyUpdate(
  id: UpdateDependency,
  label: string,
  resolveLatest: () => string | null | Promise<string | null>,
  install: () => Promise<UpdateDependencyStatus>,
  context: DepUpdateContext,
): Promise<void> {
  const installed = context.sourceEntries.get(id)?.version ?? null;
  const latest = await resolveLatest();
  const action = resolveDepUpdateAction(installed, latest, context.force);

  if (action.kind === 'skip') {
    if (action.reason === 'up-to-date') {
      context.log(`\n  ${label}: ${t(context.lang, 'updateDepUpToDate')} (v${installed})`);
    } else {
      context.log(`\n  ${label}: ${t(context.lang, 'updateDepUnreachable')}`);
    }
    context.deps.push({ id, status: action.reason, version: action.version ?? undefined });
    return;
  }

  context.log(`\n  ${label}...`);
  const status = await install();
  context.deps.push({ id, status, version: action.version ?? undefined });
  // 安装失败时不把「期望版本」记成「已装版本」，下次 update 才能重试
  if (status === 'installed' && action.version) {
    context.sourceEntries.set(id, { id, version: action.version });
  }
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
      return `${t(lang, ASSET_KIND_KEYS[kind])} (${status})`;
    }
    return `${t(lang, ASSET_KIND_KEYS[kind])} ${result.copied[kind] ?? 0}`;
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
    await printVersionInfo(log, (key) => t(lang, key));
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
    // 版本探测与安装共用同一套通道配置，避免「查到的版本」与「实际装到的版本」来自不同仓库
    const channel = await resolveInstallChannelConfig();
    const context: DepUpdateContext = {
      sourceEntries,
      deps,
      force: Boolean(options.force),
      log,
      lang,
    };

    if (plan.deps.includes('openspec')) {
      await runDependencyUpdate(
        'openspec',
        OPENSPEC_PACKAGE,
        () => getLatestNpmVersion(OPENSPEC_PACKAGE, channel.npmRegistry ?? null),
        () => installOpenSpec(projectPath, platforms, scope, true),
        context,
      );
    }

    if (plan.deps.includes('superpowers')) {
      await runDependencyUpdate(
        'superpowers',
        'Superpowers',
        // npx 通道装的是仓库默认分支，tag 只作为「上游是否变化」的信号，不是精确版本绑定
        () =>
          resolveVersion(SUPERPOWERS_REPO, SUPERPOWERS_MIN_VERSION, channel.githubMirror).version,
        async () =>
          (await installSuperpowersForPlatforms(projectPath, scope, platformIds, true)).status,
        context,
      );
    }

    if (plan.deps.includes('codegraph')) {
      await runDependencyUpdate(
        'codegraph',
        'Codegraph',
        () => getLatestNpmVersion(CODEGRAPH_PACKAGE, channel.npmRegistry ?? null),
        // upgradeCli=true：已装 CLI 也重新拉 @latest，但已有 .codegraph 索引时不重建
        () => installCodegraph(projectPath, scope, true, true),
        context,
      );
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
      installedAt: previousLock?.installedAt ?? localIso(),
      updatedAt: localIso(),
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
    const label = DEP_LABELS[entry.id] ?? entry.id;
    const status = t(lang, DEP_STATUS_KEYS[entry.status] ?? entry.status);
    log(`  ${label}: ${status}${entry.version ? ` (${entry.version})` : ''}`);
  }

  log('');
  log(`  ${t(lang, 'summary')}`);
  const scopeLabel =
    scope === 'global' ? t(lang, 'scopeValueGlobal') : t(lang, 'scopeValueProject');
  const languageLabel = language === 'en' ? t(lang, 'languageValueEn') : t(lang, 'languageValueZh');
  log(`  ${t(lang, 'summaryScope')} ${scopeLabel}  ${t(lang, 'summaryLanguage')} ${languageLabel}`);
  log(`  ${PACKAGE_NAME}@${getCurrentVersion()} (${t(lang, 'assetsLabel')} ${manifest.version})`);
  log(t(lang, 'updateComplete'));

  return result;
}

export async function updateCommand(projectPath: string, options: UpdateOptions): Promise<void> {
  await runUpdate(projectPath, options);
}
