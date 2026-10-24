// audit-violation-rate.mjs — 审计违规率评分（等价 audit-violation-rate.sh）
// 输出 0-100 分 + 理由（JSON）
import fs from 'node:fs';
import path from 'node:path';

const METRICS_DIR = process.env.METRICS_DIR || '.polaris/metrics';

let score = 100;
let reason = '无已知违规';

// 取最近修改的 *-metrics.json（等价 `ls -t "$METRICS_DIR"/*-metrics.json | head -1`）
function latestMetricsFile(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const candidates = names
    .filter((f) => f.endsWith('-metrics.json'))
    .map((f) => path.join(dir, f))
    .filter((f) => {
      try {
        return fs.statSync(f).isFile();
      } catch {
        return false;
      }
    })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] || null;
}

// 等价 awk _json_int：取 parent 对象内的整数字段；非 number 返回 null（供 fallback）
function jsonInt(parent, key) {
  const v = parent && typeof parent === 'object' ? parent[key] : undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  return null;
}

const latest = latestMetricsFile(METRICS_DIR);
if (latest) {
  let violations = null;
  let totalChecks = null;
  try {
    const obj = JSON.parse(fs.readFileSync(latest, 'utf8'));
    violations = jsonInt(obj.audit, 'violations');
    totalChecks = jsonInt(obj.audit, 'total_checks');
  } catch {
    // 解析失败保持 null → fallback（保持原行为）
  }

  // 解析失败时保持原行为：VIOLATIONS=0 / TOTAL_CHECKS=1 -> 100 分
  if (violations === null) violations = 0;
  if (totalChecks === null) totalChecks = 1;

  if (totalChecks > 0) {
    const rate = Math.trunc((violations * 100) / totalChecks);
    score = 100 - rate;
    if (score < 0) score = 0;
    reason = `违规率 ${rate}%（${violations}/${totalChecks}）`;
  }
}

console.log(`{"scorer":"audit-violation-rate","score":${score},"reason":"${reason}"}`);
