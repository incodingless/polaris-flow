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
 * 6. **`skillForPhase` 的语义表**（A 案的核心：游标 = 待执行阶段 ⇒ 同名映射 + 例外登记）
 *    与**写入白名单** `isWritablePhase`（原语校验的依据）
 * 7. 各 `*.example.yaml` 的阶段注释是**单一表的镜像**（不新增第二份枚举）
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  TASK_KIND_LAYOUTS,
  getKindArtifacts,
  getKindGroups,
  getKindLabel,
  getKindPhases,
  getTaskKindLayout,
  isKnownPhase,
  isWritablePhase,
  phaseGroupOf,
  phaseIndexIn,
  skillForPhase,
  writablePhaseList,
  type TaskKindLayout,
} from '../../src/core/config/task-kind-layout.js';
import { WORKFLOW_TASK_KINDS } from '../../src/core/config/workflow-state.js';
import { getTaskStateTemplateSrc } from '../../src/core/assets/manifest.js';

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

describe('skillForPhase：游标 phase → 技能名（A 案的核心语义）', () => {
  /**
   * 这条断言表是 `docs/specs/2026-09-19-phase-truth-unification-design.md` §4.1 的
   * **可执行形式**。约定只有一条：**游标 phase = 接下来要执行的阶段 ⇒ 同名映射**；
   * 例外（入口阶段 / 旁路阶段 / 技能名未对齐的族）在阶段表的 `skill` 字段上逐条登记。
   *
   * 它取代了原来那条"盯 `state-next` 里两张转移表"的护栏：那两张表已被删除，
   * 漂移的可能性也随之消失 —— 现在**只有这一份真相**。
   */
  it('非例外阶段一律同名映射（游标即待执行阶段）', () => {
    // coding：specify 是入口（见下），其余全部同名
    expect(skillForPhase('coding', 'plan')).toBe('plan');
    expect(skillForPhase('coding', 'design')).toBe('design');
    expect(skillForPhase('coding', 'tasks')).toBe('tasks');
    expect(skillForPhase('coding', 'build')).toBe('build');
    expect(skillForPhase('coding', 'verify')).toBe('verify');
    expect(skillForPhase('coding', 'ship')).toBe('ship');

    expect(skillForPhase('requirement', 'draft')).toBe('draft');
    expect(skillForPhase('requirement', 'refine')).toBe('refine');
    expect(skillForPhase('requirement', 'ship')).toBe('ship');

    // prototype：build 出口把游标置 ship，所以游标为 build 时必须跑 build
    // —— 这正是 A 案修掉的"偏移一位"（旧表 build→ship 会跳过 prototype:build）
    expect(skillForPhase('prototype', 'build')).toBe('build');
    expect(skillForPhase('prototype', 'review')).toBe('review');
    expect(skillForPhase('prototype', 'ship')).toBe('ship');

    // debug：旧表 diagnose→patch、patch→closeout、closeout→null 三段全跳
    expect(skillForPhase('debug', 'patch')).toBe('patch');
    expect(skillForPhase('debug', 'closeout')).toBe('closeout');
  });

  it('入口阶段无自动衔接（由入口命令显式进入）', () => {
    expect(skillForPhase('coding', 'specify')).toBeNull();
    expect(skillForPhase('requirement', 'discovery')).toBeNull();
    expect(skillForPhase('testcase', 'discovery')).toBeNull();
    expect(skillForPhase('prototype', 'blueprint')).toBeNull();
    expect(skillForPhase('debug', 'diagnose')).toBeNull();
  });

  it('旁路阶段无自动衔接（不在推进游标的主序列）', () => {
    expect(skillForPhase('coding', 'retro')).toBeNull();
  });

  it('testcase 全族无自动衔接 —— 技能目录名（case/acceptance）与阶段码对不上', () => {
    for (const phase of ['discovery', 'draft', 'refine', 'ship']) {
      expect(skillForPhase('testcase', phase)).toBeNull();
    }
  });

  it('idle / 空串 / 未登记值 → null（未知值不崩）', () => {
    for (const kind of WORKFLOW_TASK_KINDS) {
      expect(skillForPhase(kind, 'idle')).toBeNull();
      expect(skillForPhase(kind, '')).toBeNull();
      expect(skillForPhase(kind, '  ')).toBeNull();
      expect(skillForPhase(kind, 'nonsense')).toBeNull();
    }
  });

  it('历史别名 delivery / archive 归一到 ship（存量游标可读）', () => {
    expect(skillForPhase('coding', 'delivery')).toBe('ship');
    expect(skillForPhase('coding', 'archive')).toBe('ship');
    expect(skillForPhase('requirement', 'delivery')).toBe('ship');
    expect(skillForPhase('prototype', 'delivery')).toBe('ship');
  });

  it('六段时代遗留（triage / prescribe / prove）彻底无衔接', () => {
    for (const gone of ['triage', 'prescribe', 'prove']) {
      expect(skillForPhase('debug', gone)).toBeNull();
    }
  });

  it('每个 skill 字段登记值要么是 null、要么与本族技能目录同名（不留隐性默认）', () => {
    // skill 字段只在例外处出现；出现时必须是 null（无衔接）。
    // 将来若真要"阶段码 ≠ 技能名"的映射，这里会先红，提醒去读设计文档 §4.1 的例外清单。
    for (const kind of WORKFLOW_TASK_KINDS) {
      for (const phase of getKindPhases(kind, { includeBypass: true })) {
        if (phase.skill === undefined) continue;
        expect(phase.skill, `${kind}/${phase.code} 的 skill 只能显式为 null`).toBeNull();
      }
    }
  });
});

