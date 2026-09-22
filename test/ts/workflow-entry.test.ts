/**
 * workflow-entry / workflow-lock / workflow-state 单元测试。
 */
import { mkdir, readFile, utimes, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  emptyWorkflowState,
  loadWorkflowState,
  parseWorkflowTaskKind,
  type WorkflowTaskKind,
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

/** 向指定 kind 列表追加一条游标 */
async function appendTask(
  repo: string,
  kind: WorkflowTaskKind,
  taskId: string,
  phase: string,
): Promise<void> {
  const result = await runWorkflowEntry({
    op: 'append-active',
    skill: 'test',
    kind,
    repoRoot: repo,
    taskId,
    phase,
    startedAt: '2026-07-21T00:00:00Z',
  });
  expect(result.exitCode).toBe(0);
}

/**
 * 在任务目录写入文件并钉死 mtime（秒级），避免依赖写盘先后的真实时钟。
 */
async function seedTaskFiles(
  repo: string,
  kind: WorkflowTaskKind,
  taskId: string,
  files: Record<string, string>,
  mtimeMs: number,
): Promise<void> {
  const segment = kind === 'testcase' ? 'testcases' : 'tasks';
  const dir = path.join(repo, '.polaris', segment, taskId);
  await mkdir(dir, { recursive: true });
  const stamp = new Date(mtimeMs);
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    await writeFile(filePath, content, 'utf-8');
    await utimes(filePath, stamp, stamp);
  }
}

