/**
 * SessionStart 路径注入：消费 core 返回的 paths，映射为环境变量名。
 */
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  formatSessionPathContext,
  toSessionRuntimeEnv,
} from '../../src/commands/hooks/session-start.js';
import type { SessionStartPaths } from '../../src/core/hooks/session-start.js';

describe('SessionStart path injection mapping', () => {
  const corePaths: SessionStartPaths = {
    repoRoot: path.resolve('/tmp/proj'),
    platformId: 'trae',
    pluginRoot: path.join(path.resolve('/tmp/proj'), '.trae', 'skills', 'polaris'),
    contextDir: '.trae',
  };

  it('toSessionRuntimeEnv 不拼接路径，只映射字段名，并附带能力字段', () => {
    const env = toSessionRuntimeEnv(corePaths);
    expect(env.REPO_ROOT).toBe(corePaths.repoRoot);
    expect(env.PLATFORM_ID).toBe(corePaths.platformId);
    expect(env.PLUGIN_ROOT).toBe(corePaths.pluginRoot);
    expect(env.CONTEXT_DIR).toBe(corePaths.contextDir);
    expect(env.SUPPORTS_SUBAGENT).toBe('true');
    expect(env.PLATFORM_DEGRADATION).toBe('');
  });

  it('additionalContext 含 KEY=value 与能力字段', () => {
    const text = formatSessionPathContext(toSessionRuntimeEnv(corePaths));
    expect(text).toContain('PLATFORM_ID=trae');
    expect(text).toContain('PLUGIN_ROOT=');
    expect(text).toContain('.trae');
    expect(text).toContain('skills/polaris');
    expect(text).toContain('SUPPORTS_SUBAGENT=true');
    expect(text).toContain('PLATFORM_DEGRADATION=');
    expect(text).toMatch(/skip subagent-probe/i);
  });

  it('qoder 注入 inline 能力', () => {
    const env = toSessionRuntimeEnv({ ...corePaths, platformId: 'qoder' });
    expect(env.SUPPORTS_SUBAGENT).toBe('false');
    expect(env.PLATFORM_DEGRADATION).toBe('inline');
  });

  it('未知平台注入 unsupported', () => {
    const env = toSessionRuntimeEnv({ ...corePaths, platformId: 'nope' });
    expect(env.SUPPORTS_SUBAGENT).toBe('false');
    expect(env.PLATFORM_DEGRADATION).toBe('unsupported');
  });
});
