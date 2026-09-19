/**
 * M3 写端点的处理器单测（`advanceTaskPhase` / `setTaskCheckbox`）。
 *
 * 这两个函数是「面板能写」的全部落点，所以测试盯的是三件事：
 *
 *   1. **写操作经原语**：`workflow.yaml` 的游标被真正改写（不是前端自说自话），
 *      且写后回读一致
 *   2. **拒绝面**：未知阶段、旁路阶段、不比当前更晚的目标、未登记的阶段 —— 全部拒绝。
 *      原语 `update-active` 不校验 phase 取值，所以这层校验是唯一的拦网；漏了它
 *      拼错的阶段名会直接落进游标
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
import { advanceTaskPhase, setTaskCheckbox } from '../../src/dashboard/api/tasks.js';

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

/** 造：coding 任务（游标 phase=specify）+ 状态文件 + openspec 计划文件 */
async function makeCodingTask(root: string, phase = 'specify'): Promise<void> {
  const state = emptyWorkflowState() as WorkflowState;
  state.coding_tasks = [
    { task_id: 'c-1', phase, worktree_path: '', started_at: '2026-09-01T00:00:00.000Z' },
  ];
  await saveWorkflowState(root, state);
  await put(
    root,
    '.polaris/tasks/c-1/state.yaml',
    [
      'kind: coding',
      'task_id: c-1',
      'phase: specify',
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

  it('推进成功后游标被改写（specify → plan），并返回 from/to', async () => {
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding');

    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.from).toBe('specify');
    expect(res.to).toBe('plan');
    expect(res.phase_index).toBe(1);

    const state = await loadWorkflowState(root);
    expect(state.coding_tasks[0]?.phase).toBe('plan');
  });

  it('只写游标，不动 state.yaml 的 phase（那是只写不读的镜像）', async () => {
    await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding');
    const stateFile = await readFile(path.join(root, '.polaris/tasks/c-1/state.yaml'), 'utf-8');
    expect(stateFile).toContain('phase: specify');
  });

  it('目标等于当前 → 拒绝（只支持推进）', async () => {
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'specify' }), 'coding');
    expect('error' in res && res.error).toMatch(/只支持推进/);
    expect((await loadWorkflowState(root)).coding_tasks[0]?.phase).toBe('specify');
  });

  it('目标早于当前 → 拒绝（回退留痕属后续切片）', async () => {
    await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'tasks' }), 'coding');
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding');
    expect('error' in res && res.error).toMatch(/只支持推进/);
    expect((await loadWorkflowState(root)).coding_tasks[0]?.phase).toBe('tasks');
  });

  it('未知阶段名 → 拒绝且列出合法值（原语不校验，这里是唯一拦网）', async () => {
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'bogus' }), 'coding');
    expect('error' in res && res.error).toMatch(/未知阶段/);
    expect('error' in res && res.error).toMatch(/plan/);
    expect((await loadWorkflowState(root)).coding_tasks[0]?.phase).toBe('specify');
  });

  it('旁路阶段（retro）不在主序列 → 拒绝', async () => {
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'retro' }), 'coding');
    expect('error' in res && res.error).toMatch(/旁路阶段/);
  });

  it('当前阶段未登记（游标是脏数据）→ 拒绝而不是猜方向', async () => {
    await makeCodingTask(root, 'nonsense');
    const res = await advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding');
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
  });

  it('并发两次推进：串行执行，最终游标是其中一个目标且 YAML 未损坏', async () => {
    const [a, b] = await Promise.all([
      advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'plan' }), 'coding'),
      advanceTaskPhase(root, 'c-1', JSON.stringify({ to: 'tasks' }), 'coding'),
    ]);

    // 两个都不能崩；至少一个成功（另一个可能因「不比当前更晚」被拒）
    expect([a, b].filter((r) => !('error' in r)).length).toBeGreaterThanOrEqual(1);
    const state = await loadWorkflowState(root);
    expect(['plan', 'tasks']).toContain(state.coding_tasks[0]?.phase);
    expect(state.coding_tasks).toHaveLength(1);
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
    state.requirement_tasks = [
      { task_id: 'r-1', phase: 'draft', worktree_path: '', started_at: '' },
    ];
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
