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

  it('toSessionRuntimeEnv 不拼接路径，只映射字段名', () => {
    const env = toSessionRuntimeEnv(corePaths);
    expect(env.REPO_ROOT).toBe(corePaths.repoRoot);
    expect(env.PLATFORM_ID).toBe(corePaths.platformId);
    expect(env.PLUGIN_ROOT).toBe(corePaths.pluginRoot);
    expect(env.CONTEXT_DIR).toBe(corePaths.contextDir);
  });

  it('additionalContext 含 KEY=value', () => {
    const text = formatSessionPathContext(toSessionRuntimeEnv(corePaths));
    expect(text).toContain('PLATFORM_ID=trae');
    expect(text).toContain('PLUGIN_ROOT=');
    expect(text).toContain('.trae');
    expect(text).toContain('skills/polaris');
  });
});
