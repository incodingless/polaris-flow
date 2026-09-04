#!/usr/bin/env bash
# complexity-scorer.sh — 复杂度评分
# 基于文件大小和函数/类数量的启发式评分
# 输出 0-100 分 + 理由（JSON）
set -uo pipefail

SCORE=100
REASON="复杂度在可接受范围内"

# 检查是否有超过 300 行的文件（高复杂度信号）
LARGE_FILES=$(find . -path ./node_modules -prune -o -path ./.git -prune -o \
  \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) \
  -print 2>/dev/null | while read -r f; do
    lines=$(wc -l < "$f" 2>/dev/null || echo "0")
    if [ "$lines" -gt 300 ]; then
      echo "$f:$lines"
    fi
  done | wc -l)

LARGE_FILES=$(echo "$LARGE_FILES" | xargs)

if [ "$LARGE_FILES" -gt 5 ]; then
  SCORE=40
  REASON="${LARGE_FILES} 个文件超过 300 行（高复杂度）"
elif [ "$LARGE_FILES" -gt 2 ]; then
  SCORE=65
  REASON="${LARGE_FILES} 个文件超过 300 行（中等复杂度）"
elif [ "$LARGE_FILES" -gt 0 ]; then
  SCORE=85
  REASON="${LARGE_FILES} 个文件超过 300 行（轻微）"
fi

printf '{"scorer":"complexity","score":%d,"reason":"%s"}\n' "$SCORE" "$REASON"
