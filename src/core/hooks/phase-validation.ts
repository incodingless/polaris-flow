/**
 * phase 写入的**唯一校验点**（A 案 G3）。
 *
 * ## 为什么需要它
 *
 * 写错 phase 名（`buiild`、`triage`、把 debug 的 `channel` 当 phase 写）在 A 案之前
 * **什么都不报**：原语是「你给什么就写什么」。后果不是当场失败，而是几个月后
 * Dashboard 显示「未知阶段」，或者自动衔接静默不匹配 —— 排查时早已忘了当初是谁写的。
 *
 * 这里把「合法值」的判定收成一处，两个写原语（`workflow-entry` / `task-state-entry`）
 * 共用。合法集合本身在 `task-kind-layout.ts` 的阶段表上（`isWritablePhase`），
 * 本模块只做「判定 + 拦下 / 留痕」。
 *
 * ## `--force-phase` 的定位
 *
 * 一次性修正存量脏数据时需要绕过校验。绕过**不是静默的**：走 `--force-phase` 会往
 * `.polaris/overrides.log` 追加一行（谁、什么 op、哪个任务、写了什么、原始命令行），
 * 这样"为什么不合法还写进去了"有据可查。日志文件走 `polaris-paths.getOverridesLogPath`
 * —— 它早就存在但没有使用者，这里成为它的第一个使用方。
 */
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { getOverridesLogPath } from '../assets/polaris-paths.js';
import { isWritablePhase, writablePhaseList } from '../config/task-kind-layout.js';
import type { WorkflowTaskKind } from '../config/workflow-state.js';
import { fileExists } from '../../utils/file-system.js';

export type PhaseWriteCheck = { ok: true; forced: boolean } | { ok: false; message: string };

export type PhaseWriteCheckArgs = {
  repoRoot: string;
  /** 未知 kind 时跳过校验（无法确定合法集合，不猜） */
  kind: WorkflowTaskKind | null;
  phase: string;
  /** 写者标识（与锁的 `--skill` 同源） */
  skill: string;
  taskId: string;
  /** 触发写的原因，如 `update-active` / `complete-phase` */
  op: string;
  /** `--force-phase`：跳过校验，但写入 overrides.log */
  force?: boolean;
};

/** 把 phase 的合法值拼成可照抄的一行（失败信息与日志共用） */
function legalList(kind: WorkflowTaskKind): string {
  return writablePhaseList(kind);
}

/**
 * 校验一次 phase 写入。
 *
 * 返回 `{ ok: false, message }` 时调用方**必须中止写入** —— 不要"修正成合法值再写"：
 * 那会把"用户想写 X"悄悄变成"写了 Y"，比直接报错更难查。
 */
export async function checkPhaseWrite(args: PhaseWriteCheckArgs): Promise<PhaseWriteCheck> {
  const phase = (args.phase ?? '').trim();
  // 空值不校验：空 phase 表示"未设置"，是合法状态（存量数据里存在）
  if (!phase) {
    return { ok: true, forced: false };
  }
  if (!args.kind) {
    return { ok: true, forced: false };
  }
  if (isWritablePhase(args.kind, phase)) {
    return { ok: true, forced: false };
  }

  if (!args.force) {
    return {
      ok: false,
      message:
        `未知阶段「${phase}」（kind=${args.kind}）。合法值：${legalList(args.kind)}` +
        `\n  若确需写入（如一次性修正存量数据），加 --force-phase —— 会记录到 .polaris/overrides.log`,
    };
  }

  await appendOverrideLog(args);
  return { ok: true, forced: true };
}

/** 追加一行留痕；日志写不进去也不阻断写入（校验已由调用方决定放行） */
async function appendOverrideLog(args: PhaseWriteCheckArgs): Promise<void> {
  const logPath = getOverridesLogPath(args.repoRoot);
  const line = [
    new Date().toISOString(),
    `op=${args.op}`,
    `kind=${args.kind}`,
    `task=${args.taskId || '-'}`,
    `skill=${args.skill || '-'}`,
    `phase=${args.phase.trim()}`,
    `legal=${args.kind ? legalList(args.kind) : '-'}`,
  ].join('\t');

  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    if (!(await fileExists(logPath))) {
      await appendFile(logPath, '# phase 写入绕过校验的记录（--force-phase）\n', 'utf-8');
    }
    await appendFile(logPath, `${line}\n`, 'utf-8');
  } catch (err) {
    console.error(`[phase-validation] 警告：overrides.log 写入失败：${(err as Error).message}`);
  }
}
