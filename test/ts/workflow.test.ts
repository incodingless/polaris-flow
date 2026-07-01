import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 直接测试 fixture 解析逻辑，避免依赖 git 环境
describe('workflow', () => {
  it('loads workflow fixture with changes', async () => {
    const raw = await readFile(
      path.join(__dirname, '..', 'fixtures', 'workflow', 'workflow.yaml'),
      'utf-8',
    );
    const state = parseYaml(raw) as {
      version: number;
      changes: Array<{ id: string; status: string }>;
    };

    expect(state.version).toBe(1);
    expect(state.changes).toHaveLength(1);
    expect(state.changes[0]?.status).toBe('active');
  });
});
