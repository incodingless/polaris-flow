/**
 * workflow.yaml RMW 入口（对齐 assets/shared/scripts/workflow-entry.mjs）。
 * 持锁 → 解析 → 修改 → 写回 → 写后校验；由 `polaris workflow-entry` 调用。
 * `get-active-changes` 为只读：不持锁、不写盘，stdout 输出 task_id JSON 数组。
 * 任务列表由必填 `--kind`（coding|requirement|testcase|prototype|debug）选定；
 * 返回顺序按任务目录下一层文件 mtime 升序（最后一项 = 最近工作）。
 *
 * **条目不含 `phase`**：阶段是任务的运行态，唯一存放处是
 * `.polaris/tasks/<id>/state.yaml`（读取位置由条目 `worktree_path` 决定）。
 * 本模块因此**只**负责「有哪些在途任务」；涉及阶段的读（`--format full` / `--phase` 过滤）
 * 会去读对应任务的 state.yaml。
 */
import { execFileSync } from 'child_process';
import { readdir, stat } from 'fs/promises';
import path from 'path';

import { getTaskKindDir, resolveTaskStatePath } from '../assets/polaris-paths.js';
import {
  modeLabel,
  normalizeMode,
  normalizePhase,
  phaseLabel,
  skillForModePhase,
  skillLabel,
} from '../config/task-kind-layout.js';
import { loadTaskStateFromFile } from '../config/task-state.js';
import {
  ensureWorkflowStateFile,
  getTaskList,
  getWorkflowStatePath,
  loadWorkflowState,
  parseWorkflowTaskKind,
  saveWorkflowState,
  setTaskList,
  workflowTaskKindErrorMessage,
  type WorkflowState,
  type WorkflowTaskEntry,
  type WorkflowTaskKind,
} from '../config/workflow-state.js';
import { acquireWorkflowLock, WorkflowLockError } from './workflow-lock.js';

export type WorkflowEntryOp =
  'get-active-changes' | 'append-active' | 'update-active' | 'rename-active' | 'delete-active';

export type WorkflowEntryArgs = {
  op: WorkflowEntryOp;
  /** 锁文件写者标识（写 op 必填；`get-active-changes` 为只读、不需要） */
  skill?: string;
  /** 任务类型：选定 YAML 列表 */
  kind?: string;
  repoRoot?: string;
  taskId?: string;
  worktreePath?: string;
  startedAt?: string;
  whereTaskId?: string;
  from?: string;
  to?: string;
  setWorktreePath?: string;
  /** debug 族通道：bugfix | hotfix（append-active 时写入 entry） */
  channel?: string;
  /**
   * 仅 `get-active-changes`：按阶段过滤（值取自各任务 state.yaml 的 `phase`）。
   * 不传则返回该 kind 的全部在途任务。
   */
  phase?: string;
  /**
   * 仅 `get-active-changes`：输出格式。
   * `ids`（默认）= task_id JSON 数组，**不读 state.yaml**；
   * `full` = 每行 `task_id` / `worktree_path` / `state_path` / `phase` / `mode` / `skill`
   * / `state_readable` 的 JSON 数组（`skill` 由 `skillForModePhase` 从**代码阶段表**解析，见其 doc）。
   */
  format?: 'ids' | 'full';
  /** 测试用：覆盖锁超时 */
  lockOptions?: {
    staleMs?: number;
    spinMs?: number;
    pollMs?: number;
    now?: () => number;
  };
};

export type WorkflowEntryResult = {
  exitCode: number;
  message?: string;
  /** get-active-changes：完整条目 */
  tasks?: WorkflowTaskEntry[];
  /** get-active-changes：仅 task_id 列表 */
  taskIds?: string[];
  /** get-active-changes --format full：含阶段与应执行技能的行 */
  rows?: WorkflowDispatchRow[];
};

/**
 * `get-active-changes --format full` 的单行：游标条目 + 从该任务 state.yaml 读出的运行态。
 *
 * 阶段**不来自游标**（游标里没有该字段），而来自 `state_path` 指向的那个文件。
 */
