import { describe, expect, it } from 'vitest';

import { defaultAdapter } from '../../src/core/install/command-adapters/default.js';
import { claudeAdapter } from '../../src/core/install/command-adapters/claude.js';
import { getCommandAdapter } from '../../src/core/install/command-adapters/index.js';
import { parseFrontmatter } from '../../src/core/install.js';

describe('command-adapters', () => {
  it('getCommandAdapter falls back to default for unknown platform', () => {
    expect(getCommandAdapter('unknown-platform')).toBe(defaultAdapter);
  });

  it('getCommandAdapter returns claude adapter for claude and gemini', () => {
    expect(getCommandAdapter('claude')).toBe(claudeAdapter);
    expect(getCommandAdapter('gemini')).toBe(claudeAdapter);
  });

  it('defaultAdapter converts colon triggers to dash in body', () => {
    const formatted = defaultAdapter.formatCommand({
      id: 'hotfix',
      name: 'hotfix',
      prefix: 'polaris',
      description: 'Quick fix',
      body: 'Run /polaris:hotfix in Cursor.',
    });

    expect(formatted).toContain('/polaris-hotfix');
    expect(formatted).not.toContain('/polaris:hotfix');
  });

  it('claudeAdapter preserves colon triggers in body', () => {
    const formatted = claudeAdapter.formatCommand({
      id: 'polaris',
      name: 'polaris',
      prefix: 'polaris',
      description: 'Full workflow',
      body: 'Use /polaris:polaris skill.',
    });

    expect(formatted).toContain('triggers: ["/polaris:polaris"]');
    expect(formatted).toContain('Use /polaris:polaris skill.');
  });
});

describe('parseFrontmatter', () => {
  it('extracts meta and body from markdown frontmatter', () => {
    const content = `---
name: polaris
description: Start workflow
---

Use the skill.`;

    const { meta, body } = parseFrontmatter(content);
    expect(meta.name).toBe('polaris');
    expect(meta.description).toBe('Start workflow');
    expect(body).toBe('Use the skill.');
  });
});
