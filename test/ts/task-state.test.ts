/**
 * task-state 读写与 patch 单测。
 */
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  createDefaultTaskState,
  loadTaskState,
  patchTaskState,
  saveTaskState,
} from '../../src/core/config/task-state.js';
import { getTaskStatePath } from '../../src/core/config/polaris-paths.js';

describe('task-state', () => {
  it('createDefaultTaskState 含示例字段骨架', () => {
    const state = createDefaultTaskState({ changeId: 'draft-1', phase: 'clarify' });
    expect(state.change_id).toBe('draft-1');
    expect(state.phase).toBe('clarify');
    expect(state.worktree?.created_by_polaris_flow).toBe(false);
    expect(state.deepread?.action).toBe('halt_and_wait');
  });

  it('load 兼容 kebab 键；patch 不丢未改字段', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-task-state-'));
    const taskId = 'feat-x';
    const statePath = getTaskStatePath(root, taskId);
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(
      statePath,
      [
        'change_id: "feat-x"',
        'phase: design',
        'context-compression: beta',
        'intention:',
        '  path: "openspec/changes/feat-x/intention.md"',
        'build:',
        '  total_tasks: 3',
        '  completed_tasks: 1',
        '',
      ].join('\n'),
      'utf-8',
    );

    const loaded = await loadTaskState(root, taskId);
    expect(loaded?.context_compression).toBe('beta');
    expect(loaded?.intention?.path).toContain('intention.md');
    expect(loaded?.build?.total_tasks).toBe(3);

    const patched = await patchTaskState(root, taskId, {
      phase: 'build',
      build: { completed_tasks: 2 },
    });
    expect(patched.phase).toBe('build');
    expect(patched.build?.completed_tasks).toBe(2);
    expect(patched.build?.total_tasks).toBe(3);
    expect(patched.intention?.path).toContain('intention.md');
  });

  it('saveTaskState 可回读', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-task-save-'));
    const state = createDefaultTaskState({ changeId: 'c1', phase: 'propose' });
    await saveTaskState(root, 'c1', state);
    const loaded = await loadTaskState(root, 'c1');
    expect(loaded?.change_id).toBe('c1');
    expect(loaded?.phase).toBe('propose');
  });
});
