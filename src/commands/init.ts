/**
 * `polaris init` 命令编排：探测 → 交互选择（prompts）→ 按依赖登记表获取外部组件 →
 * 逐平台分发 Polaris 资产 → 结果展示。
 *
 * 依赖集合与安装方式全部来自 `core/deps/registry.ts`，本文件不再为单个组件写死流程：
 * 加一个依赖只需改登记表，这里的循环会自动走对应 installer。
 */
import path from 'path';
import os from 'os';

import { t } from './i18n/index.js';
import {
  InitPromptOptions,
  buildInstallPlans,
  selectLanguage,
  selectPlatforms,
  selectScope,
} from './prompts.js';
import { detectPlatforms, getBaseDir } from '../core/integrations/detect.js';
import {
  DEPENDENCIES,
  localPathComponentIds,
  pinExpectation,
  resolveInstallerId,
  type DependencyRequiredness,
  type DependencySpec,
} from '../core/deps/registry.js';
import {
  acquireDependency,
  resolveDependencyVersion,
  type DependencyOutcome,
} from '../core/deps/install-dependency.js';
import {
  writeInstallState,
  type InstallSourceEntry,
  initPolarisConfig,
  installPolarisForPlatform,
} from '../core/install.js';
import {
  resolveCliExecutable,
  isUserLevelCliExecutable,
  formatUserCliPathHint,
} from '../core/deps/npm.js';
import { getAssetsDir, getGlobalPolarisConfigSrc } from '../core/assets/manifest.js';
import { getGlobalPolarisConfigPath } from '../core/assets/polaris-paths.js';
import { getPlatformContextDir } from '../core/domain/platforms.js';
import { resolveHooksConfigPath } from '../core/install/hooks.js';
import { bold, dim, cyan, green, yellow, red, blue, drawBox } from '../utils/color.js';
import {
  loadPolarisConfig,
  type InstallScope,
  type Languages,
} from '../core/config/polaris-project-config.js';
import { initializePolarisCommonLayout } from '../core/install/layout.js';
import { fileExists } from '../utils/file-system.js';
import { localIso } from '../utils/time.js';
import { removeYamlTopLevelKeys, writeYamlFromTemplate } from '../utils/yaml-io.js';
import { loadManifestConfig } from '../core/assets/manifest.js';
import { readInstallSectionFromFile } from '../core/install/channels.js';
import { getCurrentVersion } from '../core/deps/version.js';

type InstallStatus = 'installed' | 'skipped' | 'failed';

export type InitPlatformResult = {
  baseDir: string;
  platformId: string;
  platformName: string;
  /**
   * 外部依赖的安装状态，键为 registry 的 depId。
   * Polaris 自身不在此列——它按平台分发资产，状态见 `polaris` 字段。
   */
  dependencies: Record<string, InstallStatus>;
  polaris: InstallStatus;
  skills: { copied: number; skipped: number };
  commands: { copied: number; skipped: number };
  agents: { copied: number; skipped: number };
  rules: { copied: number; skipped: number };
  hooks: { installed: boolean; reason?: string };
};

export type InitResult = {
  projectPath: string;
  scope: InstallScope;
  language: Languages;
  platforms: string[];
  results: InitPlatformResult[];
};

/**
 * 汇总分类。
 *
 * 失败按依赖重要度分组：`required` 缺失视为安装失败，`recommended` / `optional`
 * 缺失只提示——这个分级来自登记表，不再藏在各组件自己的代码分支里。
 */
export function classifyInitSummary(results: InitPlatformResult[]): {
  installed: InitPlatformResult[];
  skipped: InitPlatformResult[];
  requiredFailed: DependencySpec[];
  recommendedFailed: DependencySpec[];
  optionalFailed: DependencySpec[];
  polarisFailed: InitPlatformResult[];
} {
  const failedIds = new Set<string>();
  for (const result of results) {
    for (const [id, status] of Object.entries(result.dependencies)) {
      if (status === 'failed') failedIds.add(id);
    }
  }

  const byLevel = (level: DependencyRequiredness): DependencySpec[] =>
    DEPENDENCIES.filter((dep) => dep.requiredness === level && failedIds.has(dep.id));

  return {
    installed: results.filter(
      (r) =>
        r.polaris === 'installed' ||
        Object.values(r.dependencies).some((status) => status === 'installed'),
    ),
    skipped: results.filter(
      (r) =>
        r.polaris === 'skipped' &&
        Object.values(r.dependencies).every((status) => status === 'skipped'),
    ),
    requiredFailed: byLevel('required'),
    recommendedFailed: byLevel('recommended'),
    optionalFailed: byLevel('optional'),
    polarisFailed: results.filter((r) => r.polaris === 'failed'),
  };
}

