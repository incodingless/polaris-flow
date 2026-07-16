/**
 * npm / npx 可执行文件与全局包版本查询。
 */

import { execSync } from 'child_process';

/** 按平台返回 npm 或 npx 可执行名（Windows 用 .cmd） */
export function getNodeToolExecutable(
  tool: 'npm' | 'npx',
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    return tool === 'npm' ? 'npm.cmd' : 'npx.cmd';
  }
  return tool;
}

/**
 * 查询全局安装的 npm 包版本；失败时返回 '0.0.0'。
 */
export function getNpmPackageVersion(packageName: string): string {
  try {
    const npm = getNodeToolExecutable('npm');
    const output = execSync(`${npm} list -g ${packageName} --json`, {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const data = JSON.parse(output);
    return data.dependencies?.[packageName]?.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
