/**
 * 单 coding 任务运行态（`.polaris/tasks/<id>/state.yaml`）读写。
 * 对齐 assets/shared/templates/state.example.yaml。
 *
 * 顶层：
 *   language / install-time / main-repo-root / worktree-dir
 *   kind / change_id / phase
 *   complexity_level / risk_level / current_tier（分级两轴 + 最终值）
 *   workflow: { mode, status, tdd_mode, build_mode, signals, downgrade_*, upgrade_*, finished_at }
 *     （扁平；mode 是唯一通道开关。旧字符串、workflow.tweak/normal、runtime.tweak/normal
 *      在读取时折进本对象，不再落盘）
 *   artifact_review_mode / artifact_max_round
 *   verify_mode / auto_transition / isolation / context_compression
 *   triage / worktree
 *
 * 阶段状态统一收纳在 `runtime` 容器下：
 *   runtime.specify / plan / design / tasks / build / verify / ship / deepread
 *
 * 兼容：
 *   load 时若检测到旧扁平结构（intention/clarify/review/delivery 顶层），
 *   会自动归一到 runtime.*。落盘一律新结构。
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

/** runtime.specify（intention 路径合并到此；旧 clarify.path 兼容归一） */
export type TaskRuntimeSpecifyState = {
  intention_path?: string;
  status?: string;
  start_time?: string;
  finished_at?: string;
};

/** runtime.plan */
export type TaskRuntimePlanState = {
  status?: string;
  worktree_decision?: string;
  opsx_propose_status?: string;
  review_round?: number;
  review_log_file?: string;
  review_mode?: string;
  review_report?: string;
  outside_voice?: string;
  outside_voice_report?: string;
  start_time?: string;
  finished_at?: string;
  /** 子块：审查执行态（per_batch 时落盘） */
  review?: {
    skipped?: boolean;
    round?: number;
    start_time?: string;
    finished_at?: string;
  };
};

/** runtime.design */
export type TaskRuntimeDesignState = {
  status?: string;
  path?: string;
  review_report?: string;
  outside_voice?: string;
  outside_voice_report?: string;
  draft_dir?: string;
  start_time?: string;
  finished_at?: string;
};

/** runtime.tasks */
export type TaskRuntimeTasksState = {
  status?: string;
  tdd_policy?: string;
  /** tasks 阶段内 subagent 评审产出（从旧 runtime.review.plan_review_status 迁入） */
  plan_review_status?: string;
  tasks_path?: string;
  review_report?: string;
  outside_voice?: string;
  outside_voice_report?: string;
  start_time?: string;
  finished_at?: string;
};

/** runtime.build */
export type TaskRuntimeBuildState = {
  status?: string;
  build_mode?: string;
  review_mode?: string;
  final_review?: string;
  current_task?: string;
  total_tasks?: number;
  completed_tasks?: number;
  start_time?: string;
  finished_at?: string;
};

/** runtime.verify */
export type TaskRuntimeVerifyState = {
  status?: string;
  verify_mode?: string;
  /** 子规则逐条合规（从旧 runtime.review.constitution_compliance 迁入） */
  constitution_compliance?: string;
  /** 聚合判定 */
  constitution_valid?: boolean | string;
  overall_score?: number;
  score_level?: string;
  blocked?: boolean;
  verification_report?: string;
  scorer_results?: Record<string, unknown>;
  start_time?: string;
  finished_at?: string;
};

/** runtime.ship（旧 delivery 段，含产物补齐 backfill） */
export type TaskRuntimeShipState = {
  status?: string;
  merge_strategy?: string;
  harness_sync?: string;
  archive_dir?: string;
  /** 产物补齐（P01 快速通道：change-brief → 四件套） */
  backfill?: string;
  archive?: string;
  archive_path?: string;
  archive_error?: string;
  start_time?: string;
  finished_at?: string;
};

/** runtime.deepread */
export type TaskRuntimeDeepreadState = {
  last_triggered?: string;
  pending_file?: string;
  action?: string;
};

/** runtime 容器：阶段状态统一收纳 */
export type TaskRuntimeState = {
  specify?: TaskRuntimeSpecifyState;
  plan?: TaskRuntimePlanState;
  design?: TaskRuntimeDesignState;
  tasks?: TaskRuntimeTasksState;
  build?: TaskRuntimeBuildState;
  verify?: TaskRuntimeVerifyState;
  ship?: TaskRuntimeShipState;
  deepread?: TaskRuntimeDeepreadState;
};

/** workflow.mode 取值 */
export type WorkflowMode = 'sdd' | 'tweak' | 'bugfix' | 'full' | string;

