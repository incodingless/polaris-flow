// test-coverage-scorer.mjs — 测试覆盖率评分（等价 test-coverage-scorer.sh）
//
// 评分来源(优先级从高到低):
//   1. coverage/coverage-summary.json   → Istanbul JSON  (jest / vitest / c8 / nyc)
//   2. coverage/lcov.info               → lcov           (Rust tarpaulin / llvm-cov / 通用)
//   3. coverage.xml                     → Cobertura      (Python coverage.py / .NET coverlet)
//      target/site/jacoco/jacoco.xml    → Jacoco         (Java / Kotlin)
//   4. (兜底)文件名启发式 = TEST_COUNT / IMPL_COUNT * 100
//
// 输出:0-100 分 + 理由(JSON 单行)。reason 字段始终包含 source=<...>,可观测。
import fs from 'node:fs';
import path from 'node:path';

const EXTS = ['.ts', '.js', '.py', '.go', '.rs'];

let score = 100;
let reason = '测试覆盖率充分';
let source = 'heuristic';

// --- 评分映射(line coverage 百分比 → 0-100 分) ----------------------------
function scoreFromPct(pct) {
  if (pct >= 90) return 100;
  if (pct >= 80) return 90;
  if (pct >= 70) return 80;
  if (pct >= 60) return 70;
  if (pct >= 50) return 60;
  if (pct >= 40) return 45;
  if (pct >= 30) return 30;
  return 15;
}

// --- 1. Istanbul JSON: coverage/coverage-summary.json ---------------------
// 抓 total.lines.pct，取整数部分(丢小数)。
function parseIstanbul(file) {
  try {
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    const pct = obj && obj.total && obj.total.lines ? obj.total.lines.pct : undefined;
    if (typeof pct === 'number' && Number.isFinite(pct)) return Math.trunc(pct);
    return null;
  } catch {
    return null;
  }
}

// --- 2. lcov: coverage/lcov.info ------------------------------------------
// 累加 LF(总行)与 LH(命中行),pct = LH * 100 / LF。
function parseLcov(file) {
  let lf = 0;
  let lh = 0;
  try {
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split('\n')) {
      if (line.startsWith('LF:')) lf += Number(line.slice(3)) || 0;
      else if (line.startsWith('LH:')) lh += Number(line.slice(3)) || 0;
    }
  } catch {
    return null;
  }
  if (lf > 0) return Math.trunc((lh * 100) / lf);
  return null;
}

// --- 3a. Cobertura XML: coverage.xml --------------------------------------
// Cobertura 顶层 <coverage line-rate="0.853" ...>。取首个 line-rate,*100 取整。
function parseCobertura(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const m = content.match(/<coverage[^>]*line-rate\s*=\s*"([0-9]+(\.[0-9]+)?)"/);
    if (!m) return null;
    return Math.trunc(parseFloat(m[1]) * 100);
  } catch {
    return null;
  }
}

// --- 3b. Jacoco XML: target/site/jacoco/jacoco.xml ------------------------
// 取第一个 <counter type="LINE" missed="X" covered="Y"/>。
function parseJacoco(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split('\n')) {
      if (!/<counter[^>]*type\s*=\s*"LINE"/.test(line)) continue;
      const mm = line.match(/missed\s*=\s*"([0-9]+)"/);
      const cm = line.match(/covered\s*=\s*"([0-9]+)"/);
      if (!mm || !cm) continue;
      const missed = parseInt(mm[1], 10);
      const covered = parseInt(cm[1], 10);
      const total = missed + covered;
      if (total > 0) return Math.trunc((covered * 100) / total);
    }
    return null;
  } catch {
    return null;
  }
}

// 等价 find 的 `-path ./node_modules -prune -o -path ./.git -prune`：只剪根级 node_modules/.git
function walk(dir, rel, cb) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (childRel === 'node_modules' || childRel === '.git') continue;
      walk(full, childRel, cb);
    } else if (e.isFile()) {
      cb(full);
    }
  }
}

// --- 探测顺序(命中即停) --------------------------------------------------
let pct = null;

if (pct === null && fs.existsSync('coverage/coverage-summary.json')) {
  pct = parseIstanbul('coverage/coverage-summary.json');
  if (pct !== null) source = 'istanbul:coverage/coverage-summary.json';
}

if (pct === null && fs.existsSync('coverage/lcov.info')) {
  pct = parseLcov('coverage/lcov.info');
  if (pct !== null) source = 'lcov:coverage/lcov.info';
}

if (pct === null && fs.existsSync('coverage.xml')) {
  pct = parseCobertura('coverage.xml');
  if (pct !== null) source = 'cobertura:coverage.xml';
}

if (pct === null && fs.existsSync('target/site/jacoco/jacoco.xml')) {
  pct = parseJacoco('target/site/jacoco/jacoco.xml');
  if (pct !== null) source = 'jacoco:target/site/jacoco/jacoco.xml';
}

// --- 命中真实报告 -> 直接评分 ---------------------------------------------
if (pct !== null) {
  score = scoreFromPct(pct);
  reason = `行覆盖 ${pct}% (source=${source})`;
} else {
  // --- 4. 兜底: 文件名启发式(原算法保留) -----------------------------------
  let implCount = 0;
  let testCount = 0;
  walk('.', '', (full) => {
    const base = path.basename(full);
    if (base.includes('.test.') || base.includes('.spec.') || base.startsWith('test_')) {
      testCount++;
      return;
    }
    if (EXTS.some((e) => base.endsWith(e))) implCount++;
  });

  if (implCount > 0) {
    const ratio = Math.trunc((testCount * 100) / implCount);
    if (ratio >= 80) score = 100;
    else if (ratio >= 50) score = 75;
    else if (ratio >= 20) score = 50;
    else score = 25;
    reason = `测试/实现比 ${ratio}% (${testCount}/${implCount}) source=heuristic — 启发式估算,建议跑覆盖率工具(vitest --coverage / pytest --cov / go test -cover / cargo tarpaulin / mvn jacoco) 后再 audit`;
  } else {
    score = 100;
    reason = '无实现文件(纯文档项目)source=heuristic';
  }
}

// JSON 输出(reason 内无双引号，与 .sh 版一致直接嵌入)
console.log(`{"scorer":"test-coverage","score":${score},"reason":"${reason}"}`);
