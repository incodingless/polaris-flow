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
  it('跨三个列表命中，返回对应 kind', () => {
    const state = emptyWorkflowState();
    state.change_tasks = [
      { task_id: 'c1', phase: 'propose', worktree_path: '', started_at: '' },
    ];
    state.requirement_tasks = [
      { task_id: 'r1', phase: 'draft', worktree_path: '', started_at: '' },
    ];

    expect(findEntryByTaskId(state, 'c1')).toEqual({
      kind: 'change',
      entry: { task_id: 'c1', phase: 'propose', worktree_path: '', started_at: '' },
    });
    expect(findEntryByTaskId(state, 'r1')?.kind).toBe('requirement');
    expect(findEntryByTaskId(state, 'missing')).toBeNull();
  });
});

describe('resolveNextSkillName', () => {
  it('coding 各 phase 映射正确；delivery/archive 归一到 ship', () => {
    expect(resolveNextSkillName('change', 'propose')).toBe('propose');
    expect(resolveNextSkillName('change', 'build')).toBe('build');
    expect(resolveNextSkillName('change', 'verify')).toBe('verify');
    expect(resolveNextSkillName('change', 'ship')).toBe('ship');
    expect(resolveNextSkillName('change', 'delivery')).toBe('ship');
    expect(resolveNextSkillName('change', 'archive')).toBe('ship');
  });

  it('prd phase 映射；未知/空 phase 返回 null', () => {
    expect(resolveNextSkillName('requirement', 'draft')).toBe('draft');
    expect(resolveNextSkillName('requirement', 'refine')).toBe('refine');
    expect(resolveNextSkillName('change', '')).toBeNull();
    expect(resolveNextSkillName('change', 'unknown-phase')).toBeNull();
    expect(resolveNextSkillName('change', 'clarify')).toBeNull();
  });
});

describe('buildSkillName', () => {
  it('nested 用 `:`，flat 用 `-`', () => {
    expect(buildSkillName(':', 'coding', 'propose')).toBe('polaris:coding:propose');
    expect(buildSkillName('-', 'coding', 'propose')).toBe('polaris-coding-propose');
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
      formatStateNextOutput({ exitCode: 0, next: 'auto', skill: 'polaris:coding:propose' }),
    ).toEqual(['NEXT: auto', 'SKILL: polaris:coding:propose']);
    expect(
      formatStateNextOutput({
        exitCode: 0,
        next: 'manual',
        skill: 'polaris:coding:propose',
        hint: '自动衔接已关闭，请手动运行 /polaris:coding:propose',
      }),
    ).toEqual([
      'NEXT: manual',
      'SKILL: polaris:coding:propose',
      'HINT: 自动衔接已关闭，请手动运行 /polaris:coding:propose',
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

  it('phase=propose 且缺省 auto → NEXT auto + SKILL', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.change_tasks = [
      { task_id: 'feat-1', phase: 'propose', worktree_path: '', started_at: '' },
    ];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.exitCode).toBe(0);
    expect(result.next).toBe('auto');
    expect(result.skill).toBe('polaris:coding:propose');
  });

  it('config auto_transition=off → manual + HINT', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.change_tasks = [
      { task_id: 'feat-1', phase: 'propose', worktree_path: '', started_at: '' },
    ];
    await saveWorkflowState(repo, state);
    await writeFile(
      path.join(repo, '.polaris', 'config.yaml'),
      "auto_transition: 'off'\n",
      'utf-8',
    );

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.next).toBe('manual');
    expect(result.skill).toBe('polaris:coding:propose');
    expect(result.hint).toContain('/polaris:coding:propose');
  });

  it('未知 phase → done', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.change_tasks = [
      { task_id: 'feat-1', phase: 'clarify', worktree_path: '', started_at: '' },
    ];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.next).toBe('done');
  });
});
