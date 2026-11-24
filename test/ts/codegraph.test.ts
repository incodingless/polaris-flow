/**
 * CodeGraph 安装器：CLI 获取语义与「索引存在时是否重建」的单元测试。
 *
 * 三条获取通道全部换成桩（npm 通道按参数判定失败，git / 本地目录通道直接失败），
 * 唯一自变量是 `resolveCliExecutable`——它代表「机器上是否已有 CLI」。
 *
 * 重点回归两件事：
 * - 升级失败时不能报 installed，否则 update 会把没装上的版本写进 install-state，
 *   下次比对判 up-to-date，升级永远不再重试；
 * - 无 `.codegraph` 索引的分支也必须透传 `upgradeCli`，不能只跑安装却声称升级过。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { installCodegraph } from '../../src/core/integrations/codegraph.js';

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

/** 建一个临时项目；`withIndex` 为真时预置一个非空的 `.codegraph/` 索引目录 */
async function makeProject(withIndex: boolean): Promise<string> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'polaris-codegraph-'));
  if (withIndex) {
    await fs.mkdir(path.join(projectPath, '.codegraph'), { recursive: true });
    await fs.writeFile(path.join(projectPath, '.codegraph', 'index.json'), '{}', 'utf-8');
  }
  return projectPath;
}

describe('installCodegraph 的 CLI 获取语义', () => {
  let projectPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    projectPath = await makeProject(false);
    resolveCliInstallTargetMock.mockReturnValue({ kind: 'global' });
    channelConfigMock.mockResolvedValue({ localPaths: {} });
    gitChannelMock.mockResolvedValue(false);
    localChannelMock.mockReturnValue(false);
    execFileSyncMock.mockImplementation((_command: string, rawArgs?: unknown) => {
      const args = Array.isArray(rawArgs) ? (rawArgs as string[]) : [];
      // 只让 npm 全局安装失败，其余命令（codegraph install/init）视为成功
      if (args.includes('install') && args.includes('-g')) {
        throw new Error('模拟 npm 安装失败');
      }
      return '';
    });
  });

  afterEach(async () => {
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  it('无索引 + CLI 已装 + 未要求升级：不发起全局安装，只建索引', async () => {
    resolveCliExecutableMock.mockReturnValue('/usr/local/bin/codegraph');

    await expect(installCodegraph(projectPath, 'project', true, false)).resolves.toBe('installed');
    expect(npmGlobalInstallAttempted()).toBe(false);
  });

  it('无索引 + CLI 已装 + 要求升级 + 三通道全失败：报 failed 并确实尝试过升级', async () => {
    resolveCliExecutableMock.mockReturnValue('/usr/local/bin/codegraph');

    await expect(installCodegraph(projectPath, 'project', true, true)).resolves.toBe('failed');
    expect(npmGlobalInstallAttempted()).toBe(true);
  });

  it('有索引 + 要求升级 + 三通道全失败：报 failed，不重建成索引', async () => {
    await fs.rm(projectPath, { recursive: true, force: true });
    projectPath = await makeProject(true);
    resolveCliExecutableMock.mockReturnValue('/usr/local/bin/codegraph');

    await expect(installCodegraph(projectPath, 'project', true, true)).resolves.toBe('failed');
    expect(npmGlobalInstallAttempted()).toBe(true);
  });

  it('有索引且未要求升级：跳过，不重装也不重建', async () => {
    await fs.rm(projectPath, { recursive: true, force: true });
    projectPath = await makeProject(true);
    resolveCliExecutableMock.mockReturnValue('/usr/local/bin/codegraph');

    await expect(installCodegraph(projectPath, 'project', true, false)).resolves.toBe('skipped');
    expect(npmGlobalInstallAttempted()).toBe(false);
  });

  it('CLI 未装且三通道全失败：报 failed', async () => {
    resolveCliExecutableMock.mockReturnValue(null);

    await expect(installCodegraph(projectPath, 'project', true, false)).resolves.toBe('failed');
  });
});
