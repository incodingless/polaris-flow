/**
 * `GET /api/tasks/:id/plan-lint` 的处理器单测（`lintTaskPlan`）。
 *
 * 这是 M3 里唯一的**只读**新链路，先做它是为了在真写操作之前跑通
 * 「端点 → 原语 → 回显」这条链。测试要点三条：
 *
 *   1. **不写死路径**：coding 的计划文件在 `openspec/changes/<id>/tasks.md`，
 *      debug 的在 `.polaris/tasks/<id>/tasks.md` —— 都从产物表取。写死任一个
 *      都会让另一族静默校验错文件（或报「文件不存在」而不是校验结果）
 *   2. **`pass: null` 不等于失败**：没有可校验产物、或产物尚未生成，都要与
 *      「校验未通过」分开，否则界面会把无事可做渲染成红叉
 *   3. **只读**：调用前后文件字节不变
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import { lintTaskPlan } from '../../src/dashboard/api/tasks.js';

async function tmpProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'polaris-planlint-'));
}

async function put(root: string, rel: string, content: string): Promise<string> {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf-8');
  return abs;
}

const TASKS_MD = '# 任务\n\n- [ ] 甲\n- [ ] 乙\n';

async function writeWorkflow(root: string): Promise<void> {
  await put(
    root,
    '.polaris/workflow.yaml',
    [
      'coding_tasks:',
      '  - task_id: c-1',
      '    phase: build',
      '    worktree_path: ""',
      '    started_at: 2026-09-01T00:00:00.000Z',
      'requirement_tasks:',
      '  - task_id: r-1',
      '    phase: draft',
      '    worktree_path: ""',
      '    started_at: 2026-09-02T00:00:00.000Z',
      'testcase_tasks: []',
      'prototype_tasks: []',
      'debug_tasks:',
      '  - task_id: d-1',
      '    phase: diagnose',
      '    channel: hotfix',
      '    worktree_path: ""',
      '    started_at: 2026-09-03T00:00:00.000Z',
      '',
    ].join('\n'),
  );
}

describe('lintTaskPlan', () => {
  let root: string;

  beforeEach(async () => {
    root = await tmpProject();
    await writeWorkflow(root);
  });

  it('coding 的计划文件取自产物表（openspec/changes/<id>/tasks.md）', async () => {
    await put(root, 'openspec/changes/c-1/tasks.md', TASKS_MD);

    const res = await lintTaskPlan(root, 'c-1', 'coding');
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.file).toBe('openspec/changes/c-1/tasks.md');
    expect(res.pass).toBe(false);
    expect(res.violations.length).toBeGreaterThan(0);
  });

  it('debug 的计划文件在 .polaris/tasks/<id>/tasks.md —— 证明没有写死 openspec 路径', async () => {
    await put(root, '.polaris/tasks/d-1/tasks.md', TASKS_MD);

    const res = await lintTaskPlan(root, 'd-1', 'debug');
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.file).toBe('.polaris/tasks/d-1/tasks.md');
  });

  it('有该产物但文件尚未生成 → pass:null 且给出原因（不是失败）', async () => {
    const res = await lintTaskPlan(root, 'c-1', 'coding');
    if ('error' in res) throw new Error('不应报错');
    expect(res.pass).toBeNull();
    expect(res.reason).toBe('计划文件尚未生成');
    expect(res.violations).toEqual([]);
  });

  it('该 kind 无复选框产物（requirement）→ pass:null 且原因是「无计划文件」', async () => {
    const res = await lintTaskPlan(root, 'r-1', 'requirement');
    if ('error' in res) throw new Error('不应报错');
    expect(res.pass).toBeNull();
    expect(res.reason).toBe('该任务类型无计划文件');
  });

  it('任务不存在 → 报错', async () => {
    const res = await lintTaskPlan(root, 'nope', 'coding');
    expect('error' in res && res.error).toMatch(/not found/);
  });

  it('只读：调用前后文件字节不变', async () => {
    const abs = await put(root, 'openspec/changes/c-1/tasks.md', TASKS_MD);
    const before = await readFile(abs, 'utf-8');

    await lintTaskPlan(root, 'c-1', 'coding');

    expect(await readFile(abs, 'utf-8')).toBe(before);
  });
});
