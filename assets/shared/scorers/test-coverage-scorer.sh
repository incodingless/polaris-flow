#!/usr/bin/env bash
# test-coverage-scorer.sh — 测试覆盖率评分
#
# 评分来源(优先级从高到低):
#   1. coverage/coverage-summary.json   → Istanbul JSON  (jest / vitest / c8 / nyc)
#   2. coverage/lcov.info               → lcov           (Rust tarpaulin / llvm-cov / 通用)
#   3. coverage.xml                     → Cobertura      (Python coverage.py / .NET coverlet)
#      target/site/jacoco/jacoco.xml    → Jacoco         (Java / Kotlin)
#   4. (兜底)文件名启发式 = TEST_COUNT / IMPL_COUNT * 100
#      ⚠️ 启发式不准:集成测试 N→1 / 命名约定窄 / 覆盖深度不可见 / 文件数 ≠ 质量
#      建议接入标准覆盖率 MCP / 工具产生上述 1~3 任一格式的报告后再 audit。
#
# 输出:0-100 分 + 理由(JSON 单行)。reason 字段始终包含 source=<...>,可观测。
set -uo pipefail

SCORE=100
REASON="测试覆盖率充分"
SOURCE="heuristic"

# --- 评分映射(line coverage 百分比 → 0-100 分) ----------------------------
# 与原启发式的分档对齐(80 → 100,50 → 75,20 → 50,otherwise 25),并补足中段
_score_from_pct() {
  local pct="$1"   # 整数百分比
  if   [ "$pct" -ge 90 ]; then echo 100
  elif [ "$pct" -ge 80 ]; then echo 90
  elif [ "$pct" -ge 70 ]; then echo 80
  elif [ "$pct" -ge 60 ]; then echo 70
  elif [ "$pct" -ge 50 ]; then echo 60
  elif [ "$pct" -ge 40 ]; then echo 45
  elif [ "$pct" -ge 30 ]; then echo 30
  else                          echo 15
  fi
}

# --- 1. Istanbul JSON: coverage/coverage-summary.json ---------------------
# 抓 total.lines.pct(数值,可能含小数)。awk 顶住嵌套,只取 total 块内首个 lines.pct。
_parse_istanbul() {
  local f="$1"
  awk '
    BEGIN { in_total = 0; in_lines = 0 }
    /"total"[[:space:]]*:/ { in_total = 1 }
    in_total && /"lines"[[:space:]]*:/ { in_lines = 1 }
    in_lines && match($0, /"pct"[[:space:]]*:[[:space:]]*[0-9]+(\.[0-9]+)?/) {
      seg = substr($0, RSTART, RLENGTH)
      sub(/^[^0-9]*/, "", seg)
      # 取整数部分,丢小数(scorer 分档用整数百分比即可)
      sub(/\..*$/, "", seg)
      print seg
      exit
    }
  ' "$f" 2>/dev/null
}

# --- 2. lcov: coverage/lcov.info ------------------------------------------
# 累加 LF(总行)与 LH(命中行),pct = LH * 100 / LF。
_parse_lcov() {
  local f="$1"
  awk '
    /^LF:/ { sub(/^LF:/, ""); lf += $0 + 0 }
    /^LH:/ { sub(/^LH:/, ""); lh += $0 + 0 }
    END {
      if (lf > 0) printf "%d\n", (lh * 100) / lf
    }
  ' "$f" 2>/dev/null
}

# --- 3a. Cobertura XML: coverage.xml --------------------------------------
# Cobertura 顶层 <coverage line-rate="0.853" ...>。取首个 line-rate,*100 取整。
_parse_cobertura() {
  local f="$1"
  awk '
    match($0, /<coverage[^>]*line-rate[[:space:]]*=[[:space:]]*"[0-9]+(\.[0-9]+)?"/) {
      seg = substr($0, RSTART, RLENGTH)
      # 抽出引号内的数字
      match(seg, /"[0-9]+(\.[0-9]+)?"/)
      v = substr(seg, RSTART + 1, RLENGTH - 2)  # 去掉两端引号
      # v ∈ [0, 1],*100 取整
      pct = v * 100
      printf "%d\n", pct
      exit
    }
  ' "$f" 2>/dev/null
}

