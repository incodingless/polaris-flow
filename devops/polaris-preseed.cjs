#!/usr/bin/env node
/**
 * 离线安装包预种脚本：把 bundle 的 config.ini 与 components/ 转译进 ~/.polaris/。
 * - components/ → ~/.polaris/components/（本地通道的持久载体，防用户删解压目录后断粮）
 * - superpowers-<v>.tgz → 同目录的 superpowers/（运行时 installSource 只认目录，须先解包）
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
const zlib = require('zlib');

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

// ---- 2.5 极简 tar 解包（仅用 Node 内置 zlib/fs，零第三方依赖） ----

/** 读 tar 头里的定长字符串，遇 NUL 结束 */
function readTarString(buf, start, length) {
  let end = start;
  while (end < start + length && buf[end] !== 0) end += 1;
  return buf.subarray(start, end).toString('utf8');
}

/** tar 的 size 等数值字段是八进制 ASCII，前导可能是空格或 NUL */
function parseTarOctal(buf, start, length) {
  let digits = '';
  for (let i = start; i < start + length; i += 1) {
    const c = buf[i];
    if (c === 0 || c === 32) {
      if (digits) break;
      continue;
    }
    digits += String.fromCharCode(c);
  }
  return digits ? Number.parseInt(digits, 8) : 0;
}

/**
 * 校验 tar 条目路径：拒绝绝对路径、盘符与 .. 段，去掉 ./ 前缀。
 * 返回按 / 切分的安全片段；不安全或无需落盘时返回 null。
 */
function safeEntryParts(raw) {
  const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized === '.') return null;
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null;
  const parts = normalized.split('/').filter((p) => p && p !== '.');
  // 跳过 macOS tar 附带的 AppleDouble（._*）元数据条目，历史介质可能仍带
  if (parts.some((p) => p === '..' || p.startsWith('._'))) return null;
  return parts.length ? parts : null;
}

/**
 * 解包 tgz 到目标目录：只处理普通文件与目录，跳过符号链接等其它类型。
 * 先收集全部条目再落盘，避免解到一半才发现恶意路径；落盘前清空目标保证幂等。
 */
function extractTgz(tgzPath, destDir) {
  const buf = zlib.gunzipSync(fs.readFileSync(tgzPath));
  const entries = [];
  let longName = '';
  let offset = 0;

  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;

    const size = parseTarOctal(header, 124, 12);
    const type = String.fromCharCode(header[156]);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > buf.length) throw new Error(`tgz 条目数据越界（偏移 ${offset}）`);

    let name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    if (prefix) name = `${prefix}/${name}`;

    // GNU longname（L）与 pax path（x）扩展头：下一条目使用这里的名字
    if (type === 'L' || type === 'x') {
      const payload = buf.subarray(dataStart, dataEnd).toString('utf8');
      if (type === 'L') {
        longName = payload.replace(/\0.*$/, '');
      } else {
        const match = payload.match(/(?:^|\n)\d+ path=([^\n]*)/);
        if (match) longName = match[1];
      }
      offset = dataEnd + ((512 - (size % 512)) % 512);
      continue;
    }
    if (longName) {
      name = longName;
      longName = '';
    }

    const parts = safeEntryParts(name);
    if (parts && (type === '0' || type === '\0' || type === '5')) {
      entries.push({ parts, type, data: buf.subarray(dataStart, dataEnd) });
    }
    offset = dataEnd + ((512 - (size % 512)) % 512);
  }

  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of entries) {
    const target = path.join(destDir, ...entry.parts);
    if (entry.type === '5') {
      fs.mkdirSync(target, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.data);
    }
  }
}

/** 比较点分数字版本号：a 大于 b 返回正数 */
function compareVersions(a, b) {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ---- 3. 定位组件本地路径（目录优先，其次按语义化版本选最高的 tgz） ----

/** 在缓存目录里找指定前缀的最高版本 tgz（按数字版本比较，避免字典序误选） */
function findComponentTgz(prefix) {
  if (!fs.existsSync(componentsDest)) return '';
  const re = new RegExp(`^${prefix}-([0-9]+\\.[0-9]+\\.[0-9]+)\\.tgz$`);
  const candidates = fs
    .readdirSync(componentsDest)
    .map((n) => {
      const match = re.exec(n);
      return match ? { name: n, version: match[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => compareVersions(a.version, b.version));
  const latest = candidates[candidates.length - 1];
  return latest ? path.join(componentsDest, latest.name) : '';
}

function findComponent(prefix) {
  if (!fs.existsSync(componentsDest)) return '';
  // 目录形态优先（解包后的 superpowers，或介质自带的其它技能目录）
  if (fs.readdirSync(componentsDest).includes(prefix)) {
    return path.join(componentsDest, prefix);
  }
  return findComponentTgz(prefix);
}

/**
 * 把 superpowers 的 tgz 解包成目录：运行时 installSource 只接受目录路径。
 * openspec/codegraph 的本地通道是 npm i -g，原生吃 tgz，不做解包。
 * 刻意走 findComponentTgz 而非 findComponent：重跑时解包目录已存在，
 * 目录优先会让解包被跳过，导致换介质后旧目录残留。
 */
function unpackSuperpowers() {
  const tgz = findComponentTgz('superpowers');
  if (!tgz) return;
  console.log(`==> 解包 superpowers: ${path.basename(tgz)}`);
  try {
    extractTgz(tgz, path.join(componentsDest, 'superpowers'));
  } catch (error) {
    fail(`解包 superpowers 失败: ${error.message}`);
  }
}

// ---- 3.5 解包 superpowers tgz，让 local-paths 指向目录 ----
unpackSuperpowers();

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
    (lines[end].trim() === '' || /^[ \t]/.test(lines[end]) || /^#/.test(lines[end]))
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
