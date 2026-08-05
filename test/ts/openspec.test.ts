/**
 * OpenSpec 安装：CLI 参数与按平台目录迁入逻辑的单元测试。
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  buildOpenSpecCliInstallArgs,
  buildOpenSpecInitInvocation,
  getOpenSpecNativeContextDir,
  relocateOpenSpecToPlatformDirs,
} from '../../src/core/integration/openspec.js';
import { PLATFORMS } from '../../src/core/platforms.js';

describe('openspec CLI install', () => {
  it('always installs OpenSpec globally to avoid polluting target project', () => {
    expect(buildOpenSpecCliInstallArgs()).toEqual([
      'install',
      '-g',
      '@fission-ai/openspec@latest',
    ]);
  });

  it('buildOpenSpecInitInvocation 使用 openspecToolId，不使用 platform id', () => {
    const invocation = buildOpenSpecInitInvocation('/proj', ['trae'], 'project');
    expect(invocation.command).toBe('openspec');
    expect(invocation.args).toEqual([
      'init',
      '/proj',
      '--tools',
      'trae',
      '--profile',
      'custom',
    ]);
  });
});

describe('openspec platform relocate', () => {
  it('trae-cn：原生 .trae 产物迁入 .trae-cn，并清理中间目录', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'polaris-openspec-'));
    try {
      const nativeSkills = path.join(tmp, '.trae', 'skills', 'openspec-propose');
      const nativeCmd = path.join(tmp, '.trae', 'commands');
      await fs.mkdir(nativeSkills, { recursive: true });
      await fs.writeFile(path.join(nativeSkills, 'SKILL.md'), '# propose');
      await fs.mkdir(nativeCmd, { recursive: true });
      await fs.writeFile(path.join(nativeCmd, 'opsx-propose.md'), '# cmd');
      // 非 OpenSpec 内容应保留在中间目录清理范围外（仅删 openspec/opsx）
      await fs.mkdir(path.join(tmp, '.trae', 'skills', 'user-skill'), { recursive: true });

      const traeCn = PLATFORMS.find((p) => p.id === 'trae-cn');
      expect(traeCn).toBeDefined();
      expect(getOpenSpecNativeContextDir(traeCn!.openspecToolId)).toBe('.trae');
      expect(traeCn!.contextDir).toBe('.trae-cn');

      await relocateOpenSpecToPlatformDirs(tmp, [traeCn!], 'project');

      await expect(
        fs.access(path.join(tmp, '.trae-cn', 'skills', 'openspec-propose', 'SKILL.md')),
      ).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(tmp, '.trae-cn', 'commands', 'opsx-propose.md')),
      ).resolves.toBeUndefined();
      // 中间目录的 OpenSpec 产物已清；非 OpenSpec 保留
      await expect(
        fs.access(path.join(tmp, '.trae', 'skills', 'openspec-propose')),
      ).rejects.toThrow();
      await expect(
        fs.access(path.join(tmp, '.trae', 'skills', 'user-skill')),
      ).resolves.toBeUndefined();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('trae：contextDir 与原生目录一致时不迁入、不清理', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'polaris-openspec-'));
    try {
      const skill = path.join(tmp, '.trae', 'skills', 'openspec-propose');
      await fs.mkdir(skill, { recursive: true });
      await fs.writeFile(path.join(skill, 'SKILL.md'), '# propose');

      const trae = PLATFORMS.find((p) => p.id === 'trae');
      expect(trae).toBeDefined();

      await relocateOpenSpecToPlatformDirs(tmp, [trae!], 'project');

      await expect(fs.access(path.join(skill, 'SKILL.md'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(tmp, '.trae-cn'))).rejects.toThrow();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('同时选 trae 与 trae-cn：复制到 .trae-cn 且保留 .trae', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'polaris-openspec-'));
    try {
      const skill = path.join(tmp, '.trae', 'skills', 'openspec-propose');
      await fs.mkdir(skill, { recursive: true });
      await fs.writeFile(path.join(skill, 'SKILL.md'), '# propose');

      const trae = PLATFORMS.find((p) => p.id === 'trae')!;
      const traeCn = PLATFORMS.find((p) => p.id === 'trae-cn')!;
      await relocateOpenSpecToPlatformDirs(tmp, [trae, traeCn], 'project');

      await expect(fs.access(path.join(skill, 'SKILL.md'))).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(tmp, '.trae-cn', 'skills', 'openspec-propose', 'SKILL.md')),
      ).resolves.toBeUndefined();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
