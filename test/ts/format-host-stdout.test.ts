/**
 * formatHostHookStdout：Claude/Cursor/Trae 宿主 stdout JSON。
 */
import { describe, expect, it } from 'vitest';

import { formatHostHookStdout } from '../../src/commands/hooks/handler/format-host-stdout.js';

describe('formatHostHookStdout', () => {
  it('Claude SessionStart → hookSpecificOutput 信封', () => {
    const raw = formatHostHookStdout('claude', 'SessionStart', {
      exitCode: 0,
      additionalContext: '=== polaris-flow ready ===',
    });
    expect(JSON.parse(raw)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: '=== polaris-flow ready ===',
      },
    });
  });

  it('Trae 与 Claude 同信封', () => {
    const raw = formatHostHookStdout('trae', 'SessionStart', {
      exitCode: 0,
      additionalContext: 'ctx',
    });
    expect(JSON.parse(raw).hookSpecificOutput.hookEventName).toBe('SessionStart');
  });

  it('Cursor SessionStart → additional_context / env（含 PLATFORM_ID）', () => {
    const raw = formatHostHookStdout('cursor', 'SessionStart', {
      exitCode: 0,
      PLATFORM_ID: 'cursor',
      additionalContext: 'hello',
      env: { POLARIS: '1' },
    });
    expect(JSON.parse(raw)).toEqual({
      additional_context: 'hello',
      env: { POLARIS: '1', PLATFORM_ID: 'cursor' },
    });
  });

  it('Claude PreToolUse permissionDecision', () => {
    const raw = formatHostHookStdout('claude', 'PreToolUse', {
      exitCode: 0,
      permissionDecision: 'deny',
      permissionDecisionReason: 'blocked',
    });
    expect(JSON.parse(raw)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'blocked',
      },
    });
  });

  it('Cursor PreToolUse continue/permission', () => {
    const raw = formatHostHookStdout('cursor', 'PreToolUse', {
      exitCode: 0,
      continue: false,
      permission: 'deny',
      userMessage: 'no',
    });
    expect(JSON.parse(raw)).toEqual({
      continue: false,
      permission: 'deny',
      user_message: 'no',
    });
  });
});
