/**
 * `task-entry` 单测 —— 入口技能「进入任务」原语的六个出口。
 *
 * 覆盖：
 *   1. 零个 → `create`（建目录 + 写 `workflow.mode` + 注册游标，一次调用完成）
 *   2. `create` 之后立刻再调 → `resume`（链路闭合：mode 已落盘，所以判定回本技能）
 *   3. 唯一 + `skill == --as` → `resume`
 *   4. 唯一 + `skill` 是别的技能 → `handover`（**不得**由本技能接手）
 *   5. 多个 → `select`（只列候选，不替用户选）
 *   6. 磁盘有未注册 draft 残留 → `resolve-drafts`
 *   7. state 读不到 / `phase` 为空 → `block`
 *   8. `skill == null`（旁路阶段）→ `block`（**不得**落进 handover）
 *   9. 参数与顺序：缺 `--as`、缺 `--mode`、非法 `--mode`、`--task-id` 不存在 → exit 3
 */
import { execFileSync } from 'child_process';
import { mkdir, mkdtemp, utimes, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { getTaskKindStatePath } from '../../src/core/assets/polaris-paths.js';
import { loadTaskStateFromFile } from '../../src/core/config/task-state.js';
import type { WorkflowTaskKind } from '../../src/core/config/workflow-state.js';
import { loadWorkflowState } from '../../src/core/config/workflow-state.js';
import { runTaskEntry } from '../../src/core/hooks/task-entry.js';
import { init } from '../../src/core/hooks/task.js';
import { runWorkflowEntry } from '../../src/core/hooks/workflow-entry.js';

async function tmpRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'polaris-task-entry-'));
  await mkdir(path.join(dir, '.polaris'), { recursive: true });
  // task-init 依赖 .polaris/config.yaml（缺则 exit 2）
  await writeFile(
    path.join(dir, '.polaris', 'config.yaml'),
    "lang: zh\nplatform: claude\nplugin_root: '.claude/skills/polaris'\n",
    'utf-8',
  );
  // createTask 会校验项目已纳入 git 版本管理（无 .git 则 exit 3），故临时仓先 git init
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

/** 与 tmpRepo 相同，但**不** git init —— 专测「未纳入 git 版本管理」的阻断路径 */
async function tmpRepoNoGit(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'polaris-task-entry-nogit-'));
  await mkdir(path.join(dir, '.polaris'), { recursive: true });
  await writeFile(
    path.join(dir, '.polaris', 'config.yaml'),
    "lang: zh\nplatform: claude\nplugin_root: '.claude/skills/polaris'\n",
    'utf-8',
  );
  return dir;
}

/** 在任务目录写入文件并钉死 mtime，避免依赖写盘先后 */
async function seedTaskFiles(
  repo: string,
  kind: WorkflowTaskKind,
  taskId: string,
  files: Record<string, string>,
  mtimeMs: number,
): Promise<void> {
  const segment = kind === 'testcase' ? 'testcases' : 'tasks';
  const dir = path.join(repo, '.polaris', segment, taskId);
  await mkdir(dir, { recursive: true });
  const stamp = new Date(mtimeMs);
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    await writeFile(filePath, content, 'utf-8');
    await utimes(filePath, stamp, stamp);
  }
}

/** 追加游标 + 写 state.yaml（phase / mode 都在 state 里） */
async function seedTask(
  repo: string,
  taskId: string,
  phase: string,
  mode: string,
  mtimeMs = 0,
): Promise<void> {
  const appended = await runWorkflowEntry({
    op: 'append-active',
    skill: 'test',
    kind: 'coding',
    repoRoot: repo,
    taskId,
    startedAt: '2026-07-21T00:00:00Z',
  });
  expect(appended.exitCode).toBe(0);
  await seedTaskFiles(
    repo,
    'coding',
    taskId,
    { 'state.yaml': `phase: ${phase}\nworkflow:\n  mode: ${mode}\n` },
    mtimeMs,
  );
}

