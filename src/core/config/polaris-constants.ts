/** 插件根落盘目录名（.<platform>/skills/polaris） */
export const POLARIS_PLUGIN_NAME = 'polaris';

/**
 * 命令命名空间前缀。nested → `<ctx>/commands/<前缀>/…`；flat → `<ctx>/commands/<前缀>-….md`。
 * 与技能插件名（`POLARIS_PLUGIN_NAME`）**刻意解耦**：技能保持 `polaris`，命令用 `psfl`。
 */
export const POLARIS_COMMAND_PREFIX = 'psfl';

/** CLI / npm 包名（bin 仍为 polaris-flow） */
export const POLARIS_FLOW_PLUGIN_NAME = 'polaris-flow';

/** 历史别名：与 POLARIS_PLUGIN_NAME 相同，逐步淘汰 */
export const POLARIS_PLUGIN_PREFIX = POLARIS_PLUGIN_NAME;
