/**
 * workflow.yaml RMW 入口（对齐 assets/shared/scripts/workflow-entry.sh）。
 * 持锁 → 解析 → 修改 → 写回 → 写后校验；由 `polaris workflow-entry` 调用。
 * `get-active-changes` 为只读：不持锁、不写盘，stdout 输出 JSON 数组。
 */
import { execFileSync } from 'child_process';
import path from 'path';

import {
  ensureWorkflowStateFile,
  getWorkflowStatePath,
  loadWorkflowState,
  saveWorkflowState,
  type ActiveChangeEntry,
  type PendingTriageEntry,
  type WorkflowState,
} from '../config/workflow-state.js';
import { acquireWorkflowLock, WorkflowLockError } from './workflow-lock.js';

export type WorkflowEntryOp =
  | 'get-active-changes'
  | 'append-active'
  | 'update-active'
  | 'rename-active'
  | 'delete-active'
  | 'upsert-pending-triage'
  | 'delete-pending-triage';

export type WorkflowEntryArgs = {
  op: WorkflowEntryOp;
  skill: string;
  repoRoot?: string;
  changeId?: string;
  phase?: string;
  worktreePath?: string;
  startedAt?: string;
  whereChangeId?: string;
  from?: string;
  to?: string;
  sessionSuffix?: string;
  tier?: string;
  t1?: string;
  t2?: string;
  timestamp?: string;
  setPhase?: string;
  setWorktreePath?: string;
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
  activeChanges?: ActiveChangeEntry[];
  /** get-active-changes：仅 change_id 列表 */
  changeIds?: string[];
};