describe('task-entry · create', () => {
  it('零个在途任务 → 建目录 + 写 workflow.mode + 注册游标，一次调用完成', async () => {
    const repo = await tmpRepo();
    const result = await runTaskEntry({
      kind: 'coding',
      as: 'tweak',
      mode: 'tweak',
      repoRoot: repo,
      startedAt: '2026-07-21T00:00:00Z',
    });

    expect(result.exitCode).toBe(0);
    const payload = result.payload;
    expect(payload?.action).toBe('create');
    expect(payload?.mode).toBe('tweak');
    expect(payload?.mode_label).toBe('简单');

    const taskId = payload?.task_id ?? '';
    expect(taskId).toMatch(/^draft-/);

    // 游标已注册
    const state = await loadWorkflowState(repo);
    expect(state.coding_tasks.map((e) => e.task_id)).toEqual([taskId]);

    // workflow.mode 已落到该任务自己的 state.yaml
    const taskState = await loadTaskStateFromFile(getTaskKindStatePath(repo, 'coding', taskId));
    expect(taskState?.workflow?.mode).toBe('tweak');
    // 模板默认阶段仍是 specify
    expect(taskState?.phase).toBe('specify');
  });

  it('create 之后立刻再调 → resume（新任务停在 specify，该由 specify 技能接手）', async () => {
    const repo = await tmpRepo();
    const first = await runTaskEntry({
      kind: 'coding',
      as: 'tweak',
      mode: 'tweak',
      repoRoot: repo,
      startedAt: '2026-07-21T00:00:00Z',
    });
    const taskId = first.payload?.task_id ?? '';

    const second = await runTaskEntry({ kind: 'coding', as: 'specify', repoRoot: repo });
    expect(second.payload?.action).toBe('resume');
    expect(second.payload?.task_id).toBe(taskId);
    expect(second.payload?.skill).toBe('specify');
    expect(second.payload?.skill_label).toBe('澄清');
  });

  it('零个时缺 --mode → exit 3；非法 --mode → exit 3', async () => {
    const repo = await tmpRepo();
    const noMode = await runTaskEntry({ kind: 'coding', as: 'tweak', repoRoot: repo });
    expect(noMode.exitCode).toBe(3);
    expect(noMode.message).toContain('--mode');

    // 退役名 `full` 不得再被写入：白名单仍是 WORKFLOW_MODE_LABELS（归一只在读取侧做）
    const badMode = await runTaskEntry({
      kind: 'coding',
      as: 'tweak',
      mode: 'full',
      repoRoot: repo,
    });
    expect(badMode.exitCode).toBe(3);
    expect(badMode.message).toContain('未知工作流');

    // 失败的调用不得留下游标条目
    expect((await loadWorkflowState(repo)).coding_tasks).toHaveLength(0);
  });

  it('项目未纳入 git 版本管理（无 .git）→ exit 3，提示先 git init，且不建目录', async () => {
    const repo = await tmpRepoNoGit();
    const result = await runTaskEntry({
      kind: 'coding',
      as: 'tweak',
      mode: 'tweak',
      repoRoot: repo,
    });

    expect(result.exitCode).toBe(3);
    expect(result.message).toContain('git init');
    expect(result.payload).toBeUndefined();
    // 未建任务目录、未注册游标
    expect((await loadWorkflowState(repo)).coding_tasks).toHaveLength(0);
  });

  it('磁盘有未注册的 draft 残留 → resolve-drafts（不替用户裁决）', async () => {
    const repo = await tmpRepo();
    // 造孤儿：建 draft 目录与 state，但**不** append 游标
    const created = await init(repo, 'coding', {});
    expect(created.exitCode).toBe(0);
    const orphan = String(created.payload?.draft_name ?? '');
    expect(orphan).toMatch(/^draft-/);

    const result = await runTaskEntry({
      kind: 'coding',
      as: 'tweak',
      mode: 'tweak',
      repoRoot: repo,
    });
    expect(result.exitCode).toBe(0);
    expect(result.payload?.action).toBe('resolve-drafts');
    expect(result.payload?.drafts).toEqual([orphan]);
    expect(result.payload?.reason).toBeTruthy();

    // 仍未注册
    expect((await loadWorkflowState(repo)).coding_tasks).toHaveLength(0);
  });
});

