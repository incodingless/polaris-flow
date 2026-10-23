/**
 * CLI 类组件（OpenSpec / Codegraph）的三通道安装执行器。
 * 通道语义：npm 通道用 `<pkg>@latest`；git 镜像与本地目录通道统一用
 * `npm install -g <目录>` 承接 build/link（不自造 npm link / shim）。
 *
 * `prefix` 非空时走用户级安装（`~/.polaris/cli`），用于全局 npm 目录不可写的环境。
 */
import { execFileSync } from 'child_process';

import { getNodeToolExecutable } from '../deps/npm.js';
import { cleanupTemp, fetchRepo, resolveVersion } from '../deps/github.js';

/** 组装 `npm install -g <target> [--registry <r>] [--prefix <dir>]` 参数 */
export function buildNpmGlobalInstallArgs(
  target: string,
  registry?: string,
  prefix?: string,
): string[] {
  const args = ['install', '-g', target];
  if (registry) {
    args.push('--registry', registry);
  }
  if (prefix) {
    args.push('--prefix', prefix);
  }
  return args;
}

/** 执行 `npm install -g <target> [--registry] [--prefix]`；失败抛错 */
export function npmInstallGlobal(
  target: string,
  registry?: string,
  timeoutMs = 180_000,
  prefix?: string,
): void {
  execFileSync(getNodeToolExecutable('npm'), buildNpmGlobalInstallArgs(target, registry, prefix), {
    stdio: 'inherit',
    timeout: timeoutMs,
    shell: process.platform === 'win32',
  });
}

/** git 镜像通道：clone（镜像来自 channels 配置）→ npm i -g <clone>；成功 true / 失败 false（不抛） */
export async function installCliFromGitRepo(
  repo: string,
  minVersion: string,
  mirror?: string,
  registry?: string,
  prefix?: string,
): Promise<boolean> {
  let tmpDir: string | undefined;
  try {
    const resolved = resolveVersion(repo, minVersion, mirror);
    const fetched = await fetchRepo(repo, resolved.version, mirror);
    tmpDir = fetched.localPath;
    npmInstallGlobal(fetched.localPath, registry, 180_000, prefix);
    return true;
  } catch (error) {
    console.warn(`    ↳ git 镜像安装失败: ${(error as Error).message}`);
    return false;
  } finally {
    if (tmpDir) {
      await cleanupTemp(tmpDir);
    }
  }
}

/** 本地目录通道：npm i -g <dir>；成功 true / 失败 false（不抛） */
export function installCliFromLocalDir(
  localPath: string,
  registry?: string,
  prefix?: string,
): boolean {
  try {
    npmInstallGlobal(localPath, registry, 180_000, prefix);
    return true;
  } catch (error) {
    console.warn(`    ↳ 本地目录安装失败: ${(error as Error).message}`);
    return false;
  }
}
