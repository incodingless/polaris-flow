/**
 * `.polaris/.locks/workflow.lock` 获取与释放。
 * 对齐 hooks/workflow-entry.sh 与 policies/workflow-lock.md（H12）：
 * noclobber 创建、5s stale、6s 自旋、持有者写入。
 */
import fs from 'fs';
import { setTimeout as delay } from 'timers/promises';

import { getLocksDir, getWorkflowLockPath } from '../config/polaris-paths.js';

export { getWorkflowLockPath } from '../config/polaris-paths.js';

export const WORKFLOW_LOCK_STALE_MS = 5_000;
export const WORKFLOW_LOCK_SPIN_MS = 6_000;
export const WORKFLOW_LOCK_POLL_MS = 100;

export type WorkflowLockHandle = {
  lockPath: string;
  /** 释放锁（幂等） */
  release: () => void;
};

/**
 * 尝试以排他方式创建锁文件（等价 bash noclobber `>`）。
 * 成功返回 true；已存在返回 false。
 */
function tryCreateExclusive(lockPath: string): boolean {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.closeSync(fd);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return false;
    throw err;
  }
}

/** 写入锁内容：skill pid unix_ts ISO */
function writeLockPayload(lockPath: string, skill: string): void {
  const nowSec = Math.floor(Date.now() / 1000);
  const iso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const payload = `${skill} ${process.pid} ${nowSec} ${iso}\n`;
  fs.writeFileSync(lockPath, payload, 'utf-8');
}

/**
 * 获取 workflow.lock；超时抛错（调用方映射为 exit 1）。
 */
export async function acquireWorkflowLock(
  repoRoot: string,
  skill: string,
  options?: {
    staleMs?: number;
    spinMs?: number;
    pollMs?: number;
    now?: () => number;
  },
): Promise<WorkflowLockHandle> {
  const staleMs = options?.staleMs ?? WORKFLOW_LOCK_STALE_MS;
  const spinMs = options?.spinMs ?? WORKFLOW_LOCK_SPIN_MS;
  const pollMs = options?.pollMs ?? WORKFLOW_LOCK_POLL_MS;
  const now = options?.now ?? Date.now;

  const lockDir = getLocksDir(repoRoot);
  fs.mkdirSync(lockDir, { recursive: true });
  const lockPath = getWorkflowLockPath(repoRoot);

  const acquireStart = now();
  while (true) {
    if (tryCreateExclusive(lockPath)) {
      writeLockPayload(lockPath, skill);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // 幂等
        }
      };
      return { lockPath, release };
    }

    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(lockPath).mtimeMs;
    } catch {
      continue;
    }
    const age = now() - mtimeMs;
    if (age >= staleMs) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // 竞态：他人已删/已占
      }
      continue;
    }

    if (now() - acquireStart >= spinMs) {
      let holder = '<unreadable>';
      try {
        holder = fs.readFileSync(lockPath, 'utf-8').trim() || holder;
      } catch {
        // ignore
      }
      throw new WorkflowLockError(
        `workflow.lock 持续 ${spinMs / 1000}s 未能获取（HARD STOP H12）`,
        holder,
        lockPath,
      );
    }

    await delay(pollMs);
  }
}

/** 锁获取失败错误 */
export class WorkflowLockError extends Error {
  readonly holder: string;
  readonly lockPath: string;

  constructor(message: string, holder: string, lockPath: string) {
    super(message);
    this.name = 'WorkflowLockError';
    this.holder = holder;
    this.lockPath = lockPath;
  }
}
