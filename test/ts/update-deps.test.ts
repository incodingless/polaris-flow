/**
 * `polaris update` deps 分支端到端回归：版本判定 → 安装器调用 → lock 回写。
 *
 * 三个 core 安装器与上游版本探测全部 mock，避免真实 npm / git 网络操作；
 * 核心防线是「版本未变、上游不可达时安装器零调用」，以及「只有安装成功才回写版本」。
 */
import path from 'path';
import os from 'os';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { runUpdate } from '../../src/commands/update.js';
import { loadI18n } from '../../src/commands/i18n/index.js';
import {
  readInstallState,
  saveInstallState,
  type InstallSourceEntry,
} from '../../src/core/install/install-state.js';
import { getLatestNpmVersion } from '../../src/core/deps/npm.js';
import { resolveVersion } from '../../src/core/deps/github.js';
import { resolveInstallChannelConfig } from '../../src/core/install/channels.js';
import { installOpenSpec } from '../../src/core/integrations/openspec.js';
import { installSuperpowersForPlatforms } from '../../src/core/integrations/superpowers.js';
import { installCodegraph } from '../../src/core/integrations/codegraph.js';

// 保留模块其余导出：update.ts 还依赖这些模块的常量（包名、仓库地址、最低版本）
vi.mock('../../src/core/deps/npm.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/deps/npm.js')>();
  return { ...actual, getLatestNpmVersion: vi.fn() };
});

vi.mock('../../src/core/deps/github.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/deps/github.js')>();
  return { ...actual, resolveVersion: vi.fn() };
});

vi.mock('../../src/core/install/channels.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/install/channels.js')>();
  return { ...actual, resolveInstallChannelConfig: vi.fn() };
});

vi.mock('../../src/core/integrations/openspec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/integrations/openspec.js')>();
  return { ...actual, installOpenSpec: vi.fn() };
});

vi.mock('../../src/core/integrations/superpowers.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/integrations/superpowers.js')>();
  return { ...actual, installSuperpowersForPlatforms: vi.fn() };
});

vi.mock('../../src/core/integrations/codegraph.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/integrations/codegraph.js')>();
  return { ...actual, installCodegraph: vi.fn() };
});

const NPM_VERSION = '1.4.0';
const SUPERPOWERS_VERSION = '4.5.0';

beforeAll(async () => {
  await loadI18n();
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  // json 模式下 runUpdate 会打印结果 JSON，测试无需这些输出
  vi.spyOn(console, 'log').mockImplementation(() => {});

  vi.mocked(getLatestNpmVersion).mockResolvedValue(NPM_VERSION);
  vi.mocked(resolveVersion).mockReturnValue({ version: SUPERPOWERS_VERSION });
  vi.mocked(resolveInstallChannelConfig).mockResolvedValue({ localPaths: {} });
  vi.mocked(installOpenSpec).mockResolvedValue('installed');
  vi.mocked(installSuperpowersForPlatforms).mockResolvedValue({
    status: 'installed',
    version: 'npx-latest',
    method: 'npx',
  });
  vi.mocked(installCodegraph).mockResolvedValue('installed');
});

/** 造一个「已装 Polaris 的 claude 项目」，并预置 install-state 里的依赖版本 */
async function makeProject(sources: InstallSourceEntry[]): Promise<string> {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'polaris-update-deps-'));
  await mkdir(path.join(projectPath, '.claude', 'skills', 'polaris'), { recursive: true });
  await mkdir(path.join(projectPath, '.polaris'), { recursive: true });
  await writeFile(
    path.join(projectPath, '.polaris', 'config.yaml'),
    ['language: zh', 'scope: project', ''].join('\n'),
    'utf-8',
  );
  await saveInstallState(projectPath, {
    version: 1,
    platforms: ['claude'],
    sources,
  });
  return projectPath;
}

/** 三个组件都记录为当前上游版本 */
function currentSources(): InstallSourceEntry[] {
  return [
    { id: 'openspec', version: NPM_VERSION, status: 'installed' },
    { id: 'superpowers', version: SUPERPOWERS_VERSION, status: 'installed' },
    { id: 'codegraph', version: NPM_VERSION, status: 'installed' },
  ];
}

/** 断言三个安装器一次都没被调用 */
function expectNoInstalls(): void {
  expect(installOpenSpec).not.toHaveBeenCalled();
  expect(installSuperpowersForPlatforms).not.toHaveBeenCalled();
  expect(installCodegraph).not.toHaveBeenCalled();
}

/** 断言三个安装器各被调用一次 */
function expectAllInstalled(): void {
  expect(installOpenSpec).toHaveBeenCalledTimes(1);
  expect(installSuperpowersForPlatforms).toHaveBeenCalledTimes(1);
  expect(installCodegraph).toHaveBeenCalledTimes(1);
}

/** install-state 中除 polaris 自身外的依赖版本 */
async function depSources(projectPath: string): Promise<InstallSourceEntry[] | undefined> {
  const state = await readInstallState(projectPath);
  return state?.sources.filter((entry) => entry.id !== 'polaris');
}

