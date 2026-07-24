/**
 * YAML 文件读写小工具：序列化写入等。
 * 供 config、install layout 等多处复用。
 */
import { writeFile } from 'fs/promises';
import path from 'path';
import { stringify as stringifyYaml } from 'yaml';

import { ensureDir } from './file-system.js';

/**
 * 将对象序列化为 YAML 并写入文件（末尾保证换行），必要时创建父目录。
 */
export async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const text = stringifyYaml(value, { lineWidth: 0 });
  await writeFile(filePath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}
