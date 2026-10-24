// constitution-violation-count.mjs — 宪法违规次数评分（等价 constitution-violation-count.sh）
// 输出 0-100 分 + 理由（JSON）
import fs from 'node:fs';

const OVERRIDES_LOG = process.env.OVERRIDES_LOG || '.polaris/overrides.log';

let score = 100;
let reason = '无宪法违规记录';

let content = null;
try {
  content = fs.readFileSync(OVERRIDES_LOG, 'utf8');
} catch {
  // 文件不存在 → 保持默认 100 分
}

if (content !== null) {
  // 等价 `grep -ci "constitution"`：忽略大小写、按行计数（一行多个只算 1）
  const violations = content.split('\n').filter((line) => /constitution/i.test(line)).length;

  if (violations > 0) {
    // 每次违规扣 15 分，最低 0
    const deduction = violations * 15;
    score = 100 - deduction;
    if (score < 0) score = 0;
    reason = `累计 ${violations} 次宪法相关 override`;
  }
}

console.log(`{"scorer":"constitution-violation-count","score":${score},"reason":"${reason}"}`);
