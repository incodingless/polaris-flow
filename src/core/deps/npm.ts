/**
 * npm / npx 可执行文件、全局 prefix 可写性，以及伴生 CLI（openspec / codegraph）的
 * 「装到哪、从哪找」决策。
 *
 * 关键约定：全局 npm 目录不可写时**不要求 sudo**，改装到 `~/.polaris/cli`（见
 * `resolveCliInstallTarget`）。sudo 装出来的文件属主是 root，普通用户既改不了也升级不了。
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { getUserCliBinDir, getUserCliPrefixDir } from '../assets/polaris-paths.js';

/** 按平台返回 npm 或 npx 可执行名（Windows 用 .cmd） */
export function getNodeToolExecutable(
  tool: 'npm' | 'npx',
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    return tool === 'npm' ? 'npm.cmd' : 'npx.cmd';
  }
  return tool;
}

/**
 * 查询全局安装的 npm 包版本；失败时返回 '0.0.0'。
 */
export function getNpmPackageVersion(packageName: string): string {
  try {
    const output = execFileSync(
      getNodeToolExecutable('npm'),
      ['list', '-g', packageName, '--json'],
      {
        encoding: 'utf-8',
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const data = JSON.parse(output);
    return data.dependencies?.[packageName]?.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 查询 npm 全局 prefix 目录；失败时返回 null。
 */
export function getNpmGlobalPrefix(): string | null {
  try {
    const output = execFileSync(getNodeToolExecutable('npm'), ['config', 'get', 'prefix'], {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim() || null;
  } catch {
    return null;
  }
}

/**
 * 探测全局 prefix 目录是否可写（建临时文件实测，避免 access() 在 Windows ACL 上误判）。
 * prefix 可能尚未创建（全新环境）：向上找最近已存在祖先再探测。
 * 返回 null 表示无法判定（取不到 prefix 或找不到可探测的祖先）。
 */
export function isNpmGlobalPrefixWritable(prefix: string): boolean | null {
  let probe = prefix;
  while (probe && !fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) return null;
    probe = parent;
  }
  if (!probe) return null;

  const probeFile = path.join(probe, `.polaris-write-probe-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probeFile, '');
    return true;
  } catch {
    return false;
  } finally {
    try {
      fs.unlinkSync(probeFile);
    } catch {
      // 探测文件本就不存在则忽略
    }
  }
}

/** 伴生 CLI 的安装落点：全局（可写时）或用户目录（不可写时） */
export type CliInstallTarget = {
  /** global = 沿用 npm 默认全局 prefix；user = 装到 `~/.polaris/cli` */
  kind: 'global' | 'user';
  /** 传给 `npm install -g --prefix` 的前缀；global 时为 undefined */
  prefix?: string;
};

/**
 * 决定伴生 CLI（openspec / codegraph）装到哪。
 *
 * 全局目录可写 → 走全局（系统级 node 之外最常见的情况：nvm / 官方安装包，prefix 属于当前用户）。
 * 全局目录**不可写** → 装到 `~/.polaris/cli`，绝不引导 sudo：
 *   sudo 装出来的文件属主是 root，普通用户后续 `polaris update` 升不了级、
 *   甚至读不了 —— 这正是「必须 sudo 才能装」那类问题的真正代价。
 * 取不到 prefix 或无法判定可写性时按可写处理，避免把能用的环境误降级到用户目录。
 */
export function resolveCliInstallTarget(): CliInstallTarget {
  const globalPrefix = getNpmGlobalPrefix();
  if (!globalPrefix) return { kind: 'global' };
  if (isNpmGlobalPrefixWritable(globalPrefix) !== false) return { kind: 'global' };
  return { kind: 'user', prefix: getUserCliPrefixDir() };
}

/** 目录内查找可执行文件（Windows 依次试 .cmd/.exe/.ps1/无后缀） */
function findExecutableInDir(dir: string, name: string): string | null {
  const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', '.ps1', ''] : [''];
  for (const suffix of suffixes) {
    const candidate = path.join(dir, `${name}${suffix}`);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // 不存在，继续试下一个后缀
    }
  }
  return null;
}

/** 命令能否由当前 PATH 解析（用 POSIX 内建 `command -v`，最小化 Linux 无外部 `which`） */
function isOnPath(name: string): boolean {
  try {
    if (process.platform === 'win32') {
      execFileSync('where', [name], { stdio: 'ignore', timeout: 10_000 });
      return true;
    }
    execFileSync('sh', ['-c', 'command -v "$1"', 'sh', name], {
      stdio: 'ignore',
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

const pnpmBinDirCache = new Map<string, string | null>();

/** pnpm 全局 bin 目录（pnpm 的全局安装不落在 npm prefix 下，需单独找）；失败缓存 null */
function getPnpmGlobalBinDir(): string | null {
  const key = process.platform;
  const cached = pnpmBinDirCache.get(key);
  if (cached !== undefined) return cached;

  let resolved: string | null = null;
  try {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const out = execFileSync(pnpm, ['bin', '-g'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
      shell: process.platform === 'win32',
    }).trim();
    resolved = out || null;
  } catch {
    // pnpm 未安装或未配置全局 bin
  }
  pnpmBinDirCache.set(key, resolved);
  return resolved;
}

/**
 * 定位伴生 CLI 可执行文件，按 PATH → 用户级 `~/.polaris/cli/bin` → pnpm 全局 bin 顺序解析。
 *
 * 返回绝对路径；PATH 已能解析时返回命令名本身。全部失败返回 null。
 * 用户级 bin 不在 PATH 上也能被找到 —— 这是「没 sudo 也能装完就用」的前提。
 */
export function resolveCliExecutable(name: string): string | null {
  if (isOnPath(name)) return name;

  const userLevel = findExecutableInDir(getUserCliBinDir(), name);
  if (userLevel) return userLevel;

  const pnpmBin = getPnpmGlobalBinDir();
  if (pnpmBin) {
    const viaPnpm = findExecutableInDir(pnpmBin, name);
    if (viaPnpm) return viaPnpm;
  }
  return null;
}

/**
 * 用户级 bin 是否装了东西且不在 PATH 上 —— 用于 init 结束时提示加 PATH。
 * @param executable 已解析到的可执行路径
 */
export function isUserLevelCliExecutable(executable: string): boolean {
  const binDir = getUserCliBinDir();
  const normalized = path.resolve(executable);
  return normalized.startsWith(path.resolve(binDir) + path.sep);
}

/** 用户把用户级 CLI 加进 PATH 需要的一行 shell 配置 */
export function formatUserCliPathHint(): string {
  return `export PATH="${getUserCliBinDir()}:$PATH"`;
}

/**
 * 查询 npm registry 上某包的最新版本。
 *
 * 走 `npm view`，registry 取用户配置（`npm config get registry` 的默认值）：
 * 内网 Nexus 与公网 npm 均可用，且私有包（如 polaris-flow 只发在公司 Nexus）也能查到。
 * 加短超时与零重试，registry 不可达时快速返回 null，不长时间挂起。
 */
export function getLatestNpmVersion(packageName: string): Promise<string | null> {
  try {
    const output = execFileSync(
      getNodeToolExecutable('npm'),
      ['view', packageName, 'version', '--fetch-timeout=10000', '--fetch-retries=0'],
      {
        encoding: 'utf-8',
        timeout: 15_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    // `npm view <pkg> version` 成功时 stdout 为纯版本号；非法输出（如报错）返回 null
    const version = output.split('\n')[0]?.trim() ?? '';
    return Promise.resolve(/^\d/.test(version) ? version : null);
  } catch {
    return Promise.resolve(null);
  }
}
