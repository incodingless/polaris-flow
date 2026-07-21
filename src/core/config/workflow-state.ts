/**
 * `.polaris/workflow.yaml` 工作流游标读写。
 * 与 polaris-config（项目静态配置）分离：本文件描述 active_changes / pending_triages。
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { execFileSync } from 'child_process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { fileExists } from '../../utils/file-system.js';
import { getWorkflowYamlPath } from './polaris-paths.js';

/** active_changes 单条 */
export type ActiveChangeEntry = {
  change_id: string;
  phase: string;
  worktree_path: string;
  started_at: string;
};

/** pending_triages 单条 */
export type PendingTriageEntry = {
  session_suffix: string;
  tier: string;
  t1_result: string;
  t2_result: string;
  timestamp: string;
};

/** `.polaris/workflow.yaml` 根结构 */
export type WorkflowState = {
  active_changes: ActiveChangeEntry[];
  pending_triages: PendingTriageEntry[];
  /** 其它顶层字段透传保留 */
  [key: string]: unknown;
};

/** @deprecated 使用 WorkflowState；保留别名以免外部瞬时断裂 */
export type WorkflowCursor = WorkflowState;

/** 返回 workflow.yaml 路径 */
export function getWorkflowStatePath(repoRoot: string): string {
  return getWorkflowYamlPath(repoRoot);
}

/** @deprecated 使用 getWorkflowStatePath */
export function getWorkflowCursorPath(repoRoot: string): string {
  return getWorkflowStatePath(repoRoot);
}

/** 空骨架 */
export function emptyWorkflowState(): WorkflowState {
  return { active_changes: [], pending_triages: [] };
}

/** @deprecated 使用 emptyWorkflowState */
export function emptyWorkflowCursor(): WorkflowState {
  return emptyWorkflowState();
}

/**
 * 规范化解析结果为 WorkflowState。
 */
function normalizeWorkflowState(raw: unknown): WorkflowState {
  const base = emptyWorkflowState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base;
  }
  const obj = raw as Record<string, unknown>;
  const active = Array.isArray(obj.active_changes)
    ? (obj.active_changes as Record<string, unknown>[]).map((e) => ({
        change_id: String(e.change_id ?? ''),
        phase: String(e.phase ?? ''),
        worktree_path: String(e.worktree_path ?? ''),
        started_at: String(e.started_at ?? ''),
      }))
    : [];
  const pending = Array.isArray(obj.pending_triages)
    ? (obj.pending_triages as Record<string, unknown>[]).map((e) => ({
        session_suffix: String(e.session_suffix ?? ''),
        tier: String(e.tier ?? ''),
        t1_result: String(e.t1_result ?? ''),
        t2_result: String(e.t2_result ?? ''),
        timestamp: String(e.timestamp ?? ''),
      }))
    : [];

  return {
    ...obj,
    active_changes: active,
    pending_triages: pending,
  };
}

/**
 * 读取 workflow.yaml；不存在则返回空骨架（不写盘）。
 */
export async function loadWorkflowState(repoRoot: string): Promise<WorkflowState> {
  const filePath = getWorkflowStatePath(repoRoot);
  if (!(await fileExists(filePath))) {
    return emptyWorkflowState();
  }
  const text = await readFile(filePath, 'utf-8');
  try {
    return normalizeWorkflowState(parseYaml(text));
  } catch (err) {
    throw new Error(`无法解析 ${filePath}: ${(err as Error).message}`);
  }
}

/** @deprecated 使用 loadWorkflowState */
export async function loadWorkflowCursor(repoRoot: string): Promise<WorkflowState> {
  return loadWorkflowState(repoRoot);
}

/**
 * 若缺失则物化空 workflow.yaml（含 pending_triages）。
 */
export async function ensureWorkflowStateFile(repoRoot: string): Promise<string> {
  const filePath = getWorkflowStatePath(repoRoot);
  if (await fileExists(filePath)) {
    return filePath;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const skeleton = 'active_changes: []\npending_triages: []\n';
  await writeFile(filePath, skeleton, 'utf-8');
  return filePath;
}

/** @deprecated 使用 ensureWorkflowStateFile */
export async function ensureWorkflowCursorFile(repoRoot: string): Promise<string> {
  return ensureWorkflowStateFile(repoRoot);
}

/**
 * 写回 workflow.yaml（稳定字段顺序：active_changes → pending_triages → 其它）。
 */
export async function saveWorkflowState(repoRoot: string, state: WorkflowState): Promise<void> {
  const filePath = getWorkflowStatePath(repoRoot);
  await mkdir(path.dirname(filePath), { recursive: true });

  const { active_changes, pending_triages, ...rest } = state;
  const doc: Record<string, unknown> = {
    ...rest,
    active_changes: active_changes.length === 0 ? [] : active_changes,
    pending_triages: pending_triages.length === 0 ? [] : pending_triages,
  };

  const ordered: Record<string, unknown> = {};
  ordered.active_changes = doc.active_changes;
  ordered.pending_triages = doc.pending_triages;
  for (const [k, v] of Object.entries(doc)) {
    if (k === 'active_changes' || k === 'pending_triages') continue;
    ordered[k] = v;
  }

  const text = stringifyYaml(ordered, { lineWidth: 0 });
  await writeFile(filePath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}

/** @deprecated 使用 saveWorkflowState */
export async function saveWorkflowCursor(repoRoot: string, cursor: WorkflowState): Promise<void> {
  return saveWorkflowState(repoRoot, cursor);
}

/** 失败时返回 null 的 git argv 调用（与 github.runGitShell 安全模型不同，勿合并） */
function tryGitArgs(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

/** 解析当前目录所属 git 仓库根路径 */
export function resolveGitRoot(cwd: string): string | null {
  const root = tryGitArgs(['rev-parse', '--show-toplevel'], cwd);
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

  const worktreeList = tryGitArgs(['worktree', 'list', '--porcelain'], gitRoot);
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

/** 从任意 cwd 加载工作流状态（含主仓解析） */
export async function loadWorkflowFromCwd(cwd: string): Promise<{
  mainRepo: string | null;
  state: WorkflowState | null;
}> {
  const mainRepo = resolveMainRepo(cwd);
  if (!mainRepo) {
    return { mainRepo: null, state: null };
  }

  const filePath = getWorkflowStatePath(mainRepo);
  if (!(await fileExists(filePath))) {
    return { mainRepo, state: null };
  }

  const state = await loadWorkflowState(mainRepo);
  return { mainRepo, state };
}
