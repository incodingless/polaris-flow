/**
 * harness-sync：worktree `.polaris` 产物合回主仓。
 */
import { appendFile, copyFile, mkdir, readdir, rename, rm, readFile } from 'fs/promises';
import path from 'path';

import {
  getChangeArchiveDir,
  getMetricsDir,
  getOverridesLogPath,
  getPolarisDir,
  getTaskStatePath,
} from '../assets/polaris-paths.js';
import { fileExists } from '../../utils/file-system.js';

export type HarnessSyncResult = {
  exitCode: number;
  metrics_files: number;
  overrides_lines: number;
  state_yaml: boolean;
  pre_design: boolean;
  message?: string;
};

export type HarnessSyncConflictMode = '--overwrite' | '--suffix' | '--skip' | '';

/**
 * 合回 `.polaris` 运行态产物（metrics / overrides / state / pre_design）。
 */
export async function runHarnessSync(
  worktreePath: string,
  originRepo: string,
  changeId: string,
  conflictMode: HarnessSyncConflictMode = '',
): Promise<HarnessSyncResult> {
  const empty = {
    metrics_files: 0,
    overrides_lines: 0,
    state_yaml: false,
    pre_design: false,
  };

  if (!worktreePath || !originRepo || !changeId) {
    return {
      exitCode: 1,
      ...empty,
      message:
        '用法: harness-sync <worktree_path> <origin_repo> <change_id> [--overwrite|--suffix|--skip]',
    };
  }

  const wt = path.resolve(worktreePath);
  const origin = path.resolve(originRepo);
  const worktreePolaris = getPolarisDir(wt);
  const originPolaris = getPolarisDir(origin);
  const archiveDir = getChangeArchiveDir(origin, changeId);

  if (!(await fileExists(worktreePolaris))) {
    console.error(`[harness-sync] 警告: ${worktreePolaris} 不存在,跳过合回`);
    return { exitCode: 3, ...empty };
  }

  if (await fileExists(archiveDir)) {
    if (conflictMode === '--overwrite') {
      await rm(archiveDir, { recursive: true, force: true });
    } else if (conflictMode === '--suffix') {
      const suffix = Math.floor(Date.now() / 1000);
      await rename(archiveDir, `${archiveDir}_${suffix}`);
    } else if (conflictMode === '--skip') {
      console.error('[harness-sync] archive 目录已存在,用户选择跳过');
      return { exitCode: 2, ...empty };
    } else {
      console.error(`[harness-sync] archive 目录已存在: ${archiveDir} — 需主代理交互决定`);
      return { exitCode: 2, ...empty };
    }
  }

  await mkdir(archiveDir, { recursive: true });

  let metricsCount = 0;
  let overridesLines = 0;
  let hasState = false;
  let hasPredesign = false;
  let failures = 0;
  //TODO: 这段应该要删除
  const metricsDir = getMetricsDir(wt);
  const originMetrics = getMetricsDir(origin);
  if (await fileExists(metricsDir)) {
    await mkdir(originMetrics, { recursive: true });
    const files = (await readdir(metricsDir)).filter((f) => f.endsWith('-metrics.json'));
    for (const fname of files) {
      const src = path.join(metricsDir, fname);
      const dest = path.join(originMetrics, fname);
      if (!(await fileExists(dest))) {
        try {
          await copyFile(src, dest);
        } catch {
          console.error(`[harness-sync] FAIL: cp ${src} → ${dest}`);
          failures += 1;
        }
      }
      metricsCount += 1;
    }
  }

  const overridesSrc = getOverridesLogPath(wt);
  if (await fileExists(overridesSrc)) {
    try {
      const body = await readFile(overridesSrc, 'utf-8');
      await mkdir(originPolaris, { recursive: true });
      await appendFile(getOverridesLogPath(origin), body, 'utf-8');
      overridesLines = body.split(/\r?\n/).filter((l) => l.length > 0).length;
    } catch {
      console.error(`[harness-sync] FAIL: append overrides.log → ${originPolaris}/overrides.log`);
      failures += 1;
    }
    try {
      await copyFile(overridesSrc, path.join(archiveDir, 'overrides.log'));
    } catch {
      console.error(`[harness-sync] FAIL: cp overrides.log → ${archiveDir}/overrides.log`);
      failures += 1;
    }
  }

  const stateSrc = getTaskStatePath(wt, changeId);
  if (await fileExists(stateSrc)) {
    try {
      await copyFile(stateSrc, path.join(archiveDir, 'state.yaml'));
      hasState = true;
    } catch {
      console.error(`[harness-sync] FAIL: cp state.yaml → ${archiveDir}/state.yaml`);
      failures += 1;
    }
  }

  const result = {
    metrics_files: metricsCount,
    overrides_lines: overridesLines,
    state_yaml: hasState,
    pre_design: hasPredesign,
  };

  if (failures > 0) {
    console.error(`[harness-sync] 完成,但有 ${failures} 项拷贝失败(partial_failure)`);
    return { exitCode: 1, ...result };
  }
  return { exitCode: 0, ...result };
}
