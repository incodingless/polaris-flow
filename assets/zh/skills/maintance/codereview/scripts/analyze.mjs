#!/usr/bin/env node
// 代码审查扫描脚本：收集目标目录的客观指标与风险模式（多语言正则兜底）
// 用法: node analyze.mjs [目标路径] [--diff] [--maxdepth N] [--maxfiles N]
//   --diff        只输出变更文件清单与统计（需在 Git 仓库内）
//   --maxdepth N  限制目录递归深度（默认 12）
//   --maxfiles N  限制扫描文件数上限（默认 5000）
// 说明：本文件是原 analyze.sh 的等价 node 实现（bash → node，Windows 免 bash 依赖）。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let target = '.';
let mode = 'full';
let maxDepth = 12;
let maxFiles = 5000;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--diff' || a === '-d') {
    mode = 'diff';
  } else if (a === '--maxdepth') {
    if (i + 1 < argv.length) {
      maxDepth = parseInt(argv[i + 1], 10);
      i++;
    }
  } else if (a === '--maxfiles') {
    if (i + 1 < argv.length) {
      maxFiles = parseInt(argv[i + 1], 10);
      i++;
    }
  } else {
    target = a;
  }
}
if (Number.isNaN(maxDepth)) maxDepth = 12;
if (Number.isNaN(maxFiles)) maxFiles = 5000;

