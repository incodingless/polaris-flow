#!/usr/bin/env node
/**
 * verify.mjs — 高保真 HTML 原型的运行时验证器
 *
 * 本脚本是 references/04-delivery-quality-review.md §27.1「原型运行时验证 · 三层法」的
 * 可执行实现。三层法的规格仍写在 §27.1，本脚本负责把规格变成退出码。
 *
 *   第一层｜静态检查          纯文本分析，无需浏览器
 *   第二层｜无头浏览器逐页冒烟  需要 Chrome / Edge / Chromium
 *   第三层｜黄金流链路 + 三档分辨率实测  需要浏览器（黄金流需 --flow 定义）
 *
 * 用法：
 *   node scripts/verify.mjs <原型.html> [选项]
 *
 * 选项：
 *   --layer=1,2,3          只跑指定层，默认 1,2,3
 *   --sizes=1366x768,1440x900,1920x1080
 *                          第三层分辨率档位
 *   --browser=<path>       指定浏览器可执行文件（也可用环境变量 PROTO_BROWSER）
 *   --flow=<file.json>     黄金任务流步骤定义，不给则第三层只做分辨率实测
 *   --blocklist=<file>     每行一个禁止出现的真实姓名 / 内部项目名（# 开头为注释）
 *   --contrast-min=4.5     文本 Token 对白底的最低对比度（references/02 §14.3）
 *   --small-font-ratio=5   font-size ≤12px 出现次数达到该值即视为「大面积小字」
 *   --no-pii               跳过去个人化扫描（§27.3）
 *   --timeout=30000        单次浏览器调用超时（毫秒）
 *   --strict               必需的层被跳过（无浏览器 / 无 --flow）时以退出码 3 结束
 *   --json=<out.json>      额外输出机器可读报告
 *   --quiet                只输出结论行与失败项
 *   --print-flow-example   打印 --flow 文件的 JSON 模板后退出
 *   --help
 *
 * 退出码：
 *   0  通过（可能有 WARN 级提醒）
 *   1  存在 HARD 级失败项
 *   2  用法错误 / 文件不存在 / 浏览器调用失败
 *   3  --strict 下必需的层被跳过
 *
 * 关于「验证方法自身的坑」（§27.1 表格）：本脚本已内建规避——
 *   · 每轮修改后重新抽取 <script> 做语法校验，不看替换成功数；
 *   · 断言结果写入带 id 的渲染锚点 <pre id="__pvResult">，按元素提取，不做全文正则；
 *   · 探针与原型同文档执行（注入同一份文件的副本），不走 iframe，绕开 file:// 跨 frame 限制；
 *   · 断言只用元素存在性 / 稳定子串，不匹配含动态单号、金额的整句；
 *   · 浏览器调用统一带 --virtual-time-budget，断言不等渲染完成的问题由虚拟时间兜住。
 *
 * 设计约束：零外部依赖（仅 Node 内置模块）；探针注入副本写在原型同目录并在结束后删除，
 * 以保证相对路径资源仍可解析。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// ────────────────────────────────────────────────────────────────
// 常量与配置
// ────────────────────────────────────────────────────────────────

const HARD = 'HARD';
const WARN = 'WARN';

/** 参与「开闭数量一致」校验的容器标签（§27.1 第一层）。void 元素（br/img/input…）不在此列：
 *  它们没有闭标签，也不影响容器配平，靠 TAG_RE 的 selfClose 分支自然跳过。 */
const CONTAINER_TAGS = new Set([
  'div', 'span', 'section', 'main', 'header', 'footer', 'aside', 'nav',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup',
  'form', 'fieldset', 'legend', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'select', 'optgroup', 'option', 'button', 'textarea', 'label',
  'figure', 'figcaption', 'article', 'details', 'summary', 'dialog',
  'template', 'picture', 'video', 'audio', 'canvas', 'iframe', 'object',
  'svg', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'code', 'pre', 'blockquote',
]);

