// doc-sync-scorer.mjs — 文档同步评分（等价 doc-sync-scorer.sh）
// 检查 CHANGELOG / README 是否与最近变更同步
// 输出 0-100 分 + 理由（JSON）
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

let score = 100;
let reason = '文档与代码同步';

// 检查 CHANGELOG.md 是否存在
if (!fs.existsSync('CHANGELOG.md')) {
  score -= 20;
  reason = '缺少 CHANGELOG.md';
}

// 检查 README.md 是否存在
if (!fs.existsSync('README.md')) {
  score -= 20;
  reason = `${reason}; 缺少 README.md`;
}

// 等价 `command -v git` + `git log --oneline -10 2>/dev/null || echo ""`
let recentCommits = '';
try {
  recentCommits = execFileSync('git', ['log', '--oneline', '-10'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch {
  recentCommits = '';
}

if (recentCommits !== '') {
  const lines = recentCommits.split('\n');
  // 等价 `grep -c .`：非空行数
  const total = lines.filter((l) => l.length > 0).length;
  // 等价 `grep -ciE "^[a-f0-9]+ (docs|doc|readme|changelog)"`
  const docCommits = lines.filter((l) => /^[a-f0-9]+ (docs|doc|readme|changelog)/i.test(l)).length;

  if (total > 5 && docCommits === 0) {
    score -= 15;
    reason = `${reason}; 最近 10 个 commit 无文档更新`;
  }
}

if (score < 0) score = 0;

console.log(`{"scorer":"doc-sync","score":${score},"reason":"${reason}"}`);
