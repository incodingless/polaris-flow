#!/usr/bin/env bash
# 代码审查扫描脚本：收集目标目录的客观指标与风险模式
# 用法: bash analyze.sh [目标路径] [--diff] [--maxdepth N] [--maxfiles N]
#   --diff        只输出变更文件清单与统计（需在 Git 仓库内）
#   --maxdepth N  限制目录递归深度（默认 12）
#   --maxfiles N  限制扫描文件数上限（默认 5000）
set -uo pipefail

TARGET="."
MODE="full"
MAXDEPTH=12
MAXFILES=5000

while [ $# -gt 0 ]; do
  case "$1" in
    --diff|-d) MODE="diff"; shift ;;
    --maxdepth) MAXDEPTH="$2"; shift 2 ;;
    --maxfiles) MAXFILES="$2"; shift 2 ;;
    *) TARGET="$1"; shift ;;
  esac
done

EXCLUDE='/(node_modules|\.git|dist|build|vendor|__pycache__|\.venv|venv|target|\.next|coverage|\.idea|\.vscode)/'
SRC_EXT='\.(js|ts|tsx|jsx|py|java|go|rs|c|cpp|rb|php|cs|sh|vue|sql|kt|swift)$'

echo "===== 代码审查扫描报告 ====="
echo "扫描目标: $TARGET"
echo "扫描模式: $MODE"
echo

# 0. 目标存在性检查
if [ ! -e "$TARGET" ]; then
  echo "[错误] 目标不存在: $TARGET"
  echo "请确认路径正确，或先切换工作目录"
  exit 1
fi

# 1. Git 信息 + diff 模式
if git -C "$TARGET" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[Git] 是 Git 仓库"
  echo "[Git] 分支: $(git -C "$TARGET" branch --show-current 2>/dev/null || echo N/A)"
  echo "[Git] 未提交变更文件数: $(git -C "$TARGET" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  echo "[Git] 最近 5 次提交:"
  git -C "$TARGET" log --oneline -5 2>/dev/null | sed 's/^/    /'
  if [ "$MODE" = "diff" ]; then
    echo
    echo "[Diff] 变更文件清单:"
    git -C "$TARGET" diff --name-only 2>/dev/null | sed 's/^/    /' | head -50
    echo "[Diff] 变更统计:"
    git -C "$TARGET" diff --stat 2>/dev/null | tail -20 | sed 's/^/    /'
  fi
else
  echo "[Git] 非 Git 仓库（--diff 模式不可用）"
fi
echo

# diff 模式下只输出 diff 信息即结束，深度审查由 AI 阅读变更文件完成
if [ "$MODE" = "diff" ]; then
  echo "===== 扫描结束（diff 模式）====="
  exit 0
fi

# 2. 文件类型分布
echo "[统计] 文件类型分布（深度 ≤ $MAXDEPTH，最多 $MAXFILES 文件）:"
find "$TARGET" -maxdepth "$MAXDEPTH" -type f 2>/dev/null \
  | grep -v -E "$EXCLUDE" \
  | head -n "$MAXFILES" \
  | grep -E '\.[A-Za-z0-9]+$' \
  | sed -E 's/.*\.([A-Za-z0-9]+)$/\1/' \
  | tr 'A-Z' 'a-z' \
  | sort | uniq -c | sort -rn | head -15 \
  | sed 's/^/    /'
echo

# 3. 超大文件（>500 行，抽样前 300 个源码文件）
echo "[架构] 超大文件（>500 行，需关注职责是否过重）:"
find "$TARGET" -maxdepth "$MAXDEPTH" -type f 2>/dev/null \
  | grep -v -E "$EXCLUDE" \
  | grep -E "$SRC_EXT" \
  | head -n 300 \
  | while read -r f; do
      n=$(wc -l < "$f" 2>/dev/null)
      if [ -n "$n" ] && [ "$n" -gt 500 ] 2>/dev/null; then
        printf '    %s: %s 行\n' "$f" "$n"
      fi
    done
echo

# 4. TODO/FIXME/HACK 标记
echo "[技术债] TODO/FIXME/HACK 标记（前 20 条）:"
find "$TARGET" -maxdepth "$MAXDEPTH" -type f 2>/dev/null \
  | grep -v -E "$EXCLUDE" \
  | head -n "$MAXFILES" \
  | xargs grep -n -E 'TODO|FIXME|HACK|XXX' 2>/dev/null \
  | head -20 \
  | sed 's/^/    /'
echo

# 5. 安全风险模式
echo "[安全] 风险模式扫描（粗筛，深度检查需对照 security-checklist）:"
echo "  --- 疑似硬编码密钥/密码 ---"
find "$TARGET" -maxdepth "$MAXDEPTH" -type f 2>/dev/null \
  | grep -v -E "$EXCLUDE" \
  | head -n "$MAXFILES" \
  | xargs grep -n -iE '(password|passwd|secret|api[_-]?key|token|private[_-]?key)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{6,}' 2>/dev/null \
  | grep -viE '(process\.env|os\.environ|getenv|环境变量|placeholder|example|your_|your-|<\$|\$\{|<.*>)' \
  | head -15 | sed 's/^/    /'
echo "  --- 疑似 SQL 注入（拼接 / f-string / 模板字面量） ---"
find "$TARGET" -maxdepth "$MAXDEPTH" -type f 2>/dev/null \
  | grep -v -E "$EXCLUDE" \
  | head -n "$MAXFILES" \
  | xargs grep -n -E '"[^"]*(SELECT|INSERT|UPDATE|DELETE)[^"]*"[[:space:]]*\+|f"[^"]*(SELECT|INSERT|UPDATE|DELETE)[^"]*\{|`[^`]*(SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{' 2>/dev/null \
  | head -15 | sed 's/^/    /'
echo "  --- 疑似危险命令执行 ---"
find "$TARGET" -maxdepth "$MAXDEPTH" -type f 2>/dev/null \
  | grep -v -E "$EXCLUDE" \
  | head -n "$MAXFILES" \
  | xargs grep -n -E '(eval\(|exec\(|os\.system\(|subprocess\.(call|Popen|run)\([^)]*shell[[:space:]]*=[[:space:]]*True|child_process\.exec)' 2>/dev/null \
  | head -15 | sed 's/^/    /'
echo

echo "===== 扫描结束 ====="
