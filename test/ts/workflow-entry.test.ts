/**
 * workflow-entry / workflow-lock / workflow-state 单元测试。
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  emptyWorkflowState,
  loadWorkflowState,
  parseWorkflowTaskKind,
} from '../../src/core/config/workflow-state.js';
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
      phase: 'specify',
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
      setPhase: 'plan',
    });
    expect(r.state.change_tasks[0].phase).toBe('plan');

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

  it('prototype 写入 prototype_tasks，不串 requirement/change', () => {
    const c = emptyWorkflowState();
    let r = applyWorkflowOp(c, {
      op: 'append-active',
      skill: 'blueprint',
      kind: 'prototype',
      taskId: 'proto-1',
      phase: 'blueprint',
      startedAt: '2026-09-15T00:00:00Z',
    });
    expect(r.state.prototype_tasks).toHaveLength(1);
    expect(r.state.prototype_tasks[0].task_id).toBe('proto-1');
    expect(r.state.prototype_tasks[0].phase).toBe('blueprint');
    expect(r.state.requirement_tasks).toHaveLength(0);
    expect(r.state.change_tasks).toHaveLength(0);

    r = applyWorkflowOp(r.state, {
      op: 'update-active',
      skill: 'blueprint',
      kind: 'prototype',
      whereTaskId: 'proto-1',
      setPhase: 'build',
    });
    expect(r.state.prototype_tasks[0].phase).toBe('build');

    r = applyWorkflowOp(r.state, {
      op: 'delete-active',
      skill: 'blueprint',
      kind: 'prototype',
      whereTaskId: 'proto-1',
    });
    expect(r.state.prototype_tasks).toHaveLength(0);
  });
});

describe('parseWorkflowTaskKind', () => {
  it('接受 change|requirement|testcase|prototype；拒绝其它值', () => {
    expect(parseWorkflowTaskKind('change')).toBe('change');
    expect(parseWorkflowTaskKind('requirement')).toBe('requirement');
    expect(parseWorkflowTaskKind('testcase')).toBe('testcase');
    expect(parseWorkflowTaskKind('prototype')).toBe('prototype');
    expect(parseWorkflowTaskKind('unknown')).toBeNull();
    expect(parseWorkflowTaskKind(undefined)).toBeNull();
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
      phase: 'specify',
      worktreePath: '',
      startedAt: '2026-07-21T00:00:00Z',
    });
    expect(result.exitCode).toBe(0);
    const state = await loadWorkflowState(repo);
    expect(state.change_tasks).toEqual([
      makeTaskEntry({
        task_id: 'draft-xyz',
        phase: 'specify',
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
      phase: 'specify',
      startedAt: '2026-07-21T00:00:00Z',
    });
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'change',
      repoRoot: repo,
      taskId: 'p1',
      phase: 'plan',
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

    const specifyOnly = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      kind: 'change',
      repoRoot: repo,
      phase: 'specify',
    });
    expect(specifyOnly.exitCode).toBe(0);
    expect(specifyOnly.taskIds).toEqual(['c1']);
    expect(specifyOnly.tasks).toEqual([
      makeTaskEntry({
        task_id: 'c1',
        phase: 'specify',
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

  it('get-active-changes --kind prototype 按 phase 过滤（对齐 blueprint/build/ship）', async () => {
    const repo = await tmpRepo();
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'blueprint',
      kind: 'prototype',
      repoRoot: repo,
      taskId: 'p-blueprint',
      phase: 'blueprint',
      startedAt: '2026-09-15T00:00:00Z',
    });
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'build',
      kind: 'prototype',
      repoRoot: repo,
      taskId: 'p-build',
      phase: 'build',
      startedAt: '2026-09-15T01:00:00Z',
    });
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'discovery',
      kind: 'requirement',
      repoRoot: repo,
      taskId: 'r-should-not-leak',
      phase: 'discovery',
      startedAt: '2026-09-15T02:00:00Z',
    });

    const allProto = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'blueprint',
      kind: 'prototype',
      repoRoot: repo,
    });
    expect(allProto.exitCode).toBe(0);
    expect(allProto.taskIds).toEqual(['p-blueprint', 'p-build']);

    const blueprintOnly = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'blueprint',
      kind: 'prototype',
      repoRoot: repo,
      phase: 'blueprint',
    });
    expect(blueprintOnly.taskIds).toEqual(['p-blueprint']);

    const buildOnly = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'build',
      kind: 'prototype',
      repoRoot: repo,
      phase: 'build',
    });
    expect(buildOnly.taskIds).toEqual(['p-build']);
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
