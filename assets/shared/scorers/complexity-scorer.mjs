// complexity-scorer.mjs — 复杂度评分（等价 complexity-scorer.sh）
// 基于文件大小和函数/类数量的启发式评分
// 输出 0-100 分 + 理由（JSON）
import fs from 'node:fs';
import path from 'node:path';

const EXTS = ['.ts', '.js', '.py', '.go', '.rs'];

// 等价 `wc -l < file`：统计换行符数量
function countLines(file) {
  try {
    const buf = fs.readFileSync(file);
    let n = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 0x0a) n++;
    }
    return n;
  } catch {
    return 0;
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

let score = 100;
let reason = '复杂度在可接受范围内';

let largeFiles = 0;
walk('.', '', (full) => {
  const base = path.basename(full);
  if (!EXTS.some((e) => base.endsWith(e))) return;
  if (countLines(full) > 300) largeFiles++;
});

if (largeFiles > 5) {
  score = 40;
  reason = `${largeFiles} 个文件超过 300 行（高复杂度）`;
} else if (largeFiles > 2) {
  score = 65;
  reason = `${largeFiles} 个文件超过 300 行（中等复杂度）`;
} else if (largeFiles > 0) {
  score = 85;
  reason = `${largeFiles} 个文件超过 300 行（轻微）`;
}

console.log(`{"scorer":"complexity","score":${score},"reason":"${reason}"}`);
