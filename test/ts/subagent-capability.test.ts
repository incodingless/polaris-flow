/**
 * resolveSubagentCapability 与 Platform.supportsSubagent 对齐单测。
 */
import { describe, expect, it } from 'vitest';

import { resolveSubagentCapability, resolveCompressionAction, normalizeHostForm } from '../../src/core/domain/platforms.js';

describe('resolveSubagentCapability', () => {
  it.each(['claude', 'cursor', 'trae', 'trae-cn'] as const)(
    '%s 支持 subagent，degradation=null',
    (id) => {
      expect(resolveSubagentCapability(id)).toEqual({
        supportsSubagent: true,
        platformDegradation: null,
      });
    },
  );

  it('qoder 强制 inline', () => {
    expect(resolveSubagentCapability('qoder')).toEqual({
      supportsSubagent: false,
      platformDegradation: 'inline',
    });
  });

  it('未登记平台 → unsupported', () => {
    expect(resolveSubagentCapability('unknown-host')).toEqual({
      supportsSubagent: false,
      platformDegradation: 'unsupported',
    });
  });

  it('空 platformId → unsupported', () => {
    expect(resolveSubagentCapability('')).toEqual({
      supportsSubagent: false,
      platformDegradation: 'unsupported',
    });
    expect(resolveSubagentCapability('   ')).toEqual({
      supportsSubagent: false,
      platformDegradation: 'unsupported',
    });
  });
});

describe('normalizeHostForm', () => {
  it('只认 ide / cli，其余一律 null', () => {
    expect(normalizeHostForm('ide')).toBe('ide');
    expect(normalizeHostForm('cli')).toBe('cli');
    expect(normalizeHostForm('')).toBeNull();
    expect(normalizeHostForm(undefined)).toBeNull();
    expect(normalizeHostForm(null)).toBeNull();
    expect(normalizeHostForm('IDE')).toBeNull();
  });
});

describe('resolveCompressionAction', () => {
  it('形态已知 → 取该形态动作', () => {
    expect(resolveCompressionAction('trae', 'cli')).toBe('输入 /compact');
    expect(resolveCompressionAction('trae', 'ide')).toContain('「压缩」按钮');
    expect(resolveCompressionAction('qoder', 'cli')).toBe('输入 /compact');
  });

  it('形态未知 → 两形态合并；描述相同则去重', () => {
    // claude 的 ide / cli 描述相同 → 去重后只剩一条
    expect(resolveCompressionAction('claude', null)).toBe(
      '输入 /compact（可带焦点，如 /compact focus on X）',
    );
    // trae 两形态不同 → 用「；或」连接
    expect(resolveCompressionAction('trae', null)).toBe('点击上下文使用率面板上的「压缩」按钮；或 输入 /compact');
  });

  it('未登记平台 → 空串', () => {
    expect(resolveCompressionAction('unknown-host', 'ide')).toBe('');
    expect(resolveCompressionAction('', 'cli')).toBe('');
  });
});
