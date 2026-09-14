/**
 * installPolarisForPlatform / skills 布局的集成单测。
 */
import path from 'path';
import { mkdtemp, access, readFile, writeFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';

import { copyPolarisSkillsForPlatform, installPolarisForPlatform } from '../../src/core/install.js';
import {
  applySkillNamePrefix,
  findSkillAssetRefViolations,
  resolveSkillNamePrefix,
  SKILL_NAME_PREFIX_PLACEHOLDER,
  validateSkillAssetsNoCrossSkillParentRefs,
} from '../../src/core/install/skills.js';
import { readAssets, type Assets } from '../../src/core/assets/manifest.js';
import { parseSkillAssetPath } from '../../src/core/assets/layout.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;

// 安装类用例会拷贝全部资产（约 200+ 文件），单测需放宽默认 5s 超时
const INSTALL_TIMEOUT = 60_000;

/**
 * 技能族解析。
 * 回归背景：2026-09-14 原型技能从 `prd/prototype*` 迁为独立族 `prototype/{generate,review}`，
 * 若 `prototype` 未登记为族，会被降级识别成「顶层叶技能 prototype」，
 * 导致两技能塌缩为同一技能根、policies 注入层级错位。
 */
describe('parseSkillAssetPath 技能族识别', () => {
  it('prototype 是技能族，其下 generate / review 各为独立叶技能', () => {
    const gen = parseSkillAssetPath('prototype/generate/SKILL.md');
    expect(gen).toEqual({ family: 'prototype', skill: 'generate', underSkill: 'SKILL.md' });

    const rev = parseSkillAssetPath('prototype/review/SKILL.md');
    expect(rev).toEqual({ family: 'prototype', skill: 'review', underSkill: 'SKILL.md' });
  });

  it('既有族不受影响；未登记目录降级为顶层叶技能', () => {
    expect(parseSkillAssetPath('coding/specify/SKILL.md')?.family).toBe('coding');
    expect(parseSkillAssetPath('prd/discovery/SKILL.md')?.family).toBe('prd');
    expect(parseSkillAssetPath('subagent-probe/SKILL.md')?.family).toBeNull();
  });
});

describe('resolveSkillNamePrefix / applySkillNamePrefix', () => {
  it('nested 用冒号，flat 用连字符', () => {
    expect(resolveSkillNamePrefix('nested')).toBe(':');
    expect(resolveSkillNamePrefix('flat')).toBe('-');
  });

  it('替换全部占位符', () => {
    const raw = `name: polaris${SKILL_NAME_PREFIX_PLACEHOLDER}flow${SKILL_NAME_PREFIX_PLACEHOLDER}specify`;
    expect(applySkillNamePrefix(raw, ':')).toBe('name: polaris:flow:specify');
    expect(applySkillNamePrefix(raw, '-')).toBe('name: polaris-flow-specify');
  });
});

describe('installPolarisForPlatform layout', () => {
  it(
    'claude nested：子 skill 进入 polaris/{coding,prd,testing}/，公共内容与 hooks/scripts 落盘',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-copy-claude-'));
      const result = await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');

      expect(result.skills.copied).toBeGreaterThan(0);

      await access(path.join(tmpDir, '.claude/skills/polaris/coding/specify/SKILL.md'));
      await access(path.join(tmpDir, '.claude/skills/polaris/prd/discovery/SKILL.md'));
      await access(path.join(tmpDir, '.claude/skills/polaris/testing/case/SKILL.md'));
      await access(path.join(tmpDir, '.claude/skills/polaris/adapters'));
      await access(path.join(tmpDir, '.claude/skills/polaris/hooks/session-start.sh'));
      await access(path.join(tmpDir, '.claude/skills/polaris/scripts/workflow-entry.sh'));
      await access(path.join(tmpDir, '.claude/skills/polaris/scripts/_polaris-cli.sh'));
      await access(path.join(tmpDir, '.polaris'));

      if (result.agents.copied > 0) {
        await access(path.join(tmpDir, '.claude/agents'));
      }

      const specify = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/coding/specify/SKILL.md'),
        'utf-8',
      );
      expect(specify).toMatch(/^name: polaris:coding:specify$/m);
      expect(specify).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const probe = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/subagent-probe/SKILL.md'),
        'utf-8',
      );
      expect(probe).toMatch(/^name: polaris:subagent-probe$/m);
      expect(probe).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      // prototype 独立族：建造 / 评审为两个独立叶技能，各自有独立名称
      const gen = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/prototype/generate/SKILL.md'),
        'utf-8',
      );
      expect(gen).toMatch(/^name: polaris:prototype:generate$/m);
      expect(gen).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const rev = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/prototype/review/SKILL.md'),
        'utf-8',
      );
      expect(rev).toMatch(/^name: polaris:prototype:review$/m);
      expect(rev).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      // policies 注入到叶技能（prototype 两技能各自收到，而非注入到族根）
      await access(
        path.join(tmpDir, '.claude/skills/polaris/coding/specify/policies/decision-point.md'),
      );
      await access(
        path.join(tmpDir, '.claude/skills/polaris/prototype/generate/policies/decision-point.md'),
      );
      await access(
        path.join(tmpDir, '.claude/skills/polaris/prototype/review/policies/decision-point.md'),
      );
      await expect(
        access(path.join(tmpDir, '.claude/skills/polaris/prototype/policies/decision-point.md')),
      ).rejects.toThrow();
    },
  );

  it(
    'trae flat：叶技能扁平为 polaris-<family>-<skill>，公共内容在 polaris',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-copy-trae-'));
      const result = await installPolarisForPlatform(tmpDir, trae, true, 'zh', 'project');

      expect(result.skills.copied).toBeGreaterThan(0);

      await access(path.join(tmpDir, '.trae/skills/polaris-coding-specify/SKILL.md'));
      await access(path.join(tmpDir, '.trae/skills/polaris-prd-discovery/SKILL.md'));
      await access(path.join(tmpDir, '.trae/skills/polaris-testing-case/SKILL.md'));
      await access(path.join(tmpDir, '.trae/skills/polaris/hooks/session-start.sh'));
      await access(path.join(tmpDir, '.trae/skills/polaris/scripts/workflow-entry.sh'));
      await access(path.join(tmpDir, '.trae/skills/polaris/scripts/_polaris-cli.sh'));
      await expect(access(path.join(tmpDir, '.trae/skills/polaris-README.md'))).rejects.toThrow();

      const specify = await readFile(
        path.join(tmpDir, '.trae/skills/polaris-coding-specify/SKILL.md'),
        'utf-8',
      );
      expect(specify).toMatch(/^name: polaris-coding-specify$/m);
      expect(specify).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const probe = await readFile(
        path.join(tmpDir, '.trae/skills/polaris-subagent-probe/SKILL.md'),
        'utf-8',
      );
      expect(probe).toMatch(/^name: polaris-subagent-probe$/m);
      expect(probe).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      // flat 布局下 prototype 两技能平铺为各自的 polaris-prototype-* 目录
      const gen = await readFile(
        path.join(tmpDir, '.trae/skills/polaris-prototype-generate/SKILL.md'),
        'utf-8',
      );
      expect(gen).toMatch(/^name: polaris-prototype-generate$/m);
      expect(gen).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const rev = await readFile(
        path.join(tmpDir, '.trae/skills/polaris-prototype-review/SKILL.md'),
        'utf-8',
      );
      expect(rev).toMatch(/^name: polaris-prototype-review$/m);
      expect(rev).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      // 族目录本身不应被当作技能安装
      await expect(access(path.join(tmpDir, '.trae/skills/polaris-prototype/SKILL.md'))).rejects.toThrow();

      await access(
        path.join(tmpDir, '.trae/skills/polaris-coding-specify/policies/decision-point.md'),
      );
      await access(
        path.join(tmpDir, '.trae/skills/polaris-prototype-generate/policies/decision-point.md'),
      );
    },
  );
});

