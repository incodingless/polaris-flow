/**
 * M3 写端点的处理器单测（`advanceTaskPhase` / `setTaskCheckbox`）。
 *
 * 这两个函数是「面板能写」的全部落点，所以测试盯的是三件事：
 *
 *   1. **写操作经原语**：目标任务的 `state.yaml` 顶层 `phase` 被真正改写
 *      （游标条目**没有** phase 字段），且写后回读一致
 *   2. **拒绝面**：未知阶段、旁路阶段、不比当前更晚的目标、未登记的阶段 —— 全部拒绝。
 *      合法值白名单在 `task-state-entry`（`checkPhaseWrite`），这层只做方向与归属判定
 *   3. **锁**：写完不残留锁文件；并发两次写入不产生损坏的 YAML
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  emptyWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
  type WorkflowState,
} from '../../src/core/config/workflow-state.js';
import { getWorkflowLockPath } from '../../src/core/hooks/workflow-lock.js';
import { getTaskStateLockPath } from '../../src/core/assets/polaris-paths.js';
import { advanceTaskPhase, cleanupTask, setTaskCheckbox } from '../../src/dashboard/api/tasks.js';

async function tmpProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'polaris-write-'));
}

async function put(root: string, rel: string, content: string): Promise<string> {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf-8');
  return abs;
}

const TASKS_MD = '# 任务\n\n- [ ] 甲\n- [ ] 乙\n';

/** 读任务 state.yaml 的顶层 phase（阶段唯一存放处） */
async function statePhaseOf(root: string, taskId = 'c-1'): Promise<string> {
  const raw = await readFile(path.join(root, '.polaris', 'tasks', taskId, 'state.yaml'), 'utf-8');
  const hit = raw.match(/^phase:\s*(.+)$/m);
  return hit ? hit[1]!.trim() : '';
}

/** 造：coding 任务（阶段只写在 state.yaml）+ openspec 计划文件 */
async function makeCodingTask(root: string, phase = 'specify'): Promise<void> {
  const state = emptyWorkflowState() as WorkflowState;
  state.coding_tasks = [
    { task_id: 'c-1', worktree_path: '', started_at: '2026-09-01T00:00:00.000Z' },
  ];
  await saveWorkflowState(root, state);
  await put(
    root,
    '.polaris/tasks/c-1/state.yaml',
    [
      'kind: coding',
      'task_id: c-1',
      `phase: ${phase}`,
      'runtime:',
      '  build:',
      '    total_tasks: 2',
      '    completed_tasks: 0',
      '',
    ].join('\n'),
  );
  await put(root, 'openspec/changes/c-1/tasks.md', TASKS_MD);
}

