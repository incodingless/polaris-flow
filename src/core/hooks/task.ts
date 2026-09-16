/**
 * Specify / discovery / testcase / prototype 任务生命周期：init（建目录 + state）与 finalize（draft → 正式 id）。
 * 由 `polaris task-init` / `polaris task-finalize` 调用。
 *
 * - coding / testcase：先建 draft-*，再由 finalize（或后续流程）落到正式 id
 * - requirement / prototype：不建 draft，须传正式 taskId，直接初始化任务目录
 */
import { mkdir, rename, readFile, writeFile } from 'fs/promises';
import path from 'path';

import { getPolarisConfigPath } from '../config/polaris-project-config.js';
import {
  getTaskDir,
  getTaskIntentionPath,
  getTaskIntentionRelPath,
  getTaskKindDir,
  getTaskKindRelPath,
  getTaskKindStatePath,
  getTaskStatePath,
} from '../assets/polaris-paths.js';
import { getTaskKindLayout } from '../config/task-kind-layout.js';
import {
  createDefaultRequirementState,
  saveRequirementStateToFile,
} from '../config/requirement-state.js';
import {
  createDefaultPrototypeState,
  savePrototypeStateToFile,
} from '../config/prototype-state.js';
import {
  createDefaultTaskState,
  patchTaskStateFile,
  saveTaskStateToFile,
} from '../config/task-state.js';
import { createDefaultTestcaseState, saveTestcaseStateToFile } from '../config/testcase-state.js';
import type { WorkflowTaskKind } from '../config/workflow-state.js';
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

/** init 可选参数 */
export type InitOptions = {
  /** 正式任务 id；usesDraft=false 的 kind（如 requirement / prototype）必填 */
  taskId?: string;
};

/** @deprecated 使用 InitResult */
export type TaskInitResult = InitResult;
/** @deprecated 使用 FinalizeResult */
export type TaskFinalizeResult = FinalizeResult;

/**
 * 向已创建的任务目录写入 state 与 bootstrap 文件。
 */
async function writeKindStateAndBootstrap(
  root: string,
  kind: WorkflowTaskKind,
  taskId: string,
  taskDir: string,
): Promise<void> {
  const layout = getTaskKindLayout(kind);
  const statePath = getTaskKindStatePath(root, kind, taskId);

  if (layout.stateFactory === 'coding') {
    const state = createDefaultTaskState({
      changeId: taskId,
      phase: layout.initialPhase,
      kind: 'coding',
    });
    state.runtime = {
      ...state.runtime,
      specify: {
        ...state.runtime?.specify,
        intention_path: getTaskIntentionRelPath(taskId),
        status: 'in_progress',
        start_time: new Date().toISOString(),
      },
    };
    await saveTaskStateToFile(statePath, state);
  } else if (layout.stateFactory === 'requirement') {
    const state = createDefaultRequirementState({
      taskId,
      phase: layout.initialPhase,
    });
    state.discovery = {
      status: 'in_progress',
      started_at: new Date().toISOString(),
      finished_at: '',
    };
    await saveRequirementStateToFile(statePath, state);
  } else if (layout.stateFactory === 'prototype') {
    const state = createDefaultPrototypeState({
      taskId,
      phase: layout.initialPhase,
    });
    state.blueprint = {
      status: 'in_progress',
      started_at: new Date().toISOString(),
      finished_at: '',
    };
    await savePrototypeStateToFile(statePath, state);
  } else {
    const planRel = getTaskKindRelPath(kind, taskId, 'testcase_plan.md');
    const state = createDefaultTestcaseState({
      taskId,
      phase: layout.initialPhase,
      planPath: planRel,
    });
    state.discovery = {
      status: 'in_progress',
      started_at: new Date().toISOString(),
      finished_at: '',
    };
    await saveTestcaseStateToFile(statePath, state);
  }

  for (const file of layout.bootstrapFiles) {
    const abs = path.join(taskDir, file.relPath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, file.content, 'utf-8');
  }
}

/**
 * 按 kind 初始化任务目录 + state.yaml（不写 workflow append）。
 * requirement / prototype 不走 draft，须提供 options.taskId。
 */
export async function init(
  repoRoot: string,
  kind: WorkflowTaskKind,
  options: InitOptions = {},
): Promise<InitResult> {
  if (!repoRoot) {
    return { exitCode: 2, message: '缺少或无效的 repo_root 参数' };
  }
  const root = path.resolve(repoRoot);
  if (!(await fileExists(root))) {
    return { exitCode: 2, message: '项目路径不存在: ' + root };
  }

  const configPath = getPolarisConfigPath(root);
  if (!(await fileExists(configPath))) {
    return { exitCode: 2, message: `配置文件不存在，请重启会话。路径：${configPath}` };
  }

  const layout = getTaskKindLayout(kind);

  if (!layout.usesDraft) {
    const taskId = (options.taskId ?? '').trim();
    if (!taskId) {
      return {
        exitCode: 2,
        message: `kind=${kind} 不使用 draft，须提供 --task-id`,
      };
    }
    const taskDir = getTaskKindDir(root, kind, taskId);
    if (await fileExists(taskDir)) {
      return {
        exitCode: 1,
        payload: {
          status: 'existing',
          kind,
          task_id: taskId,
          existing: [taskId],
        },
      };
    }
    await mkdir(taskDir, { recursive: true });
    await writeKindStateAndBootstrap(root, kind, taskId, taskDir);
    return {
      exitCode: 0,
      payload: {
        status: 'ok',
        kind,
        task_id: taskId,
        task_dir: taskDir,
      },
    };
  }

  const draft = await runDraftCreate(root, kind);
  if (draft.exitCode === 1) {
    return {
      exitCode: 1,
      payload: { status: 'existing', existing: draft.existing, kind },
    };
  }
  if (draft.exitCode !== 0) {
    return { exitCode: 2, message: `draft-create 返回 exit ${draft.exitCode}` };
  }

  const draftDir = draft.draft_dir;
  await mkdir(draftDir, { recursive: true });
  await writeKindStateAndBootstrap(root, kind, draft.draft_name, draftDir);

  return {
    exitCode: 0,
    payload: {
      status: 'ok',
      kind,
      draft_name: draft.draft_name,
      draft_dir: draftDir,
    },
  };
}

/**
 * draft → 正式 change_id，并 rename-active（仅 coding 路径；本期未泛化 kind）。
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
    phase: 'specify',
    runtime: {
      specify: {
        intention_path: intentionRel,
        status: 'completed',
        finished_at: new Date().toISOString(),
      },
    },
  });

  if (await fileExists(intention)) {
    let body = await readFile(intention, 'utf-8');
    body = body.replace(/^# intention:.*$/m, `# intention: ${changeId}`);
    await writeFile(intention, body, 'utf-8');
  }

  const wf = await runWorkflowEntry({
    op: 'rename-active',
    skill: 'specify',
    kind: 'coding',
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
