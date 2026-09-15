/**
 * SessionStart 事件实现（HostHookEventHandler）：调 core，并向 Agent 注入平台路径、
 * subagent 能力变量，以及 SessionStart 扫描得到的 probe 缓存路径。
 *
 * 路径事实（repoRoot / platformId / pluginRoot）一律来自 `runSessionStart` 返回值，本层不拼接。
 * 能力与 agents 快照由 `buildSubagentProbeSnapshot` 写出（与 platform-probe.md / subagent-probe 同源）。
 *
 * 注入渠道：
 * - additionalContext（Claude/Trae/Cursor 均可读入会话上下文）
 * - env（Cursor sessionStart stdout）
 * - CLAUDE_ENV_FILE（若宿主设置了该路径，追加 export）
 * - `.polaris/.cache/runtime-env`（供 skill bash `set -a; source …`）
 * - `.polaris/.cache/subagent-probe.json`（完整 probe 形快照，不塞进 additionalContext）
 */
import { appendFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';

import {
  getPolarisCacheDir,
  getSubagentProbeCachePath,
} from '../../core/assets/polaris-paths.js';
import { resolveSubagentCapability } from '../../core/domain/platforms.js';
import { createHookIo, writeTtyLine } from '../../core/hooks/hook-io.js';
import { runSessionStart, type SessionStartPaths } from '../../core/hooks/session-start.js';
import {
  buildSubagentProbeSnapshot,
  type SubagentProbeSnapshot,
} from '../../core/subagent/scan-agents.js';
import { hookDebug } from './handler/debug-log.js';
import type { HostHookEventHandler, HostHookEventResult } from './handler/host-hook-handler.js';

/** SessionStart 注入给 Agent / shell 的路径与平台能力环境 */
export type SessionRuntimePaths = {
  REPO_ROOT: string;
  CONTEXT_DIR: string;
  PLATFORM_ID: string;
  /** 与 skill 文档中的 PLUGIN_ROOT 对齐 */
  PLUGIN_ROOT: string;
  /** 平台是否支持 subagent（'true' | 'false'） */
  SUPPORTS_SUBAGENT: 'true' | 'false';
  /** 空串 = probe 语义 null；否则 inline | unsupported */
  PLATFORM_DEGRADATION: '' | 'inline' | 'unsupported';
  /** SessionStart 写入的 probe 快照绝对路径 */
  SUBAGENT_PROBE_CACHE: string;
};

/** formatSessionPathContext 可选摘要（agents 数量与 id 列表） */
export type SessionPathContextExtras = {
  agentsCount: number;
  agentIds: string[];
};

/**
 * 将 core 返回的路径事实映射为 Agent/shell 环境变量名，并附带平台 subagent 能力与缓存路径。
 */
export function toSessionRuntimeEnv(paths: SessionStartPaths): SessionRuntimePaths {
  const cap = resolveSubagentCapability(paths.platformId);
  return {
    REPO_ROOT: paths.repoRoot,
    CONTEXT_DIR: paths.contextDir,
    PLATFORM_ID: paths.platformId,
    PLUGIN_ROOT: paths.pluginRoot,
    SUPPORTS_SUBAGENT: cap.supportsSubagent ? 'true' : 'false',
    PLATFORM_DEGRADATION: cap.platformDegradation ?? '',
    SUBAGENT_PROBE_CACHE: getSubagentProbeCachePath(paths.repoRoot),
  };
}

/**
 * 生成注入 Agent 的 additionalContext 文本（路径 + 能力 + 缓存路径摘要，不含全量 agents）。
 */
export function formatSessionPathContext(
  paths: SessionRuntimePaths,
  extras?: SessionPathContextExtras,
): string {
  const count = extras?.agentsCount ?? 0;
  const ids = (extras?.agentIds ?? []).join(',') || '(none)';
  return [
    '=== polaris-flow ready ===',
    'Polaris runtime paths for this session (use these absolute paths in skills/shell):',
    `REPO_ROOT=${paths.REPO_ROOT}`,
    `PLATFORM_ID=${paths.PLATFORM_ID}`,
    `CONTEXT_DIR=${paths.CONTEXT_DIR}`,
    `PLUGIN_ROOT=${paths.PLUGIN_ROOT}`,
    `SUPPORTS_SUBAGENT=${paths.SUPPORTS_SUBAGENT}`,
    `PLATFORM_DEGRADATION=${paths.PLATFORM_DEGRADATION}`,
    `SUBAGENT_PROBE_CACHE=${paths.SUBAGENT_PROBE_CACHE}`,
    `subagent_agents_summary=count=${count}; ids=${ids}`,
    'Do not expand <repo_root> / <platform> placeholders; prefer $PLUGIN_ROOT / $REPO_ROOT.',
    'Subagent: full agents list is in SUBAGENT_PROBE_CACHE (JSON). subagent-probe should prefer that cache when PLATFORM_ID matches, then apply task_type/subagent_id filters. If SUPPORTS_SUBAGENT=true and PLATFORM_DEGRADATION is empty and this step needs only the default general agent (no subagent_id / no task_type prefilter), orchestrators may skip subagent-probe and dispatch with agent=null. inline/unsupported → degrade without probe.',
  ].join('\n');
}

/**
 * 将路径写入 `.polaris/.cache/runtime-env`（KEY=value，可 source）。
 */
async function persistRuntimeEnv(repoRoot: string, paths: SessionRuntimePaths): Promise<void> {
  await mkdir(getPolarisCacheDir(repoRoot), { recursive: true });
  const file = path.join(getPolarisCacheDir(repoRoot), 'runtime-env');
  const body =
    Object.entries(paths)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';
  await writeFile(file, body, 'utf-8');
  hookDebug('persisted runtime-env', { file, paths });
}

/**
 * 将 probe 形快照写入 `.polaris/.cache/subagent-probe.json`。
 */
export async function persistSubagentProbeCache(
  repoRoot: string,
  snapshot: SubagentProbeSnapshot,
): Promise<string> {
  await mkdir(getPolarisCacheDir(repoRoot), { recursive: true });
  const file = getSubagentProbeCachePath(repoRoot);
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
  hookDebug('persisted subagent-probe cache', {
    file,
    agents: snapshot.agents.length,
    reason: snapshot.reason,
  });
  return file;
}

/**
 * 扫描并落盘；失败时写空 agents + reason=scan_failed，避免编排读到陈旧缓存。
 */
export async function writeSessionSubagentProbeCache(
  repoRoot: string,
  platformId: string,
): Promise<SubagentProbeSnapshot> {
  try {
    const snapshot = await buildSubagentProbeSnapshot(repoRoot, platformId);
    await persistSubagentProbeCache(repoRoot, snapshot);
    return snapshot;
  } catch (err) {
    hookDebug('subagent scan failed; writing empty snapshot', {
      error: err instanceof Error ? err.message : String(err),
    });
    const failed = await buildSubagentProbeSnapshot(repoRoot, platformId, {
      agents: [],
      reason: 'scan_failed',
    });
    await persistSubagentProbeCache(repoRoot, failed);
    return failed;
  }
}

/**
 * 若存在 CLAUDE_ENV_FILE，追加 export（Claude Code SessionStart 约定）。
 */
async function appendClaudeEnvFile(paths: SessionRuntimePaths): Promise<void> {
  const envFile = process.env.CLAUDE_ENV_FILE?.trim();
  if (!envFile) return;
  const lines =
    Object.entries(paths)
      .map(([k, v]) => `export ${k}=${JSON.stringify(v)}`)
      .join('\n') + '\n';
  await appendFile(envFile, lines, 'utf-8');
  hookDebug('appended CLAUDE_ENV_FILE', { envFile });
}

/**
 * SessionStart：跑 core 检查，注入路径/能力，并扫描 agents 落盘缓存。
 * 即使仅有 WARN（exitCode=1）也注入路径，便于会话继续跑 skill。
 */
export const sessionStartEventHandler: HostHookEventHandler<'SessionStart'> = {
  event: 'SessionStart',
  async handle(payload, ctx) {
    const resolved = path.resolve(ctx.projectPath || payload.cwd || process.cwd());
    const io = createHookIo({
      stdout: (line) => writeTtyLine(line),
    });
    const result = await runSessionStart({
      projectPath: resolved,
      platformId: ctx.resolvedPlatformId ?? undefined,
      sessionId: payload.session_id,
      io,
    });

    if (!result.paths) {
      hookDebug('skip path injection: runSessionStart did not return paths');
      return { exitCode: result.exitCode };
    }

    const envPaths = toSessionRuntimeEnv(result.paths);
    let snapshot: SubagentProbeSnapshot | undefined;
    try {
      snapshot = await writeSessionSubagentProbeCache(
        result.paths.repoRoot,
        result.paths.platformId,
      );
      await persistRuntimeEnv(result.paths.repoRoot, envPaths);
      await appendClaudeEnvFile(envPaths);
    } catch (err) {
      hookDebug('path persistence failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      });
      io.warn('failed to persist runtime path env file — Agent context injection still applied');
    }

    if (snapshot?.reason === 'scan_failed') {
      io.warn('subagent agent scan failed — wrote empty SUBAGENT_PROBE_CACHE (reason=scan_failed)');
    }

    const extras: SessionPathContextExtras | undefined = snapshot
      ? {
          agentsCount: snapshot.agents.length,
          agentIds: snapshot.agents.map((a) => a.id),
        }
      : undefined;

    const out: HostHookEventResult = {
      exitCode: result.exitCode,
      additionalContext: formatSessionPathContext(envPaths, extras),
      env: { ...envPaths },
    };
    hookDebug('SessionStart path injection', envPaths);
    return out;
  },
};