type VerifySpec = {
  kind: 'ac_has_cid' | 'ac_no_cid' | 'ac_entry_phase' | 'pt_has_ss' | 'pt_no_ss';
  val: string;
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
 * 从 state 读取 active_changes；可选按 phase 过滤。
 */
export function listActiveChanges(
  state: WorkflowState,
  phaseFilter?: string,
): ActiveChangeEntry[] {
  const entries = state.active_changes ?? [];
  if (!phaseFilter) {
    return [...entries];
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
  const active = [...state.active_changes];
  const pending = [...state.pending_triages];

  switch (args.op) {
    case 'append-active': {
      if (!args.changeId) {
        throw new WorkflowEntryParamError('append-active 需要 --change-id');
      }
      active.push({
        change_id: args.changeId,
        phase: args.phase ?? '',
        worktree_path: args.worktreePath ?? '',
        started_at: args.startedAt ?? '',
      });
      return {
        state: { ...state, active_changes: active, pending_triages: pending },
        verify: { kind: 'ac_has_cid', val: args.changeId },
      };
    }
    case 'update-active': {
      if (!args.whereChangeId) {
        throw new WorkflowEntryParamError('update-active 需要 --where-change-id');
      }
      const idx = active.findIndex((e) => e.change_id === args.whereChangeId);
      if (idx < 0) {
        throw new WorkflowEntryParamError(
          `update-active 未找到 change_id=${args.whereChangeId} 的 entry`,
        );
      }
      const cur = active[idx];
      const newPh = args.setPhase ?? cur.phase;
      const newWt = args.setWorktreePath ?? cur.worktree_path;
      active[idx] = { ...cur, phase: newPh, worktree_path: newWt };
      return {
        state: { ...state, active_changes: active, pending_triages: pending },
        verify: { kind: 'ac_entry_phase', val: `${args.whereChangeId}|${newPh}` },
      };
    }
    case 'rename-active': {
      if (!args.from || !args.to) {
        throw new WorkflowEntryParamError('rename-active 需要 --from <old> --to <new>');
      }
      const idx = active.findIndex((e) => e.change_id === args.from);
      if (idx < 0) {
        throw new WorkflowEntryParamError(`rename-active 未找到 change_id=${args.from} 的 entry`);
      }
      active[idx] = { ...active[idx], change_id: args.to };
      return {
        state: { ...state, active_changes: active, pending_triages: pending },
        verify: { kind: 'ac_has_cid', val: args.to },
        verifyNeg: { kind: 'ac_no_cid', val: args.from },
      };
    }
    case 'delete-active': {
      if (!args.whereChangeId) {
        throw new WorkflowEntryParamError('delete-active 需要 --where-change-id');
      }
      const next = active.filter((e) => e.change_id !== args.whereChangeId);
      return {
        state: { ...state, active_changes: next, pending_triages: pending },
        verify: { kind: 'ac_no_cid', val: args.whereChangeId },
      };
    }
    case 'upsert-pending-triage': {
      if (!args.sessionSuffix || !args.tier) {
        throw new WorkflowEntryParamError('upsert-pending-triage 需要 --session-suffix 与 --tier');
      }
      const entry: PendingTriageEntry = {
        session_suffix: args.sessionSuffix,
        tier: args.tier,
        t1_result: args.t1 ?? args.tier,
        t2_result: args.t2 ?? '',
        timestamp: args.timestamp ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      };
      const idx = pending.findIndex((e) => e.session_suffix === args.sessionSuffix);
      if (idx >= 0) pending[idx] = entry;
      else pending.push(entry);
      return {
        state: { ...state, active_changes: active, pending_triages: pending },
        verify: { kind: 'pt_has_ss', val: args.sessionSuffix },
      };
    }
    case 'delete-pending-triage': {
      if (!args.sessionSuffix) {
        throw new WorkflowEntryParamError('delete-pending-triage 需要 --session-suffix');
      }
      const next = pending.filter((e) => e.session_suffix !== args.sessionSuffix);
      return {
        state: { ...state, active_changes: active, pending_triages: next },
        verify: { kind: 'pt_no_ss', val: args.sessionSuffix },
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

  switch (spec.kind) {
    case 'ac_has_cid':
      return state.active_changes.some((e) => e.change_id === spec.val);
    case 'ac_no_cid':
      return !state.active_changes.some((e) => e.change_id === spec.val);
    case 'ac_entry_phase': {
      const [cid, wantPh] = spec.val.split('|');
      const hit = state.active_changes.find((e) => e.change_id === cid);
      return Boolean(hit && hit.phase === wantPh);
    }
    case 'pt_has_ss':
      return state.pending_triages.some((e) => e.session_suffix === spec.val);
    case 'pt_no_ss':
      return !state.pending_triages.some((e) => e.session_suffix === spec.val);
    default:
      return false;
  }
}

/**
 * 只读：加载 workflow.yaml 的 active_changes，可选 `--phase` 过滤。
 * stdout 输出 change_id 的 JSON 数组，例如 `["foo","bar"]`。
 */
async function runGetActiveChanges(args: WorkflowEntryArgs): Promise<WorkflowEntryResult> {
  const repoRoot = resolveRepoRoot(args.repoRoot);
  if (!repoRoot) {
    return { exitCode: 3, message: '无法解析主仓根' };
  }

  const loaded = await loadWorkflowState(repoRoot);
  const activeChanges = listActiveChanges(loaded, args.phase);
  const changeIds = activeChanges.map((e) => e.change_id).filter((id) => id.length > 0);
  console.log(JSON.stringify(changeIds));
  return { exitCode: 0, activeChanges, changeIds };
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
        '缺少 op(get-active-changes/append-active/update-active/rename-active/delete-active/upsert-pending-triage/delete-pending-triage)',
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
          `[workflow-entry] 写后校验失败(rename 后旧 change_id=${applied.verifyNeg.val} 仍存在)`,
        );
        return { exitCode: 2, message: '写后校验失败' };
      }
    }

    return { exitCode: 0 };
  } finally {
    lock.release();
  }
}

/** 供测试导出：构造 ActiveChangeEntry */
export function makeActiveEntry(
  partial: Partial<ActiveChangeEntry> & Pick<ActiveChangeEntry, 'change_id'>,
): ActiveChangeEntry {
  return {
    change_id: partial.change_id,
    phase: partial.phase ?? '',
    worktree_path: partial.worktree_path ?? '',
    started_at: partial.started_at ?? '',
  };
}
