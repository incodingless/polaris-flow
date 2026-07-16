/**
 * 写入 `.polaris/skills-lock.json`，供 update/doctor 读取。
 */
import path from 'path';
import { writeFile } from 'fs/promises';

import { ensureDir } from '../../utils/file-system.js';
import type { InstallScope } from '../types.js';

/** lock 中单个来源的版本记录 */
export interface LockSourceEntry {
  id: string;
  version: string;
}

/** skills-lock.json 结构 */
export interface LockFile {
  version: number;
  lang: string;
  scope: string;
  platforms: string[];
  sources: LockSourceEntry[];
  installedAt: string;
}

/** 写入 skills-lock.json */
export async function writeLockFile(
  projectPath: string,
  lang: string,
  scope: InstallScope,
  platformIds: string[],
  sourceEntries: LockSourceEntry[],
): Promise<void> {
  const lock: LockFile = {
    version: 1,
    lang,
    scope,
    platforms: platformIds,
    sources: sourceEntries,
    installedAt: new Date().toISOString(),
  };

  const lockDir = path.join(projectPath, '.polaris');
  await ensureDir(lockDir);
  const lockPath = path.join(lockDir, 'skills-lock.json');
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
}
