/**
 * workflow-entry / workflow-lock / workflow-state 单元测试。
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { emptyWorkflowState, loadWorkflowState } from '../../src/core/config/workflow-state.js';
import {
  applyWorkflowOp,
  makeActiveEntry,
  runWorkflowEntry,
} from '../../src/core/hooks/workflow-entry.js';
import { acquireWorkflowLock } from '../../src/core/hooks/workflow-lock.js';

async function tmpRepo(): Promise<string> {
  const dir = await import('fs/promises').then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), 'polaris-wfe-')),
  );
  await mkdir(path.join(dir, '.polaris'), { recursive: true });
  return dir;
}

describe('applyWorkflowOp', () => {
  it('append / update / rename / delete active', () => {
    let c = emptyWorkflowState();
    let r = applyWorkflowOp(c, {
      op: 'append-active',
      skill: 't',
      changeId: 'draft-1',
      phase: 'clarify',
      worktreePath: '',
      startedAt: '2026-01-01T00:00:00Z',
    });
    expect(r.state.active_changes).toHaveLength(1);
    expect(r.verify.kind).toBe('ac_has_cid');

    r = applyWorkflowOp(r.state, {
      op: 'update-active',
      skill: 't',
      whereChangeId: 'draft-1',
      setPhase: 'propose',
    });
    expect(r.state.active_changes[0].phase).toBe('propose');

    r = applyWorkflowOp(r.state, {
      op: 'rename-active',
      skill: 't',
      from: 'draft-1',
      to: 'feat-abc123',
    });
    expect(r.state.active_changes[0].change_id).toBe('feat-abc123');
    expect(r.verifyNeg?.val).toBe('draft-1');

    r = applyWorkflowOp(r.state, {
      op: 'delete-active',
      skill: 't',
      whereChangeId: 'feat-abc123',
    });
    expect(r.state.active_changes).toHaveLength(0);
  });

  it('upsert / delete pending triage', () => {
    let c = emptyWorkflowState();
    let r = applyWorkflowOp(c, {
      op: 'upsert-pending-triage',
      skill: 't',
      sessionSuffix: 'aabbcc',
      tier: 'standard',
      timestamp: '2026-01-01T00:00:00Z',
    });
    expect(r.state.pending_triages[0].tier).toBe('standard');
    r = applyWorkflowOp(r.state, {
      op: 'delete-pending-triage',
      skill: 't',
      sessionSuffix: 'aabbcc',
    });
    expect(r.state.pending_triages).toHaveLength(0);
  });
});

describe('runWorkflowEntry', () => {
  it('append-active 写盘并可读回', async () => {
    const repo = await tmpRepo();
    const result = await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      repoRoot: repo,
      changeId: 'draft-xyz',
      phase: 'clarify',
      worktreePath: '',
      startedAt: '2026-07-21T00:00:00Z',
    });
    expect(result.exitCode).toBe(0);
    const state = await loadWorkflowState(repo);
    expect(state.active_changes).toEqual([
      makeActiveEntry({
        change_id: 'draft-xyz',
        phase: 'clarify',
        worktree_path: '',
        started_at: '2026-07-21T00:00:00Z',
      }),
    ]);
  });

  it('缺 skill → exit 3', async () => {
    const repo = await tmpRepo();
    const result = await runWorkflowEntry({
      op: 'append-active',
      skill: '',
      repoRoot: repo,
      changeId: 'x',
    });
    expect(result.exitCode).toBe(3);
  });

  it('锁被占用且未 stale → exit 1', async () => {
    const repo = await tmpRepo();
    const held = await acquireWorkflowLock(repo, 'holder', {
      staleMs: 60_000,
      spinMs: 300,
      pollMs: 50,
    });
    try {
      const result = await runWorkflowEntry({
        op: 'append-active',
        skill: 'waiter',
        repoRoot: repo,
        changeId: 'a',
        lockOptions: { staleMs: 60_000, spinMs: 250, pollMs: 40 },
      });
      expect(result.exitCode).toBe(1);
    } finally {
      held.release();
    }
  });

  it('get-active-changes 只读返回 JSON，可按 phase 过滤', async () => {
    const repo = await tmpRepo();
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      repoRoot: repo,
      changeId: 'c1',
      phase: 'clarify',
      startedAt: '2026-07-21T00:00:00Z',
    });
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      repoRoot: repo,
      changeId: 'p1',
      phase: 'propose',
      startedAt: '2026-07-21T01:00:00Z',
    });

    const all = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      repoRoot: repo,
    });
    expect(all.exitCode).toBe(0);
    expect(all.activeChanges).toHaveLength(2);
    expect(all.changeIds).toEqual(['c1', 'p1']);

    const clarifyOnly = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      repoRoot: repo,
      phase: 'clarify',
    });
    expect(clarifyOnly.exitCode).toBe(0);
    expect(clarifyOnly.changeIds).toEqual(['c1']);
    expect(clarifyOnly.activeChanges).toEqual([
      makeActiveEntry({
        change_id: 'c1',
        phase: 'clarify',
        worktree_path: '',
        started_at: '2026-07-21T00:00:00Z',
      }),
    ]);
  });
});

describe('workflow-lock stale', () => {
  it('过期锁可被抢占', async () => {
    const repo = await tmpRepo();
    const lockPath = path.join(repo, '.polaris', '.locks', 'workflow.lock');
    await mkdir(path.dirname(lockPath), { recursive: true });
    await writeFile(lockPath, 'old 1 1 2020-01-01T00:00:00Z\n', 'utf-8');
    const mtime = (await import('fs')).statSync(lockPath).mtimeMs;
    const h = await acquireWorkflowLock(repo, 'b', {
      staleMs: 100,
      spinMs: 1000,
      pollMs: 20,
      now: () => mtime + 200,
    });
    const body = await readFile(h.lockPath, 'utf-8');
    expect(body.startsWith('b ')).toBe(true);
    h.release();
  });
});
