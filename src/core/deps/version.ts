/**
 * Polaris 包版本读取与 npm registry 更新检查。
 */
import { createRequire } from 'module';

import { getLatestNpmVersion } from './npm.js';

const require = createRequire(import.meta.url);
const { version: CURRENT_VERSION } = require('../../../package.json');

const PACKAGE_NAME = 'polaris-flow';

/** npm 更新检查结果；checked=false 表示网络未成功 */
export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  checked: boolean;
}

/**
 * 比较两个 semver 版本字符串。
 * 若 a > b 返回正数，a < b 返回负数，相等返回 0。
 */
export function compareVersions(a: string, b: string): number {
  const parseParts = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((part) => {
        const numeric = parseInt(part, 10);
        return Number.isNaN(numeric) ? 0 : numeric;
      });

  const partsA = parseParts(a);
  const partsB = parseParts(b);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) {
      return numA - numB;
    }
  }

  return 0;
}

/** 获取当前安装的 polaris-flow 版本。 */
export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}

/**
 * 从命令行输出里取出第一个 semver。
 *
 * 不同 CLI 的 `--version` 输出格式不一（`1.7.0` / `openspec 1.7.0` / `v1.7.0-beta.1`），
 * 统一用正则抓取而不是按前缀切片。取不到返回 null —— 调用方必须据此放弃判断，
 * 不要猜一个版本来比较。
 */
export function extractSemver(raw: string): string | null {
  const match = raw.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
  return match ? match[0] : null;
}

/**
 * 从 npm registry 获取最新版本。
 * 网络不可达时返回 null。
 */
export function getLatestVersion(): Promise<string | null> {
  return getLatestNpmVersion(PACKAGE_NAME);
}

/** 检查是否有可用更新。registry 不可达时静默返回 checked: false。 */
export async function checkForUpdate(): Promise<VersionCheckResult> {
  const currentVersion = getCurrentVersion();
  const latestVersion = await getLatestVersion();

  if (latestVersion === null) {
    return {
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      checked: false,
    };
  }

  return {
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    checked: true,
  };
}

/** 在命令开头打印版本信息，文案由调用方注入翻译函数，避免 core 依赖命令层 i18n。 */
export async function printVersionInfo(
  log: (message: string) => void,
  translate: (key: string) => string,
): Promise<VersionCheckResult> {
  const result = await checkForUpdate();

  log(`  Polaris Flow v${result.currentVersion}`);

  if (!result.checked) {
    return result;
  }

  if (result.hasUpdate) {
    const message = translate('versionCheckNewAvailable')
      .replace('{version}', result.latestVersion ?? '')
      .replace('{package}', PACKAGE_NAME);
    log(`  ${message}`);
  } else {
    log(`  ${translate('versionCheckUpToDate')}`);
  }

  return result;
}

export { PACKAGE_NAME };
