#!/usr/bin/env node
/**
 * 离线安装包预种脚本：把 bundle 的 config.ini 与 components/ 转译进 ~/.polaris/。
 * - components/ → ~/.polaris/components/（本地目录通道的持久载体，防用户删解压目录后断粮）
 * - config.ini → ~/.polaris/polaris.yaml 的 install: 段（github-mirror / npm-registry / local-paths）
 * 由 install.sh / install.ps1 在检测到 bundle 模式时调用；node 由 install 脚本保证可用。
 *
 * 用法: node polaris-preseed.js <bundleDir>
 * 退出码 0 成功；非 0 失败（stderr 说明）。幂等，可重复执行。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function fail(msg) {
  console.error('error: ' + msg);
  process.exit(1);
}

const bundleDir = path.resolve(process.argv[2] || '.');
const polarisHome = path.join(os.homedir(), '.polaris');
const componentsDest = path.join(polarisHome, 'components');
const configPath = path.join(polarisHome, 'polaris.yaml');

// ---- 1. 读 config.ini（扁平 KEY=VALUE，容忍空格与 # 注释） ----
function readConfig() {
  const file = path.join(bundleDir, 'config.ini');
  if (!fs.existsSync(file)) return {};
  const cfg = {};
  for (const raw of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('#') || t.startsWith(';')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k && v) cfg[k] = v;
  }
  return cfg;
}
const cfg = readConfig();

// ---- 2. 拷贝 components/ → ~/.polaris/components/ ----
const srcComponents = path.join(bundleDir, 'components');
fs.mkdirSync(componentsDest, { recursive: true });
if (fs.existsSync(srcComponents)) {
  for (const name of fs.readdirSync(srcComponents)) {
    const from = path.join(srcComponents, name);
    const to = path.join(componentsDest, name);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
  }
}

// ---- 3. 定位组件本地路径（.tgz 或目录） ----
function findComponent(prefix) {
  if (!fs.existsSync(componentsDest)) return '';
  const names = fs.readdirSync(componentsDest);
  // 目录形态（如 superpowers）
  if (names.includes(prefix)) return path.join(componentsDest, prefix);
  // tgz 形态（如 openspec-1.14.3.tgz）
  const tgz = names
    .filter((n) => n.startsWith(prefix + '-') && n.endsWith('.tgz'))
    .sort()
    .pop();
  return tgz ? path.join(componentsDest, tgz) : '';
}

// ---- 4. 生成 install: 段 ----
function buildInstallBlock() {
  const lp = {
    openspec: findComponent('openspec'),
    superpowers: findComponent('superpowers'),
    codegraph: findComponent('codegraph'),
  };
  const lines = ['install:'];
  lines.push(`  github-mirror: "${cfg.POLARIS_GITHUB_MIRROR || ''}"`);
  lines.push(`  npm-registry: "${cfg.POLARIS_NPM_REGISTRY || ''}"`);
  lines.push('  local-paths:');
  lines.push(`    openspec: "${lp.openspec}"`);
  lines.push(`    superpowers: "${lp.superpowers}"`);
  lines.push(`    codegraph: "${lp.codegraph}"`);
  return lines.join('\n');
}

// ---- 5. 合并进 polaris.yaml（字符串级：只替换/追加顶层 install: 块） ----
function mergeInstallSection(existing, block) {
  const lines = existing.split('\n');
  const idx = lines.findIndex((l) => /^install:/.test(l));
  if (idx === -1) {
    return (existing.replace(/\s*$/, '') + '\n\n' + block).trim() + '\n';
  }
  let end = idx + 1;
  while (
    end < lines.length &&
    (lines[end].trim() === '' ||
      /^[ \t]/.test(lines[end]) ||
      /^#/.test(lines[end]))
  ) {
    end++;
  }
  const before = lines.slice(0, idx).join('\n').replace(/\s*$/, '');
  const after = lines.slice(end).join('\n').replace(/^\s*/, '');
  return [before, block, after].filter(Boolean).join('\n').trim() + '\n';
}

fs.mkdirSync(polarisHome, { recursive: true });
const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
const next = mergeInstallSection(existing, buildInstallBlock());
fs.writeFileSync(configPath, next, 'utf-8');

const lp = {
  openspec: findComponent('openspec'),
  superpowers: findComponent('superpowers'),
  codegraph: findComponent('codegraph'),
};
console.log('==> 预种完成:');
console.log('    ~/.polaris/polaris.yaml (install:)');
console.log('    ~/.polaris/components/');
if (lp.openspec) console.log('      openspec  -> ' + lp.openspec);
if (lp.superpowers) console.log('      superpowers -> ' + lp.superpowers);
if (lp.codegraph) console.log('      codegraph -> ' + lp.codegraph);
