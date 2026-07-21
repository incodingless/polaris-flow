/**
 * constitution-validity：宪法文件有效性判定。
 * 退出码：0=有效，1=无效，2=不存在。
 */
import { readFile } from 'fs/promises';
import path from 'path';

import { getConstitutionPath, loadPolarisConfig } from '../config/polaris-config.js';
import { fileExists } from '../../utils/file-system.js';

export type ConstitutionValidityResult = { exitCode: number };

/**
 * 检查宪法文件。
 * 路径优先级：显式参数 → CONSTITUTION_PATH → config.constitution.path → 默认。
 */
export async function runConstitutionValidity(
  projectPath: string = process.cwd(),
  constitutionPath?: string,
): Promise<ConstitutionValidityResult> {
  let rel = constitutionPath || process.env.CONSTITUTION_PATH;
  if (!rel) {
    const config = await loadPolarisConfig(projectPath);
    rel = getConstitutionPath(config);
  }
  const full = path.isAbsolute(rel) ? rel : path.join(projectPath, rel);

  if (!(await fileExists(full))) {
    return { exitCode: 2 };
  }

  const text = await readFile(full, 'utf-8');
  if (/\[[A-Z][A-Z_]+\]/.test(text)) {
    return { exitCode: 1 };
  }
  if (!text.includes('## Core Principles')) {
    return { exitCode: 1 };
  }
  if (!/^\*\*Version\*\*:/m.test(text)) {
    return { exitCode: 1 };
  }
  return { exitCode: 0 };
}
