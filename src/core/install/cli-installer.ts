/**
 * CLI 类组件（OpenSpec / Codegraph）的三通道安装执行器。
 * 通道语义：npm 通道用 `<pkg>@latest`；git 镜像与本地目录通道统一用
 * `npm install -g <目录>` 承接 build/link（不自造 npm link / shim）。
 */
import { execFileSync } from 'child_process';

import { getNodeToolExecutable } from '../deps/npm.js';
import { cleanupTemp, fetchRepo, resolveVersion } from '../deps/github.js';

/** 组装 `npm install -g <target> [--registry <r>]` 参数（target 可以是包名@版本或目录） */
export function buildNpmGlobalInstallArgs(target: string, registry?: string): string[] {
  const args = ['install', '-g', target];
  if (registry) {
    args.push('--registry', registry);
  }
  return args;
}

/** 执行 `npm install -g <target> [--registry]`；失败抛错 */
export function npmInstallGlobal(target: string, registry?: string, timeoutMs = 180_000): void {
  execFileSync(getNodeToolExecutable('npm'), buildNpmGlobalInstallArgs(target, registry), {
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
): Promise<boolean> {
  let tmpDir: string | undefined;
  try {
    const resolved = resolveVersion(repo, minVersion, mirror);
    const fetched = await fetchRepo(repo, resolved.version, mirror);
    tmpDir = fetched.localPath;
    npmInstallGlobal(fetched.localPath, registry);
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
export function installCliFromLocalDir(localPath: string, registry?: string): boolean {
  try {
    npmInstallGlobal(localPath, registry);
    return true;
  } catch (error) {
    console.warn(`    ↳ 本地目录安装失败: ${(error as Error).message}`);
    return false;
  }
}
