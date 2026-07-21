#!/usr/bin/env bash
# pre-design-validate.sh — 兼容别名 → polaris intention-validate
# 旧名保留；校验对象为 intention.md（非 pre_design.md）。

_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_polaris-cli.sh
source "$_SELF/_polaris-cli.sh"
_polaris_cli_selfheal "${BASH_SOURCE[0]}" "$@"
exec_polaris intention-validate "$@"
