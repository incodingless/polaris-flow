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

/**
 * 追加一条游标，并写入该任务的 state.yaml（阶段现在**只**存在 state.yaml 里）。
 *
 * @param mtimeMs 任务目录内文件的 mtime；默认 0（全等 → 列表顺序回落游标顺序）
 */
async function appendTask(
  repo: string,
  kind: WorkflowTaskKind,
  taskId: string,
  phase: string,
  mtimeMs = 0,
): Promise<void> {
  const result = await runWorkflowEntry({
    op: 'append-active',
    skill: 'test',
    kind,
    repoRoot: repo,
    taskId,
    startedAt: '2026-07-21T00:00:00Z',
  });
  expect(result.exitCode).toBe(0);
  await seedTaskFiles(repo, kind, taskId, { 'state.yaml': `phase: ${phase}\n` }, mtimeMs);
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
      worktreePath: '',
      startedAt: '2026-01-01T00:00:00Z',
    });
    expect(r.state.coding_tasks).toHaveLength(1);
    expect(r.state.coding_tasks[0].worktree_path).toBe('');
    expect(r.state.requirement_tasks).toHaveLength(0);
    expect(r.verify.kind).toBe('has_tid');

    r = applyWorkflowOp(r.state, {
      op: 'update-active',
      skill: 't',
      kind: 'coding',
      whereTaskId: 'draft-1',
      setWorktreePath: '/tmp/wt/draft-1',
    });
    expect(r.state.coding_tasks[0].worktree_path).toBe('/tmp/wt/draft-1');
    expect(r.verify.kind).toBe('entry_worktree');

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

  it('条目不含 phase 字段（阶段只在 state.yaml 里）', () => {
    const r = applyWorkflowOp(emptyWorkflowState(), {
      op: 'append-active',
      skill: 't',
      kind: 'coding',
      taskId: 'draft-1',
      worktreePath: '',
      startedAt: '2026-01-01T00:00:00Z',
    });
    expect(Object.keys(r.state.coding_tasks[0]).sort()).toEqual([
      'channel',
      'started_at',
      'task_id',
      'worktree_path',
    ]);
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
    });
    expect(r.state.requirement_tasks).toHaveLength(1);
    expect(r.state.coding_tasks).toHaveLength(0);

    r = applyWorkflowOp(r.state, {
      op: 'append-active',
      skill: 't',
      kind: 'testcase',
      taskId: 'tc-1',
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
      startedAt: '2026-09-15T00:00:00Z',
    });
    expect(r.state.prototype_tasks).toHaveLength(1);
    expect(r.state.prototype_tasks[0].task_id).toBe('proto-1');
    expect(r.state.requirement_tasks).toHaveLength(0);
    expect(r.state.coding_tasks).toHaveLength(0);

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
  it('append-active 写盘并可读回（条目无 phase）', async () => {
    const repo = await tmpRepo();
    const result = await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      taskId: 'draft-xyz',
      worktreePath: '',
      startedAt: '2026-07-21T00:00:00Z',
    });
    expect(result.exitCode).toBe(0);
    const state = await loadWorkflowState(repo);
    expect(state.coding_tasks).toEqual([
      makeTaskEntry({
        task_id: 'draft-xyz',
        worktree_path: '',
        started_at: '2026-07-21T00:00:00Z',
      }),
    ]);
    // 历史遗留的 phase 键即使写进文件，也不会被读出来（normalize 忽略）
    expect('phase' in state.coding_tasks[0]).toBe(false);
  });

  it('append-active 幂等：重复注册同一 task_id 不产生重复条目，也不改动已有条目', async () => {
    const repo = await tmpRepo();
    const first = await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      taskId: 'draft-idem',
      worktreePath: '/tmp/wt/idem',
      startedAt: '2026-07-21T00:00:00Z',
    });
    expect(first.exitCode).toBe(0);

    // 第二次带上不同的 worktree_path / started_at —— 只应在「不存在」时写入
    const again = await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      taskId: 'draft-idem',
      worktreePath: '/tmp/wt/other',
      startedAt: '2026-07-22T00:00:00Z',
    });
    expect(again.exitCode).toBe(0);

    const state = await loadWorkflowState(repo);
    expect(state.coding_tasks).toHaveLength(1);
    expect(state.coding_tasks[0]).toEqual(
      makeTaskEntry({
        task_id: 'draft-idem',
        worktree_path: '/tmp/wt/idem',
        started_at: '2026-07-21T00:00:00Z',
      }),
    );
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

  it('get-active-changes 按 kind+phase 过滤（phase 取自 state.yaml），不串列表', async () => {
    const repo = await tmpRepo();
    await appendTask(repo, 'coding', 'c1', 'specify');
    await appendTask(repo, 'coding', 'p1', 'plan');
    await appendTask(repo, 'requirement', 'r1', 'discovery');

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

  it('get-active-changes --format full：phase/mode 都取自 state.yaml，含**应执行技能**', async () => {
    const repo = await tmpRepo();
    await appendTask(repo, 'coding', 'c-full', 'plan');
    await appendTask(repo, 'coding', 'c-tweak', 'plan');
    await appendTask(repo, 'coding', 'c-ship', 'ship');

    // phase 与 mode 同出一个文件：state.yaml
    await seedTaskFiles(
      repo,
      'coding',
      'c-full',
      { 'state.yaml': 'phase: plan\nworkflow:\n  mode: strict\n' },
      Date.now(),
    );
    await seedTaskFiles(
      repo,
      'coding',
      'c-tweak',
      { 'state.yaml': 'phase: plan\nworkflow:\n  mode: tweak\n' },
      Date.now(),
    );
    await seedTaskFiles(
      repo,
      'coding',
      'c-ship',
      { 'state.yaml': 'phase: ship\nworkflow:\n  mode: tweak\n' },
      Date.now(),
    );

    const result = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      format: 'full',
    });

    expect(result.exitCode).toBe(0);
    const rows = result.rows ?? [];
    const byId = (id: string) => rows.find((r) => r.task_id === id);

    expect(byId('c-full')?.phase).toBe('plan');
    expect(byId('c-full')?.mode).toBe('strict');
    expect(byId('c-full')?.skill).toBe('plan');
    expect(byId('c-full')?.state_readable).toBe(true);
    // 单技能通道：阶段 plan 归通道技能本人，不得交给 plan 技能
    expect(byId('c-tweak')?.mode).toBe('tweak');
    expect(byId('c-tweak')?.skill).toBe('tweak');
    // phase=ship 归 ship（mode 不限）
    expect(byId('c-ship')?.skill).toBe('ship');

    // 中文显示名从阶段表 / 通道表派生（技能不持有映射表）
    expect(byId('c-full')?.phase_label).toBe('提案');
    expect(byId('c-full')?.mode_label).toBe('严格');
    expect(byId('c-full')?.skill_label).toBe('提案');
    // 通道技能的中文名来自通道表，不是阶段表
    expect(byId('c-tweak')?.mode_label).toBe('简单');
    expect(byId('c-tweak')?.skill_label).toBe('简单');
    expect(byId('c-ship')?.phase_label).toBe('交付');
    expect(byId('c-ship')?.skill_label).toBe('交付');
  });

  it('--format full：读不到 state.yaml 的行 label 全为空串（不猜）', async () => {
    const repo = await tmpRepo();
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      taskId: 'c-nostate',
      startedAt: '2026-07-21T00:00:00Z',
    });

    const result = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      format: 'full',
    });
    const row = (result.rows ?? [])[0];
    expect(row?.state_readable).toBe(false);
    expect(row?.phase).toBe('');
    expect(row?.phase_label).toBe('');
    expect(row?.mode_label).toBe('');
    expect(row?.skill).toBeNull();
    expect(row?.skill_label).toBe('');
  });

  it('--format full：worktree 任务从 worktree 内读 state.yaml（主仓副本已改名）', async () => {
    const repo = await tmpRepo();
    const wtRepo = await tmpRepo();
    await appendTask(repo, 'coding', 'c-wt', 'specify');
    // 模拟 worktree-create：把任务目录搬进 worktree，主仓目录改名为 <id>.snapshot
    await runWorkflowEntry({
      op: 'update-active',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      whereTaskId: 'c-wt',
      setWorktreePath: wtRepo,
    });
    await seedTaskFiles(
      wtRepo,
      'coding',
      'c-wt',
      { 'state.yaml': 'phase: plan\nworkflow:\n  mode: normal\n' },
      Date.now(),
    );

    const result = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      format: 'full',
    });

    const row = (result.rows ?? [])[0];
    expect(row.worktree_path).toBe(wtRepo);
    expect(row.state_path).toBe(path.join(wtRepo, '.polaris', 'tasks', 'c-wt', 'state.yaml'));
    expect(row.phase).toBe('plan');
    expect(row.state_readable).toBe(true);
    // 关键：游标在 specify，但真实阶段在 state.yaml（plan）→ 应派给 normal 通道
    expect(row.skill).toBe('normal');
  });

  it('--format full：state.yaml 读不到 → state_readable=false、skill=null（由调用方阻断）', async () => {
    const repo = await tmpRepo();
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      taskId: 'c-ghost',
      startedAt: '2026-07-21T00:00:00Z',
    });

    const result = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      format: 'full',
    });

    const row = (result.rows ?? [])[0];
    expect(row.phase).toBe('');
    expect(row.skill).toBeNull();
    expect(row.state_readable).toBe(false);
  });

  it('get-active-changes 默认格式仍为 task_id 数组（不读 state.yaml、不含 rows）', async () => {
    const repo = await tmpRepo();
    await appendTask(repo, 'coding', 'c1', 'build');

    const result = await runWorkflowEntry({
      op: 'get-active-changes',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
    });

    expect(result.exitCode).toBe(0);
    expect(result.taskIds).toEqual(['c1']);
    expect(result.rows).toBeUndefined();
  });

  it('get-active-changes 无需 --skill（只读，不持锁），写 op 仍必填', async () => {
    const repo = await tmpRepo();
    await appendTask(repo, 'coding', 'c1', 'plan');

    const readOnly = await runWorkflowEntry({
      op: 'get-active-changes',
      kind: 'coding',
      repoRoot: repo,
    });
    expect(readOnly.exitCode).toBe(0);

    const writeOp = await runWorkflowEntry({
      op: 'update-active',
      kind: 'coding',
      repoRoot: repo,
      whereTaskId: 'c1',
      setWorktreePath: '/tmp/wt',
    });
    expect(writeOp.exitCode).toBe(3);
  });

  it('get-active-changes --kind prototype 按 state.yaml 的 phase 过滤', async () => {
    const repo = await tmpRepo();
    await appendTask(repo, 'prototype', 'p-blueprint', 'blueprint');
    await appendTask(repo, 'prototype', 'p-build', 'build');
    await appendTask(repo, 'requirement', 'r-should-not-leak', 'discovery');

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
