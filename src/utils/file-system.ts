import { access, copyFile as fsCopyFile, mkdir, readFile, readdir, rm, stat } from 'fs/promises';
import path from 'path';

/**
 * 判断路径是否存在。
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取目录下的条目名称（不含 . 与 ..）。
 */
export async function readDir(dirPath: string): Promise<string[]> {
  return readdir(dirPath);
}

/**
 * 递归创建目录。
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * 递归创建目录；失败时打日志并跳过（如无写权限），不抛错。
 */
export async function ensureDirSafe(dirPath: string): Promise<void> {
  try {
    await ensureDir(dirPath);
  } catch (err) {
    console.error(`    mkdir skipped (${dirPath}): ${(err as Error).message}`);
  }
}

/**
 * 复制文件，必要时创建目标目录。
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fsCopyFile(src, dest);
}

/**
 * 目标不存在时复制源文件；源缺失或无写权限则打日志跳过，不抛错。
 */
export async function copyIfMissing(src: string, dest: string): Promise<void> {
  try {
    if (await fileExists(dest)) {
      return;
    }
    if (!(await fileExists(src))) {
      console.error(`    copy skipped, source not found: ${src}`);
      return;
    }
    await copyFile(src, dest);
  } catch (err) {
    console.error(`    copy skipped (${dest}): ${(err as Error).message}`);
  }
}

/**
 * 判断路径是否为目录；不存在或非目录返回 false。
 */
export async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    return (await stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 递归列出目录下所有文件的相对路径（统一为 posix `/` 分隔符）。
 * 根目录不存在时返回空数组。
 * @param rootDir 扫描根目录
 * @param relativeTo 相对路径基准，默认等于 rootDir
 */
export async function walkFilesSafe(
  rootDir: string,
  relativeTo: string = rootDir,
): Promise<string[]> {
  if (!(await fileExists(rootDir))) {
    return [];
  }

  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        results.push(path.relative(relativeTo, fullPath).split(path.sep).join('/'));
      }
    }
  }

  await walk(rootDir);
  return results;
}

/**
 * 递归将源目录内容拷贝到目标目录（目标不存在则创建）。
 * 源目录不存在时静默返回。
 */
export async function copyDirContents(srcDir: string, destDir: string): Promise<void> {
  if (!(await fileExists(srcDir))) {
    return;
  }
  await ensureDir(destDir);
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirContents(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

//---------------------------------
//       带 overwrite 的拷贝任务
//---------------------------------

/** 单条拷贝任务：目标路径 + 写出回调 */
export type CopyJob = {
  /** 用于日志的逻辑名 */
  label: string;
  type: 'file' | 'dir';
  src: string;
  dest: string;
  overwrite: boolean;
  write?: () => Promise<CopyResult>;
};

export type CopyResult = {
  job: CopyJob;
  result: 'copied' | 'skipped' | 'failed';
  error?: Error;
};

/**
 * 顺序执行拷贝任务。
 * overwrite=false 且目标已存在时计入 skipped，不调用 write。
 */
export async function runCopyJobs(
  jobs: CopyJob[],
): Promise<{ copied: number; skipped: number; results: CopyResult[] }> {
  const results: CopyResult[] = [];
  for (const job of jobs) {
    try {
      // 判断write方法是否存在
      if (job.write) {
        results.push(await job.write());
      } else {
        results.push(await runCopyJob(job));
      }
    } catch (err) {
      results.push({ job, result: 'failed', error: err as Error });
    }
  }
  return {
    copied: results.filter((r) => r.result === 'copied').length,
    skipped: results.filter((r) => r.result === 'skipped').length,
    results: results,
  };
}

export async function runCopyJob(job: CopyJob): Promise<CopyResult> {
  const existed = await fileExists(job.dest);
  if (existed && !job.overwrite) {
    return { job, result: 'skipped' };
  }
  if (existed) {
    if (job.type === 'dir') {
      await rm(job.dest, { recursive: true });
    } else {
      await rm(job.dest);
    }
  }
  if (job.type === 'dir') {
    await copyDirContents(job.src, job.dest);
  } else {
    await copyFile(job.src, job.dest);
  }
  return { job, result: 'copied' };
}