/** 可被隐式闭合的标签：栈校验时允许自动闭合，避免误报 */
const IMPLICIT_CLOSE = {
  li: new Set(['li']),
  p: new Set(['p', 'div', 'section', 'ul', 'ol', 'table', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer']),
  td: new Set(['td', 'th', 'tr']),
  th: new Set(['td', 'th', 'tr']),
  tr: new Set(['tr', 'tbody', 'thead', 'tfoot']),
  option: new Set(['option', 'optgroup']),
  dt: new Set(['dt', 'dd']),
  dd: new Set(['dt', 'dd']),
  thead: new Set(['tbody', 'tfoot']),
  tbody: new Set(['tbody', 'tfoot']),
};

/** 充当界面图标的裸字符（§34 第 27 条 / §33.6 Windows 兼容） */
const CHAR_ICONS = ['▶', '◀', '►', '◄', '▲', '▼', '◆', '◇', '●', '○', '■', '□',
  '★', '☆', '✓', '✔', '✗', '✘', '›', '‹', '→', '←', '↑', '↓', '⇒', '⇔', '※',
  '☰', '✚', '✖', '⌂', '⟳', '⌄', '⌃'];

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;

/** 交互语境：图标字符出现在这些位置才算「充当界面图标」 */
const ICON_CONTEXT_TAGS = new Set(['button', 'a', 'label', 'option', 'summary']);
const ICON_CONTEXT_ATTR = /class\s*=\s*["'][^"']*(icon|btn|tab|nav|action|toolbar|menu|switch|step|badge|chip|tag)[^"']*["']/i;

const DEFAULT_SIZES = ['1366x768', '1440x900', '1920x1080'];
/**
 * 删除临时文件失败**不应**让验证崩掉——清理只是副作用，不是判据。
 * 有些环境给 fs 删除加了守卫（批量删除确认、回收站机制），
 * 直接 rmSync 抛错会把「验证失败」变成「脚本崩了」，让人误以为是原型的问题。
 */
function safeRemove(target, opts) {
  try { fs.rmSync(target, opts); return true; } catch (e) { return false; }
}

/** 页面有效内容长度阈值：低于 HARD 视为空白壳，低于 SOFT 提醒内容偏少 */
const PAGE_CONTENT_HARD = 12;
const PAGE_CONTENT_SOFT = 60;

const USAGE = `
用法：node scripts/verify.mjs <原型.html> [选项]

  --layer=1,2,3          只跑指定层（默认 1,2,3）
  --sizes=1366x768,...   第三层分辨率档位（默认 1366x768,1440x900,1920x1080）
  --browser=<path>       浏览器可执行文件（或环境变量 PROTO_BROWSER）
  --flow=<file.json>     黄金任务流步骤定义
  --blocklist=<file>     每行一个禁止出现的真实姓名 / 内部项目名
  --contrast-min=4.5     文本 Token 对白底最低对比度
  --small-font-ratio=5   ≤12px 字号出现多少次算「大面积小字」
  --no-pii               跳过去个人化扫描
  --timeout=30000        单次浏览器调用超时（毫秒）
  --strict               必需层被跳过时以退出码 3 结束
  --json=<out.json>      输出机器可读报告
  --quiet                只输出结论行与失败项
  --print-flow-example   打印 --flow 文件的 JSON 模板
  --help

退出码：0 通过 · 1 有 HARD 失败 · 2 用法/环境错误 · 3 --strict 下必需层被跳过
`.trim();

// ────────────────────────────────────────────────────────────────
// 命令行解析
// ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    target: null,
    layers: [1, 2, 3],
    sizes: DEFAULT_SIZES.slice(),
    browser: process.env.PROTO_BROWSER || null,
    flow: null,
    blocklist: null,
    contrastMin: 4.5,
    smallFontRatio: 5,
    pii: true,
    timeout: 30000,
    strict: false,
    json: null,
    quiet: false,
  };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--print-flow-example') return { printFlow: true };
    if (arg === '--quiet') { opts.quiet = true; continue; }
    if (arg === '--strict') { opts.strict = true; continue; }
    if (arg === '--no-pii') { opts.pii = false; continue; }
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (!m) {
      if (!opts.target) { opts.target = arg; continue; }
      throw new UsageError(`无法识别的参数：${arg}`);
    }
    const [, key, value] = m;
    switch (key) {
      case 'layer':
        opts.layers = String(value || '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 3);
        if (!opts.layers.length) throw new UsageError('--layer 取值为 1/2/3 的逗号列表');
        break;
      case 'sizes':
        opts.sizes = String(value || '').split(',').map((s) => s.trim()).filter((s) => /^\d+x\d+$/.test(s));
        if (!opts.sizes.length) throw new UsageError('--sizes 形如 1366x768,1440x900');
        break;
      case 'browser': opts.browser = value; break;
      case 'flow': opts.flow = value; break;
      case 'blocklist': opts.blocklist = value; break;
      case 'json': opts.json = value; break;
      case 'contrast-min': opts.contrastMin = parseFloat(value); break;
      case 'small-font-ratio': opts.smallFontRatio = parseInt(value, 10); break;
      case 'timeout': opts.timeout = parseInt(value, 10); break;
      default: throw new UsageError(`无法识别的参数：--${key}`);
    }
  }
  return opts;
}

class UsageError extends Error {}

const FLOW_EXAMPLE = {
  name: '黄金任务流：工作台 → 新建任务 → 提交成功',
  size: '1440x900',
  steps: [
    { page: 'workbench' },
    { click: '[data-goto="task-create"]' },
    { expectSelector: '#task-create-form' },
    { click: '#btn-submit' },
    { expect: '提交成功' },
    { expectText: '待审批' },
  ],
  _说明: [
    'page          : 通过 window.goto/showPage 或 [data-goto=] 激活该页面',
    'click         : document.querySelector(选择器).click()',
    'expect        : 页面可见文本中必须出现该子串（用稳定子串，不要写含动态单号/金额的整句）',
    'expectText    : 同 expect',
    'expectSelector: 选择器必须能查到元素',
    'in            : 可选的收敛范围，expect 在该选择器内查找',
    'wait          : 【不支持】链路的所有断言在同一帧内执行，wait 不会真正等待。'
      + '需要断言的中间状态必须做成同步可达（如点「保存」同步渲染结果页），'
      + '靠 setTimeout 推进的过程态无法被链路断言——写了 wait 会直接判为失败，不会静默通过。',
    'note          : 仅作注释，不参与断言',
  ],
};

// ────────────────────────────────────────────────────────────────
// 小工具
// ────────────────────────────────────────────────────────────────

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0; let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

function unescapeEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function snippet(s, at, radius = 40) {
  const from = Math.max(0, at - radius);
  const to = Math.min(s.length, at + radius);
  return `${from > 0 ? '…' : ''}${s.slice(from, to).replace(/\s+/g, ' ').trim()}${to < s.length ? '…' : ''}`;
}

// ────────────────────────────────────────────────────────────────
// HTML 分词器：一次扫描，产出标签 / 文本 / 原始块三类 token
// ────────────────────────────────────────────────────────────────

const TAG_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>|<([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const RAW_TAGS = new Set(['script', 'style', 'textarea', 'title']);

function tokenize(html) {
  const tags = [];
  const texts = [];
  const raws = [];   // {tag, attrs, content, start}
  let cursor = 0;
  TAG_RE.lastIndex = 0;
  let m;

  while ((m = TAG_RE.exec(html)) !== null) {
    const [full, closeName, openName, attrs, selfClose] = m;
    const start = m.index;

    if (cursor < start) texts.push({ start: cursor, end: start, text: html.slice(cursor, start) });

    if (full.startsWith('<!--') || full.startsWith('<!')) {
      // 注释 / doctype：不产出标签 token
    } else if (closeName) {
      tags.push({ kind: 'close', name: closeName.toLowerCase(), attrs: '', start, line: 0 });
    } else if (openName) {
      const name = openName.toLowerCase();
      tags.push({ kind: 'open', name, attrs, selfClose: selfClose === '/', start, line: 0 });

      if (RAW_TAGS.has(name) && selfClose !== '/') {
        const closeRe = new RegExp(`</${name}\\s*>`, 'ig');
        closeRe.lastIndex = TAG_RE.lastIndex;
        const cm = closeRe.exec(html);
        const contentEnd = cm ? cm.index : html.length;
        const content = html.slice(TAG_RE.lastIndex, contentEnd);
        const tag = tags[tags.length - 1];
        tag.contentStart = TAG_RE.lastIndex;
        tag.contentEnd = contentEnd;
        raws.push({ tag, attrs, content, start: TAG_RE.lastIndex });
        texts.push({ start: TAG_RE.lastIndex, end: contentEnd, text: content, rawOf: name });
        cursor = contentEnd;
        TAG_RE.lastIndex = contentEnd;
      }
    }
    cursor = Math.max(cursor, TAG_RE.lastIndex);
  }
  if (cursor < html.length) texts.push({ start: cursor, end: html.length, text: html.slice(cursor) });

  const lineOf = lineIndex(html);
  for (const t of tags) t.line = lineOf(t.start);
  for (const t of texts) t.line = lineOf(t.start);
  return { tags, texts, raws, lineOf };
}

function pickAttr(attrs, name) {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs || '');
  if (!m) return null;
  return m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
}

// ────────────────────────────────────────────────────────────────
// 颜色与对比度（references/02 §14.3）
// ────────────────────────────────────────────────────────────────

function parseColor(value) {
  const v = String(value || '').trim();
  let m = /^#([0-9a-fA-F]{3,8})$/.exec(v);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1 };
    }
  }
  return null;
}

