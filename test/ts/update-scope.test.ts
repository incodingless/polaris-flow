/**
 * update 范围解析：组展开、成员命中、互斥与错误处理。
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
  it('不传 --only / --skip 时为全量', () => {
    const plan = resolveUpdatePlan();
    expect(plan.program).toBe(true);
    expect(plan.assets).toEqual(ALL_ASSETS);
    expect(plan.deps).toEqual(ALL_DEPS);
  });

  it('all 与默认等价', () => {
    expect(resolveUpdatePlan(['all'])).toEqual(resolveUpdatePlan());
  });

  it('组名展开为成员，且不牵连其它层', () => {
    const assets = resolveUpdatePlan(['assets']);
    expect(assets.assets).toEqual(ALL_ASSETS);
    expect(assets.program).toBe(false);
    expect(assets.deps).toEqual([]);

    const deps = resolveUpdatePlan(['deps']);
    expect(deps.deps).toEqual(ALL_DEPS);
    expect(deps.program).toBe(false);
    expect(deps.assets).toEqual([]);
  });

  it('成员名精确命中，多个成员按安装顺序归位', () => {
    const plan = resolveUpdatePlan(['agents', 'skills']);
    expect(plan.assets).toEqual(['skills', 'agents']);
    expect(plan.program).toBe(false);
    expect(plan.deps).toEqual([]);
  });

  it('大小写与空白归一，并去重', () => {
    expect(resolveUpdatePlan([' Skills ', 'SKILLS']).assets).toEqual(['skills']);
  });

  it('--skip 从全量中扣除，组名同样展开', () => {
    const plan = resolveUpdatePlan(undefined, ['deps', 'agents']);
    expect(plan.program).toBe(true);
    expect(plan.assets).toEqual(['skills', 'commands', 'rules', 'hooks']);
    expect(plan.deps).toEqual([]);
  });

  it('--skip 可只扣掉程序层', () => {
    const plan = resolveUpdatePlan(undefined, ['program']);
    expect(plan.program).toBe(false);
    expect(plan.assets).toEqual(ALL_ASSETS);
  });

  it('--only 与 --skip 同时使用报错', () => {
    expect(() => resolveUpdatePlan(['skills'], ['deps'])).toThrow(/不能同时使用/);
  });

  it('未知项报错并列出可选项', () => {
    expect(() => resolveUpdatePlan(['skils'])).toThrow(/未知的更新项 "skils"/);
    expect(() => resolveUpdatePlan(['skils'])).toThrow(/commands/);
  });

  it('全部跳过 → 空范围报错', () => {
    expect(() => resolveUpdatePlan(undefined, ['all'])).toThrow(/更新范围为空/);
  });

  it('空串与纯空白项被忽略，等同未传', () => {
    expect(resolveUpdatePlan(['', '   '])).toEqual(resolveUpdatePlan());
    expect(resolveUpdatePlan(undefined, ['', ' '])).toEqual(resolveUpdatePlan());
  });

  it('isEmptyUpdatePlan 判定', () => {
    expect(isEmptyUpdatePlan({ program: false, assets: [], deps: [] })).toBe(true);
    expect(isEmptyUpdatePlan({ program: true, assets: [], deps: [] })).toBe(false);
    expect(isEmptyUpdatePlan({ program: false, assets: ['skills'], deps: [] })).toBe(false);
  });

  it('UPDATE_TARGETS 覆盖全部组名与成员名', () => {
    for (const name of [
      'all',
      'program',
      'assets',
      'deps',
      ...ALL_ASSETS,
      ...ALL_DEPS,
    ]) {
      expect(UPDATE_TARGETS).toContain(name);
    }
  });
});
