/**
 * _polaris-cli.mjs — scripts/ 薄包装共用：定位全局 polaris-flow CLI 并转发执行。
 *
 * 等价于被替换的 _polaris-cli.sh 的 exec_polaris：查找 `polaris-flow`（运行时入口，
 * 与用户侧 `polaris` CLI 分离）并 spawn 子命令，末尾注入 `--platform <id>`。
 * 改用 node 直接启动以消除 Windows 对 Git Bash / bash 的硬依赖；node 天然免疫 CRLF，
 * 原 `_polaris_cli_selfheal` 不再需要。
 *
 * 本文件分发到用户项目的 `<context>/skills/polaris/scripts/`，必须自包含：
 * 只依赖 node 内置模块，不依赖任何 npm 包；`.mjs` 扩展名强制 ESM。
 *
 * PLATFORM_ID：安装期由 rewritePolarisCliPlatformId 将 @PLATFORM_ID@ 替换为真实平台 id
 * （claude / cursor / trae）。未替换时仅作为字面量传入，运行时命令不消费该值时无害。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 安装期由 rewritePolarisCliPlatformId 替换为真实平台 id */
export const PLATFORM_ID = '@PLATFORM_ID@';

/** 用户级伴生 CLI 可执行目录（与 src/core/assets/polaris-paths.ts 的 getUserCliBinDir 对齐） */
function getUserCliBinDir() {
  return path.join(os.homedir(), '.polaris', 'cli', 'bin');
}

/** 在单个目录里找可执行文件（Windows 依次试 .cmd/.exe/无后缀；POSIX 只试无后缀） */
function findExecutableInDir(dir, name) {
  const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const suffix of suffixes) {
    const candidate = path.join(dir, name + suffix);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // 不存在，试下一个后缀
    }
  }
  return null;
}

/** 遍历 PATH 找 polaris-flow */
function findOnPath(name) {
  const sep = process.platform === 'win32' ? ';' : ':';
  const dirs = (process.env.PATH || '').split(sep).filter(Boolean);
  for (const dir of dirs) {
    const found = findExecutableInDir(dir, name);
    if (found) return found;
  }
  return null;
}

/** 定位 polaris-flow：PATH → ~/.polaris/cli/bin */
export function resolvePolarisFlow() {
  return findOnPath('polaris-flow') ?? findExecutableInDir(getUserCliBinDir(), 'polaris-flow');
}

/**
 * 转发执行 `polaris-flow <subcmd> [args] --platform <id>`，转发退出码。
 * 找不到 CLI 时打印安装指引并 exit 1。
 */
export function execPolaris(subcmd, args) {
  const cli = resolvePolarisFlow();
  if (!cli) {
    console.error(
      '[polaris-flow][FAIL] polaris-flow CLI not found — script requires a global install',
    );
    console.error('                  Install: npm install -g polaris-flow');
    console.error(`                  Then retry (or run: polaris-flow ${subcmd} …)`);
    console.error('                  Note: interactive CLI remains "polaris" (init/status/…)');
    process.exit(1);
  }

  const finalArgs = [subcmd, ...args, '--platform', PLATFORM_ID];
  // Windows 上 npm 全局 bin 是 .cmd shim，必须经 shell 执行；POSIX 直接 spawn（shebang 生效）
  const viaShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cli);
  const result = spawnSync(cli, finalArgs, { stdio: 'inherit', shell: viaShell });

  if (result.error) {
    console.error(`[polaris-flow][FAIL] failed to spawn polaris-flow: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
