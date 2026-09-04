#!/usr/bin/env bash
# session-start.sh — 宿主 SessionStart → polaris-flow host-hook 分发器
#
# 统一走 host-hook；--fallback-event 兼容缺 hook_event_name 的 stdin。
# CLI 共用库位于 ../scripts/_polaris-cli.sh。

_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../scripts/_polaris-cli.sh
source "$_SELF/../scripts/_polaris-cli.sh"
_polaris_cli_selfheal "${BASH_SOURCE[0]}" "$@"
exec_polaris host-hook --fallback-event SessionStart "$@"
