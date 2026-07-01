import { readFile } from 'fs/promises';
import path from 'path';
import { execFileSync } from 'child_process';

import { fileExists } from '../utils/file-system.js';
import { parse as parseYaml } from 'yaml';

export type WorkflowChangeStatus = 'active' | 'paused' | 'done' | string;

export type WorkflowChange = {
  id: string;
  title?: string;
  status: WorkflowChangeStatus;
  worktree?: string;
};

export type WorkflowState = {
  version: number;
  changes: WorkflowChange[];
};

function runGit(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

/** 解析当前目录所属 git 仓库根路径 */
export function resolveGitRoot(cwd: string): string | null {
  const root = runGit(['rev-parse', '--show-toplevel'], cwd);
  return root || null;
}

/**
 * 解析主仓路径（worktree 场景下取第一个 worktree 或当前根）。
 */
export function resolveMainRepo(cwd: string): string | null {
  const gitRoot = resolveGitRoot(cwd);
  if (!gitRoot) {
    return null;
  }

  const worktreeList = runGit(['worktree', 'list', '--porcelain'], gitRoot);
  if (!worktreeList) {
    return gitRoot;
  }

  const lines = worktreeList.split('\n');
  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      return line.slice('worktree '.length).trim();
    }
  }

  return gitRoot;
}

function parseWorkflowYaml(raw: string, filePath: string): WorkflowState {
  const parsed = parseYaml(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid workflow file ${filePath}: root must be an object`);
  }

  const record = parsed as Record<string, unknown>;
  const version = typeof record.version === 'number' ? record.version : 1;
  const rawChanges = record.changes;

  if (!Array.isArray(rawChanges)) {
    return { version, changes: [] };
  }

  const changes: WorkflowChange[] = [];
  for (const item of rawChanges) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const change = item as Record<string, unknown>;
    if (typeof change.id !== 'string') {
      continue;
    }
    changes.push({
      id: change.id,
      title: typeof change.title === 'string' ? change.title : undefined,
      status: typeof change.status === 'string' ? change.status : 'active',
      worktree: typeof change.worktree === 'string' ? change.worktree : undefined,
    });
  }

  return { version, changes };
}

/** 读取主仓 `.harness/workflow.yaml`；不存在时返回 null */
export async function loadWorkflowState(mainRepo: string): Promise<WorkflowState | null> {
  const workflowPath = path.join(mainRepo, '.harness', 'workflow.yaml');
  if (!(await fileExists(workflowPath))) {
    return null;
  }

  const raw = await readFile(workflowPath, 'utf-8');
  return parseWorkflowYaml(raw, workflowPath);
}

/** 从任意 cwd 加载工作流状态 */
export async function loadWorkflowFromCwd(cwd: string): Promise<{
  mainRepo: string | null;
  state: WorkflowState | null;
}> {
  const mainRepo = resolveMainRepo(cwd);
  if (!mainRepo) {
    return { mainRepo: null, state: null };
  }

  const state = await loadWorkflowState(mainRepo);
  return { mainRepo, state };
}