describe('advanceTaskPhase', () => {
  let root: string;

  beforeEach(async () => {
    root = await tmpProject();
    await makeCodingTask(root);
  });

  it('推进成功后 state.yaml 的 phase 被改写（specify → plan），并返回 from/to', async () => {
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding');

    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.from).toBe('specify');
    expect(res.to).toBe('plan');
    expect(res.phase_index).toBe(1);

    expect(await statePhaseOf(root)).toBe('plan');
    // 游标条目按定义不带 phase：写入后也不许凭空多出来
    const cursor = (await loadWorkflowState(root)).coding_tasks[0]!;
    expect('phase' in cursor).toBe(false);
  });

  it('只写 state.yaml，不动其它游标字段（task_id / worktree_path 原样）', async () => {
    await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding');
    const cursor = (await loadWorkflowState(root)).coding_tasks[0]!;
    expect(cursor.task_id).toBe('c-1');
    expect(cursor.started_at).toBe('2026-09-01T00:00:00.000Z');
  });

  it('目标等于当前 → 拒绝（只支持推进）', async () => {
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'specify' }), 'coding');
    expect('error' in res && res.error).toMatch(/只支持推进/);
    expect(await statePhaseOf(root)).toBe('specify');
  });

  it('目标早于当前 → 拒绝（回退留痕属后续切片）', async () => {
    await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'tasks' }), 'coding');
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding');
    expect('error' in res && res.error).toMatch(/只支持推进/);
    expect(await statePhaseOf(root)).toBe('tasks');
  });

  it('未知阶段名 → 拒绝且列出合法值', async () => {
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'bogus' }), 'coding');
    expect('error' in res && res.error).toMatch(/未知阶段/);
    expect('error' in res && res.error).toMatch(/plan/);
    expect(await statePhaseOf(root)).toBe('specify');
  });

  it('旁路阶段（retro）不在主序列 → 拒绝', async () => {
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'retro' }), 'coding');
    expect('error' in res && res.error).toMatch(/旁路阶段/);
  });

  it('当前阶段未登记（state.yaml 是脏数据）→ 拒绝而不是猜方向', async () => {
    await makeCodingTask(root, 'nonsense');
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding');
    expect('error' in res && res.error).toMatch(/未登记/);
  });

  it('state.yaml 缺失 → 拒绝（阶段只有这一个来源，读不到就没有答案）', async () => {
    const r = await tmpProject();
    const state = emptyWorkflowState() as WorkflowState;
    state.coding_tasks = [{ task_id: 'c-9', worktree_path: '', started_at: '' }];
    await saveWorkflowState(r, state);

    const res = await advanceTaskPhase(r, 'c-9', JSON.stringify({ to: 'plan' }), 'coding');
    expect('error' in res && res.error).toMatch(/未登记/);
  });

  it('缺 to / 坏 JSON / 任务不存在 → 各自报错', async () => {
    expect('error' in (await advanceTaskPhase(root, 'c-1', '{}', 'coding'))).toBe(true);
    expect('error' in (await advanceTaskPhase(root, 'c-1', '{oops', 'coding'))).toBe(true);
    const missing = await advanceTaskPhase(root, 'nope', JSON.stringify({ to: 'plan' }), 'coding');
    expect('error' in missing && missing.error).toMatch(/not found/);
  });

  it('写完不残留锁文件', async () => {
    await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding');
    expect(existsSync(getWorkflowLockPath(root))).toBe(false);
    expect(existsSync(getTaskStateLockPath(root, 'c-1'))).toBe(false);
  });

  it('并发两次推进：串行执行，最终阶段是其中一个目标且 YAML 未损坏', async () => {
    const [a, b] = await Promise.all([
      advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding'),
      advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'tasks' }), 'coding'),
    ]);

    // 两个都不能崩；至少一个成功（另一个可能因「不比当前更晚」被拒）
    expect([a, b].filter((r) => !('error' in r)).length).toBeGreaterThanOrEqual(1);
    expect(['plan', 'tasks']).toContain(await statePhaseOf(root));
    expect((await loadWorkflowState(root)).coding_tasks).toHaveLength(1);
  });
});

