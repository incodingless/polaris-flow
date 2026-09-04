/**
 * Polaris 包版本读取与 npm registry 更新检查。
 */
import { createRequire } from 'module';
import https from 'https';

const require = createRequire(import.meta.url);
const { version: CURRENT_VERSION } = require('../../../package.json');

const PACKAGE_NAME = '@polaris/polaris-flow';
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;

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
 * 从 npm registry 获取最新版本。
 * 网络不可达时返回 null。
 */
export function getLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const request = https.get(REGISTRY_URL, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }

      let data = '';
      res.on('data', (chunk: string) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as { version?: string };
          resolve(typeof parsed.version === 'string' ? parsed.version : null);
        } catch {
          resolve(null);
        }
      });
    });

    request.on('error', () => resolve(null));
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
  });
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

/** 在命令开头打印版本信息，供 init / update 使用。 */
export async function printVersionInfo(
  log: (message: string) => void,
): Promise<VersionCheckResult> {
  const result = await checkForUpdate();

  log(`  Polaris Flow v${result.currentVersion}`);

  if (!result.checked) {
    return result;
  }

  if (result.hasUpdate) {
    log(
      `  New version v${result.latestVersion} available. Run 'npm update -g ${PACKAGE_NAME}' to upgrade.`,
    );
  } else {
    log(`  You are on the latest version.`);
  }

  return result;
}

export { PACKAGE_NAME };
