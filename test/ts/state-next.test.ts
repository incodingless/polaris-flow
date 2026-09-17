/**
 * state-next 核心逻辑单元测试（phase→skill 映射、auto_transition 判定、runStateNext 集成）。
 */
import { mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildSkillName,
  findEntryByTaskId,
  formatStateNextOutput,
  isAutoTransitionEnabled,
  resolveNextSkillName,
  runStateNext,
} from '../../src/core/hooks/state-next.js';
import { emptyWorkflowState, saveWorkflowState } from '../../src/core/config/workflow-state.js';

async function tmpRepo(): Promise<string> {
  const dir = await import('fs/promises').then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), 'polaris-state-next-')),
  );
  await mkdir(path.join(dir, '.polaris'), { recursive: true });
  return dir;
}

describe('findEntryByTaskId', () => {
  it('跨四个列表命中，返回对应 kind', () => {
    const state = emptyWorkflowState();
    state.coding_tasks = [
      { task_id: 'c1', phase: 'plan', worktree_path: '', started_at: '' },
    ];
    state.requirement_tasks = [
      { task_id: 'r1', phase: 'draft', worktree_path: '', started_at: '' },
    ];
    state.prototype_tasks = [
      { task_id: 'p1', phase: 'blueprint', worktree_path: '', started_at: '' },
    ];

    expect(findEntryByTaskId(state, 'c1')).toEqual({
      kind: 'coding',
      entry: { task_id: 'c1', phase: 'plan', worktree_path: '', started_at: '' },
    });
    expect(findEntryByTaskId(state, 'r1')?.kind).toBe('requirement');
    expect(findEntryByTaskId(state, 'p1')?.kind).toBe('prototype');
    expect(findEntryByTaskId(state, 'missing')).toBeNull();
  });

  it('命中 debug_tasks 列表，返回 kind=debug', () => {
    const state = emptyWorkflowState();
    state.debug_tasks = [
      { task_id: 'd1', phase: 'diagnose', worktree_path: '', started_at: '', channel: 'bugfix' },
    ];
    expect(findEntryByTaskId(state, 'd1')).toEqual({
      kind: 'debug',
      entry: {
        task_id: 'd1',
        phase: 'diagnose',
        worktree_path: '',
        started_at: '',
        channel: 'bugfix',
      },
    });
  });
});

describe('resolveNextSkillName', () => {
  it('coding 各 phase 映射正确；delivery/archive 归一到 ship', () => {
    expect(resolveNextSkillName('coding', 'plan')).toBe('plan');
    expect(resolveNextSkillName('coding', 'build')).toBe('build');
    expect(resolveNextSkillName('coding', 'verify')).toBe('verify');
    expect(resolveNextSkillName('coding', 'ship')).toBe('ship');
    expect(resolveNextSkillName('coding', 'delivery')).toBe('ship');
    expect(resolveNextSkillName('coding', 'archive')).toBe('ship');
  });

  it('prd phase 映射；未知/空 phase 返回 null', () => {
    expect(resolveNextSkillName('requirement', 'draft')).toBe('draft');
    expect(resolveNextSkillName('requirement', 'refine')).toBe('refine');
    expect(resolveNextSkillName('coding', '')).toBeNull();
    expect(resolveNextSkillName('coding', 'unknown-phase')).toBeNull();
    expect(resolveNextSkillName('coding', 'specify')).toBeNull();
  });

  it('prototype phase 映射 blueprint→build→ship', () => {
    expect(resolveNextSkillName('prototype', 'blueprint')).toBe('build');
    expect(resolveNextSkillName('prototype', 'build')).toBe('ship');
    expect(resolveNextSkillName('prototype', 'review')).toBe('ship');
    expect(resolveNextSkillName('prototype', 'idle')).toBeNull();
  });

  it('debug：三段序列 diagnose→patch→closeout', () => {
    expect(resolveNextSkillName('debug', 'diagnose')).toBe('patch');
    expect(resolveNextSkillName('debug', 'patch')).toBe('closeout');
    expect(resolveNextSkillName('debug', 'closeout')).toBeNull();
  });

  it('debug：channel 不影响选段（两通道装配相同，channel 只决定阶段内的加严分支）', () => {
    for (const channel of ['bugfix', 'hotfix', 'unknown', undefined]) {
      expect(resolveNextSkillName('debug', 'diagnose', channel)).toBe('patch');
      expect(resolveNextSkillName('debug', 'patch', channel)).toBe('closeout');
    }
  });

  it('debug：已合并掉的 phase（triage / prescribe / prove）返回 null', () => {
    for (const gone of ['triage', 'prescribe', 'prove']) {
      expect(resolveNextSkillName('debug', gone, 'hotfix')).toBeNull();
      expect(resolveNextSkillName('debug', gone, 'bugfix')).toBeNull();
    }
    expect(resolveNextSkillName('debug', '')).toBeNull();
  });
});

