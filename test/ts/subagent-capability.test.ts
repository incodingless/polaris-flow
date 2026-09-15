/**
 * resolveSubagentCapability 与 platform-probe.md 能力列对齐单测。
 */
import { describe, expect, it } from 'vitest';

import { resolveSubagentCapability } from '../../src/core/domain/subagent-capability.js';

describe('resolveSubagentCapability', () => {
  it.each(['claude', 'codebuddy', 'cursor', 'trae', 'trae-cn'] as const)(
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
