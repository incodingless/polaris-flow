/**
 * `polaris init` 命令编排：探测 → 交互选择（prompts）→ 安装 OpenSpec/Superpowers/Polaris → 结果展示。
 * 不持有底层交互实现；选择与覆盖策略见 `./prompts`。
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
  ensureBundledSkillsSource,
  getBundledSkillsSourceDir,
} from '../core/integrations/bundled-skills.js';
import { installOpenSpec } from '../core/integrations/openspec.js';
import {
  installSuperpowersForPlatforms,
  SUPERPOWERS_MIN_VERSION,
} from '../core/integrations/superpowers.js';
import {
  writeLockFile,
  type LockSourceEntry,
  initPolarisConfig,
  installPolarisForPlatform,
} from '../core/install.js';
import {
  getNpmPackageVersion,
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
import { CODEGRAPH_PACKAGE, installCodegraph } from '../core/integrations/codegraph.js';
import { fileExists } from '../utils/file-system.js';
import { writeYamlFromTemplate } from '../utils/yaml-io.js';
import { loadManifestConfig } from '../core/assets/manifest.js';
import { readInstallSectionFromFile } from '../core/install/channels.js';

type InstallStatus = 'installed' | 'skipped' | 'failed';

export type PluginInstallResult = {
  id: string;
  version: string;
  status: InstallStatus;
};

export type InitPlatformResult = {
  baseDir: string;
  platformId: string;
  platformName: string;
  openspec: InstallStatus;
  superpowers: InstallStatus;
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

/** 将平台资产失败与 Superpowers 组件失败分开，避免「已安装又失败」误报 */
export function classifyInitSummary(results: InitPlatformResult[]): {
  installed: InitPlatformResult[];
  skipped: InitPlatformResult[];
  platformFailed: InitPlatformResult[];
  superpowersFailed: InitPlatformResult[];
} {
  return {
    installed: results.filter(
      (r) =>
        r.polaris === 'installed' || r.superpowers === 'installed' || r.openspec === 'installed',
    ),
    skipped: results.filter(
      (r) => r.polaris === 'skipped' && r.superpowers === 'skipped' && r.openspec === 'skipped',
    ),
    platformFailed: results.filter((r) => r.polaris === 'failed' || r.openspec === 'failed'),
    superpowersFailed: results.filter((r) => r.superpowers === 'failed'),
  };
}

type Logger = (message: string) => void;

const OPENSPEC_PACKAGE = '@fission-ai/openspec';

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
  `  ${bold('OpenSpec')} + ${bold('Superpowers')} + ${bold('Polaris')} Workflow`,
  ``,
].join('\n');