describe('setTaskCheckbox', () => {
  let root: string;

  beforeEach(async () => {
    root = await tmpProject();
    await makeCodingTask(root);
  });

  it('勾选后文件改动 + state 计数同步，并返回新进度', async () => {
    const res = await setTaskCheckbox(
      root,
      'c-1',
      JSON.stringify({ index: 1, checked: true }),
      'coding',
    );

    expect('error' in res).toBe(false);
    if ('error' in res) return;
    // 文件路径由产物表推导，前端不传
    expect(res.file).toBe('openspec/changes/c-1/tasks.md');
    expect(res.ordinal).toBe(1);
    expect(res.line).toBe(4);
    expect(res.tasks_done).toBe(1);
    expect(res.tasks_total).toBe(2);
    expect(res.state_synced).toBe(true);

    const md = await readFile(path.join(root, 'openspec/changes/c-1/tasks.md'), 'utf-8');
    expect(md).toBe('# 任务\n\n- [ ] 甲\n- [x] 乙\n');
    const stateFile = await readFile(path.join(root, '.polaris/tasks/c-1/state.yaml'), 'utf-8');
    expect(stateFile).toContain('total_tasks: 2');
    expect(stateFile).toContain('completed_tasks: 1');
  });

  it('幂等：重复勾选 changed=false（仍有正确的进度）', async () => {
    await setTaskCheckbox(root, 'c-1', JSON.stringify({ index: 0, checked: true }), 'coding');
    const res = await setTaskCheckbox(
      root,
      'c-1',
      JSON.stringify({ index: 0, checked: true }),
      'coding',
    );
    if ('error' in res) throw new Error(res.error);
    expect(res.changed).toBe(false);
    expect(res.tasks_done).toBe(1);
  });

  it('序号越界 → 报错且文件不变', async () => {
    const before = await readFile(path.join(root, 'openspec/changes/c-1/tasks.md'), 'utf-8');
    const res = await setTaskCheckbox(
      root,
      'c-1',
      JSON.stringify({ index: 99, checked: true }),
      'coding',
    );
    expect('error' in res && res.error).toMatch(/越界/);
    expect(await readFile(path.join(root, 'openspec/changes/c-1/tasks.md'), 'utf-8')).toBe(before);
  });

  it('缺 checked / index 非法 → 参数错误', async () => {
    expect('error' in (await setTaskCheckbox(root, 'c-1', '{"index":0}', 'coding'))).toBe(true);
    expect(
      'error' in (await setTaskCheckbox(root, 'c-1', '{"index":-1,"checked":true}', 'coding')),
    ).toBe(true);
  });

  it('计划文件尚未生成 → 报错而不是新建', async () => {
    const r = await tmpProject();
    await makeCodingTask(r);
    await import('node:fs/promises').then((fs) =>
      fs.rm(path.join(r, 'openspec/changes/c-1/tasks.md')),
    );

    const res = await setTaskCheckbox(
      r,
      'c-1',
      JSON.stringify({ index: 0, checked: true }),
      'coding',
    );
    expect('error' in res && res.error).toMatch(/尚未生成/);
  });

  it('该 kind 无复选框产物（requirement）→ 报错而不是猜文件', async () => {
    const r = await tmpProject();
    const state = emptyWorkflowState() as WorkflowState;
    state.requirement_tasks = [{ task_id: 'r-1', worktree_path: '', started_at: '' }];
    await saveWorkflowState(r, state);

    const res = await setTaskCheckbox(
      r,
      'r-1',
      JSON.stringify({ index: 0, checked: true }),
      'requirement',
    );
    expect('error' in res && res.error).toMatch(/无复选框产物/);
  });

  it('写完不残留 task-state 锁文件', async () => {
    await setTaskCheckbox(root, 'c-1', JSON.stringify({ index: 0, checked: true }), 'coding');
    const locks = path.join(root, '.polaris', '.locks');
    const files = existsSync(locks)
      ? await import('node:fs/promises').then((fs) => fs.readdir(locks))
      : [];
    expect(files.filter((f) => f.includes('task-state'))).toEqual([]);
  });
});

