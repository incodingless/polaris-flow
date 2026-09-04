/**
 * polaris-project-config 读写与归一单测。
 */
import path from 'path';
import { mkdtemp, readFile, writeFile, mkdir } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';

import {
  createDefaultProjectPolarisConfig,
  getConstitutionPath,
  getPolarisConfigPath,
  loadPolarisConfig,
  normalizePolarisConfig,
  patchPolarisConfig,
  resolveReviewAgentModel,
  savePolarisConfig,
  writeProjectPolarisConfigIfMissing,
} from '../../src/core/config/polaris-project-config.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;

describe('polaris-project-config', () => {
  it('createDefaultProjectPolarisConfig 写入 plugin_root', () => {
    const config = createDefaultProjectPolarisConfig(
      'zh',
      [claude],
      'project',
      '/tmp/proj',
      '.claude/skills/polaris',
      '/tmp/proj/.worktrees',
      'solo',
    );
    expect(config.language).toBe('zh');
    expect(config.plugin_root).toBe('.claude/skills/polaris');
    expect(config.main_repo_root).toBe('/tmp/proj');
  });

  it('writeProjectPolarisConfigIfMissing 首次写入', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-'));
    const written = await writeProjectPolarisConfigIfMissing(
      tmpDir,
      'en',
      [claude],
      'project',
      tmpDir,
      '.claude/skills/polaris',
      path.join(tmpDir, '.worktrees'),
      'solo',
    );
    expect(written).toBe(true);
    const loaded = await loadPolarisConfig(tmpDir);
    expect(loaded?.plugin_root).toBe('.claude/skills/polaris');
  });

  it('loadPolarisConfig 文件不存在时返回 null', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-'));
    expect(await loadPolarisConfig(tmpDir)).toBeNull();
  });

  it('normalizePolarisConfig 兼容 kebab', () => {
    const normalized = normalizePolarisConfig({
      language: 'zh',
      'plugin-root': '.claude/skills/polaris',
      'context-compression': 'beta',
      model: { review: 'R1', challenger: 'C1' },
      constitution: { path: 'custom/constitution.md', required: true },
    });
    expect(normalized.plugin_root).toBe('.claude/skills/polaris');
    expect(normalized.context_compression).toBe('beta');
    expect(getConstitutionPath(normalized)).toBe('custom/constitution.md');
  });

  it('loadPolarisConfig 可读 kebab 文件', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-'));
    const configPath = getPolarisConfigPath(tmpDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      [
        'language: "zh"',
        'plugin-root: ".claude/skills/polaris"',
        'model:',
        '  review: DeepSeek',
        '  challenger: GLM',
        'constitution:',
        '  path: openspec/memory/constitution.md',
        '',
      ].join('\n'),
      'utf-8',
    );

    const loaded = await loadPolarisConfig(tmpDir);
    expect(loaded?.plugin_root).toBe('.claude/skills/polaris');
    expect(resolveReviewAgentModel(loaded)).toBe('GLM');
  });

  it('patchPolarisConfig 不丢未改字段', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-'));
    await savePolarisConfig(tmpDir, {
      language: 'zh',
      platforms: [claude],
      scope: 'project',
      main_repo_root: tmpDir,
      plugin_root: '.claude/skills/polaris',
      worktree_dir: path.join(tmpDir, '.worktrees'),
      kind: 'solo',
      install_time: new Date(),
    });

    const patched = await patchPolarisConfig(tmpDir, {
      phase: 'build',
      model: { review: 'R2' },
    });
    expect(patched.phase).toBe('build');
    expect(patched.plugin_root).toBe('.claude/skills/polaris');
    expect(patched.model?.review).toBe('R2');
  });

  it('resolveReviewAgentModel 优先级正确', () => {
    expect(
      resolveReviewAgentModel({
        language: 'zh',
        challenger: { model: 'A' },
        model: { challenger: 'B', review: 'C' },
      } as never),
    ).toBe('A');
    expect(
      resolveReviewAgentModel({
        language: 'zh',
        model: { challenger: 'B', review: 'C' },
      } as never),
    ).toBe('B');
    expect(resolveReviewAgentModel({ language: 'zh', model: { review: 'C' } } as never)).toBe('C');
    expect(resolveReviewAgentModel(null)).toBe('inherit');
  });
});
