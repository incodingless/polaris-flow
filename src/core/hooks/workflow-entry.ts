/**
 * workflow.yaml RMW 入口（对齐 assets/shared/scripts/workflow-entry.sh）。
 * 持锁 → 解析 → 修改 → 写回 → 写后校验；由 `polaris workflow-entry` 调用。
 * `get-active-changes` 为只读：不持锁、不写盘，stdout 输出 task_id JSON 数组。
 * 任务列表由必填 `--kind`（coding|requirement|testcase|prototype|debug）选定。
 */
import { execFileSync } from 'child_process';
import path from 'path';

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
  | 'get-active-changes'
  | 'append-active'
  | 'update-active'
  | 'rename-active'
  | 'delete-active';

export type WorkflowEntryArgs = {
  op: WorkflowEntryOp;
  skill: string;
  /** 任务类型：选定 YAML 列表 */
  kind?: string;
  repoRoot?: string;
  taskId?: string;
  phase?: string;
  worktreePath?: string;
  startedAt?: string;
  whereTaskId?: string;
  from?: string;
  to?: string;
  setPhase?: string;
  setWorktreePath?: string;
  /** debug 族通道：bugfix | hotfix（append-active 时写入 entry） */
  channel?: string;
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
};

type VerifySpec = {
  kind: 'has_tid' | 'no_tid' | 'entry_phase';
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
 * 从 state 读取指定 kind 的任务列表；可选按 phase 过滤。
 */
export function listTasks(
  state: WorkflowState,
  kind: WorkflowTaskKind,
  phaseFilter?: string,
): WorkflowTaskEntry[] {
  const entries = getTaskList(state, kind);
  if (!phaseFilter) {
    return entries;
  }
  return entries.filter((e) => e.phase === phaseFilter);
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
      list.push({
        task_id: args.taskId,
        phase: args.phase ?? '',
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
      const newPh = args.setPhase ?? cur.phase;
      const newWt = args.setWorktreePath ?? cur.worktree_path;
      list[idx] = { ...cur, phase: newPh, worktree_path: newWt };
      return {
        state: setTaskList(state, taskKind, list),
        verify: {
          kind: 'entry_phase',
          val: `${args.whereTaskId}|${newPh}`,
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
    case 'entry_phase': {
      const [tid, wantPh] = spec.val.split('|');
      const hit = list.find((e) => e.task_id === tid);
      return Boolean(hit && hit.phase === wantPh);
    }
    default:
      return false;
  }
}

/**
 * 只读：加载指定 kind 的任务列表，可选 `--phase` 过滤。
 * stdout 输出 task_id 的 JSON 数组，例如 `["foo","bar"]`。
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
  const tasks = listTasks(loaded, taskKind, args.phase);
  const taskIds = tasks.map((e) => e.task_id).filter((id) => id.length > 0);
  console.log(JSON.stringify(taskIds));
  return { exitCode: 0, tasks, taskIds };
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
    phase: partial.phase ?? '',
    worktree_path: partial.worktree_path ?? '',
    started_at: partial.started_at ?? '',
    channel: partial.channel ?? '',
  };
}
