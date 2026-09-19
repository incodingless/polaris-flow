/**
 * 运行态读取：按 kind 定位并读取 `.polaris/<segment>/<taskId>/state.yaml`。
 *
 * **`phase` 不从这里取。** 权威 phase 是 `workflow.yaml` 游标项的值，由调用方传入
 * （见 `scan/tasks.ts` 的 `scanTaskList`）。原因是 `state.yaml.phase` 在 src/ 内
 * 零读取方，且 coding 族从不调用 `enter/complete-phase`，其值会长期停在建任务时写入的
 * `specify` —— 读它会让面板显示一个停住的错误阶段。
 * 依据：`docs/specs/2026-09-19-phase-truth-unification-design.md` §1.1。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import { getTaskKindDir, getTaskKindStatePath } from '../../core/assets/polaris-paths.js';
import { getKindArtifacts } from '../../core/config/task-kind-layout.js';
import type { WorkflowTaskKind } from '../../core/config/workflow-state.js';

export type TaskRuntime = {
  /** 权威 phase（游标值），由调用方传入；缺失时为空串 */
  phase: string;
  /** 通道；仅 debug 族有 */
  channel: string;
  /**
   * 开发模式原文（`state.yaml` 的 `workflow.mode`）。
   * 历史值域含 `sdd`，现行值域为 `tweak|normal|full` —— **归一由展示层做**
   * （`sdd` 与 `normal` 视为同一档），此处不吞掉原值。
   */
  mode: string;
  /** 任务名：state 的名字字段 → 首个存在的产物文档的标题 → `task_id` */
  title: string;
  /** `state.yaml` 里的 worktree 路径 */
  worktreePath: string;
  /** `state.yaml` 缺失为 true —— 用于提示「运行态未初始化」。**不得据此反推阶段** */
  stateMissing: boolean;
  /** `state.yaml` 的 mtime（ISO）；取不到为空串 */
  updatedAt: string;
};

/** 各 kind 在 state.yaml 里的名字字段（有名字的 kind 才登记） */
const NAME_FIELDS: Partial<Record<WorkflowTaskKind, string[]>> = {
  requirement: ['req_name', 'req_name_cn'],
  prototype: ['name'],
};

/** 取文档的首个一级标题（`# xxx`）；取不到返回空串 */
function firstHeading(filePath: string): string {
  try {
    for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
      const matched = line.match(/^#\s+(.+?)\s*$/);
      if (matched) {
        return matched[1]!;
      }
    }
  } catch {
    // 文件不可读按「没有标题」处理
  }
  return '';
}

/**
 * 用各 kind 的产物表找首个存在的文档，取其一级标题当名字兜底。
 * 刻意复用 `getKindArtifacts`（单一表），不再维护第二份产物路径清单。
 */
function titleFromArtifacts(projectRoot: string, kind: WorkflowTaskKind, taskId: string): string {
  for (const artifact of getKindArtifacts(kind)) {
    if (artifact.kind !== 'file') {
      continue;
    }
    for (const rel of artifact.relPaths) {
      const abs = path.join(projectRoot, rel.replace('<id>', taskId));
      if (existsSync(abs)) {
        const title = firstHeading(abs);
        if (title) {
          return title;
        }
      }
    }
  }
  return '';
}

/** 从 state 对象里取名字字段 */
function nameFromState(state: Record<string, unknown>, kind: WorkflowTaskKind): string {
  for (const field of NAME_FIELDS[kind] ?? []) {
    const value = state[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

/** 取 state.yaml 的 workflow 模式（字典结构取 `mode`；旧字符串写法直接返回） */
function modeFromState(state: Record<string, unknown>): string {
  const workflow = state.workflow;
  if (typeof workflow === 'string') {
    return workflow;
  }
  if (workflow && typeof workflow === 'object') {
    const mode = (workflow as Record<string, unknown>).mode;
    if (typeof mode === 'string') {
      return mode;
    }
  }
  return '';
}

/**
 * 读取任务运行态。
 *
 * @param cursorPhase 权威 phase，来自 `workflow.yaml` 游标项
 */
export function readTaskRuntime(
  projectRoot: string,
  kind: WorkflowTaskKind,
  taskId: string,
  cursorPhase: string,
): TaskRuntime {
  const statePath = getTaskKindStatePath(projectRoot, kind, taskId);
  const base: TaskRuntime = {
    phase: cursorPhase ?? '',
    channel: '',
    mode: '',
    title: '',
    worktreePath: '',
    stateMissing: !existsSync(statePath),
    updatedAt: '',
  };

  if (base.stateMissing) {
    base.title = titleFromArtifacts(projectRoot, kind, taskId) || taskId;
    return base;
  }

  try {
    base.updatedAt = statSync(statePath).mtime.toISOString();
  } catch {
    // 取不到时间戳不影响其余字段
  }

  let state: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(readFileSync(statePath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      state = parsed as Record<string, unknown>;
    }
  } catch {
    // 解析失败：保留已取到的字段，title 走产物文档兜底
  }

  base.channel = typeof state.channel === 'string' ? state.channel : '';
  base.mode = modeFromState(state);
  base.title =
    nameFromState(state, kind) || titleFromArtifacts(projectRoot, kind, taskId) || taskId;

  const worktree = state.worktree;
  if (worktree && typeof worktree === 'object') {
    const wtPath = (worktree as Record<string, unknown>).path;
    base.worktreePath = typeof wtPath === 'string' ? wtPath : '';
  }

  return base;
}

/** 任务目录绝对路径（供 scan/files.ts 复用） */
export function taskDirOf(projectRoot: string, kind: WorkflowTaskKind, taskId: string): string {
  return getTaskKindDir(projectRoot, kind, taskId);
}
