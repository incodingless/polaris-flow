/**
 * OpenSpec 安装：CLI 参数、CLI 获取语义与按平台目录迁入逻辑的单元测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  buildOpenSpecCliInstallArgs,
  buildOpenSpecInitInvocation,
  ensureOpenSpecCli,
  getOpenSpecNativeContextDir,
  relocateOpenSpecToPlatformDirs,
  resolveOpenSpecCliAction,
} from '../../src/core/integrations/openspec.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

/**
 * 三条获取通道全部换成桩：npm 通道按参数判定失败，git / 本地目录通道直接返回失败。
 * 唯一自变量是 `resolveCliExecutable`——它代表「机器上是否已有 CLI」。
 */
const {
  execFileSyncMock,
  resolveCliExecutableMock,
  resolveCliInstallTargetMock,
  channelConfigMock,
  gitChannelMock,
  localChannelMock,
} = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  resolveCliExecutableMock: vi.fn(),
  resolveCliInstallTargetMock: vi.fn(),
  channelConfigMock: vi.fn(),
  gitChannelMock: vi.fn(),
  localChannelMock: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFileSync: execFileSyncMock };
});

vi.mock('../../src/core/deps/npm.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/deps/npm.js')>();
  return {
    ...actual,
    resolveCliExecutable: resolveCliExecutableMock,
    resolveCliInstallTarget: resolveCliInstallTargetMock,
  };
});

vi.mock('../../src/core/install/channels.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/install/channels.js')>();
  return { ...actual, resolveInstallChannelConfig: channelConfigMock };
});

vi.mock('../../src/core/install/cli-installer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/install/cli-installer.js')>();
  return {
    ...actual,
    installCliFromGitRepo: gitChannelMock,
    installCliFromLocalDir: localChannelMock,
  };
});

/** 是否真的执行过一次「npm install -g …」 */
function npmGlobalInstallAttempted(): boolean {
  return execFileSyncMock.mock.calls.some(([, rawArgs]) => {
    const args = Array.isArray(rawArgs) ? (rawArgs as string[]) : [];
    return args.includes('install') && args.includes('-g');
  });
}

describe('resolveOpenSpecCliAction', () => {
  it('未安装且应安装时走安装通道', () => {
    expect(resolveOpenSpecCliAction(false, true, false)).toBe('install');
  });

  it('未安装且不负责安装时记为 missing', () => {
    expect(resolveOpenSpecCliAction(false, false, false)).toBe('missing');
  });

  it('已安装且不负责安装时视为 ready', () => {
    expect(resolveOpenSpecCliAction(true, false, false)).toBe('ready');
  });

  it('已安装且未要求升级时跳过全局重装（init 不再每次都拉 @latest）', () => {
    expect(resolveOpenSpecCliAction(true, true, false)).toBe('ready');
  });

  it('已安装且显式要求升级时仍走安装通道（update --only openspec）', () => {
    expect(resolveOpenSpecCliAction(true, true, true)).toBe('install');
  });
});

describe('openspec CLI install', () => {
  it('always installs OpenSpec globally to avoid polluting target project', () => {
    expect(buildOpenSpecCliInstallArgs()).toEqual(['install', '-g', '@fission-ai/openspec@latest']);
  });

  it('buildOpenSpecInitInvocation 使用 openspecToolId，不使用 platform id', () => {
    const invocation = buildOpenSpecInitInvocation('/proj', ['trae'], 'project');
    expect(invocation.command).toBe('openspec');
    expect(invocation.args).toEqual(['init', '/proj', '--tools', 'trae', '--profile', 'custom']);
  });
});

