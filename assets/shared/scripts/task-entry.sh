#!/usr/bin/env bash
# task-entry.sh — 薄包装 → polaris task-entry
#
# 入口技能「进入任务」的唯一原语；业务逻辑在 TypeScript（src/core/hooks/task-entry.ts）。
# 用法: task-entry.sh --kind coding --as tweak --mode tweak --repo-root "$REPO_ROOT"
# 成功 stdout 一行 JSON；参数/环境错误走 stderr + 非 0 退出码。

_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_polaris-cli.sh
source "$_SELF/_polaris-cli.sh"
_polaris_cli_selfheal "${BASH_SOURCE[0]}" "$@"
exec_polaris task-entry "$@"
