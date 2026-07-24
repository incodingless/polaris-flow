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
} from '../config/polaris-config.js';
import {
  getLocksDir,
  getPolarisDir,
  getPolarisGitignorePath,
  getSessionIdPath,
  getSessionsDir,
  getWorkflowYamlPath,
} from '../assets/polaris-paths.js';
import { fileExists } from '../../utils/file-system.js';
import { createHookIo, type HookIo } from './hook-io.js';
import {
  checkPluginPresence,
  getInstallHints,
  isSupportedPluginPlatform,
  type PluginPlatformId,
  type PluginPresenceOptions,
} from '../integration/detect.js';

export { resolveReviewAgentModel } from '../config/polaris-config.js';

const GITIGNORE_ENTRIES = [
  '.cache/',
  '.locks/',
  'deepreads/',
  'metrics/',
  'workflow.yaml',
  'tasks/',
  'archive/',
  'overrides.log',
] as const;

const REVIEW_AGENTS = [
  'propose-review-agent',
  'design-review-agent',
  'plan-review-agent',
  'openspec-review-agent',
] as const;

export type SessionStartResult = {
  warnCount: number;
  failCount: number;
  /** 与 hook 契约一致：有 WARN/FAIL 则为 1 */
  exitCode: number;
};

export type SessionStartOptions = {
  /** 项目根目录，默认 process.cwd() */
  projectPath?: string;
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
  platformId: PluginPlatformId,
  repoRoot: string,
  presenceOpts?: PluginPresenceOptions,
): Promise<boolean> {
  const presence = await checkPluginPresence(platformId, 'superpowers', repoRoot, presenceOpts);
  if (presence.ok) {
    io.ok('superpowers found');
    return true;
  }
  io.warn(
    'superpowers plugin not found — polaris-flow 多数 skill 依赖 superpowers 的 subagent 派发能力',
  );
  io.hint('要求版本：superpowers >= 4.0.0');
  io.hint('安装方式（宿主 plugin，hook 不代为安装）：');
  for (const line of getInstallHints(platformId, 'superpowers')) {
    io.hint(line);
  }
  return false;
}

/**
 * 检查 openspec；缺失记 ERROR。
 */
async function checkOpenspec(
  io: HookIo,
  platformId: PluginPlatformId,
  repoRoot: string,
  presenceOpts?: PluginPresenceOptions,
): Promise<boolean> {
  const presence = await checkPluginPresence(platformId, 'openspec', repoRoot, presenceOpts);
  if (presence.ok) {
    io.ok('openspec found');
    return true;
  }
  if (presence.found && presence.result?.variant === 'openspec-cn') {
    io.ok(`openspec-cn found (${presence.result.path})`);
    io.hint('注意：下游 skill 调用裸名 openspec；请将 openspec-cn 软链/别名为 openspec');
    return false;
  }
  io.warn('openspec CLI not found — polaris-flow 的 propose/design/build/ship 依赖 openspec 命令');
  for (const line of getInstallHints(platformId, 'openspec')) {
    io.hint(line);
  }
  return false;
}

/**
 * 检查 .polaris 目录、config、gitignore、workflow 骨架、.locks。
 */
async function checkConfig(
  io: HookIo,
  projectPath: string,
  pluginRootRel: string | undefined,
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

  const workflowDst = getWorkflowYamlPath(projectPath);
  if (!(await fileExists(workflowDst))) {
    if (pluginRootRel) {
      const workflowSrc = path.join(
        projectPath,
        pluginRootRel,
        'templates',
        'workflow-template.yaml',
      );
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
 */
async function initSessionId(io: HookIo, projectPath: string, ppid: number): Promise<boolean> {
  const sessionsDir = getSessionsDir(projectPath);
  try {
    await mkdir(sessionsDir, { recursive: true });
  } catch {
    io.fail(`failed to create ${sessionsDir} (permission denied?)`);
    return false;
  }

  const sessionId = createSessionId();
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
  platformId: string,
  name: string,
  model: string,
): Promise<boolean> {
  const dst = path.join(projectPath, `.${platformId}`, 'agents', `${name}.md`);
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
 * 对 claude/trae 同步四个评审 agent 的 model。
 */
async function syncReviewAgents(
  io: HookIo,
  projectPath: string,
  platformId: string,
  model: string,
): Promise<boolean> {
  if (platformId !== 'claude' && platformId !== 'trae') {
    return true;
  }
  let ok = true;
  for (const name of REVIEW_AGENTS) {
    const injected = await injectReviewAgentModel(io, projectPath, platformId, name, model);
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

  let warnCount = 0;
  let failCount = 0;

  io.tty('=== polaris-flow SessionStart Check ===');

  const config = await loadPolarisConfig(projectPath);
  const platformRaw = config?.platform;
  const pluginRoot = config?.plugin_root;

  const runWarn = async (fn: () => Promise<boolean>) => {
    if (!(await fn())) warnCount += 1;
  };
  const runFail = async (fn: () => Promise<boolean>) => {
    if (!(await fn())) failCount += 1;
  };

  if (platformRaw && isSupportedPluginPlatform(platformRaw)) {
    const platformId = platformRaw;
    const presenceOpts = options.pluginPresence;
    await runWarn(() => checkSuperpowers(io, platformId, projectPath, presenceOpts));
    await runWarn(() => checkOpenspec(io, platformId, projectPath, presenceOpts));
  } else if (platformRaw) {
    io.warn(`unsupported platform '${platformRaw}' — skip plugin presence checks`);
    warnCount += 1;
  } else {
    io.warn('platform not set in .polaris/config.yaml — skip plugin presence checks');
    warnCount += 1;
  }

  await runFail(() => checkConfig(io, projectPath, pluginRoot));
  await runFail(() => initSessionId(io, projectPath, ppid));

  const model = resolveReviewAgentModel(config);
  if (platformRaw) {
    await runWarn(() => syncReviewAgents(io, projectPath, platformRaw, model));
  }

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
    return { warnCount, failCount, exitCode: 1 };
  }

  // 成功摘要走 stdout（喂 AI）；注入 io 的测试路径跳过，避免污染 vitest 输出
  if (!options.io) {
    console.log('');
    console.log('=== polaris-flow ready ===');
  }

  return { warnCount, failCount, exitCode: 0 };
}
