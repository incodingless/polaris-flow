#!/usr/bin/env bash
# hooks/workflow-entry.sh — workflow.yaml 的 RMW 操作统一入口(含锁 + 写后校验)
#
# 由 triage / design / propose / ship 等 skill 调用,把 policies/workflow-lock.md 中描述的
# "持锁 → 解析 → 修改 → 写回 → 写后校验 → trap 释放"流程一次性封装。
# SKILL.md 中所有"获取 .harness/.locks/workflow.lock + RMW + 写后校验"的 bash 模板
# 全部改为单行调用本脚本。
#
# 用法:
#   bash workflow-entry.sh <op> --skill <name> [op-specific args]
#
# 通用参数:
#   --skill <name>   写者标识,写入锁文件第 1 字段(便于运维 grep)。必填
#   --repo-root <p>  主仓根。缺省 → git rev-parse --show-toplevel
#
# op 列表(语义与各 SKILL.md 当前描述完全等价):
#
#   append-active --change-id <id> --phase <p> --worktree-path <wt> --started-at <iso>
#       在 active_changes 数组末尾追加新 entry(不动其它)
#       —— design 1.4 / propose 1.3.B 首次写入路径
#
#   update-active --where-change-id <id> [--set phase=<p>] [--set worktree-path=<wt>]
#       更新指定 entry 的 phase / worktree_path 字段(其它字段不动)
#       —— propose 1.3.A.4 同步阶段切换 + worktree 路径
#
#   rename-active --from <old_id> --to <new_id>
#       把 active_changes 中 change_id == <old_id> 的 entry 的 change_id 改为 <new_id>
#       —— design 4.4 把 draft-* 重命名为正式 change_id
#
#   delete-active --where-change-id <id>
#       从 active_changes 中删除 change_id 匹配的 entry
#       —— design 1.2 选项 B / ship 6.1.a
#
#   upsert-pending-triage --session-suffix <hex> --tier <t> --t1 <t1> [--t2 <t2>] [--timestamp <iso>]
#       按 session_suffix 在 pending_triages 中 upsert(已有则覆盖整 entry,无则追加)
#       —— triage 写入路径
#
#   delete-pending-triage --session-suffix <hex>
#       从 pending_triages 删除 session_suffix 匹配的 entry
#       —— ship 6.1.c
#
# 退出码:
#   0  成功(锁获取 + 修改 + 写后校验全部通过)
#   1  锁获取失败(6s 超时或 mkdir 失败,严格按 policies/workflow-lock.md HARD STOP H12)
#   2  写后校验失败(乐观锁兜底,详见步骤 3),已自动重试 1 次仍不一致
#   3  参数错误 / 输入文件异常
#
# 锁契约(严格遵守 policies/workflow-lock.md):
#   - 路径: <repo_root>/.harness/.locks/workflow.lock
#   - 内容: "<skill> <PID> <unix_ts> <ISO_8601_UTC>"
#   - stale 阈值: 5s
#   - 自旋上限: 6s(60 × 100ms)
#   - 释放: trap EXIT INT TERM HUP

set -uo pipefail

# ===== 0. 通用参数解析 =====================================================
OP="${1:-}"
shift || true

SKILL=""
REPO_ROOT=""
# 通用 kv 变量（用普通变量代替 declare -A，兼容 bash 3.2/macOS）
kv_change_id=""
kv_phase=""
kv_worktree_path=""
kv_started_at=""
kv_where_change_id=""
kv_from_change_id=""
kv_to_change_id=""
kv_session_suffix=""
kv_tier=""
kv_t1_result=""
kv_t2_result=""
kv_timestamp=""
kv_set_phase=""
kv_set_worktree_path=""

