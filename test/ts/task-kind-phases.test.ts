/**
 * task-kind-layout 阶段表单测 —— **契约 §五 的守卫**。
 *
 * 为什么要这条测试：`docs/specs/2026-09-18-dashboard-api-contract.md` §五 冻结了各 kind 的
 * phase 枚举，而 Dashboard 前端（纯 JS）与后端（TS）之间**没有共享类型、没有编译期校验**。
 * 契约文档是唯一的形式化保证，本文件把契约里的枚举逐条写成断言：**任一侧漂移，这里先红。**
 *
 * 覆盖：
 * 1. 五类 kind 的阶段序列与契约 §五 逐条一致（含 coding 的 retro 旁路）
 * 2. debug 是**三阶段**（2026-09-17 合并），且 initialPhase 已修正为 diagnose
 * 3. 分组派生（旁路不进分组）与序号计算
 * 4. 未登记值不抛错（「未知值不崩」的兜底依据）
 * 5. 产物表只引用已登记阶段；debug 归档落 docs/troubleshooting（不是 .polaris/archive）
 */
import { describe, expect, it } from 'vitest';

import {
  TASK_KIND_LAYOUTS,
  getKindArtifacts,
  getKindGroups,
  getKindLabel,
  getKindPhases,
  getTaskKindLayout,
  isKnownPhase,
  phaseGroupOf,
  phaseIndexIn,
  type TaskKindLayout,
} from '../../src/core/config/task-kind-layout.js';
import { WORKFLOW_TASK_KINDS } from '../../src/core/config/workflow-state.js';
import {
  DEBUG_PHASE_TO_SKILL,
  PHASE_TO_SKILL,
} from '../../src/core/hooks/state-next.js';

/** 契约 §五 的 phase 序列（主序列，不含旁路） */
const CONTRACT_PHASES: Record<string, string[]> = {
  coding: ['specify', 'plan', 'design', 'tasks', 'build', 'verify', 'ship'],
  debug: ['diagnose', 'patch', 'closeout'],
  requirement: ['discovery', 'draft', 'refine', 'ship'],
  testcase: ['discovery', 'draft', 'refine', 'ship'],
  prototype: ['blueprint', 'build', 'review', 'ship'],
};

describe('阶段表与契约 §五 一致', () => {
  for (const kind of WORKFLOW_TASK_KINDS) {
    it(`${kind} 的 phase 序列与契约一致`, () => {
      expect(getKindPhases(kind).map((p) => p.code)).toEqual(CONTRACT_PHASES[kind]);
    });
  }

  it('每个阶段都有中文名与分组名', () => {
    for (const kind of WORKFLOW_TASK_KINDS) {
      for (const phase of getKindPhases(kind, { includeBypass: true })) {
        expect(phase.name.length).toBeGreaterThan(0);
        expect(phase.group.length).toBeGreaterThan(0);
      }
    }
  });

  it('coding 的 retro 是旁路：默认不出现，includeBypass 时出现', () => {
    expect(getKindPhases('coding').map((p) => p.code)).not.toContain('retro');
    expect(getKindPhases('coding', { includeBypass: true }).map((p) => p.code)).toContain('retro');
    // 但它是合法取值 —— 存量 state.yaml 里若出现 retro，面板不该判为未知
    expect(isKnownPhase('coding', 'retro')).toBe(true);
  });

  it('coding 的 design 标为 optional（仅 full 模式走）', () => {
    const design = getKindPhases('coding').find((p) => p.code === 'design');
    expect(design?.optional).toBe(true);
    const build = getKindPhases('coding').find((p) => p.code === 'build');
    expect(build?.optional).toBeUndefined();
  });
});

