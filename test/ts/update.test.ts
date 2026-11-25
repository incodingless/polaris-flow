/**
 * `runUpdate` 端到端：范围隔离、lang/scope 从 config 回读、指纹门控与 --prune。
 *
 * 成本说明：安装类用例会真实拷贝 400+ 资产文件，本机实测**每次 28~34s**
 * （仓库记录的 11~15s 是更快的机器），所以：
 * - 安装类用例显式放宽到 `INSTALL_TIMEOUT=120s`
 * - 指纹门控与 `--force` 用例改为**预置 lock 指纹**，免掉真实安装
 */
import path from 'path';
import os from 'os';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { runUpdate } from '../../src/commands/update.js';
import { loadI18n } from '../../src/commands/i18n/index.js';
import { readAssets } from '../../src/core/assets/manifest.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';
import { readInstallState, saveInstallState } from '../../src/core/install/install-state.js';
import { computeAssetFingerprints } from '../../src/core/update/fingerprint.js';
import { fileExists } from '../../src/utils/file-system.js';

// 默认范围含程序本体（联网自更新）；本文件只测资产层，mock 掉程序层避免网络依赖与全局安装副作用
vi.mock('../../src/core/deps/self-update.js', () => ({
  updatePolarisProgram: vi.fn(async () => ({
    status: 'skipped',
    currentVersion: '0.0.0-test',
    latestVersion: null,
    reason: 'transient-runner',
  })),
  buildGlobalInstallInvocation: () => ({ command: 'npm', args: ['install', '-g', 'test'] }),
}));

/** 单次真实安装实测 28~34s */
const INSTALL_TIMEOUT = 120_000;
/** 不落盘、仅读资产与指纹的用例（本机读 180+ 资产文件实测 14~22s） */
const FAST_TIMEOUT = 60_000;

const CLAUDE = PLATFORMS.find((platform) => platform.id === 'claude')!;

const SKILL_PATH = path.join('coding', 'build', 'SKILL.md');
const COMMAND_PATH = path.join('coding', 'normal.md');

/** framework 范围覆盖的全部资产类别（细分类已不可单独指定） */
const ALL_ASSETS = ['skills', 'commands', 'agents', 'rules', 'hooks'];

/** 造一个「已装 Polaris 的 claude 项目」：探测目录 + polaris 插件根 + config.yaml */
async function makeInstalledProject(): Promise<string> {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'polaris-update-'));
  await mkdir(path.join(projectPath, '.claude', 'skills', 'polaris'), { recursive: true });
  await mkdir(path.join(projectPath, '.polaris'), { recursive: true });
  await writeFile(
    path.join(projectPath, '.polaris', 'config.yaml'),
    ['language: zh', 'scope: project', ''].join('\n'),
    'utf-8',
  );
  return projectPath;
}

async function plant(filePath: string): Promise<string> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, 'stale', 'utf-8');
  return filePath;
}

/**
 * 预置「与当前资产一致」的 lock 指纹：用于「指纹未变 → 整体跳过」与「--force 绕过」两个用例，
 * 无需先跑一次真实安装。测试项目 config 无 model，故指纹按 config=null 计算与运行时等价。
 */
async function seedLockWithCurrentFingerprints(projectPath: string): Promise<void> {
  const assets = await readAssets('zh');
  const fresh = await computeAssetFingerprints(assets, CLAUDE, null, 'project');
  await saveInstallState(projectPath, {
    version: 1,
    platforms: ['claude'],
    sources: [],
    assets: { claude: { ...fresh } },
  });
}

beforeAll(async () => {
  await loadI18n();
});

