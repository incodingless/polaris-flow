/**
 * install-layout 路径映射单测：覆盖 nested / flat 布局下的目标路径。
 */
import { describe, expect, it } from 'vitest';

import { PLATFORMS } from '../../src/core/platforms.js';
import {
  getPluginRootRel,
  getTopLevelSkillName,
  isPackageCommonAsset,
  resolveAgentInstallDest,
  resolveInstallDest,
  shouldSkipAsset,
} from '../../src/core/assets/layout.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;

describe('install-layout', () => {
  it('getPluginRootRel 两种 layout 均为 skills/polaris-flow', () => {
    expect(getPluginRootRel(claude, 'project')).toBe('.claude/skills/polaris-flow');
    expect(getPluginRootRel(trae, 'project')).toBe('.trae/skills/polaris-flow');
  });

  it('shouldSkipAsset 跳过空壳 skills/polaris', () => {
    expect(shouldSkipAsset('skills/polaris/references/x.md')).toBe(true);
    expect(shouldSkipAsset('skills/clarify/SKILL.md')).toBe(false);
  });

  it('isPackageCommonAsset 识别公共内容', () => {
    expect(isPackageCommonAsset('adapters/hook-registration.md')).toBe(true);
    expect(isPackageCommonAsset('policies/decision-point.md')).toBe(true);
    expect(isPackageCommonAsset('templates/intention-template.md')).toBe(true);
    expect(isPackageCommonAsset('hooks/session-start.sh')).toBe(true);
    expect(isPackageCommonAsset('skills/hard-stops.md')).toBe(true);
    expect(isPackageCommonAsset('skills/clarify/SKILL.md')).toBe(false);
  });

  it('getTopLevelSkillName 解析子 skill 名', () => {
    expect(getTopLevelSkillName('skills/clarify/SKILL.md')).toBe('clarify');
    expect(getTopLevelSkillName('skills/plan/SKILL.md')).toBe('plan');
    expect(getTopLevelSkillName('skills/hard-stops.md')).toBeNull();
    expect(getTopLevelSkillName('skills/polaris/references/x.md')).toBeNull();
  });

  it('nested：子 skill 进入 plugin_root', () => {
    expect(resolveInstallDest('skills/clarify/SKILL.md', claude)).toBe(
      '.claude/skills/polaris-flow/clarify/SKILL.md',
    );
    expect(resolveInstallDest('adapters/command-registration.md', claude)).toBe(
      '.claude/skills/polaris-flow/adapters/command-registration.md',
    );
    expect(resolveInstallDest('hooks/session-start.sh', claude)).toBe(
      '.claude/skills/polaris-flow/hooks/session-start.sh',
    );
    expect(resolveInstallDest('skills/hard-stops.md', claude)).toBe(
      '.claude/skills/polaris-flow/hard-stops.md',
    );
  });

  it('flat：子 skill 扁平为 polaris-flow-*，公共内容仍在 plugin_root', () => {
    expect(resolveInstallDest('skills/clarify/SKILL.md', trae)).toBe(
      '.trae/skills/polaris-flow-clarify/SKILL.md',
    );
    expect(resolveInstallDest('skills/verify/policies/constitution-audit.md', trae)).toBe(
      '.trae/skills/polaris-flow-verify/policies/constitution-audit.md',
    );
    expect(resolveInstallDest('adapters/hook-registration.md', trae)).toBe(
      '.trae/skills/polaris-flow/adapters/hook-registration.md',
    );
    expect(resolveInstallDest('skills/hard-stops.md', trae)).toBe(
      '.trae/skills/polaris-flow/hard-stops.md',
    );
  });

  it('resolveInstallDest 对空壳 polaris 返回 null', () => {
    expect(resolveInstallDest('skills/polaris/references/x.md', claude)).toBeNull();
  });

  it('resolveAgentInstallDest 落到平台 agents 目录', () => {
    expect(resolveAgentInstallDest('plan-review-agent.md', claude)).toBe(
      '.claude/agents/plan-review-agent.md',
    );
    expect(resolveAgentInstallDest('openspec-review-agent', trae)).toBe(
      '.trae/agents/openspec-review-agent.md',
    );
  });
});
