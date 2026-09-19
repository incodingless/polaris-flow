/**
 * `tasks.md` 复选框的**规则与编辑**。
 *
 * 单独成模块，是因为同一组「哪些行算复选框」必须被多处一致认定：
 *
 *   1. `task-state-entry set-checkbox`（**写**：按序号定位目标行）—— 本模块
 *   2. `dashboard/scan/files.ts`（**读**：算 `{ total, done }` 进度）—— 复用本模块
 *   3. 前端 `dashboard/src/utils/parseTaskMarkdown.js`（**读**：看板分组，纯 JS 无法
 *      import 本模块）—— 正则靠契约写明 + 测试对齐
 *
 * 若这三处的规则漂移，会出现「点了第 3 个任务、改的是第 4 行」这类静默错位：
 * 序号在前端算、落盘在核心层算，两边不一致时**没有任何报错**，只是结果错了。
 * 所以规则只能有一份，前端那份靠契约约束（见 `docs/specs/2026-09-18-dashboard-api-contract.md`）。
 *
 * 规则取 `^\s*- \[(.)\] `（列表项 + 方括号内任意单字符 + 一个空格）。用 `(.)` 而非
 * `[ xX]` 是为了与既有 `parseCheckboxes` 对齐 —— 勾选态一律按「非空格即已完成」判定，
 * 这样 `[X]`、`[x]`、甚至 `[/]` 都视为已完成且不会互相打架。
 */

/** 复选框行：`<缩进>- [<单字符>] ` */
export const CHECKBOX_LINE_RE = /^(\s*)- \[(.)\] /;

/** 复选框编号越界或参数非法 */
export class CheckboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckboxError';
  }
}

export type CheckboxCount = { total: number; done: number };

export type CheckboxEdit = {
  /** 编辑后的完整内容；未改动时与入参逐字节相同 */
  content: string;
  /** 是否真的改动了（已是目标值时为 false，调用方据此跳过落盘） */
  changed: boolean;
  /** 命中的复选框序号（0-based，按出现顺序） */
  ordinal: number;
  /** 命中的行号（0-based） */
  lineNo: number;
  /** 改动前的勾选态 */
  before: boolean;
  /** 改动后的勾选态 */
  after: boolean;
};

/** 统计复选框总数与已完成数；一个都没有时返回 null（UI 据此不渲染进度） */
export function countCheckboxes(content: string): CheckboxCount | null {
  let total = 0;
  let done = 0;
  for (const line of content.split('\n')) {
    const matched = line.match(CHECKBOX_LINE_RE);
    if (!matched) continue;
    total += 1;
    if (matched[2] !== ' ') {
      done += 1;
    }
  }
  return total > 0 ? { total, done } : null;
}

/**
 * 按序号设置复选框状态。
 *
 * **只替换目标行的复选框字符**，缩进、正文、行尾（含 CRLF）一律原样保留 ——
 * `tasks.md` 是人写的文件，重排会产生大段无意义 diff。
 *
 * 序号是「第几个复选框」而不是行号：行号会随标题、空行的增删而变，
 * 序号才是用户在界面上看到的「第 N 个任务」。前端 `parseTaskMarkdown` 也用同一口径。
 *
 * 已是目标值时返回 `changed: false` 且内容不变（幂等，调用方据此免去落盘）。
 */
export function applySetCheckbox(content: string, ordinal: number, checked: boolean): CheckboxEdit {
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new CheckboxError(`--index 必须是非负整数，收到 ${ordinal}`);
  }

  const lines = content.split('\n');
  let seen = -1;
  for (let i = 0; i < lines.length; i++) {
    const matched = lines[i]!.match(CHECKBOX_LINE_RE);
    if (!matched) continue;
    seen += 1;
    if (seen !== ordinal) continue;

    const before = matched[2] !== ' ';
    if (before === checked) {
      return { content, changed: false, ordinal, lineNo: i, before, after: before };
    }

    // matched[0] = 缩进 + '- [' + 原字符 + '] '；只换掉那个字符
    const headLen = matched[1]!.length + 3;
    lines[i] =
      `${lines[i]!.slice(0, headLen)}${checked ? 'x' : ' '}${lines[i]!.slice(headLen + 1)}`;
    return { content: lines.join('\n'), changed: true, ordinal, lineNo: i, before, after: checked };
  }

  throw new CheckboxError(`复选框序号越界：--index ${ordinal}，文件共 ${seen + 1} 个复选框`);
}
