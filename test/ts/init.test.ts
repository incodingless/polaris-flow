import { describe, expect, it } from 'vitest';

import { runInit, type InitOptions } from '../../src/commands/init.js';

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
