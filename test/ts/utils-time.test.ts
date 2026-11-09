/**
 * localIso 时间格式化工具测试：本地时区 ISO 8601 输出与可解析性。
 */
import { describe, expect, it } from 'vitest';

import { localIso } from '../../src/utils/time.js';

/** 构造固定 UTC 时刻，便于断言换算结果 */
function utcDate(iso: string): Date {
  return new Date(iso);
}

describe('localIso', () => {
  it('输出带时区偏移的本地时间串（格式 YYYY-MM-DDTHH:mm:ss±HH:MM）', () => {
    const out = localIso(utcDate('2026-11-09T06:37:48Z'));
    // 与系统时区无关的通用断言：整体形状 + 偏移形如 ±HH:MM
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('本地时间字段与输入时刻一致（按系统偏移换算）', () => {
    const date = utcDate('2026-11-09T06:37:48Z');
    const out = localIso(date);
    const roundTrip = new Date(out);
    // 去掉毫秒的语义：解析回来的时刻与输入差应 < 1s
    expect(Math.abs(roundTrip.getTime() - date.getTime())).toBeLessThan(1000);
  });

  it('偏移量与系统时区一致', () => {
    const date = utcDate('2026-01-01T00:00:00Z');
    const out = localIso(date);
    const offsetMin = -date.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const expected = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
    expect(out.slice(-6)).toBe(expected);
  });

  it('UTC+8 下 06:37:48Z 输出 14:37:48+08:00', () => {
    // 仅当运行环境时区为 Asia/Shanghai（GMT+8）时执行
    if (new Date().getTimezoneOffset() !== -480) return;
    const out = localIso(utcDate('2026-11-09T06:37:48Z'));
    expect(out).toBe('2026-11-09T14:37:48+08:00');
  });

  it('缺省参数取当前时间且可被 new Date() 解析', () => {
    const before = Date.now();
    const out = localIso();
    const after = Date.now();
    const parsed = new Date(out).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });
});