describe('runUpdate', () => {
  it(
    '资产层更新：语言与 scope 从 config.yaml 回读，程序与依赖层不执行',
    async () => {
      const projectPath = await makeInstalledProject();

      // 依赖层需联网探测，不纳入本用例；程序层已被 mock 为 skipped
      const result = await runUpdate(projectPath, {
        only: ['framework'],
        json: true,
      });

      // config.yaml 里是 zh；未传 --lang 时必须回读，不能退回默认值
      expect(result.language).toBe('zh');
      expect(result.scope).toBe('project');
      expect(result.program?.status).toBe('skipped');
      expect(result.deps).toEqual([]);
      expect(result.assetsSkipped).toBe(false);

      const claude = result.assets.find((entry) => entry.platform === 'claude');
      expect(claude?.updated).toEqual(ALL_ASSETS);
      expect(claude?.copied.skills).toBeGreaterThan(0);

      expect(
        await fileExists(path.join(projectPath, '.claude', 'skills', 'polaris', SKILL_PATH)),
      ).toBe(true);
      // 资产五类随 framework 范围一起更新，不再支持按类别挑选
      expect(
        await fileExists(path.join(projectPath, '.claude', 'commands', 'psfl', COMMAND_PATH)),
      ).toBe(true);

      const state = await readInstallState(projectPath);
      expect(state?.platforms).toEqual(['claude']);
      expect(state?.assets?.claude?.skills).toMatch(/^[0-9a-f]{16}$/);
      expect(result.statePath).toBeTruthy();
    },
    INSTALL_TIMEOUT,
  );

  it(
    '资产指纹未变时整体跳过，且不产生任何落盘（「更新技能」不再假成功的回归防线）',
    async () => {
      const projectPath = await makeInstalledProject();
      await seedLockWithCurrentFingerprints(projectPath);

      const result = await runUpdate(projectPath, { only: ['framework'], json: true });

      expect(result.assets[0].updated).toEqual([]);
      expect(result.assets[0].unchanged).toEqual(ALL_ASSETS);
      expect(result.assets[0].copied.skills).toBeUndefined();
      // 跳过意味着没有调用安装器
      expect(
        await fileExists(path.join(projectPath, '.claude', 'skills', 'polaris', SKILL_PATH)),
      ).toBe(false);
    },
    FAST_TIMEOUT,
  );

  it(
    '--force 忽略指纹并重写所选范围',
    async () => {
      const projectPath = await makeInstalledProject();
      await seedLockWithCurrentFingerprints(projectPath);

      const withoutForce = await runUpdate(projectPath, {
        only: ['framework'],
        json: true,
      });
      expect(withoutForce.assets[0].updated).toEqual([]);

      const forced = await runUpdate(projectPath, {
        only: ['framework'],
        force: true,
        json: true,
      });
      expect(forced.assets[0].updated).toEqual(ALL_ASSETS);
    },
    FAST_TIMEOUT,
  );

  it(
    '--prune 清掉已不在资产清单中的陈旧技能',
    async () => {
      const projectPath = await makeInstalledProject();
      const staleSkill = await plant(
        path.join(projectPath, '.claude', 'skills', 'polaris', 'coding', 'refactor', 'SKILL.md'),
      );

      const result = await runUpdate(projectPath, {
        only: ['framework'],
        force: true,
        prune: true,
        json: true,
      });

      expect(result.assets[0].pruned).toContain(staleSkill);
      expect(await fileExists(staleSkill)).toBe(false);
      // 清单内的文件不受影响
      expect(
        await fileExists(path.join(projectPath, '.claude', 'skills', 'polaris', SKILL_PATH)),
      ).toBe(true);
    },
    INSTALL_TIMEOUT,
  );

  it(
    '未开 --prune 时陈旧文件保留（清理必须显式请求）',
    async () => {
      const projectPath = await makeInstalledProject();
      const staleSkill = await plant(
        path.join(projectPath, '.claude', 'skills', 'polaris', 'coding', 'refactor', 'SKILL.md'),
      );

      const result = await runUpdate(projectPath, {
        only: ['framework'],
        force: true,
        json: true,
      });

      expect(result.assets[0].updated).toEqual(ALL_ASSETS);
      expect(result.assets[0].pruned).toEqual([]);
      expect(await fileExists(staleSkill)).toBe(true);
    },
    INSTALL_TIMEOUT,
  );

  it('未检测到 Polaris 安装：跳过、置退出码 1、不写 lock', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'polaris-update-empty-'));
    const savedExitCode = process.exitCode;

    try {
      const result = await runUpdate(projectPath, { only: ['framework'], json: true });

      expect(result.assetsSkipped).toBe(true);
      expect(result.depsSkipped).toBe(false);
      expect(result.assets).toEqual([]);
      expect(result.statePath).toBeNull();
      expect(process.exitCode).toBe(1);
      expect(await fileExists(path.join(projectPath, '.polaris', 'install-state.json'))).toBe(
        false,
      );
    } finally {
      process.exitCode = savedExitCode;
    }
  });

  it('--only 与 --skip 同时使用直接报错', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'polaris-update-bad-'));
    await expect(
      runUpdate(projectPath, { only: ['framework'], skip: ['deps'], json: true }),
    ).rejects.toThrow(/不能同时使用/);
  });
});
