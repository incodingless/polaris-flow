#!/usr/bin/env bash
# clarify-finalize.sh — 兼容别名 → polaris task-finalize
# Skill 仍引用本文件名；实现与 task-finalize 相同。

_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_polaris-cli.sh
source "$_SELF/_polaris-cli.sh"
_polaris_cli_selfheal "${BASH_SOURCE[0]}" "$@"
exec_polaris task-finalize "$@"
