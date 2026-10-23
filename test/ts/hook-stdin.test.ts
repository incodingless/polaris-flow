/**
 * parseHookStdinJson：三平台 stdin 归一与事件判别联合。
 */
import { describe, expect, it } from 'vitest';

import { parseHookStdinJson } from '../../src/commands/hooks/handler/hook-stdin-parser.js';

describe('parseHookStdinJson', () => {
  it('Claude SessionStart', () => {
    const p = parseHookStdinJson(
      JSON.stringify({
        session_id: 's1',
        cwd: '/tmp/a',
        hook_event_name: 'SessionStart',
        source: 'startup',
        model: 'claude',
      }),
    );
    expect(p.event).toBe('SessionStart');
    if (p.event !== 'SessionStart') throw new Error('narrow');
    expect(p.session_id).toBe('s1');
    expect(p.cwd).toBe('/tmp/a');
    expect(p.source).toBe('startup');
    expect(p.model).toBe('claude');
  });

  it('Trae 保留 workspace_roots', () => {
    const p = parseHookStdinJson(
      JSON.stringify({
        session_id: 't1',
        cwd: '/ws',
        hook_event_name: 'PreToolUse',
        workspace_roots: ['/ws', '/other'],
      }),
    );
    expect(p.event).toBe('PreToolUse');
    expect(p.workspace_roots).toEqual(['/ws', '/other']);
    expect(p.cwd).toBe('/ws');
  });

  it('Cursor sessionStart：conversation_id + workspace_roots', () => {
    const p = parseHookStdinJson(
      JSON.stringify({
        conversation_id: 'c1',
        hook_event_name: 'sessionStart',
        workspace_roots: ['/cursor/proj'],
      }),
    );
    expect(p.event).toBe('SessionStart');
    expect(p.session_id).toBe('c1');
    expect(p.cwd).toBe('/cursor/proj');
  });

  it('Cursor beforeSubmitPrompt → UserPromptSubmit', () => {
    const p = parseHookStdinJson(
      JSON.stringify({
        hook_event_name: 'beforeSubmitPrompt',
        prompt: 'hello',
        workspace_roots: ['/p'],
      }),
    );
    expect(p.event).toBe('UserPromptSubmit');
    if (p.event !== 'UserPromptSubmit') throw new Error('narrow');
    expect(p.prompt).toBe('hello');
  });

  it('Claude PreToolUse tool 字段', () => {
    const p = parseHookStdinJson(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_use_id: 'u1',
        cwd: '/x',
      }),
    );
    expect(p.event).toBe('PreToolUse');
    if (p.event !== 'PreToolUse') throw new Error('narrow');
    expect(p.tool_name).toBe('Bash');
    expect(p.tool_input).toEqual({ command: 'ls' });
    expect(p.tool_use_id).toBe('u1');
  });

  it('非法 JSON → Unknown', () => {
    const p = parseHookStdinJson('not-json');
    expect(p.event).toBe('Unknown');
    expect(p.raw).toEqual({});
  });

  it('空串 → Unknown', () => {
    expect(parseHookStdinJson('').event).toBe('Unknown');
  });
});
