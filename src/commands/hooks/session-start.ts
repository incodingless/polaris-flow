/**
 * SessionStart 事件实现（HostHookEventHandler）：调 core，并向 Agent 注入平台路径与 subagent 能力变量。
 *
 * 路径事实（repoRoot / platformId / pluginRoot）一律来自 `runSessionStart` 返回值，本层不拼接。
 * 能力事实由 `resolveSubagentCapability(platformId)` 得出（与 platform-probe.md 能力列同源）。
 *
 * 注入渠道：
 * - additionalContext（Claude/Trae/Cursor 均可读入会话上下文）
 * - env（Cursor sessionStart stdout）
 * - CLAUDE_ENV_FILE（若宿主设置了该路径，追加 export）
 * - `.polaris/.cache/runtime-env`（供 skill bash `set -a; source …`）
 */
import { appendFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';

import { getPolarisDir } from '../../core/assets/polaris-paths.js';
import { resolveSubagentCapability } from '../../core/domain/subagent-capability.js';
import { createHookIo, writeTtyLine } from '../../core/hooks/hook-io.js';
import { runSessionStart, type SessionStartPaths } from '../../core/hooks/session-start.js';
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
};

/**
 * 将 core 返回的路径事实映射为 Agent/shell 环境变量名，并附带平台 subagent 能力。
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
  };
}

/**
 * 生成注入 Agent 的 additionalContext 文本（路径 + 平台能力 + 跳过 probe 规则摘要）。
 */
export function formatSessionPathContext(paths: SessionRuntimePaths): string {
  return [
    '=== polaris-flow ready ===',
    'Polaris runtime paths for this session (use these absolute paths in skills/shell):',
    `REPO_ROOT=${paths.REPO_ROOT}`,
    `PLATFORM_ID=${paths.PLATFORM_ID}`,
    `CONTEXT_DIR=${paths.CONTEXT_DIR}`,
    `PLUGIN_ROOT=${paths.PLUGIN_ROOT}`,
    `SUPPORTS_SUBAGENT=${paths.SUPPORTS_SUBAGENT}`,
    `PLATFORM_DEGRADATION=${paths.PLATFORM_DEGRADATION}`,
    'Do not expand <repo_root> / <platform> placeholders; prefer $PLUGIN_ROOT / $REPO_ROOT.',
    'Subagent: if SUPPORTS_SUBAGENT=true and PLATFORM_DEGRADATION is empty and this step needs only the default general agent (no subagent_id / no task_type prefilter), orchestrators may skip subagent-probe and dispatch with agent=null; otherwise probe. inline/unsupported → degrade without probe.',
  ].join('\n');
}

/**
 * 将路径写入 `.polaris/.cache/runtime-env`（KEY=value，可 source）。
 */
async function persistRuntimeEnv(repoRoot: string, paths: SessionRuntimePaths): Promise<void> {
  const cacheDir = path.join(getPolarisDir(repoRoot), '.cache');
  await mkdir(cacheDir, { recursive: true });
  const file = path.join(cacheDir, 'runtime-env');
  const body =
    Object.entries(paths)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';
  await writeFile(file, body, 'utf-8');
  hookDebug('persisted runtime-env', { file, paths });
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
 * SessionStart：跑 core 检查，并注入 PLATFORM / PLUGIN_ROOT / REPO_ROOT。
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
    try {
      await persistRuntimeEnv(result.paths.repoRoot, envPaths);
      await appendClaudeEnvFile(envPaths);
    } catch (err) {
      hookDebug('path persistence failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      });
      io.warn('failed to persist runtime path env file — Agent context injection still applied');
    }

    const out: HostHookEventResult = {
      exitCode: result.exitCode,
      additionalContext: formatSessionPathContext(envPaths),
      env: { ...envPaths },
    };
    hookDebug('SessionStart path injection', envPaths);
    return out;
  },
};
