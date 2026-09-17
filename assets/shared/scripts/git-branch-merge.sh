#!/usr/bin/env bash
# git-branch-merge.sh — 薄包装 → polaris git-branch-merge
# 将指定本地分支以 merge --no-ff 合并进主干；成功 stdout JSON：
# {"main_branch":"...","source_branch":"..."}

_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_polaris-cli.sh
source "$_SELF/_polaris-cli.sh"
_polaris_cli_selfheal "${BASH_SOURCE[0]}" "$@"
exec_polaris git-branch-merge "$@"
