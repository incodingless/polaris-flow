/**
 * installPolarisForPlatform / skills 布局的集成单测。
 */
import path from 'path';
import { mkdtemp, access, readFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';

import { copyPolarisSkillsForPlatform, installPolarisForPlatform } from '../../src/core/install.js';
import {
  applySkillNamePrefix,
  resolveSkillNamePrefix,
  SKILL_NAME_PREFIX_PLACEHOLDER,
} from '../../src/core/install/skills.js';
import { readAssets } from '../../src/core/assets/manifest.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;

describe('resolveSkillNamePrefix / applySkillNamePrefix', () => {
  it('nested 用冒号，flat 用连字符', () => {
    expect(resolveSkillNamePrefix('nested')).toBe(':');
    expect(resolveSkillNamePrefix('flat')).toBe('-');
  });

  it('替换全部占位符', () => {
    const raw = `name: polaris${SKILL_NAME_PREFIX_PLACEHOLDER}flow${SKILL_NAME_PREFIX_PLACEHOLDER}clarify`;
    expect(applySkillNamePrefix(raw, ':')).toBe('name: polaris:flow:clarify');
    expect(applySkillNamePrefix(raw, '-')).toBe('name: polaris-flow-clarify');
  });
});

describe('installPolarisForPlatform layout', () => {
  it('claude nested：子 skill 进入 polaris/{coding,prd}/，公共内容与 hooks/scripts 落盘', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-copy-claude-'));
    const result = await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');

    expect(result.skills.copied).toBeGreaterThan(0);

    await access(path.join(tmpDir, '.claude/skills/polaris/coding/clarify/SKILL.md'));
    await access(path.join(tmpDir, '.claude/skills/polaris/prd/discovery/SKILL.md'));
    await access(path.join(tmpDir, '.claude/skills/polaris/adapters'));
    await access(path.join(tmpDir, '.claude/skills/polaris/hooks/session-start.sh'));
    await access(path.join(tmpDir, '.claude/skills/polaris/scripts/workflow-entry.sh'));
    await access(path.join(tmpDir, '.claude/skills/polaris/scripts/_polaris-cli.sh'));
    await access(path.join(tmpDir, '.polaris'));

    if (result.agents.copied > 0) {
      await access(path.join(tmpDir, '.claude/agents'));
    }

    const clarify = await readFile(
      path.join(tmpDir, '.claude/skills/polaris/coding/clarify/SKILL.md'),
      'utf-8',
    );
    expect(clarify).toMatch(/^name: polaris:flow:clarify$/m);
    expect(clarify).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

    const probe = await readFile(
      path.join(tmpDir, '.claude/skills/polaris/subagent-probe/SKILL.md'),
      'utf-8',
    );
    expect(probe).toMatch(/^name: polaris:subagent-probe$/m);
    expect(probe).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

    // policies 注入到叶技能
    await access(
      path.join(tmpDir, '.claude/skills/polaris/coding/clarify/policies/decision-point.md'),
    );
  });

  it('trae flat：叶技能扁平为 polaris-<family>-<skill>，公共内容在 polaris', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-copy-trae-'));
    const result = await installPolarisForPlatform(tmpDir, trae, true, 'zh', 'project');

    expect(result.skills.copied).toBeGreaterThan(0);

    await access(path.join(tmpDir, '.trae/skills/polaris-coding-clarify/SKILL.md'));
    await access(path.join(tmpDir, '.trae/skills/polaris-prd-discovery/SKILL.md'));
    await access(path.join(tmpDir, '.trae/skills/polaris/hooks/session-start.sh'));
    await access(path.join(tmpDir, '.trae/skills/polaris/scripts/workflow-entry.sh'));
    await access(path.join(tmpDir, '.trae/skills/polaris/scripts/_polaris-cli.sh'));
    await expect(access(path.join(tmpDir, '.trae/skills/polaris-README.md'))).rejects.toThrow();

    const clarify = await readFile(
      path.join(tmpDir, '.trae/skills/polaris-coding-clarify/SKILL.md'),
      'utf-8',
    );
    expect(clarify).toMatch(/^name: polaris-flow-clarify$/m);
    expect(clarify).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

    const probe = await readFile(
      path.join(tmpDir, '.trae/skills/polaris-subagent-probe/SKILL.md'),
      'utf-8',
    );
    expect(probe).toMatch(/^name: polaris-subagent-probe$/m);
    expect(probe).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

    await access(
      path.join(tmpDir, '.trae/skills/polaris-coding-clarify/policies/decision-point.md'),
    );
  });
});

describe('copyPolarisSkillsForPlatform', () => {
  it('仅拷贝 skills/公共内容，不安装 agents', async () => {
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

    await access(path.join(tmpDir, '.claude/skills/polaris/coding/clarify/SKILL.md'));
    await access(path.join(tmpDir, '.claude/skills/polaris/scripts/workflow-entry.sh'));
    await expect(
      access(path.join(tmpDir, '.claude/agents/plan-review-agent.md')),
    ).rejects.toThrow();
  });
});
