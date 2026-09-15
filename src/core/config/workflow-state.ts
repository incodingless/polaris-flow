/**
 * `.polaris/workflow.yaml` 工作流游标读写。
 * 与 polaris-config（项目静态配置）分离：本文件描述四类任务列表游标。
 */
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { execFileSync } from 'child_process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { fileExists } from '../../utils/file-system.js';
import { getWorkflowTemplateYamlSrc } from '../assets/manifest.js';
import { getWorkflowConfigPath } from '../assets/polaris-paths.js';

/** 任务游标条目（四列表共用结构） */
export type WorkflowTaskEntry = {
  task_id: string;
  phase: string;
  worktree_path: string;
  started_at: string;
};

/** 任务类型 → YAML 列表键 */
export type WorkflowTaskKind = 'change' | 'requirement' | 'testcase' | 'prototype';

/** kind 对应的 YAML 顶层键名 */
export type WorkflowTaskListKey =
  | 'change_tasks'
  | 'requirement_tasks'
  | 'testcase_tasks'
  | 'prototype_tasks';

/** `.polaris/workflow.yaml` 根结构 */
export type WorkflowState = {
  change_tasks: WorkflowTaskEntry[];
  requirement_tasks: WorkflowTaskEntry[];
  testcase_tasks: WorkflowTaskEntry[];
  prototype_tasks: WorkflowTaskEntry[];
};

export const WORKFLOW_TASK_KINDS: readonly WorkflowTaskKind[] = [
  'change',
  'requirement',
  'testcase',
  'prototype',
] as const;

/** CLI / 报错用的 kind 合法值串 */
export const WORKFLOW_TASK_KIND_HELP = WORKFLOW_TASK_KINDS.join('|');

/** 缺少或非法 --kind 时的统一报错文案 */
export function workflowTaskKindErrorMessage(): string {
  return `缺少或非法 --kind（须为 ${WORKFLOW_TASK_KIND_HELP}）`;
}

/** 将 kind 映射为 YAML 列表键；非法 kind 返回 null */
export function listKeyForKind(kind: string | undefined): WorkflowTaskListKey | null {
  switch (kind) {
    case 'change':
      return 'change_tasks';
    case 'requirement':
      return 'requirement_tasks';
    case 'testcase':
      return 'testcase_tasks';
    case 'prototype':
      return 'prototype_tasks';
    default:
      return null;
  }
}

/** 解析并校验 kind；非法则返回 null */
export function parseWorkflowTaskKind(raw: string | undefined): WorkflowTaskKind | null {
  if (
    raw === 'change' ||
    raw === 'requirement' ||
    raw === 'testcase' ||
    raw === 'prototype'
  ) {
    return raw;
  }
  return null;
}

/** 读取指定 kind 的任务列表副本 */
export function getTaskList(state: WorkflowState, kind: WorkflowTaskKind): WorkflowTaskEntry[] {
  const key = listKeyForKind(kind)!;
  return [...(state[key] ?? [])];
}

/** 写回指定 kind 的任务列表，返回新 state */
export function setTaskList(
  state: WorkflowState,
  kind: WorkflowTaskKind,
  list: WorkflowTaskEntry[],
): WorkflowState {
  const key = listKeyForKind(kind)!;
  return { ...state, [key]: list };
}

/** 返回 workflow.yaml 路径 */
export function getWorkflowStatePath(repoRoot: string): string {
  return getWorkflowConfigPath(repoRoot);
}

/** @deprecated 使用 getWorkflowStatePath */
export function getWorkflowCursorPath(repoRoot: string): string {
  return getWorkflowStatePath(repoRoot);
}

/** 空骨架（四列表） */
export function emptyWorkflowState(): WorkflowState {
  return {
    change_tasks: [],
    requirement_tasks: [],
    testcase_tasks: [],
    prototype_tasks: [],
  };
}

/** @deprecated 使用 emptyWorkflowState */
export function emptyWorkflowCursor(): WorkflowState {
  return emptyWorkflowState();
}

/** 将原始 YAML 条目规范化为 WorkflowTaskEntry */
function normalizeTaskEntry(raw: Record<string, unknown>): WorkflowTaskEntry {
  return {
    task_id: String(raw.task_id ?? ''),
    phase: String(raw.phase ?? ''),
    worktree_path: String(raw.worktree_path ?? ''),
    started_at: String(raw.started_at ?? ''),
  };
}

/** 规范化某一列表字段 */
function normalizeTaskList(value: unknown): WorkflowTaskEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as Record<string, unknown>[]).map(normalizeTaskEntry);
}

/**
 * 规范化解析结果为 WorkflowState。
 */
function normalizeWorkflowState(raw: unknown): WorkflowState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyWorkflowState();
  }
  const obj = raw as Record<string, unknown>;
  return {
    change_tasks: normalizeTaskList(obj.change_tasks),
    requirement_tasks: normalizeTaskList(obj.requirement_tasks),
    testcase_tasks: normalizeTaskList(obj.testcase_tasks),
    prototype_tasks: normalizeTaskList(obj.prototype_tasks),
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
 * 若缺失则物化 workflow.yaml：优先拷贝模板，否则写四空列表骨架。
 */
export async function ensureWorkflowStateFile(repoRoot: string): Promise<string> {
  const filePath = getWorkflowStatePath(repoRoot);
  if (await fileExists(filePath)) {
    return filePath;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const templateSrc = getWorkflowTemplateYamlSrc();
  if (await fileExists(templateSrc)) {
    await copyFile(templateSrc, filePath);
    return filePath;
  }
  const skeleton =
    'change_tasks: []\nrequirement_tasks: []\ntestcase_tasks: []\nprototype_tasks: []\n';
  await writeFile(filePath, skeleton, 'utf-8');
  return filePath;
}

/** @deprecated 使用 ensureWorkflowStateFile */
export async function ensureWorkflowCursorFile(repoRoot: string): Promise<string> {
  return ensureWorkflowStateFile(repoRoot);
}

/**
 * 写回 workflow.yaml（稳定字段顺序：change → requirement → testcase → prototype）。
 */
export async function saveWorkflowState(repoRoot: string, state: WorkflowState): Promise<void> {
  const filePath = getWorkflowStatePath(repoRoot);
  await mkdir(path.dirname(filePath), { recursive: true });

  const ordered: Record<string, unknown> = {
    change_tasks: state.change_tasks.length === 0 ? [] : state.change_tasks,
    requirement_tasks: state.requirement_tasks.length === 0 ? [] : state.requirement_tasks,
    testcase_tasks: state.testcase_tasks.length === 0 ? [] : state.testcase_tasks,
    prototype_tasks: state.prototype_tasks.length === 0 ? [] : state.prototype_tasks,
  };

  const text = stringifyYaml(ordered, { lineWidth: 0 });
  await writeFile(filePath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}

/** @deprecated 使用 saveWorkflowState */
export async function saveWorkflowCursor(repoRoot: string, cursor: WorkflowState): Promise<void> {
  return saveWorkflowState(repoRoot, cursor);
}

/** 失败时返回 null 的 git argv 调用 */
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
