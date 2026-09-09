/**
 * SessionStart hook 核心逻辑：环境自检、依赖 WARN、session_id、评审 agent model 注入。
 * 由 `polaris session-start` CLI 与薄包装 session-start.sh 调用。
 */
import { randomBytes } from 'crypto';
import { copyFile, mkdir, readFile, writeFile, appendFile } from 'fs/promises';
import path from 'path';

import {
  getPolarisConfigPath,
  loadPolarisConfig,
  resolveReviewAgentModel,
} from '../config/polaris-project-config.js';
import {
  getLocksDir,
  getPolarisDir,
  getPolarisGitignorePath,
  getSessionIdPath,
  getSessionsDir,
  getWorkflowConfigPath,
} from '../assets/polaris-paths.js';
import { fileExists } from '../../utils/file-system.js';
import { createHookIo, type HookIo } from './hook-io.js';
import {
  checkPluginPresence,
  getInstallHints,
  type PluginPresenceOptions,
} from '../integrations/detect.js';
import { PLATFORMS, Platform } from '../domain/platforms.js';
import { getPolarisPluginRootPath } from '../assets/layout.js';

export { resolveReviewAgentModel } from '../config/polaris-project-config.js';

const GITIGNORE_ENTRIES = [
  '.cache/',
  '.locks/',
  'deepreads/',
  'metrics/',
  'workflow.yaml',
  'tasks/',
  'testcases/',
  'archive/',
  'overrides.log',
] as const;

const REVIEW_AGENTS = [
  'plan-reviewer',
  'design-review-agent',
  'tasks-review-agent',
  'openspec-review-agent',
] as const;

/** SessionStart 解析出的仓库 / 平台路径（供 commands 注入 Agent，不自行拼接） */
export type SessionStartPaths = {
  repoRoot: string;
  platformId: string;
  contextDir: string;
  pluginRoot: string;
};

export type SessionStartResult = {
  warnCount: number;
  failCount: number;
  /** 与 hook 契约一致：有 WARN/FAIL 则为 1 */
  exitCode: number;
  /** 已解析到平台且算出 pluginRoot 时给出 */
  paths?: SessionStartPaths;
};

export type SessionStartOptions = {
  /** 平台 ID，如：claude、trae、cursor等；由 commands 层 resolve 后传入，缺省则 FAIL */
  platformId?: string;
  /** 项目根目录，默认 process.cwd() */
  projectPath?: string;
  /** 宿主 stdin 提供的 session_id；缺省则本地生成 */
  sessionId?: string;
  /** 可注入 IO，便于测试 */
  io?: HookIo;
  /** 可注入 PPID，便于测试 */
  ppid?: number;
  /** 透传给 plugin 探测（隔离 HOME / PATH CLI） */
  pluginPresence?: PluginPresenceOptions;
};

/**
 * 生成 session_id：UTC ISO 秒级时间戳 + 6 位 hex。
 */
export function createSessionId(now: Date = new Date()): string {
  const utc = now.toISOString().slice(0, 19);
  const suffix = randomBytes(3).toString('hex');
  return `${utc}-${suffix}`;
}

/**
 * 检查 superpowers；缺失记 ERROR。
 */
async function checkSuperpowers(
  io: HookIo,
  platform: Platform,
  repoRoot: string,
  presenceOpts?: PluginPresenceOptions,
): Promise<boolean> {
  const presence = await checkPluginPresence(platform, 'superpowers', repoRoot, presenceOpts);
  if (presence.ok) {
    io.ok('superpowers found');
    return true;
  }
  io.warn(
    'superpowers plugin not found — polaris-flow 多数 skill 依赖 superpowers 的 subagent 派发能力',
  );
  io.hint('要求版本：superpowers >= 4.0.0');
  io.hint('安装方式（宿主 plugin，hook 不代为安装）：');
  for (const line of getInstallHints(platform.id, 'superpowers')) {
    io.hint(line);
  }
  return false;
}

/**
 * 检查 openspec；缺失记 ERROR。
 */
