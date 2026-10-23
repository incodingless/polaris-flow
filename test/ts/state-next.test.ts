/**
 * state-next 核心逻辑单元测试（phase→skill 映射、auto_transition 判定、runStateNext 集成）。
 *
 * 阶段**不在游标条目里**：每个用例既写游标条目（"有哪些在途任务"），也写该任务的
 * `state.yaml`（阶段唯一存放处）。`state next` 读的是后者。
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
import {
  emptyWorkflowState,
  saveWorkflowState,
  type WorkflowTaskEntry,
  type WorkflowTaskKind,
} from '../../src/core/config/workflow-state.js';

async function tmpRepo(): Promise<string> {
  const dir = await import('fs/promises').then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), 'polaris-state-next-')),
  );
  await mkdir(path.join(dir, '.polaris'), { recursive: true });
  return dir;
}

/** 任务目录所在的一级段（testcase 用 testcases） */
function segmentOf(kind: WorkflowTaskKind): string {
  return kind === 'testcase' ? 'testcases' : 'tasks';
}

/** 写入任务的 `state.yaml`（阶段只存在这里） */
async function seedState(
  repo: string,
  kind: WorkflowTaskKind,
  taskId: string,
  phase: string,
): Promise<void> {
  const dir = path.join(repo, '.polaris', segmentOf(kind), taskId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'state.yaml'), `phase: ${phase}\n`, 'utf-8');
}

/** 写一条游标条目 + 它的 state.yaml */
async function seedActive(
  repo: string,
  kind: WorkflowTaskKind,
  taskId: string,
  phase: string,
  extra: Partial<WorkflowTaskEntry> = {},
): Promise<void> {
  const state = emptyWorkflowState();
  const entry: WorkflowTaskEntry = {
    task_id: taskId,
    worktree_path: '',
    started_at: '',
    ...extra,
  };
  if (kind === 'coding') state.coding_tasks = [entry];
  else if (kind === 'requirement') state.requirement_tasks = [entry];
  else if (kind === 'testcase') state.testcase_tasks = [entry];
  else if (kind === 'prototype') state.prototype_tasks = [entry];
  else state.debug_tasks = [entry];
  await saveWorkflowState(repo, state);
  await seedState(repo, kind, taskId, phase);
}

