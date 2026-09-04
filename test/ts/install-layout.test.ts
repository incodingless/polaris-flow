/**
 * install-layout 路径映射单测：覆盖 nested / flat 布局下的目标路径。
 */
import { describe, expect, it } from 'vitest';

import { PLATFORMS } from '../../src/core/domain/platforms.js';
import {
  getPluginRootRel,
  getTopLevelSkillName,
  isPackageCommonAsset,
  parseSkillAssetPath,
  resolveAgentInstallDest,
  resolveInstallDest,
  shouldSkipAsset,
} from '../../src/core/assets/layout.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;

describe('install-layout', () => {
  it('getPluginRootRel 两种 layout 均为 skills/polaris', () => {
    expect(getPluginRootRel(claude, 'project')).toBe('.claude/skills/polaris');
    expect(getPluginRootRel(trae, 'project')).toBe('.trae/skills/polaris');
  });

  it('shouldSkipAsset 跳过 backup / requirements-engineering', () => {
    expect(shouldSkipAsset('skills/backup/prd-draft-v0.1/SKILL.md')).toBe(true);
    expect(shouldSkipAsset('skills/requirements-engineering/prd-draft/SKILL.md')).toBe(true);
    expect(shouldSkipAsset('skills/coding/clarify/SKILL.md')).toBe(false);
  });

  it('isPackageCommonAsset 识别公共内容', () => {
    expect(isPackageCommonAsset('adapters/hook-registration.md')).toBe(true);
    expect(isPackageCommonAsset('policies/decision-point.md')).toBe(true);
    expect(isPackageCommonAsset('templates/intention-template.md')).toBe(true);
    expect(isPackageCommonAsset('hooks/session-start.sh')).toBe(true);
    expect(isPackageCommonAsset('scripts/get-language-name.sh')).toBe(true);
    expect(isPackageCommonAsset('skills/hard-stops.md')).toBe(true);
    expect(isPackageCommonAsset('skills/coding/clarify/SKILL.md')).toBe(false);
  });

  it('parseSkillAssetPath / getTopLevelSkillName 解析族与叶技能', () => {
    expect(parseSkillAssetPath('coding/clarify/SKILL.md')).toEqual({
      family: 'coding',
      skill: 'clarify',
      underSkill: 'SKILL.md',
    });
    expect(parseSkillAssetPath('subagent-probe/SKILL.md')).toEqual({
      family: null,
      skill: 'subagent-probe',
      underSkill: 'SKILL.md',
    });
    expect(getTopLevelSkillName('skills/coding/clarify/SKILL.md')).toBe('clarify');
    expect(getTopLevelSkillName('skills/hard-stops.md')).toBeNull();
  });

  it('nested：族技能进入 polaris/<family>/<skill>', () => {
    expect(resolveInstallDest('skills/coding/clarify/SKILL.md', claude)).toBe(
      '.claude/skills/polaris/coding/clarify/SKILL.md',
    );
    expect(resolveInstallDest('skills/prd/discovery/SKILL.md', claude)).toBe(
      '.claude/skills/polaris/prd/discovery/SKILL.md',
    );
    expect(resolveInstallDest('skills/subagent-probe/SKILL.md', claude)).toBe(
      '.claude/skills/polaris/subagent-probe/SKILL.md',
    );
    expect(resolveInstallDest('adapters/command-registration.md', claude)).toBe(
      '.claude/skills/polaris/adapters/command-registration.md',
    );
    expect(resolveInstallDest('hooks/session-start.sh', claude)).toBe(
      '.claude/skills/polaris/hooks/session-start.sh',
    );
    expect(resolveInstallDest('scripts/workflow-entry.sh', claude)).toBe(
      '.claude/skills/polaris/scripts/workflow-entry.sh',
    );
    expect(resolveInstallDest('skills/hard-stops.md', claude)).toBe(
      '.claude/skills/polaris/hard-stops.md',
    );
  });

  it('flat：叶技能扁平为 polaris-<family>-<skill>，公共内容仍在 plugin_root', () => {
    expect(resolveInstallDest('skills/coding/clarify/SKILL.md', trae)).toBe(
      '.trae/skills/polaris-coding-clarify/SKILL.md',
    );
    expect(resolveInstallDest('skills/coding/verify/policies/constitution-audit.md', trae)).toBe(
      '.trae/skills/polaris-coding-verify/policies/constitution-audit.md',
    );
    expect(resolveInstallDest('skills/prd/discovery/SKILL.md', trae)).toBe(
      '.trae/skills/polaris-prd-discovery/SKILL.md',
    );
    expect(resolveInstallDest('adapters/hook-registration.md', trae)).toBe(
      '.trae/skills/polaris/adapters/hook-registration.md',
    );
    expect(resolveInstallDest('skills/hard-stops.md', trae)).toBe(
      '.trae/skills/polaris/hard-stops.md',
    );
  });

  it('resolveInstallDest 对 backup 返回 null', () => {
    expect(resolveInstallDest('skills/backup/prd-draft-v0.1/SKILL.md', claude)).toBeNull();
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