while [ $# -gt 0 ]; do
  case "$1" in
    --skill)              SKILL="${2:-}"; shift 2 ;;
    --repo-root)          REPO_ROOT="${2:-}"; shift 2 ;;
    --change-id)          kv_change_id="${2:-}"; shift 2 ;;
    --phase)              kv_phase="${2:-}"; shift 2 ;;
    --worktree-path)      kv_worktree_path="${2:-}"; shift 2 ;;
    --started-at)         kv_started_at="${2:-}"; shift 2 ;;
    --where-change-id)    kv_where_change_id="${2:-}"; shift 2 ;;
    --from)               kv_from_change_id="${2:-}"; shift 2 ;;
    --to)                 kv_to_change_id="${2:-}"; shift 2 ;;
    --session-suffix)     kv_session_suffix="${2:-}"; shift 2 ;;
    --tier)               kv_tier="${2:-}"; shift 2 ;;
    --t1)                 kv_t1_result="${2:-}"; shift 2 ;;
    --t2)                 kv_t2_result="${2:-}"; shift 2 ;;
    --timestamp)          kv_timestamp="${2:-}"; shift 2 ;;
    --set)
      # --set key=value
      kvpair="${2:-}"; shift 2
      k="${kvpair%%=*}"; v="${kvpair#*=}"
      # 把 dash 风格转 snake 风格(允许调用方写 phase 或 worktree-path)
      k="${k//-/_}"
      case "$k" in
        phase)          kv_set_phase="$v" ;;
        worktree_path)  kv_set_worktree_path="$v" ;;
        *) echo "[workflow-entry] 阻断：--set 不支持的 key: $k" >&2; exit 3 ;;
      esac
      ;;
    *)
      echo "[workflow-entry] 阻断：未知参数 $1" >&2
      exit 3
      ;;
  esac
done

if [ -z "$OP" ]; then
  echo "[workflow-entry] 阻断：缺少 op(append-active/update-active/rename-active/delete-active/upsert-pending-triage/delete-pending-triage)" >&2
  exit 3
fi
if [ -z "$SKILL" ]; then
  echo "[workflow-entry] 阻断：缺少 --skill <name>(用于锁文件写者标识)" >&2
  exit 3
fi
if [ -z "$REPO_ROOT" ]; then
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [ -z "$REPO_ROOT" ] || [ ! -d "$REPO_ROOT" ]; then
  echo "[workflow-entry] 阻断：无法解析主仓根" >&2
  exit 3
fi

WF_FILE="$REPO_ROOT/.polaris/workflow.yaml"
LOCK_DIR="$REPO_ROOT/.polaris/.locks"
LOCK_FILE="$LOCK_DIR/workflow.lock"

# ===== 1. 物化 workflow.yaml(若不存在) ====================================
if [ ! -f "$WF_FILE" ]; then
  mkdir -p "$(dirname "$WF_FILE")" 2>/dev/null
  # 极简骨架,与 templates/workflow-template.yaml 等价(SessionStart 应已物化,这里兜底)
  cat > "$WF_FILE" <<'EOF'
active_changes: []
pending_triages: []
EOF
fi

# ===== 2. 加锁(policies/workflow-lock.md 步骤 1) ===========================
mkdir -p "$LOCK_DIR" 2>/dev/null || {
  echo "[workflow-entry] 阻断：无法创建 $LOCK_DIR" >&2
  exit 1
}

acquire_start=$(date +%s)
while true; do
  if ( set -o noclobber; > "$LOCK_FILE" ) 2>/dev/null; then
    printf '%s %s %s %s\n' "$SKILL" "$$" "$(date +%s)" "$(date -u +%FT%TZ)" > "$LOCK_FILE"
    break
  fi
  lock_mtime=$(stat -c %Y "$LOCK_FILE" 2>/dev/null || stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0)
  lock_age=$(( $(date +%s) - lock_mtime ))
  if [ "$lock_age" -ge 5 ]; then
    rm -f "$LOCK_FILE"
    continue
  fi
  sleep 0.1
  if [ $(( $(date +%s) - acquire_start )) -ge 6 ]; then
    holder="$(cat "$LOCK_FILE" 2>/dev/null || echo '<unreadable>')"
    echo "[easy-flow] 阻断：workflow.lock 持续 6s 未能获取（HARD STOP H12）" >&2
    echo "  锁内容: $holder" >&2
    echo "  请手动检查 $LOCK_FILE 持有者后清理" >&2
    exit 1
  fi
done
trap 'rm -f "$LOCK_FILE"' EXIT INT TERM HUP

# ===== 3. RMW: 解析 → 修改 → 写回 ==========================================
# 思路:用 awk 把 workflow.yaml 拆成
#   - 顶部其它行(active_changes 块前)
#   - active_changes 块的 entry 列表(每 entry 紧凑成单行 pipe 串)
#   - 中部其它行(active_changes 与 pending_triages 之间的非块内容)
#   - pending_triages 块的 entry 列表
#   - 底部其它行
# 然后 bash 修改对应 entry 列表,最后再用同样的方式拼回。
#
# entry 紧凑表示(单行,字段间用 \x1f (ASCII US, unit separator) 分隔——
# 该字符是 ASCII 控制符,绝不会出现在合法字段值里,且不属于 IFS whitespace 类,
# 不会被 read -r 把连续分隔符合并,可正确还原空字段):
#   active:   change_id \x1f phase \x1f worktree_path \x1f started_at
#   pending:  session_suffix \x1f tier \x1f t1_result \x1f t2_result \x1f timestamp

