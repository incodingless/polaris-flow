/**
 * 任务 state.yaml RMW 入口（对齐 assets/shared/scripts/task-state-entry.sh）。
 * 通用点路径 get/set + enter-phase / complete-phase / set-identity / get-identity。
 * 写 ops 持 task-state-<id>.lock；读 ops 不加锁。
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import {
  getTaskKindStatePath,
  getTaskStateLockPath,
  getTaskStatePath,
} from '../assets/polaris-paths.js';
import { fileExists } from '../../utils/file-system.js';
import { parseWorkflowTaskKind, type WorkflowTaskKind } from '../config/workflow-state.js';
import { resolveRepoRoot } from './workflow-entry.js';
import { acquireExclusiveLock, WorkflowLockError } from './workflow-lock.js';

export type TaskStateEntryOp =
  | 'get'
  | 'get-json'
  | 'set'
  | 'enter-phase'
  | 'complete-phase'
  | 'set-identity'
  | 'get-identity';

export type BlockStyle = 'runtime' | 'top-level' | 'auto';

export type TaskStateEntryArgs = {
  op: TaskStateEntryOp;
  repoRoot?: string;
  taskId?: string;
  /** 覆盖解析路径；优先级最高 */
  statePath?: string;
  kind?: string;
  /** get：一个或多个点路径 */
  paths?: string[];
  /** get-json：逗号分隔路径子集；空则整文件 */
  pathsCsv?: string;
  /** set：path=value 列表 */
  sets?: string[];
  phase?: string;
  nextPhase?: string;
  blockStyle?: BlockStyle;
  /** set-identity 顶层字段 */
  reqName?: string;
  reqNameCn?: string;
  reqPrefix?: string;
  name?: string;
  pagePrefix?: string;
  workDir?: string;
  deliveredName?: string;
  /** 锁写者标识；缺省用 op 名 */
  skill?: string;
  lockOptions?: {
    staleMs?: number;
    spinMs?: number;
    pollMs?: number;
    now?: () => number;
  };
};

export type TaskStateEntryResult = {
  exitCode: number;
  message?: string;
  /** get / get-json / get-identity 的结构化结果（stdout 已打印） */
  value?: unknown;
};

/** 参数错误 */
export class TaskStateEntryParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskStateEntryParamError';
  }
}

