/**
 * 第三方依赖（openspec / superpowers / codegraph）版本更新判断：
 * `isConcreteVersion` 与 `hasNoVersionUpdate` 的边界 —— 决定 update 是否跳过重复安装。
 */
import { describe, expect, it } from 'vitest';

import { hasNoVersionUpdate, isConcreteVersion } from '../../src/commands/update.js';

describe('isConcreteVersion', () => {
  it('识别标准 semver 与带 v 前缀的版本', () => {
    expect(isConcreteVersion('1.4.0')).toBe(true);
    expect(isConcreteVersion('v4.5.0')).toBe(true);
    expect(isConcreteVersion('10.2.3-beta.1')).toBe(true);
  });

  it('拒绝不可比的占位符', () => {
    expect(isConcreteVersion('local')).toBe(false);
    expect(isConcreteVersion('HEAD')).toBe(false);
    expect(isConcreteVersion('npx-latest')).toBe(false);
    expect(isConcreteVersion('failed')).toBe(false);
  });
});

describe('hasNoVersionUpdate', () => {
  it('版本相等时判定无更新', () => {
    expect(hasNoVersionUpdate('1.4.0', '1.4.0')).toBe(true);
  });

  it('已装版本更新时判定无更新（latest 不新于 installed）', () => {
    expect(hasNoVersionUpdate('1.5.0', '1.4.0')).toBe(true);
  });

  it('有更新时返回 false', () => {
    expect(hasNoVersionUpdate('1.4.0', '1.5.0')).toBe(false);
    expect(hasNoVersionUpdate('4.0.0', '4.5.0')).toBe(false);
  });

  it('任一版本缺失时返回 false（不跳过，交给安装器判断）', () => {
    expect(hasNoVersionUpdate(null, '1.4.0')).toBe(false);
    expect(hasNoVersionUpdate('1.4.0', null)).toBe(false);
    expect(hasNoVersionUpdate(null, null)).toBe(false);
  });

  it('已装版本不可比时返回 false（local/HEAD 等无法确认，宁可重装）', () => {
    expect(hasNoVersionUpdate('local', '4.5.0')).toBe(false);
    expect(hasNoVersionUpdate('npx-latest', '4.5.0')).toBe(false);
  });
});
