/**
 * 命令适配器公共导出入口。
 */
export { getCommandAdapter } from './registry.js';
/** 再导出适配器类型，供外部统一从此入口引用 */
export type { CommandAdapter, CommandContent } from './types.js';
