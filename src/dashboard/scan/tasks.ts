/**
 * 游标扫描：把 `.polaris/workflow.yaml` 的 5 个任务数组摊平成统一的任务列表，
 * 并扫描已归档任务。
 *
 * 定位：本模块只做「读 core → 组形状」，不做路径拼装 —— 游标读取一律走
 * `core/config/workflow-state.ts`，归档路径走 `core/assets/polaris-paths.ts`。
 *
 * 关于 `phase`：权威值来自游标项（`workflow.yaml` 的 `<kind>_tasks[].phase`），
 * **不是** `state.yaml.phase`。依据见
 * `docs/specs/2026-09-19-phase-truth-unification-design.md` §1.1。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import { getArchiveDir } from '../../core/assets/polaris-paths.js';
import { parseWorkflowTaskKind, type WorkflowTaskKind } from '../../core/config/workflow-state.js';
import {
  getTaskList,
  loadWorkflowState,
  WORKFLOW_TASK_KINDS,
} from '../../core/config/workflow-state.js';

/** 任务条目的来源 */
export type TaskSource = 'cursor' | 'archive' | 'troubleshooting';

export type TaskCursor = {
  task_id: string;
  /**
   * 任务类型。游标来源必定有值；归档来源靠归档目录里的 `state.yaml.kind` 判定，
   * 读不到时为 `null`（**不猜**，由上层显示为「未知类型」）。
   */
  kind: WorkflowTaskKind | null;
  /** 权威 phase：游标项的 phase */
  phase: string;
  /** 通道；仅 debug 族有 */
  channel: string;
  worktree_path: string;
  started_at: string;
  source: TaskSource;
  /** 归档时间（ISO 8601）；非归档来源为空串 */
  archived_at: string;
};

/** 兜底的空任务条目 */
function emptyCursor(over: Partial<TaskCursor> = {}): TaskCursor {
  return {
    task_id: '',
    kind: null,
    phase: '',
    channel: '',
    worktree_path: '',
    started_at: '',
    source: 'cursor',
    archived_at: '',
    ...over,
  };
}

/** 把 workflow.yaml 的 5 个数组摊平为任务列表（kind 由所在数组决定） */
export async function scanTaskList(projectRoot: string): Promise<TaskCursor[]> {
  const state = await loadWorkflowState(projectRoot);
  const result: TaskCursor[] = [];

  for (const kind of WORKFLOW_TASK_KINDS) {
    for (const entry of getTaskList(state, kind)) {
      const taskId = (entry.task_id ?? '').trim();
      if (!taskId) {
        // 游标里没有 task_id 的条目无法定位，跳过（不占位）
        continue;
      }
      result.push(
        emptyCursor({
          task_id: taskId,
          kind,
          phase: entry.phase ?? '',
          channel: entry.channel ?? '',
          worktree_path: entry.worktree_path ?? '',
          started_at: entry.started_at ?? '',
          source: 'cursor',
        }),
      );
    }
  }

  return result;
}

/** 安全列目录；不可读时返回空数组 */
function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/** 目录 mtime（ISO）；取不到返回空串 */
function dirMtime(dir: string): string {
  try {
    return statSync(dir).mtime.toISOString();
  } catch {
    return '';
  }
}

/** 从归档目录内的 state.yaml 读 kind；读不到返回 null */
function readKindFromArchive(archiveTaskDir: string): WorkflowTaskKind | null {
  const statePath = path.join(archiveTaskDir, 'state.yaml');
  if (!existsSync(statePath)) {
    return null;
  }
  try {
    const parsed = parseYaml(readFileSync(statePath, 'utf-8')) as Record<string, unknown> | null;
    return parseWorkflowTaskKind(typeof parsed?.kind === 'string' ? parsed.kind : undefined);
  } catch {
    return null;
  }
}

/**
 * 解析 `docs/troubleshooting/INDEX.md` → { issue_id: 日期 }。
 *
 * 行格式：`issue_id | 日期 | 模块 | 异常类型 | 根因一句话 | 修复一句话`
 * （见 `assets/zh/skills/debug/closeout/SKILL.md:104`）。
 * **只取前两列**：后四列是自由文本，硬解析会随文案漂移而碎。
 */
function readTroubleshootingIndex(projectRoot: string): Map<string, string> {
  const result = new Map<string, string>();
  const indexPath = path.join(projectRoot, 'docs', 'troubleshooting', 'INDEX.md');
  if (!existsSync(indexPath)) {
    return result;
  }
  try {
    for (const line of readFileSync(indexPath, 'utf-8').split('\n')) {
      const cells = line.split('|').map((c) => c.trim());
      const id = cells[0] ?? '';
      // 跳过表头、分隔行与空行
      if (!id || id.startsWith('#') || /^-+$/.test(id) || id.toLowerCase() === 'issue_id') {
        continue;
      }
      result.set(id, cells[1] ?? '');
    }
  } catch {
    // 索引不可读不影响目录扫描
  }
  return result;
}

/**
 * 扫描已归档任务。**两个来源**，因为 debug 族的归档落点与其余 kind 不同：
 *
 *   1. `.polaris/archive/<id>/`（`harness-sync` 把 `state.yaml` 等运行态拷入；
 *      原型可能落在 `.polaris/archive/prototype/<id>/`，故多探一层）
 *      —— coding / requirement / testcase / prototype
 *   2. `docs/troubleshooting/<id>/`（+ `INDEX.md` 提供日期）—— debug
 *      （debug 族**不用** `.polaris/archive/`，依据
 *      `assets/zh/skills/debug/closeout/references/artifacts.md`）
 */
export function scanArchivedTasks(projectRoot: string): TaskCursor[] {
  const result: TaskCursor[] = [];

  // 来源 1：.polaris/archive
  const archiveRoot = getArchiveDir(projectRoot);
  const collectArchive = (dir: string, id: string) => {
    result.push(
      emptyCursor({
        task_id: id,
        kind: readKindFromArchive(dir),
        phase: 'archived',
        source: 'archive',
        archived_at: dirMtime(dir),
      }),
    );
  };
  for (const name of listDirs(archiveRoot)) {
    const dir = path.join(archiveRoot, name);
    // `.polaris/archive/prototype/<id>/` 这类嵌套布局：外层目录不作为任务
    if (name === 'prototype') {
      for (const nested of listDirs(dir)) {
        collectArchive(path.join(dir, nested), nested);
      }
      continue;
    }
    collectArchive(dir, name);
  }

  // 来源 2：docs/troubleshooting（debug 族）
  const troublesDir = path.join(projectRoot, 'docs', 'troubleshooting');
  if (existsSync(troublesDir)) {
    const index = readTroubleshootingIndex(projectRoot);
    for (const id of listDirs(troublesDir)) {
      const dir = path.join(troublesDir, id);
      result.push(
        emptyCursor({
          task_id: id,
          kind: 'debug',
          phase: 'archived',
          source: 'troubleshooting',
          archived_at: index.get(id) || dirMtime(dir),
        }),
      );
    }
  }

  return result;
}