# --- 3b. Jacoco XML: target/site/jacoco/jacoco.xml ------------------------
# 顶层 <report> 内含多个 <counter type="LINE" missed="X" covered="Y"/>。
# 取**第一个**(也就是 report 级聚合,不是 group/package 级)。
_parse_jacoco() {
  local f="$1"
  awk '
    /<counter[^>]*type[[:space:]]*=[[:space:]]*"LINE"/ {
      missed = ""; covered = ""
      if (match($0, /missed[[:space:]]*=[[:space:]]*"[0-9]+"/)) {
        seg = substr($0, RSTART, RLENGTH); match(seg, /"[0-9]+"/); missed = substr(seg, RSTART+1, RLENGTH-2)
      }
      if (match($0, /covered[[:space:]]*=[[:space:]]*"[0-9]+"/)) {
        seg = substr($0, RSTART, RLENGTH); match(seg, /"[0-9]+"/); covered = substr(seg, RSTART+1, RLENGTH-2)
      }
      if (missed != "" && covered != "") {
        total = missed + covered
        if (total > 0) {
          printf "%d\n", (covered * 100) / total
          exit
        }
      }
    }
  ' "$f" 2>/dev/null
}

# --- 探测顺序(命中即停) --------------------------------------------------
PCT=""

if [ -z "$PCT" ] && [ -f "coverage/coverage-summary.json" ]; then
  PCT=$(_parse_istanbul "coverage/coverage-summary.json")
  [ -n "$PCT" ] && SOURCE="istanbul:coverage/coverage-summary.json"
fi

if [ -z "$PCT" ] && [ -f "coverage/lcov.info" ]; then
  PCT=$(_parse_lcov "coverage/lcov.info")
  [ -n "$PCT" ] && SOURCE="lcov:coverage/lcov.info"
fi

if [ -z "$PCT" ] && [ -f "coverage.xml" ]; then
  PCT=$(_parse_cobertura "coverage.xml")
  [ -n "$PCT" ] && SOURCE="cobertura:coverage.xml"
fi

if [ -z "$PCT" ] && [ -f "target/site/jacoco/jacoco.xml" ]; then
  PCT=$(_parse_jacoco "target/site/jacoco/jacoco.xml")
  [ -n "$PCT" ] && SOURCE="jacoco:target/site/jacoco/jacoco.xml"
fi

# --- 命中真实报告 -> 直接评分 ---------------------------------------------
if [ -n "$PCT" ]; then
  SCORE=$(_score_from_pct "$PCT")
  REASON="行覆盖 ${PCT}% (source=${SOURCE})"
else
  # --- 4. 兜底: 文件名启发式(原算法保留) -----------------------------------
  IMPL_COUNT=$(find . -path ./node_modules -prune -o -path ./.git -prune -o \
    \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) \
    ! -name "*.test.*" ! -name "*.spec.*" ! -name "test_*" -print 2>/dev/null | wc -l)

  TEST_COUNT=$(find . -path ./node_modules -prune -o -path ./.git -prune -o \
    \( -name "*.test.*" -o -name "*.spec.*" -o -name "test_*" \) -print 2>/dev/null | wc -l)

  IMPL_COUNT=$(echo "$IMPL_COUNT" | xargs)
  TEST_COUNT=$(echo "$TEST_COUNT" | xargs)

  if [ "$IMPL_COUNT" -gt 0 ]; then
    RATIO=$(( (TEST_COUNT * 100) / IMPL_COUNT ))
    if [ "$RATIO" -ge 80 ]; then
      SCORE=100
    elif [ "$RATIO" -ge 50 ]; then
      SCORE=75
    elif [ "$RATIO" -ge 20 ]; then
      SCORE=50
    else
      SCORE=25
    fi
    REASON="测试/实现比 ${RATIO}% (${TEST_COUNT}/${IMPL_COUNT}) source=heuristic — 启发式估算,建议跑覆盖率工具(vitest --coverage / pytest --cov / go test -cover / cargo tarpaulin / mvn jacoco) 后再 audit"
  else
    SCORE=100
    REASON="无实现文件(纯文档项目)source=heuristic"
  fi
fi

# JSON 输出(reason 内的双引号需转义,但本脚本所有 reason 模板都已避免内嵌双引号)
printf '{"scorer":"test-coverage","score":%d,"reason":"%s"}\n' "$SCORE" "$REASON"