TMP="$WF_FILE.tmp.$$"
SEP=$'\x1f'

# 解析:输出 4 段,用魔法分隔行 "###WFE_*" 标识
parse_workflow() {
  awk -v SEP=$'\x1f' '
    BEGIN {
      mode="head"; ac_started=0; pt_started=0
      buf=""
      have_ac=0; have_pt=0
    }
    function strip_quotes(v) {
      sub(/^[[:space:]]+/, "", v); sub(/[[:space:]]+$/, "", v)
      if (v ~ /^".*"$/) { v = substr(v, 2, length(v)-2) }
      else if (v ~ /^'\''.*'\''$/) { v = substr(v, 2, length(v)-2) }
      return v
    }
    function flush_active_entry() {
      if (have_ac) {
        printf("###WFE_AC_ENTRY%s%s%s%s%s%s%s%s%s\n", SEP, a_cid, SEP, a_ph, SEP, a_wt, SEP, a_sa, "")
      }
      have_ac=0; a_cid=""; a_ph=""; a_wt=""; a_sa=""
    }
    function flush_pending_entry() {
      if (have_pt) {
        printf("###WFE_PT_ENTRY%s%s%s%s%s%s%s%s%s%s%s\n", SEP, p_ss, SEP, p_tier, SEP, p_t1, SEP, p_t2, SEP, p_ts, "")
      }
      have_pt=0; p_ss=""; p_tier=""; p_t1=""; p_t2=""; p_ts=""
    }
    # 顶层 key 切换
    /^[A-Za-z_][A-Za-z0-9_]*:/ {
      if (mode=="active_changes") { flush_active_entry(); print "###WFE_END_AC" }
      if (mode=="pending_triages") { flush_pending_entry(); print "###WFE_END_PT" }
      if ($0 ~ /^active_changes:/) {
        mode="active_changes"; ac_started=1
        # active_changes 行本身保留为标记
        print "###WFE_BEGIN_AC"
        # 若当前行是 "active_changes: []" 形式,直接结束
        if ($0 ~ /^active_changes:[[:space:]]*\[[[:space:]]*\][[:space:]]*$/) {
          print "###WFE_END_AC"
          mode="other"
        }
        next
      }
      if ($0 ~ /^pending_triages:/) {
        mode="pending_triages"; pt_started=1
        print "###WFE_BEGIN_PT"
        if ($0 ~ /^pending_triages:[[:space:]]*\[[[:space:]]*\][[:space:]]*$/) {
          print "###WFE_END_PT"
          mode="other"
        }
        next
      }
      mode="other"
      print "###WFE_OTHER" SEP $0
      next
    }
    mode=="head" || mode=="other" {
      print "###WFE_OTHER" SEP $0
      next
    }
    mode=="active_changes" {
      if ($0 ~ /^[[:space:]]*-[[:space:]]*change_id:/) {
        flush_active_entry()
        v=$0; sub(/^[[:space:]]*-[[:space:]]*change_id:[[:space:]]*/, "", v)
        a_cid=strip_quotes(v); have_ac=1; next
      }
      if ($0 ~ /^[[:space:]]+phase:/) {
        v=$0; sub(/^[[:space:]]+phase:[[:space:]]*/, "", v); a_ph=strip_quotes(v); next
      }
      if ($0 ~ /^[[:space:]]+worktree_path:/) {
        v=$0; sub(/^[[:space:]]+worktree_path:[[:space:]]*/, "", v); a_wt=strip_quotes(v); next
      }
      if ($0 ~ /^[[:space:]]+started_at:/) {
        v=$0; sub(/^[[:space:]]+started_at:[[:space:]]*/, "", v); a_sa=strip_quotes(v); next
      }
      # 块内空行/注释保持忽略
      next
    }
    mode=="pending_triages" {
      if ($0 ~ /^[[:space:]]*-[[:space:]]*session_suffix:/) {
        flush_pending_entry()
        v=$0; sub(/^[[:space:]]*-[[:space:]]*session_suffix:[[:space:]]*/, "", v)
        p_ss=strip_quotes(v); have_pt=1; next
      }
      if ($0 ~ /^[[:space:]]+tier:/) {
        v=$0; sub(/^[[:space:]]+tier:[[:space:]]*/, "", v); p_tier=strip_quotes(v); next
      }
      if ($0 ~ /^[[:space:]]+t1_result:/) {
        v=$0; sub(/^[[:space:]]+t1_result:[[:space:]]*/, "", v); p_t1=strip_quotes(v); next
      }
      if ($0 ~ /^[[:space:]]+t2_result:/) {
        v=$0; sub(/^[[:space:]]+t2_result:[[:space:]]*/, "", v); p_t2=strip_quotes(v); next
      }
      if ($0 ~ /^[[:space:]]+timestamp:/) {
        v=$0; sub(/^[[:space:]]+timestamp:[[:space:]]*/, "", v); p_ts=strip_quotes(v); next
      }
      next
    }
    END {
      if (mode=="active_changes") { flush_active_entry(); print "###WFE_END_AC" }
      if (mode=="pending_triages") { flush_pending_entry(); print "###WFE_END_PT" }
    }
  ' "$WF_FILE"
}