describe('copyPolarisSkillsForPlatform', () => {
  it(
    '仅拷贝 skills/公共内容，不安装 agents',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-skills-only-'));
      const skillsDir = path.join(tmpDir, '.claude', 'skills', 'polaris');
      const asset = await readAssets('zh');
      await copyPolarisSkillsForPlatform(
        skillsDir,
        path.join(tmpDir, '.claude', 'skills'),
        'nested',
        true,
        asset,
      );

      await access(path.join(tmpDir, '.claude/skills/polaris/coding/specify/SKILL.md'));
      await access(path.join(tmpDir, '.claude/skills/polaris/scripts/workflow-entry.sh'));
      await expect(
        access(path.join(tmpDir, '.claude/agents/tasks-review-agent.md')),
      ).rejects.toThrow();
    },
  );
});

describe('validateSkillAssetsNoCrossSkillParentRefs', () => {
  function makeAssets(shortPath: string, fullPath: string): Assets {
    return {
      langDirAssets: [{ dir: 'skills', files: [{ shortPath, fullPath }] }],
      langFileAssets: [],
      sharedAssets: [],
    };
  }

  it('当前 zh 技能资产无跨技能 ../ 引用、无幽灵占位符', { timeout: INSTALL_TIMEOUT }, async () => {
    const asset = await readAssets('zh');
    const violations = await findSkillAssetRefViolations(asset);
    expect(violations).toEqual([]);
    await expect(validateSkillAssetsNoCrossSkillParentRefs(asset)).resolves.toBeUndefined();
  });

  it('跨技能 ../ 引用被检出', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-ref-cross-'));
    const fullPath = path.join(tmpDir, 'SKILL.md');
    await writeFile(fullPath, 'read_file ../specify/policies/task-split-precheck.md\n', 'utf-8');

    const violations = await findSkillAssetRefViolations(
      makeAssets('coding/tweak/SKILL.md', fullPath),
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('coding/tweak/SKILL.md');
    expect(violations[0]).toContain('../specify/policies/task-split-precheck.md');
  });

  it('跨层 ../../../../policies/ 引用被检出', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-ref-layer-'));
    const fullPath = path.join(tmpDir, 'exit-check.md');
    await writeFile(fullPath, '按 `../../../../policies/decision-point.md` 暂停\n', 'utf-8');

    const violations = await findSkillAssetRefViolations(
      makeAssets('coding/tweak/policies/exit-check.md', fullPath),
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('../../../../policies/decision-point.md');
  });

  it('技能内 ../references/ 与省略号 .../ 不误报', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-ref-within-'));
    const fullPath = path.join(tmpDir, 'four-section-review.md');
    await writeFile(
      fullPath,
      '详见 `../references/test-review-methodology.md`；路径形如 `openspec/.../tasks.md`\n',
      'utf-8',
    );

    const violations = await findSkillAssetRefViolations(
      makeAssets('coding/tasks/policies/four-section-review.md', fullPath),
    );
    expect(violations).toEqual([]);
  });

  it('幽灵占位符 {{SKILL_NAME_PREFIX}} 被检出', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-ref-ghost-'));
    const fullPath = path.join(tmpDir, 'SKILL.md');
    await writeFile(fullPath, '使用 {{SKILL_NAME_PREFIX}}tweak 技能\n', 'utf-8');

    const violations = await findSkillAssetRefViolations(
      makeAssets('coding/tweak/SKILL.md', fullPath),
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('{{SKILL_NAME_PREFIX}}');
  });
});
