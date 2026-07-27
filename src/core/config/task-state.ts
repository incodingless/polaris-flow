/**
 * 单 change 任务运行态（`.polaris/tasks/<id>/state.yaml`）读写。
 * 对齐 assets/shared/templates/state.example.yaml。
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { fileExists, ensureDir } from '../../utils/file-system.js';
import { getTaskDir, getTaskStatePath } from '../assets/polaris-paths.js';
import type { TaskPhase } from './polaris-project-config.js';

/** triage 子块 */
export type TaskTriageState = {
  tier?: string;
  t1_result?: string;
  t2_result?: string;
  timestamp?: string;
};

/** worktree 子块 */
export type TaskWorktreeState = {
  created_by_polaris_flow?: boolean;
  path?: string;
  branch?: string;
  origin_repo?: string;
  created_at?: string;
  status?: string;
};

/** intention 子块 */
export type TaskIntentionState = {
  path?: string;
};

/** propose 子块 */
export type TaskProposeState = {
  status?: string;
  worktree_decision?: string;
  opsx_propose_status?: string;
  review_report?: string;
  outside_voice?: string;
  outside_voice_report?: string;
  finished_at?: string;
};

/** design 子块 */
export type TaskDesignState = {
  status?: string;
  path?: string;
  review_report?: string;
  outside_voice?: string;
  outside_voice_report?: string;
  draft_dir?: string;
};

/** plan 子块 */
export type TaskPlanState = {
  status?: string;
  tdd_policy?: string;
  tasks_path?: string;
  review_report?: string;
  outside_voice?: string;
  outside_voice_report?: string;
};

/** review 子块 */
export type TaskReviewState = {
  status?: string;
  plan_review_status?: string;
  constitution_compliance?: string;
};

/** build 子块 */
export type TaskBuildState = {
  status?: string;
  current_task?: string;
  total_tasks?: number;
  completed_tasks?: number;
};

/** verify 子块 */
export type TaskVerifyState = {
  constitution_valid?: boolean;
  scorer_results?: Record<string, unknown>;
  overall_score?: number;
  blocked?: boolean;
  verification_report?: string;
};

/** delivery 子块 */
export type TaskDeliveryState = {
  status?: string;
  merge_strategy?: string;
  finished_at?: string;
  harness_sync?: string;
  archive_dir?: string;
  archive?: string;
  archive_path?: string;
  archive_error?: string;
};

/** deepread 子块 */
export type TaskDeepreadState = {
  last_triggered?: string;
  pending_file?: string;
  action?: string;
};

/** 任务 state.yaml 根结构 */
export interface TaskState {
  language?: string;
  change_id?: string;
  /** 旧字段兼容 */
  task_id?: string;
  phase?: TaskPhase;
  current_tier?: string;
  kind?: string;
  workflow?: string;
  verify_mode?: string;
  auto_transition?: boolean;
  isolation?: string;
  'context-compression'?: string;
  context_compression?: string;
  'review-mode'?: string;
  review_mode?: string;
  'build-mode'?: string;
  build_mode?: string;
  triage?: TaskTriageState;
  worktree?: TaskWorktreeState;
  intention?: TaskIntentionState;
  /** 旧 clarify 块（task-init 历史）；finalize 会清 draft_dir */
  clarify?: {
    status?: string;
    draft_dir?: string;
    path?: string;
  };
  propose?: TaskProposeState;
  design?: TaskDesignState;
  plan?: TaskPlanState;
  review?: TaskReviewState;
  build?: TaskBuildState;
  verify?: TaskVerifyState;
  delivery?: TaskDeliveryState;
  deepread?: TaskDeepreadState;
}

/** createDefaultTaskState 可选覆盖 */
export type CreateDefaultTaskStateOptions = {
  changeId?: string;
  language?: string;
  phase?: TaskPhase;
  kind?: string;
  workflow?: string;
};

/**
 * 递归 kebab → snake（顶层与嵌套）。
 */
function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.includes('-') ? key.replace(/-/g, '_') : key;
    out[normalized] = normalizeKeys(child);
  }
  return out;
}

/**
 * 深度合并；数组整段覆盖。
 */
function deepMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = result[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      result[key] = deepMerge(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/** 生成对齐 state.example 的默认任务状态 */
export function createDefaultTaskState(options: CreateDefaultTaskStateOptions = {}): TaskState {
  const changeId = options.changeId ?? '';
  return {
    language: options.language ?? 'zh-CN',
    change_id: changeId,
    phase: options.phase ?? 'idle',
    current_tier: '',
    kind: options.kind ?? 'solo',
    workflow: options.workflow ?? 'sdd',
    verify_mode: 'light',
    auto_transition: true,
    isolation: 'worktree',
    context_compression: 'off',
    review_mode: 'standard',
    build_mode: 'tdd',
    triage: {
      tier: '',
      t1_result: '',
      t2_result: '',
      timestamp: '',
    },
    worktree: {
      created_by_polaris_flow: false,
      path: '',
      branch: '',
      origin_repo: '',
      created_at: '',
      status: '',
    },
    intention: {
      path: '',
    },
    propose: {
      status: '',
      worktree_decision: '',
      opsx_propose_status: '',
      review_report: '',
      outside_voice: '',
      outside_voice_report: '',
      finished_at: '',
    },
    design: {
      status: '',
      path: '',
      review_report: '',
      outside_voice: '',
      outside_voice_report: '',
      draft_dir: '',
    },
    plan: {
      status: '',
      tdd_policy: '',
      tasks_path: '',
      review_report: '',
      outside_voice: '',
      outside_voice_report: '',
    },
    review: {
      status: '',
      plan_review_status: '',
      constitution_compliance: '',
    },
    build: {
      status: '',
      current_task: '',
      total_tasks: 0,
      completed_tasks: 0,
    },
    verify: {
      constitution_valid: false,
      scorer_results: {},
      overall_score: 0,
      blocked: false,
      verification_report: '',
    },
    delivery: {
      status: '',
      merge_strategy: '',
      finished_at: '',
      harness_sync: '',
      archive_dir: '',
      archive: '',
      archive_path: '',
      archive_error: '',
    },
    deepread: {
      last_triggered: '',
      pending_file: '',
      action: 'halt_and_wait',
    },
  };
}

/** 从文件路径加载；不存在或解析失败返回 null */
export async function loadTaskStateFromFile(statePath: string): Promise<TaskState | null> {
  if (!(await fileExists(statePath))) {
    return null;
  }
  try {
    const text = await readFile(statePath, 'utf-8');
    const parsed = parseYaml(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return normalizeKeys(parsed) as TaskState;
  } catch {
    return null;
  }
}

/** 按项目根 + taskId 加载 state.yaml */
export async function loadTaskState(
  projectPath: string,
  taskId: string,
): Promise<TaskState | null> {
  return loadTaskStateFromFile(getTaskStatePath(projectPath, taskId));
}

/** 将 state 写到指定文件路径 */
export async function saveTaskStateToFile(statePath: string, state: TaskState): Promise<void> {
  await ensureDir(path.dirname(statePath));
  const text = stringifyYaml(state, { lineWidth: 0 });
  await writeFile(statePath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}

/** 按项目根 + taskId 写回 state.yaml */
export async function saveTaskState(
  projectPath: string,
  taskId: string,
  state: TaskState,
): Promise<void> {
  await ensureDir(getTaskDir(projectPath, taskId));
  await saveTaskStateToFile(getTaskStatePath(projectPath, taskId), state);
}

/** 对指定文件做读-合并-写；文件不存在时以 createDefault + partial 新建 */
export async function patchTaskStateFile(
  statePath: string,
  partial: Partial<TaskState>,
  defaults?: CreateDefaultTaskStateOptions,
): Promise<TaskState> {
  const existing = (await loadTaskStateFromFile(statePath)) ?? createDefaultTaskState(defaults);
  const merged = deepMerge(
    existing as Record<string, unknown>,
    partial as Record<string, unknown>,
  ) as TaskState;
  await saveTaskStateToFile(statePath, merged);
  return merged;
}

/** 按项目根 + taskId patch */
export async function patchTaskState(
  projectPath: string,
  taskId: string,
  partial: Partial<TaskState>,
  defaults?: CreateDefaultTaskStateOptions,
): Promise<TaskState> {
  return patchTaskStateFile(getTaskStatePath(projectPath, taskId), partial, {
    changeId: taskId,
    ...defaults,
  });
}
