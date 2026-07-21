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
  it('新建 draft；重复则 existing', async () => {
    const root = await tmpDir('polaris-draft-');
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    const r1 = await runDraftCreate(root);
    expect(r1.exitCode).toBe(0);
    if (r1.exitCode !== 0) return;
    const r2 = await runDraftCreate(root);
    expect(r2.exitCode).toBe(1);
    if (r2.exitCode === 1) expect(r2.existing.length).toBeGreaterThan(0);
  });

  it('task-init 写 state；finalize 重命名并 rename-active', async () => {
    const root = await tmpDir('polaris-task-');
    await mkdir(path.join(root, '.polaris'), { recursive: true });
    await writeFile(
      path.join(root, '.polaris', 'config.yaml'),
      "lang: zh\nplatform: claude\nplugin_root: '.claude/skills/polaris-flow'\n",
      'utf-8',
    );

    const init = await runTaskInit(root);
    expect(init.exitCode).toBe(0);
    const draftName = String(init.payload?.draft_name);
    expect(draftName.startsWith('draft-')).toBe(true);

    await runWorkflowEntry({
      op: 'append-active',
      skill: 'clarify',
      repoRoot: root,
      changeId: draftName,
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
      repoRoot: root,
      changeId: 'feat-abc123',
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

  it('缺文件 → exit 1', async () => {
    const root = await tmpDir('polaris-iv-');
    const r = await runIntentionValidate(path.join(root, 'missing.md'));
    expect(r.exitCode).toBe(1);
  });

  it('缺节 → exit 2 且 missing 非空', async () => {
    const root = await tmpDir('polaris-iv-miss-');
    const file = path.join(root, 'intention.md');
    await writeFile(file, '## Reframe 历程\n- x\n\n## 目标\n- y\n', 'utf-8');
    const r = await runIntentionValidate(file);
    expect(r.exitCode).toBe(2);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.missing).toContain('## 宪法对齐');
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
  });

  it('齐全非空 → exit 0', async () => {
    const root = await tmpDir('polaris-iv-ok-');
    const file = path.join(root, 'intention.md');
    await writeFile(file, fullIntention(), 'utf-8');
    const r = await runIntentionValidate(file);
    expect(r.exitCode).toBe(0);
    expect(r.missing).toEqual([]);
  });
});
