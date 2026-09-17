/**
 * Worktree 相关 hook 核心：创建隔离 worktree、合入状态检查、rebase + ff merge、提交并移除。
 * 由 `polaris worktree-create` / `worktree-merge-status` / `worktree-rebase-ff` / `worktree-commit-remove` 调用。
 */
import { execFileSync, type StdioOptions } from 'child_process';
import { appendFile, mkdir, rename } from 'fs/promises';
import { cpSync } from 'fs';
import path from 'path';

import {
  getTaskDir,
  getTaskSnapshotDir,
  getTaskStatePath,
  getTasksDir,
  getWorktreePath,
  getWorktreeRoot,
} from '../assets/polaris-paths.js';
import { fileExists } from '../../utils/file-system.js';

export type CreateResult = {
  exitCode: number;
  payload?: { target_path: string; target_branch: string; snapshot_path: string };
  message?: string;
};

export type MergeResult = { exitCode: number; message?: string };

export type RebaseResult = {
  exitCode: number;
  defaultBranch?: string;
  message?: string;
};

export type CommitRemoveResult = {
  exitCode: number;
  payload?: {
    worktree_path: string;
    branch: string;
    committed: boolean;
    removed: boolean;
  };
  message?: string;
};

type GitOpts = {
  encoding?: BufferEncoding;
  stdio?: StdioOptions;
};

/**
 * 在指定目录执行 git；失败抛错由调用方处理。
 */
function git(cwd: string, args: string[], opts: GitOpts = {}): string {
  const result = execFileSync('git', args, {
    cwd,
    encoding: opts.encoding ?? 'utf-8',
    stdio: opts.stdio ?? 'pipe',
  });
  return typeof result === 'string' ? result : '';
}

/**
 * 创建隔离 worktree（对齐 worktree-create.sh）。
 */
