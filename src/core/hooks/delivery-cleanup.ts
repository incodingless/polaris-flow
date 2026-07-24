/**
 * ship-cleanup：删除 active entry + 清理 `.polaris/tasks` 残留。
 */
import { rm } from 'fs/promises';
import path from 'path';

import { getTaskDir, getTaskSnapshotDir } from '../assets/polaris-paths.js';
import { runWorkflowEntry } from './workflow-entry.js';

export type DeliveryCleanupResult = { exitCode: number; message?: string };

/**
 * 执行 delivery 清理。
 */
export async function runDeliveryCleanup(
  changeId: string,
  originRepo: string,
): Promise<DeliveryCleanupResult> {
  if (!changeId || !originRepo) {
    return { exitCode: 1, message: '用法: <change_id> <origin_repo>' };
  }
  const root = path.resolve(originRepo);

  const wf = await runWorkflowEntry({
    op: 'delete-active',
    skill: 'ship',
    repoRoot: root,
    whereChangeId: changeId,
  });
  if (wf.exitCode !== 0) {
    console.error('[ship-cleanup] FAIL: delete-active 失败');
    return { exitCode: 1, message: 'delete-active 失败' };
  }

  await rm(getTaskSnapshotDir(root, changeId), {
    recursive: true,
    force: true,
  });
  await rm(getTaskDir(root, changeId), {
    recursive: true,
    force: true,
  });

  return { exitCode: 0 };
}
