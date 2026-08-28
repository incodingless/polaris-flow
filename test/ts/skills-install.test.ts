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
    expect(resolveSkillNamePrefix('nested')).toBe('polaris-flow:');
    expect(resolveSkillNamePrefix('flat')).toBe('polaris-flow-');
  });

  it('替换全部占位符', () => {
    const raw = `name: ${SKILL_NAME_PREFIX_PLACEHOLDER}clarify\n/{{SKILL_NAME_PREFIX}}propose`;
    expect(applySkillNamePrefix(raw, 'polaris-flow:')).toBe(
      'name: polaris-flow:clarify\n/polaris-flow:propose',
    );
    expect(applySkillNamePrefix(raw, 'polaris-flow-')).toBe(
      'name: polaris-flow-clarify\n/polaris-flow-propose',
    );
  });
});

describe('installPolarisForPlatform layout', () => {
  it('claude nested：子 skill 进入 polaris-flow，公共内容与 hooks/scripts/agents 落盘', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-copy-claude-'));
    const result = await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');

    expect(result.skills.copied).toBeGreaterThan(0);

    await access(path.join(tmpDir, '.claude/skills/polaris-flow/coding/clarify/SKILL.md'));
    await access(path.join(tmpDir, '.claude/skills/polaris-flow/adapters'));
    await access(path.join(tmpDir, '.claude/skills/polaris-flow/hooks/session-start.sh'));
    await access(path.join(tmpDir, '.claude/skills/polaris-flow/scripts/workflow-entry.sh'));
    await access(path.join(tmpDir, '.claude/skills/polaris-flow/scripts/_polaris-cli.sh'));
    await access(path.join(tmpDir, '.claude/skills/polaris-flow'));
    await access(path.join(tmpDir, '.polaris'));
    // agents 可能随资产变更增减；有安装则至少落盘到平台 agents 目录
    if (result.agents.copied > 0) {
      const agentsDir = path.join(tmpDir, '.claude/agents');
      await access(agentsDir);
    }

    const clarify = await readFile(
      path.join(tmpDir, '.claude/skills/polaris-flow/coding/clarify/SKILL.md'),
      'utf-8',
    );
    expect(clarify).toMatch(/^name: polaris-flow:clarify$/m);
    expect(clarify).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

    const probe = await readFile(
      path.join(tmpDir, '.claude/skills/polaris-flow/subagent-probe/SKILL.md'),
      'utf-8',
    );
    expect(probe).toMatch(/^name: polaris-flow:subagent-probe$/m);
    expect(probe).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

    // 顶层 policies 注入到子技能（顶层目录名 coding / subagent-probe）
    await access(
      path.join(tmpDir, '.claude/skills/polaris-flow/coding/policies/decision-point.md'),
    );
    const injected = await readFile(
      path.join(tmpDir, '.claude/skills/polaris-flow/coding/policies/decision-point.md'),
      'utf-8',
    );
    expect(injected).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
  });

  it('trae flat：顶层 skill 目录扁平为 polaris-flow-*，公共内容在 polaris-flow', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-copy-trae-'));
    const result = await installPolarisForPlatform(tmpDir, trae, true, 'zh', 'project');

    expect(result.skills.copied).toBeGreaterThan(0);

    await access(path.join(tmpDir, '.trae/skills/polaris-flow-coding/clarify/SKILL.md'));
    await access(path.join(tmpDir, '.trae/skills/polaris-flow/hooks/session-start.sh'));
    await access(path.join(tmpDir, '.trae/skills/polaris-flow/scripts/workflow-entry.sh'));
    await access(path.join(tmpDir, '.trae/skills/polaris-flow/scripts/_polaris-cli.sh'));
    await expect(access(path.join(tmpDir, '.trae/skills/polaris-flow-README.md'))).rejects.toThrow();

    const clarify = await readFile(
      path.join(tmpDir, '.trae/skills/polaris-flow-coding/clarify/SKILL.md'),
      'utf-8',
    );
    expect(clarify).toMatch(/^name: polaris-flow-clarify$/m);
    expect(clarify).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

    const probe = await readFile(
      path.join(tmpDir, '.trae/skills/polaris-flow-subagent-probe/SKILL.md'),
      'utf-8',
    );
    expect(probe).toMatch(/^name: polaris-flow-subagent-probe$/m);
    expect(probe).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

    await access(path.join(tmpDir, '.trae/skills/polaris-flow-coding/policies/decision-point.md'));
  });
});

describe('copyPolarisSkillsForPlatform', () => {
  it('仅拷贝 skills/公共内容，不安装 agents', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-skills-only-'));
    const skillsDir = path.join(tmpDir, '.claude', 'skills', 'polaris-flow');
    const asset = await readAssets('zh');
    await copyPolarisSkillsForPlatform(
      skillsDir,
      path.join(tmpDir, '.claude', 'skills'),
      'nested',
      true,
      asset,
    );

    await access(path.join(tmpDir, '.claude/skills/polaris-flow/coding/clarify/SKILL.md'));
    await access(path.join(tmpDir, '.claude/skills/polaris-flow/scripts/workflow-entry.sh'));
    await expect(
      access(path.join(tmpDir, '.claude/agents/plan-review-agent.md')),
    ).rejects.toThrow();
  });
});