describe('debug 族是三阶段（2026-09-17 合并）', () => {
  it('恰好三个阶段，且不含六段时代的 triage/prescribe/prove', () => {
    const codes = getKindPhases('debug').map((p) => p.code);
    expect(codes).toEqual(['diagnose', 'patch', 'closeout']);
    for (const legacy of ['triage', 'prescribe', 'prove']) {
      expect(codes).not.toContain(legacy);
    }
  });

  it('initialPhase 是 diagnose，且 initPatches 写 runtime.diagnose.*', () => {
    const debug = getTaskKindLayout('debug');
    expect(debug.initialPhase).toBe('diagnose');
    expect(debug.initPatches.phase).toBe('diagnose');
    expect(Object.keys(debug.initPatches)).toContain('runtime.diagnose.status');
    expect(Object.keys(debug.initPatches)).toContain('runtime.diagnose.started_at');
    // 六段时代遗留不得残留
    expect(Object.keys(debug.initPatches).some((k) => k.includes('triage'))).toBe(false);
  });

  it('initialPhase 必须是本 kind 的合法阶段（对五类 kind 都成立）', () => {
    for (const kind of WORKFLOW_TASK_KINDS) {
      const layout = TASK_KIND_LAYOUTS[kind];
      expect(isKnownPhase(kind, layout.initialPhase)).toBe(true);
    }
  });
});

describe('分组与序号派生', () => {
  it('分组按首次出现顺序，且不含旁路分组', () => {
    expect(getKindGroups('coding')).toEqual(['澄清与方案', '实现', '收口']);
    expect(getKindGroups('debug')).toEqual(['诊断', '修复与关单']);
  });

  it('phaseGroupOf 命中返回组名，未登记返回 null', () => {
    expect(phaseGroupOf('coding', 'build')).toBe('实现');
    expect(phaseGroupOf('debug', 'closeout')).toBe('修复与关单');
    expect(phaseGroupOf('coding', 'nonsense')).toBeNull();
  });

  it('phaseIndexIn 给出主序列序号；旁路与未登记均为 -1', () => {
    expect(phaseIndexIn('coding', 'specify')).toBe(0);
    expect(phaseIndexIn('coding', 'ship')).toBe(6);
    expect(phaseIndexIn('coding', 'retro')).toBe(-1);
    expect(phaseIndexIn('debug', 'patch')).toBe(1);
    expect(phaseIndexIn('debug', 'triage')).toBe(-1);
  });
});

describe('未知值兜底（面板不得崩）', () => {
  it('isKnownPhase 对未登记值返回 false 而不抛错', () => {
    expect(isKnownPhase('coding', 'nonsense')).toBe(false);
    expect(isKnownPhase('coding', '')).toBe(false);
    expect(isKnownPhase('debug', 'proposal')).toBe(false);
  });

  it('phaseGroupOf 与 phaseIndexIn 对未登记值不抛错', () => {
    expect(() => phaseGroupOf('prototype', 'whatever')).not.toThrow();
    expect(() => phaseIndexIn('prototype', 'whatever')).not.toThrow();
  });
});

describe('产物表', () => {
  it('每条产物的 phase 都是本 kind 的合法阶段', () => {
    for (const kind of WORKFLOW_TASK_KINDS) {
      for (const artifact of getKindArtifacts(kind)) {
        expect(isKnownPhase(kind, artifact.phase)).toBe(true);
      }
    }
  });

  it('relPaths 非空，且不含指向 .polaris/archive 以外的绝对路径', () => {
    for (const kind of WORKFLOW_TASK_KINDS) {
      for (const artifact of getKindArtifacts(kind)) {
        expect(artifact.relPaths.length).toBeGreaterThan(0);
        for (const rel of artifact.relPaths) {
          expect(rel.startsWith('/')).toBe(false);
          expect(rel.includes('..')).toBe(false);
        }
      }
    }
  });

  it('coding 的复选框产物只登记一次（tasks.md 归 tasks 阶段）', () => {
    const withCheckboxes = getKindArtifacts('coding').filter((a) => a.checkboxes);
    expect(withCheckboxes).toHaveLength(1);
    expect(withCheckboxes[0]!.phase).toBe('tasks');
  });

  it('debug 的归档落 docs/troubleshooting，不用 .polaris/archive', () => {
    const debugPaths = getKindArtifacts('debug').flatMap((a) => a.relPaths);
    expect(debugPaths.some((p) => p.startsWith('docs/troubleshooting/'))).toBe(true);
    expect(debugPaths.some((p) => p.includes('.polaris/archive'))).toBe(false);
  });

  it('按 phase 过滤只返回该阶段的产物', () => {
    const planArtifacts = getKindArtifacts('coding', 'plan');
    expect(planArtifacts.length).toBeGreaterThan(0);
    expect(planArtifacts.every((a) => a.phase === 'plan')).toBe(true);
  });
});

