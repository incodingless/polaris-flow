#!/usr/bin/env bash
# audit-violation-rate.sh — 审计违规率评分
# 输出 0-100 分 + 理由（JSON）
set -uo pipefail

METRICS_DIR="${METRICS_DIR:-.polaris/metrics}"
SCORE=100
REASON="无已知违规"

# 纯 bash + awk 解析 JSON 嵌套整数字段（无 jq/python 依赖）
# 用法：_json_int <file> <parent_key> <child_key>
#   失败 / 找不到 -> 输出空，调用方按需 fallback
_json_int() {
  awk -v parent="$2" -v key="$3" '
    BEGIN { in_blk = 0; depth = 0 }
    {
      line = $0
      if (!in_blk) {
        if (match(line, "\"" parent "\"[[:space:]]*:[[:space:]]*\\{")) {
          in_blk = 1; depth = 1
          line = substr(line, RSTART + RLENGTH)
        } else { next }
      }
      # 在 parent 对象内：查找 "key": <int>
      if (match(line, "\"" key "\"[[:space:]]*:[[:space:]]*-?[0-9]+")) {
        seg = substr(line, RSTART, RLENGTH)
        sub(/^[^0-9-]*/, "", seg)
        print seg; exit
      }
      # 维护括号深度，离开 parent 对象就停
      n = gsub(/\{/, "{", line); depth += n
      n = gsub(/\}/, "}", line); depth -= n
      if (depth <= 0) exit
    }
  ' "$1"
}

# 统计最近一次 audit 的违规数
LATEST_METRICS=$(ls -t "$METRICS_DIR"/*-metrics.json 2>/dev/null | head -1)

if [ -n "$LATEST_METRICS" ] && [ -f "$LATEST_METRICS" ]; then
  VIOLATIONS=$(_json_int "$LATEST_METRICS" "audit" "violations" 2>/dev/null || true)
  TOTAL_CHECKS=$(_json_int "$LATEST_METRICS" "audit" "total_checks" 2>/dev/null || true)

  # 解析失败时保持原行为：VIOLATIONS=0 / TOTAL_CHECKS=1 -> 100 分
  [ -z "${VIOLATIONS:-}" ] && VIOLATIONS=0
  [ -z "${TOTAL_CHECKS:-}" ] && TOTAL_CHECKS=1

  if [ "$TOTAL_CHECKS" -gt 0 ]; then
    RATE=$(( (VIOLATIONS * 100) / TOTAL_CHECKS ))
    SCORE=$(( 100 - RATE ))
    [ "$SCORE" -lt 0 ] && SCORE=0
    REASON="违规率 ${RATE}%（${VIOLATIONS}/${TOTAL_CHECKS}）"
  fi
fi

printf '{"scorer":"audit-violation-rate","score":%d,"reason":"%s"}\n' "$SCORE" "$REASON"
