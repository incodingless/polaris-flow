#!/usr/bin/env bash
# structure-create.sh — 遗留别名 → polaris draft-create
# 旧 .harness/changes 逻辑已废弃；等同 draft-create（.polaris/tasks）。

_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_polaris-cli.sh
source "$_SELF/_polaris-cli.sh"
_polaris_cli_selfheal "${BASH_SOURCE[0]}" "$@"
exec_polaris draft-create "$@"
