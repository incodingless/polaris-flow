/**
 * agent 工具映射与安装时 frontmatter 改写单测。
 */
import path from 'path';
import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';

import {
  copyPolarisAgents,
  mapAgentTools,
  rewriteAgentFrontmatter,
} from '../../src/core/install/agents.js';
import { installPolarisForPlatform } from '../../src/core/install.js';
import { readAssets } from '../../src/core/assets/manifest.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';
import { getPolarisConfigPath } from '../../src/core/assets/polaris-paths.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const cursor = PLATFORMS.find((p) => p.id === 'cursor')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;
const traeCn = PLATFORMS.find((p) => p.id === 'trae-cn')!;

describe('mapAgentTools', () => {
  it('claude：Read→read，Grep→grep', () => {
    expect(mapAgentTools(claude, 'Read, Grep, Glob')).toBe('glob, grep, read');
  });

  it('cursor：保持 PascalCase 名', () => {
    expect(mapAgentTools(cursor, 'Read, Grep, Glob')).toBe('Glob, Grep, Read');
  });

  it('trae：已知工具名保持', () => {
    expect(mapAgentTools(trae, 'Read, Grep, Glob')).toBe('Glob, Grep, Read');
  });
});

describe('rewriteAgentFrontmatter', () => {
  it('只替换 tools / model 行', () => {
    const raw = `---
name: x
tools: Read, Glob
model: DeepSeek-V4-Flash
enabled: true
---

body uses Read still
`;
    const out = rewriteAgentFrontmatter(raw, 'Read, Glob', 'inherit');
    expect(out).toContain('tools: Read, Glob');
    expect(out).toContain('model: inherit');
    expect(out).toContain('body uses Read still');
  });
});

describe('copyPolarisAgents / installPolarisForPlatform agent rewrite', () => {
  it('claude 落盘：tools 映射 + model.review 来自 config', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-agents-claude-'));
    await mkdir(path.join(tmpDir, '.polaris'), { recursive: true });
    await writeFile(
      getPolarisConfigPath(tmpDir),
      ['language: zh', 'model:', '  review: Test-Review-Model', ''].join('\n'),
      'utf-8',
    );

    const result = await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');
    expect(result.agents.copied).toBeGreaterThan(0);

    const text = await readFile(
      path.join(tmpDir, '.claude/agents/propose-reviewer.md'),
      'utf-8',
    );
    expect(text).toMatch(/^model: Test-Review-Model$/m);
    expect(text).toMatch(/^tools:/m);
  });

  it('trae-cn：落盘到 contextDir agents，model.review 来自 config', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-agents-trae-cn-'));
    await mkdir(path.join(tmpDir, '.polaris'), { recursive: true });
    await writeFile(
      getPolarisConfigPath(tmpDir),
      ['language: zh', 'model:', '  review: Review-Only-Model', ''].join('\n'),
      'utf-8',
    );

    const result = await installPolarisForPlatform(tmpDir, traeCn, true, 'zh', 'project');
    expect(result.agents.copied).toBeGreaterThan(0);

    const text = await readFile(
      path.join(tmpDir, '.trae/agents/openspec-review-agent.md'),
      'utf-8',
    );
    expect(text).toMatch(/^model: Review-Only-Model$/m);
  });

  it('overwrite=false 时跳过已存在 agent', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-agents-skip-'));
    const agentsDir = path.join(tmpDir, '.claude', 'agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, 'propose-reviewer.md'), 'stale\n', 'utf-8');

    const asset = await readAssets('zh');
    const stats = await copyPolarisAgents(tmpDir, agentsDir, false, asset, claude);
    expect(stats.skipped).toBeGreaterThan(0);

    const text = await readFile(path.join(agentsDir, 'propose-reviewer.md'), 'utf-8');
    expect(text).toBe('stale\n');
  });
});
