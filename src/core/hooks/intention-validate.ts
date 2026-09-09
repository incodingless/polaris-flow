/**
 * intention.md 必含节完整性校验（对齐 plan Step 2.2 / intention-template）。
 * 由 `polaris intention-validate` 调用；本层只返回结果，不写 stdout/stderr。
 */
import { readFile } from 'fs/promises';

import { fileExists } from '../../utils/file-system.js';

/** plan 必含节（节名须与模板一致） */
export const INTENTION_REQUIRED_SECTIONS = [
  '## Reframe 历程',
  '## 宪法对齐',
  '## 前提',
  '## 目标',
  '## 结论（架构 + 技术选型）',
  '## 备选方案',
  '## 任务范围（Scope）',
  '## 验收场景及标准',
  '## 待决问题',
] as const;

export type IntentionValidateResult = {
  exitCode: number;
  missing: string[];
  /** 不完整时供命令层 stdout JSON */
  payload?: { missing: string[] };
  message?: string;
};

/**
 * 判断节正文是否非空（去掉空白与纯 HTML 注释后仍有内容）。
 */
export function isSectionBodyNonEmpty(body: string): boolean {
  const withoutComments = body.replace(/<!--[\s\S]*?-->/g, '');
  return withoutComments.trim().length > 0;
}

/**
 * 按 `## ` 标题切分文档，返回 heading → body 映射（heading 含 ## 前缀）。
 */
export function splitMarkdownSections(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/);
  const map = new Map<string, string>();
  let current: string | null = null;
  const buf: string[] = [];

  const flush = () => {
    if (current !== null) {
      map.set(current, buf.join('\n'));
    }
    buf.length = 0;
  };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flush();
      current = line.trim();
      continue;
    }
    if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  return map;
}

/**
 * 校验 intention.md：文件存在、必含节齐全且非空。
 */
export async function runIntentionValidate(filePath: string): Promise<IntentionValidateResult> {
  if (!filePath || !(await fileExists(filePath))) {
    return {
      exitCode: 1,
      missing: [],
      message: `intention.md 不存在: ${filePath || '<empty>'}`,
    };
  }

  const text = await readFile(filePath, 'utf-8');
  const sections = splitMarkdownSections(text);
  const missing: string[] = [];

  for (const heading of INTENTION_REQUIRED_SECTIONS) {
    if (!sections.has(heading)) {
      missing.push(heading);
      continue;
    }
    if (!isSectionBodyNonEmpty(sections.get(heading) ?? '')) {
      missing.push(heading);
    }
  }

  if (missing.length === 0) {
    return { exitCode: 0, missing: [] };
  }

  return {
    exitCode: 2,
    missing,
    payload: { missing },
    message: `intention.md 不完整，缺失节 ${missing.join(' ')}，请回到 /polaris-flow-specify 补齐。`,
  };
}
