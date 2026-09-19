/**
 * 任务读写 API（`/api/tasks*`）。
 *
 * 数据源：`.polaris/workflow.yaml` 的 5 个游标数组 + `state.yaml`（运行态）
 * + `openspec/changes/<id>/` 文件树。**phase 取自游标**，不取 `state.yaml.phase`
 * （依据 `docs/specs/2026-09-19-phase-truth-unification-design.md` §1.1）。
 *
 * 写操作（M3）：**一律经 `src/core/hooks/*` 的原语函数**，本模块不写任何文件
 * —— `advanceTaskPhase` 调 `runWorkflowEntry`（持 `workflow.lock`），并在返回前
 * 回读游标校对。这是设计文档 §5.2 的硬约束：绕过 `.locks/` 的直写路径不许存在。
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
import { runTaskStateEntry } from '../../core/hooks/task-state-entry.js';
import { planDeliveryCleanup, runDeliveryCleanup } from '../../core/hooks/delivery-cleanup.js';
import { runWorkflowEntry } from '../../core/hooks/workflow-entry.js';
import {
  findPlanFile,
  listTaskFiles,
  planFileCandidates,
  readTaskCheckboxes,
  type TaskFile,
} from '../scan/files.js';
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
  /**
   * 可勾选的计划文件（项目根相对 posix）；该 kind 无复选框产物或文件未生成时为空串。
   * 前端据此判断「当前展示的文件能否直接勾选」，而不是靠文件名猜。
   */
  plan_file: string;
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
  const planFile = !archived && kind ? findPlanFile(projectRoot, kind, cursor.task_id) : '';

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
    plan_file: planFile,
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

/**
 * 计划校验端点（只读）：跑 `tasks-lint`，不写任何文件
 */
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

  const candidates = planFileCandidates(cursor.kind, cursor.task_id);
  if (candidates.length === 0) {
    return { pass: null, violations: [], file: '', reason: '该任务类型无计划文件' };
  }

  const rel = findPlanFile(projectRoot, cursor.kind, cursor.task_id);
  if (!rel) {
    return { pass: null, violations: [], file: '', reason: '计划文件尚未生成' };
  }

  const result = await runTasksLint(path.join(projectRoot, rel));
  return { pass: result.pass, violations: result.violations, file: rel, reason: '' };
}

export type AdvancePhaseResponse =
  | {
      ok: true;
      task_id: string;
      kind: WorkflowTaskKind;
      from: string;
      to: string;
      /** 回读后的步骤条，前端直接据此重渲染，不必再拉一次详情 */
      phase_groups: PhaseGroup[];
      phase_index: number;
      phase_total: number;
    }
  | { error: string };

/**
 * 推进阶段（M3 写操作之一）。
 *
 * 只写**游标**（`workflow.yaml`），不碰 `state.yaml.phase` —— 后者是只写不读的镜像
 * （phase 真相归一设计 §1.1），面板去维护它只会制造第二个真相。
 *
 * 按 D19 **只做推进**：目标阶段必须严格晚于当前；回退需要写 `regressions[]` 留痕，
 * 属独立切片。校验放在传输层是有意的 —— 原语 `update-active` 不校验 phase 取值
 * （原语级白名单属「phase 归一 A 案」），面板若不自守就会把拼错的阶段名写进游标。
 */
