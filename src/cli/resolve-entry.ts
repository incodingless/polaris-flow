/**
 * 解析当前 CLI 入口名：`polaris`（用户面）或 `polaris-flow`（hooks/scripts 运行时）。
 */
import path from 'path';

export type CliEntryName = 'polaris' | 'polaris-flow';

/**
 * 根据 argv[1] 的 basename 判定入口（兼容 .js / 无后缀 symlink）。
 */
export function resolveCliEntry(argv1: string = process.argv[1] ?? ''): CliEntryName {
  const base = path.basename(argv1).replace(/\.(js|mjs|cjs|ts)$/i, '');
  if (base === 'polaris-flow' || base.startsWith('polaris-flow')) {
    return 'polaris-flow';
  }
  return 'polaris';
}
