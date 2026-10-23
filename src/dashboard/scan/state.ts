/**
 * 运行态读取：按 kind 定位并读取 `.polaris/<segment>/<taskId>/state.yaml`。
 *
 * **`phase` 就在这里** —— 任务阶段（"下一步该谁接手"）的唯一存放处是 `state.yaml` 的顶层
 * `phase`；游标（`workflow.yaml`）只回答"有哪些在途任务"和"任务在哪"（`worktree_path`）。
 * 读取位置一律走 `resolveTaskStatePath`：`worktree_path` 非空 = 任务目录已搬进 worktree。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import { getTaskKindDir, resolveTaskStatePath } from '../../core/assets/polaris-paths.js';
import { getKindArtifacts } from '../../core/config/task-kind-layout.js';
import type { WorkflowTaskKind } from '../../core/config/workflow-state.js';

export type TaskRuntime = {
  /** `state.yaml` 的顶层 `phase`（语义 = 接下来要执行的阶段）；读不到时为空串 */
  phase: string;
  /** 通道；仅 debug 族有 */
  channel: string;
  /**
   * 开发模式原文（`state.yaml` 的 `workflow.mode`）。
   * 历史值域含 `sdd` / `full`，现行值域为 `tweak|normal|strict` —— **归一由展示层做**
   * （`sdd` 与 `normal` 视为同一档、`full` 与 `strict` 同一档），此处不吞掉原值。
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
  /**
   * 各阶段在 `state.yaml` 里记录的状态（`phase code → status`）。
   *
   * 用途：把**可跳过**阶段渲染成「已跳过」而不是「已完成」—— 例如 coding 走 plan 的
   * B 分支（跳过深度设计）时，`runtime.design.status = skipped`。
   * 取值位置两种都收：`runtime.<phase>.status`（coding / debug）与顶层 `<phase>.status`
   * （requirement / testcase / prototype 的 state 结构）。
   */
  phaseStatuses: Record<string, string>;
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

/**
 * 收集各阶段的状态：`runtime.<phase>.status` 与顶层 `<phase>.status` 都收。
 * 判据是「值是对象且带 string 类型的 status」，不写死阶段名 —— 阶段表变了这里不用改。
 * 顶层 `workflow` 也带 status，但它是通道决策不是阶段，扫顶层时跳过。
 */
function collectPhaseStatuses(state: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  const collect = (container: unknown, skipKeys?: ReadonlySet<string>) => {
    if (!container || typeof container !== 'object' || Array.isArray(container)) {
      return;
    }
    for (const [key, value] of Object.entries(container as Record<string, unknown>)) {
      if (skipKeys?.has(key)) {
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const status = (value as Record<string, unknown>).status;
        if (typeof status === 'string' && status) {
          result[key] = status;
        }
      }
    }
  };
  collect(state.runtime);
  collect(state, new Set(['workflow']));
  return result;
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
 * @param worktreePath 游标条目的 `worktree_path`；非空表示任务目录在 worktree 内
 */
export function readTaskRuntime(
  projectRoot: string,
  kind: WorkflowTaskKind,
  taskId: string,
  worktreePath = '',
): TaskRuntime {
  const statePath = resolveTaskStatePath(projectRoot, kind, taskId, worktreePath);
  const base: TaskRuntime = {
    phase: '',
    channel: '',
    mode: '',
    title: '',
    worktreePath: '',
    stateMissing: !existsSync(statePath),
    updatedAt: '',
    phaseStatuses: {},
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
  base.phase = typeof state.phase === 'string' ? state.phase : '';
  base.mode = modeFromState(state);
  base.phaseStatuses = collectPhaseStatuses(state);
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