describe('写入白名单（原语校验的依据）', () => {
  it('已登记阶段 + idle + 历史别名都是合法写入值', () => {
    for (const kind of WORKFLOW_TASK_KINDS) {
      for (const phase of getKindPhases(kind, { includeBypass: true })) {
        expect(isWritablePhase(kind, phase.code), `${kind}/${phase.code}`).toBe(true);
      }
      expect(isWritablePhase(kind, 'idle')).toBe(true);
      expect(isWritablePhase(kind, '')).toBe(true);
      expect(isWritablePhase(kind, 'delivery')).toBe(true);
      expect(isWritablePhase(kind, 'archive')).toBe(true);
    }
  });

  it('拼错的阶段名被拒（这是 A 案 G3 的落点）', () => {
    expect(isWritablePhase('coding', 'nonsense')).toBe(false);
    expect(isWritablePhase('coding', 'buiild')).toBe(false);
    expect(isWritablePhase('debug', 'triage')).toBe(false);
    // 跨 kind 借用也非法：delivery 之外，别的族的阶段码不算数
    expect(isWritablePhase('coding', 'closeout')).toBe(false);
    expect(isWritablePhase('debug', 'specify')).toBe(false);
  });

  it('idle 不进 phases 表（不占进度分母），但白名单接受它', () => {
    for (const kind of WORKFLOW_TASK_KINDS) {
      expect(getKindPhases(kind, { includeBypass: true }).map((p) => p.code)).not.toContain('idle');
      expect(isKnownPhase(kind, 'idle')).toBe(false);
      expect(isWritablePhase(kind, 'idle')).toBe(true);
    }
  });

  it('报错信息里列出全部合法值（含 idle 与别名，便于照抄）', () => {
    const list = writablePhaseList('debug');
    for (const code of ['diagnose', 'patch', 'closeout', 'idle', 'delivery', 'archive']) {
      expect(list).toContain(code);
    }
  });
});

describe('state 模板的阶段注释是单一表的镜像（A 案 G4）', () => {
  /**
   * 各 `*.example.yaml` 的 `# 可选值:` 注释是给**写 state 的人**看的镜像，不是真相。
   * 真相在阶段表；这里只守「镜像不许出现表外值」+「主序列不许漏项」——
   * 漏项比错值更隐蔽：读注释的人会以为某阶段不存在。
   */
  /**
   * 取**顶格 `phase:` 上方最近的一条**「可选值 / 当前阶段」注释。
   *
   * 不能简单地找第一条 `# 可选值:` —— 模板里 `language` 字段也有一条
   * （`en-英文 | zh-中文`），第一条匹配会解析出 `en` 这种假值。
   */
  function parsePhaseCodes(text: string): string[] {
    const lines = text.split('\n');
    const phaseIdx = lines.findIndex((l) => /^phase:/.test(l));
    if (phaseIdx < 0) return [];
    for (let i = phaseIdx - 1; i >= 0; i--) {
      const line = lines[i]!;
      if (!/^\s*#/.test(line)) continue;
      const matched = line.match(/^\s*#\s*(?:可选值|当前阶段)\s*[:：]\s*(.+)$/);
      if (!matched) continue;
      return matched[1]!
        .split('|')
        .map((item) => item.trim().split('-')[0]?.trim() ?? '')
        .filter(Boolean);
    }
    return [];
  }

  it('每个 kind 的 state 模板都有一条可解析的阶段注释', async () => {
    for (const kind of WORKFLOW_TASK_KINDS) {
      const file = TASK_KIND_LAYOUTS[kind].stateTemplate;
      const text = await readFile(getTaskStateTemplateSrc(file), 'utf-8');
      expect(parsePhaseCodes(text).length, `${file} 缺阶段注释`).toBeGreaterThan(0);
    }
  });

  it('注释里不含表外值，且主序列一个不漏', async () => {
    for (const kind of WORKFLOW_TASK_KINDS) {
      const file = TASK_KIND_LAYOUTS[kind].stateTemplate;
      const codes = parsePhaseCodes(await readFile(getTaskStateTemplateSrc(file), 'utf-8'));

      for (const code of codes) {
        expect(isWritablePhase(kind, code), `${file} 的「${code}」不是合法阶段`).toBe(true);
      }
      for (const phase of getKindPhases(kind)) {
        expect(codes, `${file} 漏了主序列阶段「${phase.code}」`).toContain(phase.code);
      }
    }
  });

  it('workflow-template.yaml 不自持任何 phase 枚举（改指阶段表）', async () => {
    const { getWorkflowTemplateYamlSrc } = await import('../../src/core/assets/manifest.js');
    const text = await readFile(getWorkflowTemplateYamlSrc(), 'utf-8');
    // 旧版这里写死了 5 处枚举（coding / requirement ×2 / prototype / debug），
    // 其中 coding 与 debug 两处**是错的**（coding 缺 tasks 用 delivery、debug 还是六段）。
    // 断言「`phase:` 行的注释里不许出现 `|` 分隔的枚举」——只查具体几个错值会漏掉
    // 另一族正确的枚举，而正确的枚举同样是第二份真相（会与表漂移）。
    // 本条曾漏掉 requirement ×2 与 prototype ×1：设计文档的清单只列了 coding 与 debug 两处。
    const offending = text.split('\n').filter((line) => /phase:.*#.*\|/.test(line));
    expect(offending, `仍有枚举注释：\n${offending.join('\n')}`).toEqual([]);
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
