/** 插件根落盘目录名（.<platform>/skills/polaris） */
export const POLARIS_PLUGIN_NAME = 'polaris';

/**
 * 命令命名空间前缀。nested → `<ctx>/commands/<前缀>/…`；flat → `<ctx>/commands/<前缀>-….md`。
 * 与技能插件名（`POLARIS_PLUGIN_NAME`）**刻意解耦**：技能保持 `polaris`，命令用 `psfl`。
 */
export const POLARIS_COMMAND_PREFIX = 'psfl';

/** CLI / npm 包名（bin 仍为 polaris-flow） */
export const POLARIS_FLOW_PLUGIN_NAME = 'polaris-flow';

/**
 * 程序本体（polaris-flow）的默认 npm registry：公司内网 Nexus 3 聚合仓库。
 * polaris-flow 是纯私有包（公网 npm 404），`update`/安装必须显式走它；
 * 与 `install.sh` 的 DEFAULT_REGISTRY 保持一致。
 */
export const DEFAULT_NPM_REGISTRY = 'http://192.168.103.96:8081/repository/npm-group/';

/**
 * 覆盖 npm registry 的环境变量名（唯一源）。缺省用 `DEFAULT_NPM_REGISTRY`。
 * 与安装通道 `CHANNEL_ENV_KEYS.npmRegistry` 同键，见 `src/core/install/channels.ts`。
 */
export const POLARIS_NPM_REGISTRY_ENV = 'POLARIS_NPM_REGISTRY';

/** 历史别名：与 POLARIS_PLUGIN_NAME 相同，逐步淘汰 */
export const POLARIS_PLUGIN_PREFIX = POLARIS_PLUGIN_NAME;
