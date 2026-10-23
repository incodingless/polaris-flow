#!/usr/bin/env bash
# constitution-violation-count.sh — 宪法违规次数评分
# 输出 0-100 分 + 理由（JSON）
set -uo pipefail

OVERRIDES_LOG="${OVERRIDES_LOG:-.polaris/overrides.log}"
SCORE=100
REASON="无宪法违规记录"

if [ -f "$OVERRIDES_LOG" ]; then
  # 统计含 "constitution" 的 override 记录数
  VIOLATIONS=$(grep -ci "constitution" "$OVERRIDES_LOG" 2>/dev/null || echo "0")

  if [ "$VIOLATIONS" -gt 0 ]; then
    # 每次违规扣 15 分，最低 0
    DEDUCTION=$(( VIOLATIONS * 15 ))
    SCORE=$(( 100 - DEDUCTION ))
    [ "$SCORE" -lt 0 ] && SCORE=0
    REASON="累计 ${VIOLATIONS} 次宪法相关 override"
  fi
fi

printf '{"scorer":"constitution-violation-count","score":%d,"reason":"%s"}\n' "$SCORE" "$REASON"
