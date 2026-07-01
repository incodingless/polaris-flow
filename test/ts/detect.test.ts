import path from 'path';
import { mkdir, rm } from 'fs/promises';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { hasSkills, getBaseDir } from '../../src/core/detect.js';
import { PLATFORMS } from '../../src/core/platforms.js';

describe('hasSkills', () => {
  const projectRoot = path.join(process.cwd(), '.tmp-detect-test');
  const trae = PLATFORMS.find((p) => p.id === 'trae')!;

  beforeEach(async () => {
    await mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('project scope 仅在项目 .trae/skills 内有 Superpowers 时返回 true', async () => {
    const baseDir = getBaseDir('project', projectRoot);
    await mkdir(path.join(projectRoot, '.trae', 'skills'), { recursive: true });

    expect(await hasSkills(baseDir, trae, 'superpowers', [], 'project')).toBe(false);

    await mkdir(path.join(projectRoot, '.trae', 'skills', 'brainstorming'), { recursive: true });
    expect(await hasSkills(baseDir, trae, 'superpowers', [], 'project')).toBe(true);
  });
});
