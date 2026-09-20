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
    state.coding_tasks = [{ task_id: 'c1', phase: 'plan', worktree_path: '', started_at: '' }];
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

describe('阶段→技能的映射不由本模块自持（A 案 G5）', () => {
  /**
   * 这里**刻意不再断言映射表的内容** —— 那会把同一张表抄成第二份，正是归一要消除的东西。
   * 映射的语义表在 `test/ts/task-kind-phases.test.ts`（盯 `skillForPhase`）。
   *
   * 本 describe 只守一条：**不许再把转移表搬回本模块**。
   * 原来的 `PHASE_TO_SKILL` / `DEBUG_PHASE_TO_SKILL` 里，prototype 与 debug 两张偏移一位，
   * 会让自动衔接逐段跳阶段且不报错 —— 这类"第二份真相"一旦复活，这里先红。
   */
  it('模块不再导出任何 phase→skill 表', async () => {
    const mod = (await import('../../src/core/hooks/state-next.js')) as Record<string, unknown>;
    expect('PHASE_TO_SKILL' in mod).toBe(false);
    expect('DEBUG_PHASE_TO_SKILL' in mod).toBe(false);
    expect('resolveNextSkillName' in mod).toBe(false);
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
    state.coding_tasks = [{ task_id: 'feat-1', phase: 'plan', worktree_path: '', started_at: '' }];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.exitCode).toBe(0);
    expect(result.next).toBe('auto');
    expect(result.skill).toBe('polaris:coding:plan');
  });

  it('config auto_transition=off → manual + HINT', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.coding_tasks = [{ task_id: 'feat-1', phase: 'plan', worktree_path: '', started_at: '' }];
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

  it('入口阶段 → done（由入口命令显式进入，不走 state next）', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.coding_tasks = [
      { task_id: 'feat-1', phase: 'specify', worktree_path: '', started_at: '' },
    ];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.next).toBe('done');
  });

  it('requirement phase=refine → auto + polaris:prd:refine（族名是 prd，不是 kind）', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.requirement_tasks = [
      { task_id: 'req-1', phase: 'refine', worktree_path: '', started_at: '' },
    ];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: 'req-1', repoRoot: repo });
    expect(result.next).toBe('auto');
    expect(result.skill).toBe('polaris:prd:refine');
  });

  it('testcase 任何阶段 → done（技能目录名与阶段码未对齐，映射过去只会产出不存在的技能）', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.testcase_tasks = [{ task_id: 'tc-1', phase: 'draft', worktree_path: '', started_at: '' }];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: 'tc-1', repoRoot: repo });
    expect(result.next).toBe('done');
  });

  // ---- D13 回归：旧实现两张转移表偏移一位，会逐段跳阶段且不报错 ----
  describe('偏移一位的回归（2026-09-19 修）', () => {
    async function nextFor(kind: 'prototype' | 'debug', phase: string, channel?: string) {
      const repo = await tmpRepo();
      const state = emptyWorkflowState();
      const entry = {
        task_id: 'x-1',
        phase,
        worktree_path: '',
        started_at: '',
        ...(channel ? { channel } : {}),
      };
      if (kind === 'prototype') {
        state.prototype_tasks = [entry];
      } else {
        state.debug_tasks = [entry];
      }
      await saveWorkflowState(repo, state);
      return runStateNext({ changeName: 'x-1', repoRoot: repo });
    }

    it('prototype：游标 build → 必须跑 build（旧表返回 ship，跳过 prototype:build）', async () => {
      const result = await nextFor('prototype', 'build');
      expect(result.next).toBe('auto');
      expect(result.skill).toBe('polaris:prototype:build');
    });

    it('prototype：游标 review 也是同名（旧表是死键，返回 ship）', async () => {
      const result = await nextFor('prototype', 'review');
      expect(result.skill).toBe('polaris:prototype:review');
    });

    it('debug：游标 diagnose 是入口 → done（旧表返回 patch，跳过诊断）', async () => {
      const result = await nextFor('debug', 'diagnose', 'hotfix');
      expect(result.next).toBe('done');
    });

    it('debug：游标 patch → 必须跑 patch（旧表返回 closeout，跳过修复）', async () => {
      const result = await nextFor('debug', 'patch', 'hotfix');
      expect(result.next).toBe('auto');
      expect(result.skill).toBe('polaris:debug:patch');
    });

    it('debug：游标 closeout → 必须跑 closeout（旧表返回 done，跳过关单）', async () => {
      const result = await nextFor('debug', 'closeout', 'bugfix');
      expect(result.next).toBe('auto');
      expect(result.skill).toBe('polaris:debug:closeout');
    });

    it('channel 不影响选段（两通道装配相同，channel 只决定阶段内的加严分支）', async () => {
      for (const channel of ['bugfix', 'hotfix', undefined]) {
        expect((await nextFor('debug', 'patch', channel)).skill).toBe('polaris:debug:patch');
      }
    });
  });
});
