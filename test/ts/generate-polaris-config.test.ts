/**
 * generatePolarisConfig：从 config.example.yaml 生成项目配置的单元测试。
 */
import path from 'path';
import os from 'os';
import { mkdtemp, readFile, writeFile, mkdir } from 'fs/promises';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { generatePolarisConfig } from '../../src/core/install.js';
import { getPolarisConfigPath } from '../../src/core/assets/polaris-paths.js';
import { resolveWorktreeRoot } from '../../src/core/install/layout.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

function platformById(id: string) {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown platform: ${id}`);
  return p;
}

describe('generatePolarisConfig', () => {
  it('目标不存在时从模板生成，覆盖动态字段与 layout 绝对路径', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-gen-config-'));
    const platforms = [platformById('trae'), platformById('claude')];

    await generatePolarisConfig(tmpDir, 'en', 'project', platforms, false);

    const configPath = getPolarisConfigPath(tmpDir);
    const raw = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(raw) as Record<string, unknown>;

    expect(parsed.language).toBe('en');
    expect(parsed.platforms).toEqual(['trae', 'claude']);
    expect(parsed.platform).toBeUndefined();
    expect(parsed.scope).toBe('project');
    expect(typeof parsed['install-time']).toBe('string');
    expect(String(parsed['install-time'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed['main-repo-root']).toBe(path.resolve(tmpDir));
    expect(parsed['worktree-dir']).toBe(resolveWorktreeRoot(tmpDir, 'project'));
    expect(parsed.kind).toBe('solo');
    expect(parsed.model).toBeTruthy();
    expect(raw).not.toContain('<project_root>');
    expect(raw).toContain('# 基础配置');

    const layout = parsed.layout as Record<string, unknown>;
    expect(layout.worktree).toBe(resolveWorktreeRoot(tmpDir, 'project'));
    expect(layout.openspec).toBe(path.join(path.resolve(tmpDir), 'openspec'));
    expect((layout.tasks as { root: string }).root).toBe(
      path.join(path.resolve(tmpDir), '.polaris', 'tasks'),
    );
    expect((layout.docs as { root: string }).root).toBe(
      path.join(path.resolve(tmpDir), 'docs'),
    );
  });

  it('已存在且 overwrite=false 时不改文件', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-gen-config-'));
    const configPath = getPolarisConfigPath(tmpDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    const sentinel = '# sentinel\nlanguage: "zh"\nplatforms:\n  - "trae"\n';
    await writeFile(configPath, sentinel, 'utf-8');

    await generatePolarisConfig(tmpDir, 'en', 'project', [platformById('claude')], false);

    expect(await readFile(configPath, 'utf-8')).toBe(sentinel);
  });

  it('已存在且 overwrite=true 时按模板重写动态字段', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-gen-config-'));
    const configPath = getPolarisConfigPath(tmpDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, 'language: "zh"\nkind: "old"\n', 'utf-8');

    await generatePolarisConfig(tmpDir, 'en', 'global', [platformById('cursor')], true);

    const raw = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(raw) as Record<string, unknown>;
    expect(parsed.language).toBe('en');
    expect(parsed.platforms).toEqual(['cursor']);
    expect(parsed.platform).toBeUndefined();
    expect(parsed.scope).toBe('global');
    expect(parsed['main-repo-root']).toBe(path.resolve(tmpDir));
    expect(parsed['worktree-dir']).toBe(resolveWorktreeRoot(tmpDir, 'global'));
    expect(parsed.kind).toBe('solo');
    expect(raw).not.toContain('<project_root>');
    expect(raw).toContain('# 基础配置');
  });
});