type Logger = (message: string) => void;

const POLARIS_BANNER = [
  ``,
  `${green('▄▄▄▄▄▄')}                                              ${red('██')}                ${green('▄▄▄▄▄▄▄▄')} ▄▄▄▄                         `,
  `${green('██▀▀▀▀█▄')}                                            ${red('▀▀')}                ${green('██▀▀▀▀▀▀')} ▀▀██                         `,
  `${green('██    ██')}  ▄████▄     ██       ▄█████▄   ██▄████   ████     ▄▄█████▄   ${green('██      ')}   ██       ▄████▄  ██      ██`,
  `${green('██████▀ ')} ██▀  ▀██    ██       ▀ ▄▄▄██   ██▀         ██     ██▄▄▄▄ ▀   ${green('███████ ')}   ██      ██▀  ▀██ ▀█  ██  █▀`,
  `${green('██      ')} ██    ██    ██      ▄██▀▀▀██   ██          ██      ▀▀▀▀██▄   ${green('██      ')}   ██      ██    ██  ██▄██▄██ `,
  `${green('██      ')} ▀██▄▄██▀    ██▄▄▄   ██▄▄▄███   ██       ▄▄▄██▄▄▄  █▄▄▄▄▄██   ${green('██      ')}   ██▄▄▄   ▀██▄▄██▀  ▀██  ██▀ `,
  `${green('▀▀      ')}   ▀▀▀▀       ▀▀▀▀    ▀▀▀▀ ▀▀   ▀▀       ▀▀▀▀▀▀▀▀   ▀▀▀▀▀▀    ${green('██')}          ▀▀▀▀     ▀▀▀▀     ▀▀  ▀▀  `,
  `${green('='.repeat(106))}`,
  `  ${dim(`v${getCurrentVersion()}`)}`,
  `  ${bold('OpenSpec')} + ${bold('Superpowers')} + ${bold('Polaris')} Workflow`,
  ``,
].join('\n');

function createLogger(json: boolean): Logger {
  return json ? () => {} : (message: string) => console.log(message);
}

/**
 * 写入 install-state 的版本值。
 *
 * - 未装成 → 空串（不代表任何版本；`isConcreteVersion` 判否，下次 update 会重建基线）
 * - 附带技能 → 声明里的钉值（tag 或 commit SHA），那是它唯一有意义的「哪一版」
 * - 其余 → 解析出的可比版本；不可比占位符（0.0.0 / local / fetched）返回空串
 */
async function recordedVersion(spec: DependencySpec, outcome: DependencyOutcome): Promise<string> {
  if (outcome.status !== 'installed') return '';
  if (spec.method.kind === 'github-copy') return pinExpectation(spec.method);
  return (await resolveDependencyVersion(spec, outcome)) ?? '';
}

/**
 * root 拦截判定（纯函数，便于单测）。
 * @param uid `process.getuid()` 的结果；Windows 上为 undefined
 * @param allowRoot `POLARIS_ALLOW_ROOT` 环境变量值
 * @returns 'block' 表示拒绝执行
 */
export function evaluateRootGuard(
  uid: number | undefined,
  allowRoot: string | undefined,
): 'allow' | 'block' {
  if (uid !== 0) return 'allow';
  return allowRoot === '1' ? 'allow' : 'block';
}

/**
 * 拒绝以 root / sudo 运行 init。
 *
 * init 会往项目目录写 `.polaris/` 与平台目录（`.trae-cn/` 等）。以 root 运行时这些文件
 * 归属 root，之后普通用户改不了文档、也提交不了 —— 这是实际踩过的坑，
 * 而 root 对 init 本身没有任何必要性：全局 npm 目录不可写时伴生 CLI 会装到
 * `~/.polaris/cli`（见 `resolveCliInstallTarget`）。容器 / CI 用 `POLARIS_ALLOW_ROOT=1` 放行。
 */
