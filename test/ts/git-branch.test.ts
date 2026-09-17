/**
 * git-branch：hotfix 创建 + 指定分支合并进主干。
 */
import { execFileSync } from 'child_process';
import { mkdtemp, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  createHotfixBranch,
  mergeBranchToMain,
  resolveMainBranch,
  sanitizeIssueId,
} from '../../src/core/hooks/git-branch.js';

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

/** 在临时目录初始化仅含 main 的 git 仓库 */
async function initRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-git-branch-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'pipe', env: gitEnv });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], {
    cwd: root,
    stdio: 'pipe',
    env: gitEnv,
  });
  execFileSync('git', ['config', 'user.name', 'test'], {
    cwd: root,
    stdio: 'pipe',
    env: gitEnv,
  });
  await writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf-8');
  execFileSync('git', ['add', 'seed.txt'], { cwd: root, stdio: 'pipe', env: gitEnv });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'pipe', env: gitEnv });
  return root;
}

/** 当前分支名 */
function currentBranch(root: string): string {
  return execFileSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf-8',
    env: gitEnv,
  }).trim();
}

describe('git-branch sanitizeIssueId', () => {
  it('保留 Jira 单号风格并清洗空格', () => {
    expect(sanitizeIssueId('PROJ-123')).toBe('PROJ-123');
    expect(sanitizeIssueId('  foo bar  ')).toBe('foo-bar');
  });
});

describe('git-branch createHotfixBranch', () => {
  it('干净工作区：基于 main 创建 hotfix/<id> 并切换', async () => {
    const root = await initRepo();
    expect(resolveMainBranch(root)).toBe('main');

    const result = await createHotfixBranch('PROJ-123', root);
    expect(result.exitCode).toBe(0);
    expect(result.payload).toEqual({
      main_branch: 'main',
      hotfix_branch: 'hotfix/PROJ-123',
    });
    expect(currentBranch(root)).toBe('hotfix/PROJ-123');
  });

  it('有未提交变更时失败且不切分支', async () => {
    const root = await initRepo();
    await writeFile(path.join(root, 'dirty.txt'), 'x\n', 'utf-8');

    const result = await createHotfixBranch('PROJ-1', root);
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/未提交/);
    expect(result.payload).toBeUndefined();
    expect(currentBranch(root)).toBe('main');
  });

  it('hotfix 分支已存在时失败', async () => {
    const root = await initRepo();
    execFileSync('git', ['branch', 'hotfix/PROJ-9'], { cwd: root, stdio: 'pipe', env: gitEnv });

    const result = await createHotfixBranch('PROJ-9', root);
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/已存在/);
  });

  it('缺少参数时失败', async () => {
    const result = await createHotfixBranch('', '/tmp');
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/用法/);
  });
});

describe('git-branch mergeBranchToMain', () => {
  it('将 hotfix 分支 --no-ff 合并进 main 并停留在 main', async () => {
    const root = await initRepo();
    const created = await createHotfixBranch('H-1', root);
    expect(created.exitCode).toBe(0);

    await writeFile(path.join(root, 'fix.txt'), 'fix\n', 'utf-8');
    execFileSync('git', ['add', 'fix.txt'], { cwd: root, stdio: 'pipe', env: gitEnv });
    execFileSync('git', ['commit', '-m', 'fix'], { cwd: root, stdio: 'pipe', env: gitEnv });

    const merged = await mergeBranchToMain('hotfix/H-1', root);
    expect(merged.exitCode).toBe(0);
    expect(merged.payload).toEqual({
      main_branch: 'main',
      source_branch: 'hotfix/H-1',
    });
    expect(currentBranch(root)).toBe('main');

    // 源分支仍在
    execFileSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/hotfix/H-1'], {
      cwd: root,
      stdio: 'pipe',
      env: gitEnv,
    });
  });

  it('脏工作区合并失败', async () => {
    const root = await initRepo();
    await createHotfixBranch('H-2', root);
    await writeFile(path.join(root, 'dirty.txt'), 'x\n', 'utf-8');

    const result = await mergeBranchToMain('hotfix/H-2', root);
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/未提交/);
  });

  it('源分支不存在时失败', async () => {
    const root = await initRepo();
    const result = await mergeBranchToMain('hotfix/missing', root);
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/不存在/);
  });

  it('源分支与主干相同时失败', async () => {
    const root = await initRepo();
    const result = await mergeBranchToMain('main', root);
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/相同/);
  });
});
