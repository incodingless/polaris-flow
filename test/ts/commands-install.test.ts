/**
 * commands 安装的集成单测：落盘路径与 {{SKN_SPR}} 按平台布局展开。
 */
import path from 'path';
import { mkdtemp, readFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';

import { installPolarisForPlatform } from '../../src/core/install.js';
import { SKILL_NAME_PREFIX_PLACEHOLDER } from '../../src/core/install/skills.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;

/** 菜单命令中引用的五个技能，按布局展开后的期望形态 */
const referencedSkills = {
  nested: [
    'polaris:coding:clarify',
    'polaris:prd:discovery',
    'polaris:prd:draft',
    'polaris:testing:case',
    'polaris:testing:acceptance',
  ],
  flat: [
    'polaris-coding-clarify',
    'polaris-prd-discovery',
    'polaris-prd-draft',
    'polaris-testing-case',
    'polaris-testing-acceptance',
  ],
} as const;

// installPolarisForPlatform 会拷贝全部资产（约 200+ 文件），单测需放宽默认 5s 超时
const INSTALL_TIMEOUT = 60_000;

describe('installPolarisForPlatform commands', () => {
  it(
    'claude nested：菜单命令落盘且技能名展开为冒号分隔',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-cmd-claude-'));
      await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');

      const command = await readFile(
        path.join(tmpDir, '.claude/commands/polaris/polaris-flow.md'),
        'utf-8',
      );

      expect(command).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
      for (const skill of referencedSkills.nested) {
        expect(command).toContain(skill);
      }
      // 菜单七个选项齐全
      for (const code of ['P01', 'P02', 'P03', 'R01', 'R02', 'T01', 'T02']) {
        expect(command).toContain(`**${code}**`);
      }
    },
  );

  it('trae flat：菜单命令落盘且技能名展开为连字符分隔', { timeout: INSTALL_TIMEOUT }, async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-cmd-trae-'));
    await installPolarisForPlatform(tmpDir, trae, true, 'zh', 'project');

    const command = await readFile(
      path.join(tmpDir, '.trae/commands/polaris/polaris-flow.md'),
      'utf-8',
    );

    expect(command).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
    for (const skill of referencedSkills.flat) {
      expect(command).toContain(skill);
    }
  });
});

describe('testing 族技能安装', () => {
  it(
    'claude nested：testing 族叶技能进入 polaris/testing/',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-testingfam-'));
      await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');

      const caseSkill = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/testing/case/SKILL.md'),
        'utf-8',
      );
      expect(caseSkill).toMatch(/^name: polaris:testing:case$/m);
      expect(caseSkill).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const acceptanceSkill = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/testing/acceptance/SKILL.md'),
        'utf-8',
      );
      expect(acceptanceSkill).toMatch(/^name: polaris:testing:acceptance$/m);
    },
  );
});
