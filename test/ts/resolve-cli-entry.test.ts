/**
 * resolveCliEntry 单元测试。
 */
import { describe, expect, it } from 'vitest';

import { resolveCliEntry } from '../../src/cli/resolve-entry.js';

describe('resolveCliEntry', () => {
  it('识别 polaris-flow bin', () => {
    expect(resolveCliEntry('/x/bin/polaris-flow.js')).toBe('polaris-flow');
    expect(resolveCliEntry('/x/bin/polaris-flow')).toBe('polaris-flow');
  });

  it('识别 polaris bin 与其它回退', () => {
    expect(resolveCliEntry('/x/bin/polaris.js')).toBe('polaris');
    expect(resolveCliEntry('/x/bin/polaris')).toBe('polaris');
    expect(resolveCliEntry('')).toBe('polaris');
  });
});
