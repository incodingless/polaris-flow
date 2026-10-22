/**
 * Polaris CLI 程序本体（npm 包）自更新。
 *
 * 通道：探测用户实际使用的包管理器，用其全局安装 `@latest`。
 * 不做「下载 tarball 覆盖 dist/」式自替换 —— 跨平台、权限与签名成本高，
 * 且属于重复实现包管理器已有的能力。
 *
 * 临时执行场景（npx / bunx / pnpm dlx）下全局并没有该包，执行全局安装会在用户机器上
 * 留下一个意料之外的全局包，因此降级为「只提示」。
 */
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';

import { getNodeToolExecutable } from './npm.js';
import { PACKAGE_NAME, compareVersions, getCurrentVersion, getLatestVersion } from './version.js';

const require = createRequire(import.meta.url);

const GLOBAL_INSTALL_TIMEOUT_MS = 300_000;

/** 支持的包管理器 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** 自更新结果状态 */
export type SelfUpdateStatus = 'updated' | 'up-to-date' | 'skipped' | 'unreachable' | 'failed';

/** 自更新结果 */
export type SelfUpdateResult = {
  status: SelfUpdateStatus;
  currentVersion: string;
  latestVersion: string | null;
  packageManager?: PackageManager;
  /** skipped / failed 时的原因标识 */
  reason?: 'transient-runner' | 'install-failed';
};

/** 本包所在目录（用于反推安装方式）；解析失败返回 null */
function resolveOwnPackageDir(): string | null {
  try {
    return path.dirname(require.resolve('../../../package.json'));
  } catch {
    return null;
  }
}

/**
 * 探测包管理器。
 * 依次取：包管理器注入的 user agent（最可靠）→ 本包安装路径特征 → 回退 npm。
 */
export function detectPackageManager(): PackageManager {
  const userAgent = process.env.npm_config_user_agent ?? '';
  if (/^pnpm\//.test(userAgent)) return 'pnpm';
  if (/^yarn\//.test(userAgent)) return 'yarn';
  if (/^bun\//.test(userAgent)) return 'bun';
  if (/^npm\//.test(userAgent)) return 'npm';

  // 通过锁文件判断项目用哪个包管理器是不对的 —— 这里要知道的是**全局 CLI 怎么装的**
  const ownDir = resolveOwnPackageDir()?.replace(/\\/g, '/');
  if (ownDir) {
    if (ownDir.includes('/pnpm/')) return 'pnpm';
    if (ownDir.includes('/yarn/')) return 'yarn';
    if (ownDir.includes('/.bun/')) return 'bun';
  }

  return 'npm';
}

/** 是否由临时执行器（npx / bunx / pnpm dlx）拉起 */
export function isTransientRunnerInvocation(): boolean {
  const userAgent = process.env.npm_config_user_agent ?? '';
  if (/(?:^|\s)(npx|bunx)\//.test(userAgent) || userAgent.includes('pnpm dlx')) {
    return true;
  }
  const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
  return entry.includes('/_npx/');
}

/** 构造全局安装命令 */
export function buildGlobalInstallInvocation(packageManager: PackageManager): {
  command: string;
  args: string[];
} {
  const spec = `${PACKAGE_NAME}@latest`;
  const onWindows = process.platform === 'win32';

  switch (packageManager) {
    case 'pnpm':
      return { command: onWindows ? 'pnpm.cmd' : 'pnpm', args: ['add', '-g', spec] };
    case 'yarn':
      return { command: onWindows ? 'yarn.cmd' : 'yarn', args: ['global', 'add', spec] };
    case 'bun':
      return { command: onWindows ? 'bun.exe' : 'bun', args: ['add', '-g', spec] };
    default:
      return { command: getNodeToolExecutable('npm'), args: ['install', '-g', spec] };
  }
}

/**
 * 把程序本体更新到最新版本。
 * @param options.json 为 true 时捕获子进程输出，避免污染 JSON stdout
 */
export async function updatePolarisProgram(
  options: { json?: boolean } = {},
): Promise<SelfUpdateResult> {
  const currentVersion = getCurrentVersion();

  if (isTransientRunnerInvocation()) {
    return { status: 'skipped', currentVersion, latestVersion: null, reason: 'transient-runner' };
  }

  const latestVersion = await getLatestVersion();
  if (latestVersion === null) {
    return { status: 'unreachable', currentVersion, latestVersion: null };
  }

  if (compareVersions(latestVersion, currentVersion) <= 0) {
    return { status: 'up-to-date', currentVersion, latestVersion };
  }

  const packageManager = detectPackageManager();
  const { command, args } = buildGlobalInstallInvocation(packageManager);

  try {
    execFileSync(command, args, {
      stdio: options.json ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      timeout: GLOBAL_INSTALL_TIMEOUT_MS,
      shell: process.platform === 'win32',
    });
  } catch {
    return {
      status: 'failed',
      currentVersion,
      latestVersion,
      packageManager,
      reason: 'install-failed',
    };
  }

  return { status: 'updated', currentVersion, latestVersion, packageManager };
}