describe('runUpdate deps 分支', () => {
  it('三个组件版本未变时全部跳过，安装器零调用', async () => {
    const projectPath = await makeProject(currentSources());

    const result = await runUpdate(projectPath, { only: ['deps'], json: true });

    expect(result.deps).toEqual([
      { id: 'openspec', status: 'up-to-date', version: NPM_VERSION },
      { id: 'superpowers', status: 'up-to-date', version: SUPERPOWERS_VERSION },
      { id: 'codegraph', status: 'up-to-date', version: NPM_VERSION },
    ]);
    expectNoInstalls();
    expect(await depSources(projectPath)).toEqual(currentSources());
  });

  it('上游版本探测失败时跳过并标记 unreachable，lock 不变', async () => {
    vi.mocked(getLatestNpmVersion).mockResolvedValue(null);
    vi.mocked(resolveVersion).mockReturnValue({ version: null, reason: 'network-error' });
    const projectPath = await makeProject(currentSources());

    const result = await runUpdate(projectPath, { only: ['deps'], json: true });

    expect(result.deps.map((entry) => entry.status)).toEqual([
      'unreachable',
      'unreachable',
      'unreachable',
    ]);
    expectNoInstalls();
    expect(await depSources(projectPath)).toEqual(currentSources());
  });

  it('上游有新版本时调用安装器，并把新版本写回 lock', async () => {
    vi.mocked(getLatestNpmVersion).mockResolvedValue('2.0.0');
    vi.mocked(resolveVersion).mockReturnValue({ version: '5.0.0' });
    const projectPath = await makeProject(currentSources());

    const result = await runUpdate(projectPath, { only: ['deps'], json: true });

    expect(result.deps.map((entry) => entry.status)).toEqual([
      'installed',
      'installed',
      'installed',
    ]);
    expectAllInstalled();
    expect(await depSources(projectPath)).toEqual([
      { id: 'openspec', version: '2.0.0', status: 'installed' },
      { id: 'superpowers', version: '5.0.0', status: 'installed' },
      { id: 'codegraph', version: '2.0.0', status: 'installed' },
    ]);
  });

  it('--force 即使版本未变也强制安装，仍带回上游版本', async () => {
    const projectPath = await makeProject(currentSources());

    const result = await runUpdate(projectPath, { only: ['deps'], force: true, json: true });

    expect(result.deps.map((entry) => entry.status)).toEqual([
      'installed',
      'installed',
      'installed',
    ]);
    expect(result.deps.map((entry) => entry.version)).toEqual([
      NPM_VERSION,
      SUPERPOWERS_VERSION,
      NPM_VERSION,
    ]);
    expectAllInstalled();
  });

  it('lock 里是 npx-latest / 0.0.0 脏值时只装一次建立基线，之后稳定跳过', async () => {
    const projectPath = await makeProject([
      { id: 'openspec', version: '0.0.0', status: 'installed' },
      { id: 'superpowers', version: 'npx-latest', status: 'installed' },
      { id: 'codegraph', version: '0.0.0', status: 'installed' },
    ]);

    const first = await runUpdate(projectPath, { only: ['deps'], json: true });
    expect(first.deps.map((entry) => entry.status)).toEqual([
      'installed',
      'installed',
      'installed',
    ]);
    expectAllInstalled();
    expect(await depSources(projectPath)).toEqual(currentSources());

    vi.clearAllMocks();
    const second = await runUpdate(projectPath, { only: ['deps'], json: true });
    expect(second.deps.map((entry) => entry.status)).toEqual([
      'up-to-date',
      'up-to-date',
      'up-to-date',
    ]);
    expectNoInstalls();
  });

  it('安装失败时不把期望版本写成已装版本，下次仍会重试', async () => {
    vi.mocked(getLatestNpmVersion).mockResolvedValue('2.0.0');
    vi.mocked(installOpenSpec).mockResolvedValue('failed');
    const projectPath = await makeProject(currentSources());

    const result = await runUpdate(projectPath, { only: ['deps'], json: true });

    expect(result.deps[0]).toEqual({ id: 'openspec', status: 'failed', version: '2.0.0' });
    expect((await depSources(projectPath))?.find((entry) => entry.id === 'openspec')).toEqual({
      id: 'openspec',
      version: NPM_VERSION,
      status: 'installed',
    });
  });

  it('探测与安装使用同一套通道配置（npm registry / GitHub 镜像）', async () => {
    vi.mocked(resolveInstallChannelConfig).mockResolvedValue({
      npmRegistry: 'https://registry.example.test/',
      githubMirror: 'https://mirror.example.test/',
      localPaths: {},
    });
    const projectPath = await makeProject([]);

    await runUpdate(projectPath, { only: ['deps'], json: true });

    expect(getLatestNpmVersion).toHaveBeenCalledWith(
      expect.any(String),
      'https://registry.example.test/',
    );
    expect(resolveVersion).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'https://mirror.example.test/',
    );
  });
});
