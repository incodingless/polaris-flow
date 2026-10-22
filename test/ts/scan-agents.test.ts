/**
 * subagent 目录扫描与 probe 快照单测。
 */
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  applyProbeFilters,
  buildSubagentProbeSnapshot,
  getSubagentScanRelativeDirs,
  parseAgentFrontmatterHead,
  scanSubagents,
} from '../../src/core/subagent/scan-agents.js';
import { getSubagentProbeCachePath } from '../../src/core/assets/polaris-paths.js';

/**
 * 在临时 repo 写入 agent md。
 */
async function writeAgent(
  repo: string,
  relPath: string,
  body: string,
): Promise<void> {
  const abs = path.join(repo, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, body, 'utf-8');
}

describe('getSubagentScanRelativeDirs', () => {
  it('cursor 含 .agents 与 .cursor/agents', () => {
    expect(getSubagentScanRelativeDirs('cursor')).toEqual([
      '.agents',
      path.join('.cursor', 'agents'),
    ]);
  });

  it('其它支持平台仅 .agents', () => {
    expect(getSubagentScanRelativeDirs('claude')).toEqual(['.agents']);
    expect(getSubagentScanRelativeDirs('trae-cn')).toEqual(['.agents']);
  });
});

describe('parseAgentFrontmatterHead', () => {
  it('解析 description / tools / task_types', () => {
    const head = [
      '---',
      'description: Doc reviewer',
      'tools: read_file, write_file',
      'task_types: doc_review, code_review',
      '---',
    ].join('\n');
    expect(parseAgentFrontmatterHead(head)).toEqual({
      description: 'Doc reviewer',
      tools: ['read_file', 'write_file'],
      task_types: ['doc_review', 'code_review'],
    });
  });

  it('无 description → null', () => {
    expect(parseAgentFrontmatterHead('tools: read_file\n').description).toBeNull();
  });
});

describe('scanSubagents', () => {
  it('收录含 description 的 .agents/*.md，跳过无 description', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'polaris-scan-'));
    await writeAgent(
      repo,
      path.join('.agents', 'good.md'),
      '---\ndescription: Good agent\ntools: read_file\n---\n',
    );
    await writeAgent(repo, path.join('.agents', 'bad.md'), '---\ntools: read_file\n---\n');
    const agents = await scanSubagents(repo, 'claude');
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: 'good',
      path: '.agents/good.md',
      description: 'Good agent',
      tools: ['read_file'],
      source: 'directory',
      selected: false,
    });
  });

  it('cursor 目录空 → builtin 三项', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'polaris-scan-'));
    const agents = await scanSubagents(repo, 'cursor');
    expect(agents.map((a) => a.id)).toEqual(['generalPurpose', 'explore', 'shell']);
    expect(agents.every((a) => a.source === 'builtin')).toBe(true);
  });

  it('qoder 不扫，返回 []', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'polaris-scan-'));
    await writeAgent(
      repo,
      path.join('.agents', 'x.md'),
      '---\ndescription: X\n---\n',
    );
    expect(await scanSubagents(repo, 'qoder')).toEqual([]);
  });

  it('未登记平台不扫，返回 []', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'polaris-scan-'));
    expect(await scanSubagents(repo, 'nope')).toEqual([]);
  });

  it('cursor 有目录 agent 时不回退 builtin', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'polaris-scan-'));
    await writeAgent(
      repo,
      path.join('.cursor', 'agents', 'mine.md'),
      '---\ndescription: Mine\n---\n',
    );
    const agents = await scanSubagents(repo, 'cursor');
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('mine');
    expect(agents[0].source).toBe('directory');
  });
});

describe('buildSubagentProbeSnapshot / applyProbeFilters', () => {
  it('快照字段齐全，matched 默认等于 agents', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'polaris-scan-'));
    await writeAgent(
      repo,
      path.join('.agents', 'rev.md'),
      '---\ndescription: Reviewer\ntask_types: doc_review\n---\n',
    );
    const snap = await buildSubagentProbeSnapshot(repo, 'claude');
    expect(snap.platform).toBe('claude');
    expect(snap.supports_subagent).toBe(true);
    expect(snap.platform_degradation).toBeNull();
    expect(snap.agents).toHaveLength(1);
    expect(snap.matched_agents).toHaveLength(1);
    expect(snap.subagent_id_found).toBe(false);
  });

  it('applyProbeFilters：task_type 专精优先；subagent_id 命中', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'polaris-scan-'));
    await writeAgent(
      repo,
      path.join('.agents', 'spec.md'),
      '---\ndescription: Spec\ntask_types: doc_review\n---\n',
    );
    await writeAgent(
      repo,
      path.join('.agents', 'gen.md'),
      '---\ndescription: Gen\n---\n',
    );
    const snap = await buildSubagentProbeSnapshot(repo, 'claude');
    const filtered = applyProbeFilters(snap, {
      task_type: 'doc_review',
      subagent_id: 'gen',
    });
    expect(filtered.matched_agents.map((a) => a.id)).toEqual(['spec', 'gen']);
    expect(filtered.subagent_id_found).toBe(true);
    expect(filtered.agents.find((a) => a.id === 'gen')?.selected).toBe(true);
  });

  it('未知平台 snapshot degradation=unsupported', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'polaris-scan-'));
    const snap = await buildSubagentProbeSnapshot(repo, 'nope');
    expect(snap.supports_subagent).toBe(false);
    expect(snap.platform_degradation).toBe('unsupported');
    expect(snap.agents).toEqual([]);
    expect(snap.reason).toBe('unknown_platform');
  });
});

describe('getSubagentProbeCachePath', () => {
  it('落在 .polaris/.cache/subagent-probe.json', () => {
    expect(getSubagentProbeCachePath('/repo')).toBe(
      path.join('/repo', '.polaris', '.cache', 'subagent-probe.json'),
    );
  });
});
