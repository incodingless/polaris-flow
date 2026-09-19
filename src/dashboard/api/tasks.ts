/**
 * 任务列表与详情 API（`GET /api/tasks`、`GET /api/tasks/:id`），只读。
 *
 * 数据源：`.polaris/workflow.yaml` 的 5 个游标数组 + `state.yaml`（运行态）
 * + `openspec/changes/<id>/` 文件树。**phase 取自游标**，不取 `state.yaml.phase`
 * （依据 `docs/specs/2026-09-19-phase-truth-unification-design.md` §1.1）。
 *
 * 本模块只做「编排 scan 层 + 组响应形状」，不含业务语义。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { getTaskStorageSegment } from '../../core/assets/polaris-paths.js';
import {
  getKindArtifacts,
  getKindLabel,
  getKindPhases,
  isKnownPhase,
  phaseGroupOf,
  phaseIndexIn,
} from '../../core/config/task-kind-layout.js';
import { parseWorkflowTaskKind, type WorkflowTaskKind } from '../../core/config/workflow-state.js';
import { runTasksLint } from '../../core/hooks/tasks-lint.js';
import { listTaskFiles, readTaskCheckboxes, type TaskFile } from '../scan/files.js';
import { readTaskRuntime } from '../scan/state.js';
import {
  scanArchivedTasks,
  scanTaskList,
  type TaskCursor,
  type TaskSource,
} from '../scan/tasks.js';

/** 阶段节点状态。`skipped` 用于可跳过阶段（如 coding 的 design）被显式跳过时 */
export type PhaseNodeStatus = 'done' | 'active' | 'pending' | 'skipped';

export type PhaseNode = {
  code: string;
  name: string;
  optional: boolean;
  status: PhaseNodeStatus;
};

export type PhaseGroup = {
  name: string;
  status: 'completed' | 'active' | 'pending';
  phases: PhaseNode[];
};

export type TaskItem = {
  task_id: string;
  /** 归档来源若读不到 kind 则为 null（不猜） */
  kind: WorkflowTaskKind | null;
  /** kind 的界面显示名（来自单一表）；kind 为 null 时为空串 */
  kind_label: string;
  /**
   * 权威 phase（游标值，原样返回）。归档项为合成值 `archived`
   * —— 归档后游标已被清理，不存在真实阶段。
   */
  phase: string;
  /** phase 是否登记在该 kind 的阶段表里；false 时面板显示原值并标注「未知阶段」 */
  phase_known: boolean;
  /** phase 所属 UI 分组；未登记为 null */
  phase_group: string | null;
  /** phase 在主序列中的序号（从 0）；未登记或旁路为 -1 */
  phase_index: number;
  phase_total: number;
  channel: string;
  mode: string;
  title: string;
  worktree_path: string;
  started_at: string;
  updated_at: string;
  archived_at: string;
  source: TaskSource;
  /** `state.yaml` 缺失（运行态未初始化） */
  state_missing: boolean;
  /** 任务目录（项目根相对 posix），如 `.polaris/tasks/foo` */
  task_path: string;
  /** `tasks.md` 复选框进度；该 kind 无此产物时为 null */
  tasks_done: number | null;
  tasks_total: number | null;
  /** 步骤条数据（与 `/api/workflow/:kind/phases` 的定义同源） */
  phase_groups: PhaseGroup[];
};

export type TaskDetail = TaskItem & {
  files: TaskFile[];
  artifacts: Array<{
    phase: string;
    relPath: string;
    kind: 'file' | 'dir';
    /** 该产物在当前任务上是否存在 */
    exists: boolean;
  }>;
};

export type TaskCounts = {
  active: number;
  archived: number;
  /** 按 kind 计活跃任务数（kind 未知的归档项不参与） */
  by_kind: Record<string, number>;
};

export type ListTasksOptions = {
  status?: 'active' | 'archived' | 'all';
  kind?: string;
};

/** 任务目录（项目根相对 posix） */
function taskPathOf(cursor: TaskCursor): string {
  if (cursor.source === 'archive') {
    return path.posix.join('.polaris', 'archive', cursor.task_id);
  }
  if (cursor.source === 'troubleshooting') {
    return path.posix.join('docs', 'troubleshooting', cursor.task_id);
  }
  return path.posix.join(
    '.polaris',
    getTaskStorageSegment(cursor.kind ?? 'coding'),
    cursor.task_id,
  );
}

/**
 * 由阶段表 + 游标 phase 造步骤条。
 *
 * 规则：
 *   - 归档任务：全部 `done`
 *   - phase 已登记：其前为 `done`（若 `state.yaml` 记 `skipped` 则 `skipped`）、自身 `active`、其后 `pending`
 *   - phase 未登记（含 `idle`）/旁路：全部 `pending`，不猜归属
 */