export type WorkflowDispatchRow = {
  task_id: string;
  /** 通用 locator：空 = 任务在主仓；非空 = 任务目录在 worktree 内 */
  worktree_path: string;
  /** 该任务 state.yaml 的绝对路径（读端定位结果，便于排查"读不到"） */
  state_path: string;
  /** `state.yaml` 的顶层 `phase`（语义 = 接下来要执行的阶段）；读不到时为空串 */
  phase: string;
  /** `phase` 的中文显示名（阶段表 `KindPhaseDef.name`）；未登记时为空串 */
  phase_label: string;
  /** `state.yaml` 的 `workflow.mode`（`tweak` / `normal` / `strict`；历史 `full` 已归一；旧数据可能为空串） */
  mode: string;
  /** `mode` 的中文显示名（`WORKFLOW_MODE_LABELS`）；未登记时为空串 */
  mode_label: string;
  /** 应执行的技能名（族内相对名，如 `plan` / `tweak`）；`null` = 未知 / 旁路 / 读不到 */
  skill: string | null;
  /** `skill` 的中文显示名（由 `skillLabel` 从阶段表 / 通道表派生）；未登记时为空串 */
  skill_label: string;
  /** `state.yaml` 是否读到（`false` = 无法路由，调用方必须阻断而不是猜） */
  state_readable: boolean;
};

type VerifySpec = {
  kind: 'has_tid' | 'no_tid' | 'entry_worktree';
  val: string;
  taskKind: WorkflowTaskKind;
};

/** 解析主仓根：显式路径或 git toplevel */
export function resolveRepoRoot(explicit?: string, cwd: string = process.cwd()): string | null {
  if (explicit) {
    return path.resolve(explicit);
  }
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return null;
  }
}

/**
 * 校验并返回 WorkflowTaskKind；失败抛 WorkflowEntryParamError。
 */
function requireKind(raw: string | undefined): WorkflowTaskKind {
  const kind = parseWorkflowTaskKind(raw);
  if (!kind) {
    throw new WorkflowEntryParamError(workflowTaskKindErrorMessage());
  }
  return kind;
}

/**
 * 从 state 读取指定 kind 的全部任务条目（阶段不在条目里，故无阶段过滤）。
 */
export function listTasks(state: WorkflowState, kind: WorkflowTaskKind): WorkflowTaskEntry[] {
  return getTaskList(state, kind);
}

/**
 * 应用写 op 到 workflow state（纯函数，不写盘）。
 */