async function checkOpenspec(
  io: HookIo,
  platform: Platform,
  repoRoot: string,
  presenceOpts?: PluginPresenceOptions,
): Promise<boolean> {
  const presence = await checkPluginPresence(platform, 'openspec', repoRoot, presenceOpts);
  if (presence.ok) {
    io.ok('openspec found');
    return true;
  }
  if (presence.found && presence.result?.variant === 'openspec-cn') {
    io.ok(`openspec-cn found (${presence.result.path})`);
    io.hint('注意：下游 skill 调用裸名 openspec；请将 openspec-cn 软链/别名为 openspec');
    return false;
  }
  io.warn('openspec CLI not found — polaris-flow 的 plan/design/build/ship 依赖 openspec 命令');
  for (const line of getInstallHints(platform.id, 'openspec')) {
    io.hint(line);
  }
  return false;
}

/**
 * 检查 .polaris 目录、config、gitignore、workflow 骨架、.locks。
 * @param pluginRoot 插件根绝对路径（`$RepoRoot/.<platform>/skills/polaris`）
 */
async function checkConfig(
  io: HookIo,
  projectPath: string,
  pluginRoot: string | undefined,
): Promise<boolean> {
  let ok = true;
  const polarisDir = getPolarisDir(projectPath);

  if (!(await fileExists(polarisDir))) {
    io.fail(".polaris/ directory not found, please run 'polaris init' to create it");
    return false;
  }
  io.ok('.polaris/ directory found');

  const configPath = getPolarisConfigPath(projectPath);
  if (!(await fileExists(configPath))) {
    io.fail(".polaris/config.yaml not found, please run 'polaris init' to create it");
    ok = false;
  } else {
    io.ok('config.yaml found');
  }

  const gitignore = getPolarisGitignorePath(projectPath);
  let existing = '';
  if (await fileExists(gitignore)) {
    existing = await readFile(gitignore, 'utf-8');
  }
  const existingLines = new Set(
    existing
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  );
  for (const entry of GITIGNORE_ENTRIES) {
    if (!existingLines.has(entry)) {
      try {
        await appendFile(gitignore, `${entry}\n`, 'utf-8');
        existingLines.add(entry);
      } catch {
        io.warn(`could not append '${entry}' to ${gitignore}`);
      }
    }
  }

  const workflowDst = getWorkflowConfigPath(projectPath);
  if (!(await fileExists(workflowDst))) {
    if (pluginRoot) {
      const workflowSrc = path.join(pluginRoot, 'templates', 'workflow-template.yaml');
      if (await fileExists(workflowSrc)) {
        try {
          await copyFile(workflowSrc, workflowDst);
          io.ok('materialized .polaris/workflow.yaml (from template)');
        } catch {
          io.warn(`failed to write ${workflowDst} (skills will lazily create it on first write)`);
        }
      } else {
        io.warn(`plugin template missing: ${workflowSrc}`);
      }
    }
  }

  try {
    await mkdir(getLocksDir(projectPath), { recursive: true });
  } catch {
    io.warn('could not create .polaris/.locks (ship lock will fail)');
  }

  return ok;
}

/**
 * 写入按 PPID 隔离的 session_id 文件。
 * @param providedSessionId 宿主 stdin 已给时优先使用，否则本地生成
 */
async function initSessionId(
  io: HookIo,
  projectPath: string,
  ppid: number,
  providedSessionId?: string,
): Promise<boolean> {
  const sessionsDir = getSessionsDir(projectPath);
  try {
    await mkdir(sessionsDir, { recursive: true });
  } catch {
    io.fail(`failed to create ${sessionsDir} (permission denied?)`);
    return false;
  }

  const sessionId = providedSessionId?.trim() || createSessionId();
  const sessionFile = getSessionIdPath(projectPath, ppid);
  try {
    await writeFile(sessionFile, `${sessionId}\n`, 'utf-8');
  } catch {
    io.fail(`failed to write ${sessionFile}`);
    return false;
  }
  io.ok(`subagent-probe session_id: ${sessionId} (PPID=${ppid})`);
  return true;
}

/**
 * 向单个 review agent 文件注入 model 行。
 */
