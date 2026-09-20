/**
 * phase 写入校验单测（A 案 G3）。
 *
 * 价值在于**把漂移提前到提交前**：写错 phase 名以前什么都不报，要等几个月后面板
 * 显示「未知阶段」或自动衔接静默不匹配才被发现。这里逐条钉住：
 *
 *   1. 合法值放行（含 `idle` 与历史别名 `delivery`/`archive`）
 *   2. 非法值**拦下且不改盘**，报错信息里带合法集合（可照抄）
 *   3. `--force-phase` 显式放行，但**留痕**到 `.polaris/overrides.log`
 *   4. 校验发生在**取锁之前**（参数错了不该去抢锁）
 *   5. kind 未知时不校验（无法确定合法集合，不猜）
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import { getOverridesLogPath } from '../../src/core/assets/polaris-paths.js';
import { checkPhaseWrite } from '../../src/core/hooks/phase-validation.js';
import { runTaskStateEntry } from '../../src/core/hooks/task-state-entry.js';
import { runWorkflowEntry } from '../../src/core/hooks/workflow-entry.js';
import {
  emptyWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
} from '../../src/core/config/workflow-state.js';

async function tmpRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'polaris-phase-guard-'));
  await mkdir(path.join(dir, '.polaris'), { recursive: true });
  return dir;
}

/** 造一个 coding 任务：游标 phase=specify + state.yaml */
async function seedCoding(repo: string, taskId = 't-1'): Promise<void> {
  const state = emptyWorkflowState();
  state.coding_tasks = [
    { task_id: taskId, phase: 'specify', worktree_path: '', started_at: '2026-09-01T00:00:00Z' },
  ];
  await saveWorkflowState(repo, state);
  const statePath = path.join(repo, '.polaris', 'tasks', taskId, 'state.yaml');
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `kind: coding\ntask_id: ${taskId}\nphase: specify\n`, 'utf-8');
}

const advance = (repo: string, phase: string, extra: Record<string, unknown> = {}) =>
  runWorkflowEntry({
    op: 'update-active',
    skill: 'test',
    kind: 'coding',
    repoRoot: repo,
    whereTaskId: 't-1',
    setPhase: phase,
    ...extra,
  } as never);

describe('checkPhaseWrite', () => {
  let repo: string;
  beforeEach(async () => {
    repo = await tmpRepo();
  });

  it('合法阶段放行', async () => {
    for (const phase of [
      'specify',
      'plan',
      'design',
      'tasks',
      'build',
      'verify',
      'ship',
      'retro',
    ]) {
      const res = await checkPhaseWrite({
        repoRoot: repo,
        kind: 'coding',
        phase,
        skill: 'test',
        taskId: 't-1',
        op: 'update-active',
      });
      expect(res.ok, phase).toBe(true);
    }
  });

  it('idle 与历史别名放行（存量数据与 initPatches 都写 idle）', async () => {
    for (const phase of ['idle', 'delivery', 'archive', '']) {
      const res = await checkPhaseWrite({
        repoRoot: repo,
        kind: 'coding',
        phase,
        skill: 'test',
        taskId: 't-1',
        op: 'update-active',
      });
      expect(res.ok, JSON.stringify(phase)).toBe(true);
    }
  });

  it('非法阶段拦下，且报错里带合法集合与 --force-phase 的提示', async () => {
    const res = await checkPhaseWrite({
      repoRoot: repo,
      kind: 'debug',
      phase: 'triage',
      skill: 'test',
      taskId: 'd-1',
      op: 'update-active',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain('未知阶段「triage」');
    for (const legal of ['diagnose', 'patch', 'closeout', 'idle']) {
      expect(res.message).toContain(legal);
    }
    expect(res.message).toContain('--force-phase');
  });

  it('kind 未知时不校验（无法确定合法集合，不猜）', async () => {
    const res = await checkPhaseWrite({
      repoRoot: repo,
      kind: null,
      phase: 'whatever',
      skill: 'test',
      taskId: 'x',
      op: 'set',
    });
    expect(res.ok).toBe(true);
  });

  it('force 放行并写入 overrides.log（绕过不静默）', async () => {
    const logPath = getOverridesLogPath(repo);
    expect(existsSync(logPath)).toBe(false);

    const res = await checkPhaseWrite({
      repoRoot: repo,
      kind: 'debug',
      phase: 'triage',
      skill: 'repair-skill',
      taskId: 'd-1',
      op: 'update-active',
      force: true,
    });
    expect(res.ok).toBe(true);

    const log = await readFile(logPath, 'utf-8');
    expect(log).toContain('triage');
    expect(log).toContain('kind=debug');
    expect(log).toContain('task=d-1');
    expect(log).toContain('skill=repair-skill');
    // 留痕要能回答「当时合法的是什么」，否则事后无法判断该不该放行
    expect(log).toContain('legal=');
    expect(log).toContain('diagnose');
  });
});

describe('workflow-entry 的校验', () => {
  let repo: string;
  beforeEach(async () => {
    repo = await tmpRepo();
    await seedCoding(repo);
  });

  it('update-active 写合法阶段 → 成功落盘', async () => {
    const res = await advance(repo, 'plan');
    expect(res.exitCode).toBe(0);
    expect((await loadWorkflowState(repo)).coding_tasks[0]?.phase).toBe('plan');
  });

  it('idle 合法（coding/tasks 与 coding/verify 会写它）', async () => {
    expect((await advance(repo, 'idle')).exitCode).toBe(0);
  });

  it('update-active 写错阶段 → exit 3，且游标不被改动', async () => {
    const res = await advance(repo, 'buiild');
    expect(res.exitCode).toBe(3);
    expect(res.message).toContain('未知阶段');
    expect((await loadWorkflowState(repo)).coding_tasks[0]?.phase).toBe('specify');
  });

  it('append-active 的初始 phase 同样受校验（建任务时写错同样致命）', async () => {
    const bad = await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'prototype',
      repoRoot: repo,
      taskId: 'p-9',
      phase: 'blueprintx',
    } as never);
    expect(bad.exitCode).toBe(3);
    expect((await loadWorkflowState(repo)).prototype_tasks).toHaveLength(0);

    const ok = await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'prototype',
      repoRoot: repo,
      taskId: 'p-9',
      phase: 'blueprint',
    } as never);
    expect(ok.exitCode).toBe(0);
  });

  it('--force-phase 放行并留痕', async () => {
    const res = await advance(repo, 'legacy-phase', { forcePhase: true });
    expect(res.exitCode).toBe(0);
    expect((await loadWorkflowState(repo)).coding_tasks[0]?.phase).toBe('legacy-phase');
    expect(await readFile(getOverridesLogPath(repo), 'utf-8')).toContain('legacy-phase');
  });

  it('校验发生在取锁之前：非法阶段不会留下锁文件', async () => {
    await advance(repo, 'bogus');
    const { getWorkflowLockPath } = await import('../../src/core/hooks/workflow-lock.js');
    expect(existsSync(getWorkflowLockPath(repo))).toBe(false);
  });
});

