/**
 * install/layout：项目目录与配置初始化单测。
 */
import path from 'path';
import os from 'os';
import { mkdtemp, access, readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

import {
  createWorkingDirs,
  initializeProjectLayout,
} from '../../src/core/install/layout.js';
import { PLATFORMS } from '../../src/core/platforms.js';
import {
  getGlobalPolarisConfigPath,
  getPolarisConfigPath,
  getPolarisGitignorePath,
  getWorkflowYamlPath,
  resolveWorktreeRoot,
} from '../../src/core/assets/polaris-paths.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;

describe('install/layout', () => {
  it('createWorkingDirs：project 建 .polaris 文件、.worktrees、平台与 polaris-flow 子目录', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'polaris-layout-proj-'));

    await createWorkingDirs(projectPath, {
      scope: 'project',
      baseDir: projectPath,
      platforms: [claude],
    });

    await access(path.join(projectPath, '.polaris'));
    await access(getPolarisConfigPath(projectPath));
    await access(getWorkflowYamlPath(projectPath));
    await access(getPolarisGitignorePath(projectPath));
    await access(path.join(projectPath, '.worktrees'));
    await access(path.join(projectPath, '.claude/skills'));
    await access(path.join(projectPath, '.claude/commands'));
    await access(path.join(projectPath, '.claude/agents'));
    await access(path.join(projectPath, '.claude/rules'));
    await access(path.join(projectPath, '.claude/skills/polaris-flow/hooks'));
    await access(path.join(projectPath, '.claude/skills/polaris-flow/templates'));
    await access(path.join(projectPath, '.claude/skills/polaris-flow/adapters'));
    await access(path.join(projectPath, '.claude/skills/polaris-flow/policies'));
    await access(path.join(projectPath, '.claude/skills/polaris-flow/scorers'));
    await access(getGlobalPolarisConfigPath());
  });

  it('createWorkingDirs：global 时 worktree 在 ~/.polaris/.worktrees，技能根跟 baseDir', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'polaris-layout-gproj-'));
    const skillBase = await mkdtemp(path.join(os.tmpdir(), 'polaris-layout-skill-'));

    await createWorkingDirs(projectPath, {
      scope: 'global',
      baseDir: skillBase,
      platforms: [claude],
    });

    expect(resolveWorktreeRoot(projectPath, 'global')).toBe(
      path.join(os.homedir(), '.polaris', '.worktrees'),
    );
    await access(path.join(os.homedir(), '.polaris', '.worktrees'));
    await access(path.join(projectPath, '.polaris'));
    await access(path.join(skillBase, '.claude/skills/polaris-flow/hooks'));
    await expect(access(path.join(projectPath, '.worktrees'))).rejects.toThrow();
    await expect(access(path.join(projectPath, '.claude/skills/polaris-flow'))).rejects.toThrow();
  });

  it('initializeProjectLayout：写入/补齐项目 config 的 platform 与 plugin_root', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'polaris-layout-init-'));

    await initializeProjectLayout(projectPath, {
      language: 'zh',
      scope: 'project',
      baseDir: projectPath,
      platforms: [trae],
    });

    const configRaw = await readFile(getPolarisConfigPath(projectPath), 'utf-8');
    expect(configRaw).toMatch(/platform:\s*trae/);
    expect(configRaw).toContain('plugin_root:');
    await access(path.join(projectPath, '.trae/skills/polaris-flow/scorers'));
  });
});