function relLuminance({ r, g, b }) {
  const f = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(fg, bg) {
  const l1 = relLuminance(fg);
  const l2 = relLuminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function compositeOver(color, base) {
  const a = color.a === undefined ? 1 : color.a;
  return {
    r: color.r * a + base.r * (1 - a),
    g: color.g * a + base.g * (1 - a),
    b: color.b * a + base.b * (1 - a),
    a: 1,
  };
}

// ────────────────────────────────────────────────────────────────
// 第一层：静态检查
// ────────────────────────────────────────────────────────────────

function layer1(html, doc, opts) {
  const findings = [];
  const add = (severity, id, title, detail, extra) => findings.push({ layer: 1, severity, id, title, detail, ...extra });

  // ── 1. JS 语法校验（逐 <script> 抽出去 node --check） ──────────
  const scriptBlocks = doc.raws.filter((r) => r.tag.name === 'script');
  let checked = 0;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proto-verify-'));
  try {
    scriptBlocks.forEach((block, i) => {
      const type = (pickAttr(block.attrs, 'type') || '').toLowerCase().trim();
      if (pickAttr(block.attrs, 'src')) return; // 外链脚本不在此校验
      if (type && !['text/javascript', 'application/javascript', 'module', 'text/babel'].includes(type)) return;
      const code = block.content;
      if (!code.trim()) return;
      const isModule = type === 'module' || /(^|\n)\s*(import|export)\s/.test(code);
      const file = path.join(tmpDir, `block-${i}.${isModule ? 'mjs' : 'cjs'}`);
      fs.writeFileSync(file, code, 'utf8');
      const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      checked++;
      if (res.status !== 0) {
        const lines = (res.stderr || '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
        const head = lines[0] || '';
        const lm = /block-\d+\.(?:cjs|mjs):(\d+)/.exec(head);
        const inBlockLine = lm ? parseInt(lm[1], 10) : null;
        let absOffset = block.tag.contentStart;
        if (inBlockLine && inBlockLine > 1) {
          absOffset += code.split('\n').slice(0, inBlockLine - 1).join('\n').length + 1;
        }
        const absLine = doc.lineOf(absOffset);
        const message = (lines.find((l) => /Error\b/.test(l)) || lines[1] || '').trim();
        add(HARD, 'L1-1', `第 ${i + 1} 个 <script> 语法错误`,
          [message, inBlockLine ? `script 块内第 ${inBlockLine} 行` : ''].filter(Boolean).join(' · '),
          { loc: { line: absLine }, evidence: [snippet(html, absOffset, 60)] });
      }
    });
  } finally {
    safeRemove(tmpDir, { recursive: true, force: true });
  }

  // ── 2. 标签配平（开闭数量 + 嵌套栈） ─────────────────────────
  const counts = new Map();
  for (const t of doc.tags) {
    if (!CONTAINER_TAGS.has(t.name)) continue;
    if (t.kind === 'open' && t.selfClose) continue;
    const rec = counts.get(t.name) || { open: 0, close: 0, firstLine: t.line };
    if (t.kind === 'open') rec.open++; else rec.close++;
    counts.set(t.name, rec);
  }
  const unbalanced = [];
  for (const [name, rec] of counts) {
    if (rec.open !== rec.close) unbalanced.push({ name, open: rec.open, close: rec.close, line: rec.firstLine });
  }
  if (unbalanced.length) {
    add(HARD, 'L1-2', '标签开闭数量不一致', '容器标签的开标签数与闭标签数不相等，浏览器会自行纠错，DOM 结构与预期不同。', {
      evidence: unbalanced.map((u) => `<${u.name}> 开 ${u.open} / 闭 ${u.close}（首次出现第 ${u.line} 行）`),
      loc: { line: unbalanced[0].line },
    });
  }

  // 嵌套栈校验（计数相等但交叉嵌套的情况）
  const stack = [];
  const nesting = [];
  for (const t of doc.tags) {
    if (!CONTAINER_TAGS.has(t.name)) continue;
    if (t.kind === 'open') {
      if (t.selfClose) continue;
      while (stack.length && IMPLICIT_CLOSE[t.name] && IMPLICIT_CLOSE[t.name].has(stack[stack.length - 1].name)) {
        const top = stack[stack.length - 1];
        if (top.name === t.name) stack.pop(); else break;
      }
      stack.push(t);
    } else {
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === t.name) { idx = i; break; }
      if (idx === -1) continue;
      for (let i = stack.length - 1; i > idx; i--) {
        nesting.push({
          line: stack[i].line,
          text: `<${stack[i].name}>（第 ${stack[i].line} 行）在第 ${t.line} 行的 </${t.name}> 之前未闭合`,
        });
      }
      stack.length = idx;
    }
  }
  if (nesting.length) {
    add(WARN, 'L1-3', '标签交叉嵌套', '开闭数量一致，但闭合顺序不对（如 <div><span></div>）。浏览器会纠正，但结构与书写意图不符。', {
      evidence: nesting.slice(0, 10).map((n) => n.text),
      loc: { line: nesting[0].line },
    });
  }

  // ── 3. 页面注册完整性 ────────────────────────────────────────
  const allIds = new Set();
  const sectionIds = [];
  for (const t of doc.tags) {
    const id = pickAttr(t.attrs, 'id');
    if (!id) continue;
    allIds.add(id);
    if (t.name === 'section') sectionIds.push({ id, line: t.line });
  }
  const jumpRe = /(?:goto|showPage|switchPage|navigateTo|goPage|openPage)\s*\(\s*['"]([^'"]+)['"]|data-(?:goto|page|target)\s*=\s*["']([^"']+)["']|href\s*=\s*["']#(page[-\w]*)["']/g;
  const jumps = [];
  let jm;
  while ((jm = jumpRe.exec(html)) !== null) {
    const target = jm[1] || jm[2] || jm[3];
    if (!target || target.startsWith('#') || /\$\{/.test(target)) continue;
    jumps.push({ target, line: doc.lineOf(jm.index), at: jm.index });
  }
  const missing = jumps.filter((j) => !allIds.has(j.target));
  if (jumps.length && missing.length) {
    add(HARD, 'L1-4', '跳转目标页不存在', '这些跳转目标在所有 id 中都找不到对应元素，点击后页面不会有任何反应。', {
      evidence: missing.slice(0, 15).map((j) => `→ ${j.target}（第 ${j.line} 行）`),
      loc: { line: missing[0].line },
    });
  }
  if (!sectionIds.length && jumps.length) {
    add(WARN, 'L1-5', '未发现 <section> 页面容器', '原型里没有 <section id="…"> 页面容器，第二层的逐页冒烟与第三层的分辨率实测将无从枚举页面。', {});
  }
  const emptyIdSections = doc.tags.filter((t) => t.kind === 'open' && t.name === 'section' && !pickAttr(t.attrs, 'id'));
  if (emptyIdSections.length) {
    add(WARN, 'L1-6', '存在无 id 的 <section>', '无 id 的页面容器无法被 goto 定位，也无法被逐页冒烟覆盖。', {
      evidence: emptyIdSections.slice(0, 10).map((t) => `第 ${t.line} 行`),
      loc: { line: emptyIdSections[0].line },
    });
  }

  // ── 4. symbol 引用完整性 ─────────────────────────────────────
  const definedSymbols = new Set();
  for (const t of doc.tags) {
    if (t.name !== 'symbol') continue;
    const id = pickAttr(t.attrs, 'id');
    if (id) definedSymbols.add(id);
  }
  const uses = [];
  const useRe = /<(?:use|image)\b([^>]*)>/gi;
  let um;
  while ((um = useRe.exec(html)) !== null) {
    const href = pickAttr(um[1], 'href') || pickAttr(um[1], 'xlink:href');
    if (!href || !href.startsWith('#')) continue;
    const ref = href.slice(1);
    if (!ref || /\$\{/.test(ref)) continue;
    uses.push({ ref, line: doc.lineOf(um.index) });
  }
  const danglingRefs = uses.filter((u) => !definedSymbols.has(u.ref) && !allIds.has(u.ref));
  if (danglingRefs.length) {
    add(HARD, 'L1-7', '图标 symbol 引用悬空', '这些 <use href="#…"> 指向的 symbol 没有定义，图标位置会是空白。', {
      evidence: [...new Set(danglingRefs.map((u) => `${u.ref}（首次第 ${u.line} 行）`))].slice(0, 15),
      loc: { line: danglingRefs[0].line },
    });
  }
  if (uses.length && !definedSymbols.size) {
    add(WARN, 'L1-8', '有 <use> 引用但没有任何 <symbol> 定义', '可能引用了外部 sprite 或图片图标，与「一套线性图标体系」的要求不符。', {
      evidence: [...new Set(uses.map((u) => u.ref))].slice(0, 10),
    });
  }

  // ── 5. 文本 Token 对比度（references/02 §14.3：对白底 ≥ 4.5:1） ─────
  // 命名契约同 references/02 §14.1：取值可整套替换，命名不可替换——
  // 一旦认不出文本色，本项会「全绿」，那是空转的绿，不是通过。
  const cssText = doc.raws.filter((r) => r.tag.name === 'style').map((r) => r.content).join('\n');
  const tokenRe = /--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g;
  const tokens = [];
  let tm;
  while ((tm = tokenRe.exec(cssText)) !== null) tokens.push({ name: tm[1].toLowerCase(), raw: tm[2], color: parseColor(tm[2]) });
  // 契约正则：与 scaffold.mjs 的 CONTRACT_TEXT / CONTRACT_BG 必须保持一致
  const isText = (n) => /text|title-color|heading-color|font-color|label-color/.test(n);
  const isBg = (n) => /^bg-|background|surface|fill-/.test(n);
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const contrastFindings = [];
  for (const tk of tokens.filter((t) => isText(t.name) && t.color)) {
    const fg = compositeOver(tk.color, white);
    const ratio = contrastRatio(fg, white);
    if (ratio + 1e-9 < opts.contrastMin) {
      const bgPair = [];
      for (const bg of tokens.filter((t) => isBg(t.name) && t.color)) {
        if (/^#(?:fff|ffffff)$/i.test(bg.raw.trim())) continue; // 白底已单独报，不重复
        const r2 = contrastRatio(fg, compositeOver(bg.color, white));
        if (r2 + 1e-9 < opts.contrastMin) bgPair.push(`--${bg.name} 仅 ${r2.toFixed(2)}:1`);
      }
      contrastFindings.push(`--${tk.name}: ${tk.raw} → 对白底 ${ratio.toFixed(2)}:1，低于 ${opts.contrastMin}:1${bgPair.length ? `；对页面背景 Token 同样不达标：${bgPair.slice(0, 4).join('、')}` : ''}`);
    }
  }
  if (contrastFindings.length) {
    add(HARD, 'L1-9', '文本 Token 对比度不达标', `§14.3 要求文本 Token 对白底不低于 ${opts.contrastMin}:1（原型常投影演示），且与取值来源无关。`, {
      evidence: contrastFindings,
    });
  }

  // ── 6. 界面图标：裸字符 / emoji（§34 第 27 条） ─────────────
  const iconFindings = [];
  const textTokens = doc.texts.filter((t) => !t.rawOf || t.rawOf === 'title');
  for (const tk of textTokens) {
    for (const ch of CHAR_ICONS) {
      let at = tk.text.indexOf(ch);
      while (at !== -1) {
        iconFindings.push({ start: tk.start + at, ch, kind: 'char' });
        at = tk.text.indexOf(ch, at + 1);
      }
    }
    const emojiRe = new RegExp(EMOJI_RE.source, 'gu');
    let em;
    while ((em = emojiRe.exec(tk.text)) !== null) {
      if (CHAR_ICONS.includes(em[0])) continue;
      iconFindings.push({ start: tk.start + em.index, ch: em[0], kind: 'emoji' });
    }
  }
  // 按位置把标签流与图标命中交错排序，重建命中时的祖先栈，判断是否落在交互控件里
  const interactiveHits = [];
  const softHits = [];
  {
    const seq = [
      ...doc.tags.filter((t) => CONTAINER_TAGS.has(t.name)).map((t) => ({ type: 'tag', start: t.start, tag: t })),
      ...iconFindings.map((h) => ({ type: 'icon', start: h.start, hit: h })),
    ].sort((a, b) => a.start - b.start);
    const st = [];
    for (const item of seq) {
      if (item.type === 'tag') {
        const t = item.tag;
        if (t.kind === 'open' && !t.selfClose) st.push(t);
        else {
          for (let i = st.length - 1; i >= 0; i--) if (st[i].name === t.name) { st.length = i; break; }
        }
      } else {
        const hot = st.some((c) => ICON_CONTEXT_TAGS.has(c.name) || ICON_CONTEXT_ATTR.test(c.attrs || ''));
        (hot ? interactiveHits : softHits).push(item.hit);
      }
    }
  }
  const labelOf = (h) => `「${h.ch}」${h.kind === 'emoji' ? '（emoji）' : ''}第 ${doc.lineOf(h.start)} 行`;
  if (interactiveHits.length) {
    add(HARD, 'L1-10', '交互控件使用裸字符 / emoji 充当图标',
      '§34 第 27 条：裸用 ▶◀›✓ 等字符或彩色 emoji 充当界面图标，Windows 演示机可能 emoji 化。应改为内联 SVG symbol 引用。', {
        evidence: interactiveHits.slice(0, 12).map((h) => `${labelOf(h)}的按钮 / 导航 / 标签控件内`),
      });
  }
  if (softHits.length) {
    add(WARN, 'L1-11', '正文中出现字符图标或 emoji', '未必是缺陷（可能是说明性文字里的对勾、箭头），请确认不是充当界面图标。', {
      evidence: softHits.slice(0, 8).map(labelOf),
    });
  }

  // ── 7. 新 CSS 特性无兜底（§34 第 29 条） ────────────────────
  if (/:has\s*\(/.test(cssText)) {
    const hasCount = (cssText.match(/:has\s*\(/g) || []).length;
    add(WARN, 'L1-12', '使用 :has() 等新 CSS 特性', `检测到 ${hasCount} 处 :has()。若用在关键视觉路径上需提供兜底或降级方案，否则旧内核浏览器下布局会塌。`, {});
  }

  // ── 8. 字号底线（§34 第 20 条） ─────────────────────────────
  // <style> 块 + 内联 style="…" 一起看，原型里二者都会出现
  const inlineStyles = doc.tags.map((t) => pickAttr(t.attrs, 'style')).filter(Boolean);
  const sizeSource = [cssText, ...inlineStyles].join('\n');
  const fsRe = /font-size\s*:\s*([\d.]+)px/gi;
  const tiny = [];
  const small = [];
  let fm;
  while ((fm = fsRe.exec(sizeSource)) !== null) {
    const px = parseFloat(fm[1]);
    if (px < 11) tiny.push(px); else if (px <= 12) small.push(px);
  }
  if (tiny.length) {
    add(HARD, 'L1-13', '字号低于 11px', '< 11px 正文在任何桌面分辨率下都不可读，属于「小字缩放版后台」缺陷。', {
      evidence: [...new Set(tiny)].map((v) => `${v}px`),
    });
  }
  if (small.length >= opts.smallFontRatio) {
    add(WARN, 'L1-14', '疑似大面积小字', `11～12px 字号出现 ${small.length} 处（阈值 ${opts.smallFontRatio}）。§34 第 20 条把「大面积 11～12px 正文」列为缺陷；口径见 references/02 §15.2——11～12px 只允许零星用于辅助信息，不得成片，请确认这些不是正文级文本。`, {});
  }

  // ── 9. 演示数据去个人化（§27.3 / §34 第 31 条） ─────────────
  if (opts.pii) {
    const blocklist = loadBlocklist(opts.blocklist);
    const piiEvidence = [];
    const phoneRe = /(?<![\d-])1[3-9]\d{9}(?![\d-])/g;
    const telRe = /(?<![\d-])0\d{2,3}-\d{7,8}(?![\d-])/g;
    const mailRe = /[\w.+-]+@(?:qq|163|126|sina|foxmail|gmail|outlook|hotmail|foxmail)\.com/gi;
    const empRe = /(?:工号|员工编号|员工号|工卡号)\s*[:：]?\s*[A-Za-z0-9]{3,}/g;
    const scan = (text) => {
      for (const re of [phoneRe, telRe, mailRe, empRe]) {
        re.lastIndex = 0;
        let mm;
        while ((mm = re.exec(text)) !== null) {
          piiEvidence.push(`${mm[0]}（第 ${doc.lineOf(mm.index)} 行）`);
        }
      }
      for (const term of blocklist) {
        let at = text.indexOf(term);
        while (at !== -1) {
          piiEvidence.push(`${term}（第 ${doc.lineOf(at)} 行，命中禁用词表）`);
          at = text.indexOf(term, at + term.length);
        }
      }
    };
    // 整份源码扫一遍即可：行号天然正确，脚本 / 数据区内的姓名手机号也能覆盖
    scan(html);
    if (piiEvidence.length) {
      const uniq = [...new Set(piiEvidence)];
      add(HARD, 'L1-15', '演示数据疑似含个人信息', `§27.3：禁止出现真实姓名、手机号、工号、真实内部项目名。命中 ${uniq.length} 处（自动匹配，请人工确认是否确为真实数据）。`, {
        evidence: uniq.slice(0, 15),
      });
    }
  }

  // ── 10. 动态内容硬编码（§33.6 / §34 第 29 条） ──────────────
  const markupText = doc.texts.filter((t) => !t.rawOf || t.rawOf === 'title').map((t) => t.text).join('\n');
  const greetingRe = /(早上好|上午好|中午好|下午好|晚上好|早安|晚安|Good morning|Good afternoon|Good evening)/g;
  const greetings = [];
  let gm;
  while ((gm = greetingRe.exec(markupText)) !== null) greetings.push(gm[0]);
  if (greetings.length) {
    add(WARN, 'L1-16', '问候语可能硬编码', `检测到问候语字面量 ${[...new Set(greetings)].join('、')}。§33.6 要求问候语由 JS 按当前时间生成，写死在 HTML 里第二天打开就穿帮。请确认它不是由脚本渲染的。`, {});
  }

  return { findings, stats: { scriptsChecked: checked, pages: sectionIds.length, jumps: jumps.length, uses: uses.length, tokens: tokens.length } };
}

function loadBlocklist(file) {
  if (!file) return [];
  if (!fs.existsSync(file)) throw new UsageError(`--blocklist 文件不存在：${file}`);
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// ────────────────────────────────────────────────────────────────
// 浏览器发现与调用
// ────────────────────────────────────────────────────────────────

function findBrowser(explicit) {
  if (explicit) return fs.existsSync(explicit) ? explicit : null;
  const candidates = [];
  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    );
  } else if (process.platform === 'win32') {
    const roots = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']];
    for (const r of roots.filter(Boolean)) {
      candidates.push(path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      candidates.push(path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable', 'brave-browser']) {
      const which = spawnSync('which', [name], { encoding: 'utf8' });
      if (which.status === 0 && which.stdout.trim()) candidates.push(which.stdout.trim());
    }
  }
  return candidates.find((c) => { try { return fs.existsSync(c); } catch { return false; } }) || null;
}

/**
 * 早注入的错误采集器：必须落在作者脚本之前，否则「文档加载时就抛错」这类
 * 最典型的白屏原因根本来不及被记录。注入位置选在 <head> 之后。
 */
const ERROR_BOOTSTRAP = `<script>(function(){var E=window.__pvErrors=window.__pvErrors||[];function p(m){if(E.indexOf(m)===-1)E.push(m)}
window.addEventListener('error',function(e){if(e&&e.message){p('error: '+e.message+(e.lineno?' @line '+e.lineno:''))}else if(e&&e.target&&e.target.tagName){p('resource: <'+e.target.tagName.toLowerCase()+'> 加载失败')}},true);
window.addEventListener('unhandledrejection',function(e){p('promise: '+String(e&&e.reason&&e.reason.message?e.reason.message:e&&e.reason))});
})();</script>`;

const PROBE_SOURCE = String.raw`
(function () {
  var C = window.__PV_CONFIG__ || {};
  var errors = window.__pvErrors || [];
  if (!window.__pvErrors) {
    window.addEventListener('error', function (e) {
      errors.push('error: ' + (e.message || 'unknown') + (e.lineno ? ' @line ' + e.lineno : ''));
    });
    window.addEventListener('unhandledrejection', function (e) {
      errors.push('promise: ' + String(e.reason && e.reason.message ? e.reason.message : e.reason));
    });
  }

  function visible(el) {
    if (!el) return false;
    if (el.offsetParent !== null) return true;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function activate(id) {
    var names = ['goto', 'showPage', 'switchPage', 'navigateTo', 'goPage', 'openPage'];
    for (var i = 0; i < names.length; i++) {
      var fn = window[names[i]];
      if (typeof fn === 'function') {
        try { fn(id); return 'fn:' + names[i]; } catch (e) { /* 继续尝试其它方式 */ }
      }
    }
    var trigger = document.querySelector('[data-goto="' + id + '"],[data-page="' + id + '"]');
    if (trigger) { try { trigger.click(); return 'click'; } catch (e) { /* ignore */ } }
    var secs = document.querySelectorAll('section[id]');
    if (secs.length) {
      for (var j = 0; j < secs.length; j++) { secs[j].style.display = 'none'; }
      var el = document.getElementById(id);
      if (el) { el.style.display = ''; el.removeAttribute('hidden'); return 'style'; }
    }
    return 'none';
  }

  function describe(el) {
    if (!el) return '?';
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      var c = el.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (c) s += '.' + c;
    }
    return s;
  }

  function measureOverflow() {
    var out = [];
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var ovx = '';
      try { ovx = window.getComputedStyle(el).overflowX; } catch (e) { ovx = ''; }
      if (ovx === 'auto' || ovx === 'scroll') continue; // 设计上可横向滚动的容器，不算溢出
      var d = el.scrollWidth - el.clientWidth;
      if (el.clientWidth > 0 && d > 4) out.push({ sel: describe(el), d: d, scrollW: el.scrollWidth, clientW: el.clientWidth });
    }
    out.sort(function (a, b) { return b.d - a.d; });
    return out.slice(0, 6);
  }

  function snapshotPages() {
    var pages = [];
    var secs = document.querySelectorAll('section[id]');
    for (var i = 0; i < secs.length; i++) {
      var sec = secs[i];
      var how = activate(sec.id);
      var html = (sec.innerHTML || '').replace(/\s+/g, '');
      // vlen = 渲染后可见文本长度。innerHTML 长度看不出「内容全被 display:none 藏起来」——
      // 状态层没被激活时，两者会严重背离，只测 len 会给出空转的绿。
      // 注意：这里不能用 innerText 或 textContent 互相兜底——可见文本为空时 innerText 就是空串，
      // 一旦回落到 textContent，就会把 display:none 的内容重新算成「可见」，检查当场失效。
      var vis = (typeof sec.innerText === 'string' ? sec.innerText : (sec.textContent || '')).replace(/\s+/g, '');
      pages.push({
        id: sec.id,
        how: how,
        found: true,
        visible: visible(sec),
        len: html.length,
        vlen: vis.length,
        overflow: measureOverflow()
      });
    }
    return pages;
  }

  function runFlow(steps) {
    var log = [];
    function text(scope) {
      var root = scope ? document.querySelector(scope) : document.body;
      if (!root) return null;
      return (root.innerText || root.textContent || '');
    }
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i] || {};
      var rec = { i: i, action: '', ok: true, reason: '' };
      try {
        if (s.page) { rec.action = 'page ' + s.page; var how = activate(s.page); if (how === 'none') { rec.ok = false; rec.reason = '页面激活失败，未找到 goto/showPage/[data-goto] 入口'; } }
        else if (s.click) {
          rec.action = 'click ' + s.click;
          var el = document.querySelector(s.click);
          if (!el) { rec.ok = false; rec.reason = '选择器未命中元素'; }
          else if (!visible(el)) { rec.ok = false; rec.reason = '元素存在但不可见'; }
          else { el.click(); }
        } else if (s.expect || s.expectText) {
          var needle = s.expect || s.expectText;
          rec.action = 'expect "' + needle + '"';
          var body = text(s.in);
          if (body === null) { rec.ok = false; rec.reason = '范围选择器 ' + s.in + ' 不存在'; }
          else if (body.indexOf(needle) === -1) { rec.ok = false; rec.reason = '可见文本中未出现该子串'; }
        } else if (s.expectSelector) {
          rec.action = 'expectSelector ' + s.expectSelector;
          var node = document.querySelector(s.expectSelector);
          if (!node) rec.ok = false, rec.reason = '选择器未命中元素';
          else if (!visible(node)) rec.ok = false, rec.reason = '元素存在但不可见';
        } else if (s.wait) {
          // 「静默无效」比「不支持」更危险：作者会以为等到了，实际没有。故显式失败。
          rec.action = 'wait ' + s.wait;
          rec.ok = false;
          rec.reason = 'wait 不支持：链路断言在同一帧内执行，不会真正等待。请把要断言的中间状态做成同步可达，或改为断言该动作的最终状态。';
        }
        else { rec.action = 'note'; }
      } catch (e) {
        rec.ok = false; rec.reason = '执行抛错：' + (e.message || e);
      }
      log.push(rec);
      if (!rec.ok) break; // 链路中断后续步骤无意义
    }
    return log;
  }

  function emit(payload) {
    var pre = document.getElementById('__pvResult');
    if (!pre) {
      pre = document.createElement('pre');
      pre.id = '__pvResult';
      pre.style.display = 'none';
      document.body.appendChild(pre);
    }
    pre.textContent = JSON.stringify(payload);
  }

  function run() {
    try {
      var payload = {
        ok: true,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth,
        bodyScrollW: document.body ? document.body.scrollWidth : -1,
        mode: C.mode,
        pages: C.mode === 'smoke' || C.mode === 'measure' ? snapshotPages() : [],
        flow: C.mode === 'flow' ? runFlow(C.flow && C.flow.steps ? C.flow.steps : []) : [],
        errors: errors
      };
      emit(payload);
    } catch (e) {
      emit({ ok: false, fatal: String(e && e.message ? e.message : e), errors: errors });
    }
  }

  var delay = typeof C.settle === 'number' ? C.settle : 400;
  if (document.readyState === 'complete') setTimeout(run, delay);
  else window.addEventListener('load', function () { setTimeout(run, delay); });
})();
`;

/**
 * 把探针注入原型副本，用无头浏览器跑一次，解析 <pre id="__pvResult"> 里的结果。
 * 副本写在原型同目录，保证相对路径资源（图片、字体）仍能解析。
 */
function runBrowser(browser, htmlPath, config, opts) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dir = path.dirname(htmlPath);
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpPath = path.join(dir, `.proto-verify.${stamp}.html`);
  const cfgScript = `<script>window.__PV_CONFIG__ = ${JSON.stringify(config)};</script>\n<script>${PROBE_SOURCE}</script>\n`;

  // 两段注入：错误采集器必须在作者脚本之前（否则漏掉加载期抛错），探针在 </body> 之前。
  // 采集器插在 charset 声明之后，避免把 <meta charset> 挤出前 1024 字节导致中文乱码。
  const charsetTag = /<meta[^>]*charset[^>]*>/i;
  let withBootstrap;
  if (/<head[^>]*>/i.test(html) && charsetTag.test(html)) {
    withBootstrap = html.replace(charsetTag, (m) => m + ERROR_BOOTSTRAP);
  } else if (/<head[^>]*>/i.test(html)) {
    withBootstrap = html.replace(/<head[^>]*>/i, (m) => m + ERROR_BOOTSTRAP);
  } else if (/<html[^>]*>/i.test(html)) {
    withBootstrap = html.replace(/<html[^>]*>/i, (m) => m + ERROR_BOOTSTRAP);
  } else {
    withBootstrap = ERROR_BOOTSTRAP + html;
  }

  const injected = /<\/body\s*>/i.test(withBootstrap)
    ? withBootstrap.replace(/<\/body\s*>/i, `${cfgScript}</body>`)
    : withBootstrap + cfgScript;
  fs.writeFileSync(tmpPath, injected, 'utf8');

  const [w, h] = (config.size || '1440x900').split('x').map(Number);
  const baseArgs = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--virtual-time-budget=4000',
    `--window-size=${w},${h}`,
  ];
  const target = pathToFileURL(tmpPath).href;

  const attempt = (headlessFlag) => {
    const args = [headlessFlag, ...baseArgs.slice(1), '--dump-dom', target];
    return spawnSync(browser, args, { encoding: 'utf8', timeout: opts.timeout, maxBuffer: 256 * 1024 * 1024 });
  };

  let res = attempt('--headless=new');
  let stdout = res.stdout || '';
  if (!/id="__pvResult"/.test(stdout) && res.status !== 0) {
    res = attempt('--headless=old');
    stdout = res.stdout || '';
  }
  safeRemove(tmpPath, { force: true });

  if (!/id="__pvResult"/.test(stdout)) {
    return {
      ok: false,
      reason: res.error ? `浏览器调用失败：${res.error.message}` : `未在 dump-dom 输出中找到探针锚点（退出码 ${res.status}）`,
      stderr: (res.stderr || '').split('\n').filter(Boolean).slice(0, 5).join(' | '),
    };
  }
  const m = /id="__pvResult"[^>]*>([\s\S]*?)<\/pre>/.exec(stdout);
  if (!m) return { ok: false, reason: '锚点元素内容提取失败' };
  try {
    return { ok: true, data: JSON.parse(unescapeEntities(m[1])) };
  } catch (e) {
    return { ok: false, reason: `探针结果 JSON 解析失败：${e.message}` };
  }
}

// ────────────────────────────────────────────────────────────────
// 第二层：逐页冒烟
// ────────────────────────────────────────────────────────────────

function layer2(browser, htmlPath, opts, findings) {
  const size = opts.sizes[0];
  const add = (severity, id, title, detail, extra) => findings.push({ layer: 2, severity, id, title, detail, ...extra });

  const run = runBrowser(browser, htmlPath, { mode: 'smoke', size, settle: 400 }, opts);
  if (!run.ok) { add(WARN, 'L2-0', '第二层未能执行', run.reason, {}); return { skipped: true, reason: run.reason }; }

  const d = run.data;
  const pages = d.pages || [];
  if (!pages.length) {
    add(WARN, 'L2-1', '未枚举到任何页面', '原型的 <section id="…"> 数量为 0，逐页冒烟没有覆盖对象。', {});
  }

  // 判定以「渲染后可见文本」为准（vlen）；innerHTML 长度只作旁证——
  // 二者背离正是「内容都在、但全被藏起来」的特征，单看 markup 会误判为通过。
  const visLen = (p) => (typeof p.vlen === 'number' ? p.vlen : p.len);
  const hiddenAll = pages.filter((p) => p.len >= PAGE_CONTENT_SOFT && visLen(p) < PAGE_CONTENT_HARD);
  const blank = pages.filter((p) => visLen(p) < PAGE_CONTENT_HARD && !hiddenAll.includes(p));
  const thin = pages.filter((p) => visLen(p) >= PAGE_CONTENT_HARD && visLen(p) < PAGE_CONTENT_SOFT);
  if (hiddenAll.length) {
    add(HARD, 'L2-7', '页面内容存在但全部不可见',
      '标记里有内容，渲染后可见文本却几乎为空——通常是状态层 / 分页容器没被激活（缺少 display 生效的类名或属性）。用户点进去看到的是空屏（§27.1：不是空白壳）。', {
        evidence: hiddenAll.map((p) => `${p.id}：innerHTML ${p.len} 字符，可见文本仅 ${visLen(p)} 字符（激活方式 ${p.how}）`),
      });
  }
  if (blank.length) {
    add(HARD, 'L2-2', '存在空白壳页面', '激活后可见文本去空白长度小于 12 字符，页面没有真实内容（§27.1 第一层：不是空白壳）。', {
      evidence: blank.map((p) => `${p.id}：可见文本 ${visLen(p)} 字符 / innerHTML ${p.len}（激活方式 ${p.how}）`),
    });
  }
  if (thin.length) {
    add(WARN, 'L2-6', '页面内容偏少', '可见文本不足 60 字符。可能是合理的极简页面，也可能是状态区未渲染，请人工确认。', {
      evidence: thin.map((p) => `${p.id}：可见文本 ${visLen(p)} 字符 / innerHTML ${p.len}（激活方式 ${p.how}）`),
    });
  }
  const invisible = pages.filter((p) => !p.visible);
  if (invisible.length) {
    add(HARD, 'L2-3', '页面激活后仍不可见', '激活动作执行后目标容器高度/可见性为 0，用户点进去会看到空屏。', {
      evidence: invisible.map((p) => `${p.id}（激活方式 ${p.how}）`),
    });
  }
  const notFound = pages.filter((p) => !p.found);
  if (notFound.length) {
    add(HARD, 'L2-4', '页面容器缺失', '声明的页面 id 无法在 DOM 中定位。', { evidence: notFound.map((p) => p.id) });
  }

  if (d.errors && d.errors.length) {
    const uniq = [...new Set(d.errors)];
    add(HARD, 'L2-5', '原型运行时有 JS 错误', '页面加载或逐页激活过程中捕获到运行时错误，对应交互会静默失效。', { evidence: uniq.slice(0, 12) });
  }

  // 多入口覆盖提示：仅统计可作为入口的跳转数量
  return { skipped: false, pages: pages.length, errors: (d.errors || []).length, detail: d };
}

// ────────────────────────────────────────────────────────────────
// 第三层：黄金流链路 + 三档分辨率实测
// ────────────────────────────────────────────────────────────────

function layer3(browser, htmlPath, opts, findings) {
  const add = (severity, id, title, detail, extra) => findings.push({ layer: 3, severity, id, title, detail, ...extra });
  const result = { sizes: [], flow: null };

  // 3a 分辨率溢出
  for (const size of opts.sizes) {
    const run = runBrowser(browser, htmlPath, { mode: 'measure', size, settle: 400 }, opts);
    if (!run.ok) {
      add(WARN, 'L3-0', `${size} 分辨率实测未能执行`, run.reason, {});
      result.sizes.push({ size, ok: false, reason: run.reason });
      continue;
    }
    const d = run.data;
    const overflowW = d.docScrollW - d.docClientW;
    const docLevel = overflowW > 1;
    const offenders = [];
    for (const p of (d.pages || [])) {
      for (const ov of (p.overflow || [])) offenders.push(`${p.id} → ${ov.sel}：内容宽 ${ov.scrollW}px / 容器 ${ov.clientW}px，溢出 ${ov.d}px`);
    }
    if (docLevel) {
      add(HARD, 'L3-1', `${size} 出现整体横向溢出`,
        `文档滚动宽 ${d.docScrollW}px 超过视口 ${d.docClientW}px（溢出 ${overflowW}px）。§34 第 18 条：窗口变化后重叠、裁切、横向溢出属缺陷。`,
        { evidence: offenders.slice(0, 8) });
    } else if (offenders.length) {
      add(HARD, 'L3-2', `${size} 存在元素级横向裁切`,
        '这些元素的 scrollWidth 超过自身宽度且容器不可横向滚动，内容会被裁掉或压出轨道。', { evidence: offenders.slice(0, 8) });
    }
    if (d.errors && d.errors.length) {
      add(HARD, 'L3-3', `${size} 实测期间出现 JS 错误`, '', { evidence: [...new Set(d.errors)].slice(0, 8) });
    }
    result.sizes.push({ size, ok: true, docOverflow: overflowW, offenders: offenders.length, pages: (d.pages || []).length, errors: (d.errors || []).length });
  }

  // 3b 黄金流点击链路
  if (!opts.flow) {
    result.flow = { skipped: true, reason: '未提供 --flow 文件' };
    return result;
  }
  let flow;
  try {
    flow = JSON.parse(fs.readFileSync(opts.flow, 'utf8'));
  } catch (e) {
    add(WARN, 'L3-4', '黄金流定义无法读取', `${opts.flow}：${e.message}`, {});
    result.flow = { skipped: true, reason: '定义文件读取失败' };
    return result;
  }
  const steps = Array.isArray(flow.steps) ? flow.steps : [];
  if (!steps.length) {
    add(WARN, 'L3-5', '黄金流没有步骤', '--flow 文件的 steps 为空，链路实测没有执行内容。', {});
    result.flow = { skipped: true, reason: 'steps 为空' };
    return result;
  }
  const run = runBrowser(browser, htmlPath, { mode: 'flow', size: flow.size || opts.sizes[1] || opts.sizes[0], settle: 400, flow }, opts);
  if (!run.ok) {
    add(WARN, 'L3-6', '黄金流实测未能执行', run.reason, {});
    result.flow = { skipped: true, reason: run.reason };
    return result;
  }
  const log = (run.data && run.data.flow) || [];
  const failed = log.filter((s) => !s.ok);
  const dropped = steps.length - log.length;
  if (failed.length) {
    const f = failed[0];
    add(HARD, 'L3-7', '黄金任务流未走通',
      `在第 ${f.i + 1} 步「${f.action}」中断：${f.reason}。链路中断后剩余 ${steps.length - f.i - 1} 步未执行。`,
      { evidence: log.map((s) => `${s.ok ? 'PASS' : 'FAIL'} 步骤${s.i + 1} ${s.action}${s.reason ? ' — ' + s.reason : ''}`) });
  } else if (dropped > 0) {
    add(WARN, 'L3-8', '黄金流未执行完', `已执行 ${log.length} / ${steps.length} 步。`, {});
  }
  result.flow = { skipped: false, steps: steps.length, passed: log.filter((s) => s.ok).length, log };
  return result;
}

// ────────────────────────────────────────────────────────────────
// 报告输出
// ────────────────────────────────────────────────────────────────

const C = {
  reset: '\u001b[0m', dim: '\u001b[2m', bold: '\u001b[1m',
  red: '\u001b[31m', yellow: '\u001b[33m', green: '\u001b[32m', cyan: '\u001b[36m',
};
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (c, s) => (useColor ? `${c}${s}${C.reset}` : s);

function printReport(report, opts) {
  const { findings, layers, target, scriptStats } = report;
  const hard = findings.filter((f) => f.severity === HARD);
  const warn = findings.filter((f) => f.severity === WARN);

  console.log(paint(C.bold, `原型运行时验证 · ${path.basename(target)}`));
  console.log(paint(C.dim, `目标：${target}`));
  console.log('');

  for (const l of layers) {
    const mark = l.skipped ? paint(C.yellow, 'SKIPPED') : (l.hard ? paint(C.red, 'FAIL') : (l.warn ? paint(C.yellow, 'PASS*') : paint(C.green, 'PASS')));
    const extra = l.skipped ? paint(C.dim, `  ${l.note || ''}`) : paint(C.dim, `  HARD ${l.hard} · WARN ${l.warn}`);
    console.log(`  [L${l.id}] ${l.name.padEnd(26, '·')} ${mark}${extra}`);
  }
  if (scriptStats) {
    console.log(paint(C.dim, `         已校验 script 块 ${scriptStats.scriptsChecked} 个 · 页面容器 ${scriptStats.pages} 个 · 跳转 ${scriptStats.jumps} 处 · 图标引用 ${scriptStats.uses} 处 · 色彩 Token ${scriptStats.tokens} 个`));
  }
  console.log('');

  const show = opts.quiet ? hard : findings;
  if (!show.length) {
    console.log(paint(C.green, '  未发现问题。'));
  }
  for (const f of show) {
    const tag = f.severity === HARD ? paint(C.red, '[HARD]') : paint(C.yellow, '[WARN]');
    const loc = f.loc && f.loc.line ? paint(C.dim, ` (第 ${f.loc.line} 行)`) : '';
    console.log(`  ${tag} ${f.id} ${paint(C.bold, f.title)}${loc}`);
    if (f.detail) console.log(`         ${f.detail}`);
    for (const e of (f.evidence || []).slice(0, 15)) console.log(`         ${paint(C.dim, '·')} ${e}`);
  }
  console.log('');

  const skippedRequired = layers.filter((l) => l.skipped && l.required);
  const verdict = hard.length ? 'FAIL' : (skippedRequired.length && opts.strict ? 'INCOMPLETE' : 'PASS');
  const summary = `结论：${verdict}  · HARD ${hard.length} · WARN ${warn.length}${skippedRequired.length ? ` · 必需层跳过 ${skippedRequired.length}` : ''}`;
  console.log(paint(hard.length ? C.red : (verdict === 'PASS' ? C.green : C.yellow), summary));

  if (skippedRequired.length) {
    for (const l of skippedRequired) console.log(paint(C.yellow, `  ! 第 ${l.id} 层被跳过：${l.note}`));
    console.log(paint(C.dim, '    §27.1：任何一层缺失不得交付。补齐浏览器 / --flow 后重跑。'));
  }
  if (!hard.length && warn.length) {
    console.log(paint(C.dim, '  WARN 项需人工判断，脚本只保证「可判定的那部分」没问题——不等于设计合格。'));
  }
  return verdict;
}

// ────────────────────────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────────────────────────

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`错误：${e.message}`);
    console.error(USAGE);
    process.exit(2);
  }
  if (opts.help || !process.argv.slice(2).length) { console.log(USAGE); process.exit(opts.help ? 0 : 2); }
  if (opts.printFlow) { console.log(JSON.stringify(FLOW_EXAMPLE, null, 2)); process.exit(0); }
  if (!opts.target) { console.error(`错误：缺少原型 HTML 路径\n\n${USAGE}`); process.exit(2); }

  const target = path.resolve(opts.target);
  if (!fs.existsSync(target)) { console.error(`错误：文件不存在：${target}`); process.exit(2); }
  if (!/\.(html?|htm)$/i.test(target)) console.error(paint(C.yellow, `提示：${path.basename(target)} 不是 .html/.htm 文件，仍按 HTML 解析。`));

  const html = fs.readFileSync(target, 'utf8');
  const doc = tokenize(html);
  const findings = [];
  const layers = [];
  let scriptStats = null;

  // 第一层
  if (opts.layers.includes(1)) {
    const r = layer1(html, doc, opts);
    findings.push(...r.findings);
    scriptStats = r.stats;
  }
  const layerFindings = (n) => findings.filter((f) => f.layer === n);

  // 浏览器能力探测（第二、三层都需要）
  const needBrowser = opts.layers.includes(2) || opts.layers.includes(3);
  let browser = null;
  if (needBrowser) {
    browser = findBrowser(opts.browser);
    if (!browser && opts.browser) {
      console.error(`错误：指定的浏览器不存在：${opts.browser}`);
      process.exit(2);
    }
  }

  let l2info = { skipped: true, reason: '未指定第 2 层' };
  if (opts.layers.includes(2)) {
    if (!browser) l2info = { skipped: true, reason: '未找到 Chrome / Edge / Chromium，可用 --browser 或 PROTO_BROWSER 指定' };
    else {
      const info = layer2(browser, target, opts, findings);
      l2info = { skipped: !!info.skipped, reason: info.reason, pages: info.pages, errors: info.errors, detail: info.detail };
    }
  }

  let l3info = { skipped: true, reason: '未指定第 3 层' };
  if (opts.layers.includes(3)) {
    if (!browser) l3info = { skipped: true, reason: '未找到 Chrome / Edge / Chromium，可用 --browser 或 PROTO_BROWSER 指定' };
    else l3info = layer3(browser, target, opts, findings);
  }

  const layerMeta = [
    { id: 1, name: '静态检查', ran: opts.layers.includes(1), required: true },
    { id: 2, name: '无头浏览器逐页冒烟', ran: opts.layers.includes(2), required: true },
    { id: 3, name: '黄金流 + 三档分辨率', ran: opts.layers.includes(3), required: true },
  ].filter((l) => l.ran).map((l) => {
    const fs2 = layerFindings(l.id);
    const hard = fs2.filter((f) => f.severity === HARD).length;
    const warn = fs2.filter((f) => f.severity === WARN).length;
    let skipped = false; let note = '';
    if (l.id === 2 && l2info.skipped) { skipped = true; note = l2info.reason; }
    if (l.id === 3 && l3info.skipped) { skipped = true; note = l3info.reason; }
    // 第三层：只有分辨率部分跑了、黄金流没跑，算部分跳过
    if (l.id === 3 && !l3info.skipped && l3info.flow && l3info.flow.skipped) {
      skipped = true; note = `分辨率实测已执行；黄金流链路未执行（${l3info.flow.reason}）`;
    }
    return { ...l, hard, warn, skipped, note };
  });

  const report = {
    target, generatedAt: new Date().toISOString(),
    node: process.version,
    browser: browser || null,
    options: { layers: opts.layers, sizes: opts.sizes, contrastMin: opts.contrastMin, strict: opts.strict },
    layers: layerMeta, scriptStats, findings,
    layer2: l2info, layer3: l3info,
    hard: findings.filter((f) => f.severity === HARD).length,
    warn: findings.filter((f) => f.severity === WARN).length,
  };

  const verdict = printReport(report, opts);

  if (opts.json) {
    fs.writeFileSync(path.resolve(opts.json), JSON.stringify(report, null, 2), 'utf8');
    if (!opts.quiet) console.log(paint(C.dim, `  JSON 报告：${path.resolve(opts.json)}`));
  }

  if (verdict === 'FAIL') process.exit(1);
  if (verdict === 'INCOMPLETE') process.exit(3);
  process.exit(0);
}

main();
