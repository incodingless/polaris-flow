/**
 * task-state-entry 单元测试：路径 get/set、阶段进出、身份字段、worktree。
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  applyCompletePhase,
  applyEnterPhase,
  applyIdentity,
  getByPath,
  parseSetValue,
  resolveBlockStyle,
  runTaskStateEntry,
  setByPath,
} from '../../src/core/hooks/task-state-entry.js';

async function tmpRepo(): Promise<string> {
  const dir = await import('fs/promises').then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), 'polaris-tse-')),
  );
  await mkdir(path.join(dir, '.polaris', 'tasks', 't1'), { recursive: true });
  return dir;
}

describe('path helpers', () => {
  it('getByPath / setByPath 嵌套读写', () => {
    const o: Record<string, unknown> = {};
    setByPath(o, 'draft.gate.passed', true);
    expect(getByPath(o, 'draft.gate.passed')).toBe(true);
    expect(getByPath(o, 'draft.gate.missing')).toBeUndefined();
  });

  it('parseSetValue 解析标量', () => {
    expect(parseSetValue('true')).toBe(true);
    expect(parseSetValue('false')).toBe(false);
    expect(parseSetValue('42')).toBe(42);
    expect(parseSetValue('hello')).toBe('hello');
    expect(parseSetValue('"x=y"')).toBe('x=y');
  });

  it('resolveBlockStyle：kind 与 runtime 启发式', () => {
    expect(resolveBlockStyle({}, 'change', 'auto')).toBe('runtime');
    expect(resolveBlockStyle({}, 'requirement', 'auto')).toBe('top-level');
    expect(resolveBlockStyle({ runtime: {} }, null, 'auto')).toBe('runtime');
    expect(resolveBlockStyle({}, null, 'auto')).toBe('top-level');
    expect(resolveBlockStyle({}, 'change', 'top-level')).toBe('top-level');
  });
});

describe('applyEnter / complete / identity', () => {
  it('change 走 runtime 块；requirement 走顶层块', () => {
    const entered = applyEnterPhase({}, 'draft', 'top-level');
    expect(entered.phase).toBe('draft');
    expect(getByPath(entered, 'draft.status')).toBe('in_progress');
    expect(getByPath(entered, 'draft.started_at')).toBeTruthy();

    const rt = applyEnterPhase({}, 'verify', 'runtime');
    expect(getByPath(rt, 'runtime.verify.status')).toBe('in_progress');

    const done = applyCompletePhase(entered, 'draft', 'top-level', 'refine');
    expect(getByPath(done, 'draft.status')).toBe('completed');
    expect(done.phase).toBe('refine');
  });

  it('set-identity 只写传入顶层键', () => {
    const s = applyIdentity({ phase: 'discovery' }, { reqNameCn: '权限', reqPrefix: 'UAP' });
    expect(s.req_name_cn).toBe('权限');
    expect(s.req_prefix).toBe('UAP');
    expect(s.phase).toBe('discovery');
    expect(() => applyIdentity({}, {})).toThrow(/至少需要一个/);
  });
});

describe('runTaskStateEntry', () => {
  it('get / set / enter-phase / complete-phase / get-identity 端到端', async () => {
    const repo = await tmpRepo();
    const statePath = path.join(repo, '.polaris', 'tasks', 't1', 'state.yaml');
    await writeFile(statePath, 'kind: requirement\nphase: idle\n', 'utf-8');

    const setR = await runTaskStateEntry({
      op: 'set',
      repoRoot: repo,
      taskId: 't1',
      kind: 'requirement',
      sets: ['draft.gate.passed=true'],
    });
    expect(setR.exitCode).toBe(0);

    const getR = await runTaskStateEntry({
      op: 'get',
      repoRoot: repo,
      taskId: 't1',
      paths: ['draft.gate.passed'],
    });
    expect(getR.exitCode).toBe(0);
    expect(getR.value).toBe(true);

    const enter = await runTaskStateEntry({
      op: 'enter-phase',
      repoRoot: repo,
      taskId: 't1',
      kind: 'requirement',
      phase: 'draft',
    });
    expect(enter.exitCode).toBe(0);

    const complete = await runTaskStateEntry({
      op: 'complete-phase',
      repoRoot: repo,
      taskId: 't1',
      kind: 'requirement',
      phase: 'draft',
      nextPhase: 'refine',
    });
    expect(complete.exitCode).toBe(0);

    const raw = await readFile(statePath, 'utf-8');
    expect(raw).toMatch(/phase:\s*refine/);
    expect(raw).toMatch(/status:\s*completed/);

    const id = await runTaskStateEntry({
      op: 'set-identity',
      repoRoot: repo,
      taskId: 't1',
      reqNameCn: '用户权限',
      reqPrefix: 'UAP',
    });
    expect(id.exitCode).toBe(0);

    const gotId = await runTaskStateEntry({
      op: 'get-identity',
      repoRoot: repo,
      taskId: 't1',
    });
    expect(gotId.exitCode).toBe(0);
    expect((gotId.value as Record<string, unknown>).req_prefix).toBe('UAP');
    expect((gotId.value as Record<string, unknown>).req_name_cn).toBe('用户权限');
  });

  it('change enter-phase 写入 runtime.<phase>', async () => {
    const repo = await tmpRepo();
    const statePath = path.join(repo, '.polaris', 'tasks', 't1', 'state.yaml');
    await writeFile(statePath, 'kind: change\nphase: tasks\nruntime: {}\n', 'utf-8');

    const r = await runTaskStateEntry({
      op: 'enter-phase',
      repoRoot: repo,
      taskId: 't1',
      kind: 'change',
      phase: 'build',
    });
    expect(r.exitCode).toBe(0);
    const raw = await readFile(statePath, 'utf-8');
    expect(raw).toMatch(/phase:\s*build/);
    expect(raw).toContain('runtime:');
    expect(raw).toMatch(/status:\s*in_progress/);
  });

  it('prototype set-identity 写 name/page_prefix', async () => {
    const repo = await tmpRepo();
    const statePath = path.join(repo, '.polaris', 'tasks', 't1', 'state.yaml');
    await writeFile(statePath, 'kind: prototype\nphase: blueprint\n', 'utf-8');

    const r = await runTaskStateEntry({
      op: 'set-identity',
      repoRoot: repo,
      taskId: 't1',
      name: '合同审查',
      pagePrefix: 'CR',
      workDir: path.join(repo, '.polaris', 'tasks', 't1'),
    });
    expect(r.exitCode).toBe(0);
    const got = await runTaskStateEntry({
      op: 'get',
      repoRoot: repo,
      taskId: 't1',
      paths: ['name', 'page_prefix'],
    });
    expect(got.value).toEqual({ name: '合同审查', page_prefix: 'CR' });
  });

  it('缺 task-id → exit 3；缺文件 get → exit 2', async () => {
    const noId = await runTaskStateEntry({ op: 'get', paths: ['phase'] });
    expect(noId.exitCode).toBe(3);

    const repo = await tmpRepo();
    const missing = await runTaskStateEntry({
      op: 'get',
      repoRoot: repo,
      taskId: 'no-such',
      paths: ['phase'],
    });
    expect(missing.exitCode).toBe(2);
  });

  it('worktree.path 存在时优先读写 worktree 内 state', async () => {
    const repo = await tmpRepo();
    const wt = path.join(repo, '.worktrees', 't1');
    await mkdir(path.join(wt, '.polaris', 'tasks', 't1'), { recursive: true });
    const mainState = path.join(repo, '.polaris', 'tasks', 't1', 'state.yaml');
    const wtState = path.join(wt, '.polaris', 'tasks', 't1', 'state.yaml');
    await writeFile(
      mainState,
      `kind: change\nphase: plan\nworktree:\n  path: ${JSON.stringify(wt)}\n`,
      'utf-8',
    );
    await writeFile(wtState, 'kind: change\nphase: plan\nruntime: {}\n', 'utf-8');

    const r = await runTaskStateEntry({
      op: 'enter-phase',
      repoRoot: repo,
      taskId: 't1',
      kind: 'change',
      phase: 'design',
    });
    expect(r.exitCode).toBe(0);
    const wtRaw = await readFile(wtState, 'utf-8');
    expect(wtRaw).toMatch(/phase:\s*design/);
    const mainRaw = await readFile(mainState, 'utf-8');
    expect(mainRaw).toMatch(/phase:\s*plan/);
  });
});
