/**
 * task-state 读写与 patch 单测。
 *
 * 覆盖：
 * 1. createDefaultTaskState 输出新结构骨架（runtime.* / 扁平 workflow）
 * 2. load 兼容 kebab 顶层键
 * 3. patch 不丢未改字段
 * 4. saveTaskState 可回读
 * 5. 旧扁平结构（intention/clarify/review/delivery 顶层）能自动归一到 runtime.*
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
import { getTaskStatePath } from '../../src/core/assets/polaris-paths.js';

describe('task-state', () => {
  it('createDefaultTaskState 含新结构骨架', () => {
    const state = createDefaultTaskState({ change_id: 'draft-1', phase: 'specify' });
    expect(state.change_id).toBe('draft-1');
    expect(state.phase).toBe('specify');
    expect(state.runtime).toBeDefined();
    expect(state.runtime?.specify?.status).toBe('');
    expect(state.runtime?.specify?.intention_path).toBe('');
    expect(state.runtime?.deepread?.action).toBe('halt_and_wait');
    expect(state.runtime?.ship).toBeDefined();
    expect(state.runtime?.ship?.backfill).toBe('');
    expect(state.runtime?.verify?.constitution_compliance).toBe('');
    expect(state.runtime?.verify?.constitution_valid).toBe(false);
    expect(state.runtime?.build?.build_mode).toBe('');
    expect(state.runtime?.build?.review_mode).toBe('');
    expect(state.runtime?.build?.final_review).toBe('');
    expect(state.runtime?.tasks?.plan_review_status).toBe('');
    expect(state.runtime?.plan?.worktree_decision).toBe('');
    expect(state.runtime?.plan?.opsx_propose_status).toBe('');
    expect(state.runtime?.plan?.review_round).toBe(0);
    expect(state.runtime?.plan?.review_log_file).toBe('');
    expect(state.artifact_review_mode).toBe('per_batch');
    expect(state.artifact_max_round).toBe(5);
    const wf = state.workflow;
    expect(wf?.mode).toBe('sdd');
    expect(wf?.status).toBe('');
    expect(wf?.signals).toEqual([]);
    expect(wf?.downgrade_reason).toBe('');
    expect(wf?.upgrade_target).toBe('');
    expect(state).not.toHaveProperty('workflow_state');
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
        'runtime:',
        '  specify:',
        '    intention_path: "openspec/changes/feat-x/intention.md"',
        '  build:',
        '    total_tasks: 3',
        '    completed_tasks: 1',
        '',
      ].join('\n'),
      'utf-8',
    );

    const loaded = await loadTaskState(root, taskId);
    expect(loaded?.context_compression).toBe('beta');
    expect(loaded?.runtime?.specify?.intention_path).toContain('intention.md');
    expect(loaded?.runtime?.build?.total_tasks).toBe(3);

    const patched = await patchTaskState(root, taskId, {
      phase: 'build',
      runtime: { build: { completed_tasks: 2 } },
    });
    expect(patched.phase).toBe('build');
    expect(patched.runtime?.build?.completed_tasks).toBe(2);
    expect(patched.runtime?.build?.total_tasks).toBe(3);
    expect(patched.runtime?.specify?.intention_path).toContain('intention.md');
  });

  it('saveTaskState 可回读', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-task-save-'));
    const state = createDefaultTaskState({ change_id: 'c1', phase: 'plan' });
    await saveTaskState(root, 'c1', state);
    const loaded = await loadTaskState(root, 'c1');
    expect(loaded?.change_id).toBe('c1');
    expect(loaded?.phase).toBe('plan');
    expect(loaded?.runtime?.plan).toBeDefined();
  });

  it('旧扁平结构自动归一到 runtime.*', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-task-legacy-'));
    const taskId = 'legacy-1';
    const statePath = getTaskStatePath(root, taskId);
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(
      statePath,
      [
        'change_id: "legacy-1"',
        'phase: clarify',
        // 旧扁平写法
        'intention:',
        '  path: "openspec/changes/legacy-1/intention.md"',
        'clarify:',
        '  status: "in_progress"',
        '  draft_dir: "legacy-1"',
        'delivery:',
        '  status: "delivered"',
        '  archive: "archived"',
        'review:',
        '  plan_review_status: "completed"',
        '  constitution_compliance: "true"',
        'workflow: sdd',
        'build_mode: tdd',
        '',
      ].join('\n'),
      'utf-8',
    );

    const loaded = await loadTaskState(root, taskId);
    // intention → runtime.specify.intention_path
    expect(loaded?.runtime?.specify?.intention_path).toContain('intention.md');
    expect(loaded?.runtime?.specify?.status).toBe('in_progress');
    // delivery → runtime.ship
    expect(loaded?.runtime?.ship?.status).toBe('delivered');
    expect(loaded?.runtime?.ship?.archive).toBe('archived');
    // review.plan_review_status → runtime.tasks.plan_review_status
    expect(loaded?.runtime?.tasks?.plan_review_status).toBe('completed');
    // review.constitution_compliance → runtime.verify.constitution_compliance
    expect(loaded?.runtime?.verify?.constitution_compliance).toBe('true');
    // workflow 字符串 → workflow.mode
    expect(loaded?.workflow?.mode).toBe('sdd');
    expect(loaded).not.toHaveProperty('workflow_state');
    // build_mode 顶层 → runtime.build.build_mode
    expect(loaded?.runtime?.build?.build_mode).toBe('tdd');
  });

  it('patch 写入 runtime.specify 不丢其他 runtime 块', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-task-patch-'));
    const taskId = 'patch-1';
    const initial = createDefaultTaskState({ change_id: taskId, phase: 'plan' });
    initial.runtime!.plan!.status = 'in_progress';
    initial.runtime!.plan!.review_round = 1;
    await saveTaskState(root, taskId, initial);

    const patched = await patchTaskState(root, taskId, {
      runtime: { specify: { intention_path: 'openspec/changes/patch-1/intention.md' } },
    });
    expect(patched.runtime?.specify?.intention_path).toContain('intention.md');
    expect(patched.runtime?.plan?.status).toBe('in_progress');
    expect(patched.runtime?.plan?.review_round).toBe(1);
  });

  it('旧 workflow.tweak / runtime.tweak 折进扁平 workflow', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-task-workflow-'));
    const taskId = 'fold-1';
    const statePath = getTaskStatePath(root, taskId);
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(
      statePath,
      [
        'change_id: "fold-1"',
        'phase: build',
        'workflow:',
        '  mode: sdd',
        '  tweak:',
        '    mode: tweak',
        '    status: in_progress',
        '    signals:',
        '      - U1',
        'runtime:',
        '  tweak:',
        '    upgrade_reason: "U1"',
        '    upgrade_target: normal',
        '  build:',
        '    status: in_progress',
        'workflow_state:',
        '  mode: sdd',
        '',
      ].join('\n'),
      'utf-8',
    );

    const loaded = await loadTaskState(root, taskId);
    expect(loaded?.workflow?.mode).toBe('tweak');
    expect(loaded?.workflow?.status).toBe('in_progress');
    expect(loaded?.workflow?.signals).toEqual(['U1']);
    expect(loaded?.workflow?.upgrade_reason).toBe('U1');
    expect(loaded?.workflow?.upgrade_target).toBe('normal');
    expect(loaded?.workflow).not.toHaveProperty('tweak');
    expect(loaded?.workflow).not.toHaveProperty('normal');
    expect(loaded?.runtime).not.toHaveProperty('tweak');
    expect(loaded?.runtime?.build?.status).toBe('in_progress');
    expect(loaded).not.toHaveProperty('workflow_state');
  });
});
