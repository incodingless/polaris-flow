#!/usr/bin/env node

/**
 * Polaris Flow 构建：清理 dist → 编译 TypeScript → 构建 Dashboard 前端。
 *
 * 产物布局：
 *   dist/{cli,commands,core,dashboard,utils}/  —— 后端 tsc 输出（dist/dashboard 是 Dashboard API）
 *   dist/web/                                  —— 前端 vite 产物（由 polaris dashboard 托管）
 * 两者同级、刻意不相嵌，避免编译产物与前端资源混层。
 */
import { execFileSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const runTsc = (args = []) => {
  const tscPath = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tscPath, ...args], { stdio: 'inherit' });
};

/**
 * 构建 Dashboard 前端到 dist/web。
 * 用 process.execPath + vite.js 而非 spawn npm/npx：与上面的 tsc 调用同构，
 * 且规避 Windows 上 npm.cmd 的跨平台问题。
 */
const runViteBuild = () => {
  // 必须用绝对路径：下面把 cwd 切到了 dashboard，相对路径会在子进程里被二次解析
  const vitePath = path.resolve('dashboard', 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vitePath)) {
    console.error('\n未安装 Dashboard 前端依赖，请先执行：');
    console.error('  npm --prefix dashboard install\n');
    process.exit(1);
  }
  execFileSync(process.execPath, [vitePath, 'build'], { cwd: 'dashboard', stdio: 'inherit' });
};

console.log('Building Polaris Flow...\n');

if (existsSync('dist')) {
  console.log('Cleaning dist directory...');
  rmSync('dist', { recursive: true, force: true });
}

console.log('Compiling TypeScript...');
try {
  runTsc(['--version']);
  runTsc();

  // 将 i18n 配置文件复制到 dist，供 CLI 运行时加载
  const i18nYaml = path.join('src', 'commands', 'i18n', 'messages.yaml');
  if (existsSync(i18nYaml)) {
    const i18nDest = path.join('dist', 'commands', 'i18n');
    mkdirSync(i18nDest, { recursive: true });
    cpSync(i18nYaml, path.join(i18nDest, 'messages.yaml'));
  }

  console.log('\nBuilding Dashboard web...');
  runViteBuild();

  console.log('\nBuild completed successfully!');
} catch {
  console.error('\nBuild failed!');
  process.exit(1);
}
