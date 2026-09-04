/**
 * init / resolveAction 单元测试。
 */
import { describe, expect, it } from 'vitest';

import { resolveAction } from '../../src/commands/prompts.js';
import { runInit } from '../../src/commands/init.js';
import type { InitPromptOptions } from '../../src/commands/prompts.js';

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
