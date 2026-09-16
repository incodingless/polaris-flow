/**
 * workflow fixture 解析冒烟：确认模板形状为四列表游标。
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('workflow', () => {
  it('loads workflow fixture with coding_tasks', async () => {
    const raw = await readFile(
      path.join(__dirname, '..', 'fixtures', 'workflow', 'workflow.yaml'),
      'utf-8',
    );
    const state = parseYaml(raw) as {
      coding_tasks: Array<{ task_id: string; phase: string }>;
      requirement_tasks: unknown[];
      testcase_tasks: unknown[];
      prototype_tasks: unknown[];
    };

    expect(state.coding_tasks).toHaveLength(1);
    expect(state.coding_tasks[0]?.task_id).toBe('add-feature-x');
    expect(state.coding_tasks[0]?.phase).toBe('plan');
    expect(state.requirement_tasks).toEqual([]);
    expect(state.testcase_tasks).toEqual([]);
    expect(state.prototype_tasks).toEqual([]);
  });
});
