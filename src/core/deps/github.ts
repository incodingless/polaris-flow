/**
 * GitHub 拉取工具 — shallow clone 指定 tag。
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

import { compareVersions } from './version.js';

/** clone 后的本地路径与解析版本 */
export interface FetchResult {
  localPath: string;
  version: string;
}

/** 组装 git 子进程环境：默认 HTTP/1.1，不覆盖用户已设置的 GIT_HTTP_VERSION */
export function getGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_HTTP_VERSION: process.env.GIT_HTTP_VERSION || 'HTTP/1.1',
  };
}

/**
 * 按 POLARIS_GITHUB_MIRROR 改写 GitHub URL。
 * 镜像含 github.com 时替换主机前缀；否则把原 URL 接到镜像基址后面。
 */
export function rewriteGithubRepoUrl(repo: string): string {
  const mirror = process.env.POLARIS_GITHUB_MIRROR?.trim();
  if (!mirror) {
    return repo;
  }
  const base = mirror.replace(/\/$/, '');
  if (!repo.startsWith('https://github.com')) {
    return repo;
  }
  if (base.includes('github.com')) {
    return repo.replace('https://github.com', base);
  }
  return `${base}/${repo}`;
}

const LS_REMOTE_TIMEOUT_MS = 60_000;
const CLONE_TIMEOUT_MS = 180_000;

/** 执行 git shell 命令；超时或失败时抛错 */
function runGitShell(command: string, timeoutMs: number): string {
  return execSync(command, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: getGitEnv(),
  });
}

/** resolveVersion 的结果；version 为 null 表示退回 HEAD 或失败 */
export type ResolveVersionResult = {
  version: string | null;
  /** tag 解析失败时的原因，供日志展示 */
  reason?: 'no-tags' | 'below-min' | 'network-error';
};

/** 解析 >= minVersion 的最新 semver tag；无 tag 时返回 null（使用 HEAD） */
export function resolveVersion(repo: string, minVersion: string): ResolveVersionResult {
  const gitRepo = rewriteGithubRepoUrl(repo);
  let output: string;
  try {
    output = runGitShell(`git ls-remote --tags --sort=-v:refname ${gitRepo}`, LS_REMOTE_TIMEOUT_MS);
  } catch {
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

  const valid = tags.filter((tag) => compareVersions(tag, minVersion) >= 0);

  if (valid.length === 0) {
    return { version: null, reason: 'below-min' };
  }

  return { version: valid[0] };
}

/** shallow clone 到临时目录 */
export async function fetchRepo(repo: string, version: string | null): Promise<FetchResult> {
  const gitRepo = rewriteGithubRepoUrl(repo);
  const tmpDir = path.join(
    os.tmpdir(),
    `polaris-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    if (version === null) {
      runGitShell(`git clone --depth 1 ${gitRepo} ${tmpDir}`, CLONE_TIMEOUT_MS);
      return { localPath: tmpDir, version: 'HEAD' };
    }

    const tagRef = `v${version}`;

    try {
      runGitShell(`git clone --depth 1 --branch ${tagRef} ${gitRepo} ${tmpDir}`, CLONE_TIMEOUT_MS);
    } catch {
      runGitShell(`git clone --depth 1 --branch ${version} ${gitRepo} ${tmpDir}`, CLONE_TIMEOUT_MS);
    }

    return { localPath: tmpDir, version };
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    const message = (error as Error).message;
    if (message.includes('ETIMEDOUT') || message.includes('timed out')) {
      throw new Error(
        `git clone timed out after ${CLONE_TIMEOUT_MS / 1000}s — check GitHub network access to ${repo}`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** 清理 fetchRepo 产生的临时目录 */
export async function cleanupTemp(tmpDir: string): Promise<void> {
  await fs.rm(tmpDir, { recursive: true, force: true });
}
