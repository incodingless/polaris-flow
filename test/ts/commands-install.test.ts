/**
 * commands 安装的集成单测：落盘路径与 {{SKN_SPR}} 按平台布局展开。
 */
import path from 'path';
import { access, mkdtemp, readFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';

import { installPolarisForPlatform } from '../../src/core/install.js';
import {
  COMMAND_NAME_PREFIX_PLACEHOLDER,
  resolveCommandDest,
} from '../../src/core/install/commands.js';
import { SKILL_NAME_PREFIX_PLACEHOLDER } from '../../src/core/install/skills.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const cursor = PLATFORMS.find((p) => p.id === 'cursor')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;

/** 菜单命令中引用的六个技能，按布局展开后的期望形态 */
const referencedSkills = {
  nested: [
    'polaris:coding:specify',
    'polaris:prd:discovery',
    'polaris:prd:draft',
    'polaris:prd:readiness',
    'polaris:testing:case',
    'polaris:testing:acceptance',
  ],
  flat: [
    'polaris-coding-specify',
    'polaris-prd-discovery',
    'polaris-prd-draft',
    'polaris-prd-readiness',
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
        path.join(tmpDir, '.claude/commands/polaris/flow.md'),
        'utf-8',
      );

      expect(command).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
      for (const skill of referencedSkills.nested) {
        expect(command).toContain(skill);
      }
      // 路由表编号齐全（P / R / T 三组；M 组标「暂不可用」不作断言）
      for (const code of ['P01', 'P02', 'P03', 'R01', 'R02', 'R03', 'T01', 'T02']) {
        expect(command).toContain(`**${code}**`);
      }

      // 分类子目录原样保留：coding/ prd/ maintance/
      expect(await readFile(path.join(tmpDir, '.claude/commands/polaris/coding/normal.md'), 'utf-8')).toContain(
        'polaris:coding:normal',
      );
      expect(await readFile(path.join(tmpDir, '.claude/commands/polaris/prd/readiness.md'), 'utf-8')).toContain(
        'polaris:prd:readiness',
      );
      expect(
        await readFile(path.join(tmpDir, '.claude/commands/polaris/maintance/hotfix.md'), 'utf-8'),
      ).toContain('polaris:maintance:hotfix');
    },
  );

  it('trae flat：菜单命令落盘且技能名展开为连字符分隔', { timeout: INSTALL_TIMEOUT }, async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-cmd-trae-'));
    await installPolarisForPlatform(tmpDir, trae, true, 'zh', 'project');

    const command = await readFile(path.join(tmpDir, '.trae/commands/polaris/flow.md'), 'utf-8');

    expect(command).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
    for (const skill of referencedSkills.flat) {
      expect(command).toContain(skill);
    }
    // trae 侧技能名扁平，但命令目录树与 claude 一致（分类子目录未被扁平化）
    expect(await readFile(path.join(tmpDir, '.trae/commands/polaris/coding/normal.md'), 'utf-8')).toContain(
      'polaris-coding-normal',
    );
  });

  it(
    'cursor flat：命令扁平落到 commands/ 顶层，命令名分隔符展开为连字符',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-cmd-cursor-'));
      await installPolarisForPlatform(tmpDir, cursor, true, 'zh', 'project');

      // 入口命令：Cursor CLI 只读 .cursor/commands/ 顶层 .md，故落盘为 polaris-flow.md
      const command = await readFile(path.join(tmpDir, '.cursor/commands/polaris-flow.md'), 'utf-8');
      expect(command).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
      expect(command).not.toContain(COMMAND_NAME_PREFIX_PLACEHOLDER);
      // cursor 的 skillsLayout 仍是 nested → 正文里的技能名仍展开为冒号形式
      for (const skill of referencedSkills.nested) {
        expect(command).toContain(skill);
      }
      // 命令名按 commandLayout=flat 展开为连字符
      expect(command).toContain('/polaris-flow');
      // 不得再存在 polaris 命名空间目录（对 CLI 多一层就完全读不到）
      await expect(access(path.join(tmpDir, '.cursor/commands/polaris'))).rejects.toThrow();

      // 分类子目录被扁平化为 polaris-<路径>
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-coding-normal.md'), 'utf-8'),
      ).toContain('/polaris-coding-normal');
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-prd-readiness.md'), 'utf-8'),
      ).toContain('/polaris-prd-readiness');
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-maintance-hotfix.md'), 'utf-8'),
      ).toContain('/polaris-maintance-hotfix');
    },
  );
});

describe('resolveCommandDest', () => {
  it('nested 原样保留子目录；flat 加 polaris- 前缀并以 - 连接路径段', () => {
    expect(resolveCommandDest('flow.md', 'nested')).toBe('flow.md');
    expect(resolveCommandDest('coding/normal.md', 'nested')).toBe('coding/normal.md');
    expect(resolveCommandDest('flow.md', 'flat')).toBe('polaris-flow.md');
    expect(resolveCommandDest('coding/normal.md', 'flat')).toBe('polaris-coding-normal.md');
    expect(resolveCommandDest('maintance/hotfix.md', 'flat')).toBe('polaris-maintance-hotfix.md');
    expect(resolveCommandDest('prd/readiness.md', 'flat')).toBe('polaris-prd-readiness.md');
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