export async function advanceTaskPhase(
  projectRoot: string,
  taskId: string,
  rawBody: string,
  kindHint?: string,
): Promise<AdvancePhaseResponse> {
  let payload: { to?: unknown; kind?: unknown };
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return { error: '无效的 JSON 请求体' };
  }
  const to = typeof payload.to === 'string' ? payload.to.trim() : '';
  if (!to) {
    return { error: '缺少 to（目标阶段）' };
  }
  const hint = kindHint ?? (typeof payload.kind === 'string' ? payload.kind : undefined);

  const cursor = findCursor(taskId, hint, await scanTaskList(projectRoot), []);
  if (!cursor) {
    return { error: `Task "${taskId}" not found` };
  }
  if (cursor.source !== 'cursor') {
    return { error: `任务「${taskId}」已归档（来源 ${cursor.source}），不能推进阶段` };
  }
  const kind = cursor.kind;
  if (!kind) {
    return { error: `无法确定任务「${taskId}」的类型，不能推进阶段` };
  }

  const mainline = getKindPhases(kind);
  const legal = mainline.map((p) => `${p.code}(${p.name})`).join(' / ');
  if (!isKnownPhase(kind, to)) {
    return { error: `未知阶段「${to}」。${kind} 的合法阶段：${legal}` };
  }
  if (!mainline.some((p) => p.code === to)) {
    return {
      error: `「${to}」是旁路阶段，不在 ${kind} 的主序列中，不能由面板推进。合法阶段：${legal}`,
    };
  }

  const from = cursor.phase ?? '';
  const fromIdx = phaseIndexIn(kind, from);
  const toIdx = phaseIndexIn(kind, to);
  if (fromIdx < 0) {
    return {
      error: `当前阶段「${from || '(空)'}」未登记在 ${kind} 的阶段表中，无法判断推进方向；请人工确认后用 CLI 处理`,
    };
  }
  if (toIdx <= fromIdx) {
    return {
      error: `只支持推进：当前「${from}」，目标「${to}」不比它更晚（回退留痕属后续切片）`,
    };
  }

  const wf = await runWorkflowEntry({
    op: 'update-active',
    skill: 'dashboard',
    kind,
    repoRoot: projectRoot,
    whereTaskId: taskId,
    setPhase: to,
  });
  if (wf.exitCode !== 0) {
    return { error: wf.message || `原语执行失败（exit ${wf.exitCode}）` };
  }

  // 不信原语的自述，回读游标校对 —— 「写了但没写对」比「没写」更难发现
  const after = findCursor(taskId, kind, await scanTaskList(projectRoot), []);
  if (!after || after.phase !== to) {
    return {
      error: `写入后回读不一致：期望 phase=${to}，实际 ${after ? after.phase : '(条目已消失)'}`,
    };
  }

  const item = toTaskItem(after, projectRoot);
  return {
    ok: true,
    task_id: taskId,
    kind,
    from,
    to,
    phase_groups: item.phase_groups,
    phase_index: item.phase_index,
    phase_total: item.phase_total,
  };
}

export type SetCheckboxResponse =
  | {
      ok: true;
      task_id: string;
      /** 被改动的文件（项目根相对路径） */
      file: string;
      /** 复选框序号（0-based） */
      ordinal: number;
      /** 1-based 行号，便于人对照编辑器 */
      line: number;
      checked: boolean;
      /** 是否真的改动了（已是目标值时为 false） */
      changed: boolean;
      tasks_done: number;
      tasks_total: number;
      /** `state.yaml` 的 `runtime.build` 计数是否同步（无该块时为 false） */
      state_synced: boolean;
    }
  | { error: string };

/**
 * 勾选 `tasks.md` 的一行（M3 写操作之一）。
 *
 * 经 `task-state-entry set-checkbox`：它持 `task-state-<id>.lock`，并在**同一次锁内**
 * 把 `state.yaml` 的 `runtime.build` 计数一起改掉（验收要求三者一致）。本层只做
 * 参数整形与回读，不碰文件。
 *
 * `file` 可由调用方显式给出；不给时按**产物表**声明（`checkboxes: true` 的那条）推导
 * —— 前端因此不需要知道各 kind 的计划文件在哪，也就不会写死 `openspec/changes/...`。
 */