# 读入并分桶
HEAD_OTHERS=()      # 在 active_changes 出现之前的行
MID_OTHERS=()       # active_changes 与 pending_triages 之间的行(若有)
TAIL_OTHERS=()      # pending_triages 之后的行
declare -a AC_ENTRIES=()
declare -a PT_ENTRIES=()

PARSED="$(parse_workflow)"
# 解析阶段游标:before-ac / in-ac / between / in-pt / after
CURSOR="before-ac"
SAW_AC=0
SAW_PT=0

while IFS= read -r line; do
  case "$line" in
    "###WFE_BEGIN_AC")
      SAW_AC=1; CURSOR="in-ac"
      ;;
    "###WFE_END_AC")
      CURSOR="between"
      ;;
    "###WFE_BEGIN_PT")
      SAW_PT=1; CURSOR="in-pt"
      ;;
    "###WFE_END_PT")
      CURSOR="after"
      ;;
    "###WFE_AC_ENTRY"*)
      # 移除前缀(包含起始 SEP)
      AC_ENTRIES+=("${line#"###WFE_AC_ENTRY$SEP"}")
      ;;
    "###WFE_PT_ENTRY"*)
      PT_ENTRIES+=("${line#"###WFE_PT_ENTRY$SEP"}")
      ;;
    "###WFE_OTHER"*)
      content="${line#"###WFE_OTHER$SEP"}"
      case "$CURSOR" in
        before-ac) HEAD_OTHERS+=("$content") ;;
        between)   MID_OTHERS+=("$content") ;;
        after)     TAIL_OTHERS+=("$content") ;;
        *)         HEAD_OTHERS+=("$content") ;;  # 兜底
      esac
      ;;
  esac
done <<< "$PARSED"

# 若文件根本没有 active_changes / pending_triages 顶层 key,补齐
if [ "$SAW_AC" -eq 0 ]; then SAW_AC=1; fi
if [ "$SAW_PT" -eq 0 ]; then SAW_PT=1; fi

# ===== 4. 按 op 修改 entry 列表 ============================================
ac_find_index() {
  local target="$1" i=0
  for e in "${AC_ENTRIES[@]:-}"; do
    [ -z "$e" ] && { i=$((i+1)); continue; }
    local cid="${e%%$SEP*}"
    if [ "$cid" = "$target" ]; then echo "$i"; return 0; fi
    i=$((i+1))
  done
  echo "-1"; return 1
}
pt_find_index() {
  local target="$1" i=0
  for e in "${PT_ENTRIES[@]:-}"; do
    [ -z "$e" ] && { i=$((i+1)); continue; }
    local ss="${e%%$SEP*}"
    if [ "$ss" = "$target" ]; then echo "$i"; return 0; fi
    i=$((i+1))
  done
  echo "-1"; return 1
}

