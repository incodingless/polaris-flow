/**
 * 第三方依赖（openspec / superpowers / codegraph）版本更新判定：
 * `isConcreteVersion` 与 `resolveDepUpdateAction` 的边界 —— 决定 update 是否跳过重复安装。
 */
import { describe, expect, it } from 'vitest';

import {
  isConcreteVersion,
  resolveDepUpdateAction,
} from '../../src/core/update/dep-version.js';

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

describe('resolveDepUpdateAction', () => {
  it('版本相等时跳过，并回显已装版本', () => {
    expect(resolveDepUpdateAction('1.4.0', '1.4.0', false)).toEqual({
      kind: 'skip',
      reason: 'up-to-date',
      version: '1.4.0',
    });
  });

  it('已装版本比上游更新时也跳过（不回退）', () => {
    expect(resolveDepUpdateAction('1.5.0', '1.4.0', false)).toEqual({
      kind: 'skip',
      reason: 'up-to-date',
      version: '1.5.0',
    });
  });

  it('上游有更新时安装，并带回新版本供写 lock', () => {
    expect(resolveDepUpdateAction('1.4.0', '1.5.0', false)).toEqual({
      kind: 'install',
      version: '1.5.0',
    });
  });

  it('上游探测失败时跳过并标记 unreachable，不再静默重装', () => {
    expect(resolveDepUpdateAction('1.4.0', null, false)).toEqual({
      kind: 'skip',
      reason: 'unreachable',
      version: '1.4.0',
    });
    expect(resolveDepUpdateAction(null, null, false)).toEqual({
      kind: 'skip',
      reason: 'unreachable',
      version: null,
    });
  });

  it('上游版本不可比时按无法确认处理', () => {
    expect(resolveDepUpdateAction('1.4.0', 'HEAD', false)).toEqual({
      kind: 'skip',
      reason: 'unreachable',
      version: '1.4.0',
    });
  });

  it('已装版本缺失或是占位符时安装一次，建立可比基线', () => {
    expect(resolveDepUpdateAction(null, '4.5.0', false)).toEqual({
      kind: 'install',
      version: '4.5.0',
    });
    expect(resolveDepUpdateAction('npx-latest', '4.5.0', false)).toEqual({
      kind: 'install',
      version: '4.5.0',
    });
    expect(resolveDepUpdateAction('local', '4.5.0', false)).toEqual({
      kind: 'install',
      version: '4.5.0',
    });
  });

  it('--force 一律安装，且仍带回上游版本供回写 lock', () => {
    expect(resolveDepUpdateAction('1.5.0', '1.5.0', true)).toEqual({
      kind: 'install',
      version: '1.5.0',
    });
    // 强制重装但上游不可达时没有可回写的版本，不能伪造版本号
    expect(resolveDepUpdateAction('1.5.0', null, true)).toEqual({
      kind: 'install',
      version: null,
    });
  });
});
