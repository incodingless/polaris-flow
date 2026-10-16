/**
 * npm / npx 可执行文件与全局包版本查询。
 */

import { execSync } from 'child_process';
import https from 'https';

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

/**
 * 查询 npm registry 上某包的最新版本；网络不可达或响应非 200 时返回 null。
 */
export function getLatestNpmVersion(packageName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const request = https.get(
      `https://registry.npmjs.org/${packageName}/latest`,
      { timeout: 5000 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }

        let data = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as { version?: string };
            resolve(typeof parsed.version === 'string' ? parsed.version : null);
          } catch {
            resolve(null);
          }
        });
      },
    );

    request.on('error', () => resolve(null));
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
  });
}