describe('task-entry · 判定（resume / handover / block）', () => {
  it('唯一 + skill == --as → resume，并带出 phase 的中英文', async () => {
    const repo = await tmpRepo();
    await seedTask(repo, 't-1', 'plan', 'tweak');

    const result = await runTaskEntry({ kind: 'coding', as: 'plan', repoRoot: repo });
    expect(result.payload?.action).toBe('resume');
    expect(result.payload?.phase).toBe('plan');
    expect(result.payload?.phase_label).toBe('提案');
    expect(result.payload?.state_path).toContain(path.join('.polaris', 'tasks', 't-1', 'state.yaml'));
  });

  it('唯一 + skill 是别的技能 → handover（本技能不得接手，也不得新建）', async () => {
    const repo = await tmpRepo();
    await seedTask(repo, 't-2', 'plan', 'strict');

    const result = await runTaskEntry({ kind: 'coding', as: 'tweak', repoRoot: repo });
    expect(result.payload?.action).toBe('handover');
    expect(result.payload?.skill).toBe('plan');
    expect(result.payload?.skill_label).toBe('提案');
    // 不得因「不是本技能」而新建第二个任务
    expect((await loadWorkflowState(repo)).coding_tasks).toHaveLength(1);
  });

  it('state.yaml 读不到 → block（不得当成「零个」去新建）', async () => {
    const repo = await tmpRepo();
    await runWorkflowEntry({
      op: 'append-active',
      skill: 'test',
      kind: 'coding',
      repoRoot: repo,
      taskId: 't-ghost',
      startedAt: '2026-07-21T00:00:00Z',
    });

    const result = await runTaskEntry({ kind: 'coding', as: 'tweak', repoRoot: repo });
    expect(result.payload?.action).toBe('block');
    expect(result.payload?.reason).toContain('state.yaml');
    expect(result.payload?.state_path).toContain('t-ghost');
    // 没有新建
    expect((await loadWorkflowState(repo)).coding_tasks).toHaveLength(1);
  });

  it('phase 为空 → block', async () => {
    const repo = await tmpRepo();
    await seedTask(repo, 't-3', '', 'tweak');

    const result = await runTaskEntry({ kind: 'coding', as: 'tweak', repoRoot: repo });
    expect(result.payload?.action).toBe('block');
  });

  it('skill == null（旁路阶段 retro）→ block，不得落进 handover', async () => {
    const repo = await tmpRepo();
    await seedTask(repo, 't-retro', 'retro', 'strict');

    const result = await runTaskEntry({ kind: 'coding', as: 'tweak', repoRoot: repo });
    expect(result.payload?.action).toBe('block');
    expect(result.payload?.skill).toBeNull();
    expect(result.payload?.reason).toContain('无可路由技能');
  });

  it('--task-id 直接判定，跳过 select', async () => {
    const repo = await tmpRepo();
    await seedTask(repo, 'a-1', 'plan', 'tweak', 0);
    await seedTask(repo, 'b-2', 'specify', 'strict', 1000);

    const result = await runTaskEntry({
      kind: 'coding',
      as: 'tweak',
      taskId: 'b-2',
      repoRoot: repo,
    });
    expect(result.payload?.action).toBe('handover');
    expect(result.payload?.task_id).toBe('b-2');
    expect(result.payload?.skill).toBe('specify');
  });

  it('--task-id 不在游标里 → exit 3（拼错的 id 不得静默当成新建）', async () => {
    const repo = await tmpRepo();
    await seedTask(repo, 'a-1', 'plan', 'tweak');

    const result = await runTaskEntry({
      kind: 'coding',
      as: 'tweak',
      taskId: 'nope',
      repoRoot: repo,
    });
    expect(result.exitCode).toBe(3);
    expect(result.message).toContain('nope');
  });
});

describe('task-entry · select 与参数', () => {
  it('多个在途任务 → select，候选带中文显示名，且不替用户选', async () => {
    const repo = await tmpRepo();
    await seedTask(repo, 'a-1', 'plan', 'tweak', 0);
    await seedTask(repo, 'b-2', 'specify', 'strict', 1000);

    const result = await runTaskEntry({ kind: 'coding', as: 'tweak', repoRoot: repo });
    expect(result.payload?.action).toBe('select');
    expect(result.payload?.task_id).toBeUndefined();

    const byId = new Map((result.payload?.candidates ?? []).map((c) => [c.task_id, c]));
    expect([...byId.keys()].sort()).toEqual(['a-1', 'b-2']);
    expect(byId.get('a-1')?.skill_label).toBe('提案');
    expect(byId.get('a-1')?.mode_label).toBe('简单');
    expect(byId.get('b-2')?.phase_label).toBe('澄清');
    expect(byId.get('b-2')?.skill_label).toBe('澄清');
    // 纯读：候选列表不产生任何写入
    expect((await loadWorkflowState(repo)).coding_tasks).toHaveLength(2);
  });

  it('缺 --as → exit 3；缺 --kind → exit 3', async () => {
    const repo = await tmpRepo();
    const noAs = await runTaskEntry({ kind: 'coding', repoRoot: repo });
    expect(noAs.exitCode).toBe(3);
    expect(noAs.message).toContain('--as');

    const noKind = await runTaskEntry({ as: 'tweak', mode: 'tweak', repoRoot: repo });
    expect(noKind.exitCode).toBe(3);
  });
});