export function applyWorkflowOp(
  state: WorkflowState,
  args: WorkflowEntryArgs,
): { state: WorkflowState; verify: VerifySpec; verifyNeg?: VerifySpec } {
  const taskKind = requireKind(args.kind);
  const list = getTaskList(state, taskKind);

  switch (args.op) {
    case 'append-active': {
      if (!args.taskId) {
        throw new WorkflowEntryParamError('append-active 需要 --task-id');
      }
      // 幂等「注册」：该 task_id 已在列表里 → 原样返回，不改动已有条目。
      // 入口技能在「新建」与「adopt 孤儿 draft」两条路上都要执行本 op；
      // 幂等后调用方无需先查再写（登记天然可重入，重复执行不产生重复 entry）。
      if (list.some((e) => e.task_id === args.taskId)) {
        return {
          state,
          verify: { kind: 'has_tid', val: args.taskId, taskKind },
        };
      }
      list.push({
        task_id: args.taskId,
        worktree_path: args.worktreePath ?? '',
        started_at: args.startedAt ?? '',
        channel: args.channel ?? '',
      });
      return {
        state: setTaskList(state, taskKind, list),
        verify: { kind: 'has_tid', val: args.taskId, taskKind },
      };
    }
    case 'update-active': {
      if (!args.whereTaskId) {
        throw new WorkflowEntryParamError('update-active 需要 --where-task-id');
      }
      const idx = list.findIndex((e) => e.task_id === args.whereTaskId);
      if (idx < 0) {
        throw new WorkflowEntryParamError(
          `update-active 未找到 task_id=${args.whereTaskId} 的 entry（kind=${taskKind}）`,
        );
      }
      const cur = list[idx];
      const newWt = args.setWorktreePath ?? cur.worktree_path;
      list[idx] = { ...cur, worktree_path: newWt };
      return {
        state: setTaskList(state, taskKind, list),
        verify: {
          kind: 'entry_worktree',
          val: `${args.whereTaskId}|${newWt}`,
          taskKind,
        },
      };
    }
    case 'rename-active': {
      if (!args.from || !args.to) {
        throw new WorkflowEntryParamError('rename-active 需要 --from <old> --to <new>');
      }
      const idx = list.findIndex((e) => e.task_id === args.from);
      if (idx < 0) {
        throw new WorkflowEntryParamError(
          `rename-active 未找到 task_id=${args.from} 的 entry（kind=${taskKind}）`,
        );
      }
      list[idx] = { ...list[idx], task_id: args.to };
      return {
        state: setTaskList(state, taskKind, list),
        verify: { kind: 'has_tid', val: args.to, taskKind },
        verifyNeg: { kind: 'no_tid', val: args.from, taskKind },
      };
    }
    case 'delete-active': {
      if (!args.whereTaskId) {
        throw new WorkflowEntryParamError('delete-active 需要 --where-task-id');
      }
      const next = list.filter((e) => e.task_id !== args.whereTaskId);
      return {
        state: setTaskList(state, taskKind, next),
        verify: { kind: 'no_tid', val: args.whereTaskId, taskKind },
      };
    }
    default:
      throw new WorkflowEntryParamError(`未知 op '${(args as WorkflowEntryArgs).op}'`);
  }
}

/** 参数错误 */
export class WorkflowEntryParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowEntryParamError';
  }
}

/**
 * 写后校验（读回文件内容检查）。
 */
export async function verifyWorkflowFile(repoRoot: string, spec: VerifySpec): Promise<boolean> {
  const state = await loadWorkflowState(repoRoot);
  const list = getTaskList(state, spec.taskKind);

  switch (spec.kind) {
    case 'has_tid':
      return list.some((e) => e.task_id === spec.val);
    case 'no_tid':
      return !list.some((e) => e.task_id === spec.val);
    case 'entry_worktree': {
      const [tid, wantWt] = spec.val.split('|');
      const hit = list.find((e) => e.task_id === tid);
      return Boolean(hit && hit.worktree_path === wantWt);
    }
    default:
      return false;
  }
}

/**
 * 任务目录下一层文件 mtime 的最大值（毫秒）。
 * 目录缺失、空目录或只有子目录时视为最旧（0）；单项 stat 失败不影响其余文件。
 */
export async function taskUpdatedMs(
  repoRoot: string,
  kind: WorkflowTaskKind,
  taskId: string,
): Promise<number> {
  const dir = getTaskKindDir(repoRoot, kind, taskId);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }

  let maxMs = 0;
  for (const name of names) {
    try {
      const fileStat = await stat(path.join(dir, name));
      if (fileStat.isFile() && fileStat.mtimeMs > maxMs) {
        maxMs = fileStat.mtimeMs;
      }
    } catch {
      // 单项失败不影响其余文件
    }
  }
  return maxMs;
}

/**
 * 按任务目录文件 mtime 升序；时间相等时保留原相对顺序（回落 workflow.yaml 顺序）。
 */
export async function sortByUpdatedAt(
  tasks: WorkflowTaskEntry[],
  repoRoot: string,
  kind: WorkflowTaskKind,
): Promise<WorkflowTaskEntry[]> {
  const keyed = await Promise.all(
    tasks.map(async (task, index) => ({
      task,
      index,
      ms: await taskUpdatedMs(repoRoot, kind, task.task_id),
    })),
  );
  keyed.sort((a, b) => a.ms - b.ms || a.index - b.index);
  return keyed.map((row) => row.task);
}