/** workflow 容器：通道与升档/降档决策（扁平，mode 是唯一通道开关） */
export type TaskWorkflowState = {
  mode?: WorkflowMode;
  /** in_progress | completed | downgraded | upgraded */
  status?: string;
  tdd_mode?: string;
  build_mode?: string;
  signals?: string[];
  /** 仅 mode=sdd 降档时填写 */
  downgrade_reason?: string;
  downgrade_target?: string;
  upgrade_reason?: string;
  /** tweak 可升到 normal 或 design；sdd 只升到 design */
  upgrade_target?: string;
  finished_at?: string;
};

/** 任务 state.yaml 根结构 */
export interface TaskState {
  language?: string;
  install_time?: string;
  main_repo_root?: string;
  worktree_dir?: string;

  /** 任务类型：coding（开发变更） */
  kind?: string;
  change_id?: string;
  /** 旧字段兼容 */
  task_id?: string;
  phase?: TaskPhase;

  /** 复杂度轴：specify Step 5.4 初判（trivial | standard | critical）；做多深 */
  complexity_level?: string;
  /** 风险轴：specify 初判、verify Step 8 用 diff 复核（只升不降）；做不做 */
  risk_level?: string;
  /** 最终层级 = max(复杂度轴, 风险轴)（升档门优先）；deepread 徽章消费 */
  current_tier?: string;

  /** 通道与升档/降档决策（扁平对象；旧字符串写法仅在读取时展开） */
  workflow?: TaskWorkflowState;
  /** 旧字段兼容：旧写法下顶层出现的 review_mode / build_mode 不会被默认生成 */
  review_mode?: string;
  build_mode?: string;

  /** 制品审查模式：after_all / per_batch */
  artifact_review_mode?: string;
  /** 制品审查最大轮次 */
  artifact_max_round?: number;
  /** 顶层保留（与 runtime.verify.verify_mode 并存） */
  verify_mode?: string;
  auto_transition?: boolean;
  /** worktree / branch */
  isolation?: string;
  context_compression?: string;

  triage?: TaskTriageState;
  worktree?: TaskWorktreeState;

  /** 阶段状态统一容器 */
  runtime?: TaskRuntimeState;
}

/** createDefaultTaskState 可选覆盖 */
export type CreateDefaultTaskStateOptions = {
  task_id?: string;
  /** 与父目录名对齐；缺省空串 */
  change_id?: string;
  language?: string;
  phase?: TaskPhase;
  kind?: string;
  workflow?: WorkflowMode;
};

/**
 * 递归 kebab → snake。
 * 模板里顶层仍用 kebab（install-time / context-compression）便于阅读，
 * 但运行时一律归一为 snake 字段，TaskState 类型只暴露 snake 键。
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
    const normalized = key.replace(/-/g, '_');
    out[normalized] = normalizeKeys(child);
  }
  return out;
}

/**
 * 对顶层几个允许 kebab 形式的字段保留原键（install-time / main-repo-root / worktree-dir / context-compression）。
 * 其余字段一律转 snake。
 */
