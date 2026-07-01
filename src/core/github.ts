/**
 * GitHub 拉取工具 — shallow clone 指定 tag。
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

export interface FetchResult {
  localPath: string;
  version: string;
}

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
};

const LS_REMOTE_TIMEOUT_MS = 60_000;
const CLONE_TIMEOUT_MS = 180_000;

function runGit(command: string, timeoutMs: number): string {
  return execSync(command, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: GIT_ENV,
  });
}

export type ResolveVersionResult = {
  version: string | null;
  /** tag 解析失败时的原因，供日志展示 */
  reason?: 'no-tags' | 'below-min' | 'network-error';
};

/** 解析 >= minVersion 的最新 semver tag；无 tag 时返回 null（使用 HEAD） */
export function resolveVersion(repo: string, minVersion: string): ResolveVersionResult {
  let output: string;
  try {
    output = runGit(`git ls-remote --tags --sort=-v:refname ${repo}`, LS_REMOTE_TIMEOUT_MS);
  } catch (error) {
    return {
      version: null,
      reason: 'network-error',
    };
  }

  const tags = output
    .split('\n')
    .map((line) => {
      const match = line.match(/refs\/tags\/v?(\d+\.\d+\.\d+)$/);
      return match ? match[1] : null;
    })
    .filter((t): t is string => t !== null);

  if (tags.length === 0) {
    return { version: null, reason: 'no-tags' };
  }

  const minParts = minVersion.split('.').map(Number);
  const valid = tags.filter((tag) => {
    const parts = tag.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (parts[i] > minParts[i]) return true;
      if (parts[i] < minParts[i]) return false;
    }
    return true;
  });

  if (valid.length === 0) {
    return { version: null, reason: 'below-min' };
  }

  return { version: valid[0] };
}

/** shallow clone 到临时目录 */
export async function fetchRepo(repo: string, version: string | null): Promise<FetchResult> {
  const tmpDir = path.join(
    os.tmpdir(),
    `polaris-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    if (version === null) {
      runGit(`git clone --depth 1 ${repo} ${tmpDir}`, CLONE_TIMEOUT_MS);
      return { localPath: tmpDir, version: 'HEAD' };
    }

    const tagRef = `v${version}`;

    try {
      runGit(`git clone --depth 1 --branch ${tagRef} ${repo} ${tmpDir}`, CLONE_TIMEOUT_MS);
    } catch {
      runGit(`git clone --depth 1 --branch ${version} ${repo} ${tmpDir}`, CLONE_TIMEOUT_MS);
    }

    return { localPath: tmpDir, version };
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    const message = (error as Error).message;
    if (message.includes('ETIMEDOUT') || message.includes('timed out')) {
      throw new Error(
        `git clone timed out after ${CLONE_TIMEOUT_MS / 1000}s — check GitHub network access to ${repo}`,
      );
    }
    throw error;
  }
}

export async function cleanupTemp(tmpDir: string): Promise<void> {
  await fs.rm(tmpDir, { recursive: true, force: true });
}
