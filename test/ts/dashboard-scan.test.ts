/**
 * Dashboard 扫描层单测（游标 / 运行态 / 文件树）。
 *
 * 覆盖：
 * 1. `scanTaskList`：5 类 kind 的游标条目摊平，字段与 kind 归属正确
 * 2. **反例**：`state.yaml.phase` 与游标 phase 不一致时，运行态返回**游标值**
 *    （护栏：防「把 state.yaml.phase 当权威」那类失误复发）
 * 3. `title` 三级兜底：state 名字字段 → 产物文档首标题 → task_id
 * 4. `listTaskFiles`：两个来源合并、只收 .md/.yaml、路径为项目根相对 posix
 * 5. `readTaskCheckboxes`：复选框进度；无文件/无复选框返回 null
 * 6. `scanArchivedTasks`：`.polaris/archive`（含 prototype 嵌套）与
 *    `docs/troubleshooting`（debug 族走这里，不用 .polaris/archive）
 */
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { scanArchivedTasks, scanTaskList } from '../../src/dashboard/scan/tasks.js';
import { readTaskRuntime } from '../../src/dashboard/scan/state.js';
import {
  listTaskFiles,
  parseCheckboxes,
  readTaskCheckboxes,
} from '../../src/dashboard/scan/files.js';

async function tmpProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'polaris-scan-'));
}

/** 写文件（自动建父目录） */
async function put(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf-8');
}

/** 造一份 5 类 kind 都有条目的游标 */
async function writeWorkflow(root: string): Promise<void> {
  await put(
    root,
    '.polaris/workflow.yaml',
    [
      'coding_tasks:',
      '  - task_id: c-1',
      '    phase: build',
      '    worktree_path: /tmp/wt/c-1',
      '    started_at: 2026-09-01T00:00:00.000Z',
      'requirement_tasks:',
      '  - task_id: r-1',
      '    phase: draft',
      '    worktree_path: ""',
      '    started_at: 2026-09-02T00:00:00.000Z',
      'testcase_tasks:',
      '  - task_id: t-1',
      '    phase: refine',
      '    worktree_path: ""',
      '    started_at: 2026-09-03T00:00:00.000Z',
      'prototype_tasks:',
      '  - task_id: p-1',
      '    phase: review',
      '    worktree_path: ""',
      '    started_at: 2026-09-04T00:00:00.000Z',
      'debug_tasks:',
      '  - task_id: d-1',
      '    phase: patch',
      '    channel: hotfix',
      '    worktree_path: ""',
      '    started_at: 2026-09-05T00:00:00.000Z',
      '',
    ].join('\n'),
  );
}

describe('scanTaskList', () => {
  it('摊平 5 个数组，kind 由所在数组决定，字段完整', async () => {
    const root = await tmpProject();
    await writeWorkflow(root);

    const list = await scanTaskList(root);
    expect(list.map((t) => t.task_id)).toEqual(['c-1', 'r-1', 't-1', 'p-1', 'd-1']);
    expect(list.map((t) => t.kind)).toEqual([
      'coding',
      'requirement',
      'testcase',
      'prototype',
      'debug',
    ]);
    expect(list.map((t) => t.phase)).toEqual(['build', 'draft', 'refine', 'review', 'patch']);
    expect(list.every((t) => t.source === 'cursor')).toBe(true);

    const coding = list[0]!;
    expect(coding.worktree_path).toBe('/tmp/wt/c-1');
    expect(coding.started_at).toBe('2026-09-01T00:00:00.000Z');
    const debug = list[4]!;
    expect(debug.channel).toBe('hotfix');
  });

  it('缺少 workflow.yaml 时返回空列表（不抛错）', async () => {
    const root = await tmpProject();
    await expect(scanTaskList(root)).resolves.toEqual([]);
  });

  it('没有 task_id 的条目被跳过', async () => {
    const root = await tmpProject();
    await put(
      root,
      '.polaris/workflow.yaml',
      ['coding_tasks:', '  - phase: plan', '  - task_id: ok-1', '    phase: plan', ''].join('\n'),
    );
    const list = await scanTaskList(root);
    expect(list.map((t) => t.task_id)).toEqual(['ok-1']);
  });
});

