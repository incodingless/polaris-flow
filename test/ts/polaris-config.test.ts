import path from 'path';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import {
  createDefaultPolarisConfig,
  getPolarisConfigPath,
  loadPolarisConfig,
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
});
