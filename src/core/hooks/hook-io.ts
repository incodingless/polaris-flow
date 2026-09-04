/**
 * SessionStart 等 hook 的输出通道辅助。
 * 成功摘要走 stdout（喂 AI）；WARN/FAIL/HINT 优先写 /dev/tty（人可见），无 TTY 时回退 stderr。
 */
import fs from 'fs';

/** 可注入的行写入器，便于单测 */
export type LineWriter = (line: string) => void;

export type HookIo = {
  /** 成功摘要 → stdout */
  ok: (message: string) => void;
  /** 告警 → TTY / stderr */
  warn: (message: string) => void;
  /** 失败 → TTY / stderr */
  fail: (message: string) => void;
  /** 提示行（缩进对齐）→ TTY / stderr */
  hint: (message: string) => void;
  /** 任意面向人的行 → TTY / stderr */
  tty: (message: string) => void;
};

/**
 * 尝试向控制终端写一行；失败则回退到 stderr。
 */
export function writeTtyLine(line: string, fallback: LineWriter = console.error): void {
  try {
    fs.writeFileSync('/dev/tty', `${line}\n`, { encoding: 'utf-8' });
  } catch {
    fallback(line);
  }
}

/**
 * 创建 hook 输出辅助集；可注入 writers 便于测试。
 */
export function createHookIo(options?: { stdout?: LineWriter; tty?: LineWriter }): HookIo {
  const stdout: LineWriter = options?.stdout ?? ((line) => console.log(line));
  const tty: LineWriter = options?.tty ?? ((line) => writeTtyLine(line, (l) => console.error(l)));

  return {
    ok: (message) => stdout(`[OK] ${message}`),
    warn: (message) => tty(`[polaris-flow][WARN] ${message}`),
    fail: (message) => tty(`[polaris-flow][FAIL] ${message}`),
    hint: (message) => tty(`                  ${message}`),
    tty: (message) => tty(message),
  };
}
