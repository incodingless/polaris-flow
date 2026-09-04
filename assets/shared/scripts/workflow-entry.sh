#!/usr/bin/env bash
# workflow-entry.sh — 薄包装 → polaris workflow-entry
#
# Skill 仍调用本脚本；业务逻辑在 TypeScript（src/core/hooks/workflow-entry.ts）。

_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_polaris-cli.sh
source "$_SELF/_polaris-cli.sh"
_polaris_cli_selfheal "${BASH_SOURCE[0]}" "$@"
exec_polaris workflow-entry "$@"
