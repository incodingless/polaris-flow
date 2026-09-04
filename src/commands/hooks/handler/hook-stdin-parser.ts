/**
 * 命令层：宿主 hook stdin JSON 归一（Claude/Cursor/Trae 字段别名 + 事件判别联合）。
 * 平台协议差异在此消化，core 只接收已归一字段。
 */
import { hookDebug } from './debug-log.js';

export type HookStdinCommon = {
  cwd?: string;
  session_id?: string;
  hook_event_name?: string;
  workspace_roots?: string[];
  raw: Record<string, unknown>;
};

export type HookStdinPayload =
  | (HookStdinCommon & { event: 'SessionStart'; source?: string; model?: string })
  | (HookStdinCommon & { event: 'SessionEnd'; reason?: string })
  | (HookStdinCommon & {
      event: 'PreToolUse';
      tool_name?: string;
      tool_input?: unknown;
      tool_use_id?: string;
    })
  | (HookStdinCommon & {
      event: 'PostToolUse';
      tool_name?: string;
      tool_input?: unknown;
      tool_response?: unknown;
      tool_use_id?: string;
    })
  | (HookStdinCommon & { event: 'Stop' })
  | (HookStdinCommon & { event: 'UserPromptSubmit'; prompt?: string })
  | (HookStdinCommon & { event: 'Unknown' });

const EVENT_ALIASES: Record<string, Exclude<HookStdinPayload['event'], 'Unknown'>> = {
  SessionStart: 'SessionStart',
  sessionStart: 'SessionStart',
  SessionEnd: 'SessionEnd',
  sessionEnd: 'SessionEnd',
  PreToolUse: 'PreToolUse',
  preToolUse: 'PreToolUse',
  PostToolUse: 'PostToolUse',
  postToolUse: 'PostToolUse',
  Stop: 'Stop',
  stop: 'Stop',
  UserPromptSubmit: 'UserPromptSubmit',
  beforeSubmitPrompt: 'UserPromptSubmit',
};

/**
 * 将宿主 hook_event_name 映射为内部事件名。
 */
function mapEventName(raw?: string): HookStdinPayload['event'] {
  if (!raw) return 'Unknown';
  return EVENT_ALIASES[raw] ?? 'Unknown';
}

/**
 * 提取 string 字段。
 */
function str(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * 从原始对象提取公共字段。
 */
function extractCommon(obj: Record<string, unknown>): HookStdinCommon {
  const roots = Array.isArray(obj.workspace_roots)
    ? obj.workspace_roots.filter((x): x is string => typeof x === 'string')
    : undefined;
  const cwd = str(obj, 'cwd') ?? (roots && roots.length > 0 ? roots[0] : undefined);
  const session_id = str(obj, 'session_id') ?? str(obj, 'sessionId') ?? str(obj, 'conversation_id');
  return {
    cwd,
    session_id,
    hook_event_name: str(obj, 'hook_event_name'),
    workspace_roots: roots,
    raw: obj,
  };
}

/**
 * 解析宿主 hook stdin JSON 文本为判别联合。
 * 非法 / 空 / 非 object → `{ event: 'Unknown', raw: {} }`。
 */
export function parseHookStdinJson(text: string): HookStdinPayload {
  if (!text.trim()) {
    hookDebug('parseHookStdinJson: empty text → Unknown');
    return { event: 'Unknown', raw: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    hookDebug('parseHookStdinJson: JSON.parse failed → Unknown', {
      error: err instanceof Error ? err.message : String(err),
      preview: text.slice(0, 200),
    });
    return { event: 'Unknown', raw: {} };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    hookDebug('parseHookStdinJson: non-object → Unknown');
    return { event: 'Unknown', raw: {} };
  }
  const obj = parsed as Record<string, unknown>;
  const common = extractCommon(obj);
  const event = mapEventName(common.hook_event_name);
  hookDebug('parseHookStdinJson: mapped', {
    hook_event_name: common.hook_event_name,
    event,
    cwd: common.cwd,
    session_id: common.session_id,
  });

  switch (event) {
    case 'SessionStart':
      return { ...common, event, source: str(obj, 'source'), model: str(obj, 'model') };
    case 'SessionEnd':
      return { ...common, event, reason: str(obj, 'reason') };
    case 'PreToolUse':
      return {
        ...common,
        event,
        tool_name: str(obj, 'tool_name'),
        tool_input: obj.tool_input,
        tool_use_id: str(obj, 'tool_use_id'),
      };
    case 'PostToolUse':
      return {
        ...common,
        event,
        tool_name: str(obj, 'tool_name'),
        tool_input: obj.tool_input,
        tool_response: obj.tool_response,
        tool_use_id: str(obj, 'tool_use_id'),
      };
    case 'Stop':
      return { ...common, event };
    case 'UserPromptSubmit':
      return { ...common, event, prompt: str(obj, 'prompt') };
    default:
      return { ...common, event: 'Unknown' };
  }
}
