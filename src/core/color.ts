/**
 * Minimal ANSI color helpers — no external dependencies.
 * Detects color support and gracefully degrades on dumb terminals.
 */

const isColorSupported =
  process.env.FORCE_COLOR !== '0' &&
  process.env.NO_COLOR === undefined &&
  process.stdout.isTTY !== false;

function wrap(code: number) {
  return (text: string): string => (isColorSupported ? `\x1b[${code}m${text}\x1b[0m` : text);
}

export const bold = wrap(1);
export const dim = wrap(2);
export const italic = wrap(3);
export const underline = wrap(4);
export const cyan = wrap(36);
export const green = wrap(32);
export const yellow = wrap(33);
export const red = wrap(31);
export const magenta = wrap(35);
export const blue = wrap(34);
export const gray = wrap(90);
export const white = wrap(37);

/** Calculate visible width of a string (excluding ANSI escape sequences). */
export function visibleWidth(str: string): number {
  // Strip ANSI escape sequences for width calculation
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** Pad a string on the right to a given visible width. */
export function padRight(str: string, width: number): string {
  const visible = visibleWidth(str);
  return str + ' '.repeat(Math.max(0, width - visible));
}

/** Box-drawing characters for card-style output. */
export const box = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  lb: '├', rb: '┤',
};

/** Draw a box around text content. Width is the visible content width. */
export function drawBox(lines: string[], contentWidth: number): string {
  const top = `  ${box.tl}${box.h.repeat(contentWidth + 2)}${box.tr}`;
  const bottom = `  ${box.bl}${box.h.repeat(contentWidth + 2)}${box.br}`;
  const middle = lines.map(l => {
    return `  ${box.v} ${padRight(l, contentWidth)} ${box.v}`;
  });
  return [top, ...middle, bottom].join('\n');
}

