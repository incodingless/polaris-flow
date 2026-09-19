/**
 * `ship-cleanup`（delivery-cleanup）单测。
 *
 * 这个文件的首要目的**不是**覆盖正常清理，而是钉住一个已实测复现的静默数据丢失：
 *
 *   旧实现把 `kind: 'coding'` 写死。对一个 `debug_tasks` 里的任务调
 *   `ship-cleanup dbg-9 <root>` → `delete-active` 在 `coding_tasks` 里找不到条目，
 *   过滤后列表没变，于是「该 kind 列表里没有这个 id」的校验**假通过** → 返回 0 →
 *   接着 `rm -rf .polaris/tasks/dbg-9/`。
 *   结果：**退出码 0（静默成功）、任务目录被删空、而 workflow.yaml 的游标条目还在**
 *   —— 面板上仍显示该任务，档案却已蒸发，且没有任何报错。
 *
 * 所以核心反例是「传错 kind 必须中止且不删目录」，而不是「能删掉」。
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  emptyWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
  type WorkflowState,
} from '../../src/core/config/workflow-state.js';
import { runDeliveryCleanup } from '../../src/core/hooks/delivery-cleanup.js';

const exists = async (p: string): Promise<boolean> =>
  stat(p).then(
    () => true,
    () => false,
  );

/** 造一个含指定 kind 任务的最小仓：workflow.yaml + 任务目录（含 state.yaml） */
async function makeRepo(kind: 'coding' | 'debug' | 'testcase' | 'prototype'): Promise<{
  root: string;
  taskId: string;
  taskDir: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-cleanup-'));
  const taskId = 'tk-1';
  const segment = kind === 'testcase' ? 'testcases' : 'tasks';
  const taskDir = path.join(root, '.polaris', segment, taskId);
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'state.yaml'), `kind: ${kind}\ntask_id: ${taskId}\n`, 'utf-8');
  // snapshot 目录（旧实现会一并删）
  await mkdir(path.join(root, '.polaris', segment, `${taskId}.snapshot`), { recursive: true });

  const state = emptyWorkflowState() as WorkflowState;
  const key = `${kind}_tasks` as keyof WorkflowState;
  (state[key] as unknown[]) = [
    { task_id: taskId, phase: 'build', worktree_path: '', started_at: '', channel: '' },
  ];
  await saveWorkflowState(root, state);
  return { root, taskId, taskDir };
}

