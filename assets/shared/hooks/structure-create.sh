#!/usr/bin/env bash
# hooks/draft-create.sh — 创建 draft 目录
#
# 用法：bash "$PLUGIN_ROOT/hooks/draft-create.sh" <repo_root>
#
# 退出码：
#   0 → 新建成功，stdout 输出 JSON: {"draft_name":"...","draft_dir":"..."}
#   1 → 已存在未完成的 draft 目录，stdout 输出 JSON: {"existing":["dir1","dir2",...]}
#   2 → 参数错误

set -euo pipefail

repo_root="${1:-}"

if [ -z "$repo_root" ]; then
  echo '{"error":"usage: draft-create.sh <repo_root>"}' >&2
  exit 2
fi

changes_dir="$repo_root/.harness/changes"
mkdir -p "$changes_dir"

# 扫描已存在的 draft-* 目录（design 未完成的残留）
existing=$(ls -d "$changes_dir"/draft-*/ 2>/dev/null | sort || true)

if [ -n "$existing" ]; then
  json_arr="["
  first=1
  while IFS= read -r d; do
    d="${d%$'\r'}"
    [ -z "$d" ] && continue
    d="${d%/}"
    name="${d##*/}"
    [ -z "$name" ] && continue
    [ "$first" = "1" ] && first=0 || json_arr="$json_arr,"
    json_arr="$json_arr\"$name\""
  done <<< "$existing"
  json_arr="$json_arr]"
  echo "{\"existing\":$json_arr}"
  exit 1
fi

# 用 unix_ts 后 6 位做唯一后缀，保证同一秒内也不重复（目录 mkdir 失败则秒级递增）
suffix=$(date +%s | tail -c 7 | head -c 6)
draft_name="draft-${suffix}"
draft_dir="$changes_dir/$draft_name"

# 极罕见的冲突保护：若目录已存在则追加随机位
if [ -e "$draft_dir" ]; then
  suffix="${suffix}$(printf '%02x' $((RANDOM % 256)))"
  draft_name="draft-${suffix}"
  draft_dir="$changes_dir/$draft_name"
fi

mkdir -p "$draft_dir"
echo "{\"draft_name\":\"$draft_name\",\"draft_dir\":\"$draft_dir\"}"
exit 0