describe('与 state-next 的 phase→skill 表互不漂移', () => {
  /**
   * `src/core/hooks/state-next.ts` 已有一份 per-kind 的 phase 知识（`PHASE_TO_SKILL` /
   * `DEBUG_PHASE_TO_SKILL`）——它是**转移表**（phase → 下一 skill），比本表的枚举**窄**：
   *   - `specify` 刻意无转移（建任务时由 task-init 直接进入，见 state-next.test.ts 的断言）
   *   - `delivery` / `archive` 是历史别名，归一到 `ship`
   * 所以这里是「子集」断言，不是相等断言。价值在于：**任何一边出现对方不认识的 phase 名，这里先红**
   * —— `triage` 那类六段时代遗留如果在 state-next 里复活，会被这条挡住。
   */
  const LEGACY_ALIASES: Record<string, string[]> = {
    coding: ['delivery', 'archive'],
    requirement: ['delivery'],
    prototype: ['delivery'],
  };

  const FAMILY_BY_KIND: Record<string, string> = {
    coding: 'coding',
    requirement: 'prd',
    testcase: 'testing',
    prototype: 'prototype',
  };

  function phaseKeysOfFamily(family: string): string[] {
    const hit = Object.entries(FAMILY_BY_KIND).find(([, f]) => f === family);
    return hit ? getKindPhases(hit[0] as never, { includeBypass: true }).map((p) => p.code) : [];
  }

  it('PHASE_TO_SKILL 的每个 key 都要么是已知 phase，要么是已登记的历史别名', () => {
    for (const [family, table] of Object.entries(PHASE_TO_SKILL)) {
      const known = new Set(phaseKeysOfFamily(family));
      const aliases = new Set(
        Object.entries(FAMILY_BY_KIND)
          .filter(([, f]) => f === family)
          .flatMap(([kind]) => LEGACY_ALIASES[kind] ?? []),
      );
      for (const key of Object.keys(table)) {
        expect(
          known.has(key) || aliases.has(key),
          `${family} 的 phase "${key}" 既不是已知阶段、也不是登记过的别名`,
        ).toBe(true);
      }
    }
  });

  it('DEBUG_PHASE_TO_SKILL 的每个 key 都是已知的 debug 阶段（且不含终结段 closeout）', () => {
    const known = new Set(getKindPhases('debug', { includeBypass: true }).map((p) => p.code));
    for (const key of Object.keys(DEBUG_PHASE_TO_SKILL)) {
      expect(known.has(key), `debug 的 phase "${key}" 不是已知阶段`).toBe(true);
    }
    // closeout 是终结段，游标随后被清除，不应有转移项
    expect(Object.keys(DEBUG_PHASE_TO_SKILL)).not.toContain('closeout');
  });

  it('两处对 debug 的阶段集合认识一致', () => {
    const fromLayout = getKindPhases('debug', { includeBypass: true })
      .map((p) => p.code)
      .sort();
    const fromStateNext = [...Object.keys(DEBUG_PHASE_TO_SKILL), 'closeout'].sort();
    expect(fromStateNext).toEqual(fromLayout);
  });
});

describe('布局表完整性', () => {
  it('五类 kind 全部就位', () => {
    expect(Object.keys(TASK_KIND_LAYOUTS).sort()).toEqual([...WORKFLOW_TASK_KINDS].sort());
  });

  it('五类 kind 的阶段数与产物数都非零', () => {
    for (const kind of WORKFLOW_TASK_KINDS) {
      const layout: TaskKindLayout = TASK_KIND_LAYOUTS[kind];
      expect(layout.phases.length).toBeGreaterThan(0);
      expect(layout.artifacts.length).toBeGreaterThan(0);
    }
  });

  it('五类 kind 都有界面显示名且互不重复（前端不再自持类型名表）', () => {
    const labels = WORKFLOW_TASK_KINDS.map((kind) => getKindLabel(kind));
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