/**
 * 构造 `get-active-changes --format full` 的单行：游标条目 + 该任务 `state.yaml` 的运行态。
 *
 * 阶段**不来自游标**（游标里没有该字段），而来自 `state_path` 指向的那个文件；
 * 位置由条目的 `worktree_path` 决定（见 `resolveTaskStatePath`）。
 * 中文显示名一律由阶段表 / 通道表派生，**调用方不复制映射**。
 *
 * 导出供 `task-entry` 复用 —— 两侧必须给出**同一份**运行态形状。
 */
export async function buildDispatchRow(
  repoRoot: string,
  kind: WorkflowTaskKind,
  taskId: string,
  worktreePath: string,
): Promise<WorkflowDispatchRow> {
  const statePath = resolveTaskStatePath(repoRoot, kind, taskId, worktreePath);
  const state = await loadTaskStateFromFile(statePath);
  const phase = String(state?.phase ?? '');
  // 归一到现行名（历史 `full` → `strict`）—— 让 `mode` 与 `mode_label` 指向同一个值；
  // 与 `state.yaml` 里同名的 `verify_mode` 无关（那是验证强度，另一个维度）。
  const mode = normalizeMode(String(state?.workflow?.mode ?? ''));
  const skill = skillForModePhase(kind, phase);
  return {
    task_id: taskId,
    worktree_path: worktreePath ?? '',
    state_path: statePath,
    phase,
    phase_label: phaseLabel(kind, phase),
    mode,
    mode_label: modeLabel(mode),
    skill,
    skill_label: skillLabel(kind, skill ?? ''),
    state_readable: state !== null,
  };
}

/**
 * 只读：加载指定 kind 的任务列表，按最近工作排序后输出。
 *
 * - 默认（`--format ids`，且未传 `--phase`）**不读 state.yaml**，stdout 输出 task_id 的
 *   JSON 数组，例如 `["foo","bar"]`（最后一项 = 最近工作）。
 * - 传 `--phase` 或 `--format full` 时，逐条读取该任务的 `state.yaml`（位置由条目的
 *   `worktree_path` 决定，见 `resolveTaskStatePath`）：`phase` 与 `workflow.mode` 都出自该文件，
 *   再用阶段表派生**应执行技能**。这是各技能 Step 0 判定「接手 / 转交」的**唯一判据来源**
 *   （表在代码里，技能不复制）。
 * - 每行同时给出 `phase_label` / `mode_label` / `skill_label` 三个中文显示名（由
 *   `phaseLabel` / `modeLabel` / `skillLabel` 从阶段表与通道表派生，见 `task-kind-layout.ts`），
 *   供技能把候选显示成 `中文(英文)` —— **技能不持有任何映射表**。
 * - `state.yaml` 读不到的行：`phase=''`、`skill=null`、`state_readable=false`。
 *   调用方**必须阻断**（不许猜成"没状态所以放行"）—— 阶段只有一个来源，读不到就没有答案。
 */
async function runGetActiveChanges(args: WorkflowEntryArgs): Promise<WorkflowEntryResult> {
  let taskKind: WorkflowTaskKind;
  try {
    taskKind = requireKind(args.kind);
  } catch (err) {
    if (err instanceof WorkflowEntryParamError) {
      console.error(`[workflow-entry] 阻断：${err.message}`);
      return { exitCode: 3, message: err.message };
    }
    throw err;
  }

  const repoRoot = resolveRepoRoot(args.repoRoot);
  if (!repoRoot) {
    return { exitCode: 3, message: '无法解析主仓根' };
  }

  const loaded = await loadWorkflowState(repoRoot);
  const entries = listTasks(loaded, taskKind).filter((e) => e.task_id.length > 0);
  const sorted = await sortByUpdatedAt(entries, repoRoot, taskKind);

  const wantPhase = normalizePhase(args.phase ?? '');
  const needState = args.format === 'full' || Boolean(wantPhase);
  const rows: WorkflowDispatchRow[] = [];
  if (needState) {
    for (const entry of sorted) {
      rows.push(await buildDispatchRow(repoRoot, taskKind, entry.task_id, entry.worktree_path));
    }
  }

  const hit = wantPhase ? rows.filter((r) => normalizePhase(r.phase) === wantPhase) : rows;
  const hitIds = new Set(hit.map((r) => r.task_id));
  const tasks = needState ? sorted.filter((e) => hitIds.has(e.task_id)) : sorted;

  if (args.format === 'full') {
    console.log(JSON.stringify(hit));
    return { exitCode: 0, tasks, taskIds: hit.map((r) => r.task_id), rows: hit };
  }

  console.log(JSON.stringify(tasks.map((e) => e.task_id)));
  return { exitCode: 0, tasks, taskIds: tasks.map((e) => e.task_id) };
}

