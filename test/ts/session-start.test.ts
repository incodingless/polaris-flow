/**
 * SessionStart hook / plugin presence (detect) / hook-io 单元测试。
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { createHookIo } from '../../src/core/hooks/hook-io.js';
import { findPlugin } from '../../src/core/integrations/detect.js';
import {
  createSessionId,
  injectReviewAgentModel,
  resolveReviewAgentModel,
  runSessionStart,
} from '../../src/core/hooks/session-start.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

const claudePlatform = PLATFORMS.find((p) => p.id === 'claude')!;

/** 收集 hook IO 输出的测试用 sink */
function createCaptureIo() {
  const lines = {
    ok: [] as string[],
    warn: [] as string[],
    fail: [] as string[],
    hint: [] as string[],
    tty: [] as string[],
  };
  const io = createHookIo({
    stdout: (line) => {
      lines.ok.push(line);
    },
    tty: (line) => {
      if (line.startsWith('[polaris-flow][WARN]')) lines.warn.push(line);
      else if (line.startsWith('[polaris-flow][FAIL]')) lines.fail.push(line);
      else if (line.startsWith('                  ')) lines.hint.push(line);
      else lines.tty.push(line);
    },
  });
  return { io, lines };
}

async function makeProject(opts?: {
  platform?: string;
  pluginRoot?: string;
  withConfig?: boolean;
  withPolarisDir?: boolean;
  challengerModel?: string;
  reviewModel?: string;
}): Promise<string> {
  const tmp = await import('fs/promises').then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), 'polaris-session-start-')),
  );
  const withPolaris = opts?.withPolarisDir !== false;
  const withConfig = opts?.withConfig !== false;

  if (withPolaris) {
    await mkdir(path.join(tmp, '.polaris'), { recursive: true });
  }
  if (withPolaris && withConfig) {
    const lines = [
      'lang: zh',
      `created_at: '${new Date().toISOString()}'`,
      `platform: ${opts?.platform ?? 'claude'}`,
      `plugin_root: ${opts?.pluginRoot ?? '.claude/skills/polaris'}`,
      "workflow: ''",
      "phase: ''",
      'auto_transition: true',
      'context_compression: off',
      'review_mode: off',
    ];
    if (opts?.challengerModel !== undefined) {
      lines.push('challenger:', `  model: ${opts.challengerModel}`);
    }
    if (opts?.reviewModel !== undefined) {
      lines.push('model:', `  review: ${opts.reviewModel}`);
    }
    await writeFile(path.join(tmp, '.polaris', 'config.yaml'), `${lines.join('\n')}\n`, 'utf-8');
  }
  return tmp;
}

describe('hook-io', () => {
  it('ok 走 stdout；warn/fail/hint 走注入的 tty', () => {
    const out: string[] = [];
    const tty: string[] = [];
    const io = createHookIo({
      stdout: (l) => out.push(l),
      tty: (l) => tty.push(l),
    });
    io.ok('hello');
    io.warn('w');
    io.fail('f');
    io.hint('h');
    expect(out).toEqual(['[OK] hello']);
    expect(tty[0]).toContain('[WARN]');
    expect(tty[1]).toContain('[FAIL]');
    expect(tty[2]).toContain('h');
  });
});

describe('resolveReviewAgentModel', () => {
  it('优先 challenger.model，其次 model.challenger / model.review，否则 inherit', () => {
    expect(resolveReviewAgentModel({ challenger: { model: 'A' }, model: { review: 'B' } })).toBe(
      'A',
    );
    expect(resolveReviewAgentModel({ model: { challenger: 'X', review: 'B' } })).toBe('X');
    expect(resolveReviewAgentModel({ model: { review: 'B' } })).toBe('B');
    expect(resolveReviewAgentModel({})).toBe('inherit');
    expect(resolveReviewAgentModel(null)).toBe('inherit');
  });
});

describe('createSessionId', () => {
  it('格式为 UTC 秒级时间戳 + 6 位 hex', () => {
    const id = createSessionId(new Date('2026-07-21T06:21:00.123Z'));
    expect(id).toMatch(/^2026-07-21T06:21:00-[0-9a-f]{6}$/);
  });
});

describe('plugin presence (detect)', () => {
  it('项目 skills 命中 superpowers marker', async () => {
    const tmp = await makeProject({ platform: 'claude', withConfig: true });
    const fakeHome = path.join(tmp, '_home');
    await mkdir(fakeHome, { recursive: true });
    await mkdir(path.join(tmp, '.claude', 'skills', 'brainstorming'), { recursive: true });
    await writeFile(
      path.join(tmp, '.claude', 'skills', 'brainstorming', 'SKILL.md'),
      '# x\n',
      'utf-8',
    );
    const found = await findPlugin(claudePlatform, 'superpowers', tmp, { homeDir: fakeHome });
    expect(found?.scope).toBe('project');
    expect(found?.kind).toBe('skills');
    expect(found?.path).toContain('brainstorming');
  });

  it('空项目找不到 openspec（隔离 HOME 与 PATH CLI）', async () => {
    const tmp = await makeProject({ platform: 'trae' });
    const fakeHome = path.join(tmp, '_home');
    await mkdir(fakeHome, { recursive: true });
    const traePlatform = PLATFORMS.find((p) => p.id === 'trae')!;
    const found = await findPlugin(traePlatform, 'openspec', tmp, {
      homeDir: fakeHome,
      isCommandAvailable: () => false,
    });
    expect(found).toBeNull();
  });
});

