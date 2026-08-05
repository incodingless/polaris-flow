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
import { detectPlatforms, getBaseDir } from '../core/integration/detect.js';
import { installOpenSpec } from '../core/integration/openspec.js';
import {
  installSuperpowersForPlatforms,
  SUPERPOWERS_MIN_VERSION,
} from '../core/integration/superpowers.js';
import {
  writeLockFile,
  type LockSourceEntry,
  initPolarisConfig,
  installPolarisForPlatform,
} from '../core/install.js';
import { getNpmPackageVersion } from '../core/deps/npm.js';
import { getAssetsDir, getGlobalPolarisConfigSrc } from '../core/assets/manifest.js';
import { getGlobalPolarisConfigPath } from '../core/assets/polaris-paths.js';
import { getSettingsFilePath } from '../core/platforms.js';
import { bold, dim, cyan, green, yellow, red, blue, drawBox } from '../utils/color.js';
import type { InstallScope, Language } from '../core/config/polaris-project-config.js';
import { initializePolarisCommonLayout } from '../core/install/layout.js';
import { installCodegraph } from '../core/integration/codegraph.js';
import { ensureDir, fileExists } from '../utils/file-system.js';
import { readFile, writeFile } from 'fs/promises';
import { parseDocument } from 'yaml';
import { loadManifestConfig } from '../core/assets/manifest.js';

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
  language: Language;
  platforms: string[];
  results: InitPlatformResult[];
};

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

function statusSymbol(status: InstallStatus): string {
  if (status === 'installed') return green('✓');
  if (status === 'skipped') return dim('○');
  return red('✗');
}

function statusLabel(status: InstallStatus, lang: Language): string {
  if (status === 'installed') return green('installed');
  if (status === 'skipped') return dim(t(lang, 'skip'));
  return red(t(lang, 'failedStatus'));
}

function displaySummary(results: InitPlatformResult[], scope: InstallScope, lang: Language): void {
  const scopeLabel = scope === 'global' ? os.homedir() : 'project';

  console.log(
    `\n  ${green(bold('✓'))}  ${bold(t(lang, 'setupComplete'))} ${dim(`${t(lang, 'summaryScope')} ${scopeLabel}`)}\n`,
  );

  const installed = results.filter(
    (r) => r.polaris === 'installed' || r.superpowers === 'installed' || r.openspec === 'installed',
  );
  const skipped = results.filter(
    (r) => r.polaris === 'skipped' && r.superpowers === 'skipped' && r.openspec === 'skipped',
  );
  const failed = results.filter(
    (r) => r.polaris === 'failed' || r.superpowers === 'failed' || r.openspec === 'failed',
  );

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
  if (failed.length > 0) {
    console.log(
      `  ${red(t(lang, 'failedLabel'))}   ${failed.map((r) => r.platformName).join(', ')}`,
    );
  }

  console.log(`\n  ${bold(t(lang, 'getStarted'))}`);
  console.log(`    ${cyan(t(lang, 'getStartedPolaris'))}`);
  console.log(`    ${cyan(t(lang, 'getStartedHotfix'))}`);
  console.log(`    ${cyan(t(lang, 'getStartedTweak'))}\n`);
}

export async function runInit(rawPath: string, options: InitPromptOptions): Promise<InitResult> {
  const log = createLogger(Boolean(options.json));

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
  const language = await selectLanguage(options, langHint);
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
  let codegraphGlobalStatus: InstallStatus = 'skipped';

  let codegraphVersion = '0.0.0';

  if (shouldInstallCodegraph) {
    log(`\n  ${blue('⏳')} ${bold('Codegraph')}...`);
    codegraphGlobalStatus = await installCodegraph(projectPath, scope, shouldInstallCodegraph);
    log(
      `  ${statusSymbol(codegraphGlobalStatus)}  Codegraph ${statusLabel(codegraphGlobalStatus, lang)}`,
    );

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

  // --- 3. Polaris bundled（skills → commands → agents → rules → hooks）---
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

  // --- 4. Hooks 安装结果汇报（已由 installPolarisForPlatform 注册）---
  if (polarisGlobalStatus === 'installed') {
    log(`\n  ${blue('⏳')} ${bold('Hooks')}...`);
    for (const plan of plans) {
      if (plan.polarisAction === 'skip') continue;

      const result = platformResults.find((r) => r.platformId === plan.platform.id);
      const hooks = result?.hooks ?? { installed: false };

      if (hooks.installed) {
        const hooksLocation = getSettingsFilePath(plan.platform, scope);
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
  if (!overwrite && (await fileExists(polarisGlobalConfigPath))) {
    return;
  }

  // 始终从模板读，避免 copyIfMissing 未完成或 overwrite 时读到旧/空目标
  const templateText = await readFile(getGlobalPolarisConfigSrc(), 'utf-8');
  const doc = parseDocument(templateText, { keepSourceTokens: true });

  doc.set('version', '0.1.0');
  doc.set('install-time', new Date().toISOString());
  doc.set(
    'plugins',
    pluginResults.map((p) => ({
      id: p.id,
      version: p.version,
    })),
  );

  await ensureDir(path.dirname(polarisGlobalConfigPath));
  const text = String(doc);
  await writeFile(polarisGlobalConfigPath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}
