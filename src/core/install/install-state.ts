/**
 * 读写 `.polaris/install-state.json` —— 本目录的安装状态记录。
 *
 * ## 为什么叫 install-state
 *
 * 旧名 `skills-lock.json` 两处不准：
 * - 它记的不止 skills，还有 commands / agents / rules / hooks 五类资产指纹
 * - `lock` 容易被读成包管理那种「锁死精确版本保证可复现」的 lockfile（有 integrity、
 *   锁传递依赖），而这里只是「上次操作的结果」，没有 integrity，也不锁传递依赖
 *
 * ## 记录什么
 *
 * - `sources[]`：各依赖上次安装的结果（版本 + 状态），含附带技能
 * - `assets`：各平台各资产类别的源指纹，update 据此判断是否需要重写
 * - `platforms`：该目录装过哪些平台
 *
 * ## 不记录什么
 *
 * - `lang` / `scope`：语言与作用域以 `.polaris/config.yaml` 为准，这里记了也没人读
 * - 时间戳：没有消费者，磁盘上的 mtime 足够
 * - 依赖的「当前版本」：CLI 是机器级共享的，随时会被 `npm i -g` 改；要当前版本就现查
 * - 安装通道：无机器消费场景，排障看安装日志即可
 *
 * 因此 `sources[].version` 是**上次安装基线**，不是当前实际版本。
 */
import path from 'path';
import { writeFile } from 'fs/promises';

import { ensureDir, fileExists } from '../../utils/file-system.js';
import { readJsonObjectOrEmpty } from '../../utils/json-io.js';
import type { PolarisAssetKind } from './types.js';

/** 单条依赖的安装记录 */
export interface InstallSourceEntry {
  id: string;
  /**
   * 上次安装时确定的版本。
   * - 可比版本（npm 包 / npx 上游 tag）→ 具体版本号
   * - 附带技能 → 声明里的钉值（tag 或 commit SHA）
   * - 未装成 → 空串（`isConcreteVersion` 会因此判定「无可比基线」，下次重装）
   */
  version: string;
  status: 'installed' | 'failed' | 'skipped';
}

/** 某平台下各资产类别的源指纹（见 core/update/fingerprint.ts） */
export type PlatformAssetFingerprints = Partial<Record<PolarisAssetKind, string>>;

/** install-state.json 结构 */
export interface InstallState {
  /** 记录格式版本；结构变更时递增，读取方据此判断是否需要重建 */
  version: number;
  /** 该目录装过哪些平台 */
  platforms: string[];
  /** 各依赖的安装结果（含附带技能） */
  sources: InstallSourceEntry[];
  /** platformId → 各资产类别源指纹；update 据此判断是否需要重写 */
  assets?: Record<string, PlatformAssetFingerprints>;
}

/** 返回 install-state 落盘路径 */
export function getInstallStatePath(projectPath: string): string {
  return path.join(projectPath, '.polaris', 'install-state.json');
}

/** 写出 install-state 对象 */
export async function saveInstallState(projectPath: string, state: InstallState): Promise<void> {
  const stateDir = path.join(projectPath, '.polaris');
  await ensureDir(stateDir);
  await writeFile(getInstallStatePath(projectPath), JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

/** 读取 install-state；不存在或内容不是对象时返回 null */
export async function readInstallState(projectPath: string): Promise<InstallState | null> {
  const statePath = getInstallStatePath(projectPath);
  if (!(await fileExists(statePath))) {
    return null;
  }
  try {
    const raw = await readJsonObjectOrEmpty(statePath);
    if (Object.keys(raw).length === 0) {
      return null;
    }
    return raw as unknown as InstallState;
  } catch {
    return null;
  }
}

/**
 * 供 init 使用：按参数重建记录，不继承既有 assets 指纹。
 * `assets` 缺省不写 —— init 只记录安装事实，指纹由 update 负责。
 */
export async function writeInstallState(
  projectPath: string,
  platformIds: string[],
  sourceEntries: InstallSourceEntry[],
  assets?: Record<string, PlatformAssetFingerprints>,
): Promise<void> {
  const state: InstallState = {
    version: 1,
    platforms: platformIds,
    sources: sourceEntries,
  };
  if (assets) {
    state.assets = assets;
  }
  await saveInstallState(projectPath, state);
}
