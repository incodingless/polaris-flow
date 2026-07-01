import { describe, expect, it } from 'vitest';

import { resolveAction } from '../../src/commands/prompts.js';
import { runInit, type InitOptions } from '../../src/commands/init.js';

describe('resolveAction', () => {
  it('returns install when nothing exists', () => {
    expect(resolveAction(false, {})).toBe('install');
  });

  it('respects overwrite and skipExisting flags', () => {
    expect(resolveAction(true, { overwrite: true })).toBe('overwrite');
    expect(resolveAction(true, { skipExisting: true })).toBe('skip');
    expect(resolveAction(true, { yes: true })).toBe('skip');
  });
});

describe('init', () => {
  it('exports runInit with expected options shape', () => {
    expect(typeof runInit).toBe('function');

    const options: InitOptions = {
      yes: true,
      skipExisting: true,
      lang: 'en',
      json: true,
    };
    expect(options.yes).toBe(true);
  });
});
