/**
 * 托管文件清理：只删 Polaris 独占命名空间内的陈旧产物，不越界删用户内容。
 */
import path from 'path';
import os from 'os';
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

import { PLATFORMS } from '../../src/core/domain/platforms.js';
import { fileExists } from '../../src/utils/file-system.js';
import { pruneOwnedFiles } from '../../src/core/update/prune.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;
const cursor = PLATFORMS.find((p) => p.id === 'cursor')!;

async function makeProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'polaris-prune-'));
}

/** 写文件并返回绝对路径 */
async function plant(filePath: string, content = 'x'): Promise<string> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

describe('pruneOwnedFiles', () => {
  it('nested skills：删除插件根下的陈旧文件，并清掉因此变空的目录', async () => {
    const projectPath = await makeProject();
    const pluginRoot = path.join(projectPath, '.claude', 'skills', 'polaris');
    const kept = await plant(path.join(pluginRoot, 'coding', 'build', 'SKILL.md'));
    const stale = await plant(path.join(pluginRoot, 'coding', 'refactor', 'SKILL.md'));

    const result = await pruneOwnedFiles({
      platform: claude,
      scope: 'project',
      projectPath,
      kind: 'skills',
      expectedFiles: [kept],
    });

    expect(result.deleted).toContain(stale);
    expect(await fileExists(stale)).toBe(false);
    expect(await fileExists(path.join(pluginRoot, 'coding', 'refactor'))).toBe(false);
    expect(await fileExists(kept)).toBe(true);
  });

  it('nested skills：插件根本身即使清空也保留', async () => {
    const projectPath = await makeProject();
    const pluginRoot = path.join(projectPath, '.claude', 'skills', 'polaris');
    const stale = await plant(path.join(pluginRoot, 'only', 'SKILL.md'));

    await pruneOwnedFiles({
      platform: claude,
      scope: 'project',
      projectPath,
      kind: 'skills',
      expectedFiles: [],
    });

    expect(await fileExists(stale)).toBe(false);
    expect(await fileExists(pluginRoot)).toBe(true);
  });

  it('flat skills：整棵 polaris-* 目录被删除，非 polaris 前缀目录不受影响', async () => {
    const projectPath = await makeProject();
    const skillsRoot = path.join(projectPath, '.trae', 'skills');
    const kept = await plant(path.join(skillsRoot, 'polaris-coding-build', 'SKILL.md'));
    const staleDir = path.join(skillsRoot, 'polaris-coding-refactor');
    await plant(path.join(staleDir, 'SKILL.md'));
    const otherPlugin = await plant(path.join(skillsRoot, 'openspec-propose', 'SKILL.md'));
    const superpowers = await plant(path.join(skillsRoot, 'brainstorming', 'SKILL.md'));

    const result = await pruneOwnedFiles({
      platform: trae,
      scope: 'project',
      projectPath,
      kind: 'skills',
      expectedFiles: [kept],
    });

    expect(result.deleted).toContain(staleDir);
    expect(await fileExists(staleDir)).toBe(false);
    expect(await fileExists(kept)).toBe(true);
    expect(await fileExists(otherPlugin)).toBe(true);
    expect(await fileExists(superpowers)).toBe(true);
  });

  it('flat skills：插件根（polaris/）下的陈旧文件同样被清理', async () => {
    const projectPath = await makeProject();
    const pluginRoot = path.join(projectPath, '.trae', 'skills', 'polaris');
    const kept = await plant(path.join(pluginRoot, 'hooks', 'session-start.sh'));
    const stale = await plant(path.join(pluginRoot, 'templates', 'old.yaml'));

    const result = await pruneOwnedFiles({
      platform: trae,
      scope: 'project',
      projectPath,
      kind: 'skills',
      expectedFiles: [kept],
    });

    expect(result.deleted).toContain(stale);
    expect(await fileExists(kept)).toBe(true);
  });

  it('nested commands：只清 commands/polaris 下的陈旧文件，不动同级的其它插件命令', async () => {
    const projectPath = await makeProject();
    const commandsRoot = path.join(projectPath, '.claude', 'commands');
    const kept = await plant(path.join(commandsRoot, 'polaris', 'coding', 'normal.md'));
    const stale = await plant(path.join(commandsRoot, 'polaris', 'coding', 'legacy.md'));
    const otherPlugin = await plant(path.join(commandsRoot, 'opsx-new.md'));

    const result = await pruneOwnedFiles({
      platform: claude,
      scope: 'project',
      projectPath,
      kind: 'commands',
      expectedFiles: [kept],
    });

    expect(result.deleted).toContain(stale);
    expect(await fileExists(kept)).toBe(true);
    expect(await fileExists(otherPlugin)).toBe(true);
    expect(await readFile(otherPlugin, 'utf-8')).toBe('x');
  });

  it('flat commands：只删 polaris-*.md，保留 openspec / 用户命令', async () => {
    const projectPath = await makeProject();
    const commandsRoot = path.join(projectPath, '.cursor', 'commands');
    const kept = await plant(path.join(commandsRoot, 'polaris-coding-normal.md'));
    const stale = await plant(path.join(commandsRoot, 'polaris-coding-legacy.md'));
    const otherPlugin = await plant(path.join(commandsRoot, 'openspec-propose.md'));
    const userCommand = await plant(path.join(commandsRoot, 'my-own.md'));
    const dirEntry = path.join(commandsRoot, 'polaris-not-a-file');
    await mkdir(dirEntry, { recursive: true });

    const result = await pruneOwnedFiles({
      platform: cursor,
      scope: 'project',
      projectPath,
      kind: 'commands',
      expectedFiles: [kept],
    });

    expect(result.deleted).toContain(stale);
    expect(await fileExists(stale)).toBe(false);
    expect(await fileExists(kept)).toBe(true);
    expect(await fileExists(otherPlugin)).toBe(true);
    expect(await fileExists(userCommand)).toBe(true);
    expect(await fileExists(dirEntry)).toBe(true);
  });

  it('目标目录不存在时返回空结果，不抛错', async () => {
    const projectPath = await makeProject();
    const result = await pruneOwnedFiles({
      platform: claude,
      scope: 'project',
      projectPath,
      kind: 'commands',
      expectedFiles: [],
    });
    expect(result.deleted).toEqual([]);
  });
});
