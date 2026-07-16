import { describe, expect, it } from 'vitest';

import { buildSuperpowersInstallCommand } from '../../src/core/deps/superpowers.js';

describe('superpowers npx fallback', () => {
  it('buildSuperpowersInstallCommand includes trae agent for project scope', () => {
    const { command, args } = buildSuperpowersInstallCommand('project', ['trae']);
    expect(command).toMatch(/npx/);
    expect(args).toContain('skills');
    expect(args).toContain('add');
    expect(args).toContain('obra/superpowers');
    expect(args).toContain('--agent');
    expect(args).toContain('trae');
    expect(args).not.toContain('-g');
  });

  it('buildSuperpowersInstallCommand adds -g for global scope', () => {
    const { args } = buildSuperpowersInstallCommand('global', ['cursor']);
    expect(args).toContain('-g');
    expect(args).toContain('cursor');
  });
});
