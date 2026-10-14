/**
 * `task-entry`：**入口技能「进入任务」的唯一原语**。
 *
 * 把「选任务 → 判阶段 → （必要时）建任务」三件事收敛成一次调用，返回一个 `action`，
 * 调用方（coding 族的入口技能）只按 `action` 分派动作、不复制任何判定表。
 *
 * 出口语义：
 *   - `resume`         该任务停在本技能的中断点（`skill == --as`）
 *   - `handover`       该由别的技能接手（`skill` 非空且 ≠ `--as`）
 *   - `create`         零个在途任务 → 已建目录、写 `workflow.mode`、注册游标（幂等）
 *   - `select`         **多个**在途任务 → 只列出候选，**不替用户选**（带 `--task-id` 重跑）
 *   - `resolve-drafts` 零个在途任务但磁盘上**有未注册的 draft 残留** → 交出 `drafts` 列表，
 *                      由调用方按决策点协议裁决（见 `./policies/task-entry.md` §5）
 *   - `block`          读不到 state / `phase` 为空 / 无可路由技能（`skill == null`）→ 没有答案，停下
 *
 * 两点刻意的约定：
 *   1. **`--mode` 只在 `create` 时被写入**；判定阶段一律用任务**自己** `state.yaml` 里的 `mode`。
 *      这是「`mode` 由上游传入、技能不自证」的落点。
 *   2. **调用即表示要进入任务** —— 零候选时会发生写入。只想读列表（如 `intake` 的恢复分发）
 *      请用只读的 `workflow-entry get-active-changes`。
 *   3. **本命令不删任何东西**。「丢弃并新建」「孤儿 draft 的 A/B/C/D」两组分支都是
 *      破坏性或需用户裁决的，刻意留在 `./policies/task-entry.md` §5 里用既有原语表达。
 */
import { resolveTaskStatePath } from '../assets/polaris-paths.js';
import { WORKFLOW_MODE_LABELS, modeLabel } from '../config/task-kind-layout.js';
import {
  loadWorkflowState,
  parseWorkflowTaskKind,
  workflowTaskKindErrorMessage,
  type WorkflowTaskKind,
} from '../config/workflow-state.js';
import { runTaskStateEntry } from './task-state-entry.js';
import { init } from './task.js';
import {
  buildDispatchRow,
  listTasks,
  resolveRepoRoot,
  runWorkflowEntry,
  sortByUpdatedAt,
  type WorkflowDispatchRow,
} from './workflow-entry.js';

/** 入口原语的出口动作 */
export type TaskEntryAction =
  'resume' | 'handover' | 'create' | 'select' | 'resolve-drafts' | 'block';

export type TaskEntryArgs = {
  /** 任务类型（coding / requirement / testcase / prototype / debug） */
  kind?: string;
  /** 本技能名（族内相对名，如 `tweak`）；用于与判定出的 `skill` 比较 */
  as?: string;
  /** **仅 `create` 时写入** `state.yaml` 的 `workflow.mode` 取值 */
  mode?: string;
  /** 多个候选时，用户选定后带此参数重跑 */
  taskId?: string;
  /** `create` 落到游标条目的 `started_at`；缺省取当前时间 */
  startedAt?: string;
  repoRoot?: string;
};

/** 出口负载：`action` 必填，其余字段按动作给出 */
export type TaskEntryPayload = {
  action: TaskEntryAction;
  /** 选定 / 新建的任务 id */
  task_id?: string;
  /** 该任务 `state.yaml` 的绝对路径（排查「读不到」用） */
  state_path?: string;
  phase?: string;
  phase_label?: string;
  mode?: string;
  mode_label?: string;
  /** 应执行技能（族内相对名）；`null` = 无可路由技能 */
  skill?: string | null;
  skill_label?: string;
  /** `action=select`：候选列表（形状与 `--format full` 的行一致） */
  candidates?: WorkflowDispatchRow[];
  /** `action=resolve-drafts`：磁盘上存在、但游标里没有的 `draft-*` 目录名 */
  drafts?: string[];
  /** `action=block` / `resolve-drafts`：为什么需要裁决 */
  reason?: string;
};

export type TaskEntryResult = {
  exitCode: number;
  /** 参数 / 环境错误（stderr）；`action=block` **不走这里** —— 它是结论，不是错误 */
  message?: string;
  payload?: TaskEntryPayload;
};

/** 由行构造负载的公共字段 */
function fromRow(action: TaskEntryAction, row: WorkflowDispatchRow): TaskEntryPayload {
  return {
    action,
    task_id: row.task_id,
    state_path: row.state_path,
    phase: row.phase,
    phase_label: row.phase_label,
    mode: row.mode,
    mode_label: row.mode_label,
    skill: row.skill,
    skill_label: row.skill_label,
  };
}

/**
 * 判定单个任务该走哪个出口。
 *
 * **顺序固定**：先看「读得到吗」，再看「是不是本技能」——
 * `skill` 由 `phase + mode` 算得，`phase` 读不到时它是 `null`，顺序反了会把坏行当成
 * 「不是本技能」而转交到空技能。
 */
