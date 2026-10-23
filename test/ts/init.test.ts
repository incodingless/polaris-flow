/**
 * init / resolveAction 单元测试。
 */
import { describe, expect, it } from 'vitest';

import { resolveAction } from '../../src/commands/prompts.js';
import { classifyInitSummary, evaluateRootGuard, runInit } from '../../src/commands/init.js';
import type { InitPromptOptions } from '../../src/commands/prompts.js';
import type { InitPlatformResult } from '../../src/commands/init.js';

describe('evaluateRootGuard', () => {
  it('普通用户（uid ≠ 0）一律放行', () => {
    expect(evaluateRootGuard(501, undefined)).toBe('allow');
    expect(evaluateRootGuard(1000, '0')).toBe('allow');
  });

  it('Windows 无 getuid（undefined）放行', () => {
    expect(evaluateRootGuard(undefined, undefined)).toBe('allow');
  });

  it('root（uid = 0）默认拦截：项目文件会归属 root', () => {
    expect(evaluateRootGuard(0, undefined)).toBe('block');
    expect(evaluateRootGuard(0, '0')).toBe('block');
    expect(evaluateRootGuard(0, 'true')).toBe('block');
  });

  it('POLARIS_ALLOW_ROOT=1 是容器 / CI 的逃生舱', () => {
    expect(evaluateRootGuard(0, '1')).toBe('allow');
  });
});

describe('resolveAction', () => {
  it('不存在时一律 install', () => {
    expect(resolveAction(false, {}, 'polaris')).toBe('install');
    expect(resolveAction(false, { overwrite: true, skipExisting: true }, 'openspec')).toBe(
      'install',
    );
  });

  it('情况1：仅 overwrite → 已存在则 overwrite', () => {
    expect(resolveAction(true, { overwrite: true }, 'polaris')).toBe('overwrite');
    expect(resolveAction(true, { overwrite: true }, 'openspec')).toBe('overwrite');
    expect(resolveAction(true, { overwrite: true }, 'superpowers')).toBe('overwrite');
    expect(resolveAction(true, { overwrite: true }, 'codegraph')).toBe('overwrite');
  });

  it('情况2：仅 skip-existing → 已存在则 skip', () => {
    expect(resolveAction(true, { skipExisting: true }, 'polaris')).toBe('skip');
    expect(resolveAction(true, { skipExisting: true }, 'openspec')).toBe('skip');
    expect(resolveAction(true, { yes: true }, 'codegraph')).toBe('skip');
  });

  it('情况3：overwrite + skip-existing → Polaris overwrite，其余 skip', () => {
    const both: InitPromptOptions = { overwrite: true, skipExisting: true };
    expect(resolveAction(true, both, 'polaris')).toBe('overwrite');
    expect(resolveAction(true, both, 'openspec')).toBe('skip');
    expect(resolveAction(true, both, 'superpowers')).toBe('skip');
    expect(resolveAction(true, both, 'codegraph')).toBe('skip');
  });
});

describe('init', () => {
  it('exports runInit', () => {
    expect(typeof runInit).toBe('function');
  });
});

describe('classifyInitSummary', () => {
  const base: InitPlatformResult = {
    baseDir: '/tmp',
    platformId: 'trae-cn',
    platformName: 'Trae-CN',
    openspec: 'installed',
    superpowers: 'failed',
    polaris: 'installed',
    skills: { copied: 1, skipped: 0 },
    commands: { copied: 0, skipped: 0 },
    agents: { copied: 0, skipped: 0 },
    rules: { copied: 0, skipped: 0 },
    hooks: { installed: false },
  };

  it('Polaris 成功但 Superpowers 失败时不把平台列入平台失败', () => {
    const summary = classifyInitSummary([base]);
    expect(summary.installed.map((r) => r.platformName)).toEqual(['Trae-CN']);
    expect(summary.platformFailed).toEqual([]);
    expect(summary.superpowersFailed.map((r) => r.platformName)).toEqual(['Trae-CN']);
  });
});
