import { describe, expect, it } from 'vitest';

import { buildOpenSpecCliInstallArgs } from '../../src/core/deps/openspec.js';

describe('openspec CLI install', () => {
  it('always installs OpenSpec globally to avoid polluting target project', () => {
    expect(buildOpenSpecCliInstallArgs()).toEqual([
      'install',
      '-g',
      '@fission-ai/openspec@latest',
    ]);
  });
});
