/**
 * Git 分支操作：基于主干创建 hotfix 分支、将指定分支合并回主干。
 * 由 `polaris hotfix-branch-create` / `git-branch-merge` 及对应 scripts 薄包装调用。
 */
import { execFileSync, type StdioOptions } from 'child_process';
import path from 'path';

import { fileExists } from '../../utils/file-system.js';

export type HotfixBranchCreateResult = {
  exitCode: number;
  payload?: { main_branch: string; hotfix_branch: string };
  message?: string;
};

export type MergeBranchToMainResult = {
  exitCode: number;
  payload?: { main_branch: string; source_branch: string };
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
 * 清洗 issue_id：去首尾空白，空格→`-`，去掉路径不安全字符。
 */
export function sanitizeIssueId(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/**
 * 探测主干分支名：优先 origin/HEAD，否则本地 main / master。
 */
export function resolveMainBranch(cwd: string): string | null {
  try {
    const ref = git(cwd, ['symbolic-ref', 'refs/remotes/origin/HEAD']).trim();
    const name = ref.replace(/^refs\/remotes\/origin\//, '');
    if (name) return name;
  } catch {
    // 无 origin/HEAD
  }
  for (const candidate of ['main', 'master'] as const) {
    try {
      git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${candidate}`], {
        stdio: 'ignore',
      });
      return candidate;
    } catch {
      // 本地无该分支
    }
  }
  return null;
}

/**
 * 当前工作区是否有未提交变更（含未跟踪）。
 */
export function isWorkingTreeDirty(cwd: string): boolean {
  const dirty = git(cwd, ['status', '--porcelain']).trim();
  return dirty.length > 0;
}

/**
 * 本地是否已存在指定分支。
 */
function localBranchExists(cwd: string, branch: string): boolean {
  try {
    git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析仓库根并探测主干；失败时返回带 exitCode 的结果。
 */
async function resolveRepoAndMain(
  repoRoot: string,
): Promise<
  | { ok: true; root: string; mainBranch: string }
  | { ok: false; result: { exitCode: number; message: string } }
> {
  const root = path.resolve(repoRoot);
  if (!(await fileExists(root))) {
    return { ok: false, result: { exitCode: 1, message: `仓库路径不存在: ${root}` } };
  }

  let mainBranch: string | null;
  try {
    mainBranch = resolveMainBranch(root);
  } catch {
    return { ok: false, result: { exitCode: 1, message: '无法探测主干分支（git 异常）' } };
  }
  if (!mainBranch) {
    return {
      ok: false,
      result: {
        exitCode: 1,
        message: '无法探测主干分支（需 origin/HEAD 或本地 main/master）',
      },
    };
  }
  return { ok: true, root, mainBranch };
}

/**
 * 脏工作区则返回失败结果；干净返回 null。
 */
function dirtyBlockResult(root: string, actionHint: string): { exitCode: number; message: string } | null {
  try {
    if (!isWorkingTreeDirty(root)) return null;
    let current = '';
    try {
      current = git(root, ['branch', '--show-current']).trim();
    } catch {
      // ignore
    }
    return {
      exitCode: 1,
      message: current
        ? `当前分支（${current}）存在未提交的变动，请先提交或放弃后再${actionHint}`
        : `工作区存在未提交的变动，请先提交或放弃后再${actionHint}`,
    };
  } catch {
    return { exitCode: 1, message: 'git status 异常' };
  }
}

/**
 * 基于主干创建 `hotfix/<issue_id>` 并 checkout；脏工作区或分支已存在则失败。
 */
export async function createHotfixBranch(
  issueIdRaw: string,
  repoRoot: string,
): Promise<HotfixBranchCreateResult> {
  if (!issueIdRaw || !repoRoot) {
    return {
      exitCode: 1,
      message: '用法: hotfix-branch-create <issue_id> <repo_root>',
    };
  }

  const issueId = sanitizeIssueId(issueIdRaw);
  if (!issueId) {
    return { exitCode: 1, message: `issue_id 无效：${issueIdRaw}` };
  }

  const resolved = await resolveRepoAndMain(repoRoot);
  if (!resolved.ok) return resolved.result;
  const { root, mainBranch } = resolved;

  const dirty = dirtyBlockResult(root, '创建修复分支');
  if (dirty) return dirty;

  const hotfixBranch = `hotfix/${issueId}`;
  if (localBranchExists(root, hotfixBranch)) {
    return { exitCode: 1, message: `分支 ${hotfixBranch} 已存在` };
  }

  try {
    git(root, ['checkout', '-b', hotfixBranch, mainBranch], { stdio: 'pipe' });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      message: `基于 ${mainBranch} 创建并切换到 ${hotfixBranch} 失败: ${detail}`,
    };
  }

  return {
    exitCode: 0,
    payload: {
      main_branch: mainBranch,
      hotfix_branch: hotfixBranch,
    },
  };
}

/**
 * 将指定本地分支以 `merge --no-ff` 合并进主干并停留在主干。
 * 不删除源分支；冲突时 abort 并失败。
 */
export async function mergeBranchToMain(
  sourceBranchRaw: string,
  repoRoot: string,
): Promise<MergeBranchToMainResult> {
  if (!sourceBranchRaw || !repoRoot) {
    return {
      exitCode: 1,
      message: '用法: git-branch-merge <source_branch> <repo_root>',
    };
  }

  const sourceBranch = sourceBranchRaw.trim();
  if (!sourceBranch) {
    return { exitCode: 1, message: `source_branch 无效：${sourceBranchRaw}` };
  }

  const resolved = await resolveRepoAndMain(repoRoot);
  if (!resolved.ok) return resolved.result;
  const { root, mainBranch } = resolved;

  if (sourceBranch === mainBranch) {
    return { exitCode: 1, message: `源分支不能与主干相同（${mainBranch}）` };
  }

  if (!localBranchExists(root, sourceBranch)) {
    return { exitCode: 1, message: `分支 ${sourceBranch} 不存在` };
  }

  const dirty = dirtyBlockResult(root, '合并到主干');
  if (dirty) return dirty;

  try {
    git(root, ['checkout', mainBranch], { stdio: 'pipe' });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, message: `切换到主干 ${mainBranch} 失败: ${detail}` };
  }

  try {
    git(root, ['merge', '--no-ff', '--no-edit', sourceBranch], { stdio: 'pipe' });
  } catch (err) {
    try {
      git(root, ['merge', '--abort'], { stdio: 'ignore' });
    } catch {
      // 无进行中的 merge 时忽略
    }
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      message: `将 ${sourceBranch} 合并到 ${mainBranch} 失败（已尝试 abort）: ${detail}`,
    };
  }

  return {
    exitCode: 0,
    payload: {
      main_branch: mainBranch,
      source_branch: sourceBranch,
    },
  };
}
