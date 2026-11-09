/**
 * PRD discovery 删除器脚本（drop-tasks.mjs）单元测试。
 * 覆盖：task_id 合法性、路径边界、dry-run 清点、--confirm 删除与游标注销、失败码语义。
 * 游标调用（workflow-entry）打桩，不依赖全局 CLI。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyDrop,
  collectPreview,
  resolveTaskDir,
  validateTaskId,
} from '../../assets/zh/skills/prd/discovery/scripts/drop-tasks.mjs';

let repoRoot = '';

beforeEach(async () => {
  repoRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'polaris-drop-'));
  // 两个既有任务目录，其一有产物
  for (const [id, withFiles] of [
    ['task-a', true],
    ['task-b', false],
  ] as const) {
    const dir = path.join(repoRoot, '.polaris', 'tasks', id);
    fs.mkdirSync(dir, { recursive: true });
    if (withFiles) {
      fs.writeFileSync(path.join(dir, 'req_baseline.md'), '# baseline\n');
      fs.writeFileSync(path.join(dir, 'req_clarify_summary.md'), '# summary\n');
    }
  }
});

describe('validateTaskId', () => {
  it('拒绝空 / 点 / 双点 / 含斜杠 / 非 kebab-case', () => {
    for (const bad of ['', '.', '..', 'a/b', '../x', 'Task_A', '-lead', 'trail-']) {
      expect(validateTaskId(bad)).toBeTruthy();
    }
    expect(validateTaskId('refine-user-privilege')).toBeNull();
    expect(validateTaskId('uap-2')).toBeNull();
  });
});

describe('resolveTaskDir', () => {
  it('严格落在 .polaris/tasks 下；越界抛错', () => {
    expect(resolveTaskDir(repoRoot, 'task-a')).toBe(
      path.join(repoRoot, '.polaris', 'tasks', 'task-a'),
    );
    // path.resolve 会先归一化，越界场景在 Windows/Linux 下都应被首层校验拦住
    expect(() => resolveTaskDir(repoRoot, '..')).toThrow();
  });
});

describe('collectPreview（dry-run 清点）', () => {
  it('列出目录、存在性与产物数，无副作用', () => {
    const preview = collectPreview(repoRoot, ['task-a', 'task-b', 'task-missing']);
    expect(preview[0]).toMatchObject({ taskId: 'task-a', exists: true, fileCount: 2 });
    expect(preview[1]).toMatchObject({ taskId: 'task-b', exists: true, fileCount: 0 });
    expect(preview[2]).toMatchObject({ taskId: 'task-missing', exists: false });
    // 无副作用：目录都还在
    expect(fs.existsSync(path.join(repoRoot, '.polaris', 'tasks', 'task-a'))).toBe(true);
  });
});

describe('applyDrop（--confirm 执行）', () => {
  type DropResult = {
    taskId: string;
    dir: string;
    removed: boolean;
    removeError: string | null;
    cursorRemoved: boolean;
    cursorError: string | null;
  };

  it('删除目录并注销游标', () => {
    const cursors: string[] = [];
    const results = applyDrop(
      { repoRoot, ids: ['task-a', 'task-b'] },
      { runCursor: (id: string) => (cursors.push(id), { ok: true }) },
    ) as DropResult[];
    expect(results.every((r) => r.removed && r.cursorRemoved)).toBe(true);
    expect(cursors).toEqual(['task-a', 'task-b']);
    expect(fs.existsSync(path.join(repoRoot, '.polaris', 'tasks', 'task-a'))).toBe(false);
  });

  it('目录删除失败时不注销游标，保留现场', () => {
    const results = applyDrop(
      { repoRoot, ids: ['task-a'] },
      {
        removeDir: () => {
          throw new Error('EBUSY');
        },
        runCursor: () => ({ ok: true }),
      },
    ) as DropResult[];
    expect(results[0]).toMatchObject({ removed: false, cursorRemoved: false });
    expect(fs.existsSync(path.join(repoRoot, '.polaris', 'tasks', 'task-a'))).toBe(true);
  });

  it('游标注销失败在结果中标记（供上层给退出码 4）', () => {
    const results = applyDrop(
      { repoRoot, ids: ['task-b'] },
      { runCursor: () => ({ ok: false, reason: 'CLI 缺失' }) },
    ) as DropResult[];
    expect(results[0]).toMatchObject({
      removed: true,
      cursorRemoved: false,
      cursorError: 'CLI 缺失',
    });
  });
});
