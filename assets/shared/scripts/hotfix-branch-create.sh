#!/usr/bin/env bash
# hotfix-branch-create.sh — 薄包装 → polaris hotfix-branch-create
# 探测主干、脏检查失败则退出；干净时基于主干创建 hotfix/<issue_id> 并切换。
# 成功 stdout JSON：{"main_branch":"...","hotfix_branch":"hotfix/..."}

_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_polaris-cli.sh
source "$_SELF/_polaris-cli.sh"
_polaris_cli_selfheal "${BASH_SOURCE[0]}" "$@"
exec_polaris hotfix-branch-create "$@"
