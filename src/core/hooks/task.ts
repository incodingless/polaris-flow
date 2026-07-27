/**
 * Clarify 任务生命周期：init（建 draft + state）与 finalize（draft → change_id）。
 * 由 `polaris task-init` / `polaris task-finalize` 调用。
 */
import { mkdir, rename, readFile, writeFile } from 'fs/promises';
import path from 'path';

import { getPolarisConfigPath } from '../config/polaris-project-config.js';
import {
  getTaskDir,
  getTaskIntentionPath,
  getTaskIntentionRelPath,
  getTaskStatePath,
} from '../assets/polaris-paths.js';
import {
  createDefaultTaskState,
  patchTaskStateFile,
  saveTaskStateToFile,
} from '../config/task-state.js';
import { fileExists } from '../../utils/file-system.js';
import { runDraftCreate } from './draft-create.js';
import { runWorkflowEntry } from './workflow-entry.js';

export type InitResult = {
  exitCode: number;
  /** 成功或 existing 时 stdout JSON 对象 */
  payload?: Record<string, unknown>;
  message?: string;
};

export type FinalizeResult = {
  exitCode: number;
  payload?: Record<string, unknown>;
  message?: string;
};

/** @deprecated 使用 InitResult */
export type TaskInitResult = InitResult;
/** @deprecated 使用 FinalizeResult */
export type TaskFinalizeResult = FinalizeResult;

/**
 * clarify 建 draft + state.yaml（对齐 task-init.sh；不写 workflow append）。
 */
export async function init(repoRoot: string): Promise<InitResult> {
  if (!repoRoot) {
    return { exitCode: 2, message: '缺少或无效的 repo_root 参数' };
  }
  const root = path.resolve(repoRoot);
  if (!(await fileExists(root))) {
    return { exitCode: 2, message: '缺少或无效的 repo_root 参数' };
  }

  const configPath = getPolarisConfigPath(root);
  if (!(await fileExists(configPath))) {
    return { exitCode: 2, message: `${configPath} 不存在，请重启会话` };
  }

  const draft = await runDraftCreate(root);
  if (draft.exitCode === 1) {
    return {
      exitCode: 1,
      payload: { status: 'existing', existing: draft.existing },
    };
  }
  if (draft.exitCode !== 0) {
    return { exitCode: 2, message: `draft-create 返回 exit ${draft.exitCode}` };
  }

  const draftDir = draft.draft_dir;
  await mkdir(draftDir, { recursive: true });

  const state = createDefaultTaskState({
    changeId: draft.draft_name,
    phase: 'clarify',
  });
  state.intention = {
    path: getTaskIntentionRelPath(draft.draft_name),
  };
  // 保留 clarify 块供 finalize 清 draft_dir（兼容历史语义）
  state.clarify = {
    status: 'in_progress',
    draft_dir: draft.draft_name,
  };

  await saveTaskStateToFile(getTaskStatePath(root, draft.draft_name), state);

  return {
    exitCode: 0,
    payload: {
      status: 'ok',
      draft_name: draft.draft_name,
      draft_dir: draftDir,
    },
  };
}

/**
 * draft → 正式 change_id，并 rename-active。
 */
export async function finalize(
  repoRoot: string,
  draftName: string,
  changeId: string,
): Promise<FinalizeResult> {
  if (!repoRoot || !draftName || !changeId) {
    return {
      exitCode: 2,
      message: '用法 task-finalize <repo_root> <draft_name> <change_id>',
    };
  }
  const root = path.resolve(repoRoot);
  if (!(await fileExists(root))) {
    return { exitCode: 2, message: `repo_root 不存在: ${root}` };
  }

  const draftDir = getTaskDir(root, draftName);
  const targetDir = getTaskDir(root, changeId);
  const intention = getTaskIntentionPath(root, changeId);
  const stateYaml = getTaskStatePath(root, changeId);

  if (await fileExists(targetDir)) {
    return { exitCode: 1, message: `目标目录已存在 ${targetDir}` };
  }
  if (!(await fileExists(draftDir))) {
    return { exitCode: 2, message: `draft 目录不存在 ${draftDir}` };
  }

  await rename(draftDir, targetDir);

  const intentionRel = getTaskIntentionRelPath(changeId);
  await patchTaskStateFile(stateYaml, {
    change_id: changeId,
    task_id: changeId,
    phase: 'clarify',
    intention: {
      path: intentionRel,
    },
    clarify: {
      status: 'completed',
      draft_dir: '',
      path: intentionRel,
    },
  });

  if (await fileExists(intention)) {
    let body = await readFile(intention, 'utf-8');
    body = body.replace(/^# intention:.*$/m, `# intention: ${changeId}`);
    await writeFile(intention, body, 'utf-8');
  }

  const wf = await runWorkflowEntry({
    op: 'rename-active',
    skill: 'clarify',
    repoRoot: root,
    from: draftName,
    to: changeId,
  });
  if (wf.exitCode !== 0) {
    return {
      exitCode: 3,
      message: `workflow rename-active 返回 exit ${wf.exitCode}`,
    };
  }

  return {
    exitCode: 0,
    payload: {
      status: 'ok',
      change_id: changeId,
      change_dir: targetDir,
      intention_path: intention,
    },
  };
}