export async function create(changeId: string, mainRepoRoot: string): Promise<CreateResult> {
  if (!changeId || !mainRepoRoot) {
    return { exitCode: 1, message: '用法: worktree-create <change_id> <main_repo_root>' };
  }
  if (!/^[a-z][a-z0-9-]+-[0-9a-f]{6}$/.test(changeId)) {
    return {
      exitCode: 1,
      message: `change_id 格式不合规：${changeId} (期望 ^[a-z][a-z0-9-]+-[0-9a-f]{6}$)`,
    };
  }

  const root = path.resolve(mainRepoRoot);
  const targetPath = getWorktreePath(root, changeId);
  const targetBranch = `feature/${changeId}`;
  const changesSrc = getTaskDir(root, changeId);
  const snapshotPath = getTaskSnapshotDir(root, changeId);

  try {
    git(root, ['check-ignore', '-q', '.worktrees'], { stdio: 'ignore' });
  } catch {
    await appendFile(path.join(root, '.gitignore'), '.worktrees/\n', 'utf-8');
    try {
      git(root, ['add', '.gitignore'], { stdio: 'pipe' });
      git(root, ['commit', '-m', 'chore: ignore .worktrees/ for polaris-flow', '--no-verify'], {
        stdio: 'ignore',
      });
    } catch {
      // ignore commit failure
    }
  }

  if (await fileExists(targetPath)) {
    return {
      exitCode: 1,
      message: `worktree 路径 ${targetPath} 已存在，请先 git worktree remove 或回到 design 用新 slug 重做`,
    };
  }
  try {
    git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${targetBranch}`], {
      stdio: 'ignore',
    });
    return { exitCode: 1, message: `分支 ${targetBranch} 已存在` };
  } catch {
    // branch does not exist — ok
  }
  if (await fileExists(snapshotPath)) {
    return {
      exitCode: 1,
      message: `上次 plan 残留快照目录 ${snapshotPath} 存在，请人工确认后删除`,
    };
  }

  await mkdir(getWorktreeRoot(root), { recursive: true });
  try {
    git(root, ['worktree', 'add', targetPath, '-b', targetBranch], { stdio: 'pipe' });
  } catch {
    return { exitCode: 1, message: 'git worktree add 失败' };
  }

  if (await fileExists(changesSrc)) {
    await mkdir(getTasksDir(targetPath), { recursive: true });
    try {
      cpSync(changesSrc, getTaskDir(targetPath, changeId), {
        recursive: true,
      });
    } catch {
      try {
        git(root, ['worktree', 'remove', '--force', targetPath], { stdio: 'ignore' });
      } catch {
        // ignore
      }
      return { exitCode: 1, message: `拷贝 tasks/${changeId} 到 worktree 失败` };
    }
    await rename(changesSrc, snapshotPath);
  }

  const stateFile = getTaskStatePath(targetPath, changeId);
  if (await fileExists(stateFile)) {
    const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    await appendFile(
      stateFile,
      [
        'worktree:',
        '  created_by_polaris_flow: true',
        `  path: "${targetPath}"`,
        `  branch: "${targetBranch}"`,
        `  origin_repo: "${root}"`,
        `  created_at: "${createdAt}"`,
        '  status: active',
        '',
      ].join('\n'),
      'utf-8',
    );
  }

  return {
    exitCode: 0,
    payload: {
      target_path: targetPath,
      target_branch: targetBranch,
      snapshot_path: snapshotPath,
    },
  };
}

/**
 * 脏检查 + 分支是否已合入主干（对齐 worktree-merge-status.sh）。
 */
export async function merge(
  worktreePath: string,
  originRepo: string,
  branch: string,
): Promise<MergeResult> {
  if (!worktreePath || !originRepo || !branch) {
    return { exitCode: 3, message: '用法: <worktree_path> <origin_repo> <branch>' };
  }
  const wt = path.resolve(worktreePath);
  const origin = path.resolve(originRepo);
  if (!(await fileExists(wt)) || !(await fileExists(origin))) {
    return { exitCode: 3, message: 'worktree_path 或 origin_repo 不是目录' };
  }

  let dirty = '';
  try {
    dirty = git(wt, ['status', '--porcelain']).trim();
  } catch {
    return { exitCode: 3, message: 'git status 异常' };
  }
  if (dirty) {
    console.error('[easy-flow] 阻断：worktree 有未提交文件,请先 commit 再 ship。');
    try {
      console.error(git(wt, ['status', '--short']));
    } catch {
      // ignore
    }
    return { exitCode: 2 };
  }

  try {
    git(origin, ['merge-base', '--is-ancestor', branch, 'HEAD'], { stdio: 'ignore' });
    return { exitCode: 0 };
  } catch {
    return { exitCode: 1 };
  }
}

/**
 * worktree rebase 到默认分支后，主仓 ff-only 合入（对齐 worktree-rebase-ff.sh）。
 */
export async function rebase(
  worktreePath: string,
  originRepo: string,
  branch: string,
): Promise<RebaseResult> {
  if (!worktreePath || !originRepo || !branch) {
    return { exitCode: 3, message: '用法: <worktree_path> <origin_repo> <branch>' };
  }
  const wt = path.resolve(worktreePath);
  const origin = path.resolve(originRepo);

  let defaultBranch = '';
  try {
    const ref = git(origin, ['symbolic-ref', 'refs/remotes/origin/HEAD']).trim();
    defaultBranch = ref.replace(/^refs\/remotes\/origin\//, '');
  } catch {
    return {
      exitCode: 3,
      message: '无法解析 origin/HEAD,请先 git remote set-head origin -a',
    };
  }
  if (!defaultBranch) {
    return {
      exitCode: 3,
      message: '无法解析 origin/HEAD,请先 git remote set-head origin -a',
    };
  }

  try {
    git(wt, ['rebase', defaultBranch], { stdio: 'inherit' });
  } catch {
    console.error(
      '[easy-flow] rebase 冲突 → 请在 worktree 内手动 git rebase --continue 解决后重新触发 /ezfl:ship,不自动放弃 worktree。',
    );
    return { exitCode: 1 };
  }

  try {
    git(origin, ['checkout', defaultBranch], { stdio: 'inherit' });
    git(origin, ['merge', '--ff-only', branch], { stdio: 'inherit' });
  } catch {
    console.error('[worktree-rebase-ff] git merge --ff-only 失败');
    return { exitCode: 2 };
  }

  process.stdout.write(defaultBranch);
  return { exitCode: 0, defaultBranch };
}

/**
 * 在 worktree 内 `git add -A` + `commit`（已干净则跳过提交），再从主仓 `worktree remove`。
 * 不 push、不删分支。
 */
export async function commitAndRemove(
  worktreePath: string,
  commitMessage: string,
): Promise<CommitRemoveResult> {
  if (!worktreePath || !commitMessage?.trim()) {
    return {
      exitCode: 1,
      message: '用法: worktree-commit-remove <worktree_path> --message <msg>',
    };
  }

  const wt = path.resolve(worktreePath);
  if (!(await fileExists(wt))) {
    return { exitCode: 1, message: `worktree 路径不存在: ${wt}` };
  }

  let mainRepo: string;
  let branch = '';
  try {
    const commonDirRaw = git(wt, ['rev-parse', '--git-common-dir']).trim();
    const commonDir = path.isAbsolute(commonDirRaw)
      ? commonDirRaw
      : path.resolve(wt, commonDirRaw);
    mainRepo = path.dirname(commonDir);
    branch = git(wt, ['branch', '--show-current']).trim();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, message: `无法解析主仓或当前分支: ${detail}` };
  }

  let committed = false;
  let dirty = '';
  try {
    dirty = git(wt, ['status', '--porcelain']).trim();
  } catch {
    return { exitCode: 1, message: 'git status 异常' };
  }

  if (dirty) {
    try {
      git(wt, ['add', '-A'], { stdio: 'pipe' });
      git(wt, ['commit', '-m', commitMessage.trim()], { stdio: 'pipe' });
      committed = true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { exitCode: 1, message: `worktree 内提交失败: ${detail}` };
    }
  }

  try {
    git(mainRepo, ['worktree', 'remove', wt], { stdio: 'pipe' });
  } catch {
    try {
      git(mainRepo, ['worktree', 'remove', '--force', wt], { stdio: 'pipe' });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        message: `git worktree remove 失败（已提交=${committed}）: ${detail}`,
        payload: {
          worktree_path: wt,
          branch,
          committed,
          removed: false,
        },
      };
    }
  }

  return {
    exitCode: 0,
    payload: {
      worktree_path: wt,
      branch,
      committed,
      removed: true,
    },
  };
}
