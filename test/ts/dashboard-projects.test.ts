/**
 * 项目注册表口径（D4）单测。
 *
 * D4 的语义是「注册表里存的是**所有被加入 dashboard 做可视化、且使用 polaris-flow
 * 的项目**」，由此推出三条：
 *
 *   1. 加入时必须校验已 `polaris init` —— 只校验「目录存在」会让任意目录进注册表，
 *      之后每个面板都展现空列表，用户还以为是面板坏了
 *   2. 存量失效项**可见但不自动删**（目录可能是临时移走的，自动清理会丢掉用户的选择）
 *   3. `stale` 是**每次读时算**的运行期事实，不落盘 —— 落盘就会变旧，
 *      而变旧的表现是「目录早就回来了、面板还标着失效」
 *
 * 注意：本文件通过 `POLARIS_PROJECTS_FILE` 把注册表指向临时目录。
 * **不这么做就会写用户真实的 `~/.polaris/projects.json`**。
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { addProject, listProjects } from '../../src/dashboard/api/projects.js';

let registryDir: string;
let registryFile: string;
const originalEnv = process.env.POLARIS_PROJECTS_FILE;

/** 造一个「已 polaris init」的目录（判据：.polaris/config.yaml 存在） */
async function initProject(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `polaris-proj-${name}-`));
  await mkdir(path.join(dir, '.polaris'), { recursive: true });
  await writeFile(path.join(dir, '.polaris', 'config.yaml'), 'language: "zh"\n', 'utf-8');
  return dir;
}

async function plainDir(name: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `polaris-plain-${name}-`));
}

beforeEach(async () => {
  registryDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-registry-'));
  registryFile = path.join(registryDir, 'projects.json');
  process.env.POLARIS_PROJECTS_FILE = registryFile;
});

afterAll(() => {
  if (originalEnv === undefined) {
    delete process.env.POLARIS_PROJECTS_FILE;
  } else {
    process.env.POLARIS_PROJECTS_FILE = originalEnv;
  }
});

describe('addProject（D4：必须是 polaris-flow 项目）', () => {
  it('空别名 / 空路径 / 目录不存在 → 各自报错', async () => {
    expect(addProject(JSON.stringify({ name: '', path: '/tmp' })).error).toBeTruthy();
    expect(addProject(JSON.stringify({ name: 'x', path: '' })).error).toBeTruthy();
    expect(
      addProject(JSON.stringify({ name: 'x', path: path.join(os.tmpdir(), 'definitely-missing') }))
        .error,
    ).toMatch(/目录不存在/);
  });

  it('目录存在但未 polaris init → 拒绝，并给出可操作提示', async () => {
    const dir = await plainDir('uninit');
    const res = addProject(JSON.stringify({ name: '未初始化', path: dir }));

    expect(res.project).toBeUndefined();
    expect(res.error).toMatch(/不是 polaris-flow 项目/);
    // 提示里要有「下一步怎么做」，否则用户只知道失败不知道为什么
    expect(res.error).toMatch(/polaris init/);
    // 且不得落进注册表
    expect(listProjects('').projects).toHaveLength(0);
  });

  it('已 init 的目录 → 成功，且返回的视图带 stale=false', async () => {
    const dir = await initProject('ok');
    const res = addProject(JSON.stringify({ name: '正常项目', path: dir }));

    expect(res.error).toBeUndefined();
    expect(res.project?.name).toBe('正常项目');
    expect(res.project?.stale).toBe(false);
    expect(res.project?.reason).toBe('');

    const listed = listProjects('');
    expect(listed.projects).toHaveLength(1);
    expect(listed.defaultProjectId).toBe(res.project?.id);
  });

  it('重复路径 → 拒绝', async () => {
    const dir = await initProject('dup');
    addProject(JSON.stringify({ name: 'a', path: dir }));
    const second = addProject(JSON.stringify({ name: 'b', path: dir }));
    expect(second.error).toMatch(/已存在/);
    expect(listProjects('').projects).toHaveLength(1);
  });

  it('坏 JSON → 报错而不是抛异常', () => {
    expect(addProject('{oops').error).toBeTruthy();
  });
});

describe('listProjects 的 stale 判定', () => {
  it('目录被删 → stale 且原因为「目录不存在」，条目仍在且不被自动删除', async () => {
    const dir = await initProject('gone');
    const added = addProject(JSON.stringify({ name: '会消失', path: dir }));
    await rm(dir, { recursive: true, force: true });

    const listed = listProjects('');
    expect(listed.projects).toHaveLength(1);
    expect(listed.projects[0]?.id).toBe(added.project?.id);
    expect(listed.projects[0]?.stale).toBe(true);
    expect(listed.projects[0]?.reason).toBe('目录不存在');
    // 注册表文件里也没有被悄悄改写掉
    const persisted = JSON.parse(await readFile(registryFile, 'utf-8'));
    expect(persisted.projects).toHaveLength(1);
  });

  it('目录还在但不再是 polaris-flow 项目 → stale 且原因说明缺哪个文件', async () => {
    const dir = await initProject('deinit');
    addProject(JSON.stringify({ name: '被反初始化', path: dir }));
    await rm(path.join(dir, '.polaris', 'config.yaml'));

    const listed = listProjects('');
    expect(listed.projects[0]?.stale).toBe(true);
    expect(listed.projects[0]?.reason).toMatch(/config\.yaml/);
  });

  it('stale 是每次读时算的：目录恢复后立刻变回正常，无需任何清理动作', async () => {
    const dir = await initProject('recover');
    addProject(JSON.stringify({ name: '会回来', path: dir }));
    await rm(path.join(dir, '.polaris', 'config.yaml'));
    expect(listProjects('').projects[0]?.stale).toBe(true);

    await writeFile(path.join(dir, '.polaris', 'config.yaml'), 'language: "zh"\n', 'utf-8');
    expect(listProjects('').projects[0]?.stale).toBe(false);
    expect(listProjects('').projects[0]?.reason).toBe('');
  });
});
