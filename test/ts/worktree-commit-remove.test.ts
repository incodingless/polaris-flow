/**
 * worktree-commit-remove：worktree 内提交后 remove。
 */
import { execFileSync } from 'child_process';
import { access, mkdtemp, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { commitAndRemove } from '../../src/core/hooks/worktree.js';

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

/** git 辅助 */
function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', env: gitEnv, stdio: 'pipe' });
}

/** 主仓 + 带改动的 worktree */
async function setupDirtyWorktree(): Promise<{ main: string; wt: string; branch: string }> {
  const main = await mkdtemp(path.join(os.tmpdir(), 'polaris-wt-main-'));
  git(main, ['init', '-b', 'main']);
  git(main, ['config', 'user.email', 'test@example.com']);
  git(main, ['config', 'user.name', 'test']);
  await writeFile(path.join(main, 'seed.txt'), 'seed\n', 'utf-8');
  git(main, ['add', 'seed.txt']);
  git(main, ['commit', '-m', 'init']);

  const wtRoot = await mkdtemp(path.join(os.tmpdir(), 'polaris-wt-list-'));
  const wt = path.join(wtRoot, 'fix-wt');
  const branch = 'feature/test-fix';
  git(main, ['worktree', 'add', '-b', branch, wt]);
  await writeFile(path.join(wt, 'fix.txt'), 'fix\n', 'utf-8');
  return { main, wt, branch };
}

describe('worktree commitAndRemove', () => {
  it('有改动时提交并移除 worktree', async () => {
    const { main, wt, branch } = await setupDirtyWorktree();
    const result = await commitAndRemove(wt, 'fix: closeout');
    expect(result.exitCode).toBe(0);
    expect(result.payload).toMatchObject({
      branch,
      committed: true,
      removed: true,
    });

    await expect(access(wt)).rejects.toThrow();
    // 分支仍在主仓
    git(main, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  });

  it('已干净时跳过提交仍 remove', async () => {
    const { wt, branch } = await setupDirtyWorktree();
    git(wt, ['add', '-A']);
    git(wt, ['commit', '-m', 'pre-commit']);

    const result = await commitAndRemove(wt, 'unused message');
    expect(result.exitCode).toBe(0);
    expect(result.payload?.committed).toBe(false);
    expect(result.payload?.removed).toBe(true);
    expect(result.payload?.branch).toBe(branch);
    await expect(access(wt)).rejects.toThrow();
  });

  it('缺少 message 时失败', async () => {
    const result = await commitAndRemove('/tmp/x', '  ');
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/用法/);
  });
});