function assertNotRunningAsRoot(): void {
  if (evaluateRootGuard(process.getuid?.(), process.env.POLARIS_ALLOW_ROOT) === 'allow') return;
  // 此时还没做语言选择：按系统 locale 猜，zh 环境看中文
  const locale = (process.env.LC_ALL ?? process.env.LANG ?? '').toLowerCase();
  const lang: Languages = locale.includes('zh') ? 'zh' : 'en';
  // stdout 而非 stderr：与 init 其余输出同一通道，避免部分终端把两股流打乱
  console.log(t(lang, 'rootNotAllowed'));
  process.exit(1);
}

/**
 * git 缺失只影响在线拉取通道（Superpowers / 图表技能）。有 `~/.polaris/components`
 * 本地副本时仍能装完，所以只提示不阻断。
 */
function warnIfGitMissing(log: Logger, lang: Languages): void {
  if (resolveCliExecutable('git')) return;
  log(`  ${yellow('!')}  ${t(lang, 'gitMissing')}`);
}

/**
 * 伴生 CLI 装在用户目录时提示把 bin 加进 PATH。
 * 不加也能用（polaris 内部按绝对路径调用），但用户手动跑 openspec / codegraph 会找不到。
 */
function warnIfCompanionCliInUserDir(log: Logger, lang: Languages): void {
  const openspec = resolveCliExecutable('openspec');
  const codegraph = resolveCliExecutable('codegraph');
  const installedInUserDir = [openspec, codegraph].some(
    (exe) => exe !== null && isUserLevelCliExecutable(exe),
  );
  if (!installedInUserDir) return;
  log(`\n  ${yellow('!')}  ${t(lang, 'companionCliInUserDir')}`);
  log(`       ${cyan(formatUserCliPathHint())}`);
}

function statusSymbol(status: InstallStatus): string {
  if (status === 'installed') return green('✓');
  if (status === 'skipped') return dim('○');
  return red('✗');
}

function statusLabel(status: InstallStatus, lang: Languages): string {
  if (status === 'installed') return green('installed');
  if (status === 'skipped') return dim(t(lang, 'skip'));
  return red(t(lang, 'failedStatus'));
}

function displaySummary(results: InitPlatformResult[], scope: InstallScope, lang: Languages): void {
  const scopeLabel = scope === 'global' ? os.homedir() : 'project';

  console.log(
    `\n  ${green(bold('✓'))}  ${bold(t(lang, 'setupComplete'))} ${dim(`${t(lang, 'summaryScope')} ${scopeLabel}`)}\n`,
  );

  const summary = classifyInitSummary(results);

  if (summary.installed.length > 0) {
    console.log(`  ${green(t(lang, 'installed'))}`);
    for (const r of summary.installed) {
      console.log(`    ${green('✓')}  ${bold(r.platformName)} ${dim(`${r.baseDir}/skills/`)}`);
    }
  }
  if (summary.skipped.length > 0) {
    console.log(
      `  ${yellow(t(lang, 'skippedLabel'))}  ${summary.skipped.map((r) => r.platformName).join(', ')}`,
    );
  }
  // 失败按依赖重要度分级：required 影响可用性，recommended 降级，optional 只是少个工具
  if (summary.requiredFailed.length > 0 || summary.polarisFailed.length > 0) {
    const names = [
      ...summary.requiredFailed.map((dep) => dep.label),
      ...summary.polarisFailed.map((r) => r.platformName),
    ];
    console.log(`  ${red(t(lang, 'failedLabel'))}   ${names.join(', ')}`);
  }
  if (summary.recommendedFailed.length > 0) {
    console.log(
      `  ${yellow(t(lang, 'degradedLabel'))}  ${summary.recommendedFailed.map((dep) => dep.label).join(', ')}`,
    );
  }
  if (summary.optionalFailed.length > 0) {
    console.log(
      `  ${dim(t(lang, 'optionalMissingLabel'))}  ${summary.optionalFailed.map((dep) => dep.label).join(', ')}`,
    );
  }

  console.log(`\n  ${bold(t(lang, 'getStarted'))}`);
  console.log(`    ${cyan(t(lang, 'getStartedPolaris'))}`);
  console.log(`    ${cyan(t(lang, 'getStartedHotfix'))}`);
  console.log(`    ${cyan(t(lang, 'getStartedTweak'))}\n`);
}