describe('buildSkillName', () => {
  it('nested 用 `:`，flat 用 `-`', () => {
    expect(buildSkillName(':', 'coding', 'plan')).toBe('polaris:coding:plan');
    expect(buildSkillName('-', 'coding', 'plan')).toBe('polaris-coding-plan');
  });
});

describe('isAutoTransitionEnabled', () => {
  it('config off → false；task false → false；缺省 → true', () => {
    expect(isAutoTransitionEnabled({ auto_transition: 'off' } as never, null)).toBe(false);
    expect(isAutoTransitionEnabled(null, { auto_transition: false } as never)).toBe(false);
    expect(isAutoTransitionEnabled(null, null)).toBe(true);
    expect(isAutoTransitionEnabled({ auto_transition: 'auto' } as never, null)).toBe(true);
  });
});

describe('formatStateNextOutput', () => {
  it('auto / manual / done 三种输出', () => {
    expect(formatStateNextOutput({ exitCode: 0, next: 'done' })).toEqual(['NEXT: done']);
    expect(
      formatStateNextOutput({ exitCode: 0, next: 'auto', skill: 'polaris:coding:plan' }),
    ).toEqual(['NEXT: auto', 'SKILL: polaris:coding:plan']);
    expect(
      formatStateNextOutput({
        exitCode: 0,
        next: 'manual',
        skill: 'polaris:coding:plan',
        hint: '自动衔接已关闭，请手动运行 /polaris:coding:plan',
      }),
    ).toEqual([
      'NEXT: manual',
      'SKILL: polaris:coding:plan',
      'HINT: 自动衔接已关闭，请手动运行 /polaris:coding:plan',
    ]);
  });
});

describe('runStateNext', () => {
  it('未找到 entry → done', async () => {
    const repo = await tmpRepo();
    const result = await runStateNext({ changeName: 'nope', repoRoot: repo });
    expect(result.exitCode).toBe(0);
    expect(result.next).toBe('done');
  });

  it('缺 change-name → exit 3', async () => {
    const repo = await tmpRepo();
    const result = await runStateNext({ changeName: '  ', repoRoot: repo });
    expect(result.exitCode).toBe(3);
  });

  it('phase=plan 且缺省 auto → NEXT auto + SKILL', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.coding_tasks = [
      { task_id: 'feat-1', phase: 'plan', worktree_path: '', started_at: '' },
    ];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.exitCode).toBe(0);
    expect(result.next).toBe('auto');
    expect(result.skill).toBe('polaris:coding:plan');
  });

  it('config auto_transition=off → manual + HINT', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.coding_tasks = [
      { task_id: 'feat-1', phase: 'plan', worktree_path: '', started_at: '' },
    ];
    await saveWorkflowState(repo, state);
    await writeFile(
      path.join(repo, '.polaris', 'config.yaml'),
      "auto_transition: 'off'\n",
      'utf-8',
    );

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.next).toBe('manual');
    expect(result.skill).toBe('polaris:coding:plan');
    expect(result.hint).toContain('/polaris:coding:plan');
  });

  it('未知 phase → done', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.coding_tasks = [
      { task_id: 'feat-1', phase: 'specify', worktree_path: '', started_at: '' },
    ];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.next).toBe('done');
  });

  it('debug phase=patch → NEXT auto + polaris:debug:closeout（两通道相同）', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.debug_tasks = [
      { task_id: '2026-09-16-fix-1', phase: 'patch', worktree_path: '', started_at: '', channel: 'hotfix' },
    ];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: '2026-09-16-fix-1', repoRoot: repo });
    expect(result.exitCode).toBe(0);
    expect(result.next).toBe('auto');
    expect(result.skill).toBe('polaris:debug:closeout');
  });

  it('debug phase=diagnose → NEXT auto + polaris:debug:patch（channel 不影响）', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.debug_tasks = [
      { task_id: '2026-09-16-fix-2', phase: 'diagnose', worktree_path: '', started_at: '', channel: 'bugfix' },
    ];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: '2026-09-16-fix-2', repoRoot: repo });
    expect(result.skill).toBe('polaris:debug:patch');
  });
});
