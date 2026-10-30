#!/usr/bin/env bash
# Polaris Flow 维护者入口：状态看板 + 常用命令菜单
#
# 用途：把 devops/ 下的维护者脚本收在一处，并把「发版前容易漏的东西」（版本号是否升、
# CHANGELOG 顶部是否一致、工作区是否干净）在动手前摆出来。
#
# 用法:
#   bash devops/dev.sh            # 交互菜单
#   bash devops/dev.sh <编号>     # 直接执行某一项（可脚本化 / 挂 CI）
#   bash devops/dev.sh h <编号>   # 看该项对应脚本的用法头部
#   bash devops/dev.sh list       # 只打印菜单
#
# 设计约束（改本文件前先读）:
#   - 菜单里**不写参数说明**。参数归各脚本自己，这里只给「一句话 + 命令」，
#     否则脚本一改参数，本文件就变成错误信息的来源。
#   - 新增一个 devops 脚本 = 菜单文字加一行 + dispatch 加一个分支，两处。
#   - 只读 package.json / CHANGELOG.md / git，不碰任何产物。

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

bold() { printf '\033[1m%s\033[0m' "$1"; }
dim() { printf '\033[2m%s\033[0m' "$1"; }
green() { printf '\033[32m%s\033[0m' "$1"; }
yellow() { printf '\033[33m%s\033[0m' "$1"; }
red() { printf '\033[31m%s\033[0m' "$1"; }

#---------------------------------
#         当前状态
#---------------------------------

package_version() {
  sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json 2>/dev/null | head -1
}

changelog_version() {
  # 取 CHANGELOG 顶部第一条 `## What's Changed [x.y.z]`
  grep -m1 -E '^## What.s Changed \[' CHANGELOG.md 2>/dev/null |
    sed -n 's/.*\[\([^]]*\)\].*/\1/p'
}

dirty_count() {
  # 排除 .workbuddy：AI 记忆被 git 跟踪，不该算进「工作区脏」
  git status --porcelain -- . ':(exclude).workbuddy' 2>/dev/null | wc -l | tr -d ' '
}

print_state() {
  local branch pkg cl dirty cl_mark
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')"
  pkg="$(package_version)"
  cl="$(changelog_version)"
  dirty="$(dirty_count)"

  if [ -n "$cl" ] && [ "$cl" = "$pkg" ]; then
    cl_mark="$(green '✓') 与 package.json 一致"
  elif [ -n "$cl" ]; then
    cl_mark="$(red '✗') CHANGELOG 顶部 ${cl}，package.json ${pkg}"
  else
    cl_mark="$(yellow '?') 读不到顶部版本"
  fi

  if [ "$dirty" = "0" ]; then
    printf '  %s · %s · %s\n' "分支 $(bold "$branch")" "版本 $(bold "$pkg")" "$(green '工作区干净')"
  else
    printf '  %s · %s · %s\n' "分支 $(bold "$branch")" "版本 $(bold "$pkg")" "$(yellow "${dirty} 个未提交改动")"
  fi
  printf '  CHANGELOG 顶部 %s\n' "$cl_mark"
}

#---------------------------------
#         菜单
#---------------------------------

print_menu() {
  # 命令列在前、说明在后：命令是纯 ASCII，%-34s 能对齐；中文说明放行尾就不受字宽影响
  printf '\n  %s\n' "$(bold '日常')"
  printf '   1) %-34s %s\n' 'devops/build.sh' '构建'
  printf '   2) %-34s %s\n' 'devops/build.sh --check' '构建 + lint + test（提交前推荐）'
  printf '   3) %-34s %s\n' 'pnpm test' '只跑测试'
  printf '   4) %-34s %s\n' 'devops/sync-bundled-skills.mjs' '检查附带技能有没有新版'
  printf '\n  %s\n' "$(bold '发版')"
  printf '   5) %-34s %s\n' 'devops/package.sh' '打离线安装包 → release-<版本>-<日期>/'
  printf '   6) %-34s %s\n' 'npm pack --dry-run' '看 npm 包里有什么（会先构建）'
  printf '   7) %-34s %s\n' 'devops/publish.sh --dry-run' '发布预演，不动远端'
  printf '   8) %-34s %s\n' 'devops/publish.sh' '发布到 Nexus'
  printf '  99) %-34s %s\n' 'run: 2 -> 4 -> 8 -> 5' '全流程构建'
  printf '\n  %s\n' "$(bold '其他')"
  printf '      %-34s %s\n' 'h <编号>' '看该脚本的用法头部'
  printf '      %-34s %s\n' 'list' '只打印这张表'
  printf '      %-34s %s\n' 'q' '退出'
}

