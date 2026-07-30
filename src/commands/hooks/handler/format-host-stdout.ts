/**
 * 按平台把 HostHookEventResult 序列化为宿主 hook 要求的 stdout JSON。
 */
import { hookDebug } from './debug-log.js';
import type { HostHookEvent, HostHookEventResult } from './host-hook-handler.js';

/**
 * 生成写入宿主 stdout 的一整行 JSON（无尾随换行由调用方 console.log 补）。
 * platformId 未知时按 Claude/Trae 信封处理。
 */
export function formatHostHookStdout(
  platformId: string | null | undefined,
  event: HostHookEvent,
  result: HostHookEventResult,
): string {
  const id = (platformId ?? '').trim();
  const family = id === 'cursor' ? 'cursor' : 'claude-family';
  const json =
    family === 'cursor'
      ? JSON.stringify(formatCursor(event, result))
      : JSON.stringify(formatClaudeFamily(event, result));
  hookDebug('formatHostHookStdout', { platformId: id || null, family, event, json });
  return json;
}

/**
 * Claude / Trae：hookSpecificOutput 信封。
 */
function formatClaudeFamily(
  event: HostHookEvent,
  result: HostHookEventResult,
): Record<string, unknown> {
  if (event === 'SessionStart' || event === 'UserPromptSubmit' || event === 'SessionEnd') {
    return {
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext: result.additionalContext ?? '',
      },
    };
  }
  if (event === 'PreToolUse' || event === 'PostToolUse') {
    const decision = result.permissionDecision;
    const body: Record<string, unknown> = {
      hookEventName: event,
    };
    if (decision) {
      body.permissionDecision = decision;
    }
    if (result.permissionDecisionReason) {
      body.permissionDecisionReason = result.permissionDecisionReason;
    }
    if (result.additionalContext) {
      body.additionalContext = result.additionalContext;
    }
    return { hookSpecificOutput: body };
  }
  // Stop 等：最小合法 JSON，避免明文
  return {};
}

/**
 * Cursor：字段名与 Claude 不同（additional_context / continue / permission）。
 */
function formatCursor(event: HostHookEvent, result: HostHookEventResult): Record<string, unknown> {
  if (event === 'SessionStart') {
    const out: Record<string, unknown> = {};
    if (result.additionalContext !== undefined) {
      out.additional_context = result.additionalContext;
    }
    if (result.env && Object.keys(result.env).length > 0) {
      out.env = result.env;
    }
    return out;
  }
  if (event === 'PreToolUse') {
    const out: Record<string, unknown> = {
      continue: result.continue ?? true,
    };
    if (result.permission) {
      out.permission = result.permission;
    }
    if (result.userMessage) {
      out.user_message = result.userMessage;
    }
    return out;
  }
  if (event === 'UserPromptSubmit') {
    return {
      continue: result.continue ?? true,
      ...(result.additionalContext ? { additional_context: result.additionalContext } : {}),
    };
  }
  if (event === 'Stop') {
    return {};
  }
  return result.additionalContext ? { additional_context: result.additionalContext } : {};
}
