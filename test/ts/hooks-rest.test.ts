/**
 * draft-create / task-init / task-finalize / tasks-lint / constitution / harness-sync 测试。
 */
import { mkdir, writeFile, readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { runDraftCreate } from '../../src/core/hooks/draft-create.js';
import { init as runTaskInit, finalize as runTaskFinalize } from '../../src/core/hooks/task.js';
import { runTasksLint } from '../../src/core/hooks/tasks-lint.js';
import { runConstitutionValidity } from '../../src/core/hooks/constitution-validity.js';
import { runHarnessSync } from '../../src/core/hooks/harness-sync.js';
import { runWorkflowEntry } from '../../src/core/hooks/workflow-entry.js';
import { runDeliveryCleanup } from '../../src/core/hooks/delivery-cleanup.js';
import {
  INTENTION_REQUIRED_SECTIONS,
  runIntentionValidate,
} from '../../src/core/hooks/intention-validate.js';

async function tmpDir(prefix: string): Promise<string> {
  return import('fs/promises').then((fs) => fs.mkdtemp(path.join(os.tmpdir(), prefix)));
}

describe('draft-create / task-init / task-finalize', () => {
  it('新建 draft；同 kind 重复则 existing', async () => {
    const root = await tmpDir('polaris-draft-');
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    const r1 = await runDraftCreate(root, 'change');
    expect(r1.exitCode).toBe(0);
    if (r1.exitCode !== 0) return;
    const r2 = await runDraftCreate(root, 'change');
    expect(r2.exitCode).toBe(1);
    if (r2.exitCode === 1) expect(r2.existing.length).toBeGreaterThan(0);
  });

  it('task-init change 写 state；finalize 重命名并 rename-active', async () => {
    const root = await tmpDir('polaris-task-');
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    await writeFile(
      path.join(root, '.polaris', 'config.yaml'),
      "lang: zh\nplatform: claude\nplugin_root: '.claude/skills/polaris'\n",
      'utf-8',
    );

    const init = await runTaskInit(root, 'change');
    expect(init.exitCode).toBe(0);
    const draftName = String(init.payload?.draft_name);
    expect(draftName.startsWith('draft-')).toBe(true);
    expect(init.payload?.kind).toBe('change');

    await runWorkflowEntry({
      op: 'append-active',
      skill: 'clarify',
      kind: 'change',
      repoRoot: root,
      taskId: draftName,
      phase: 'clarify',
      worktreePath: '',
      startedAt: '2026-07-21T00:00:00Z',
    });

    await writeFile(
      path.join(root, '.polaris', 'tasks', draftName, 'intention.md'),
      '# intention: <TBD>\n',
      'utf-8',
    );

    const fin = await runTaskFinalize(root, draftName, 'feat-abc123');
    expect(fin.exitCode).toBe(0);
    const intention = await readFile(
      path.join(root, '.polaris', 'tasks', 'feat-abc123', 'intention.md'),
      'utf-8',
    );
    expect(intention).toContain('# intention: feat-abc123');

    const stateRaw = await readFile(
      path.join(root, '.polaris', 'tasks', 'feat-abc123', 'state.yaml'),
      'utf-8',
    );
    expect(stateRaw).toContain('change_id: feat-abc123');
    expect(stateRaw).toMatch(/phase:\s*clarify/);
  });

  it('task-init requirement 须 --task-id，直建正式目录（无 draft）', async () => {
    const root = await tmpDir('polaris-req-');
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    await writeFile(
      path.join(root, '.polaris', 'config.yaml'),
      "language: zh\nplatform: claude\n",
      'utf-8',
    );

    const missing = await runTaskInit(root, 'requirement');
    expect(missing.exitCode).toBe(2);

    const init = await runTaskInit(root, 'requirement', { taskId: 'refine-user-priv' });
    expect(init.exitCode).toBe(0);
    expect(init.payload?.kind).toBe('requirement');
    expect(init.payload?.task_id).toBe('refine-user-priv');
    expect(init.payload?.draft_name).toBeUndefined();

    const stateRaw = await readFile(
      path.join(root, '.polaris', 'tasks', 'refine-user-priv', 'state.yaml'),
      'utf-8',
    );
    expect(stateRaw).toMatch(/kind:\s*requirement/);
    expect(stateRaw).toMatch(/phase:\s*discovery/);
    expect(stateRaw).toMatch(/status:\s*in_progress/);

    const again = await runTaskInit(root, 'requirement', { taskId: 'refine-user-priv' });
    expect(again.exitCode).toBe(1);
  });

  it('task-init testcase 落 testcases/ 并写 testcase_plan.md', async () => {
    const root = await tmpDir('polaris-tc-');
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    await writeFile(
      path.join(root, '.polaris', 'config.yaml'),
      "language: zh\nplatform: claude\n",
      'utf-8',
    );

    const init = await runTaskInit(root, 'testcase');
    expect(init.exitCode).toBe(0);
    const draftName = String(init.payload?.draft_name);
    expect(init.payload?.kind).toBe('testcase');

    const plan = await readFile(
      path.join(root, '.polaris', 'testcases', draftName, 'testcase_plan.md'),
      'utf-8',
    );
    expect(plan).toContain('# testcase plan:');

    const stateRaw = await readFile(
      path.join(root, '.polaris', 'testcases', draftName, 'state.yaml'),
      'utf-8',
    );
    expect(stateRaw).toMatch(/kind:\s*testcase/);
    expect(stateRaw).toMatch(/phase:\s*discovery/);
  });

  it('跨 kind 不互阻：change draft 存在时仍可 init requirement', async () => {
    const root = await tmpDir('polaris-cross-');
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    await writeFile(
      path.join(root, '.polaris', 'config.yaml'),
      "language: zh\nplatform: claude\n",
      'utf-8',
    );

    const changeInit = await runTaskInit(root, 'change');
    expect(changeInit.exitCode).toBe(0);

    const reqInit = await runTaskInit(root, 'requirement', { taskId: 'req-feature-x' });
    expect(reqInit.exitCode).toBe(0);
    expect(reqInit.payload?.kind).toBe('requirement');
    expect(reqInit.payload?.task_id).toBe('req-feature-x');

    const changeAgain = await runTaskInit(root, 'change');
    expect(changeAgain.exitCode).toBe(1);
  });

  it('draft-create 拒绝 requirement（不使用 draft）', async () => {
    const root = await tmpDir('polaris-nodraft-');
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    const r = await runDraftCreate(root, 'requirement');
    expect(r.exitCode).toBe(2);
  });
});

describe('tasks-lint', () => {
  it('缺 Documentation Sync → fail', async () => {
    const root = await tmpDir('polaris-lint-');
    const file = path.join(root, 'tasks.md');
    await writeFile(file, '## Tasks\n- [ ] do stuff\n', 'utf-8');
    const r = await runTasksLint(file);
    expect(r.pass).toBe(false);
    expect(r.violations.some((v) => v.includes('Documentation Sync'))).toBe(true);
  });

  it('合规文件通过', async () => {
    const root = await tmpDir('polaris-lint-ok-');
    const file = path.join(root, 'tasks.md');
    await writeFile(
      file,
      '## Tasks\n- [ ] implement\n\n## Documentation Sync\n- [ ] sync docs\n',
      'utf-8',
    );
    const r = await runTasksLint(file);
    expect(r.pass).toBe(true);
  });
});

describe('constitution-validity', () => {
  it('不存在 → 2；占位符 → 1；完整 → 0', async () => {
    const root = await tmpDir('polaris-const-');
    expect((await runConstitutionValidity(root)).exitCode).toBe(2);

    const p = path.join(root, 'openspec', 'memory');
    await mkdir(p, { recursive: true });
    const file = path.join(p, 'constitution.md');
    await writeFile(file, '## Core Principles\n[PLACEHOLDER]\n**Version**: 1.0\n', 'utf-8');
    expect((await runConstitutionValidity(root)).exitCode).toBe(1);

    await writeFile(file, '## Core Principles\nrule\n**Version**: 1.0\n', 'utf-8');
    expect((await runConstitutionValidity(root)).exitCode).toBe(0);
  });

  it('优先读取 config.constitution.path', async () => {
    const root = await tmpDir('polaris-const-cfg-');
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    await writeFile(
      path.join(root, '.polaris', 'config.yaml'),
      ['constitution:', '  path: custom/const.md', ''].join('\n'),
      'utf-8',
    );
    await mkdir(path.join(root, 'custom'), { recursive: true });
    await writeFile(
      path.join(root, 'custom', 'const.md'),
      '## Core Principles\nrule\n**Version**: 1.0\n',
      'utf-8',
    );
    expect((await runConstitutionValidity(root)).exitCode).toBe(0);
  });
});

describe('harness-sync / ship-cleanup', () => {
  it('无 .polaris → exit 3；有 metrics 则合回', async () => {
    const origin = await tmpDir('polaris-hs-o-');
    const wt = await tmpDir('polaris-hs-w-');
    const miss = await runHarnessSync(wt, origin, 'feat-abc123');
    expect(miss.exitCode).toBe(3);

    await mkdir(path.join(wt, '.polaris', 'metrics'), { recursive: true });
    await writeFile(path.join(wt, '.polaris', 'metrics', 'x-metrics.json'), '{}', 'utf-8');
    const ok = await runHarnessSync(wt, origin, 'feat-abc123');
    expect(ok.exitCode).toBe(0);
    expect(ok.metrics_files).toBe(1);
  });

  it('ship-cleanup 删除 active entry', async () => {
    const root = await tmpDir('polaris-ship-');
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    await runWorkflowEntry({
      op: 'append-active',
      skill: 't',
      kind: 'change',
      repoRoot: root,
      taskId: 'feat-abc123',
      phase: 'delivery',
      worktreePath: '',
      startedAt: '2026-07-21T00:00:00Z',
    });
    const r = await runDeliveryCleanup('feat-abc123', root);
    expect(r.exitCode).toBe(0);
  });
});

describe('intention-validate', () => {
  function fullIntention(): string {
    return INTENTION_REQUIRED_SECTIONS.map((h) => `${h}\n- content\n`).join('\n');
  }

  it('缺文件 → exit 1 且返回 message', async () => {
    const root = await tmpDir('polaris-iv-');
    const missingPath = path.join(root, 'missing.md');
    const r = await runIntentionValidate(missingPath);
    expect(r.exitCode).toBe(1);
    expect(r.missing).toEqual([]);
    expect(r.payload).toBeUndefined();
    expect(r.message).toContain('intention.md 不存在');
    expect(r.message).toContain(missingPath);
  });

  it('缺节 → exit 2 且 missing / payload / message 齐备', async () => {
    const root = await tmpDir('polaris-iv-miss-');
    const file = path.join(root, 'intention.md');
    await writeFile(file, '## Reframe 历程\n- x\n\n## 目标\n- y\n', 'utf-8');
    const r = await runIntentionValidate(file);
    expect(r.exitCode).toBe(2);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.missing).toContain('## 宪法对齐');
    expect(r.payload).toEqual({ missing: r.missing });
    expect(r.message).toContain('intention.md 不完整');
    expect(r.message).toContain('## 宪法对齐');
  });

  it('仅有注释的空节 → exit 2', async () => {
    const root = await tmpDir('polaris-iv-empty-');
    const file = path.join(root, 'intention.md');
    const parts = INTENTION_REQUIRED_SECTIONS.map((h) => {
      if (h === '## 前提') return `${h}\n<!-- 注释 only -->\n`;
      return `${h}\n- ok\n`;
    });
    await writeFile(file, parts.join('\n'), 'utf-8');
    const r = await runIntentionValidate(file);
    expect(r.exitCode).toBe(2);
    expect(r.missing).toContain('## 前提');
    expect(r.payload).toEqual({ missing: r.missing });
    expect(r.message).toContain('## 前提');
  });

  it('齐全非空 → exit 0', async () => {
    const root = await tmpDir('polaris-iv-ok-');
    const file = path.join(root, 'intention.md');
    await writeFile(file, fullIntention(), 'utf-8');
    const r = await runIntentionValidate(file);
    expect(r.exitCode).toBe(0);
    expect(r.missing).toEqual([]);
    expect(r.payload).toBeUndefined();
    expect(r.message).toBeUndefined();
  });
});