describe('readTaskRuntime', () => {
  it('phase 取游标值 —— 即使 state.yaml.phase 是另一个值（反例护栏）', async () => {
    const root = await tmpProject();
    await put(
      root,
      '.polaris/tasks/c-1/state.yaml',
      ['kind: coding', 'task_id: c-1', 'phase: specify', 'workflow:', '  mode: sdd', ''].join('\n'),
    );

    const runtime = readTaskRuntime(root, 'coding', 'c-1', 'build');
    expect(runtime.phase).toBe('build');
    expect(runtime.stateMissing).toBe(false);
    expect(runtime.mode).toBe('sdd');
    expect(runtime.updatedAt).not.toBe('');
  });

  it('state.yaml 缺失：stateMissing 为 true，title 回落产物文档标题或 task_id', async () => {
    const root = await tmpProject();
    const missing = readTaskRuntime(root, 'coding', 'c-1', 'specify');
    expect(missing.stateMissing).toBe(true);
    expect(missing.title).toBe('c-1');

    await put(root, '.polaris/tasks/c-1/intention.md', '# 我的意图\n\n正文\n');
    const withDoc = readTaskRuntime(root, 'coding', 'c-1', 'specify');
    expect(withDoc.title).toBe('我的意图');
  });

  it('title 优先取 state 的名字字段（requirement 的 req_name）', async () => {
    const root = await tmpProject();
    await put(
      root,
      '.polaris/tasks/r-1/state.yaml',
      ['kind: requirement', 'task_id: r-1', 'req_name: order-export', 'phase: idle', ''].join(
        '\n',
      ),
    );
    await put(root, '.polaris/tasks/r-1/req_baseline.md', '# 订单导出需求基线\n');

    const runtime = readTaskRuntime(root, 'requirement', 'r-1', 'draft');
    expect(runtime.title).toBe('order-export');
    expect(runtime.phase).toBe('draft');
  });

  it('debug 的 channel 与 worktree.path 能读到；testcase 走 .polaris/testcases', async () => {
    const root = await tmpProject();
    await put(
      root,
      '.polaris/tasks/d-1/state.yaml',
      ['kind: debug', 'task_id: d-1', 'channel: bugfix', 'phase: idle', 'worktree:', '  path: /tmp/wt/d-1', ''].join(
        '\n',
      ),
    );
    const debug = readTaskRuntime(root, 'debug', 'd-1', 'diagnose');
    expect(debug.channel).toBe('bugfix');
    expect(debug.worktreePath).toBe('/tmp/wt/d-1');

    await put(root, '.polaris/testcases/t-1/state.yaml', 'kind: testcase\ntask_id: t-1\n');
    const testcase = readTaskRuntime(root, 'testcase', 't-1', 'draft');
    expect(testcase.stateMissing).toBe(false);
  });

  it('state.yaml 损坏时不抛错，title 回落', async () => {
    const root = await tmpProject();
    await put(root, '.polaris/tasks/c-2/state.yaml', 'kind: coding\n\tphase: [broken\n');
    const runtime = readTaskRuntime(root, 'coding', 'c-2', 'plan');
    expect(runtime.phase).toBe('plan');
    expect(runtime.title).toBe('c-2');
  });

  it('游标 phase 为空串时原样返回（不猜）', async () => {
    const root = await tmpProject();
    const runtime = readTaskRuntime(root, 'coding', 'c-3', '');
    expect(runtime.phase).toBe('');
  });
});

describe('listTaskFiles', () => {
  it('合并任务目录与 openspec 变更目录，只收 .md/.yaml，路径为项目根相对', async () => {
    const root = await tmpProject();
    await put(root, '.polaris/tasks/c-1/state.yaml', 'kind: coding\n');
    await put(root, '.polaris/tasks/c-1/notes.txt', '不该出现');
    await put(root, 'openspec/changes/c-1/tasks.md', '- [x] a\n');
    await put(root, 'openspec/changes/c-1/specs/api/spec.md', '# spec\n');

    const files = listTaskFiles(root, 'coding', 'c-1');
    expect(files.map((f) => f.path)).toEqual([
      '.polaris/tasks/c-1/state.yaml',
      'openspec/changes/c-1/specs/api/spec.md',
      'openspec/changes/c-1/tasks.md',
    ]);
    expect(files.every((f) => f.name.length > 0)).toBe(true);
    expect(files[2]!.content).toContain('- [x] a');
  });

  it('两个来源都不存在时返回空数组', async () => {
    const root = await tmpProject();
    expect(listTaskFiles(root, 'coding', 'nope')).toEqual([]);
  });
});