function buildPhaseGroups(
  kind: WorkflowTaskKind | null,
  phase: string,
  phaseStatuses: Record<string, string>,
  archived: boolean,
): PhaseGroup[] {
  if (!kind) {
    return [];
  }
  const defs = getKindPhases(kind);
  const idx = phaseIndexIn(kind, phase);

  const nodes: PhaseNode[] = defs.map((def, i) => {
    let status: PhaseNodeStatus;
    if (archived) {
      status = 'done';
    } else if (phaseStatuses[def.code] === 'skipped') {
      status = 'skipped';
    } else if (idx < 0) {
      status = 'pending';
    } else if (i < idx) {
      status = 'done';
    } else if (i === idx) {
      status = 'active';
    } else {
      status = 'pending';
    }
    return { code: def.code, name: def.name, optional: def.optional === true, status };
  });

  // 按阶段表里的分组顺序聚合（分组名来自单一表，不在这儿写死）
  const groups: PhaseGroup[] = [];
  for (const node of nodes) {
    const groupName = phaseGroupOf(kind, node.code) ?? '';
    const existing = groups.find((g) => g.name === groupName);
    if (existing) {
      existing.phases.push(node);
      continue;
    }
    groups.push({ name: groupName, status: 'pending', phases: [node] });
  }
  for (const group of groups) {
    const allDone = group.phases.every((p) => p.status === 'done' || p.status === 'skipped');
    const hasActive = group.phases.some((p) => p.status === 'active');
    group.status = allDone ? 'completed' : hasActive ? 'active' : 'pending';
  }
  return groups;
}

/** 游标 → 列表项 */
function toTaskItem(cursor: TaskCursor, projectRoot: string): TaskItem {
  const kind = cursor.kind;
  const archived = cursor.source !== 'cursor';
  // 归档项没有游标 phase（游标已被清），运行态从归档目录读；phase 用合成值
  const runtime = kind
    ? readTaskRuntime(projectRoot, kind, cursor.task_id, archived ? '' : cursor.phase)
    : null;
  const phase = archived ? 'archived' : (cursor.phase ?? '');
  const checkboxes =
    runtime && !archived && kind ? readTaskCheckboxes(projectRoot, kind, cursor.task_id) : null;

  return {
    task_id: cursor.task_id,
    kind,
    kind_label: kind ? getKindLabel(kind) : '',
    phase,
    // 'archived' 是合成值，不参与阶段表判定（归档不显示未知阶段）
    phase_known: archived || (kind ? isKnownPhase(kind, phase) : false),
    phase_group: archived || !kind ? null : phaseGroupOf(kind, phase),
    phase_index: archived || !kind ? -1 : phaseIndexIn(kind, phase),
    phase_total: kind ? getKindPhases(kind).length : 0,
    channel: cursor.channel || runtime?.channel || '',
    mode: runtime?.mode ?? '',
    title: runtime?.title ?? cursor.task_id,
    worktree_path: cursor.worktree_path || runtime?.worktreePath || '',
    started_at: cursor.started_at,
    updated_at: runtime?.updatedAt ?? '',
    archived_at: cursor.archived_at,
    source: cursor.source,
    state_missing: runtime?.stateMissing ?? true,
    task_path: taskPathOf(cursor),
    tasks_done: checkboxes?.done ?? null,
    tasks_total: checkboxes?.total ?? null,
    phase_groups: buildPhaseGroups(kind, phase, runtime?.phaseStatuses ?? {}, archived),
  };
}

/** 列表端点：游标任务 + 归档任务 */
export async function listTasks(
  projectRoot: string,
  options: ListTasksOptions = {},
): Promise<{ tasks: TaskItem[]; counts: TaskCounts }> {
  const status = options.status ?? 'active';
  const kindFilter = parseWorkflowTaskKind(options.kind);

  const activeCursors =
    status === 'active' || status === 'all' ? await scanTaskList(projectRoot) : [];
  const archivedCursors =
    status === 'archived' || status === 'all' ? scanArchivedTasks(projectRoot) : [];

  // counts 不受 kind 过滤影响（口径 = 本项目的活跃/归档总数）
  const allActive = activeCursors.map((c) => toTaskItem(c, projectRoot));
  const allArchived = archivedCursors.map((c) => toTaskItem(c, projectRoot));

  const byKind: Record<string, number> = {};
  for (const task of allActive) {
    if (task.kind) {
      byKind[task.kind] = (byKind[task.kind] ?? 0) + 1;
    }
  }

  const applyKind = (list: TaskItem[]) =>
    kindFilter ? list.filter((t) => t.kind === kindFilter) : list;

  return {
    // status=archived 只给归档；其余给「活跃 + 归档」合集（与 M1 的列表行为一致）
    tasks:
      status === 'archived'
        ? applyKind(allArchived)
        : [...applyKind(allActive), ...applyKind(allArchived)],
    counts: { active: allActive.length, archived: allArchived.length, by_kind: byKind },
  };
}

