/**
 * Superpowers npx 回退命令：agent 必须用平台 id。
 */
import { describe, expect, it } from 'vitest';

import { buildSuperpowersInstallCommand } from '../../src/core/integrations/superpowers.js';

describe('superpowers npx fallback', () => {
  it('buildSuperpowersInstallCommand includes trae agent for project scope', () => {
    const { command, args } = buildSuperpowersInstallCommand('project', ['trae']);
    expect(command).toMatch(/npx/);
    expect(args).toContain('skills');
    expect(args).toContain('add');
    expect(args).toContain('obra/superpowers');
    expect(args).toContain('--agent');
    expect(args).toContain('trae');
    expect(args).not.toContain('Trae');
    expect(args).not.toContain('-g');
  });

  it('buildSuperpowersInstallCommand uses trae-cn id not Trae-CN display name', () => {
    const { args } = buildSuperpowersInstallCommand('project', ['trae-cn']);
    expect(args).toContain('--agent');
    expect(args).toContain('trae-cn');
    expect(args).not.toContain('Trae-CN');
  });

  it('buildSuperpowersInstallCommand adds -g for global scope', () => {
    const { args } = buildSuperpowersInstallCommand('global', ['cursor']);
    expect(args).toContain('-g');
    expect(args).toContain('cursor');
  });

  it('npx 侧带 --yes 且在包名之前（否则首次运行停在 Ok to proceed 等输入）', () => {
    const { args } = buildSuperpowersInstallCommand('project', ['trae']);
    expect(args).toContain('--yes');
    expect(args.indexOf('--yes')).toBeLessThan(args.indexOf('skills'));
    // 给 skills CLI 自己的 -y 仍要保留，别把两者混成同一个
    expect(args).toContain('-y');
    expect(args[args.length - 1]).not.toBe('-y');
  });
});