export async function injectReviewAgentModel(
  io: HookIo,
  projectPath: string,
  platform: Platform,
  name: string,
  model: string,
): Promise<boolean> {
  const dst = path.join(projectPath, platform.contextDir, 'agents', `${name}.md`);
  if (!(await fileExists(dst))) {
    io.warn(`${name} 未安装到 ${dst}（请先 polaris-flow init/update）`);
    return false;
  }
  try {
    const raw = await readFile(dst, 'utf-8');
    const updated = raw.replace(/^model:.*$/m, `model: ${model}`);
    await writeFile(dst, updated, 'utf-8');
    io.ok(`${name} model → ${model} (${dst})`);
    return true;
  } catch {
    io.warn(`注入 ${name} model 失败`);
    return false;
  }
}

/**
 * 对当前平台同步四个评审 agent 的 model。
 */
async function syncReviewAgents(
  io: HookIo,
  projectPath: string,
  platform: Platform,
  model: string,
): Promise<boolean> {
  let ok = true;
  for (const name of REVIEW_AGENTS) {
    const injected = await injectReviewAgentModel(io, projectPath, platform, name, model);
    if (!injected) ok = false;
  }
  return ok;
}

/**
 * 执行 SessionStart 全流程；返回计数与建议 exitCode（不直接 process.exit）。
 */
export async function runSessionStart(
  options: SessionStartOptions = {},
): Promise<SessionStartResult> {
  const projectPath = path.resolve(options.projectPath ?? process.cwd());
  const io = options.io ?? createHookIo();
  const ppid = options.ppid ?? process.ppid;
  const platformId = options.platformId?.trim() || undefined;
  if (!platformId) {
    io.fail('platform not set — pass --platform or set platform/platforms in .polaris/config.yaml');
    return { warnCount: 1, failCount: 1, exitCode: 1 };
  }

  const platform = PLATFORMS.find((p) => p.id === platformId);
  if (!platform) {
    io.fail(`platform '${platformId}' not found — skip plugin presence checks`);
    return { warnCount: 1, failCount: 1, exitCode: 1 };
  }

  let warnCount = 0;
  let failCount = 0;

  io.tty('=== polaris-flow SessionStart Check ===');

  const pluginRoot = await getPolarisPluginRootPath(projectPath, platform);
  if (!pluginRoot || pluginRoot === null || pluginRoot === '') {
    io.fail(`polaris plugin root not found for platform '${platformId}'`);
    return { warnCount: 1, failCount: 1, exitCode: 1 };
  }

  const paths: SessionStartPaths = {
    repoRoot: projectPath,
    platformId,
    contextDir: platform.contextDir,
    pluginRoot,
  };

  const runWarn = async (fn: () => Promise<boolean>) => {
    if (!(await fn())) warnCount += 1;
  };
  const runFail = async (fn: () => Promise<boolean>) => {
    if (!(await fn())) failCount += 1;
  };

  const presenceOpts = options.pluginPresence;
  await runWarn(() => checkSuperpowers(io, platform, projectPath, presenceOpts));
  await runWarn(() => checkOpenspec(io, platform, projectPath, presenceOpts));

  await runFail(() => checkConfig(io, projectPath, pluginRoot));
  await runFail(() => initSessionId(io, projectPath, ppid, options.sessionId));

  const config = await loadPolarisConfig(projectPath);
  if (!config) {
    io.fail(`polaris config not found for platform '${platformId}'`);
    return { warnCount: 1, failCount: 1, exitCode: 1, paths };
  }
  const model = resolveReviewAgentModel(config);
  await runWarn(() => syncReviewAgents(io, projectPath, platform, model));

  if (failCount > 0 || warnCount > 0) {
    io.tty('');
    if (failCount > 0) {
      io.fail(
        `polaris-flow SessionStart finished with ${failCount} failure(s), ${warnCount} warning(s) — 见上方信息`,
      );
    } else {
      io.warn(
        `polaris-flow SessionStart finished with ${warnCount} dependency warning(s) — 见上方安装指引；会话可继续，但相关阶段可能失败`,
      );
    }
    return { warnCount, failCount, exitCode: 1, paths };
  }

  return { warnCount, failCount, exitCode: 0, paths };
}
