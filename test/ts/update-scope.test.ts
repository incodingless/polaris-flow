/**
 * update 范围解析：framework / deps / all 三组、单依赖命中、默认范围与错误处理。
 */
import { describe, expect, it } from 'vitest';

import {
  UPDATE_TARGETS,
  isEmptyUpdatePlan,
  resolveUpdatePlan,
} from '../../src/core/update/scope.js';

const ALL_ASSETS = ['skills', 'commands', 'agents', 'rules', 'hooks'];
const ALL_DEPS = ['openspec', 'superpowers', 'codegraph'];

describe('resolveUpdatePlan', () => {
  it('不传 --only / --skip 时默认只更新 framework（程序本体 + 资产），依赖不自动更', () => {
    expect(resolveUpdatePlan()).toEqual({ program: true, assets: ALL_ASSETS, deps: [] });
  });

  it('--only framework 等价于默认范围', () => {
    expect(resolveUpdatePlan(['framework'])).toEqual(resolveUpdatePlan());
  });

  it('--only all 覆盖 framework 与全部依赖', () => {
    expect(resolveUpdatePlan(['all'])).toEqual({
      program: true,
      assets: ALL_ASSETS,
      deps: ALL_DEPS,
    });
  });

  it('--only deps 只更新第三方依赖，不碰程序本体与资产', () => {
    expect(resolveUpdatePlan(['deps'])).toEqual({ program: false, assets: [], deps: ALL_DEPS });
  });

  it('单个依赖可独立指定', () => {
    const plan = resolveUpdatePlan(['openspec']);
    expect(plan.program).toBe(false);
    expect(plan.assets).toEqual([]);
    expect(plan.deps).toEqual(['openspec']);
  });

  it('大小写与首尾空白归一', () => {
    expect(resolveUpdatePlan([' Framework ', 'FRAMEWORK'])).toEqual(resolveUpdatePlan());
  });

  it('--skip 从全量里剔除指定项', () => {
    expect(resolveUpdatePlan(undefined, ['deps'])).toEqual({
      program: true,
      assets: ALL_ASSETS,
      deps: [],
    });
    // 默认范围本就不含 deps：剔除 framework 后只剩依赖层
    expect(resolveUpdatePlan(undefined, ['framework'])).toEqual({
      program: false,
      assets: [],
      deps: ALL_DEPS,
    });
    expect(resolveUpdatePlan(undefined, ['codegraph']).deps).toEqual(
      ALL_DEPS.filter((dep) => dep !== 'codegraph'),
    );
  });

  it('--only 与 --skip 同时使用报错', () => {
    expect(() => resolveUpdatePlan(['framework'], ['deps'])).toThrow(/不能同时使用/);
  });

  it('未知项报错；资产细分（skills 等）已不再是合法项', () => {
    expect(() => resolveUpdatePlan(['skils'])).toThrow(/未知的更新项 "skils"/);
    expect(() => resolveUpdatePlan(['skills'])).toThrow(/未知的更新项 "skills"/);
    expect(() => resolveUpdatePlan(['program'])).toThrow(/未知的更新项 "program"/);
    expect(() => resolveUpdatePlan(['assets'])).toThrow(/未知的更新项 "assets"/);
  });

  it('剔除后范围为空报错', () => {
    expect(() => resolveUpdatePlan(undefined, ['all'])).toThrow(/更新范围为空/);
  });

  it('空串项忽略，等价于默认范围', () => {
    expect(resolveUpdatePlan(['', '   '])).toEqual(resolveUpdatePlan());
    expect(resolveUpdatePlan(undefined, ['', ' '])).toEqual(resolveUpdatePlan());
  });
});

describe('isEmptyUpdatePlan', () => {
  it('isEmptyUpdatePlan 判定', () => {
    expect(isEmptyUpdatePlan({ program: false, assets: [], deps: [] })).toBe(true);
    expect(isEmptyUpdatePlan({ program: true, assets: [], deps: [] })).toBe(false);
    expect(isEmptyUpdatePlan({ program: false, assets: ['skills'], deps: [] })).toBe(false);
    expect(isEmptyUpdatePlan({ program: false, assets: [], deps: ['openspec'] })).toBe(false);
  });
});

describe('UPDATE_TARGETS', () => {
  it('只含 6 个合法值：framework / deps / all + 三个依赖成员', () => {
    expect(UPDATE_TARGETS).toEqual(['framework', 'deps', 'all', ...ALL_DEPS]);
  });
});
