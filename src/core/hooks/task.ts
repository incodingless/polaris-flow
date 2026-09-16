/**
 * 任务生命周期：init（建目录 + 复制 state 模板 + 初始化补丁）与 finalize（draft → 正式 id）。
 * 由 `polaris task-init` / `polaris task-finalize` 调用。
 *
 * - coding / testcase：先建 draft-*，再由 finalize（或后续流程）落到正式 id
 * - requirement / prototype：不建 draft，须传正式 taskId，直接初始化任务目录
 */
import { copyFile, mkdir, rename, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { getPolarisConfigPath } from '../config/polaris-project-config.js';
import { getTaskStateTemplateSrc } from '../assets/manifest.js';
import {
  getTaskDir,
  getTaskIntentionPath,
  getTaskIntentionRelPath,
  getTaskKindDir,
  getTaskKindRelPath,
  getTaskKindStatePath,
  getTaskStatePath,
} from '../assets/polaris-paths.js';
import {
  getTaskKindLayout,
  type TaskBootstrapFile,
  type TaskInitPatches,
  type TaskKindLayout,
} from '../config/task-kind-layout.js';
import { patchTaskStateFile } from '../config/task-state.js';
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

/** 解析后的任务身份（直建或 draft） */
type ResolvedIdentity =
  | {
      ok: true;
      mode: 'direct' | 'draft';
      taskId: string;
      dir: string;
    }
  | {
      ok: false;
      result: InitResult;
    };

/** 按点路径写入嵌套对象 */
function setByPath(root: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split('.');
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/** 将补丁占位符替换为实际值 */
function resolvePatchValue(
  raw: string,
  vars: { taskId: string; now: string; intentionRel: string; planRel: string },
): string {
  switch (raw) {
    case '$taskId':
      return vars.taskId;
    case '$now':
      return vars.now;
    case '$intentionRel':
      return vars.intentionRel;
    case '$planRel':
      return vars.planRel;
    default:
      return raw;
  }
}

/** 对解析后的 state 对象应用 initPatches */
function applyInitPatches(
  state: Record<string, unknown>,
  patches: TaskInitPatches,
  vars: { taskId: string; now: string; intentionRel: string; planRel: string },
): void {
  for (const [dotted, raw] of Object.entries(patches)) {
    setByPath(state, dotted, resolvePatchValue(raw, vars));
  }
}

/**
 * 复制 kind 对应 state 模板到任务目录，再写入初始化补丁。
 */
async function materializeStateFromTemplate(
  root: string,
  kind: WorkflowTaskKind,
  taskId: string,
  layout: TaskKindLayout,
): Promise<void> {
  const statePath = getTaskKindStatePath(root, kind, taskId);
  const templateSrc = getTaskStateTemplateSrc(layout.stateTemplate);
  if (!(await fileExists(templateSrc))) {
    throw new Error(`state 模板不存在: ${templateSrc}`);
  }
  await mkdir(path.dirname(statePath), { recursive: true });
  await copyFile(templateSrc, statePath);

  const raw = await readFile(statePath, 'utf-8');
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`state 模板无法解析为对象: ${templateSrc}`);
  }
  const state = parsed as Record<string, unknown>;
  const now = new Date().toISOString();
  applyInitPatches(state, layout.initPatches, {
    taskId,
    now,
    intentionRel: getTaskIntentionRelPath(taskId),
    planRel: getTaskKindRelPath(kind, taskId, 'testcase_plan.md'),
  });

  const text = stringifyYaml(state, { lineWidth: 0 });
  await writeFile(statePath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}

/** 写入 layout.bootstrapFiles */
async function writeBootstrapFiles(taskDir: string, files: TaskBootstrapFile[]): Promise<void> {
  for (const file of files) {
    const abs = path.join(taskDir, file.relPath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, file.content, 'utf-8');
  }
}

/**
 * 解析 init 身份：直建须 --task-id；draft 走 draft-create。
 * 失败时返回 ok:false 并携带 InitResult。
 */
async function resolveInitIdentity(
  root: string,
  kind: WorkflowTaskKind,
  layout: TaskKindLayout,
  options: InitOptions,
): Promise<ResolvedIdentity> {
  if (!layout.usesDraft) {
    const taskId = (options.taskId ?? '').trim();
    if (!taskId) {
      return {
        ok: false,
        result: {
          exitCode: 2,
          message: `kind=${kind} 不使用 draft，须提供 --task-id`,
        },
      };
    }
    const dir = getTaskKindDir(root, kind, taskId);
    if (await fileExists(dir)) {
      return {
        ok: false,
        result: {
          exitCode: 1,
          payload: {
            status: 'existing',
            kind,
            task_id: taskId,
            existing: [taskId],
          },
        },
      };
    }
    return { ok: true, mode: 'direct', taskId, dir };
  }

  const draft = await runDraftCreate(root, kind);
  if (draft.exitCode === 1) {
    return {
      ok: false,
      result: {
        exitCode: 1,
        payload: { status: 'existing', existing: draft.existing, kind },
      },
    };
  }
  if (draft.exitCode !== 0) {
    return {
      ok: false,
      result: { exitCode: 2, message: `draft-create 返回 exit ${draft.exitCode}` },
    };
  }
  return {
    ok: true,
    mode: 'draft',
    taskId: draft.draft_name,
    dir: draft.draft_dir,
  };
}

/**
 * 按 kind 初始化任务目录 + state.yaml（不写 workflow append）。
 * 流水线：解析身份 → mkdir → 复制模板 → 初始化补丁 → bootstrapFiles。
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
  const resolved = await resolveInitIdentity(root, kind, layout, options);
  if (!resolved.ok) {
    return resolved.result;
  }

  try {
    await mkdir(resolved.dir, { recursive: true });
    await materializeStateFromTemplate(root, kind, resolved.taskId, layout);
    await writeBootstrapFiles(resolved.dir, layout.bootstrapFiles);
  } catch (err) {
    return {
      exitCode: 2,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (resolved.mode === 'direct') {
    return {
      exitCode: 0,
      payload: {
        status: 'ok',
        kind,
        task_id: resolved.taskId,
        task_dir: resolved.dir,
      },
    };
  }
  return {
    exitCode: 0,
    payload: {
      status: 'ok',
      kind,
      draft_name: resolved.taskId,
      draft_dir: resolved.dir,
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
