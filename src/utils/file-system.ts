import { access, copyFile as fsCopyFile, mkdir, readFile, readdir } from 'fs/promises';
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
 * 读取 JSON 文件并解析为指定类型。
 */
export async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/** @deprecated 使用 readJson */
export async function readJsonFile<T>(filePath: string): Promise<T> {
  return readJson<T>(filePath);
}

/**
 * 递归创建目录。
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * 复制文件，必要时创建目标目录。
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fsCopyFile(src, dest);
}
