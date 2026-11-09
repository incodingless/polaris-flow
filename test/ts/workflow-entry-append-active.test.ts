/**
 * workflow-entry append-active 的 `started_at` 缺省值测试。
 *
 * 契约：`--started-at` 缺省时写入当前本地时区 ISO（与 task-entry create 的
 * `startedAt ?? localIso()` 同约定）——技能侧因此无需再拼
 * `$(date …)`（bash 语法，Windows 原生终端不可用）。
 */
import { describe, expect, it } from 'vitest';

import { applyWorkflowOp } from '../../src/core/hooks/workflow-entry.js';

describe('append-active 的 started_at 缺省值', () => {
  it('缺省 --started-at → 写入当前本地 ISO，而非空串', () => {
    const before = Date.now() - 1000;
    const { state } = applyWorkflowOp({ requirement_tasks: [] } as never, {
      op: 'append-active',
      kind: 'requirement',
      skill: 'discovery',
      taskId: 't1',
    });
    const entry = (state as { requirement_tasks: Array<{ started_at: string }> })
      .requirement_tasks[0];
    expect(entry.started_at).not.toBe('');
    const ts = Date.parse(entry.started_at);
    expect(Number.isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it('显式 --started-at 仍然优先', () => {
    const { state } = applyWorkflowOp({ requirement_tasks: [] } as never, {
      op: 'append-active',
      kind: 'requirement',
      skill: 'discovery',
      taskId: 't1',
      startedAt: '2026-01-01T00:00:00Z',
    });
    const entry = (state as { requirement_tasks: Array<{ started_at: string }> })
      .requirement_tasks[0];
    expect(entry.started_at).toBe('2026-01-01T00:00:00Z');
  });
});
