/**
 * 时间格式化小工具：生成本地时区的 ISO 8601 时间串。
 * 替代 `new Date().toISOString()`（固定输出 UTC）——state.yaml 等供人直读的
 * 场景下，UTC 串（如 2026-11-09T06:37:48Z）会被误读成当地时间；
 * 本工具输出带时区偏移的本地时间（如 2026-11-09T14:37:48+08:00），
 * `new Date()` 仍可直接解析，排序与比较语义不变。
 */

/** 补零到两位 */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 生成本地时区 ISO 8601 时间串（秒级精度，如 2026-11-09T14:37:48+08:00）；缺省取当前时间 */
export function localIso(date: Date = new Date()): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}` +
    `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  );
}