// 等价原 EXCLUDE 正则 /(node_modules|\.git|dist|...)/ 的目录段集合（walk 剪枝用）
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__',
  '.venv', 'venv', 'target', '.next', 'coverage', '.idea', '.vscode',
]);
const SRC_EXT_RE = /\.(js|ts|tsx|jsx|py|java|go|rs|c|cpp|rb|php|cs|sh|vue|sql|kt|swift)$/;
const EXT_RE = /\.([A-Za-z0-9]+)$/;
const TODO_RE = /TODO|FIXME|HACK|XXX/;
const SECRET_RE = /(password|passwd|secret|api[_-]?key|token|private[_-]?key)\s*[:=]\s*["'][^"']{6,}/i;
const SECRET_EXCLUDE_RE = /(process\.env|os\.environ|getenv|环境变量|placeholder|example|your_|your-|<\$|\$\{|<.*>)/i;
const SQL_RE = /"[^"]*(SELECT|INSERT|UPDATE|DELETE)[^"]*"\s*\+|f"[^"]*(SELECT|INSERT|UPDATE|DELETE)[^"]*\{|`[^`]*(SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{/;
const DANGEROUS_RE = /(eval\(|exec\(|os\.system\(|subprocess\.(call|Popen|run)\([^)]*shell\s*=\s*True|child_process\.exec)/;

// 深度优先遍历，输出路径与 find 的 "$TARGET/…" 形态一致（含 "./" 前缀）。
function walk(dir, depth, out) {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = dir.endsWith('/') ? dir + e.name : dir + '/' + e.name;
    try {
      if (e.isDirectory()) {
        if (EXCLUDED_DIRS.has(e.name)) continue;
        walk(full, depth + 1, out);
      } else if (e.isFile()) {
        out.push(full);
      }
    } catch {
      // 目录项可能在遍历中被删除，跳过
    }
  }
}

// 等价 wc -l：统计换行符个数
function countLines(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0a) n++;
  }
  return n;
}

function readText(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function git(cwd, ...args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

// ===== 头部 =====
console.log('===== 代码审查扫描报告 =====');
console.log(`扫描目标: ${target}`);
console.log(`扫描模式: ${mode}`);
console.log('');

// 0. 目标存在性检查
if (!existsSync(target)) {
  console.log(`[错误] 目标不存在: ${target}`);
  console.log('请确认路径正确，或先切换工作目录');
  process.exit(1);
}

// 1. Git 信息 + diff 模式
const isGit = git(target, 'rev-parse', '--is-inside-work-tree') !== null;
if (isGit) {
  console.log('[Git] 是 Git 仓库');
  const branch = (git(target, 'branch', '--show-current') || '').trim() || 'N/A';
  console.log(`[Git] 分支: ${branch}`);
  const statusOut = git(target, 'status', '--porcelain');
  const changed = statusOut ? countLines(statusOut) : 0;
  console.log(`[Git] 未提交变更文件数: ${changed}`);
  console.log('[Git] 最近 5 次提交:');
  const logOut = git(target, 'log', '--oneline', '-5');
  if (logOut) {
    for (const line of logOut.split('\n')) {
      if (line) console.log('    ' + line);
    }
  }
  if (mode === 'diff') {
    console.log('');
    console.log('[Diff] 变更文件清单:');
    const names = git(target, 'diff', '--name-only');
    if (names) {
      for (const line of names.split('\n').filter(Boolean).slice(0, 50)) {
        console.log('    ' + line);
      }
    }
    console.log('[Diff] 变更统计:');
    const stat = git(target, 'diff', '--stat');
    if (stat) {
      for (const line of stat.split('\n').filter(Boolean).slice(-20)) {
        console.log('    ' + line);
      }
    }
  }
} else {
  console.log('[Git] 非 Git 仓库（--diff 模式不可用）');
}
console.log('');

// diff 模式下只输出 diff 信息即结束
if (mode === 'diff') {
  console.log('===== 扫描结束（diff 模式）=====');
  process.exit(0);
}

// 收集文件（目标可为文件或目录）
let allFiles = [];
try {
  if (statSync(target).isDirectory()) {
    walk(target, 1, allFiles);
  } else if (statSync(target).isFile()) {
    allFiles = [target];
  }
} catch {
  allFiles = [];
}

// 2. 文件类型分布
console.log(`[统计] 文件类型分布（深度 ≤ ${maxDepth}，最多 ${maxFiles} 文件）:`);
{
  const extCount = new Map();
  let seen = 0;
  for (const f of allFiles) {
    if (seen >= maxFiles) break;
    seen++;
    const m = f.match(EXT_RE);
    if (m) {
      const ext = m[1].toLowerCase();
      extCount.set(ext, (extCount.get(ext) || 0) + 1);
    }
  }
  const sorted = [...extCount.entries()]
    .sort((a, b) => b[1] - a[1] || (b[0] > a[0] ? 1 : b[0] < a[0] ? -1 : 0))
    .slice(0, 15);
  for (const [ext, count] of sorted) {
    // 等价 macOS BSD uniq -c 的 %4d 右对齐（GNU 为 %7d，属平台实现细节，纯美观）
    console.log('    ' + String(count).padStart(4, ' ') + ' ' + ext);
  }
}
console.log('');

// 3. 超大文件（>500 行，抽样前 300 个源码文件）
console.log('[架构] 超大文件（>500 行，需关注职责是否过重）:');
{
  let seen = 0;
  for (const f of allFiles) {
    if (seen >= 300) break;
    if (!SRC_EXT_RE.test(f)) continue;
    seen++;
    const text = readText(f);
    if (text !== null) {
      const n = countLines(text);
      if (n > 500) console.log(`    ${f}: ${n} 行`);
    }
  }
}
console.log('');

// 4. TODO/FIXME/HACK 标记
console.log('[技术债] TODO/FIXME/HACK 标记（前 20 条）:');
{
  let printed = 0;
  outer: for (let i = 0; i < allFiles.length && i < maxFiles; i++) {
    const f = allFiles[i];
    const text = readText(f);
    if (text === null) continue;
    const lines = text.split('\n');
    for (let j = 0; j < lines.length; j++) {
      if (TODO_RE.test(lines[j])) {
        console.log(`    ${f}:${j + 1}:${lines[j]}`);
        if (++printed >= 20) break outer;
      }
    }
  }
}
console.log('');

// 5. 安全风险模式
console.log('[安全] 风险模式扫描（粗筛，深度检查需对照 security-checklist）:');
console.log('  --- 疑似硬编码密钥/密码 ---');
{
  let printed = 0;
  outer: for (let i = 0; i < allFiles.length && i < maxFiles; i++) {
    const f = allFiles[i];
    const text = readText(f);
    if (text === null) continue;
    const lines = text.split('\n');
    for (let j = 0; j < lines.length; j++) {
      if (SECRET_RE.test(lines[j])) {
        const full = `${f}:${j + 1}:${lines[j]}`;
        if (!SECRET_EXCLUDE_RE.test(full)) {
          console.log('    ' + full);
          if (++printed >= 15) break outer;
        }
      }
    }
  }
}
console.log('  --- 疑似 SQL 注入（拼接 / f-string / 模板字面量） ---');
{
  let printed = 0;
  outer: for (let i = 0; i < allFiles.length && i < maxFiles; i++) {
    const f = allFiles[i];
    const text = readText(f);
    if (text === null) continue;
    const lines = text.split('\n');
    for (let j = 0; j < lines.length; j++) {
      if (SQL_RE.test(lines[j])) {
        console.log(`    ${f}:${j + 1}:${lines[j]}`);
        if (++printed >= 15) break outer;
      }
    }
  }
}
console.log('  --- 疑似危险命令执行 ---');
{
  let printed = 0;
  outer: for (let i = 0; i < allFiles.length && i < maxFiles; i++) {
    const f = allFiles[i];
    const text = readText(f);
    if (text === null) continue;
    const lines = text.split('\n');
    for (let j = 0; j < lines.length; j++) {
      if (DANGEROUS_RE.test(lines[j])) {
        console.log(`    ${f}:${j + 1}:${lines[j]}`);
        if (++printed >= 15) break outer;
      }
    }
  }
}
console.log('');

console.log('===== 扫描结束 =====');
