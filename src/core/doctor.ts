/**
 * doctor 诊断：Node/命令可用性、依赖登记表逐条状态、安装状态记录与平台 polaris 安装状态。
 *
 * 依赖检查消费 `deps/registry.ts` 的 probe 声明，与 init 的判定同源：
 * 用 `isCommandAvailable` 只看 PATH 会漏掉 init 装到 `~/.polaris/cli/bin` 的 CLI
 * （全局 npm 目录不可写时的落点），从而把已装的组件误报成缺失。
 */
import { createRequire } from 'module';

import { fileExists } from '../utils/file-system.js';
import { readJsonObjectOrEmpty } from '../utils/json-io.js';
import { isCommandAvailable } from './integrations/openspec.js';
import { getBundledSkillsSourceDir } from './integrations/bundled-skills.js';
import { detectPlatforms, getBaseDir, hasSkills, readCliVersion } from './integrations/detect.js';
import { probeDependency } from './deps/probe.js';
import { DEPENDENCIES, type DependencyRequiredness, type LocalFallback } from './deps/registry.js';
import { resolveCliExecutable } from './deps/npm.js';
import { compareVersions, extractSemver } from './deps/version.js';
import { isConcreteVersion } from './update/dep-version.js';
import { getInstallStatePath, readInstallState } from './install/install-state.js';
import { PLATFORMS, getPlatformSkillsDir } from './domain/platforms.js';
import type { InstallScope } from './config/polaris-project-config.js';

const require = createRequire(import.meta.url);
const { engines } = require('../../package.json') as { engines?: { node?: string } };

/** 本程序能读懂的 install-state 格式版本；文件里更大说明记录由更新的 polaris 生成 */
const INSTALL_STATE_FORMAT_VERSION = 1;

/**
 * 单项诊断级别。
 *
 * `skip` 表示「已知未装但按设计不需阻断」——用于 optional 依赖与不适用的检查项，
 * 与 `ok`（真的没问题）区分开，避免用户看到 ✓ 却读出 "not installed" 的矛盾。
 */
export type DiagnosticStatus = 'ok' | 'warn' | 'fail' | 'skip';

/** 单项诊断结果 */
export type DiagnosticItem = {
  name: string;
  status: DiagnosticStatus;
  message: string;
  /** 失败项的修复指引（多行，命令行层按缩进原样输出） */
  hint?: string;
};

function parseMinNodeVersion(range: string | undefined): number {
  if (!range) return 20;
  const match = range.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 20;
}

async function checkNode(): Promise<DiagnosticItem> {
  const minMajor = parseMinNodeVersion(engines?.node);
  const currentMajor = parseInt(process.version.slice(1).split('.')[0] ?? '0', 10);

  if (currentMajor >= minMajor) {
    return { name: 'node', status: 'ok', message: process.version };
  }

  return {
    name: 'node',
    status: 'fail',
    message: `${process.version} (requires >= ${minMajor})`,
  };
}

async function checkCommand(name: string, command: string): Promise<DiagnosticItem> {
  const available = await isCommandAvailable(command);
  return {
    name,
    status: available ? 'ok' : 'fail',
    message: available ? 'available' : 'not found in PATH',
  };
}

/**
 * 缺失依赖的诊断级别（纯函数，便于单测覆盖分级规则）。
 *
 * - `required` 缺失 → fail（工作流跑不动，doctor 应以非零码退出）
 * - `recommended` 缺失 → warn（降级可用）
 * - `optional` 缺失 → skip（少个工具，按设计不阻断；用 skip 而非 ok，避免 ✓ 与 "not installed" 打架）
 */
export function dependencyDiagnosticStatus(
  requiredness: DependencyRequiredness,
  present: boolean,
): DiagnosticStatus {
  if (present) return 'ok';
  if (requiredness === 'required') return 'fail';
  if (requiredness === 'recommended') return 'warn';
  return 'skip';
}

/** 本地保底载体的可读路径，用于失败提示 */
function describeFallback(fallback: LocalFallback): string {
  return `~/.polaris/components/${fallback.relPath}`;
}