case "$OP" in
  append-active)
    cid="${kv_change_id:-}"
    ph="${kv_phase:-}"
    wt="${kv_worktree_path:-}"
    sa="${kv_started_at:-}"
    if [ -z "$cid" ]; then echo "[workflow-entry] 阻断：append-active 需要 --change-id" >&2; exit 3; fi
    AC_ENTRIES+=("$cid$SEP$ph$SEP$wt$SEP$sa")
    VERIFY_KIND="ac_has_cid"; VERIFY_VAL="$cid"
    ;;

  update-active)
    target="${kv_where_change_id:-}"
    if [ -z "$target" ]; then echo "[workflow-entry] 阻断：update-active 需要 --where-change-id" >&2; exit 3; fi
    idx=$(ac_find_index "$target")
    if [ "$idx" -lt 0 ]; then
      echo "[workflow-entry] 阻断：update-active 未找到 change_id=$target 的 entry" >&2
      exit 3
    fi
    cur="${AC_ENTRIES[$idx]}"
    IFS="$SEP" read -r cur_cid cur_ph cur_wt cur_sa <<< "$cur"
    new_ph="${kv_set_phase:-$cur_ph}"
    new_wt="${kv_set_worktree_path:-$cur_wt}"
    AC_ENTRIES[$idx]="$cur_cid$SEP$new_ph$SEP$new_wt$SEP$cur_sa"
    VERIFY_KIND="ac_entry_phase"; VERIFY_VAL="$target|$new_ph"
    ;;

  rename-active)
    old="${kv_from_change_id:-}"
    new="${kv_to_change_id:-}"
    if [ -z "$old" ] || [ -z "$new" ]; then
      echo "[workflow-entry] 阻断：rename-active 需要 --from <old> --to <new>" >&2; exit 3
    fi
    idx=$(ac_find_index "$old")
    if [ "$idx" -lt 0 ]; then
      echo "[workflow-entry] 阻断：rename-active 未找到 change_id=$old 的 entry" >&2
      exit 3
    fi
    cur="${AC_ENTRIES[$idx]}"
    IFS="$SEP" read -r _ cur_ph cur_wt cur_sa <<< "$cur"
    AC_ENTRIES[$idx]="$new$SEP$cur_ph$SEP$cur_wt$SEP$cur_sa"
    VERIFY_KIND="ac_has_cid"; VERIFY_VAL="$new"
    VERIFY_KIND_NEG="ac_has_cid"; VERIFY_VAL_NEG="$old"
    ;;

  delete-active)
    target="${kv_where_change_id:-}"
    if [ -z "$target" ]; then echo "[workflow-entry] 阻断：delete-active 需要 --where-change-id" >&2; exit 3; fi
    new_arr=()
    for e in "${AC_ENTRIES[@]:-}"; do
      [ -z "$e" ] && continue
      cid="${e%%$SEP*}"
      [ "$cid" = "$target" ] && continue
      new_arr+=("$e")
    done
    AC_ENTRIES=("${new_arr[@]:-}")
    VERIFY_KIND="ac_no_cid"; VERIFY_VAL="$target"
    ;;

  upsert-pending-triage)
    ss="${kv_session_suffix:-}"
    tier="${kv_tier:-}"
    t1="${kv_t1_result:-$tier}"
    t2="${kv_t2_result:-}"
    ts="${kv_timestamp:-$(date -u +%FT%TZ)}"
    if [ -z "$ss" ] || [ -z "$tier" ]; then
      echo "[workflow-entry] 阻断：upsert-pending-triage 需要 --session-suffix 与 --tier" >&2; exit 3
    fi
    new_entry="$ss$SEP$tier$SEP$t1$SEP$t2$SEP$ts"
    idx=$(pt_find_index "$ss")
    if [ "$idx" -ge 0 ]; then
      PT_ENTRIES[$idx]="$new_entry"
    else
      PT_ENTRIES+=("$new_entry")
    fi
    VERIFY_KIND="pt_has_ss"; VERIFY_VAL="$ss"
    ;;

  delete-pending-triage)
    ss="${kv_session_suffix:-}"
    if [ -z "$ss" ]; then echo "[workflow-entry] 阻断：delete-pending-triage 需要 --session-suffix" >&2; exit 3; fi
    new_arr=()
    for e in "${PT_ENTRIES[@]:-}"; do
      [ -z "$e" ] && continue
      cur_ss="${e%%$SEP*}"
      [ "$cur_ss" = "$ss" ] && continue
      new_arr+=("$e")
    done
    PT_ENTRIES=("${new_arr[@]:-}")
    VERIFY_KIND="pt_no_ss"; VERIFY_VAL="$ss"
    ;;

  *)
    echo "[workflow-entry] 阻断：未知 op '$OP'" >&2
    exit 3
    ;;
esac

