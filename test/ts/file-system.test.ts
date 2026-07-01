import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { copyFile, ensureDir, fileExists, readJson } from '../../src/utils/file-system.js';

describe('file-system', () => {
  it('ensureDir and fileExists work together', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pf-fs-'));
    const nested = path.join(tmpDir, 'a', 'b');
    await ensureDir(nested);
    expect(await fileExists(nested)).toBe(true);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('copyFile copies content', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pf-fs-'));
    const src = path.join(tmpDir, 'src.txt');
    const dest = path.join(tmpDir, 'nested', 'dest.txt');
    await ensureDir(tmpDir);
    const { writeFile } = await import('fs/promises');
    await writeFile(src, 'hello', 'utf-8');
    await copyFile(src, dest);
    expect(await readFile(dest, 'utf-8')).toBe('hello');
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('readJson parses json file', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pf-fs-'));
    const jsonPath = path.join(tmpDir, 'data.json');
    const { writeFile } = await import('fs/promises');
    await writeFile(jsonPath, '{"ok":true}', 'utf-8');
    const data = await readJson<{ ok: boolean }>(jsonPath);
    expect(data.ok).toBe(true);
    await rm(tmpDir, { recursive: true, force: true });
  });
});
