/**
 * npm / npx 可执行文件与全局包版本查询。
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
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
 * 查询 npm 全局 prefix 目录；失败时返回 null。
 */
export function getNpmGlobalPrefix(): string | null {
  try {
    const npm = getNodeToolExecutable('npm');
    const output = execSync(`${npm} config get prefix`, {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim() || null;
  } catch {
    return null;
  }
}

/**
 * 探测全局 prefix 目录是否可写（建临时文件实测，避免 access() 在 Windows ACL 上误判）。
 * prefix 可能尚未创建（全新环境）：向上找最近已存在祖先再探测。
 * 返回 null 表示无法判定（取不到 prefix 或找不到可探测的祖先）。
 */
export function isNpmGlobalPrefixWritable(prefix: string): boolean | null {
  let probe = prefix;
  while (probe && !fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) return null;
    probe = parent;
  }
  if (!probe) return null;

  const probeFile = path.join(probe, `.polaris-write-probe-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probeFile, '');
    return true;
  } catch {
    return false;
  } finally {
    try {
      fs.unlinkSync(probeFile);
    } catch {
      // 探测文件本就不存在则忽略
    }
  }
}

/**
 * 打印 npm 全局 prefix 不可写的定向提示（与 install.sh「必须 root 安装」口径一致）。
 * @param sudoInstallCommand 带完整包名的 sudo 安装命令，供用户直接复制
 * @param prefix 已探测到的 prefix（缺省时现查一次）
 */
export function printNpmPrefixNotWritableHint(sudoInstallCommand: string, prefix?: string): void {
  const npmPrefix = prefix ?? getNpmGlobalPrefix();
  console.error(`    npm 全局目录不可写${npmPrefix ? `: ${npmPrefix}` : ''}（无写权限，EACCES）。`);
  console.error(`    用 root 安装：${sudoInstallCommand}`);
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