describe('复选框进度', () => {
  it('parseCheckboxes 统计 total/done，无复选框返回 null', () => {
    expect(parseCheckboxes('- [x] a\n- [ ] b\n- [x] c\n')).toEqual({ total: 3, done: 2 });
    expect(parseCheckboxes('# 只有标题\n')).toBeNull();
    expect(parseCheckboxes('')).toBeNull();
  });

  it('readTaskCheckboxes 按产物表定位 tasks.md（coding）', async () => {
    const root = await tmpProject();
    await put(root, 'openspec/changes/c-1/tasks.md', '- [x] a\n- [ ] b\n');
    expect(readTaskCheckboxes(root, 'coding', 'c-1')).toEqual({ total: 2, done: 1 });
  });

  it('debug 的复选框产物在 .polaris/tasks/<id>/tasks.md', async () => {
    const root = await tmpProject();
    await put(root, '.polaris/tasks/d-1/tasks.md', '- [x] a\n');
    expect(readTaskCheckboxes(root, 'debug', 'd-1')).toEqual({ total: 1, done: 1 });
  });

  it('该 kind 未声明复选框产物时返回 null（如 prototype）', async () => {
    const root = await tmpProject();
    expect(readTaskCheckboxes(root, 'prototype', 'p-1')).toBeNull();
  });
});

describe('scanArchivedTasks', () => {
  it('.polaris/archive：kind 从归档内的 state.yaml 读，phase 标 archived', async () => {
    const root = await tmpProject();
    await put(root, '.polaris/archive/c-9/state.yaml', 'kind: coding\ntask_id: c-9\n');
    await put(root, '.polaris/archive/r-9/state.yaml', 'kind: requirement\ntask_id: r-9\n');

    const archived = scanArchivedTasks(root);
    const byId = new Map(archived.map((t) => [t.task_id, t]));
    expect(byId.get('c-9')?.kind).toBe('coding');
    expect(byId.get('r-9')?.kind).toBe('requirement');
    expect(byId.get('c-9')?.source).toBe('archive');
    expect(byId.get('c-9')?.phase).toBe('archived');
  });

  it('归档里读不到 kind 时给 null（不猜成 coding）', async () => {
    const root = await tmpProject();
    await mkdir(path.join(root, '.polaris/archive/x-9'), { recursive: true });
    const archived = scanArchivedTasks(root);
    expect(archived.find((t) => t.task_id === 'x-9')?.kind).toBeNull();
  });

  it('prototype 的嵌套归档布局 .polaris/archive/prototype/<id> 也能扫到', async () => {
    const root = await tmpProject();
    await put(root, '.polaris/archive/prototype/p-9/state.yaml', 'kind: prototype\ntask_id: p-9\n');
    const archived = scanArchivedTasks(root);
    expect(archived.map((t) => t.task_id)).toEqual(['p-9']);
    expect(archived[0]!.kind).toBe('prototype');
  });

  it('debug 族走 docs/troubleshooting（不用 .polaris/archive），日期取自 INDEX.md', async () => {
    const root = await tmpProject();
    await mkdir(path.join(root, 'docs/troubleshooting/bug-123'), { recursive: true });
    await put(
      root,
      'docs/troubleshooting/bug-123/bugfix-report.md',
      '# 交付报告\n',
    );
    await put(
      root,
      'docs/troubleshooting/INDEX.md',
      ['issue_id | 日期 | 模块 | 异常类型 | 根因一句话 | 修复一句话', '--- | --- | --- | --- | --- | ---', 'bug-123 | 2026-09-10 | 订单 | 空指针 | 未判空 | 补判空', ''].join('\n'),
    );

    const archived = scanArchivedTasks(root);
    expect(archived.map((t) => t.task_id)).toEqual(['bug-123']);
    expect(archived[0]!.kind).toBe('debug');
    expect(archived[0]!.source).toBe('troubleshooting');
    expect(archived[0]!.archived_at).toBe('2026-09-10');
  });

  it('两个来源都有时并列返回', async () => {
    const root = await tmpProject();
    await put(root, '.polaris/archive/c-9/state.yaml', 'kind: coding\n');
    await mkdir(path.join(root, 'docs/troubleshooting/bug-1'), { recursive: true });

    const ids = scanArchivedTasks(root)
      .map((t) => t.task_id)
      .sort();
    expect(ids).toEqual(['bug-1', 'c-9']);
  });

  it('无任何归档时返回空数组', async () => {
    const root = await tmpProject();
    expect(scanArchivedTasks(root)).toEqual([]);
  });
});