describe('cleanupTask', () => {
  let root: string;

  beforeEach(async () => {
    root = await tmpProject();
    await makeCodingTask(root);
  });

  it('两个标记都不给 → 拒绝（不可逆操作不许「默认执行」）', async () => {
    const res = await cleanupTask(root, 'c-1', '{}', 'coding');
    expect('error' in res && res.error).toMatch(/dry_run|confirm/);
    expect((await loadWorkflowState(root)).coding_tasks).toHaveLength(1);
  });

  it('dry_run：给出将删除的绝对路径与将移除的条目，且不改盘', async () => {
    const res = await cleanupTask(root, 'c-1', JSON.stringify({ dry_run: true }), 'coding');

    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.dry_run).toBe(true);
    expect(res.will_delete).toHaveLength(1);
    expect(res.will_delete[0]).toBe(path.join(root, '.polaris', 'tasks', 'c-1'));
    expect(res.entry?.kind).toBe('coding');

    // 预演必须零副作用
    expect(existsSync(path.join(root, '.polaris/tasks/c-1/state.yaml'))).toBe(true);
    expect((await loadWorkflowState(root)).coding_tasks).toHaveLength(1);
  });

  it('confirm：移除游标条目 + 删除档案目录，并回报删了什么', async () => {
    const res = await cleanupTask(root, 'c-1', JSON.stringify({ confirm: true }), 'coding');

    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.dry_run).toBe(false);
    // 执行后也要回报清单 —— 面板据此告诉用户删了什么，不能只给一个「成功」
    expect(res.will_delete).toHaveLength(1);
    expect(res.entry?.kind).toBe('coding');
    expect((await loadWorkflowState(root)).coding_tasks).toHaveLength(0);
    expect(existsSync(path.join(root, '.polaris/tasks/c-1'))).toBe(false);
  });

  it('kind 从游标读出后显式传给原语：debug 任务不传 kind 也能清理', async () => {
    const r = await tmpProject();
    const state = emptyWorkflowState() as WorkflowState;
    state.debug_tasks = [
      { task_id: 'd-1', worktree_path: '', started_at: '', channel: 'bugfix' },
    ];
    await saveWorkflowState(r, state);
    await put(r, '.polaris/tasks/d-1/state.yaml', 'kind: debug\ntask_id: d-1\n');

    const res = await cleanupTask(r, 'd-1', JSON.stringify({ confirm: true }), undefined);
    if ('error' in res) throw new Error(res.error);
    expect(res.kind).toBe('debug');
    expect((await loadWorkflowState(r)).debug_tasks).toHaveLength(0);
    expect(existsSync(path.join(r, '.polaris/tasks/d-1'))).toBe(false);
  });

  it('任务不存在 / 已归档来源 → 拒绝', async () => {
    const missing = await cleanupTask(root, 'nope', JSON.stringify({ confirm: true }), 'coding');
    expect('error' in missing && missing.error).toMatch(/not found/);
  });

  it('kind 提示与实际不符时以游标为准（不会因此漏删或误删）', async () => {
    // findCursor 的 hint 是**软偏好**：命中不到会回落到任意 kind，之后 kind 一律取自游标。
    // 所以「传错 kind」在这里的后果是零 —— 真正会因此出错的是旧版 ship-cleanup 那种
    // 「外部传 kind 且写死」。这条测试钉住「以游标为准」这个前提。
    const res = await cleanupTask(root, 'c-1', JSON.stringify({ confirm: true }), 'requirement');
    if ('error' in res) throw new Error(res.error);

    expect(res.kind).toBe('coding');
    expect((await loadWorkflowState(root)).coding_tasks).toHaveLength(0);
    expect(existsSync(path.join(root, '.polaris/tasks/c-1'))).toBe(false);
  });

  it('同一 id 落在两个 kind 列表里 → 因残留而中止，且档案不删', async () => {
    // 异常数据。delete-active 只清指定 kind，另一个 kind 仍残留 ——
    // 后回读必须拦住「条目还在、档案已删」这种状态。这是那类事故的回归测试。
    const state = await loadWorkflowState(root);
    state.debug_tasks = [
      { task_id: 'c-1', worktree_path: '', started_at: '', channel: '' },
    ];
    await saveWorkflowState(root, state);

    const res = await cleanupTask(root, 'c-1', JSON.stringify({ confirm: true }), 'coding');
    expect('error' in res && res.error).toMatch(/残留/);
    // 游标还有引用 → 档案必须完好
    expect(existsSync(path.join(root, '.polaris/tasks/c-1/state.yaml'))).toBe(true);
  });
});
