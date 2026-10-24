#!/usr/bin/env node
/**
 * session-start.mjs — 宿主 SessionStart → polaris-flow host-hook 的 node 入口。
 *
 * 等价于被替换的 session-start.sh 薄包装：定位全局安装的 polaris-flow CLI 并转发执行。
 * 改用 node 直接启动（而非 bash）以消除 Windows 对 Git Bash / bash 的硬依赖；
 * 业务逻辑仍全部在 polaris-flow CLI（`host-hook --fallback-event SessionStart`）。
 *
 * 本文件分发到用户项目的 `<context>/skills/polaris/hooks/`，必须自包含：
 * 只依赖 node 内置模块，不依赖任何 npm 包；`.mjs` 扩展名强制 ESM，
 * 规避用户项目 package.json `type` 字段的模块系统歧义。
 *
 * PLATFORM_ID：安装期由 rewritePolarisCliPlatformId 将 @PLATFORM_ID@ 替换为真实平台 id
 * （claude / cursor / trae）。未替换时 host-hook 会回退到 .polaris/config.yaml 的 platform。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PLATFORM_ID = '@PLATFORM_ID@';

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
function resolvePolarisFlow() {
  return findOnPath('polaris-flow') ?? findExecutableInDir(getUserCliBinDir(), 'polaris-flow');
}

function main() {
  const cli = resolvePolarisFlow();
  if (!cli) {
    console.error(
      '[polaris-flow][FAIL] polaris-flow CLI not found — hook requires a global install',
    );
    console.error('                  Install: npm install -g @polaris/polaris-flow');
    console.error('                  Then retry (or run: polaris-flow host-hook …)');
    console.error('                  Note: interactive CLI remains "polaris" (init/status/…)');
    process.exit(1);
  }

  // 转发位置参数（如项目根）给 host-hook；--platform 由安装期占位替换注入
  const args = [
    'host-hook',
    '--fallback-event',
    'SessionStart',
    ...process.argv.slice(2),
    '--platform',
    PLATFORM_ID,
  ];
  // Windows 上 npm 全局 bin 是 .cmd shim，必须经 shell 执行；POSIX 直接 spawn（shebang 生效）
  const viaShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cli);
  const result = spawnSync(cli, args, { stdio: 'inherit', shell: viaShell });

  if (result.error) {
    console.error(`[polaris-flow][FAIL] failed to spawn polaris-flow: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main();