# 每一项对应的脚本文件（供 h 读取用法；也是 dispatch 的唯一映射）
target_file() {
  case "$1" in
    1 | 2) echo 'devops/build.sh' ;;
    3) echo 'package.json' ;;
    4) echo 'devops/sync-bundled-skills.mjs' ;;
    5) echo 'devops/package.sh' ;;
    6) echo 'package.json' ;;
    7 | 8) echo 'devops/publish.sh' ;;
    99) echo 'devops/dev.sh' ;;
    *) echo '' ;;
  esac
}

run_item() {
  case "$1" in
    1) exec bash devops/build.sh ;;
    2) exec bash devops/build.sh --check ;;
    3) exec pnpm test ;;
    4) exec node devops/sync-bundled-skills.mjs ;;
    5) exec bash devops/package.sh ;;
    6) exec npm pack --dry-run ;;
    # 前置检查不通过时以 3 退出，让调用方区分「取消」与「编号不存在」
    7) precheck_publish || exit 3; exec bash devops/publish.sh --dry-run ;;
    8) precheck_publish || exit 3; exec bash devops/publish.sh ;;
    99) run_flow ;;
    *) return 1 ;;
  esac
}

# 发版前置：版本号与 CHANGELOG 顶部一致、工作区干净。不一致只警告，不阻断（人可自行决定）
precheck_publish() {
  local pkg cl dirty problems=''
  pkg="$(package_version)"
  cl="$(changelog_version)"
  dirty="$(dirty_count)"

  [ -n "$cl" ] && [ "$cl" != "$pkg" ] && problems="${problems}  · CHANGELOG 顶部 ${cl} 与 package.json ${pkg} 不一致\n"
  [ "$dirty" != '0' ] && problems="${problems}  · 工作区有 ${dirty} 个未提交改动\n"

  if [ -n "$problems" ]; then
    printf '\n%s\n%b' "$(yellow '发版前置检查：')" "$problems"
    printf '  继续吗？[y/N] '
    local answer
    read -r answer
    case "$answer" in
      y | Y) return 0 ;;
      *) printf '  已取消。\n' && return 1 ;;
    esac
  fi
  return 0
}

# 全流程构建：依次 2 → 4 → 8 → 5。任一步失败即中止（取消 exit 3，失败 exit 1）。
run_flow() {
  printf '\n  %s  %s\n' "$(bold '全流程构建')" "$(dim '2 构建检查 → 4 同步技能 → 8 发布 → 5 打离线包')"

  printf '\n  %s\n' "$(green '▶ 1/4') 构建 + lint + test"
  bash devops/build.sh --check || { printf '  %s\n' "$(red '✗ 构建检查失败，流程中止')"; exit 1; }

  printf '\n  %s\n' "$(green '▶ 2/4') 同步附带技能（有新版自动升级）"
  node devops/sync-bundled-skills.mjs --update || { printf '  %s\n' "$(red '✗ 同步技能失败，流程中止')"; exit 1; }

  printf '\n  %s\n' "$(green '▶ 3/4') 发布到 Nexus"
  precheck_publish || exit 3
  bash devops/publish.sh || { printf '  %s\n' "$(red '✗ 发布失败，流程中止')"; exit 1; }

  printf '\n  %s\n' "$(green '▶ 4/4') 打离线安装包"
  bash devops/package.sh || { printf '  %s\n' "$(red '✗ 打离线包失败，流程中止')"; exit 1; }

  printf '\n  %s\n' "$(green '✓ 全流程构建完成')"
}

show_usage() {
  local file
  file="$(target_file "$1")"
  if [ -z "$file" ]; then
    printf '  没有编号 %s\n' "$1"
    return 1
  fi
  if [ "$file" = 'package.json' ]; then
    printf '  该项是包管理器命令，没有独立用法文件：\n'
    grep -E '"scripts"' -A 20 package.json
    return 0
  fi
  printf '\n  %s\n\n' "$(bold "$file")"
  sed -n '1,30p' "$file"
}

#---------------------------------
#         入口
#---------------------------------

case "${1:-}" in
  list)
    print_state
    print_menu
    exit 0
    ;;
  h | help)
    show_usage "${2:-}"
    exit $?
    ;;
  '')
    print_state
    print_menu
    printf '\n选择> '
    read -r choice || exit 0
    case "$choice" in
      q | Q) exit 0 ;;
      '') exit 0 ;;
      h) printf '  用法: h <编号>\n' ;;
      h\ *) show_usage "${choice#h }" ;;
      *)
        # 命中项用 exec 接管进程；返回非 0 才需要处理
        run_item "$choice"
        status=$?
        [ "$status" -eq 3 ] && exit 0 # 发版前置被取消
        [ "$status" -ne 0 ] && printf '  没有编号 %s\n' "$choice" && exit 1
        exit 0
        ;;
    esac
    exit 0
    ;;
  *)
    run_item "$1" || {
      printf '  未知参数: %s\n' "$1"
      printf '  用法: bash devops/dev.sh [编号 | h <编号> | list]\n'
      exit 2
    }
    ;;
esac