/** 按 id 在游标与归档里定位（kind 提示优先） */
function findCursor(
  taskId: string,
  kindHint: string | undefined,
  active: TaskCursor[],
  archived: TaskCursor[],
): TaskCursor | null {
  const hint = parseWorkflowTaskKind(kindHint);
  const withHint = (list: TaskCursor[]) =>
    list.find((c) => c.task_id === taskId && (!hint || c.kind === hint));
  const anyKind = (list: TaskCursor[]) => list.find((c) => c.task_id === taskId);

  return withHint(active) ?? anyKind(active) ?? withHint(archived) ?? anyKind(archived) ?? null;
}

/** 详情端点 */
export async function getTaskDetail(
  projectRoot: string,
  taskId: string,
  kindHint?: string,
): Promise<TaskDetail | { error: string }> {
  const cursor = findCursor(
    taskId,
    kindHint,
    await scanTaskList(projectRoot),
    scanArchivedTasks(projectRoot),
  );
  if (!cursor) {
    return { error: `Task "${taskId}" not found` };
  }

  const item = toTaskItem(cursor, projectRoot);
  const kind = cursor.kind ?? 'coding';
  const files = listTaskFiles(projectRoot, kind, cursor.task_id);

  const artifacts = cursor.kind
    ? getKindArtifacts(cursor.kind).flatMap((artifact) =>
        artifact.relPaths.map((rel) => {
          const relPath = rel.replace('<id>', cursor.task_id);
          return {
            phase: artifact.phase,
            relPath,
            kind: artifact.kind,
            exists: existsSync(path.join(projectRoot, relPath)),
          };
        }),
      )
    : [];

  return { ...item, files, artifacts };
}

/** 计划校验端点（只读）：跑 `tasks-lint`，不写任何文件 */
export type PlanLintResponse = {
  /** null 表示「没有可校验的计划文件」，不是失败 */
  pass: boolean | null;
  violations: string[];
  /** 实际被检查的文件（项目根相对路径）；无可校验文件时为空串 */
  file: string;
  /** pass 为 null 时的原因 */
  reason: string;
};

export async function lintTaskPlan(
  projectRoot: string,
  taskId: string,
  kindHint?: string,
): Promise<PlanLintResponse | { error: string }> {
  const cursor = findCursor(
    taskId,
    kindHint,
    await scanTaskList(projectRoot),
    scanArchivedTasks(projectRoot),
  );
  if (!cursor) {
    return { error: `Task "${taskId}" not found` };
  }
  if (!cursor.kind) {
    return { pass: null, violations: [], file: '', reason: '无法确定任务类型，不猜计划文件位置' };
  }

  // 计划文件由产物表声明（`checkboxes: true` 的那条），**不写死 `tasks.md`** ——
  // 每个 kind 的计划文件名/落点可以不同，写死会让 debug / prototype 静默校验错文件。
  const targets = getKindArtifacts(cursor.kind)
    .filter((a) => a.checkboxes)
    .flatMap((a) => a.relPaths.map((rel) => rel.replace('<id>', cursor.task_id)));
  if (targets.length === 0) {
    return { pass: null, violations: [], file: '', reason: '该任务类型无计划文件' };
  }

  const rel = targets.find((r) => existsSync(path.join(projectRoot, r)));
  if (!rel) {
    return { pass: null, violations: [], file: '', reason: '计划文件尚未生成' };
  }

  const result = await runTasksLint(path.join(projectRoot, rel));
  return { pass: result.pass, violations: result.violations, file: rel, reason: '' };
}

export type TaskStats = {
  total: number;
  active: number;
  archived: number;
  by_kind: Record<string, number>;
  by_phase: Record<string, number>;
  /** 所有活跃任务里 `tasks.md` 复选框的合计（无该产物的任务不参与） */
  tasks_done: number;
  tasks_total: number;
};

/** 统计端点：按当前项目汇总 */
export async function computeTaskStats(projectRoot: string): Promise<TaskStats> {
  const { tasks, counts } = await listTasks(projectRoot, { status: 'all' });
  const byPhase: Record<string, number> = {};
  let tasksDone = 0;
  let tasksTotal = 0;

  for (const task of tasks) {
    if (task.source !== 'cursor') {
      continue;
    }
    const key = task.phase || '(空)';
    byPhase[key] = (byPhase[key] ?? 0) + 1;
    if (task.tasks_done !== null) {
      tasksDone += task.tasks_done;
      tasksTotal += task.tasks_total ?? 0;
    }
  }

  return {
    total: tasks.length,
    active: counts.active,
    archived: counts.archived,
    by_kind: counts.by_kind,
    by_phase: byPhase,
    tasks_done: tasksDone,
    tasks_total: tasksTotal,
  };
}
