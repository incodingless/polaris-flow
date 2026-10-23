/**
 * SessionStart 路径注入：消费 core 返回的 paths，映射为环境变量名；含能力与 probe 缓存路径。
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  formatSessionPathContext,
  toSessionRuntimeEnv,
  writeSessionSubagentProbeCache,
} from '../../src/commands/hooks/session-start.js';
import type { SessionStartPaths } from '../../src/core/hooks/session-start.js';
import { getSubagentProbeCachePath } from '../../src/core/assets/polaris-paths.js';

describe('SessionStart path injection mapping', () => {
  const corePaths: SessionStartPaths = {
    repoRoot: path.resolve('/tmp/proj'),
    platformId: 'trae',
    pluginRoot: path.join(path.resolve('/tmp/proj'), '.trae', 'skills', 'polaris'),
    contextDir: '.trae',
  };

  it('toSessionRuntimeEnv 不拼接路径，只映射字段名，并附带能力与缓存路径', () => {
    const env = toSessionRuntimeEnv(corePaths);
    expect(env.REPO_ROOT).toBe(corePaths.repoRoot);
    expect(env.PLATFORM_ID).toBe(corePaths.platformId);
    expect(env.PLUGIN_ROOT).toBe(corePaths.pluginRoot);
    expect(env.CONTEXT_DIR).toBe(corePaths.contextDir);
    expect(env.SUPPORTS_SUBAGENT).toBe('true');
    expect(env.PLATFORM_DEGRADATION).toBe('');
    expect(env.SUBAGENT_PROBE_CACHE).toBe(getSubagentProbeCachePath(corePaths.repoRoot));
  });

  it('additionalContext 含 KEY=value、能力字段与缓存摘要', () => {
    const env = toSessionRuntimeEnv(corePaths);
    const text = formatSessionPathContext(env, {
      agentsCount: 2,
      agentIds: ['a', 'b'],
    });
    expect(text).toContain('PLATFORM_ID=trae');
    expect(text).toContain('PLUGIN_ROOT=');
    expect(text).toContain('.trae');
    expect(text).toContain('skills/polaris');
    expect(text).toContain('SUPPORTS_SUBAGENT=true');
    expect(text).toContain('PLATFORM_DEGRADATION=');
    expect(text).toContain(`SUBAGENT_PROBE_CACHE=${env.SUBAGENT_PROBE_CACHE}`);
    expect(text).toContain('subagent_agents_summary=count=2; ids=a,b');
    expect(text).toMatch(/prefer that cache/i);
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

describe('writeSessionSubagentProbeCache', () => {
  it('落盘 JSON 含 probe 同构字段', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'polaris-ss-'));
    await mkdir(path.join(repo, '.agents'), { recursive: true });
    await writeFile(
      path.join(repo, '.agents', 'x.md'),
      '---\ndescription: X\n---\n',
      'utf-8',
    );
    const snap = await writeSessionSubagentProbeCache(repo, 'claude');
    expect(snap.agents).toHaveLength(1);
    const raw = JSON.parse(await readFile(getSubagentProbeCachePath(repo), 'utf-8'));
    expect(raw.platform).toBe('claude');
    expect(raw.agents[0].id).toBe('x');
    expect(raw.matched_agents).toHaveLength(1);
    expect(raw.subagent_id_found).toBe(false);
  });
});
