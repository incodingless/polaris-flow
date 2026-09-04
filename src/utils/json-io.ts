/**
 * JSON 文件读写小工具：读对象、美化写入、读改写回。
 * 供 hooks 安装、Pi extension 等多处复用。
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

import { ensureDir, fileExists } from './file-system.js';

/** 读取 JSON 对象；文件缺失或解析失败时返回空对象 */
export async function readJsonObjectOrEmpty(filePath: string): Promise<Record<string, unknown>> {
  if (!(await fileExists(filePath))) {
    return {};
  }
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 美化写入 JSON（2 空格缩进 + 末尾换行），必要时创建父目录 */
export async function writeJsonPretty(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

/**
 * 读取 JSON、经 mutator 修改后写回。
 * mutator 可就地修改传入对象，返回值若为对象则用于覆盖写出内容。
 */
export async function updateJsonFile(
  filePath: string,
  mutator: (current: Record<string, unknown>) => Record<string, unknown> | void,
): Promise<void> {
  const current = await readJsonObjectOrEmpty(filePath);
  const next = mutator(current) ?? current;
  await writeJsonPretty(filePath, next);
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