describe('runSessionStart', () => {
  it('缺 .polaris 目录 → FAIL 且 exitCode 1', async () => {
    const tmp = await makeProject({ withPolarisDir: false, withConfig: false });
    const { io, lines } = createCaptureIo();
    const result = await runSessionStart({
      projectPath: tmp,
      platformId: 'claude',
      io,
      ppid: 4242,
    });
    expect(result.failCount).toBeGreaterThan(0);
    expect(result.exitCode).toBe(1);
    expect(lines.fail.some((l) => l.includes('.polaris/'))).toBe(true);
  });

  it('补齐 .gitignore 条目、物化 workflow、写出 session 文件', async () => {
    const tmp = await makeProject({ platform: 'claude' });
    const fakeHome = path.join(tmp, '_home');
    await mkdir(fakeHome, { recursive: true });
    const pluginRoot = path.join(tmp, '.claude', 'skills', 'polaris');
    await mkdir(path.join(pluginRoot, 'templates'), { recursive: true });
    await writeFile(
      path.join(pluginRoot, 'templates', 'workflow-template.yaml'),
      'coding_tasks: []\nrequirement_tasks: []\ntestcase_tasks: []\nprototype_tasks: []\n',
      'utf-8',
    );
    // 装上 superpowers + 假 openspec skill，减少 WARN
    await mkdir(path.join(tmp, '.claude', 'skills', 'using-superpowers'), { recursive: true });
    await writeFile(
      path.join(tmp, '.claude', 'skills', 'using-superpowers', 'SKILL.md'),
      '# sp\n',
      'utf-8',
    );
    await mkdir(path.join(tmp, '.claude', 'skills', 'openspec-propose'), { recursive: true });

    const { io } = createCaptureIo();
    const result = await runSessionStart({
      projectPath: tmp,
      platformId: 'claude',
      io,
      ppid: 99901,
      pluginPresence: { homeDir: fakeHome, isCommandAvailable: () => false },
    });

    const gitignore = await readFile(path.join(tmp, '.polaris', '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.cache/');
    expect(gitignore).toContain('.locks/');
    expect(gitignore).toContain('workflow.yaml');

    const workflow = await readFile(path.join(tmp, '.polaris', 'workflow.yaml'), 'utf-8');
    expect(workflow).toContain('coding_tasks');
    expect(workflow).toContain('requirement_tasks');
    expect(workflow).toContain('testcase_tasks');
    expect(workflow).toContain('prototype_tasks');

    const session = await readFile(path.join(tmp, '.polaris', 'sessions', '99901.id'), 'utf-8');
    expect(session.trim()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-[0-9a-f]{6}$/);

    // agents 未装 → WARN；依赖可能 ok
    expect(result.exitCode).toBe(1);
    expect(result.warnCount).toBeGreaterThan(0);
    expect(result.paths).toEqual({
      repoRoot: path.resolve(tmp),
      platformId: 'claude',
      pluginRoot: path.posix.join(path.resolve(tmp), '.claude', 'skills', 'polaris'),
      contextDir: '.claude',
    });
  });

  it('注入 review agent model', async () => {
    const tmp = await makeProject({ platform: 'claude', challengerModel: 'test-model' });
    await mkdir(path.join(tmp, '.claude', 'agents'), { recursive: true });
    const agentPath = path.join(tmp, '.claude', 'agents', 'plan-reviewer.md');
    await writeFile(
      agentPath,
      '---\nname: plan-reviewer\nmodel: inherit\n---\nbody\n',
      'utf-8',
    );

    const { io, lines } = createCaptureIo();
    const ok = await injectReviewAgentModel(
      io,
      tmp,
      claudePlatform,
      'plan-reviewer',
      'test-model',
    );
    expect(ok).toBe(true);
    const updated = await readFile(agentPath, 'utf-8');
    expect(updated).toContain('model: test-model');
    expect(lines.ok.some((l) => l.includes('plan-reviewer model'))).toBe(true);
  });

  it('依赖缺失时 WARN 且 exitCode 1', async () => {
    const tmp = await makeProject({ platform: 'claude' });
    const fakeHome = path.join(tmp, '_home');
    await mkdir(fakeHome, { recursive: true });
    const { io, lines } = createCaptureIo();
    const result = await runSessionStart({
      projectPath: tmp,
      platformId: 'claude',
      io,
      ppid: 7,
      pluginPresence: { homeDir: fakeHome, isCommandAvailable: () => false },
    });
    expect(result.warnCount).toBeGreaterThan(0);
    expect(result.exitCode).toBe(1);
    expect(lines.warn.some((l) => l.includes('superpowers') || l.includes('openspec'))).toBe(true);
    expect(result.paths).toEqual({
      repoRoot: path.resolve(tmp),
      platformId: 'claude',
      pluginRoot: path.posix.join(path.resolve(tmp), '.claude', 'skills', 'polaris'),
      contextDir: '.claude',
    });
  });
});
