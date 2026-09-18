#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const runTsc = (args = []) => {
  const tscPath = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tscPath, ...args], { stdio: 'inherit' });
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

  console.log('\nBuild completed successfully!');
} catch {
  console.error('\nBuild failed!');
  process.exit(1);
}