/**
 * 执行 workflow-entry；写 op 走完整 RMW，get-active-changes 只读。
 * 返回 exitCode（不 process.exit）。
 */
export async function runWorkflowEntry(args: WorkflowEntryArgs): Promise<WorkflowEntryResult> {
  if (!args.op) {
    return {
      exitCode: 3,
      message:
        '缺少 op(get-active-changes/append-active/update-active/rename-active/delete-active)',
    };
  }

  if (args.op === 'get-active-changes') {
    return runGetActiveChanges(args);
  }

  if (!args.skill) {
    return { exitCode: 3, message: '缺少 --skill <name>(用于锁文件写者标识)' };
  }

  const repoRoot = resolveRepoRoot(args.repoRoot);
  if (!repoRoot) {
    return { exitCode: 3, message: '无法解析主仓根' };
  }

  // 这里**不再有** phase 写入校验：游标条目已不含 phase（阶段唯一存放处是 state.yaml，
  // 校验点随之只剩 `task-state-entry` 一处）。见 phase-validation.ts 的说明。

  let lock;
  try {
    lock = await acquireWorkflowLock(repoRoot, args.skill, args.lockOptions);
  } catch (err) {
    if (err instanceof WorkflowLockError) {
      console.error(`[polaris-flow] 阻断：${err.message}`);
      console.error(`  锁内容: ${err.holder}`);
      console.error(`  请手动检查 ${err.lockPath} 持有者后清理`);
      return { exitCode: 1, message: err.message };
    }
    throw err;
  }

  try {
    await ensureWorkflowStateFile(repoRoot);
    const loaded = await loadWorkflowState(repoRoot);

    let applied;
    try {
      applied = applyWorkflowOp(loaded, args);
    } catch (err) {
      if (err instanceof WorkflowEntryParamError) {
        console.error(`[workflow-entry] 阻断：${err.message}`);
        return { exitCode: 3, message: err.message };
      }
      throw err;
    }

    await saveWorkflowState(repoRoot, applied.state);

    const ok = await verifyWorkflowFile(repoRoot, applied.verify);
    if (!ok) {
      console.error(
        `[workflow-entry] 写后校验失败(kind=${applied.verify.kind} val=${applied.verify.val})`,
      );
      console.error(
        `[workflow-entry] 期望状态未在 workflow.yaml 中观察到,请人工检查 ${getWorkflowStatePath(repoRoot)}`,
      );
      return { exitCode: 2, message: '写后校验失败' };
    }
    if (applied.verifyNeg) {
      const negOk = await verifyWorkflowFile(repoRoot, applied.verifyNeg);
      if (!negOk) {
        console.error(
          `[workflow-entry] 写后校验失败(rename 后旧 task_id=${applied.verifyNeg.val} 仍存在)`,
        );
        return { exitCode: 2, message: '写后校验失败' };
      }
    }

    return { exitCode: 0 };
  } finally {
    lock.release();
  }
}

/** 供测试导出：构造 WorkflowTaskEntry */
export function makeTaskEntry(
  partial: Partial<WorkflowTaskEntry> & Pick<WorkflowTaskEntry, 'task_id'>,
): WorkflowTaskEntry {
  return {
    task_id: partial.task_id,
    worktree_path: partial.worktree_path ?? '',
    started_at: partial.started_at ?? '',
    channel: partial.channel ?? '',
  };
}