function createLogger(json: boolean): Logger {
  return json ? () => {} : (message: string) => console.log(message);
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
  const installed = summary.installed;
  const skipped = summary.skipped;
  const superpowersFailed = summary.superpowersFailed;
  const platformAssetFailed = summary.platformFailed;

  if (installed.length > 0) {
    console.log(`  ${green(t(lang, 'installed'))}`);
    for (const r of installed) {
      console.log(`    ${green('✓')}  ${bold(r.platformName)} ${dim(`${r.baseDir}/skills/`)}`);
    }
  }
  if (skipped.length > 0) {
    console.log(
      `  ${yellow(t(lang, 'skippedLabel'))}  ${skipped.map((r) => r.platformName).join(', ')}`,
    );
  }
  if (platformAssetFailed.length > 0) {
    console.log(
      `  ${red(t(lang, 'failedLabel'))}   ${platformAssetFailed.map((r) => r.platformName).join(', ')}`,
    );
  }
  if (superpowersFailed.length > 0) {
    console.log(`  ${red(t(lang, 'failedComponentSuperpowers'))}`);
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
  const lockSources: LockSourceEntry[] = [];
  const platformResults: InitPlatformResult[] = [];
  const pluginResults: PluginInstallResult[] = [];
  // --- 1. OpenSpec ---
  const osPlatforms = plans
    .filter((p) => p.osAction !== 'skip' && p.platform.openspecToolId)
    .map((p) => p.platform);
  let osGlobalStatus: InstallStatus = 'skipped';

  if (osPlatforms.length > 0) {
    const osLabels = osPlatforms.map((p) => p.id).join(', ');
    log(`\n  ${blue('⏳')} ${bold('OpenSpec')} ${dim(`${t(lang, 'installingOS')} ${osLabels}`)}`);
    osGlobalStatus = await installOpenSpec(projectPath, osPlatforms, scope, true);
    log(`  ${statusSymbol(osGlobalStatus)}  OpenSpec ${statusLabel(osGlobalStatus, lang)}`);
    const installedVersion =
      osGlobalStatus === 'installed' ? getNpmPackageVersion(OPENSPEC_PACKAGE) : '0.0.0';

    pluginResults.push({
      id: 'openspec',
      version: installedVersion,
      status: osGlobalStatus,
    });

    lockSources.push({
      id: 'openspec',
      version: installedVersion,
    });
  } else {
    log(`\n  ${dim('○')}  OpenSpec ${dim(t(lang, 'skip'))}`);
  }

  // --- 2. Superpowers ---
  const spPlatformIds = plans.filter((p) => p.spAction !== 'skip').map((p) => p.platform.id);
  let spGlobalStatus: InstallStatus = 'skipped';

  if (spPlatformIds.length > 0) {
    log(`\n  ${blue('⏳')} ${bold('Superpowers')} ${dim(`>= ${SUPERPOWERS_MIN_VERSION}`)}...`);
    const spResult = await installSuperpowersForPlatforms(projectPath, scope, spPlatformIds, true);
    spGlobalStatus = spResult.status;
    log(`  ${statusSymbol(spGlobalStatus)}  Superpowers ${statusLabel(spGlobalStatus, lang)}`);

    pluginResults.push({
      id: 'superpowers',
      version: spResult.version,
      status: spGlobalStatus,
    });

    if (spGlobalStatus === 'installed') {
      lockSources.push({
        id: 'superpowers',
        version: spResult.version,
      });
    }
  } else {
    log(`\n  ${dim('○')}  Superpowers ${dim(t(lang, 'skip'))}`);
  }

  // --- 3. Codegraph ---
  const shouldInstallCodegraph = plans.some((p) => p.codegraphAction !== 'skip');

  if (shouldInstallCodegraph) {
    log(`\n  ${blue('⏳')} ${bold('Codegraph')}...`);
    const codegraphGlobalStatus = await installCodegraph(
      projectPath,
      scope,
      shouldInstallCodegraph,
    );
    log(
      `  ${statusSymbol(codegraphGlobalStatus)}  Codegraph ${statusLabel(codegraphGlobalStatus, lang)}`,
    );

    const codegraphVersion =
      codegraphGlobalStatus === 'installed' ? getNpmPackageVersion(CODEGRAPH_PACKAGE) : '0.0.0';

    pluginResults.push({
      id: 'codegraph',
      version: codegraphVersion,
      status: codegraphGlobalStatus,
    });

    lockSources.push({
      id: 'codegraph',
      version: codegraphVersion,
    });
  } else {
    log(`\n  ${dim('○')}  Codegraph ${dim(t(lang, 'skip'))}`);
  }

  // --- 4. 附带技能源（图表工具；GitHub 优先，本地兜底）---
  // 注意：这里只负责把源拉到 ~/.polaris/components/bundled-skills，
  // 真正的落盘在 installPolarisForPlatform 的 skills 步骤里做本地拷贝。
  if (plans.some((p) => p.polarisAction !== 'skip')) {
    log(
      `\n  ${blue('⏳')} ${bold('Diagram')} ${dim(`(archify / diagram-design → ${getBundledSkillsSourceDir()})`)}...`,
    );
    const bundled = await ensureBundledSkillsSource();
    if (bundled.missing.length === 0) {
      log(`  ${statusSymbol('installed')}  Diagram ${statusLabel('installed', lang)}`);
    } else {
      log(
        `  ${statusSymbol('failed')}  Diagram ${statusLabel('failed', lang)} ${dim(bundled.missing.join(', '))}`,
      );
      for (const [name, reason] of Object.entries(bundled.errors)) {
        log(`  ${dim(`↳ ${name}: ${reason}`)}`);
      }
      log(
        `  ${dim('↳ 本地已有副本仍会安装。手动重试：POLARIS_GITHUB_MIRROR=<镜像> polaris init')}`,
      );
    }
  }

  // --- 5. Polaris bundled（skills → commands → agents → rules → hooks）---
  const polarisNeeded = plans.some((p) => p.polarisAction !== 'skip');
  let polarisGlobalStatus: InstallStatus = 'skipped';

  if (polarisNeeded) {
    log(`\n  ${blue('⏳')} ${bold('Polaris')} ${dim('(bundled)')}...`);
    try {
      //----- 1. 创建Polaris公共工作目录结构与配置 -----
      await initializePolarisCommonLayout(projectPath, scope);

      //----- 2. 生成 Polaris 全局配置文件 -----
      await generatePolarisGlobalConfig(
        getGlobalPolarisConfigPath(),
        Boolean(options.overwrite),
        pluginResults,
      );

      //----- 3. 生成 Polaris 项目配置文件 -----
      await initPolarisConfig(projectPath, language, scope, platforms, Boolean(options.overwrite));

      //----- 4. 按选择的平台逐个安装 Polaris -----
      for (const plan of plans) {
        if (plan.polarisAction === 'skip') continue;

        const result = await installPolarisForPlatform(
          baseDir,
          plan.platform,
          plan.polarisAction === 'overwrite',
          language,
          scope,
          projectPath,
        );

        platformResults.push({
          baseDir: baseDir,
          platformId: plan.platform.id,
          platformName: plan.platform.name,
          openspec:
            plan.osAction !== 'skip' && plan.platform.openspecToolId ? osGlobalStatus : 'skipped',
          superpowers: plan.spAction !== 'skip' ? spGlobalStatus : 'skipped',
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

      const assetsDir = getAssetsDir();
      const manifest = await loadManifestConfig(assetsDir);

      lockSources.push({ id: 'polaris', version: manifest.version });
    } catch (err) {
      log(`  ${red('✗')}  Polaris: ${red((err as Error).message)}`);
      polarisGlobalStatus = 'failed';
    }
  } else {
    log(`\n  ${dim('○')}  Polaris ${dim(t(lang, 'skip'))}`);
  }

  // --- 6. Hooks 安装结果汇报（已由 installPolarisForPlatform 注册）---
  if (polarisGlobalStatus === 'installed') {
    log(`\n  ${blue('⏳')} ${bold('Hooks')}...`);
    for (const plan of plans) {
      if (plan.polarisAction === 'skip') continue;

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
      baseDir: baseDir,
      platformId: plan.platform.id,
      platformName: plan.platform.name,
      openspec:
        plan.osAction !== 'skip' && plan.platform.openspecToolId ? osGlobalStatus : 'skipped',
      superpowers: plan.spAction !== 'skip' ? spGlobalStatus : 'skipped',
      polaris: plan.polarisAction === 'skip' ? 'skipped' : polarisGlobalStatus,
      skills: { copied: 0, skipped: 0 },
      commands: { copied: 0, skipped: 0 },
      agents: { copied: 0, skipped: 0 },
      rules: { copied: 0, skipped: 0 },
      hooks: { installed: false },
    });
  }

  if (lockSources.length > 0) {
    await writeLockFile(
      projectPath,
      language,
      scope,
      platforms.map((p) => p.id),
      lockSources,
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

/**
 * 基于 polaris.example.yaml 生成全局 `~/.polaris/polaris.yaml`。
 * 保留模板注释；写入 version / install-time / plugins。
 * @param polarisGlobalConfigPath 全局配置路径
 * @param overwrite 为 true 时即使文件已存在也按模板重写
 * @param pluginResults 已安装插件列表，写入 plugins 字段
 */
async function generatePolarisGlobalConfig(
  polarisGlobalConfigPath: string,
  overwrite: boolean = false,
  pluginResults: PluginInstallResult[],
): Promise<void> {
  const existed = await fileExists(polarisGlobalConfigPath);
  if (!overwrite && existed) {
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
      doc.set('install-time', new Date().toISOString());
      doc.set(
        'plugins',
        pluginResults.map((p) => ({
          id: p.id,
          version: p.version,
        })),
      );
      if (existingInstall) {
        doc.setIn(['install', 'github-mirror'], existingInstall.githubMirror ?? '');
        doc.setIn(['install', 'npm-registry'], existingInstall.npmRegistry ?? '');
        doc.setIn(
          ['install', 'local-paths', 'openspec'],
          existingInstall.localPaths.openspec ?? '',
        );
        doc.setIn(
          ['install', 'local-paths', 'superpowers'],
          existingInstall.localPaths.superpowers ?? '',
        );
        doc.setIn(
          ['install', 'local-paths', 'codegraph'],
          existingInstall.localPaths.codegraph ?? '',
        );
      }
    },
  });
}
