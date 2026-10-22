/**
 * 安装内核与 update 共用的叶类型。
 * 独立成文件是为了让 `install/*` 与 `update/*` 都能引用，而不必依赖统一编排入口 `install.ts`
 * （避免 install 与 update 之间形成循环依赖）。
 */

/**
 * Polaris bundled 资产类别 —— 安装与更新的最小可选粒度。
 * 与 `installPolarisForPlatform` 的固定步骤顺序一一对应。
 */
export type PolarisAssetKind = 'skills' | 'commands' | 'agents' | 'rules' | 'hooks';

/** 全部资产类别（含顺序，即安装顺序） */
export const POLARIS_ASSET_KINDS: readonly PolarisAssetKind[] = [
  'skills',
  'commands',
  'agents',
  'rules',
  'hooks',
];

/**
 * 单类文件拷贝结果。
 * `files` 为本次该类资产实际落盘的绝对路径（含既有未改写的文件），
 * 供 update 做托管文件清理（--prune）与状态记录；init 不消费。
 */
export type CopyStats = {
  copied: number;
  skipped: number;
  files: string[];
};
