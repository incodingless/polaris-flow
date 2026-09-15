/**
 * 路径助手：项目 `.polaris/` / `.worktrees/`、全局 `~/.polaris` 等运行时落盘路径。
 * 发布包 assets 源路径见 `assets/manifest.ts`；平台/插件路径见 `platforms.ts`；
 * scope/worktree 布局见 `install/layout.ts`。
 */
import os from 'os';
import path from 'path';

import type { WorkflowTaskKind } from '../config/workflow-state.js';

/** 安装作用域：global → 用户主目录；project → 当前项目（叶类型，避免与 config 循环依赖） */
export type InstallScope = 'global' | 'project';

/** `.polaris` 下按任务 kind 划分的一级存储段 */
export type TaskStorageSegment = 'tasks' | 'testcases';

//---------------------------------
//         全局 ~/.polaris
//---------------------------------

/** 返回用户主目录下的 `~/.polaris` */
export function getPolarisHomeDir(): string {
  return path.join(os.homedir(), '.polaris');
}

/** 返回 `~/.polaris/polaris.yaml` */
export function getGlobalPolarisConfigPath(): string {
  return path.join(getPolarisHomeDir(), 'polaris.yaml');
}

//---------------------------------
//         项目 .polaris
//---------------------------------

/** 返回项目 `.polaris` 根目录 */
export function getPolarisDir(projectPath: string): string {
  return path.join(projectPath, '.polaris');
}

/** 返回 `.polaris/.gitignore` */
export function getPolarisGitignorePath(projectPath: string): string {
  return path.join(getPolarisDir(projectPath), '.gitignore');
}

/** 返回 `.polaris/config.yaml` 路径 */
export function getPolarisConfigPath(projectPath: string): string {
  return path.join(getPolarisDir(projectPath), 'config.yaml');
}

/** 返回 worktree 根路径（`<repo>/.worktrees`） */
export function getWorktreeRoot(projectPath: string): string {
  return path.join(projectPath, '.worktrees');
}

/** 返回某 change 的 worktree 路径 */
export function getWorktreePath(projectPath: string, changeId: string): string {
  return path.join(getWorktreeRoot(projectPath), changeId);
}

/** 返回 `.polaris/workflow.yaml` 路径 */
export function getWorkflowConfigPath(projectPath: string): string {
  return path.join(getPolarisDir(projectPath), 'workflow.yaml');
}

/** 返回 `.polaris/.locks` 目录 */
export function getLocksDir(projectPath: string): string {
  return path.join(getPolarisDir(projectPath), '.locks');
}

/** 返回 `.polaris/.locks/workflow.lock` */
export function getWorkflowLockPath(projectPath: string): string {
  return path.join(getLocksDir(projectPath), 'workflow.lock');
}

/**
 * 返回 `.polaris/.locks/task-state-<taskId>.lock`。
 * taskId 中不安全路径字符替换为 `_`，避免越出 locks 目录。
 */
export function getTaskStateLockPath(projectPath: string, taskId: string): string {
  const safe = taskId.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.join(getLocksDir(projectPath), `task-state-${safe}.lock`);
}

/** 返回 `.polaris/sessions` 目录 */
export function getSessionsDir(projectPath: string): string {
  return path.join(getPolarisDir(projectPath), 'sessions');
}

/** 返回 `.polaris/sessions/<ppid>.id` */
export function getSessionIdPath(projectPath: string, ppid: number | string): string {
  return path.join(getSessionsDir(projectPath), `${ppid}.id`);
}

//---------------------------------
//            tasks 相关
//---------------------------------

/** 返回 `.polaris/tasks` 目录 */
export function getTasksDir(projectPath: string): string {
  return path.join(getPolarisDir(projectPath), 'tasks');
}

/** 返回 `.polaris/tasks/<taskId>` 目录 */
export function getTaskDir(projectPath: string, taskId: string): string {
  return path.join(getTasksDir(projectPath), taskId);
}

/** 返回 `.polaris/tasks/<taskId>.snapshot` 目录 */
export function getTaskSnapshotDir(projectPath: string, taskId: string): string {
  return path.join(getTasksDir(projectPath), `${taskId}.snapshot`);
}

/** 返回 `.polaris/tasks/<taskId>/state.yaml` 路径 */
export function getTaskStatePath(projectPath: string, taskId: string): string {
  return path.join(getTaskDir(projectPath, taskId), 'state.yaml');
}

/** 返回 `.polaris/tasks/<taskId>/intention.md` 绝对路径 */
export function getTaskIntentionPath(projectPath: string, taskId: string): string {
  return path.join(getTaskDir(projectPath, taskId), 'intention.md');
}

/** 返回 intention 相对仓库根的路径字符串（写入 state.yaml 用） */
export function getTaskIntentionRelPath(taskId: string): string {
  return path.posix.join('.polaris', 'tasks', taskId, 'intention.md');
}

//---------------------------------
//        按 kind 的任务路径
//---------------------------------

/**
 * 返回 kind 对应的 `.polaris` 一级目录名。
 * change / requirement / prototype → tasks；testcase → testcases。
 */
export function getTaskStorageSegment(kind: WorkflowTaskKind): TaskStorageSegment {
  return kind === 'testcase' ? 'testcases' : 'tasks';
}

/** 返回 `.polaris/tasks` 或 `.polaris/testcases` */
export function getTaskKindRootDir(projectPath: string, kind: WorkflowTaskKind): string {
  return path.join(getPolarisDir(projectPath), getTaskStorageSegment(kind));
}

/** 返回 `.polaris/<segment>/<taskId>` */
export function getTaskKindDir(
  projectPath: string,
  kind: WorkflowTaskKind,
  taskId: string,
): string {
  return path.join(getTaskKindRootDir(projectPath, kind), taskId);
}

/** 返回 `.polaris/<segment>/<taskId>/state.yaml` */
export function getTaskKindStatePath(
  projectPath: string,
  kind: WorkflowTaskKind,
  taskId: string,
): string {
  return path.join(getTaskKindDir(projectPath, kind, taskId), 'state.yaml');
}

/**
 * 返回相对仓库根的 posix 路径：`.polaris/<segment>/<taskId>/<file>`。
 */
export function getTaskKindRelPath(
  kind: WorkflowTaskKind,
  taskId: string,
  file: string,
): string {
  return path.posix.join('.polaris', getTaskStorageSegment(kind), taskId, file);
}

/** 返回 `.polaris/testcases` 目录 */
export function getTestcasesDir(projectPath: string): string {
  return path.join(getPolarisDir(projectPath), 'testcases');
}

//---------------------------------
//            archive 相关
//---------------------------------

/** 返回 `.polaris/archive` 目录 */
export function getArchiveDir(projectPath: string): string {
  return path.join(getPolarisDir(projectPath), 'archive');
}

/** 返回 `.polaris/archive/<changeId>` 目录 */
export function getChangeArchiveDir(projectPath: string, changeId: string): string {
  return path.join(getArchiveDir(projectPath), changeId);
}

/** 返回 `.polaris/metrics` 目录 */
export function getMetricsDir(projectPath: string): string {
  return path.join(getPolarisDir(projectPath), 'metrics');
}

/** 返回 `.polaris/overrides.log` */
export function getOverridesLogPath(projectPath: string): string {
  return path.join(getPolarisDir(projectPath), 'overrides.log');
}