describe('applyWorkflowOp', () => {
  it('append / update / rename / delete coding_tasks', () => {
    let c = emptyWorkflowState();
    let r = applyWorkflowOp(c, {
      op: 'append-active',
      skill: 't',
      kind: 'coding',
      taskId: 'draft-1',
      phase: 'specify',
      worktreePath: '',
      startedAt: '2026-01-01T00:00:00Z',
    });
    expect(r.state.coding_tasks).toHaveLength(1);
    expect(r.state.requirement_tasks).toHaveLength(0);
    expect(r.verify.kind).toBe('has_tid');

    r = applyWorkflowOp(r.state, {
      op: 'update-active',
      skill: 't',
      kind: 'coding',
      whereTaskId: 'draft-1',
      setPhase: 'plan',
    });
    expect(r.state.coding_tasks[0].phase).toBe('plan');

    r = applyWorkflowOp(r.state, {
      op: 'rename-active',
      skill: 't',
      kind: 'coding',
      from: 'draft-1',
      to: 'feat-abc123',
    });
    expect(r.state.coding_tasks[0].task_id).toBe('feat-abc123');
    expect(r.verifyNeg?.val).toBe('draft-1');

    r = applyWorkflowOp(r.state, {
      op: 'delete-active',
      skill: 't',
      kind: 'coding',
      whereTaskId: 'feat-abc123',
    });
    expect(r.state.coding_tasks).toHaveLength(0);
  });

  it('缺 kind 抛错；异种列表互不干扰', () => {
    const c = emptyWorkflowState();
    expect(() => applyWorkflowOp(c, { op: 'append-active', skill: 't', taskId: 'x' })).toThrow(
      /--kind/,
    );

    let r = applyWorkflowOp(c, {
      op: 'append-active',
      skill: 't',
      kind: 'requirement',
      taskId: 'req-1',
      phase: 'discovery',
    });
    expect(r.state.requirement_tasks).toHaveLength(1);
    expect(r.state.coding_tasks).toHaveLength(0);

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
    expect(r.state.coding_tasks).toHaveLength(0);

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
  it('接受 coding|requirement|testcase|prototype；拒绝其它值', () => {
    expect(parseWorkflowTaskKind('coding')).toBe('coding');
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
      kind: 'coding',
      repoRoot: repo,
      taskId: 'draft-xyz',
      phase: 'specify',
      worktreePath: '',
      startedAt: '2026-07-21T00:00:00Z',
    });
    expect(result.exitCode).toBe(0);
    const state = await loadWorkflowState(repo);
    expect(state.coding_tasks).toEqual([
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
      kind: 'coding',
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
        kind: 'coding',
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
      kind: 'coding',
      repoRoot: repo,
      taskId: 'c1',
      phase: 'specify',
      startedAt: '2026-07-21T00:00:00Z',
    });
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'coding',
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
      kind: 'coding',
      repoRoot: repo,
    });
    expect(allChange.exitCode).toBe(0);
    expect(allChange.taskIds).toEqual(['c1', 'p1']);

    const specifyOnly = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      kind: 'coding',
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

  it('按任务目录文件 mtime 升序，最近工作的排最后一项', async () => {
    const repo = await tmpRepo();
    const older = Date.parse('2026-09-01T00:00:00Z');
    const newer = Date.parse('2026-09-20T00:00:00Z');
    // YAML 追加序与 recency 故意相反：先登记最近工作的任务
    await appendTask(repo, 'requirement', 'workorder-dispatch', 'discovery');
    await appendTask(repo, 'requirement', 'traffic-file-restore', 'discovery');
    await seedTaskFiles(
      repo,
      'requirement',
      'workorder-dispatch',
      { 'state.yaml': 'phase: discovery\n', 'req_baseline.md': '# 近\n' },
      newer,
    );
    await seedTaskFiles(
      repo,
      'requirement',
      'traffic-file-restore',
      { 'state.yaml': 'phase: discovery\n' },
      older,
    );

    const listed = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'discovery',
      kind: 'requirement',
      repoRoot: repo,
    });
    expect(listed.exitCode).toBe(0);
    expect(listed.taskIds).toEqual(['traffic-file-restore', 'workorder-dispatch']);
  });

  it('--phase 先过滤再按 mtime 排序', async () => {
    const repo = await tmpRepo();
    const older = Date.parse('2026-09-01T00:00:00Z');
    const newer = Date.parse('2026-09-20T00:00:00Z');
    await appendTask(repo, 'requirement', 'still-discovering-recent', 'discovery');
    await appendTask(repo, 'requirement', 'already-draft', 'draft');
    await appendTask(repo, 'requirement', 'still-discovering-old', 'discovery');
    await seedTaskFiles(
      repo,
      'requirement',
      'still-discovering-recent',
      { 'state.yaml': 'phase: discovery\n' },
      newer,
    );
    await seedTaskFiles(
      repo,
      'requirement',
      'already-draft',
      { 'state.yaml': 'phase: draft\n' },
      Date.parse('2026-09-30T00:00:00Z'),
    );
    await seedTaskFiles(
      repo,
      'requirement',
      'still-discovering-old',
      { 'state.yaml': 'phase: discovery\n' },
      older,
    );

    const listed = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'discovery',
      kind: 'requirement',
      repoRoot: repo,
      phase: 'discovery',
    });
    expect(listed.taskIds).toEqual(['still-discovering-old', 'still-discovering-recent']);
  });

  it('缺 state.yaml 回落目录内其它文件；全无文件排最前', async () => {
    const repo = await tmpRepo();
    const older = Date.parse('2026-09-01T00:00:00Z');
    const newer = Date.parse('2026-09-20T00:00:00Z');
    await appendTask(repo, 'requirement', 'ghost', 'discovery');
    await appendTask(repo, 'requirement', 'docs-only', 'discovery');
    await appendTask(repo, 'requirement', 'has-state', 'discovery');
    await seedTaskFiles(
      repo,
      'requirement',
      'docs-only',
      { 'req_baseline.md': '# 仅文档\n' },
      newer,
    );
    await seedTaskFiles(
      repo,
      'requirement',
      'has-state',
      { 'state.yaml': 'phase: discovery\n' },
      older,
    );

    const listed = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'discovery',
      kind: 'requirement',
      repoRoot: repo,
    });
    expect(listed.taskIds).toEqual(['ghost', 'has-state', 'docs-only']);
  });

  it('mtime 全相等时稳定回落 workflow.yaml 顺序', async () => {
    const repo = await tmpRepo();
    const same = Date.parse('2026-09-10T00:00:00Z');
    await appendTask(repo, 'requirement', 'first', 'discovery');
    await appendTask(repo, 'requirement', 'second', 'discovery');
    await appendTask(repo, 'requirement', 'third', 'discovery');
    await seedTaskFiles(repo, 'requirement', 'first', { 'state.yaml': 'a\n' }, same);
    await seedTaskFiles(repo, 'requirement', 'second', { 'state.yaml': 'b\n' }, same);
    await seedTaskFiles(repo, 'requirement', 'third', { 'state.yaml': 'c\n' }, same);

    const listed = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'discovery',
      kind: 'requirement',
      repoRoot: repo,
    });
    expect(listed.taskIds).toEqual(['first', 'second', 'third']);
  });

  it('testcase 族读 .polaris/testcases/ 下的 mtime', async () => {
    const repo = await tmpRepo();
    const older = Date.parse('2026-09-01T00:00:00Z');
    const newer = Date.parse('2026-09-20T00:00:00Z');
    await appendTask(repo, 'testcase', 'recent-case', 'draft');
    await appendTask(repo, 'testcase', 'stale-case', 'draft');
    await seedTaskFiles(repo, 'testcase', 'recent-case', { 'testcase_plan.md': '# 近\n' }, newer);
    await seedTaskFiles(repo, 'testcase', 'stale-case', { 'state.yaml': 'phase: draft\n' }, older);
    // 若误读 .polaris/tasks/，recent-case 会变成最旧（无文件）
    await seedTaskFiles(
      repo,
      'requirement',
      'recent-case',
      { 'state.yaml': 'wrong-segment\n' },
      Date.parse('2020-01-01T00:00:00Z'),
    );

    const listed = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'case',
      kind: 'testcase',
      repoRoot: repo,
    });
    expect(listed.taskIds).toEqual(['stale-case', 'recent-case']);
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
