/**
 * tasks-lint：tasks.md 合规检查。
 */
import { readFile } from 'fs/promises';

import { fileExists } from '../../utils/file-system.js';

export type TasksLintResult = {
  exitCode: number;
  pass: boolean;
  violations: string[];
};

/**
 * 检查 tasks.md。
 */
export async function runTasksLint(filePath: string): Promise<TasksLintResult> {
  if (!filePath || !(await fileExists(filePath))) {
    const msg = `文件不存在或路径为空: ${filePath || '<empty>'}`;
    return { exitCode: 1, pass: false, violations: [msg] };
  }

  const text = await readFile(filePath, 'utf-8');
  const lines = text.split(/\r?\n/);
  const violations: string[] = [];

  if (/Constitution\s*(Compliance\s*)?Audit/i.test(text)) {
    violations.push('含 Constitution Audit 任务组(应由 /ezfl:audit 阶段处理)');
  }

  const docSyncIdx = lines.findIndex((l) => /Documentation Sync/i.test(l));
  const checkLines = docSyncIdx >= 0 ? lines.slice(0, docSyncIdx + 1) : lines;
  if (checkLines.some((l) => /^\s*git\s+(commit|add)/.test(l))) {
    violations.push('含 git commit/add 步骤(应由 /ezfl:ship 阶段处理)');
  }

  if (
    /For agentic workers|REQUIRED SUB-SKILL|superpowers:executing-plans|superpowers:subagent-driven-development/i.test(
      text,
    )
  ) {
    violations.push('含 superpowers 执行入口 header(应使用 easy-flow 标准格式)');
  }

  const totalLines = lines.length;
  let inCode = false;
  let codeLines = 0;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) codeLines += 1;
  }
  if (totalLines > 0 && codeLines > 0) {
    const ratio = Math.floor((codeLines * 100) / totalLines);
    if (ratio > 40) {
      violations.push(`代码块占比 ${ratio}%(${totalLines}行的40%),内嵌代码过多`);
    }
  }

  if (!/Documentation Sync/i.test(text)) {
    violations.push('缺少 Documentation Sync 末位任务组');
  }

  const tddLineNums: number[] = [];
  lines.forEach((l, i) => {
    if (/<!-- TDD/.test(l)) tddLineNums.push(i);
  });
  let missing = 0;
  for (const idx of tddLineNums) {
    const slice = lines.slice(idx, idx + 31);
    const sub = slice.filter((l) => /^\s*-\s*\[[ x]\]\s*[0-9]+\.[0-9]+\.[0-9]+/.test(l)).length;
    if (sub < 3) missing += 1;
  }
  if (missing > 0) {
    violations.push(`${missing} 个 TDD 任务缺少 5 步子任务结构(N.M.1~N.M.5)`);
  }

  if (violations.length === 0) {
    return { exitCode: 0, pass: true, violations: [] };
  }
  return { exitCode: 1, pass: false, violations };
}
