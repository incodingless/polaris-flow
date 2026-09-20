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
import { applySetCheckbox, CheckboxError, countCheckboxes } from './tasks-checkbox.js';
import { checkPhaseWrite } from './phase-validation.js';

export type TaskStateEntryOp =
  | 'get'
  | 'get-json'
  | 'set'
  | 'enter-phase'
  | 'complete-phase'
  | 'set-identity'
  | 'get-identity'
  | 'set-checkbox';

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
  /** set-checkbox：项目根相对路径（posix） */
  file?: string;
  /** set-checkbox：复选框序号（0-based，按出现顺序） */
  index?: number;
  /** set-checkbox：目标勾选态 */
  checked?: boolean;
  /**
   * 跳过 phase 写入校验（一次性修正存量脏数据用）。
   * 绕过**不静默**：会往 `.polaris/overrides.log` 追加一行留痕。
   */
  forcePhase?: boolean;
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
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
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
  if (kind === 'coding' || kind === 'debug') return 'runtime';
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
    kind && kind !== 'coding'
      ? getTaskKindStatePath(repoRoot, kind, taskId)
      : getTaskStatePath(repoRoot, taskId);

  // 先读主仓（或 kind 路径）看 worktree 指针
  if (await fileExists(primary)) {
    try {
      const raw = parseYaml(await readFile(primary, 'utf-8'));
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const wt = (raw as Record<string, unknown>).worktree as Record<string, unknown> | undefined;
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
        '缺少 op(get|get-json|set|enter-phase|complete-phase|set-identity|get-identity|set-checkbox)',
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
    args.op === 'set-identity' ||
    args.op === 'set-checkbox';

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

  // phase 写入校验（A 案 G3）：enter-phase / complete-phase 会写 state.yaml 的 phase，
  // `--next-phase` 更会前移顶层 phase。合法集合来自阶段表，与 workflow-entry 共用一处判定。
  // kind 未知时不校验（无法确定合法集合，不猜）；overrides.log 需要仓库根，故放在 lockRepo 之后。
  if (args.op === 'enter-phase' || args.op === 'complete-phase') {
    const pairs: Array<[string, string | undefined]> = [
      ['--phase', args.phase],
      ['--next-phase', args.nextPhase],
    ];
    for (const [label, value] of pairs) {
      if (value === undefined) continue;
      const check = await checkPhaseWrite({
        repoRoot: lockRepo,
        kind,
        phase: value,
        skill: args.skill || args.op,
        taskId: lockId,
        op: `${args.op} ${label}`,
        force: args.forcePhase,
      });
      if (!check.ok) {
        console.error(`[task-state-entry] 阻断：${check.message}`);
        return { exitCode: 3, message: check.message };
      }
    }
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
    return await runWriteOp(args, statePath, kind, lockRepo);
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
        const paths = args.pathsCsv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
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
  repoRoot: string,
): Promise<TaskStateEntryResult> {
  // set-checkbox 不是 state.yaml 的修改，而是「改 tasks.md + 同锁同步 state 计数」。
  // 单独分支：通用路径末尾会无条件写回 state.yaml，而 state.yaml 可能不存在
  // （debug 族），无脑回写会凭空造出一个空 state.yaml。
  if (args.op === 'set-checkbox') {
    return runSetCheckbox(args, statePath, repoRoot);
  }

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

/**
 * `set-checkbox`：勾选 `tasks.md` 的一行，并在**同一次锁内**同步 `state.yaml` 的
 * `runtime.build.{total_tasks,completed_tasks}`。
 *
 * 为什么必须同锁同步：面板的验收是「勾选任务后 `tasks.md` / `state.yaml` / `.locks/`
 * 三者一致」。分两次调用（先改文件、再改 state）会在两次之间留下不一致窗口，且第二次
 * 会被别的写者插队。同一把 `task-state-<id>.lock` 里做完，才是原子的。
 *
 * 只在 state 里**已有** `runtime.build` 块时同步：没有该块（debug / requirement 等族）
 * 说明该 kind 不用这两个计数，凭空添字段是替它做决定。
 */
async function runSetCheckbox(
  args: TaskStateEntryArgs,
  statePath: string,
  repoRoot: string,
): Promise<TaskStateEntryResult> {
  // CLI 壳只设 exitCode、不打印 message，所以这里自己打原因 —— 否则用户只看到
  // 退出码 3，不知道是哪个参数不对。
  const fail = (code: number, message: string): TaskStateEntryResult => {
    console.error(`[task-state-entry] 阻断：${message}`);
    return { exitCode: code, message };
  };

  const relFile = (args.file ?? '').trim();
  if (!relFile) {
    return fail(3, 'set-checkbox 需要 --file（项目根相对路径）');
  }
  if (path.isAbsolute(relFile) || relFile.split(/[/\\]/).includes('..')) {
    return fail(3, `--file 必须是项目根内的相对路径: ${relFile}`);
  }
  if (args.index === undefined) {
    return fail(3, 'set-checkbox 需要 --index');
  }
  if (typeof args.checked !== 'boolean') {
    return fail(3, 'set-checkbox 需要 --checked <true|false>');
  }

  const absFile = path.resolve(repoRoot, relFile);
  if (!absFile.startsWith(repoRoot + path.sep)) {
    return fail(3, `--file 越出项目根: ${relFile}`);
  }
  if (!(await fileExists(absFile))) {
    return fail(2, `目标文件不存在: ${relFile}`);
  }

  let raw: string;
  try {
    raw = await readFile(absFile, 'utf-8');
  } catch (err) {
    return fail(2, `无法读取 ${relFile}: ${(err as Error).message}`);
  }

  let edit;
  try {
    edit = applySetCheckbox(raw, args.index, args.checked);
  } catch (err) {
    if (err instanceof CheckboxError) {
      return fail(3, err.message);
    }
    throw err;
  }

  if (edit.changed) {
    await writeFile(absFile, edit.content, 'utf-8');
    const back = await readFile(absFile, 'utf-8');
    if (back !== edit.content) {
      return fail(2, `写后校验失败：回读内容与写入不一致: ${relFile}`);
    }
  }

  const progress = countCheckboxes(edit.content);
  let stateSynced = false;
  let stateSkippedReason = '';
  if (!progress) {
    stateSkippedReason = '目标文件无复选框';
  } else {
    const state = await loadStateObject(statePath);
    const block = getByPath(state, 'runtime.build');
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      stateSkippedReason = 'state 无 runtime.build 块';
    } else if (
      getByPath(state, 'runtime.build.total_tasks') !== progress.total ||
      getByPath(state, 'runtime.build.completed_tasks') !== progress.done
    ) {
      setByPath(state, 'runtime.build.total_tasks', progress.total);
      setByPath(state, 'runtime.build.completed_tasks', progress.done);
      await saveStateObject(statePath, state);

      const verify = await loadStateObject(statePath);
      if (
        getByPath(verify, 'runtime.build.total_tasks') !== progress.total ||
        getByPath(verify, 'runtime.build.completed_tasks') !== progress.done
      ) {
        console.error('[task-state-entry] 写后校验失败：state 计数未落盘');
        return { exitCode: 2, message: '写后校验失败：state 计数未落盘' };
      }
      stateSynced = true;
    }
  }

  const value = {
    file: relFile,
    ordinal: edit.ordinal,
    /** 1-based 行号，便于人对照编辑器 */
    line: edit.lineNo + 1,
    checked: edit.after,
    changed: edit.changed,
    total: progress?.total ?? 0,
    done: progress?.done ?? 0,
    state_synced: stateSynced,
    state_skipped_reason: stateSkippedReason,
  };
  console.log(JSON.stringify(value));
  return { exitCode: 0, value };
}
