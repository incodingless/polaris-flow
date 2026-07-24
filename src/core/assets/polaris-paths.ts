/**
 * 路径助手：包内 assets/、项目 `.polaris/` / `.worktrees/`、全局 `~/.polaris`、平台目录等，
 * 供 config、install、hooks 共用。
 */
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 安装作用域（路径层自洽，避免与 polaris-config 循环依赖） */
export type PathInstallScope = 'global' | 'project';

/** polaris-flow 插件根下的公共子目录名 */
export const PLUGIN_SUBDIR_NAMES = [
  'hooks',
  'templates',
  'adapters',
  'policies',
  'scorers',
] as const;

/** 平台配置根下始终创建的目录名 */
export const PLATFORM_ROOT_DIR_NAMES = ['skills', 'commands', 'agents'] as const;

/** 返回发布包/仓库根下的 assets 目录 */
export function getAssetsDir(): string {
  return path.resolve(__dirname, '..', '..', '..', 'assets');
}

/** 返回 `assets/shared/templates` */
export function getSharedTemplatesDir(): string {
  return path.join(getAssetsDir(), 'shared', 'templates');
}

/** 返回 `assets/shared/harness` */
export function getSharedHarnessDir(): string {
  return path.join(getAssetsDir(), 'shared', 'harness');
}

/** 返回全局 polaris 模板源：`assets/shared/templates/polaris.example.yaml` */
export function getGlobalPolarisConfigSrc(): string {
  return path.join(getSharedTemplatesDir(), 'polaris.example.yaml');
}

/** 返回项目 config 模板源：`assets/shared/templates/config.example.yaml` */
export function getConfigExampleYamlSrc(): string {
  return path.join(getSharedTemplatesDir(), 'config.example.yaml');
}

/** 返回 workflow 模板源：`assets/shared/templates/workflow-template.yaml` */
export function getWorkflowTemplateYamlSrc(): string {
  return path.join(getSharedTemplatesDir(), 'workflow-template.yaml');
}

/** 返回 harness .gitignore 源：`assets/shared/harness/.gitignore` */
export function getHarnessGitignoreSrc(): string {
  return path.join(getSharedHarnessDir(), '.gitignore');
}

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

/**
 * 返回技能安装根：project → 项目路径，global → 用户主目录。
 */
export function getInstallSkillBase(scope: PathInstallScope, projectPath: string): string {
  return scope === 'global' ? os.homedir() : projectPath;
}

/**
 * 按 scope 返回 worktree 根目录。
 * project → `<project>/.worktrees`；global → `~/.polaris/.worktrees`。
 */
export function resolveWorktreeRoot(projectPath: string, scope: PathInstallScope): string {
  if (scope === 'global') {
    return path.join(getPolarisHomeDir(), '.worktrees');
  }
  return getWorktreeRoot(projectPath);
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

//---------------------------------
//         平台 / 插件根
//---------------------------------

/**
 * 返回插件根绝对路径：`<baseDir>/.<platform>/skills/polaris-flow`。
 * `platform` 可为 `.trae` 或 `claude` 等。
 */
export function getPluginRoot(baseDir: string, platform: string): string {
  return path.join(baseDir, getPluginRootRelPath(platform));
}

/**
 * 返回插件根相对路径：`.<platform>/skills/polaris-flow`（写入 config.plugin_root）。
 */
export function getPluginRootRelPath(platform: string): string {
  return path.posix.join(normalizePlatformDir(platform), 'skills', 'polaris-flow');
}

/** 返回插件根下子目录（hooks / templates / adapters / policies / scorers） */
export function getPluginSubdir(pluginRoot: string, name: string): string {
  return path.join(pluginRoot, name);
}

/** 返回平台配置根绝对路径：`<baseDir>/.<platform>` */
export function getPlatformRoot(baseDir: string, platform: string): string {
  return path.join(baseDir, normalizePlatformDir(platform));
}

/** 返回平台 `skills` 目录 */
export function getPlatformSkillsPath(baseDir: string, platform: string): string {
  return path.join(getPlatformRoot(baseDir, platform), 'skills');
}

/** 返回平台 `commands` 目录 */
export function getPlatformCommandsPath(baseDir: string, platform: string): string {
  return path.join(getPlatformRoot(baseDir, platform), 'commands');
}

/** 返回平台 `agents` 目录 */
export function getPlatformAgentsPath(baseDir: string, platform: string): string {
  return path.join(getPlatformRoot(baseDir, platform), 'agents');
}

/** 返回平台 rules 目录（默认 `rules`） */
export function getPlatformRulesPath(
  baseDir: string,
  platform: string,
  rulesDir: string = 'rules',
): string {
  return path.join(getPlatformRoot(baseDir, platform), rulesDir);
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
