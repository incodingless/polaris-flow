/**
 * 带 overwrite/skip 语义的拷贝任务执行器，供 skills/rules/agents/commands 共用。
 */
import { fileExists } from './file-system.js';

/** 单条拷贝任务：目标路径 + 写出回调 */
export type CopyJob = {
  /** 用于日志的逻辑名 */
  label: string;
  dest: string;
  /** 实际写出；失败由本函数捕获并打日志 */
  write: () => Promise<void>;
};

/**
 * 顺序执行拷贝任务。
 * overwrite=false 且目标已存在时计入 skipped，不调用 write。
 */
export async function runCopyJobs(
  jobs: CopyJob[],
  overwrite: boolean,
): Promise<{ copied: number; skipped: number }> {
  let copied = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (!overwrite && (await fileExists(job.dest))) {
      skipped++;
      continue;
    }
    try {
      await job.write();
      copied++;
    } catch (err) {
      console.error(`    Failed to copy ${job.label}: ${(err as Error).message}`);
    }
  }

  return { copied, skipped };
}