describe('openspec platform relocate', () => {
  it('trae-cn 项目目录与原生 .trae 相同，不迁入、不清理', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'polaris-openspec-'));
    try {
      const nativeSkills = path.join(tmp, '.trae', 'skills', 'openspec-propose');
      await fs.mkdir(nativeSkills, { recursive: true });
      await fs.writeFile(path.join(nativeSkills, 'SKILL.md'), '# propose');
      await fs.mkdir(path.join(tmp, '.trae', 'skills', 'user-skill'), { recursive: true });

      const traeCn = PLATFORMS.find((p) => p.id === 'trae-cn');
      expect(traeCn).toBeDefined();
      expect(getOpenSpecNativeContextDir(traeCn!.openspecToolId)).toBe('.trae');
      expect(traeCn!.contextDir).toBe('.trae');
      expect(traeCn!.globalContextDir).toBe('.trae-cn');

      await relocateOpenSpecToPlatformDirs(tmp, [traeCn!], 'project');

      await expect(fs.access(path.join(nativeSkills, 'SKILL.md'))).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(tmp, '.trae', 'skills', 'user-skill')),
      ).resolves.toBeUndefined();
      await expect(fs.access(path.join(tmp, '.trae-cn'))).rejects.toThrow();
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

  it('contextDir 与原生目录不同时迁入，并只清理 OpenSpec 产物', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'polaris-openspec-'));
    try {
      const nativeSkills = path.join(tmp, '.trae', 'skills', 'openspec-propose');
      const nativeCmd = path.join(tmp, '.trae', 'commands');
      await fs.mkdir(nativeSkills, { recursive: true });
      await fs.writeFile(path.join(nativeSkills, 'SKILL.md'), '# propose');
      await fs.mkdir(nativeCmd, { recursive: true });
      await fs.writeFile(path.join(nativeCmd, 'opsx-propose.md'), '# cmd');
      await fs.mkdir(path.join(tmp, '.trae', 'skills', 'user-skill'), { recursive: true });

      const traeCn = PLATFORMS.find((p) => p.id === 'trae-cn')!;
      const mismatched = { ...traeCn, contextDir: '.trae-cn' };
      await relocateOpenSpecToPlatformDirs(tmp, [mismatched], 'project');

      await expect(
        fs.access(path.join(tmp, '.trae-cn', 'skills', 'openspec-propose', 'SKILL.md')),
      ).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(tmp, '.trae-cn', 'commands', 'opsx-propose.md')),
      ).resolves.toBeUndefined();
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
});

/**
 * 回归「升级失败被当成成功」：三通道全挂时，init（未要求升级）应沿用既有 CLI，
 * update（要求升级）必须报 failed —— 否则 update 会把没装上的版本写进 install-state，
 * 下次比对判 up-to-date，升级永远不再重试。
 */
describe('ensureOpenSpecCli 的全局安装语义', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCliInstallTargetMock.mockReturnValue({ kind: 'global' });
    channelConfigMock.mockResolvedValue({ localPaths: {} });
    gitChannelMock.mockResolvedValue(false);
    localChannelMock.mockReturnValue(false);
    execFileSyncMock.mockImplementation((_command: string, rawArgs?: unknown) => {
      const args = Array.isArray(rawArgs) ? (rawArgs as string[]) : [];
      // 只让 npm 全局安装失败，其余命令（openspec init 等）视为成功
      if (args.includes('install') && args.includes('-g')) {
        throw new Error('模拟 npm 安装失败');
      }
      return '';
    });
  });

  it('已装且未要求升级：直接 ready，一次全局安装都不发起', async () => {
    resolveCliExecutableMock.mockReturnValue('openspec');

    await expect(ensureOpenSpecCli(true, false)).resolves.toBe('ready');
    expect(npmGlobalInstallAttempted()).toBe(false);
  });

  it('已装但要求升级、三条通道全失败：报 failed，即使旧 CLI 仍可用', async () => {
    resolveCliExecutableMock.mockReturnValue('openspec');

    await expect(ensureOpenSpecCli(true, true)).resolves.toBe('failed');
    expect(npmGlobalInstallAttempted()).toBe(true);
  });

  it('未装且三条通道全失败：报 failed', async () => {
    resolveCliExecutableMock.mockReturnValue(null);

    await expect(ensureOpenSpecCli(true, false)).resolves.toBe('failed');
  });

  it('不负责安装时只看现状：已装 ready、未装 missing，都不装', async () => {
    resolveCliExecutableMock.mockReturnValueOnce('openspec').mockReturnValueOnce(null);

    await expect(ensureOpenSpecCli(false, false)).resolves.toBe('ready');
    await expect(ensureOpenSpecCli(false, false)).resolves.toBe('missing');
    expect(npmGlobalInstallAttempted()).toBe(false);
  });
});
