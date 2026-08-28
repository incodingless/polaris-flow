/**
 * config get 命令单元测试。
 */
import path from 'path';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  configGetCommand,
  normalizeConfigLanguageId,
  resolveLanguageName,
} from '../../src/commands/config.js';

describe('config helpers', () => {
  it('normalizeConfigLanguageId 规范化为 en | zh', () => {
    expect(normalizeConfigLanguageId(undefined)).toBe('zh');
    expect(normalizeConfigLanguageId('zh-CN')).toBe('zh');
    expect(normalizeConfigLanguageId('en-US')).toBe('en');
    expect(normalizeConfigLanguageId('en')).toBe('en');
  });

  it('resolveLanguageName 返回显示名称', () => {
    expect(resolveLanguageName('zh')).toBe('中文');
    expect(resolveLanguageName('en')).toBe('English');
  });
});

describe('configGetCommand', () => {
  let stdout: string[];

  beforeEach(() => {
    stdout = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('无 config 时 language 回退 zh', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-get-'));
    await configGetCommand('language', tmpDir);
    expect(stdout.join('\n')).toBe('zh');
  });

  it('读取 config.yaml 中的 language', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-get-'));
    const polarisDir = path.join(tmpDir, '.polaris');
    await mkdir(polarisDir, { recursive: true });
    await writeFile(path.join(polarisDir, 'config.yaml'), 'language: en\n', 'utf-8');
    await configGetCommand('language', tmpDir);
    expect(stdout.join('\n')).toBe('en');
  });

  it('--json 输出 language 与 language_name', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-get-'));
    const polarisDir = path.join(tmpDir, '.polaris');
    await mkdir(polarisDir, { recursive: true });
    await writeFile(path.join(polarisDir, 'config.yaml'), 'language: en\n', 'utf-8');
    await configGetCommand('language', tmpDir, { json: true });
    const payload = JSON.parse(stdout.join('\n'));
    expect(payload).toEqual({ language: 'en', language_name: 'English' });
  });

  it('未知 key 返回 exit 2', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-config-get-'));
    await configGetCommand('workflow', tmpDir);
    expect(process.exitCode).toBe(2);
  });
});