describe('runDeliveryCleanup', () => {
  let repo: { root: string; taskId: string; taskDir: string };

  beforeEach(async () => {
    repo = await makeRepo('coding');
  });

  it('缺省 kind=coding 清理 coding 任务：条目消失 + 目录被删', async () => {
    const res = await runDeliveryCleanup(repo.taskId, repo.root);
    expect(res.exitCode).toBe(0);
    const state = await loadWorkflowState(repo.root);
    expect(state.coding_tasks).toHaveLength(0);
    expect(await exists(repo.taskDir)).toBe(false);
    expect(await exists(path.join(repo.root, '.polaris', 'tasks', `${repo.taskId}.snapshot`))).toBe(
      false,
    );
  });

  it('传对 kind=debug 时同样能清理', async () => {
    const dbg = await makeRepo('debug');
    const res = await runDeliveryCleanup(dbg.taskId, dbg.root, 'debug');
    expect(res.exitCode).toBe(0);
    expect((await loadWorkflowState(dbg.root)).debug_tasks).toHaveLength(0);
    expect(await exists(dbg.taskDir)).toBe(false);
  });

  it('testcase 删的是 .polaris/testcases/<id>/（旧实现只删 tasks 路径 = 漏删）', async () => {
    const tc = await makeRepo('testcase');
    expect(tc.taskDir).toContain(`${path.sep}testcases${path.sep}`);
    const res = await runDeliveryCleanup(tc.taskId, tc.root, 'testcase');
    expect(res.exitCode).toBe(0);
    expect(await exists(tc.taskDir)).toBe(false);
  });

  describe('核心反例：debug 任务传错 kind（缺省 coding）', () => {
    let dbg: { root: string; taskId: string; taskDir: string };

    beforeEach(async () => {
      dbg = await makeRepo('debug');
    });

    it('必须失败，且目录与游标条目都还在（旧实现是 exit 0 + 目录被删空）', async () => {
      const res = await runDeliveryCleanup(dbg.taskId, dbg.root);

      expect(res.exitCode).not.toBe(0);
      // 档案必须完好 —— 这是本次修复要保住的东西
      expect(await exists(path.join(dbg.taskDir, 'state.yaml'))).toBe(true);
      // 游标条目也必须在（否则面板上任务消失，但档案还在，同样是不一致）
      const state = await loadWorkflowState(dbg.root);
      expect(state.debug_tasks.map((e) => e.task_id)).toContain(dbg.taskId);
    });

    it('错误信息要指出该 id 实际属于哪个 kind（便于用户改 --kind 而非猜）', async () => {
      const res = await runDeliveryCleanup(dbg.taskId, dbg.root);
      expect(res.message).toMatch(/debug/);
      expect(res.message).toMatch(/--kind/);
    });
  });

  it('游标里根本没有该 id → 失败且不删目录', async () => {
    const res = await runDeliveryCleanup('nonexistent-id', repo.root);
    expect(res.exitCode).not.toBe(0);
    expect(await exists(path.join(repo.taskDir, 'state.yaml'))).toBe(true);
  });

  it('任何 kind 的列表都不得残留该 id（清理后全量回读）', async () => {
    // 同一个 id 同时出现在两个 kind 列表里（异常数据）→ 只删指定 kind 仍会残留，
    // 必须报出来而不是当作成功
    const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-cleanup-dup-'));
    const taskId = 'dup-1';
    await mkdir(path.join(root, '.polaris', 'tasks', taskId), { recursive: true });
    await writeFile(
      path.join(root, '.polaris', 'tasks', taskId, 'state.yaml'),
      `kind: coding\ntask_id: ${taskId}\n`,
      'utf-8',
    );
    const state = emptyWorkflowState() as WorkflowState;
    state.coding_tasks = [
      { task_id: taskId, phase: 'build', worktree_path: '', started_at: '', channel: '' },
    ];
    state.debug_tasks = [
      { task_id: taskId, phase: 'diagnose', worktree_path: '', started_at: '', channel: '' },
    ];
    await saveWorkflowState(root, state);

    const res = await runDeliveryCleanup(taskId, root, 'coding');
    expect(res.exitCode).not.toBe(0);
    // 残留条目必须报出来 —— 此时不能报成功
    expect(res.message).toMatch(/debug_tasks|残留|仍/);
    // 且不得把档案删掉（游标还有引用就不能删）
    expect(await exists(path.join(root, '.polaris', 'tasks', taskId, 'state.yaml'))).toBe(true);

    await rm(root, { recursive: true, force: true });
  });

  it('workflow.yaml 缺该 kind 数组时不崩', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-cleanup-empty-'));
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    await writeFile(path.join(root, '.polaris', 'workflow.yaml'), 'coding_tasks: []\n', 'utf-8');
    const res = await runDeliveryCleanup('x-1', root);
    expect(res.exitCode).not.toBe(0);
    await rm(root, { recursive: true, force: true });
  });

  it('缺参数 → 失败', async () => {
    expect((await runDeliveryCleanup('', repo.root)).exitCode).not.toBe(0);
    expect((await runDeliveryCleanup(repo.taskId, '')).exitCode).not.toBe(0);
  });
});

describe('planDeliveryCleanup', () => {
  it('给出将删除的路径与将移除的条目，且不执行任何删除', async () => {
    const repo = await makeRepo('coding');
    const { planDeliveryCleanup } = await import('../../src/core/hooks/delivery-cleanup.js');

    const plan = await planDeliveryCleanup(repo.taskId, repo.root, 'coding');
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.willDelete.length).toBeGreaterThan(0);
      expect(plan.willDelete.every((p) => path.isAbsolute(p))).toBe(true);
      expect(plan.entry?.kind).toBe('coding');
      expect(plan.entry?.phase).toBe('build');
    }
    // 预演不得改盘
    expect(await exists(repo.taskDir)).toBe(true);
    expect((await loadWorkflowState(repo.root)).coding_tasks).toHaveLength(1);
  });

  it('传错 kind 时预演就失败（把错误挡在执行之前）', async () => {
    const dbg = await makeRepo('debug');
    const { planDeliveryCleanup } = await import('../../src/core/hooks/delivery-cleanup.js');
    const plan = await planDeliveryCleanup(dbg.taskId, dbg.root, 'coding');
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.message).toMatch(/debug/);
  });
});