describe('task-state-entry 的校验', () => {
  let repo: string;
  beforeEach(async () => {
    repo = await tmpRepo();
    await seedCoding(repo);
  });

  const statePathOf = () => path.join(repo, '.polaris', 'tasks', 't-1', 'state.yaml');

  it('enter-phase 写合法阶段 → 成功', async () => {
    const res = await runTaskStateEntry({
      op: 'enter-phase',
      repoRoot: repo,
      taskId: 't-1',
      kind: 'coding',
      phase: 'build',
      skill: 'test',
    });
    expect(res.exitCode).toBe(0);
    expect(await readFile(statePathOf(), 'utf-8')).toContain('build');
  });

  it('enter-phase 写错阶段 → exit 3 且 state.yaml 不变', async () => {
    const before = await readFile(statePathOf(), 'utf-8');
    const res = await runTaskStateEntry({
      op: 'enter-phase',
      repoRoot: repo,
      taskId: 't-1',
      kind: 'coding',
      phase: 'nonsense',
      skill: 'test',
    });
    expect(res.exitCode).toBe(3);
    expect(res.message).toContain('未知阶段');
    expect(await readFile(statePathOf(), 'utf-8')).toBe(before);
  });

  it('complete-phase 的 --next-phase 同样受校验（它会前移顶层 phase）', async () => {
    const bad = await runTaskStateEntry({
      op: 'complete-phase',
      repoRoot: repo,
      taskId: 't-1',
      kind: 'coding',
      phase: 'build',
      nextPhase: 'nope',
      skill: 'test',
    });
    expect(bad.exitCode).toBe(3);

    const ok = await runTaskStateEntry({
      op: 'complete-phase',
      repoRoot: repo,
      taskId: 't-1',
      kind: 'coding',
      phase: 'build',
      nextPhase: 'verify',
      skill: 'test',
    });
    expect(ok.exitCode).toBe(0);
    expect(await readFile(statePathOf(), 'utf-8')).toContain('verify');
  });

  it('debug 族可写自己的三阶段，但写 coding 的阶段会被拒（跨族借用不算数）', async () => {
    const res = await runTaskStateEntry({
      op: 'enter-phase',
      repoRoot: repo,
      taskId: 't-1',
      kind: 'debug',
      phase: 'closeout',
      skill: 'test',
    });
    expect(res.exitCode).toBe(0);

    const cross = await runTaskStateEntry({
      op: 'enter-phase',
      repoRoot: repo,
      taskId: 't-1',
      kind: 'debug',
      phase: 'verify',
      skill: 'test',
    });
    expect(cross.exitCode).toBe(3);
  });
});