/**
 * 逐条检查依赖登记表里的外部组件。
 *
 * 判定与 init 完全同源（`probeDependency`），因此不会出现「init 说装好了、doctor 说没有」
 * 这类两套判据打架的情况。多平台场景下任一平台命中即视为已装。
 */
async function checkDependencies(
  projectPath: string,
  scope: InstallScope = 'project',
): Promise<DiagnosticItem[]> {
  const baseDir = getBaseDir(scope, projectPath);
  const detected = await detectPlatforms(projectPath);
  const skillsDirs = PLATFORMS.filter((platform) => detected.has(platform.id)).map((platform) =>
    getPlatformSkillsDir(platform, scope, baseDir),
  );
  const bundledSkillsDir = getBundledSkillsSourceDir();

  const items: DiagnosticItem[] = [];

  for (const spec of DEPENDENCIES) {
    let present = false;
    for (const skillsDir of skillsDirs) {
      if (await probeDependency(spec, { skillsDir, bundledSkillsDir })) {
        present = true;
        break;
      }
    }
    // 未检测到平台、或平台目录都没命中时，仍要能判定 CLI 类判据
    if (!present) {
      present = await probeDependency(spec, { bundledSkillsDir });
    }

    const status = dependencyDiagnosticStatus(spec.requiredness, present);
    const label = spec.requiredness;

    if (present) {
      items.push({ name: spec.id, status, message: `installed (${label})` });
      continue;
    }

    const hint =
      status === 'fail'
        ? [
            `重新执行 polaris init；离线环境可配 install.local-paths.${spec.id} 指向本机目录`,
            spec.fallback ? `本地保底载体：${describeFallback(spec.fallback)}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : undefined;

    items.push({
      name: spec.id,
      status,
      message: `not installed (${label}${status === 'skip' ? '，不影响工作流' : ''})`,
      hint,
    });
  }

  return items;
}

/** 去掉 prerelease / build 元数据，只留 major.minor.patch 用于粗粒度比对 */
function normalizeVersion(version: string): string {
  return version.replace(/^v/, '').split('-')[0].split('+')[0];
}

/**
 * 判定「项目技能的生成基线」与「当前 CLI 版本」是否漂移（纯函数）。
 *
 * @param baseline 记录里的生成基线（上次 openspec init 用的 CLI 版本）
 * @param actual 当前 CLI 实测版本；探测失败传 null
 * @returns `null` 表示无法判定（任一侧不可比），调用方应跳过而非猜
 */
export function classifyOpenspecBaseline(
  baseline: string,
  actual: string | null,
): 'consistent' | 'drifted' | null {
  if (!isConcreteVersion(baseline)) return null;
  if (!actual || !isConcreteVersion(actual)) return null;
  return compareVersions(normalizeVersion(actual), normalizeVersion(baseline)) === 0
    ? 'consistent'
    : 'drifted';
}

/**
 * 检查项目里的 openspec 技能是否由当前 CLI 版本生成。
 *
 * 为什么只查 openspec：
 * - `openspec init` 的产物是**项目里的技能与命令文件**，不是指向全局 CLI 的引用。
 *   所以「项目技能的版本」等于上次 init 时那个 CLI 的版本；用户手动 `npm i -g` 升级 CLI 后，
 *   技能会静默过期，而 probe 只能回答「在不在」，回答不了「旧不旧」。
 * - superpowers 不做：npx 通道没有本地版本号，它的「版本」是上游 tag，比对必须联网，
 *   doctor 不该依赖网络。
 * - codegraph 不做：项目产物是可重建的索引，不是需要共享的资产，过期无副作用。
 *
 * 基线取 `.polaris/install-state.json` 的 `sources[].version`；实际版本直接读
 * `openspec --version`（`npm list -g` 在用户级安装时查不到）。任一侧不可比就不判断 ——
 * 宁可少报，不要误报。
 */
async function checkOpenspecBaseline(projectPath: string): Promise<DiagnosticItem | null> {
  const state = await readInstallState(projectPath);
  const baseline = state?.sources.find((entry) => entry.id === 'openspec')?.version ?? '';
  if (!isConcreteVersion(baseline)) return null;

  const executable = resolveCliExecutable('openspec');
  // CLI 缺失已由 checkDependencies 报 fail，这里不重复报
  if (!executable) return null;

  const actual = extractSemver(readCliVersion(executable));
  const verdict = classifyOpenspecBaseline(baseline, actual);
  if (verdict === null) return null;

  if (verdict === 'consistent') {
    return {
      name: 'openspec-skills',
      status: 'ok',
      message: `与当前 CLI 一致 (v${baseline})`,
    };
  }

  return {
    name: 'openspec-skills',
    status: 'warn',
    message: `项目技能由 v${baseline} 生成，当前 CLI 是 v${actual}`,
    hint: 'polaris update --only openspec   # 用当前 CLI 重新生成项目技能',
  };
}

/**
 * 检查 `.polaris/install-state.json`（安装状态记录）。
 *
 * 只看文件是否可解析、格式版本是否为本程序认识的版本；不做语义判断——
 * 「某依赖是否可用」由 `checkDependencies` 现查，比读记录更可靠。
 */
async function checkInstallState(projectPath: string): Promise<DiagnosticItem> {
  const statePath = getInstallStatePath(projectPath);
  if (!(await fileExists(statePath))) {
    return {
      name: 'install-state.json',
      status: 'warn',
      message: 'not found（尚未在本目录执行过 polaris init）',
    };
  }

  try {
    const raw = await readJsonObjectOrEmpty(statePath);
    const formatVersion = (raw as { version?: unknown }).version;
    if (typeof formatVersion === 'number' && formatVersion > INSTALL_STATE_FORMAT_VERSION) {
      return {
        name: 'install-state.json',
        status: 'warn',
        message: `format v${formatVersion}（本程序支持到 v${INSTALL_STATE_FORMAT_VERSION}，建议升级 polaris）`,
      };
    }
    return { name: 'install-state.json', status: 'ok', message: statePath };
  } catch (error) {
    return {
      name: 'install-state.json',
      status: 'fail',
      message: `invalid JSON at ${statePath}: ${(error as Error).message}`,
    };
  }
}

async function checkPolarisSkills(
  projectPath: string,
  scope: InstallScope = 'project',
): Promise<DiagnosticItem> {
  const baseDir = getBaseDir(scope, projectPath);
  const detected = await detectPlatforms(projectPath);
  let installedCount = 0;

  for (const platform of PLATFORMS) {
    if (!detected.has(platform.id)) {
      continue;
    }
    const skillsBaseDir = getPlatformSkillsDir(platform, scope, baseDir);
    if (await hasSkills(skillsBaseDir, 'polaris')) {
      installedCount++;
    }
  }

  if (installedCount > 0) {
    return {
      name: 'polaris-skills',
      status: 'ok',
      message: `${installedCount} platform(s) with Polaris skills`,
    };
  }

  return {
    name: 'polaris-skills',
    status: 'warn',
    message: 'no Polaris skills detected on configured platforms',
  };
}

/** 运行环境诊断 */
export async function runDiagnostics(
  projectPath: string,
  scope: InstallScope = 'project',
): Promise<DiagnosticItem[]> {
  const checks: DiagnosticItem[] = [];

  checks.push(await checkNode());
  // git 不是依赖表里的组件，而是 init / 在线通道的运行时前提（缺失不阻断，只提示）
  checks.push(await checkCommand('git', 'git'));
  // 依赖逐条检查：openspec / superpowers / codegraph / archify / diagram-design
  checks.push(...(await checkDependencies(projectPath, scope)));
  // 基线漂移：项目技能是否由当前 CLI 生成（只有能判定时才有该项）
  const baseline = await checkOpenspecBaseline(projectPath);
  if (baseline) checks.push(baseline);
  checks.push(await checkInstallState(projectPath));
  checks.push(await checkPolarisSkills(projectPath, scope));

  return checks;
}

/** 是否存在 fail 级别诊断项 */
export function hasDiagnosticFailure(checks: DiagnosticItem[]): boolean {
  return checks.some((item) => item.status === 'fail');
}