export async function runInit(rawPath: string, options: InitPromptOptions): Promise<InitResult> {
  const log = createLogger(Boolean(options.json));

  assertNotRunningAsRoot();
  const projectPath = path.resolve(rawPath || process.cwd());
  const langHint = options.lang;

  if (!options.json) {
    log(`\n${POLARIS_BANNER}`);
    log(`  ${dim(t(langHint, 'settingUp'))} ${bold(projectPath)}\n`);
    log(
      drawBox(
        [
          `${cyan('◆')}  OpenSpec + Superpowers + Polaris skills`,
          `${cyan('◆')}  /polaris workflow commands`,
        ],
        42,
      ),
    );
    log('');
  }

  const detectedPlatforms = await detectPlatforms(projectPath);
  const scope = await selectScope(options, langHint);
  // 已有 config 时沿用其语言：--yes 缺省为 zh，重装不该把既有语言改掉
  const existingConfig = await loadPolarisConfig(projectPath);
  const language = await selectLanguage(options, langHint, existingConfig?.language);
  const lang = language;
  const platforms = await selectPlatforms(detectedPlatforms, options, lang);

  if (platforms.length === 0) {
    if (options.json) {
      console.log(
        JSON.stringify({ projectPath, scope, language, platforms: [], results: [] }, null, 2),
      );
      return { projectPath, scope, language, platforms: [], results: [] };
    }
    log(`\n  ${t(lang, 'noPlatforms')}\n`);
    return { projectPath, scope, language, platforms: [], results: [] };
  }

  warnIfGitMissing(log, lang);

  const baseDir = getBaseDir(scope, projectPath);
  const plans = await buildInstallPlans(baseDir, platforms, scope, options, lang);
  const installSources: InstallSourceEntry[] = [];
  const platformResults: InitPlatformResult[] = [];
  /** 获取阶段的产出，按 depId 索引；构造各平台状态与全局配置时复用 */
  const acquireOutcomes: Record<string, DependencyOutcome> = {};

  /** 某依赖在某平台是否应执行获取：动作非 skip，且平台能力满足 */
  const isAcquireNeeded = (spec: DependencySpec, plan: (typeof plans)[number]): boolean => {
    if (plan.actions[spec.id] === 'skip') return false;
    // openspec 需要平台提供 openspecToolId 才能写项目配置
    if (resolveInstallerId(spec) === 'openspec' && !plan.platform.openspecToolId) return false;
    return true;
  };

  /** 某平台的依赖状态映射：平台动作 skip 记 skipped，否则取获取阶段结果 */
  const dependencyStatusFor = (plan: (typeof plans)[number]): Record<string, InstallStatus> => {
    const status: Record<string, InstallStatus> = {};
    for (const spec of DEPENDENCIES) {
      status[spec.id] = isAcquireNeeded(spec, plan)
        ? (acquireOutcomes[spec.id]?.status ?? 'skipped')
        : 'skipped';
    }
    return status;
  };

  // --- 1. 获取外部依赖（登记表驱动）---
  // 逐条走 registry 声明的 installer。新增依赖只需改登记表，本段代码不变。
  for (const spec of DEPENDENCIES) {
    if (!plans.some((plan) => isAcquireNeeded(spec, plan))) {
      acquireOutcomes[spec.id] = { status: 'skipped' };
      log(`\n  ${dim('○')}  ${spec.label} ${dim(t(lang, 'skip'))}`);
      continue;
    }

    log(`\n  ${blue('⏳')} ${bold(spec.label)}...`);
    const outcome = await acquireDependency(spec, { projectPath, scope, platforms });
    acquireOutcomes[spec.id] = outcome;
    log(`  ${statusSymbol(outcome.status)}  ${spec.label} ${statusLabel(outcome.status, lang)}`);

    // 失败原因必须带出来：只报「没装上」无法区分网络问题与配置问题
    if (outcome.errors) {
      for (const [name, reason] of Object.entries(outcome.errors)) {
        log(`  ${dim(`↳ ${name}: ${reason}`)}`);
      }
    }
    if (outcome.status === 'failed') {
      log(
        `  ${dim('↳ 本地已有副本仍会安装。手动重试：POLARIS_GITHUB_MIRROR=<镜像> polaris init')}`,
      );
    }

    // 每条依赖都记录结果（含附带技能）：这是「本目录装了什么」的唯一依据，
    // 失败也记 status——否则无法区分「没装过」与「装了但当时失败」
    installSources.push({
      id: spec.id,
      version: await recordedVersion(spec, outcome),
      status: outcome.status,
    });
  }

  // --- 2. Polaris 资产分发（skills → commands → agents → rules → hooks）---
  const polarisNeeded = plans.some((plan) => plan.actions['polaris'] !== 'skip');
  let polarisGlobalStatus: InstallStatus = 'skipped';

  if (polarisNeeded) {
    log(`\n  ${blue('⏳')} ${bold('Polaris')} ${dim('(bundled)')}...`);
    try {
      //----- 1. 创建Polaris公共工作目录结构与配置 -----
      await initializePolarisCommonLayout(projectPath, scope);

      //----- 2. 生成 Polaris 全局配置文件 -----
      await generatePolarisGlobalConfig(getGlobalPolarisConfigPath(), Boolean(options.overwrite));

      //----- 3. 生成 Polaris 项目配置文件 -----
      await initPolarisConfig(projectPath, language, scope, platforms, Boolean(options.overwrite));

      //----- 4. 按选择的平台逐个安装 Polaris -----
      for (const plan of plans) {
        if (plan.actions['polaris'] === 'skip') continue;

        const result = await installPolarisForPlatform(
          baseDir,
          plan.platform,
          plan.actions['polaris'] === 'overwrite',
          language,
          scope,
          projectPath,
        );

        platformResults.push({
          baseDir,
          platformId: plan.platform.id,
          platformName: plan.platform.name,
          dependencies: dependencyStatusFor(plan),
          polaris: 'installed',
          skills: result.skills,
          commands: result.commands,
          agents: result.agents,
          rules: result.rules,
          hooks: result.hooks,
        });

        log(
          `  ${green('✓')}  Polaris ${dim('→')} ${plan.platform.name} ${dim(`(${result.skills.copied} ${t(lang, 'skillsCopiedSkipped')} ${result.skills.skipped} ${t(lang, 'hooksSkipped')})`)}`,
        );
      }
      polarisGlobalStatus = 'installed';

      const manifest = await loadManifestConfig(getAssetsDir());
      // Polaris 自身也记一条：它的「版本」是资产清单版本，供 update 判断资产是否变过
      installSources.push({ id: 'polaris', version: manifest.version, status: 'installed' });
    } catch (err) {
      log(`  ${red('✗')}  Polaris: ${red((err as Error).message)}`);
      polarisGlobalStatus = 'failed';
    }
  } else {
    log(`\n  ${dim('○')}  Polaris ${dim(t(lang, 'skip'))}`);
  }

  // --- 3. Hooks 安装结果汇报（已由 installPolarisForPlatform 注册）---
  if (polarisGlobalStatus === 'installed') {
    log(`\n  ${blue('⏳')} ${bold('Hooks')}...`);
    for (const plan of plans) {
      if (plan.actions['polaris'] === 'skip') continue;

      const result = platformResults.find((r) => r.platformId === plan.platform.id);
      const hooks = result?.hooks ?? { installed: false };

      if (hooks.installed) {
        const hooksLocation = resolveHooksConfigPath(
          getPlatformContextDir(plan.platform, scope, projectPath),
          plan.platform,
          scope,
        );
        log(
          `  ${green('✓')}  Hooks ${dim('→')} ${plan.platform.name} ${dim(`(${hooksLocation})`)}`,
        );
      } else if (hooks.reason?.includes('already')) {
        log(`  ${dim('○')}  Hooks: ${plan.platform.name} ${dim('already registered')}`);
      } else if (hooks.reason === 'platform does not support hooks') {
        log(`  ${dim('○')}  Hooks: ${plan.platform.name} ${dim('not supported')}`);
      } else if (hooks.reason === 'no hooks defined in manifest') {
        log(`  ${dim('○')}  Hooks: ${plan.platform.name} ${dim('none in manifest')}`);
      }
    }
  }

  // 补齐仅跳过 Polaris 但仍需记录状态的平台
  for (const plan of plans) {
    if (platformResults.some((r) => r.platformId === plan.platform.id)) continue;
    platformResults.push({
      baseDir,
      platformId: plan.platform.id,
      platformName: plan.platform.name,
      dependencies: dependencyStatusFor(plan),
      polaris: plan.actions['polaris'] === 'skip' ? 'skipped' : polarisGlobalStatus,
      skills: { copied: 0, skipped: 0 },
      commands: { copied: 0, skipped: 0 },
      agents: { copied: 0, skipped: 0 },
      rules: { copied: 0, skipped: 0 },
      hooks: { installed: false },
    });
  }

  if (installSources.length > 0) {
    await writeInstallState(
      projectPath,
      platforms.map((p) => p.id),
      installSources,
    );
  }

  const result: InitResult = {
    projectPath,
    scope,
    language,
    platforms: platforms.map((p) => p.id),
    results: platformResults,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    displaySummary(platformResults, scope, lang);
    warnIfCompanionCliInUserDir(log, lang);
    log(t(lang, 'workingDirs'));
  }

  return result;
}