async function judgeTask(
  repoRoot: string,
  kind: WorkflowTaskKind,
  as: string,
  taskId: string,
  worktreePath: string,
): Promise<TaskEntryResult> {
  const row = await buildDispatchRow(repoRoot, kind, taskId, worktreePath);
  if (!row.state_readable || !row.phase) {
    return {
      exitCode: 0,
      payload: { ...fromRow('block', row), reason: 'state.yaml 读不到或 phase 为空' },
    };
  }
  if (row.skill === as) {
    return { exitCode: 0, payload: fromRow('resume', row) };
  }
  if (row.skill === null) {
    return {
      exitCode: 0,
      payload: { ...fromRow('block', row), reason: `无可路由技能（phase=${row.phase}）` },
    };
  }
  return { exitCode: 0, payload: fromRow('handover', row) };
}

/**
 * 零个在途任务时新建：建目录 + 写 `workflow.mode` + 注册游标（`append-active` 幂等）。
 */
async function createTask(
  repoRoot: string,
  kind: WorkflowTaskKind,
  rawMode: string | undefined,
  startedAt: string | undefined,
): Promise<TaskEntryResult> {
  const mode = (rawMode ?? '').trim();
  if (!mode) {
    return { exitCode: 3, message: '零个在途任务时须用 --mode <tweak|normal|full> 指定工作流' };
  }
  if (!Object.prototype.hasOwnProperty.call(WORKFLOW_MODE_LABELS, mode)) {
    return {
      exitCode: 3,
      message: `未知工作流：${mode}；合法取值 ${Object.keys(WORKFLOW_MODE_LABELS).join(' | ')}`,
    };
  }

  const created = await init(repoRoot, kind, {});
  // 磁盘上有未注册的 draft 残留（目录建了、游标漏 append）—— 不替用户裁决，交出列表
  if (created.exitCode === 1 && created.payload?.status === 'existing') {
    const drafts = Array.isArray(created.payload.existing)
      ? created.payload.existing.map((d) => String(d))
      : [];
    return {
      exitCode: 0,
      payload: {
        action: 'resolve-drafts',
        drafts,
        reason: '存在未注册的 draft 残留（游标里没有），需要先裁决',
      },
    };
  }
  if (created.exitCode !== 0 || !created.payload) {
    return { exitCode: created.exitCode || 2, message: created.message ?? 'task-init 失败' };
  }
  const taskId = String(created.payload.draft_name ?? created.payload.task_id ?? '');
  if (!taskId) {
    return { exitCode: 2, message: 'task-init 未返回 task_id' };
  }

  const wroteMode = await runTaskStateEntry({
    op: 'set',
    repoRoot,
    taskId,
    kind,
    sets: [`workflow.mode=${mode}`],
    skill: 'task-entry',
  });
  if (wroteMode.exitCode !== 0) {
    return { exitCode: wroteMode.exitCode, message: wroteMode.message ?? '写 workflow.mode 失败' };
  }

  const registered = await runWorkflowEntry({
    op: 'append-active',
    skill: 'task-entry',
    kind,
    repoRoot,
    taskId,
    startedAt: startedAt ?? new Date().toISOString(),
  });
  if (registered.exitCode !== 0) {
    return { exitCode: registered.exitCode, message: registered.message ?? 'append-active 失败' };
  }

  return {
    exitCode: 0,
    payload: {
      action: 'create',
      task_id: taskId,
      state_path: resolveTaskStatePath(repoRoot, kind, taskId, ''),
      mode,
      mode_label: modeLabel(mode),
    },
  };
}

/** 运行 task-entry */
export async function runTaskEntry(args: TaskEntryArgs): Promise<TaskEntryResult> {
  const kind = parseWorkflowTaskKind(args.kind);
  if (!kind) {
    return { exitCode: 3, message: `--kind 无效：${workflowTaskKindErrorMessage()}` };
  }
  const as = (args.as ?? '').trim();
  if (!as) {
    return { exitCode: 3, message: 'task-entry 需要 --as <本技能名（族内相对名，如 tweak）>' };
  }
  const repoRoot = resolveRepoRoot(args.repoRoot);
  if (!repoRoot) {
    return { exitCode: 3, message: '无法解析主仓根' };
  }

  const state = await loadWorkflowState(repoRoot);
  const entries = listTasks(state, kind).filter((e) => e.task_id.length > 0);

  // 已指定任务 → 直接判定（多个候选时用户选完后的第二跳）
  if (args.taskId) {
    const hit = entries.find((e) => e.task_id === args.taskId);
    if (!hit) {
      return {
        exitCode: 3,
        message: `游标里没有 task_id=${args.taskId} 的条目（kind=${kind}）`,
      };
    }
    return judgeTask(repoRoot, kind, as, hit.task_id, hit.worktree_path);
  }

  const sorted = await sortByUpdatedAt(entries, repoRoot, kind);
  if (sorted.length === 0) {
    return createTask(repoRoot, kind, args.mode, args.startedAt);
  }
  if (sorted.length === 1) {
    const only = sorted[0];
    return judgeTask(repoRoot, kind, as, only.task_id, only.worktree_path);
  }

  // 多个 → 只读列候选；命令不替用户选
  const candidates: WorkflowDispatchRow[] = [];
  for (const entry of sorted) {
    candidates.push(await buildDispatchRow(repoRoot, kind, entry.task_id, entry.worktree_path));
  }
  return { exitCode: 0, payload: { action: 'select', candidates } };
}
