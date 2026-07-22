/**
 * 路径助手：包内 assets/、项目 `.polaris/` / `.worktrees/` 等，供 config、install、hooks 共用。
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 返回发布包/仓库根下的 assets 目录 */
export function getAssetsDir(): string {
  return path.resolve(__dirname, '..', '..', '..', 'assets');
}

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

/** 返回某 change 的 worktree 路径 */
export function getWorktreePath(projectPath: string, changeId: string): string {
  return path.join(getWorktreeRoot(projectPath), changeId);
}

/** 返回 `.polaris/workflow.yaml` 路径 */
export function getWorkflowYamlPath(projectPath: string): string {
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
 * 返回插件根绝对路径：`<project>/.<platform>/skills/polaris-flow`。
 * `platform` 可为 `.trae` 或 `.claude` 或 `.cursor`等。
 */
export function getPluginRoot(projectPath: string, platform: string): string {
  const platformDir = normalizePlatformDir(platform);
  return path.join(projectPath, platformDir, 'skills', 'polaris-flow');
}

/**
 * 返回插件根相对仓库根的路径：`.<platform>/skills/polaris-flow`（写入 config.plugin_root）。
 */
export function getPluginRootRelPath(platform: string): string {
  return path.posix.join(normalizePlatformDir(platform), 'skills', 'polaris-flow');
}

/** 规范化平台目录名（保证带前导点） */
function normalizePlatformDir(platform: string): string {
  const trimmed = platform.trim();
  if (!trimmed) {
    throw new Error('platform 不能为空');
  }
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

/** 返回 worktree 根路径（`<repo>/.worktrees`） */
export function getWorktreeRoot(projectPath: string): string {
  return path.join(projectPath, '.worktrees');
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
