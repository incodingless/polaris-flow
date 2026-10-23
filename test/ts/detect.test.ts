/**
 * hasSkills / detectPlatforms 组件探测单测。
 */
import path from 'path';
import os from 'os';
import { mkdir, rm, writeFile } from 'fs/promises';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { detectPlatforms, hasSkills } from '../../src/core/integrations/detect.js';

describe('hasSkills', () => {
  const projectRoot = path.join(process.cwd(), '.tmp-detect-test');

  beforeEach(async () => {
    await mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('project scope 仅在项目 .trae/skills 内有 Superpowers 时返回 true', async () => {
    const skillsDir = path.join(projectRoot, '.trae', 'skills');
    await mkdir(skillsDir, { recursive: true });

    expect(await hasSkills(skillsDir, 'superpowers')).toBe(false);

    await mkdir(path.join(skillsDir, 'brainstorming'), { recursive: true });
    expect(await hasSkills(skillsDir, 'superpowers')).toBe(true);
  });

  it('识别 polaris 与 polaris-* 为已安装 polaris（兼容 polaris-flow*）', async () => {
    const claudeSkills = path.join(projectRoot, '.claude', 'skills');
    await mkdir(path.join(claudeSkills, 'polaris'), { recursive: true });
    expect(await hasSkills(claudeSkills, 'polaris')).toBe(true);

    const traeSkills = path.join(projectRoot, '.trae', 'skills');
    await mkdir(path.join(traeSkills, 'polaris-coding-specify'), { recursive: true });
    expect(await hasSkills(traeSkills, 'polaris')).toBe(true);

    const legacy = path.join(projectRoot, '.legacy', 'skills');
    await mkdir(path.join(legacy, 'polaris-flow'), { recursive: true });
    expect(await hasSkills(legacy, 'polaris')).toBe(true);
  });
});

describe('detectPlatforms', () => {
  let projectRoot: string;
  let fakeHome: string;

  beforeEach(async () => {
    const { mkdtemp } = await import('fs/promises');
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'polaris-detect-proj-'));
    fakeHome = await mkdtemp(path.join(os.tmpdir(), 'polaris-detect-home-'));
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(projectRoot, { recursive: true, force: true });
    await rm(fakeHome, { recursive: true, force: true });
  });

  it('项目内已有 .claude 时探测到 claude', async () => {
    await mkdir(path.join(projectRoot, '.claude'), { recursive: true });
    const detected = await detectPlatforms(projectRoot);
    expect(detected.has('claude')).toBe(true);
    expect(detected.has('cursor')).toBe(false);
  });

  it('主目录存在 .cursor 时探测到 cursor（相对 detectionPaths）', async () => {
    await mkdir(path.join(fakeHome, '.cursor'), { recursive: true });
    const detected = await detectPlatforms(projectRoot);
    expect(detected.has('cursor')).toBe(true);
    expect(detected.has('claude')).toBe(false);
  });

  it('主目录 .trae / .trae-cn 分别探测', async () => {
    await mkdir(path.join(fakeHome, '.trae'), { recursive: true });
    await mkdir(path.join(fakeHome, '.trae-cn'), { recursive: true });
    const detected = await detectPlatforms(projectRoot);
    expect(detected.has('trae')).toBe(true);
    expect(detected.has('trae-cn')).toBe(true);
  });

  it('空主目录且无项目上下文时不探测到任何平台', async () => {
    const detected = await detectPlatforms(projectRoot);
    expect(detected.size).toBe(0);
  });

  it('不把绝对路径错误拼到 projectPath 下', async () => {
    await writeFile(path.join(projectRoot, 'Users'), 'nope');
    const detected = await detectPlatforms(projectRoot);
    expect(detected.size).toBe(0);
  });
});
