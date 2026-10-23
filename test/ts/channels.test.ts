/**
 * 组件安装通道配置解析：CLI flag / 环境变量 / polaris.yaml 三层优先级。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  CHANNEL_ENV_KEYS,
  parseLocalPathPair,
  parseLocalPathPairs,
  readInstallSectionFromFile,
  resolveInstallChannelConfig,
} from '../../src/core/install/channels.js';

const ALL_ENV_KEYS = [
  CHANNEL_ENV_KEYS.githubMirror,
  CHANNEL_ENV_KEYS.npmRegistry,
  ...Object.values(CHANNEL_ENV_KEYS.localPaths),
];

const EMPTY_CONFIG = { githubMirror: undefined, npmRegistry: undefined, localPaths: {} };

let tmpDir: string;
let configPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-channels-'));
  configPath = path.join(tmpDir, 'polaris.yaml');
});

afterEach(async () => {
  // 沙箱环境可能禁止删除系统临时目录（EPERM），清理尽力而为，不影响断言
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  for (const key of ALL_ENV_KEYS) delete process.env[key];
});

describe('parseLocalPathPair', () => {
  it('解析合法的 组件=目录', () => {
    expect(parseLocalPathPair('superpowers=/path/to/repo')).toEqual(['superpowers', '/path/to/repo']);
  });

  it('容忍键值两侧空格', () => {
    expect(parseLocalPathPair(' openspec = /a/b ')).toEqual(['openspec', '/a/b']);
  });

  it('未知组件返回 null', () => {
    expect(parseLocalPathPair('unknown=/a/b')).toBeNull();
  });

  it('缺少 = 或目录为空返回 null', () => {
    expect(parseLocalPathPair('openspec')).toBeNull();
    expect(parseLocalPathPair('=')).toBeNull();
    expect(parseLocalPathPair('openspec=')).toBeNull();
    expect(parseLocalPathPair('openspec=   ')).toBeNull();
  });
});

describe('parseLocalPathPairs', () => {
  it('合法项收集、非法项归入 invalid', () => {
    const { localPaths, invalid } = parseLocalPathPairs([
      'superpowers=/sp',
      'bad-entry',
      'codegraph=/cg',
    ]);
    expect(localPaths).toEqual({ superpowers: '/sp', codegraph: '/cg' });
    expect(invalid).toEqual(['bad-entry']);
  });
});

describe('readInstallSectionFromFile', () => {
  it('文件缺失 → 空配置', async () => {
    await expect(readInstallSectionFromFile(configPath)).resolves.toEqual(EMPTY_CONFIG);
  });

  it('解析 install 段（kebab 键），空值忽略、未知组件忽略', async () => {
    await writeFile(
      configPath,
      [
        'version: "0.1.0"',
        'install:',
        '  github-mirror: https://ghproxy.example',
        '  npm-registry: ""',
        '  local-paths:',
        '    openspec: /local/openspec',
        '    superpowers: ""',
        '    unknown: /ignore/me',
        '',
      ].join('\n'),
      'utf-8',
    );
    const config = await readInstallSectionFromFile(configPath);
    expect(config.githubMirror).toBe('https://ghproxy.example');
    expect(config.npmRegistry).toBeUndefined();
    expect(config.localPaths).toEqual({ openspec: '/local/openspec' });
  });

  it('损坏 yaml → 空配置不抛错', async () => {
    await writeFile(configPath, 'install: [unclosed', 'utf-8');
    await expect(readInstallSectionFromFile(configPath)).resolves.toEqual(EMPTY_CONFIG);
  });
});

describe('resolveInstallChannelConfig 优先级', () => {
  it('无任何来源 → 空配置', async () => {
    await expect(resolveInstallChannelConfig(undefined, configPath)).resolves.toEqual(EMPTY_CONFIG);
  });

  it('env 覆盖 polaris.yaml；未覆盖字段沿用文件值', async () => {
    await writeFile(
      configPath,
      'install:\n  github-mirror: https://from-file\n  local-paths:\n    openspec: /file/openspec\n',
      'utf-8',
    );
    process.env.POLARIS_GITHUB_MIRROR = 'https://from-env';
    const config = await resolveInstallChannelConfig(undefined, configPath);
    expect(config.githubMirror).toBe('https://from-env');
    expect(config.localPaths.openspec).toBe('/file/openspec');
  });

  it('CLI flag 覆盖 env；localPaths 按组件合并', async () => {
    process.env.POLARIS_GITHUB_MIRROR = 'https://from-env';
    process.env.POLARIS_SUPERPOWERS_PATH = '/env/superpowers';
    const config = await resolveInstallChannelConfig(
      { githubMirror: 'https://from-flag', localPaths: { openspec: '/flag/openspec' } },
      configPath,
    );
    expect(config.githubMirror).toBe('https://from-flag');
    expect(config.localPaths).toEqual({
      superpowers: '/env/superpowers',
      openspec: '/flag/openspec',
    });
  });
});