function normalizedKeepAsIs(key: string): string {
  const kebabKeepers = new Set([
    'install-time',
    'main-repo-root',
    'worktree-dir',
    'context-compression',
  ]);
  if (kebabKeepers.has(key)) return key;
  return key.replace(/-/g, '_');
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

/** 通道决策字段；嵌套段上的 mode 不抄进父对象（它与 workflow.mode 重复且值域不同） */
const WORKFLOW_CHANNEL_FIELDS = [
  'status',
  'tdd_mode',
  'build_mode',
  'signals',
  'downgrade_reason',
  'downgrade_target',
  'upgrade_reason',
  'upgrade_target',
  'finished_at',
] as const;

/** 判断值是普通对象 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/** 通道字段是否写过实质内容（空串和空数组不算） */
function channelFieldFilled(value: unknown): boolean {
  if (value === undefined || value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/** 把来源段里已填写的通道字段补进目标；不覆盖目标里已有的值，不复制 mode */
function foldChannelFields(
  target: Record<string, unknown>,
  source: Record<string, unknown> | undefined,
): void {
  if (!source) return;
  for (const field of WORKFLOW_CHANNEL_FIELDS) {
    const incoming = source[field];
    if (!channelFieldFilled(incoming)) continue;
    if (channelFieldFilled(target[field])) continue;
    target[field] = incoming;
  }
}

/** 段里是否有任一通道决策字段 */
function channelHasData(source: Record<string, unknown> | undefined): boolean {
  if (!source) return false;
  return WORKFLOW_CHANNEL_FIELDS.some((field) => channelFieldFilled(source[field]));
}

/**
 * 把旧 workflow 形态收成扁平对象。
 * 字符串展开为 { mode }；workflow.tweak / workflow.normal 与 runtime.tweak / runtime.normal
 * 按 mode 折进父对象后删除。技能曾把决策写在 runtime 下：所选段为空而另一段有数据时改折有数据的那段；
 * 父级 mode 为空或仍是模板默认 sdd、且实际折的是 tweak 段时，把 mode 纠正为 tweak。
 */
function flattenWorkflow(parsed: Record<string, unknown>, runtime: Record<string, unknown>): void {
  let workflow: Record<string, unknown>;
  if (typeof parsed.workflow === 'string') {
    workflow = { mode: parsed.workflow };
  } else if (asRecord(parsed.workflow)) {
    workflow = { ...asRecord(parsed.workflow)! };
  } else if (asRecord(parsed.workflow_state)) {
    workflow = { ...asRecord(parsed.workflow_state)! };
  } else {
    workflow = {};
  }

  const tweakPayload: Record<string, unknown> = {};
  foldChannelFields(tweakPayload, asRecord(workflow.tweak));
  foldChannelFields(tweakPayload, asRecord(runtime.tweak));
  const normalPayload: Record<string, unknown> = {};
  foldChannelFields(normalPayload, asRecord(workflow.normal));
  foldChannelFields(normalPayload, asRecord(runtime.normal));

  const tweakHas = channelHasData(tweakPayload);
  const normalHas = channelHasData(normalPayload);
  const mode = typeof workflow.mode === 'string' ? workflow.mode : '';

  let picked: 'tweak' | 'normal' | undefined;
  if (mode === 'tweak') {
    picked = tweakHas ? 'tweak' : normalHas ? 'normal' : undefined;
  } else if (normalHas) {
    picked = 'normal';
  } else if (tweakHas) {
    picked = 'tweak';
  }

  if (picked === 'tweak') {
    foldChannelFields(workflow, tweakPayload);
    if (!mode || mode === 'sdd') {
      workflow.mode = 'tweak';
    }
  } else if (picked === 'normal') {
    foldChannelFields(workflow, normalPayload);
    if (!mode) {
      workflow.mode = 'sdd';
    }
  }

  delete workflow.tweak;
  delete workflow.normal;
  delete runtime.tweak;
  delete runtime.normal;
  delete parsed.workflow_state;
  parsed.workflow = workflow;
}

/**
 * 把旧扁平结构归一到 runtime.*，并把旧 workflow 形态折成扁平 workflow。
 * （仅作读取层归一，落盘由 createDefaultTaskState + patchTaskState 控新结构）
 */
function migrateLegacyShape(parsed: Record<string, unknown>): Record<string, unknown> {
  const runtime: Record<string, unknown> =
    (parsed.runtime as Record<string, unknown> | undefined) ?? {};

  // intention 顶层 → runtime.specify.intention_path
  const legacyIntention = parsed.intention as { path?: string } | undefined;
  if (legacyIntention?.path) {
    const specify = (runtime.specify as Record<string, unknown> | undefined) ?? {};
    if (!specify.intention_path) {
      specify.intention_path = legacyIntention.path;
    }
    runtime.specify = specify;
  }

  // clarify 顶层（旧结构） → runtime.specify（注意旧字段 path 与 intention.path 同义）
  const legacyClarify = parsed.clarify as Record<string, unknown> | undefined;
  if (legacyClarify) {
    const specify = (runtime.specify as Record<string, unknown> | undefined) ?? {};
    if (!specify.intention_path && legacyClarify.path) {
      specify.intention_path = legacyClarify.path as string;
    }
    if (legacyClarify.status !== undefined && specify.status === undefined) {
      specify.status = legacyClarify.status as string;
    }
    runtime.specify = specify;
  }

  // review 顶层 → tasks.plan_review_status + verify.constitution_compliance
  const legacyReview = parsed.review as Record<string, unknown> | undefined;
  if (legacyReview) {
    if (legacyReview.plan_review_status !== undefined) {
      const tasks = (runtime.tasks as Record<string, unknown> | undefined) ?? {};
      if (tasks.plan_review_status === undefined) {
        tasks.plan_review_status = legacyReview.plan_review_status as string;
      }
      runtime.tasks = tasks;
    }
    if (legacyReview.constitution_compliance !== undefined) {
      const verify = (runtime.verify as Record<string, unknown> | undefined) ?? {};
      if (verify.constitution_compliance === undefined) {
        verify.constitution_compliance = legacyReview.constitution_compliance as string;
      }
      runtime.verify = verify;
    }
  }

  // delivery 顶层 → runtime.ship
  const legacyDelivery = parsed.delivery as Record<string, unknown> | undefined;
  if (legacyDelivery) {
    runtime.ship = { ...(runtime.ship as object | undefined), ...legacyDelivery };
  }

  // propose 顶层（旧结构，propose 阶段已改名 plan） → runtime.plan
  const legacyPropose = parsed.propose as Record<string, unknown> | undefined;
  if (legacyPropose) {
    runtime.plan = { ...(runtime.plan as object | undefined), ...legacyPropose };
  }

  // plan 顶层分流：含 tdd_policy 的是旧「细计划阶段」（已改名 tasks），否则为新 plan 阶段
  const topPlan = parsed.plan as Record<string, unknown> | undefined;
  if (topPlan) {
    if ('tdd_policy' in topPlan) {
      runtime.tasks = { ...(runtime.tasks as object | undefined), ...topPlan };
    } else {
      runtime.plan = { ...(runtime.plan as object | undefined), ...topPlan };
    }
  }

  // design / tasks / build / verify / deepread 顶层 → runtime.*
  for (const stage of ['design', 'tasks', 'build', 'verify', 'deepread'] as const) {
    const legacyStage = parsed[stage] as Record<string, unknown> | undefined;
    if (legacyStage) {
      runtime[stage] = { ...(runtime[stage] as object | undefined), ...legacyStage };
    }
  }

  flattenWorkflow(parsed, runtime);

  // 顶层 review_mode / build_mode 迁入 runtime.build
  if (parsed.review_mode !== undefined || parsed.build_mode !== undefined) {
    const build = (runtime.build as Record<string, unknown> | undefined) ?? {};
    if (parsed.review_mode !== undefined && build.review_mode === undefined) {
      build.review_mode = parsed.review_mode as string;
    }
    if (parsed.build_mode !== undefined && build.build_mode === undefined) {
      build.build_mode = parsed.build_mode as string;
    }
    runtime.build = build;
  }

  if (Object.keys(runtime).length > 0) {
    parsed.runtime = runtime;
  } else {
    delete parsed.runtime;
  }
  return parsed;
}

/** 生成对齐 state.example 的默认任务状态 */
export function createDefaultTaskState(options: CreateDefaultTaskStateOptions = {}): TaskState {
  const workflowMode = (options.workflow as WorkflowMode | undefined) ?? 'sdd';
  const task_id = options.task_id ?? '';
  return {
    language: options.language ?? 'zh-CN',
    install_time: '',
    main_repo_root: '',
    worktree_dir: '',
    kind: options.kind ?? 'coding',
    change_id: options.change_id ?? '',
    task_id: task_id,
    phase: options.phase ?? 'idle',
    complexity_level: '',
    risk_level: '',
    current_tier: '',
    workflow: {
      mode: workflowMode,
      status: '',
      tdd_mode: '',
      build_mode: '',
      signals: [],
      downgrade_reason: '',
      downgrade_target: '',
      upgrade_reason: '',
      upgrade_target: '',
      finished_at: '',
    },
    artifact_review_mode: 'per_batch',
    artifact_max_round: 5,
    verify_mode: 'light',
    auto_transition: false,
    isolation: 'worktree',
    context_compression: 'beta',
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
    runtime: {
      specify: {
        intention_path: '',
        status: '',
        start_time: '',
        finished_at: '',
      },
      plan: {
        status: '',
        worktree_decision: '',
        opsx_propose_status: '',
        review_round: 0,
        review_log_file: '',
        review_mode: '',
        review_report: '',
        outside_voice: '',
        outside_voice_report: '',
        start_time: '',
        finished_at: '',
        review: {
          skipped: true,
          round: 0,
          start_time: '',
          finished_at: '',
        },
      },
      design: {
        status: '',
        path: '',
        review_report: '',
        outside_voice: '',
        outside_voice_report: '',
        draft_dir: '',
        start_time: '',
        finished_at: '',
      },
      tasks: {
        status: '',
        tdd_policy: '',
        plan_review_status: '',
        tasks_path: '',
        review_report: '',
        outside_voice: '',
        outside_voice_report: '',
        start_time: '',
        finished_at: '',
      },
      build: {
        status: '',
        build_mode: '',
        review_mode: '',
        final_review: '',
        current_task: '',
        total_tasks: 0,
        completed_tasks: 0,
        start_time: '',
        finished_at: '',
      },
      verify: {
        status: '',
        verify_mode: '',
        constitution_compliance: '',
        constitution_valid: false,
        overall_score: 0,
        score_level: '',
        blocked: false,
        verification_report: '',
        scorer_results: {},
        start_time: '',
        finished_at: '',
      },
      ship: {
        status: '',
        merge_strategy: '',
        harness_sync: '',
        archive_dir: '',
        backfill: '',
        archive: '',
        archive_path: '',
        archive_error: '',
        start_time: '',
        finished_at: '',
      },
      deepread: {
        last_triggered: '',
        pending_file: '',
        action: 'halt_and_wait',
      },
    },
  };
}

/** 从文件路径加载；不存在或解析失败返回 null；自动归一旧扁平结构 */
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
    const normalized = normalizeKeys(parsed) as Record<string, unknown>;
    const migrated = migrateLegacyShape(normalized);
    return migrated as TaskState;
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
    task_id: taskId,
    ...defaults,
  });
}
