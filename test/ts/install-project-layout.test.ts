/**
 * install/layout：项目目录与配置初始化单测。
 */
import path from 'path';
import os from 'os';
import { mkdtemp, access } from 'fs/promises';
import { describe, expect, it } from 'vitest';

import {
  getInstallSkillBase,
  initializePolarisCommonLayout,
  initializeProjectLayout,
  resolveWorktreeRoot,
} from '../../src/core/install/layout.js';
import { PLATFORMS } from '../../src/core/platforms.js';
import { getPolarisDir } from '../../src/core/assets/polaris-paths.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;

describe('install/layout', () => {
  it('resolveWorktreeRoot：project → 项目/.worktrees，global → ~/.polaris/.worktrees', () => {
    const projectPath = '/tmp/proj';
    expect(resolveWorktreeRoot(projectPath, 'project')).toBe(path.join(projectPath, '.worktrees'));
    expect(resolveWorktreeRoot(projectPath, 'global')).toBe(
      path.join(os.homedir(), '.polaris', '.worktrees'),
    );
  });

  it('getInstallSkillBase：project → 项目路径，global → 用户主目录', () => {
    expect(getInstallSkillBase('project', '/tmp/proj')).toBe('/tmp/proj');
    expect(getInstallSkillBase('global', '/tmp/proj')).toBe(os.homedir());
  });

  it('initializePolarisCommonLayout：创建 .polaris 与 worktree', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'polaris-layout-common-'));
    const polarisDir = await initializePolarisCommonLayout(projectPath, 'project');
    expect(polarisDir).toBe(getPolarisDir(projectPath));
    await access(getPolarisDir(projectPath));
    await access(path.join(projectPath, '.worktrees'));
  });

  it('initializeProjectLayout：创建平台 skills/commands/agents/rules 与 polaris-flow 根', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'polaris-layout-proj-'));
    const layout = await initializeProjectLayout(projectPath, 'project', claude);

    expect(layout.baseDir).toBe(path.join(projectPath, '.claude'));
    await access(path.join(projectPath, '.claude/skills/polaris-flow'));
    await access(path.join(projectPath, '.claude/commands/polaris-flow'));
    await access(path.join(projectPath, '.claude/agents'));
    await access(path.join(projectPath, '.claude/rules'));
  });
});
