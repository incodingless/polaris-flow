#!/usr/bin/env bash
# doc-sync-scorer.sh — 文档同步评分
# 检查 CHANGELOG / README 是否与最近变更同步
# 输出 0-100 分 + 理由（JSON）
set -uo pipefail

SCORE=100
REASON="文档与代码同步"

# 检查 CHANGELOG.md 是否存在
if [ ! -f "CHANGELOG.md" ]; then
  SCORE=$(( SCORE - 20 ))
  REASON="缺少 CHANGELOG.md"
fi

# 检查 README.md 是否存在
if [ ! -f "README.md" ]; then
  SCORE=$(( SCORE - 20 ))
  REASON="${REASON}; 缺少 README.md"
fi

# 检查最近 commit 是否有 docs 类型
if command -v git >/dev/null 2>&1; then
  RECENT_COMMITS=$(git log --oneline -10 2>/dev/null || echo "")
  TOTAL=$(echo "$RECENT_COMMITS" | grep -c . 2>/dev/null || echo "0")
  DOC_COMMITS=$(echo "$RECENT_COMMITS" | grep -ciE "^[a-f0-9]+ (docs|doc|readme|changelog)" 2>/dev/null || echo "0")

  if [ "$TOTAL" -gt 5 ] && [ "$DOC_COMMITS" -eq 0 ]; then
    SCORE=$(( SCORE - 15 ))
    REASON="${REASON}; 最近 10 个 commit 无文档更新"
  fi
fi

[ "$SCORE" -lt 0 ] && SCORE=0

printf '{"scorer":"doc-sync","score":%d,"reason":"%s"}\n' "$SCORE" "$REASON"
