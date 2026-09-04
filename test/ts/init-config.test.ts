/**
 * generatePolarisConfig / workflow 物化单测。
 */
import path from 'path';
import { mkdtemp, readFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { initPolarisConfig } from '../../src/core/install.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;

describe('initPolarisConfig', () => {
  it('layout 路径物化为绝对路径；workflow 无 version/install-time', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-cfg-'));
    await initPolarisConfig(tmp, 'zh', 'project', [claude], true);

    const configRaw = await readFile(path.join(tmp, '.polaris', 'config.yaml'), 'utf-8');
    expect(configRaw).not.toContain('<project_root>');
    const config = parseYaml(configRaw) as Record<string, unknown>;
    const layout = config.layout as Record<string, unknown>;
    expect(layout.worktree).toBe(path.join(tmp, '.worktrees'));
    expect(layout.openspec).toBe(path.join(tmp, 'openspec'));
    expect((layout.tasks as { root: string }).root).toBe(path.join(tmp, '.polaris', 'tasks'));
    expect((layout.docs as { root: string }).root).toBe(path.join(tmp, 'docs'));
    expect(config.platforms).toEqual(['claude']);
    expect(config.platform).toBeUndefined();

    const wfRaw = await readFile(path.join(tmp, '.polaris', 'workflow.yaml'), 'utf-8');
    expect(wfRaw).not.toMatch(/^version:/m);
    expect(wfRaw).not.toMatch(/^install-time:/m);
    expect(wfRaw).toContain('change_tasks:');
    expect(wfRaw).toContain('requirement_tasks:');
    expect(wfRaw).toContain('testcase_tasks:');
  });
});
