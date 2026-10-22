#!/usr/bin/env bash
# worktree-commit-remove.sh — 薄包装 → polaris worktree-commit-remove
# 在 worktree 内 add+commit（已干净则跳过提交），再 worktree remove。
# 用法: worktree-commit-remove.sh <worktree_path> --message "<msg>"
# 成功 stdout JSON：{"worktree_path","branch","committed","removed"}

_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_polaris-cli.sh
source "$_SELF/_polaris-cli.sh"
_polaris_cli_selfheal "${BASH_SOURCE[0]}" "$@"
exec_polaris worktree-commit-remove "$@"