describe('findEntryByTaskId', () => {
  it('跨四个列表命中，返回对应 kind', () => {
    const state = emptyWorkflowState();
    state.coding_tasks = [{ task_id: 'c1', worktree_path: '', started_at: '' }];
    state.requirement_tasks = [{ task_id: 'r1', worktree_path: '', started_at: '' }];
    state.prototype_tasks = [{ task_id: 'p1', worktree_path: '', started_at: '' }];

    expect(findEntryByTaskId(state, 'c1')).toEqual({
      kind: 'coding',
      entry: { task_id: 'c1', worktree_path: '', started_at: '' },
    });
    expect(findEntryByTaskId(state, 'r1')?.kind).toBe('requirement');
    expect(findEntryByTaskId(state, 'p1')?.kind).toBe('prototype');
    expect(findEntryByTaskId(state, 'missing')).toBeNull();
  });

  it('命中 debug_tasks 列表，返回 kind=debug', () => {
    const state = emptyWorkflowState();
    state.debug_tasks = [
      { task_id: 'd1', worktree_path: '', started_at: '', channel: 'bugfix' },
    ];
    expect(findEntryByTaskId(state, 'd1')).toEqual({
      kind: 'debug',
      entry: {
        task_id: 'd1',
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
  it('config off → false；task false → false；缺省 → false（出厂 manual）', () => {
    expect(isAutoTransitionEnabled({ auto_transition: 'off' } as never, null)).toBe(false);
    expect(isAutoTransitionEnabled(null, { auto_transition: false } as never)).toBe(false);
    expect(isAutoTransitionEnabled(null, null)).toBe(false);
    expect(isAutoTransitionEnabled({ auto_transition: 'auto' } as never, null)).toBe(true);
  });

  it('配置联动：auto 蕴含 context_compression ≠ off', () => {
    // 合法组合
    expect(
      isAutoTransitionEnabled(
        { auto_transition: 'auto', context_compression: 'beta' } as never,
        null,
      ),
    ).toBe(true);
    // 非法组合 → 降级 manual
    expect(
      isAutoTransitionEnabled(
        { auto_transition: 'auto', context_compression: 'off' } as never,
        null,
      ),
    ).toBe(false);
    // 任务级 auto 同样受联动约束
    expect(
      isAutoTransitionEnabled({ context_compression: 'off' } as never, {
        auto_transition: true,
      } as never),
    ).toBe(false);
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

  it('state.yaml 读不到 → done（不许猜阶段）', async () => {
    const repo = await tmpRepo();
    const state = emptyWorkflowState();
    state.coding_tasks = [{ task_id: 'feat-1', worktree_path: '', started_at: '' }];
    await saveWorkflowState(repo, state);

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.exitCode).toBe(0);
    expect(result.next).toBe('done');
    expect(result.phase).toBe('');
  });

  it('phase=plan 且缺省 → NEXT manual + HINT（出厂 manual）', async () => {
    const repo = await tmpRepo();
    await seedActive(repo, 'coding', 'feat-1', 'plan');

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.exitCode).toBe(0);
    expect(result.next).toBe('manual');
    expect(result.skill).toBe('polaris:coding:plan');
    expect(result.hint).toContain('/polaris:coding:plan');
  });

  it('config auto_transition=off → manual + HINT', async () => {
    const repo = await tmpRepo();
    await seedActive(repo, 'coding', 'feat-1', 'plan');
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

  it('config auto_transition=auto → NEXT auto + SKILL（显式开启连续执行）', async () => {
    const repo = await tmpRepo();
    await seedActive(repo, 'coding', 'feat-2', 'plan');
    await writeFile(
      path.join(repo, '.polaris', 'config.yaml'),
      "auto_transition: 'auto'\n",
      'utf-8',
    );

    const result = await runStateNext({ changeName: 'feat-2', repoRoot: repo });
    expect(result.next).toBe('auto');
    expect(result.skill).toBe('polaris:coding:plan');
  });

  it('入口阶段 → done（由入口命令显式进入，不走 state next）', async () => {
    const repo = await tmpRepo();
    await seedActive(repo, 'coding', 'feat-1', 'specify');

    const result = await runStateNext({ changeName: 'feat-1', repoRoot: repo });
    expect(result.next).toBe('done');
  });

  it('worktree 任务：state.yaml 在 worktree 内也能解析', async () => {
    const repo = await tmpRepo();
    const wt = await tmpRepo();
    await seedActive(repo, 'coding', 'feat-wt', 'tasks', { worktree_path: wt });
    await seedState(wt, 'coding', 'feat-wt', 'tasks');

    const result = await runStateNext({ changeName: 'feat-wt', repoRoot: repo });
    expect(result.next).toBe('manual');
    expect(result.skill).toBe('polaris:coding:tasks');
  });

  it('requirement phase=refine → manual + polaris:prd:refine（族名是 prd，不是 kind）', async () => {
    const repo = await tmpRepo();
    await seedActive(repo, 'requirement', 'req-1', 'refine');

    const result = await runStateNext({ changeName: 'req-1', repoRoot: repo });
    expect(result.next).toBe('manual');
    expect(result.skill).toBe('polaris:prd:refine');
  });

  it('testcase phase=draft → manual + polaris:testing:draft（族名是 testing，不是 kind）', async () => {
    const repo = await tmpRepo();
    await seedActive(repo, 'testcase', 'tc-1', 'draft');

    const result = await runStateNext({ changeName: 'tc-1', repoRoot: repo });
    expect(result.next).toBe('manual');
    expect(result.skill).toBe('polaris:testing:draft');
  });

  // ---- D13 回归：旧实现两张转移表偏移一位，会逐段跳阶段且不报错 ----
  describe('偏移一位的回归（2026-09-19 修）', () => {
    async function nextFor(kind: 'prototype' | 'debug', phase: string, channel?: string) {
      const repo = await tmpRepo();
      await seedActive(repo, kind, 'x-1', phase, channel ? { channel } : {});
      return runStateNext({ changeName: 'x-1', repoRoot: repo });
    }

    it('prototype：阶段 build → 必须跑 build（旧表返回 ship，跳过 prototype:build）', async () => {
      const result = await nextFor('prototype', 'build');
      expect(result.next).toBe('manual');
      expect(result.skill).toBe('polaris:prototype:build');
    });

    it('prototype：阶段 review 也是同名（旧表是死键，返回 ship）', async () => {
      const result = await nextFor('prototype', 'review');
      expect(result.skill).toBe('polaris:prototype:review');
    });

    it('debug：阶段 diagnose 是入口 → done（旧表返回 patch，跳过诊断）', async () => {
      const result = await nextFor('debug', 'diagnose', 'hotfix');
      expect(result.next).toBe('done');
    });

    it('debug：阶段 patch → 必须跑 patch（旧表返回 closeout，跳过修复）', async () => {
      const result = await nextFor('debug', 'patch', 'hotfix');
      expect(result.next).toBe('manual');
      expect(result.skill).toBe('polaris:debug:patch');
    });

    it('debug：阶段 closeout → 必须跑 closeout（旧表返回 done，跳过关单）', async () => {
      const result = await nextFor('debug', 'closeout', 'bugfix');
      expect(result.next).toBe('manual');
      expect(result.skill).toBe('polaris:debug:closeout');
    });

    it('channel 不影响选段（两通道装配相同，channel 只决定阶段内的加严分支）', async () => {
      for (const channel of ['bugfix', 'hotfix', undefined]) {
        expect((await nextFor('debug', 'patch', channel)).skill).toBe('polaris:debug:patch');
      }
    });
  });
});