export async function setTaskCheckbox(
  projectRoot: string,
  taskId: string,
  rawBody: string,
  kindHint?: string,
): Promise<SetCheckboxResponse> {
  let payload: { file?: unknown; index?: unknown; checked?: unknown; kind?: unknown };
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return { error: '无效的 JSON 请求体' };
  }
  if (typeof payload.checked !== 'boolean') {
    return { error: '缺少 checked（true | false）' };
  }
  if (!Number.isInteger(payload.index) || (payload.index as number) < 0) {
    return { error: 'index 必须是非负整数（第几个复选框，0-based）' };
  }
  const hint = kindHint ?? (typeof payload.kind === 'string' ? payload.kind : undefined);

  const cursor = findCursor(taskId, hint, await scanTaskList(projectRoot), []);
  if (!cursor) {
    return { error: `Task "${taskId}" not found` };
  }
  if (cursor.source !== 'cursor') {
    return { error: `任务「${taskId}」已归档（来源 ${cursor.source}），不能改动` };
  }
  const kind = cursor.kind;
  if (!kind) {
    return { error: `无法确定任务「${taskId}」的类型，不能定位计划文件` };
  }

  let rel = typeof payload.file === 'string' ? payload.file.trim() : '';
  if (!rel) {
    const candidates = planFileCandidates(kind, taskId);
    if (candidates.length === 0) {
      return { error: `${kind} 类型无复选框产物，无可勾选内容` };
    }
    rel = findPlanFile(projectRoot, kind, taskId);
    if (!rel) {
      return { error: `计划文件尚未生成：${candidates[0]}` };
    }
  }

  const result = await runTaskStateEntry({
    op: 'set-checkbox',
    repoRoot: projectRoot,
    taskId,
    kind,
    skill: 'dashboard',
    file: rel,
    index: payload.index as number,
    checked: payload.checked,
  });
  if (result.exitCode !== 0) {
    return { error: result.message || `原语执行失败（exit ${result.exitCode}）` };
  }

  const value = (result.value ?? {}) as Record<string, unknown>;
  const progress = readTaskCheckboxes(projectRoot, kind, taskId);
  return {
    ok: true,
    task_id: taskId,
    file: typeof value.file === 'string' ? value.file : rel,
    ordinal: typeof value.ordinal === 'number' ? value.ordinal : (payload.index as number),
    line: typeof value.line === 'number' ? value.line : 0,
    checked: payload.checked,
    changed: value.changed === true,
    tasks_done: progress?.done ?? 0,
    tasks_total: progress?.total ?? 0,
    state_synced: value.state_synced === true,
  };
}

export type CleanupResponse =
  | {
      ok: true;
      /** true = 仅预演，未做任何修改 */
      dry_run: boolean;
      task_id: string;
      kind: WorkflowTaskKind;
      /** 将被删除（或已删除）的**绝对路径** */
      will_delete: string[];
      /** 将移出（或已移出）游标的条目 */
      entry: { kind: WorkflowTaskKind; phase: string } | null;
    }
  | { error: string };

/**
 * 交付清理（M3 写操作之一，**不可逆**）。
 *
 * 经 `ship-cleanup` 原语：删游标条目 + `rm -rf` 任务档案目录。因为不可逆，
 * 必须显式二选一：`{dry_run:true}` 只算清单，`{confirm:true}` 才真的执行。
 * 两者都不给就报错 —— 「默认执行」的默认值在这种操作上等于没有确认。
 *
 * `kind` 由游标读出后**显式**传给原语：旧实现把 kind 写死 coding，导致非 coding 任务
 * 「删条目」静默失败而档案照样被删（已修，但这条路径必须继续显式传）。
 */
export async function cleanupTask(
  projectRoot: string,
  taskId: string,
  rawBody: string,
  kindHint?: string,
): Promise<CleanupResponse> {
  let payload: { dry_run?: unknown; confirm?: unknown; kind?: unknown };
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return { error: '无效的 JSON 请求体' };
  }

  const dryRun = payload.dry_run === true;
  const confirmed = payload.confirm === true;
  if (!dryRun && !confirmed) {
    return {
      error: '交付清理不可逆：必须显式指定 dry_run:true（预演）或 confirm:true（执行）',
    };
  }
  const hint = kindHint ?? (typeof payload.kind === 'string' ? payload.kind : undefined);

  const cursor = findCursor(taskId, hint, await scanTaskList(projectRoot), []);
  if (!cursor) {
    return { error: `Task "${taskId}" not found` };
  }
  if (cursor.source !== 'cursor') {
    return { error: `任务「${taskId}」不在活跃游标中（来源 ${cursor.source}），无需清理` };
  }
  const kind = cursor.kind;
  if (!kind) {
    return { error: `无法确定任务「${taskId}」的类型，不能清理` };
  }

  if (dryRun) {
    const plan = await planDeliveryCleanup(taskId, projectRoot, kind);
    if (!plan.ok) {
      return { error: plan.message };
    }
    return {
      ok: true,
      dry_run: true,
      task_id: taskId,
      kind,
      will_delete: plan.willDelete,
      entry: plan.entry,
    };
  }

  const result = await runDeliveryCleanup(taskId, projectRoot, kind);
  if (result.exitCode !== 0) {
    return { error: result.message || `原语执行失败（exit ${result.exitCode}）` };
  }
  const plan = result.plan;
  return {
    ok: true,
    dry_run: false,
    task_id: taskId,
    kind,
    will_delete: plan && plan.ok ? plan.willDelete : [],
    entry: plan && plan.ok ? plan.entry : null,
  };
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
