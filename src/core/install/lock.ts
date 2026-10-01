/**
 * 读写 `.polaris/skills-lock.json`。
 * 该文件是「本地已安装资产」的唯一事实来源：
 * - init 记录 lang / scope / platforms / sources（上游版本）
 * - update 追加各平台各资产类别的源指纹（assets），作为是否重写的门控依据
 * 不再维护 `.polaris/installed-version`（与 lock 重复的第二处状态）。
 */
import path from 'path';
import { writeFile } from 'fs/promises';

import { ensureDir, fileExists } from '../../utils/file-system.js';
import { readJsonObjectOrEmpty } from '../../utils/json-io.js';
import type { InstallScope } from '../config/polaris-project-config.js';
import type { PolarisAssetKind } from './types.js';

/** lock 中单个上游来源的版本记录 */
export interface LockSourceEntry {
  id: string;
  version: string;
}

/** 某平台下各资产类别的源指纹（见 core/update/fingerprint.ts） */
export type PlatformAssetFingerprints = Partial<Record<PolarisAssetKind, string>>;

/** skills-lock.json 结构 */
export interface LockFile {
  version: number;
  lang: string;
  scope: string;
  platforms: string[];
  sources: LockSourceEntry[];
  installedAt: string;
  /** platformId → 各资产类别源指纹；update 据此判断是否需要重写 */
  assets?: Record<string, PlatformAssetFingerprints>;
  /** 最近一次 update 时间（init 不写） */
  updatedAt?: string;
}

/** 返回 lock 落盘路径 */
export function getSkillsLockPath(projectPath: string): string {
  return path.join(projectPath, '.polaris', 'skills-lock.json');
}

/** 写出 lock 对象 */
export async function saveLockFile(projectPath: string, lock: LockFile): Promise<void> {
  const lockDir = path.join(projectPath, '.polaris');
  await ensureDir(lockDir);
  await writeFile(getSkillsLockPath(projectPath), JSON.stringify(lock, null, 2) + '\n', 'utf-8');
}

/** 读取 lock；不存在或内容不是对象时返回 null */
export async function readLockFile(projectPath: string): Promise<LockFile | null> {
  const lockPath = getSkillsLockPath(projectPath);
  if (!(await fileExists(lockPath))) {
    return null;
  }
  try {
    const raw = await readJsonObjectOrEmpty(lockPath);
    if (Object.keys(raw).length === 0) {
      return null;
    }
    return raw as unknown as LockFile;
  } catch {
    return null;
  }
}

/**
 * 供 init 使用：按参数重建 lock，不继承既有 assets 指纹。
 * `assets` 缺省不写 —— init 只记录安装事实，指纹由 update 负责。
 */
export async function writeLockFile(
  projectPath: string,
  lang: string,
  scope: InstallScope,
  platformIds: string[],
  sourceEntries: LockSourceEntry[],
  assets?: Record<string, PlatformAssetFingerprints>,
): Promise<void> {
  const lock: LockFile = {
    version: 1,
    lang,
    scope,
    platforms: platformIds,
    sources: sourceEntries,
    installedAt: new Date().toISOString(),
  };
  if (assets) {
    lock.assets = assets;
  }
  await saveLockFile(projectPath, lock);
}