# ===== 5. 序列化写回 =======================================================
serialize_yaml() {
  local out="$1"
  {
    # head 块(active_changes 之前的所有非块内容)
    for l in "${HEAD_OTHERS[@]:-}"; do printf '%s\n' "$l"; done

    # active_changes 块
    if [ "${#AC_ENTRIES[@]}" -eq 0 ] || [ -z "${AC_ENTRIES[0]:-}" ]; then
      printf 'active_changes: []\n'
    else
      printf 'active_changes:\n'
      for e in "${AC_ENTRIES[@]}"; do
        [ -z "$e" ] && continue
        IFS="$SEP" read -r cid ph wt sa <<< "$e"
        printf '  - change_id: "%s"\n' "$cid"
        printf '    phase: %s\n' "$ph"
        printf '    worktree_path: "%s"\n' "$wt"
        printf '    started_at: "%s"\n' "$sa"
      done
    fi

    # 中间其它行
    for l in "${MID_OTHERS[@]:-}"; do printf '%s\n' "$l"; done

    # pending_triages 块
    if [ "${#PT_ENTRIES[@]}" -eq 0 ] || [ -z "${PT_ENTRIES[0]:-}" ]; then
      printf 'pending_triages: []\n'
    else
      printf 'pending_triages:\n'
      for e in "${PT_ENTRIES[@]}"; do
        [ -z "$e" ] && continue
        IFS="$SEP" read -r ss tier t1 t2 ts <<< "$e"
        printf '  - session_suffix: %s\n' "$ss"
        printf '    tier: %s\n' "$tier"
        printf '    t1_result: %s\n' "$t1"
        printf '    t2_result: "%s"\n' "$t2"
        printf '    timestamp: "%s"\n' "$ts"
      done
    fi

    # 末尾其它行
    for l in "${TAIL_OTHERS[@]:-}"; do printf '%s\n' "$l"; done
  } > "$out"
}

serialize_yaml "$TMP"
mv "$TMP" "$WF_FILE"

# ===== 6. 写后校验(policies/workflow-lock.md 步骤 3) =======================
verify() {
  local kind="$1" val="$2"
  case "$kind" in
    ac_has_cid)
      grep -qE "^[[:space:]]*-[[:space:]]*change_id:[[:space:]]*\"?${val}\"?[[:space:]]*$" "$WF_FILE"
      ;;
    ac_no_cid)
      ! grep -qE "^[[:space:]]*-[[:space:]]*change_id:[[:space:]]*\"?${val}\"?[[:space:]]*$" "$WF_FILE"
      ;;
    ac_entry_phase)
      # val 形如 <change_id>|<phase>
      local cid="${val%%|*}" want_ph="${val#*|}"
      awk -v cid="$cid" -v want="$want_ph" '
        /^[[:space:]]*-[[:space:]]*change_id:/ {
          v=$0; sub(/^[[:space:]]*-[[:space:]]*change_id:[[:space:]]*/, "", v)
          gsub(/^"|"$/, "", v); cur=v; next
        }
        cur==cid && /^[[:space:]]+phase:/ {
          v=$0; sub(/^[[:space:]]+phase:[[:space:]]*/, "", v)
          gsub(/^"|"$/, "", v)
          if (v == want) { found=1; exit }
        }
        END { exit (found ? 0 : 1) }
      ' "$WF_FILE"
      ;;
    pt_has_ss)
      grep -qE "^[[:space:]]*-[[:space:]]*session_suffix:[[:space:]]*${val}[[:space:]]*$" "$WF_FILE"
      ;;
    pt_no_ss)
      ! grep -qE "^[[:space:]]*-[[:space:]]*session_suffix:[[:space:]]*${val}[[:space:]]*$" "$WF_FILE"
      ;;
    *) return 1 ;;
  esac
}

if ! verify "$VERIFY_KIND" "$VERIFY_VAL"; then
  echo "[workflow-entry] 写后校验失败(kind=$VERIFY_KIND val=$VERIFY_VAL)" >&2
  echo "[workflow-entry] 期望状态未在 workflow.yaml 中观察到,请人工检查 $WF_FILE" >&2
  exit 2
fi
# rename-active 还需校验旧 cid 不在
if [ "${VERIFY_KIND_NEG:-}" = "ac_has_cid" ]; then
  if ! verify "ac_no_cid" "${VERIFY_VAL_NEG:-}"; then
    echo "[workflow-entry] 写后校验失败(rename 后旧 change_id=${VERIFY_VAL_NEG} 仍存在)" >&2
    exit 2
  fi
fi

exit 0