export async function initCommand(projectPath: string, options: InitPromptOptions): Promise<void> {
  await runInit(projectPath, options);
}

/** 全局配置里已废弃的顶层键：旧版本曾在此写已装组件，与项目级 install-state 重复且会冻结 */
const DEPRECATED_GLOBAL_CONFIG_KEYS = ['plugins'] as const;

/**
 * 基于 polaris.example.yaml 生成全局 `~/.polaris/polaris.yaml`。
 *
 * 只写**框架级配置**（version / install-time / 安装通道）。这里不记录已装组件——
 * 组件按作用域落在各项目，记录在项目的 `.polaris/install-state.json`；
 * 全局配置记项目级组件会造成「全局写一份、项目写一份」的假多源。
 *
 * @param polarisGlobalConfigPath 全局配置路径
 * @param overwrite 为 true 时即使文件已存在也按模板重写
 */
async function generatePolarisGlobalConfig(
  polarisGlobalConfigPath: string,
  overwrite: boolean = false,
): Promise<void> {
  const existed = await fileExists(polarisGlobalConfigPath);
  if (!overwrite && existed) {
    // 旧版本写进去的 plugins 段会一直留在用户机器上（含 `superpowers: failed` 这类
    // 把状态当版本的数据），顺手清掉；其余内容与注释不动
    await removeYamlTopLevelKeys(polarisGlobalConfigPath, DEPRECATED_GLOBAL_CONFIG_KEYS);
    return;
  }

  // overwrite 重写时保留既有 install: 段（install.sh/ps1 预种或用户手配的镜像/本地目录，
  // 不能随模板重置而丢失）
  const existingInstall = existed
    ? await readInstallSectionFromFile(polarisGlobalConfigPath)
    : null;

  // 始终从模板读，避免 overwrite 时读到旧目标
  await writeYamlFromTemplate(getGlobalPolarisConfigSrc(), polarisGlobalConfigPath, {
    keepComments: true,
    transform: (doc) => {
      doc.set('version', '0.1.0');
      doc.set('install-time', localIso());
      // 模板已不含 plugins；旧文件重写时也一并抹掉残留
      for (const key of DEPRECATED_GLOBAL_CONFIG_KEYS) {
        if (doc.has(key)) doc.delete(key);
      }
      if (existingInstall) {
        doc.setIn(['install', 'github-mirror'], existingInstall.githubMirror ?? '');
        doc.setIn(['install', 'npm-registry'], existingInstall.npmRegistry ?? '');
        // 组件清单从登记表派生：新增依赖自动获得 install.local-paths.<id> 配置位
        for (const id of localPathComponentIds()) {
          doc.setIn(['install', 'local-paths', id], existingInstall.localPaths[id] ?? '');
        }
      }
    },
  });
}