/** 按点路径读取；缺失返回 undefined */
export function getByPath(obj: unknown, dotted: string): unknown {
  if (!dotted) return undefined;
  const parts = dotted.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || Array.isArray(cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** 按点路径写入（就地修改）；中间缺失对象自动创建 */
export function setByPath(obj: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split('.').filter(Boolean);
  if (parts.length === 0) {
    throw new TaskStateEntryParamError('空路径不可写');
  }
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (next === null || next === undefined || typeof next !== 'object' || Array.isArray(next)) {
      const created: Record<string, unknown> = {};
      cur[key] = created;
      cur = created;
    } else {
      cur = next as Record<string, unknown>;
    }
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * 解析 --set 右侧值：true/false/null/数字/其余当字符串。
 */
export function parseSetValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw === '') return '';
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  // 去掉一层引号
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

/** 解析 path=value */
export function parseSetAssignment(raw: string): { path: string; value: unknown } {
  const eq = raw.indexOf('=');
  if (eq <= 0) {
    throw new TaskStateEntryParamError(`非法 --set（须为 path=value）: ${raw}`);
  }
  return { path: raw.slice(0, eq), value: parseSetValue(raw.slice(eq + 1)) };
}

/**
 * 判定阶段块风格：显式 > kind > 是否存在 runtime。
 */
export function resolveBlockStyle(
  state: Record<string, unknown>,
  kind: WorkflowTaskKind | null,
  forced?: BlockStyle,
): 'runtime' | 'top-level' {
  if (forced === 'runtime' || forced === 'top-level') return forced;
  if (kind === 'change') return 'runtime';
  if (kind === 'requirement' || kind === 'prototype' || kind === 'testcase') {
    return 'top-level';
  }
  const runtime = state.runtime;
  if (runtime && typeof runtime === 'object' && !Array.isArray(runtime)) {
    return 'runtime';
  }
  return 'top-level';
}

/** 阶段状态块的点路径前缀 */
export function phaseBlockPrefix(style: 'runtime' | 'top-level', phase: string): string {
  return style === 'runtime' ? `runtime.${phase}` : phase;
}

/**
 * 解析 state.yaml 绝对路径。
 * 优先级：--state-path > worktree.path（若存在）> kind 目录 > 默认 tasks。
 */
export async function resolveStateFilePath(
  repoRoot: string,
  taskId: string,
  options?: { statePath?: string; kind?: WorkflowTaskKind | null },
): Promise<string> {
  if (options?.statePath) {
    return path.resolve(options.statePath);
  }

  const kind = options?.kind ?? null;
  const primary =
    kind && kind !== 'change'
      ? getTaskKindStatePath(repoRoot, kind, taskId)
      : getTaskStatePath(repoRoot, taskId);

  // 先读主仓（或 kind 路径）看 worktree 指针
  if (await fileExists(primary)) {
    try {
      const raw = parseYaml(await readFile(primary, 'utf-8'));
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const wt = (raw as Record<string, unknown>).worktree as
          | Record<string, unknown>
          | undefined;
        const wtPath = typeof wt?.path === 'string' ? wt.path.trim() : '';
        if (wtPath) {
          const wtState = path.join(wtPath, '.polaris', 'tasks', taskId, 'state.yaml');
          if (await fileExists(wtState)) {
            return wtState;
          }
        }
      }
    } catch {
      // 解析失败仍用 primary
    }
  }

  return primary;
}

/** 加载 YAML 为普通对象；文件不存在返回 {}（读 ops）或抛错（写 ops 由调用方决定） */
export async function loadStateObject(statePath: string): Promise<Record<string, unknown>> {
  if (!(await fileExists(statePath))) {
    return {};
  }
  const text = await readFile(statePath, 'utf-8');
  try {
    const parsed = parseYaml(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(`无法解析 ${statePath}: ${(err as Error).message}`);
  }
}

/** 写回 YAML（稳定 stringify） */
export async function saveStateObject(
  statePath: string,
  state: Record<string, unknown>,
): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  const text = stringifyYaml(state, { lineWidth: 0 });
  await writeFile(statePath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}

/** ISO 时间戳（秒精度 Z） */
function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** 应用 enter-phase（纯函数） */
export function applyEnterPhase(
  state: Record<string, unknown>,
  phase: string,
  style: 'runtime' | 'top-level',
): Record<string, unknown> {
  const next = structuredClone(state);
  next.phase = phase;
  const prefix = phaseBlockPrefix(style, phase);
  setByPath(next, `${prefix}.status`, 'in_progress');
  setByPath(next, `${prefix}.started_at`, nowIso());
  return next;
}

/** 应用 complete-phase（纯函数） */
export function applyCompletePhase(
  state: Record<string, unknown>,
  phase: string,
  style: 'runtime' | 'top-level',
  nextPhase?: string,
): Record<string, unknown> {
  const next = structuredClone(state);
  const prefix = phaseBlockPrefix(style, phase);
  setByPath(next, `${prefix}.status`, 'completed');
  setByPath(next, `${prefix}.finished_at`, nowIso());
  if (nextPhase) {
    next.phase = nextPhase;
  }
  return next;
}

/** 应用 set-identity（只写传入字段） */
export function applyIdentity(
  state: Record<string, unknown>,
  fields: {
    reqName?: string;
    reqNameCn?: string;
    reqPrefix?: string;
    name?: string;
    pagePrefix?: string;
    workDir?: string;
    deliveredName?: string;
  },
): Record<string, unknown> {
  const next = structuredClone(state);
  const map: Array<[keyof typeof fields, string]> = [
    ['reqName', 'req_name'],
    ['reqNameCn', 'req_name_cn'],
    ['reqPrefix', 'req_prefix'],
    ['name', 'name'],
    ['pagePrefix', 'page_prefix'],
    ['workDir', 'work_dir'],
    ['deliveredName', 'delivered_name'],
  ];
  let any = false;
  for (const [argKey, yamlKey] of map) {
    const v = fields[argKey];
    if (v !== undefined) {
      next[yamlKey] = v;
      any = true;
    }
  }
  if (!any) {
    throw new TaskStateEntryParamError(
      'set-identity 至少需要一个身份字段（--req-name / --req-name-cn / --req-prefix / --name / --page-prefix / --work-dir / --delivered-name）',
    );
  }
  return next;
}

const IDENTITY_KEYS = [
  'task_id',
  'kind',
  'phase',
  'req_name',
  'req_name_cn',
  'req_prefix',
  'name',
  'page_prefix',
  'work_dir',
  'delivered_name',
  'worktree',
] as const;

/** 导出身份字段（缺键为 null） */
export function extractIdentity(state: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of IDENTITY_KEYS) {
    out[key] = key in state ? state[key] : null;
  }
  return out;
}

/**
 * 执行 task-state-entry；返回 exitCode（不 process.exit）。
 */
export async function runTaskStateEntry(args: TaskStateEntryArgs): Promise<TaskStateEntryResult> {
  if (!args.op) {
    return {
      exitCode: 3,
      message:
        '缺少 op(get|get-json|set|enter-phase|complete-phase|set-identity|get-identity)',
    };
  }

  const taskId = (args.taskId ?? '').trim();
  if (!args.statePath && !taskId) {
    return { exitCode: 3, message: '缺少 --task-id（或提供 --state-path）' };
  }

  const repoRoot = resolveRepoRoot(args.repoRoot);
  if (!repoRoot && !args.statePath) {
    return { exitCode: 3, message: '无法解析主仓根' };
  }

  const kind = parseWorkflowTaskKind(args.kind);
  let statePath: string;
  try {
    statePath = args.statePath
      ? path.resolve(args.statePath)
      : await resolveStateFilePath(repoRoot!, taskId, { kind, statePath: args.statePath });
  } catch (err) {
    return { exitCode: 3, message: (err as Error).message };
  }

  const isWrite =
    args.op === 'set' ||
    args.op === 'enter-phase' ||
    args.op === 'complete-phase' ||
    args.op === 'set-identity';

  if (!isWrite) {
    return runReadOp(args, statePath);
  }

  if (!(await fileExists(statePath)) && args.op !== 'set' && args.op !== 'set-identity') {
    // enter/complete 需要已有文件；set/set-identity 允许新建
    if (args.op === 'enter-phase' || args.op === 'complete-phase') {
      console.error(`[task-state-entry] 阻断：state 文件不存在: ${statePath}`);
      return { exitCode: 2, message: `state 文件不存在: ${statePath}` };
    }
  }

  const lockId = taskId || path.basename(path.dirname(statePath));
  const lockRepo = repoRoot ?? (await findRepoRootFromState(statePath));
  if (!lockRepo) {
    return { exitCode: 3, message: '无法解析锁目录所属仓库根' };
  }

  let lock;
  try {
    lock = await acquireExclusiveLock(
      getTaskStateLockPath(lockRepo, lockId),
      args.skill || args.op,
      { ...args.lockOptions, label: `task-state-${lockId}.lock` },
    );
  } catch (err) {
    if (err instanceof WorkflowLockError) {
      console.error(`[task-state-entry] 阻断：${err.message}`);
      console.error(`  锁内容: ${err.holder}`);
      console.error(`  请手动检查 ${err.lockPath} 持有者后清理`);
      return { exitCode: 1, message: err.message };
    }
    throw err;
  }

  try {
    return await runWriteOp(args, statePath, kind);
  } finally {
    lock.release();
  }
}

/** 从 state 路径向上找含 .polaris 的仓库根 */
async function findRepoRootFromState(statePath: string): Promise<string | null> {
  let dir = path.dirname(statePath);
  for (let i = 0; i < 8; i++) {
    if (path.basename(dir) === '.polaris') {
      return path.dirname(dir);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 只读 ops */
async function runReadOp(
  args: TaskStateEntryArgs,
  statePath: string,
): Promise<TaskStateEntryResult> {
  if (!(await fileExists(statePath))) {
    if (args.op === 'get-identity') {
      const empty = extractIdentity({});
      console.log(JSON.stringify(empty));
      return { exitCode: 0, value: empty };
    }
    console.error(`[task-state-entry] 阻断：state 文件不存在: ${statePath}`);
    return { exitCode: 2, message: `state 文件不存在: ${statePath}` };
  }

  let state: Record<string, unknown>;
  try {
    state = await loadStateObject(statePath);
  } catch (err) {
    console.error(`[task-state-entry] 阻断：${(err as Error).message}`);
    return { exitCode: 2, message: (err as Error).message };
  }

  switch (args.op) {
    case 'get': {
      const paths = args.paths ?? [];
      if (paths.length === 0) {
        return { exitCode: 3, message: 'get 需要至少一个 --path' };
      }
      if (paths.length === 1) {
        const v = getByPath(state, paths[0]);
        const out = v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
        console.log(out);
        return { exitCode: 0, value: v };
      }
      const obj: Record<string, unknown> = {};
      for (const p of paths) {
        obj[p] = getByPath(state, p) ?? null;
      }
      console.log(JSON.stringify(obj));
      return { exitCode: 0, value: obj };
    }
    case 'get-json': {
      if (args.pathsCsv) {
        const paths = args.pathsCsv.split(',').map((s) => s.trim()).filter(Boolean);
        const obj: Record<string, unknown> = {};
        for (const p of paths) {
          obj[p] = getByPath(state, p) ?? null;
        }
        console.log(JSON.stringify(obj));
        return { exitCode: 0, value: obj };
      }
      console.log(JSON.stringify(state));
      return { exitCode: 0, value: state };
    }
    case 'get-identity': {
      const id = extractIdentity(state);
      console.log(JSON.stringify(id));
      return { exitCode: 0, value: id };
    }
    default:
      return { exitCode: 3, message: `未知读 op '${args.op}'` };
  }
}

/** 写 ops（调用方已持锁） */
async function runWriteOp(
  args: TaskStateEntryArgs,
  statePath: string,
  kind: WorkflowTaskKind | null,
): Promise<TaskStateEntryResult> {
  let state: Record<string, unknown>;
  try {
    state = await loadStateObject(statePath);
  } catch (err) {
    console.error(`[task-state-entry] 阻断：${(err as Error).message}`);
    return { exitCode: 2, message: (err as Error).message };
  }

  let next: Record<string, unknown>;
  try {
    switch (args.op) {
      case 'set': {
        if (!args.sets || args.sets.length === 0) {
          throw new TaskStateEntryParamError('set 需要至少一个 --set path=value');
        }
        next = structuredClone(state);
        for (const raw of args.sets) {
          const { path: p, value } = parseSetAssignment(raw);
          setByPath(next, p, value);
        }
        break;
      }
      case 'enter-phase': {
        const phase = (args.phase ?? '').trim();
        if (!phase) throw new TaskStateEntryParamError('enter-phase 需要 --phase');
        const style = resolveBlockStyle(state, kind, args.blockStyle);
        next = applyEnterPhase(state, phase, style);
        break;
      }
      case 'complete-phase': {
        const phase = (args.phase ?? '').trim();
        if (!phase) throw new TaskStateEntryParamError('complete-phase 需要 --phase');
        const style = resolveBlockStyle(state, kind, args.blockStyle);
        next = applyCompletePhase(state, phase, style, args.nextPhase?.trim() || undefined);
        break;
      }
      case 'set-identity': {
        next = applyIdentity(state, {
          reqName: args.reqName,
          reqNameCn: args.reqNameCn,
          reqPrefix: args.reqPrefix,
          name: args.name,
          pagePrefix: args.pagePrefix,
          workDir: args.workDir,
          deliveredName: args.deliveredName,
        });
        break;
      }
      default:
        throw new TaskStateEntryParamError(`未知写 op '${args.op}'`);
    }
  } catch (err) {
    if (err instanceof TaskStateEntryParamError) {
      console.error(`[task-state-entry] 阻断：${err.message}`);
      return { exitCode: 3, message: err.message };
    }
    throw err;
  }

  await saveStateObject(statePath, next);

  // 写后轻校验：文件可读
  try {
    await loadStateObject(statePath);
  } catch (err) {
    console.error(`[task-state-entry] 写后校验失败: ${(err as Error).message}`);
    return { exitCode: 2, message: '写后校验失败' };
  }

  return { exitCode: 0 };
}
