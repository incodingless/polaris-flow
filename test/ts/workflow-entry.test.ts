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
  makeTaskEntry,
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
  it('append / update / rename / delete change_tasks', () => {
    let c = emptyWorkflowState();
    let r = applyWorkflowOp(c, {
      op: 'append-active',
      skill: 't',
      kind: 'change',
      taskId: 'draft-1',
      phase: 'clarify',
      worktreePath: '',
      startedAt: '2026-01-01T00:00:00Z',
    });
    expect(r.state.change_tasks).toHaveLength(1);
    expect(r.state.requirement_tasks).toHaveLength(0);
    expect(r.verify.kind).toBe('has_tid');

    r = applyWorkflowOp(r.state, {
      op: 'update-active',
      skill: 't',
      kind: 'change',
      whereTaskId: 'draft-1',
      setPhase: 'propose',
    });
    expect(r.state.change_tasks[0].phase).toBe('propose');

    r = applyWorkflowOp(r.state, {
      op: 'rename-active',
      skill: 't',
      kind: 'change',
      from: 'draft-1',
      to: 'feat-abc123',
    });
    expect(r.state.change_tasks[0].task_id).toBe('feat-abc123');
    expect(r.verifyNeg?.val).toBe('draft-1');

    r = applyWorkflowOp(r.state, {
      op: 'delete-active',
      skill: 't',
      kind: 'change',
      whereTaskId: 'feat-abc123',
    });
    expect(r.state.change_tasks).toHaveLength(0);
  });

  it('缺 kind 抛错；异种列表互不干扰', () => {
    const c = emptyWorkflowState();
    expect(() =>
      applyWorkflowOp(c, { op: 'append-active', skill: 't', taskId: 'x' }),
    ).toThrow(/--kind/);

    let r = applyWorkflowOp(c, {
      op: 'append-active',
      skill: 't',
      kind: 'requirement',
      taskId: 'req-1',
      phase: 'discovery',
    });
    expect(r.state.requirement_tasks).toHaveLength(1);
    expect(r.state.change_tasks).toHaveLength(0);

    r = applyWorkflowOp(r.state, {
      op: 'append-active',
      skill: 't',
      kind: 'testcase',
      taskId: 'tc-1',
      phase: 'draft',
    });
    expect(r.state.testcase_tasks[0].task_id).toBe('tc-1');
    expect(r.state.requirement_tasks).toHaveLength(1);
  });
});

describe('runWorkflowEntry', () => {
  it('append-active 写盘并可读回', async () => {
    const repo = await tmpRepo();
    const result = await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'change',
      repoRoot: repo,
      taskId: 'draft-xyz',
      phase: 'clarify',
      worktreePath: '',
      startedAt: '2026-07-21T00:00:00Z',
    });
    expect(result.exitCode).toBe(0);
    const state = await loadWorkflowState(repo);
    expect(state.change_tasks).toEqual([
      makeTaskEntry({
        task_id: 'draft-xyz',
        phase: 'clarify',
        worktree_path: '',
        started_at: '2026-07-21T00:00:00Z',
      }),
    ]);
  });

  it('缺 skill → exit 3；缺 kind → exit 3', async () => {
    const repo = await tmpRepo();
    const noSkill = await runWorkflowEntry({
      op: 'append-active',
      skill: '',
      kind: 'change',
      repoRoot: repo,
      taskId: 'x',
    });
    expect(noSkill.exitCode).toBe(3);

    const noKind = await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      repoRoot: repo,
      taskId: 'x',
    });
    expect(noKind.exitCode).toBe(3);
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
        kind: 'change',
        repoRoot: repo,
        taskId: 'a',
        lockOptions: { staleMs: 60_000, spinMs: 250, pollMs: 40 },
      });
      expect(result.exitCode).toBe(1);
    } finally {
      held.release();
    }
  });

  it('get-active-changes 按 kind+phase 过滤，不串列表', async () => {
    const repo = await tmpRepo();
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'change',
      repoRoot: repo,
      taskId: 'c1',
      phase: 'clarify',
      startedAt: '2026-07-21T00:00:00Z',
    });
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'change',
      repoRoot: repo,
      taskId: 'p1',
      phase: 'propose',
      startedAt: '2026-07-21T01:00:00Z',
    });
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'requirement',
      repoRoot: repo,
      taskId: 'r1',
      phase: 'discovery',
      startedAt: '2026-07-21T02:00:00Z',
    });

    const allChange = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      kind: 'change',
      repoRoot: repo,
    });
    expect(allChange.exitCode).toBe(0);
    expect(allChange.taskIds).toEqual(['c1', 'p1']);

    const clarifyOnly = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      kind: 'change',
      repoRoot: repo,
      phase: 'clarify',
    });
    expect(clarifyOnly.exitCode).toBe(0);
    expect(clarifyOnly.taskIds).toEqual(['c1']);
    expect(clarifyOnly.tasks).toEqual([
      makeTaskEntry({
        task_id: 'c1',
        phase: 'clarify',
        worktree_path: '',
        started_at: '2026-07-21T00:00:00Z',
      }),
    ]);

    const reqs = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      kind: 'requirement',
      repoRoot: repo,
      phase: 'discovery',
    });
    expect(reqs.taskIds).toEqual(['r1']);
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
