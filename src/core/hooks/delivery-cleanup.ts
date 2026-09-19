/**
 * ship-cleanup：把任务移出活跃游标（`delete-active`）并清理其在 `.polaris/` 下的档案目录。
 *
 * ## 这个文件修的是什么
 *
 * 旧实现把 `kind: 'coding'` 写死，于是对非 coding 任务「删条目」这一步**静默失败**：
 * `delete-active` 在 `coding_tasks` 里找不到目标 id → 过滤后列表没变 → 它自己的
 * 「该 kind 列表里已无此 id」校验**假通过** → 返回 0 → 函数接着 `rm -rf` 档案目录。
 *
 * 净效果是**静默的数据丢失**：退出码 0，档案没了，游标条目还在。三条修法：
 *
 *   1. **kind 由调用方给出**（CLI 缺省 `coding` 仅为兼容，面板必须显式传）
 *   2. **先预检**：目标 id 必须在指定 kind 的列表里；不在就报错，并告诉用户它
 *      实际属于哪个 kind（比「未找到 entry」有用得多）
 *   3. **后回读**：删条目后**全量回读** `workflow.yaml`，确认该 id 在**任何** kind
 *      的列表里都不存在；只要还有残留就中止且**不删档案**
 *
 * 第 3 条是防线而不只是修补：它不依赖任何单一 kind 的校验逻辑正确，只依赖
 * 「游标里还有引用 → 档案不能删」这条不变量。
 */
import { existsSync } from 'node:fs';
import { rm } from 'fs/promises';
import path from 'path';

import { getTaskKindDir, getTaskKindRootDir } from '../assets/polaris-paths.js';
import {
  getTaskList,
  loadWorkflowState,
  WORKFLOW_TASK_KINDS,
  type WorkflowTaskKind,
} from '../config/workflow-state.js';
import { runWorkflowEntry } from './workflow-entry.js';

export type DeliveryCleanupResult = { exitCode: number; message?: string };

export type DeliveryCleanupPlan =
  | {
      ok: true;
      /** 将被删除的**绝对路径**（只含当前存在的） */
      willDelete: string[];
      /** 将被移出游标的条目；找不到为 null */
      entry: { kind: WorkflowTaskKind; phase: string } | null;
      kind: WorkflowTaskKind;
    }
  | { ok: false; message: string };

/** 找该 task_id 落在哪些 kind 的列表里（用于诊断「你传错 kind 了」） */
async function kindsContaining(root: string, taskId: string): Promise<WorkflowTaskKind[]> {
  const state = await loadWorkflowState(root);
  return WORKFLOW_TASK_KINDS.filter((k) => getTaskList(state, k).some((e) => e.task_id === taskId));
}

/**
 * 预演：算出会删哪些路径、会移除哪条游标条目，**不改盘**。
 *
 * 面板的「交付清理」是不可逆操作，必须先给出这个清单让用户确认。
 */
export async function planDeliveryCleanup(
  changeId: string,
  originRepo: string,
  kind?: WorkflowTaskKind,
): Promise<DeliveryCleanupPlan> {
  if (!changeId || !originRepo) {
    return { ok: false, message: '用法: <change_id> <origin_repo> [kind]' };
  }
  const root = path.resolve(originRepo);

  const containing = await kindsContaining(root, changeId);
  if (containing.length === 0) {
    return { ok: false, message: `游标中未找到 task_id=${changeId}，未做任何修改` };
  }

  const effectiveKind = kind ?? containing[0]!;
  if (!containing.includes(effectiveKind)) {
    return {
      ok: false,
      message: `task_id=${changeId} 不在 ${effectiveKind}_tasks 中，而在 ${containing
        .map((k) => `${k}_tasks`)
        .join('、')} 中；请用 --kind ${containing[0]}`,
    };
  }

  const state = await loadWorkflowState(root);
  const entry = getTaskList(state, effectiveKind).find((e) => e.task_id === changeId);

  const candidates = [
    getTaskKindDir(root, effectiveKind, changeId),
    path.join(getTaskKindRootDir(root, effectiveKind), `${changeId}.snapshot`),
  ];
  return {
    ok: true,
    kind: effectiveKind,
    willDelete: candidates.filter((p) => existsSync(p)),
    entry: entry ? { kind: effectiveKind, phase: entry.phase } : null,
  };
}

/**
 * 执行 delivery 清理。
 *
 * `kind` 缺省 `coding` 只为保持 CLI 兼容；**面板与新增调用方必须显式传** ——
 * 缺省值是这次静默数据丢失的成因，不要依赖它。
 */
export async function runDeliveryCleanup(
  changeId: string,
  originRepo: string,
  kind: WorkflowTaskKind = 'coding',
  options?: { dryRun?: boolean },
): Promise<DeliveryCleanupResult & { plan?: DeliveryCleanupPlan }> {
  if (!changeId || !originRepo) {
    return { exitCode: 1, message: '用法: <change_id> <origin_repo> [kind]' };
  }
  const root = path.resolve(originRepo);

  const plan = await planDeliveryCleanup(changeId, root, kind);
  if (!plan.ok) {
    return { exitCode: 1, message: plan.message, plan };
  }

  if (options?.dryRun) {
    return { exitCode: 0, message: '预演：未做任何修改', plan };
  }

  const wf = await runWorkflowEntry({
    op: 'delete-active',
    skill: 'ship',
    kind,
    repoRoot: root,
    whereTaskId: changeId,
  });
  if (wf.exitCode !== 0) {
    return { exitCode: 1, message: 'delete-active 失败', plan };
  }

  // 后回读：只要该 id 还留在**任何** kind 的列表里，就不许删档案。
  // 这条不依赖上面各层校验是否正确，只依赖「游标还有引用 → 档案不能删」。
  const remaining = await kindsContaining(root, changeId);
  if (remaining.length > 0) {
    const detail = remaining.map((k) => `${k}_tasks`).join('、');
    return {
      exitCode: 1,
      message: `task_id=${changeId} 仍残留在 ${detail}；已中止，档案未删除`,
      plan,
    };
  }

  for (const target of plan.willDelete) {
    await rm(target, { recursive: true, force: true });
  }

  return { exitCode: 0 };
}
