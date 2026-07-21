import path from 'path';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import {
  createDefaultPolarisConfig,
  getConstitutionPath,
  getPolarisConfigPath,
  loadPolarisConfig,
  normalizePolarisConfig,
  patchPolarisConfig,
  resolveReviewAgentModel,
  writePolarisConfigIfMissing,
} from '../../src/core/config/polaris-config.js';

describe('polaris-config', () => {
  it('createDefaultPolarisConfig 返回预期默认值', () => {
    const config = createDefaultPolarisConfig('zh');

    expect(config.lang).toBe('zh');
    expect(config.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(config.workflow).toBe('');
    expect(config.phase).toBe('');
    expect(config.auto_transition).toBe(true);
    expect(config.context_compression).toBe('off');
    expect(config.review_mode).toBe('off');
  });

  it('createDefaultPolarisConfig 可写入 platform 与 plugin_root', () => {
    const config = createDefaultPolarisConfig('zh', {
      platform: 'claude',
      plugin_root: '.claude/skills/polaris-flow',
    });
    expect(config.platform).toBe('claude');
    expect(config.plugin_root).toBe('.claude/skills/polaris-flow');
  });

  it('writePolarisConfigIfMissing 首次写入后文件可解析', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-'));
    const written = await writePolarisConfigIfMissing(tmpDir, 'en', {
      platform: 'trae',
      plugin_root: '.trae/skills/polaris-flow',
    });

    expect(written).toBe(true);

    const configPath = getPolarisConfigPath(tmpDir);
    const raw = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(raw) as {
      lang: string;
      created_at: string;
      workflow: string;
      phase: string;
      auto_transition: boolean;
      context_compression: string;
      review_mode: string;
      platform: string;
      plugin_root: string;
    };

    expect(parsed.lang).toBe('en');
    expect(parsed.created_at).toBeTruthy();
    expect(parsed.workflow).toBe('');
    expect(parsed.phase).toBe('');
    expect(parsed.auto_transition).toBe(true);
    expect(parsed.context_compression).toBe('off');
    expect(parsed.review_mode).toBe('off');
    expect(parsed.platform).toBe('trae');
    expect(parsed.plugin_root).toBe('.trae/skills/polaris-flow');
    expect(raw).toContain('# 基础');
    expect(raw).toContain('# 工作流状态');
    expect(raw).toContain('# 功能开关');
  });

  it('writePolarisConfigIfMissing 不覆盖已有文件', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-'));
    await writePolarisConfigIfMissing(tmpDir, 'zh');

    const configPath = getPolarisConfigPath(tmpDir);
    const customContent = '# custom\nlang: en\n';
    await writeFile(configPath, customContent, 'utf-8');

    const writtenAgain = await writePolarisConfigIfMissing(tmpDir, 'zh');
    expect(writtenAgain).toBe(false);

    const after = await readFile(configPath, 'utf-8');
    expect(after).toBe(customContent);
  });

  it('loadPolarisConfig 读取已写入的配置', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-'));
    await writePolarisConfigIfMissing(tmpDir, 'zh');

    const loaded = await loadPolarisConfig(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.lang).toBe('zh');
    expect(loaded?.workflow).toBe('');
    expect(loaded?.phase).toBe('');
  });

  it('loadPolarisConfig 文件不存在时返回 null', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-'));
    const loaded = await loadPolarisConfig(tmpDir);
    expect(loaded).toBeNull();
  });

  it('normalizePolarisConfig 兼容 kebab 与旧 lang', () => {
    const normalized = normalizePolarisConfig({
      language: 'zh-CN',
      'plugin-root': '.claude/skills/polaris-flow',
      'context-compression': 'beta',
      model: { review: 'R1', challenger: 'C1' },
      constitution: { path: 'custom/constitution.md', required: true },
    });
    expect(normalized.lang).toBe('zh');
    expect(normalized.language).toBe('zh-CN');
    expect(normalized.plugin_root).toBe('.claude/skills/polaris-flow');
    expect(normalized.context_compression).toBe('beta');
    expect(normalized.model?.review).toBe('R1');
    expect(getConstitutionPath(normalized)).toBe('custom/constitution.md');
  });

  it('loadPolarisConfig 可读模板风格 kebab 文件', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-'));
    const configPath = getPolarisConfigPath(tmpDir);
    await import('fs/promises').then((fs) =>
      fs.mkdir(path.dirname(configPath), { recursive: true }),
    );
    await writeFile(
      configPath,
      [
        'language: "zh-CN"',
        'platform: claude',
        'plugin-root: ".claude/skills/polaris-flow"',
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
    expect(loaded?.plugin_root).toBe('.claude/skills/polaris-flow');
    expect(loaded?.language).toBe('zh-CN');
    expect(loaded?.lang).toBe('zh');
    expect(resolveReviewAgentModel(loaded)).toBe('GLM');
  });

  it('patchPolarisConfig 不丢未改字段', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-'));
    await writePolarisConfigIfMissing(tmpDir, 'zh', {
      platform: 'claude',
      plugin_root: '.claude/skills/polaris-flow',
    });

    const patched = await patchPolarisConfig(tmpDir, {
      phase: 'build',
      model: { review: 'R2' },
    });
    expect(patched.phase).toBe('build');
    expect(patched.platform).toBe('claude');
    expect(patched.plugin_root).toBe('.claude/skills/polaris-flow');
    expect(patched.model?.review).toBe('R2');

    const reloaded = await loadPolarisConfig(tmpDir);
    expect(reloaded?.phase).toBe('build');
    expect(reloaded?.plugin_root).toBe('.claude/skills/polaris-flow');
  });

  it('resolveReviewAgentModel 优先级正确', () => {
    expect(
      resolveReviewAgentModel({
        challenger: { model: 'A' },
        model: { challenger: 'B', review: 'C' },
      }),
    ).toBe('A');
    expect(resolveReviewAgentModel({ model: { challenger: 'B', review: 'C' } })).toBe('B');
    expect(resolveReviewAgentModel({ model: { review: 'C' } })).toBe('C');
    expect(resolveReviewAgentModel(null)).toBe('inherit');
  });
});
