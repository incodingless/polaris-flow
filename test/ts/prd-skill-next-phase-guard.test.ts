/**
 * PRD 族技能「阶段游标推进」守卫。
 *
 * 背景：`complete-phase` 的下一段只在**缺省** `--next-phase` 时按 `workflow.mode`
 * 从阶段表派生（见 src/core/hooks/task-state-entry.ts）；显式传值会覆盖派生结果。
 * prd 族三档序列不同（tweak = discovery → draft → ship），一旦技能写死 `--next-phase`，
 * 简单档就会被强制推进 `refine`，跳过 `ship` 的轻链路直接失去意义。
 *
 * 本守卫盯住两条契约：
 * 1. 不显式传 `--next-phase`；
 * 2. 必带 `--kind requirement`——缺 kind 时无法派生下一段，阶段静默不动。
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const prdSkillsDir = path.join(projectRoot, 'assets', 'zh', 'skills', 'prd');

/** 递归收集目录下的 SKILL.md 绝对路径 */
async function collectSkillFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSkillFiles(full)));
    } else if (entry.name === 'SKILL.md') {
      files.push(full);
    }
  }
  return files;
}

/**
 * 把 bash 续行符拼回逻辑行，避免 `--kind` 与 `complete-phase` 被拆到两行后漏检。
 * 只用于匹配，不用于报告行列号。
 */
function logicalLines(content: string): string[] {
  return content.replace(/\\[ \t]*\r?\n[ \t]*/g, ' ').split(/\r?\n/);
}

describe('prd 族阶段游标推进', () => {
  it('complete-phase 一律不显式传 --next-phase', async () => {
    const skillFiles = await collectSkillFiles(prdSkillsDir);
    expect(skillFiles.length).toBeGreaterThanOrEqual(4);

    const offenders: string[] = [];
    for (const file of skillFiles) {
      const lines = logicalLines(await readFile(file, 'utf8'));
      for (const line of lines) {
        if (line.includes('complete-phase') && line.includes('--next-phase')) {
          offenders.push(path.relative(projectRoot, file));
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('complete-phase 调用一律带 --kind requirement', async () => {
    const skillFiles = await collectSkillFiles(prdSkillsDir);
    const offenders: string[] = [];
    let invocations = 0;

    for (const file of skillFiles) {
      const lines = logicalLines(await readFile(file, 'utf8'));
      for (const line of lines) {
        if (!line.includes('task-state-entry.mjs') || !line.includes('complete-phase')) continue;
        invocations += 1;
        if (!line.includes('--kind requirement')) {
          offenders.push(path.relative(projectRoot, file));
          break;
        }
      }
    }

    // 四阶段各一处；数量掉了说明扫描口径失效，守卫本身要修
    expect(invocations).toBeGreaterThanOrEqual(4);
    expect(offenders).toEqual([]);
  });
});
