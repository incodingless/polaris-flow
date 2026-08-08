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
import { PLATFORMS } from '../../src/core/platforms.js';

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
  it('claude nested：子 skill 进入 polaris-flow，公共内容与 hooks/agents 落盘', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-copy-claude-'));
    const result = await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');

    expect(result.skills.copied).toBeGreaterThan(0);
    expect(result.agents.copied).toBeGreaterThan(0);

    await access(path.join(tmpDir, '.claude/skills/polaris-flow/clarify/SKILL.md'));
    await access(path.join(tmpDir, '.claude/skills/polaris-flow/README.md'));
    await access(path.join(tmpDir, '.claude/skills/polaris-flow/adapters'));
    await access(path.join(tmpDir, '.claude/skills/polaris-flow/hooks/session-start.sh'));
    await access(path.join(tmpDir, '.claude/skills/polaris-flow'));
    await access(path.join(tmpDir, '.polaris'));
    await access(path.join(tmpDir, '.claude/agents/propose-review-agent.md'));
    await access(path.join(tmpDir, '.claude/agents/design-review-agent.md'));
    await access(path.join(tmpDir, '.claude/agents/plan-review-agent.md'));
    await access(path.join(tmpDir, '.claude/agents/openspec-review-agent.md'));

    const clarify = await readFile(
      path.join(tmpDir, '.claude/skills/polaris-flow/clarify/SKILL.md'),
      'utf-8',
    );
    expect(clarify).toMatch(/^name: polaris-flow:clarify$/m);
    expect(clarify).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

    const idea = await readFile(
      path.join(tmpDir, '.claude/skills/polaris-flow/idea-discovery/SKILL.md'),
      'utf-8',
    );
    expect(idea).toMatch(/^name: polaris-flow:idea-discovery$/m);
    expect(idea).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

    // 顶层 policies 注入到子技能
    await access(
      path.join(tmpDir, '.claude/skills/polaris-flow/clarify/policies/decision-point.md'),
    );
    await access(
      path.join(tmpDir, '.claude/skills/polaris-flow/clarify/policies/response-posture.md'),
    );
    const injected = await readFile(
      path.join(tmpDir, '.claude/skills/polaris-flow/clarify/policies/decision-point.md'),
      'utf-8',
    );
    expect(injected).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
  });

  it('trae flat：子 skill 为 polaris-flow-*，公共内容在 polaris-flow，name 与目录对齐', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-copy-trae-'));
    const result = await installPolarisForPlatform(tmpDir, trae, true, 'zh', 'project');

    expect(result.skills.copied).toBeGreaterThan(0);
    expect(result.agents.copied).toBeGreaterThan(0);

    await access(path.join(tmpDir, '.trae/skills/polaris-flow-clarify/SKILL.md'));
    await access(path.join(tmpDir, '.trae/skills/polaris-flow/README.md'));
    await access(path.join(tmpDir, '.trae/skills/polaris-flow/hooks/session-start.sh'));
    await expect(access(path.join(tmpDir, '.trae/skills/polaris-flow-README.md'))).rejects.toThrow();
    await access(path.join(tmpDir, '.trae/agents/propose-review-agent.md'));
    await access(path.join(tmpDir, '.trae/agents/design-review-agent.md'));
    await access(path.join(tmpDir, '.trae/agents/plan-review-agent.md'));
    await access(path.join(tmpDir, '.trae/agents/openspec-review-agent.md'));

    const clarify = await readFile(
      path.join(tmpDir, '.trae/skills/polaris-flow-clarify/SKILL.md'),
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

    await access(path.join(tmpDir, '.trae/skills/polaris-flow-clarify/policies/decision-point.md'));
    await access(
      path.join(tmpDir, '.trae/skills/polaris-flow-clarify/policies/response-posture.md'),
    );
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

    await access(path.join(tmpDir, '.claude/skills/polaris-flow/clarify/SKILL.md'));
    await expect(
      access(path.join(tmpDir, '.claude/agents/plan-review-agent.md')),
    ).rejects.toThrow();
  });
});
