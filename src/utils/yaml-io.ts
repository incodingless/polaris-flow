/**
 * YAML 文件读写：对象落盘，以及按模板渲染后分发。
 * 模板分发统一走 `renderYamlTemplate` / `writeYamlFromTemplate`，由 `keepComments` 决定是否保留源注释。
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { parseDocument, stringify as stringifyYaml, type Document } from 'yaml';

import { ensureDir } from './file-system.js';

/** 从 YAML 模板渲染落盘内容时的选项 */
export type YamlTemplateOptions = {
  /** 为 true 时保留模板注释；为 false 时只写出数据节点 */
  keepComments: boolean;
  /** 写出前改文档（设字段、删键）。保留注释时，注释仍锚在原节点上 */
  transform?: (doc: Document) => void;
};

/**
 * 将对象序列化为 YAML 并写入文件（末尾保证换行），必要时创建父目录。
 */
export async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const text = stringifyYaml(value, { lineWidth: 0 });
  await writeFile(filePath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}

/**
 * 把 YAML 模板文本渲染成待写入字符串。
 * 保留注释且不改文档时原样返回（注释和空白都不动）。
 * 需要改字段时解析成 Document：`keepComments` 为 true 则序列化时留下注释，为 false 则只输出数据。
 */
export function renderYamlTemplate(templateText: string, options: YamlTemplateOptions): string {
  if (options.keepComments && !options.transform) {
    return templateText.endsWith('\n') ? templateText : `${templateText}\n`;
  }
  const doc = parseDocument(
    templateText,
    options.keepComments ? { keepSourceTokens: true } : undefined,
  );
  options.transform?.(doc);
  const text = options.keepComments ? String(doc) : stringifyYaml(doc.toJS(), { lineWidth: 0 });
  return text.endsWith('\n') ? text : `${text}\n`;
}

/**
 * 读取 YAML 模板，按 `keepComments` 渲染后写入目标路径，并创建父目录。
 */
export async function writeYamlFromTemplate(
  srcPath: string,
  destPath: string,
  options: YamlTemplateOptions,
): Promise<void> {
  const templateText = await readFile(srcPath, 'utf-8');
  const text = renderYamlTemplate(templateText, options);
  await ensureDir(path.dirname(destPath));
  await writeFile(destPath, text, 'utf-8');
}
