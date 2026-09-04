#!/usr/bin/env bash
# worktree-rebase-ff.sh — 薄包装 → polaris worktree-rebase-ff

_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_polaris-cli.sh
source "$_SELF/_polaris-cli.sh"
_polaris_cli_selfheal "${BASH_SOURCE[0]}" "$@"
exec_polaris worktree-rebase-ff "$@"
