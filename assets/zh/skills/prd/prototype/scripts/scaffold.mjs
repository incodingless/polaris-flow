#!/usr/bin/env node
/**
 * scaffold.mjs — 高保真 HTML 原型的薄脚手架
 *
 * 解决的问题（references/07 §27.2「大文件编辑纪律」的根治）：
 *   手写千行级单文件原型后，再去做多处修改，只能靠逐条 Edit 硬改——并发写会互相覆盖、
 *   凭记忆拼类名会匹配失败、改了 nav 忘了改页面会出现断链。§27.2 于是要求「必须写断言式
 *   替换脚本」「修改前先 Read 原文」——那是在用纪律补救「没有脚手架」。
 *
 *   本脚本把骨架（App Shell / 设计 Token / 图标 symbol / 页面容器 / 路由 / 导航）一次性
 *   生成，并用 4 个区域标记把「可增长的部分」圈出来。此后新增页面、新增图标都走带守卫的
 *   定点插入：标记必须唯一命中，否则中止且不写盘——正是 §27.2 要求的那种替换脚本，
 *   只是它现在由技能交付，不再要模型每次现写。
 *
 * 设计 Token 的来源（references/05 §14.1「接口契约」/ §14.2）：
 *   具体取值不固化在本脚本里，唯一来源是 Token 文件 —— 默认 assets/default-tokens.css。
 *   需求方给了设计系统时用 --tokens=<规范.css> 覆盖，脚本不做任何值层面的判断，
 *   只做格式校验 + 命名契约校验；对比度是否达标由 verify L1-9 按同一契约裁定。
 *
 * 与 verify.mjs 的契约（两者必须一起演进，原文见 references/05 §14.1）：
 *   - 页面容器：<section id="…" class="page" data-title="…">，id 即 goto 目标
 *   - 导航/跳转：data-goto="<page-id>"，且目标必须存在（否则 verify L1-4 HARD）
 *   - 图标：<symbol id="i-*"> 定义 + <use href="#i-*"> 引用（否则 verify L1-7 HARD）
 *   - Token 命名：文本色 --text-* | --title-color | --heading-color | --font-color | --label-color
 *                背景色 --bg-* | --background* | --surface* | --fill-*（verify L1-9 按此识别）
 *   - Token 阈值：文本类对白底 >= 4.5:1（不可放宽，换取值的来源无关）
 *   - 路由：window.goto(id) / showPage(id)，供 verify 第二层激活页面
 *
 * 依赖：Node 内置模块 + 一个 Token 文件。零外部依赖（与 verify.mjs 同一取舍）。
 *
 * 用法：
 *   node scripts/scaffold.mjs init --out=<原型.html> [--title=…] [--app=…] [--pages=…] [--tokens=…] [--force]
 *   node scripts/scaffold.mjs add-page <原型.html> <page-id> --title=… [--icon=i-list] [--no-nav] [--after=<page-id>]
 *   node scripts/scaffold.mjs add-icon <原型.html> <icon-id> (--builtin=<name> | --path="<SVG 子元素>") [--view-box="0 0 24 24"]
 *   node scripts/scaffold.mjs set-tokens <原型.html> [--tokens=<token文件.css>]
 *   node scripts/scaffold.mjs list <原型.html>
 *   node scripts/scaffold.mjs icons
 *
 * 退出码：0 成功 · 1 操作失败（锚点缺失/id 重复/文件不存在/Token 格式非法） · 2 用法或环境错误
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ────────────────────────────────────────────────────────────────
// 设计 Token：取值的唯一来源（references/05 §14.2）
// ────────────────────────────────────────────────────────────────

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/** 兜底基线：需求方没有提供设计系统时使用（references/05 §14.2 优先级 2） */
const DEFAULT_TOKENS_FILE = path.join(SKILL_DIR, 'assets', 'default-tokens.css');
/** Token 区在 :root{} 内，缩进两格 */
const TOKEN_INDENT = '  ';
/**
 * 命名契约：verify.mjs L1-9 与应用内的自检都按它识别「哪些 Token 需要查对比度」。
 * 取值可以整套换掉，命名不能——换了名字，对比度校验会空转成假绿。
 */
const CONTRACT_TEXT = /text|title-color|heading-color|font-color|label-color/;
const CONTRACT_BG = /^bg-|background|surface|fill-/;

// ────────────────────────────────────────────────────────────────
// 区域标记：脚手架与「后续插入」的唯一契约
// ────────────────────────────────────────────────────────────────

const REGIONS = ['TOKENS', 'ICONS', 'NAV', 'PAGES'];
/** 缩进：nav 项在 <nav> 内 8 格；section 在 <main> 内 6 格。片段生成器自带缩进，插入时不再二次叠加。 */
const NAV_INDENT = '        ';
const PAGES_INDENT = '      ';
/** 区段标记用各自语境的原生注释语法：CSS 区段走 CSS 注释，HTML 区段走 HTML 注释 */
const REGION_COMMENT = { TOKENS: 'css', ICONS: 'html', NAV: 'html', PAGES: 'html' };
const marker = (name, kind) => (REGION_COMMENT[name] === 'css'
  ? `/* @${name}:${kind} */`
  : `<!-- @${name}:${kind} -->`);

class Fail extends Error {}
class UsageError extends Error {}

// ────────────────────────────────────────────────────────────────
// 内置线性图标集（§05：统一 2px 描边、统一 viewBox 24×24、fill 由 .icon 控制）
// 全部为纯几何占位实现，业务语义请按需替换或追加。
// ────────────────────────────────────────────────────────────────

const ICON_SET = {
  'i-dashboard': { note: '工作台 / 概览', body: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  'i-list': { note: '列表 / 明细', body: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>' },
  'i-search': { note: '搜索', body: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>' },
  'i-filter': { note: '筛选', body: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>' },
  'i-plus': { note: '新建 / 新增', body: '<path d="M12 5v14M5 12h14"/>' },
  'i-chevron-down': { note: '展开', body: '<path d="m6 9 6 6 6-6"/>' },
  'i-chevron-right': { note: '进入 / 下一页', body: '<path d="m9 6 6 6-6 6"/>' },
  'i-check': { note: '完成 / 通过', body: '<path d="m5 12 5 5L19 7"/>' },
  'i-close': { note: '关闭 / 清除', body: '<path d="M6 6l12 12M18 6 6 18"/>' },
  'i-user': { note: '用户', body: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' },
  'i-bell': { note: '通知', body: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>' },
  'i-settings': { note: '设置', body: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>' },
  'i-edit': { note: '编辑', body: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>' },
  'i-trash': { note: '删除', body: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>' },
  'i-upload': { note: '上传 / 导入', body: '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>' },
  'i-download': { note: '下载 / 导出', body: '<path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>' },
  'i-info': { note: '信息 / 说明', body: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/>' },
  'i-alert': { note: '警示 / 异常', body: '<path d="M12 4 2 20h20z"/><path d="M12 10v5M12 18h.01"/>' },
  'i-spinner': { note: '加载中（配合动效）', body: '<path d="M12 3a9 9 0 1 0 9 9"/>' },
  'i-more': { note: '更多操作', body: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>' },
};

const DEFAULT_ICON = 'i-list';

// ────────────────────────────────────────────────────────────────
// 生成片段
// ────────────────────────────────────────────────────────────────

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function symbolMarkup(id, body, viewBox) {
  return `<symbol id="${id}" viewBox="${viewBox || '0 0 24 24'}">${body}</symbol>`;
}

function navItemMarkup(id, title, icon, base) {
  return `${base || ''}<a class="nav-item" data-goto="${id}" href="#${id}">`
    + `<svg class="icon" aria-hidden="true"><use href="#${icon}"/></svg>`
    + `<span>${escText(title)}</span></a>`;
}

/** 页面容器片段。base 为 <section> 所在列的缩进，内部各层在此基础上递进，保证闭合标签与开标签对齐。 */
function pageMarkup(id, title, base) {
  const b = base || '';
  const i = (n) => b + '  '.repeat(n);
  return [
    `${i(0)}<section id="${id}" class="page" data-title="${escAttr(title)}">`,
    `${i(1)}<div class="page-head">`,
    `${i(2)}<h1 class="page-title">${escText(title)}</h1>`,
    `${i(2)}<p class="page-desc">页面主体待填充。本区块与下方注释均为脚手架占位，写业务内容时整体替换；删除前不要交付。</p>`,
    `${i(1)}</div>`,
    `${i(1)}<!-- TODO: 页面主体 —— 业务信息层级 / 状态覆盖（空·加载·错误·无权限…）/ 交互入口 -->`,
    `${i(0)}</section>`,
  ].join('\n');
}

/**
 * 原型模板。四个区域标记把「可增长部分」圈出来：init 生成时填入，之后 add-page/add-icon 定点插入。
 * 正文不含 `${` 与反引号，保证可安全嵌在模板字面量里。
 * TOKENS 区在此留空，由 cmdInit 用 Token 文件的内容填充（取值不在脚本里）。
 */
function buildTemplate({ title, app }) {
  const iconMarkup = Object.keys(ICON_SET)
    .map((id) => symbolMarkup(id, ICON_SET[id].body))
    .join('\n');

  const css = `<style>
/* 设计 Token —— 具体取值不写在这里，取自 Token 文件（references/05 §14.2）：
   默认 assets/default-tokens.css；需求方提供了设计规范时用 --tokens=<规范.css> 覆盖。
   品牌化与主题调整只改这一区；文本 Token 对白底必须 ≥4.5:1（verify L1-9 强制，不可放宽）。 */
:root {
  ${marker('TOKENS', 'BEGIN')}
  ${marker('TOKENS', 'END')}
}

/* ── 基础 ─────────────────────────────────────────────────── */
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: var(--fs-body);
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-page);
}
/* 线性图标：统一 2px 描边，颜色跟随文字（§05） */
.icon { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

/* ── App Shell ────────────────────────────────────────────── */
.app { min-height: 100vh; display: flex; flex-direction: column; }
.app-header {
  height: var(--header-h); flex: none; display: flex; align-items: center; gap: var(--sp-4);
  padding: 0 var(--page-pad-x); background: var(--bg-white); border-bottom: 1px solid var(--divider-color);
}
.app-brand { display: flex; align-items: center; gap: var(--sp-2); font-weight: 600; color: var(--title-color); }
.app-brand .icon { width: 20px; height: 20px; color: var(--primary-color); }
.app-header .spacer { flex: 1; }
.app-body { flex: 1; display: flex; min-height: 0; }
.app-sidebar {
  width: var(--sidebar-w); flex: none; padding: var(--sp-3) var(--sp-2);
  background: var(--bg-white); border-right: 1px solid var(--divider-color);
}
.app-main { flex: 1; min-width: 0; padding: var(--sp-5) var(--page-pad-x); }

/* ── 导航 ─────────────────────────────────────────────────── */
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: flex; align-items: center; gap: var(--sp-2); height: 40px; padding: 0 var(--sp-3);
  border-radius: var(--radius-md); color: var(--text-secondary); text-decoration: none; cursor: pointer;
}
.nav-item:hover { background: var(--bg-section); color: var(--text-primary); }
.nav-item.active { background: var(--primary-light); color: var(--primary-color); font-weight: 500; }

/* ── 页面容器：一次只显示一个，goto() 切换 .active ─────────── */
.page { display: none; }
.page.active { display: block; }

/* ── 通用零件 ─────────────────────────────────────────────── */
.card {
  background: var(--bg-white); border-radius: var(--radius-md);
  box-shadow: var(--shadow-card); padding: var(--sp-4) var(--sp-5);
}
.page-head { margin-bottom: var(--sp-4); }
.page-title { margin: 0; font-size: var(--fs-page-title); font-weight: 600; color: var(--title-color); }
.page-desc { margin: var(--sp-1) 0 0; font-size: var(--fs-sm); color: var(--text-placeholder); }
.btn {
  display: inline-flex; align-items: center; gap: var(--sp-1); height: var(--ctl-h);
  padding: 0 var(--sp-4); border: 1px solid var(--border-color); border-radius: var(--radius-md);
  background: var(--bg-white); color: var(--text-primary); font: inherit; cursor: pointer;
}
.btn:hover { border-color: var(--primary-hover); color: var(--primary-hover); }
.btn-primary { border-color: var(--primary-color); background: var(--primary-color); color: #fff; }
.btn-primary:hover { border-color: var(--primary-hover); background: var(--primary-hover); color: #fff; }
/* 表格：横向可分页的容器用 overflow-x:auto，避免整页横向溢出（verify 第三层） */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0 var(--sp-3); height: 44px; text-align: left; border-bottom: 1px solid var(--divider-soft); }
th { height: 42px; font-weight: 500; color: var(--text-secondary); background: var(--bg-section); }
/* 状态：11 种交互状态在此扩展（§33.3） */
.state { padding: var(--sp-8) 0; text-align: center; color: var(--text-placeholder); }
</style>`;

  const navInit = navItemMarkup('workbench', '工作台', 'i-dashboard', NAV_INDENT);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escText(title)}</title>
${css}
</head>
<body>

<!-- 图标 sprite：内联 SVG symbol 定义区。页面内以 use 元素的 href 指向 i- 前缀的 symbol id 引用（§05）。 -->
<svg class="icon-sprite" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">
${marker('ICONS', 'BEGIN')}
${iconMarkup}
${marker('ICONS', 'END')}
</svg>

<div class="app">
  <header class="app-header">
    <div class="app-brand">
      <svg class="icon" aria-hidden="true"><use href="#i-dashboard"/></svg>
      <span>${escText(app)}</span>
    </div>
    <div class="spacer"></div>
    <button class="btn" type="button" title="通知">
      <svg class="icon" aria-hidden="true"><use href="#i-bell"/></svg>
    </button>
    <button class="btn" type="button" title="账户">
      <svg class="icon" aria-hidden="true"><use href="#i-user"/></svg>
    </button>
  </header>

  <div class="app-body">
    <aside class="app-sidebar">
      <nav class="nav" aria-label="主导航">
        ${marker('NAV', 'BEGIN')}
${navInit}
        ${marker('NAV', 'END')}
      </nav>
    </aside>

    <main class="app-main" id="main">
      ${marker('PAGES', 'BEGIN')}
${pageMarkup('workbench', '工作台', PAGES_INDENT)}
      ${marker('PAGES', 'END')}
    </main>
  </div>
</div>

<script>
/* 路由：verify 第二层通过 window.goto(id) 激活页面，第三层按 .active 页面测溢出与链路。
   注意：本块内刻意不写「函数名 + 带引号的页面 id」这种字面量调用——verify 第一层会把源码里
   这类写法一律当作「跳转声明」纳入完整性校验，而页面 id 是运行时才知道的，写成字面量会
   制造假断链。跳转一律走 data-goto 属性与事件代理。 */
(function () {
  var APP_TITLE = '${escText(app).replace(/'/g, "\\'")}';

  function sections() {
    return document.querySelectorAll('section[id]');
  }

  function goto(id) {
    var list = sections();
    var hit = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list[i].classList.add('active'); hit = true; }
      else { list[i].classList.remove('active'); }
    }
    var items = document.querySelectorAll('[data-goto]');
    for (var j = 0; j < items.length; j++) {
      var on = items[j].getAttribute('data-goto') === id;
      items[j].classList.toggle('active', on);
    }
    if (hit) {
      var el = document.getElementById(id);
      var t = el.getAttribute('data-title') || id;
      document.title = t + ' · ' + APP_TITLE;
      if (location.hash !== '#' + id) { location.hash = '#' + id; }
    }
    return hit;
  }
  window.goto = goto;
  window.showPage = goto;

  /* 所有 [data-goto] 元素统一走事件代理，新增入口不必再绑监听 */
  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el.nodeType === 1) {
      if (el.hasAttribute && el.hasAttribute('data-goto')) {
        e.preventDefault();
        goto(el.getAttribute('data-goto'));
        return;
      }
      el = el.parentNode;
    }
  });

  function fromHash() {
    var id = (location.hash || '').replace(/^#/, '');
    if (!id) { return false; }
    var el = document.getElementById(id);
    if (!el || el.tagName.toLowerCase() !== 'section') { return false; }
    return goto(id);
  }

  if (!fromHash()) {
    var first = sections()[0];
    if (first) { goto(first.id); }
  }
  window.addEventListener('hashchange', fromHash);
})();
</script>

</body>
</html>
`;
}

// ────────────────────────────────────────────────────────────────
// 区域读写：唯一命中的守卫（§27.2「断言式替换」的落地）
// ────────────────────────────────────────────────────────────────

/** 读区域时先证明标记唯一命中——这是 §27.2「断言式替换」的守卫，命中数不为 1 就不动盘。 */
function readRegion(html, name) {
  const b = marker(name, 'BEGIN');
  const e = marker(name, 'END');
  const bi = html.indexOf(b);
  const ei = html.indexOf(e);
  if (bi === -1 || ei === -1) {
    throw new Fail(`缺少区域标记 ${name}（${b}）。该文件不是 scaffold 生成的，或标记被删改。`);
  }
  if (html.indexOf(b, bi + 1) !== -1 || html.indexOf(e, ei + 1) !== -1) {
    throw new Fail(`区域标记 ${name} 在文件中出现多次，无法确定插入点。`);
  }
  if (ei < bi) throw new Fail(`区域标记 ${name} 的 BEGIN/END 顺序颠倒。`);
  // 区域右界取 END 标记所在行的行首，并记下该行的缩进：插入时按同一缩进对齐，闭合标记不跑偏。
  const endLineStart = html.lastIndexOf('\n', ei - 1) + 1;
  const rawIndent = html.slice(endLineStart, ei);
  const endIndent = /^[ \t]*$/.test(rawIndent) ? rawIndent : '';
  return { begin: bi, end: ei, innerStart: bi + b.length, innerEnd: endLineStart, endIndent };
}

/** 在区域末尾（END 标记行之前）追加一块内容 */
function insertIntoRegion(html, name, block) {
  const span = readRegion(html, name);
  return html.slice(0, span.innerEnd) + block + '\n' + span.endIndent + html.slice(span.end);
}

/** 整体替换区域内容（init 用）。两侧补换行，避免块与标记粘连在同一行。 */
function replaceRegion(html, name, block) {
  const span = readRegion(html, name);
  return html.slice(0, span.innerStart) + '\n' + block + '\n' + span.endIndent + html.slice(span.end);
}

function regionText(html, name) {
  const span = readRegion(html, name);
  return html.slice(span.innerStart, span.innerEnd);
}

// ────────────────────────────────────────────────────────────────
// 文件级读取与定点插入
// ────────────────────────────────────────────────────────────────

function readFileOrFail(file) {
  if (!fs.existsSync(file)) throw new Fail(`文件不存在：${file}`);
  const html = fs.readFileSync(file, 'utf8');
  // 先证明四个区域标记都在，再动任何东西
  for (const r of REGIONS) readRegion(html, r);
  return html;
}

function existingPageIds(html) {
  const ids = [];
  const re = /<section\b[^>]*\bid\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) ids.push(m[1]);
  return ids;
}

/** 找到 <section id="…"> 的完整区间（含闭标签），用于 --after 定点插入 */
function findSection(html, id) {
  const openRe = new RegExp(`<section\\b[^>]*\\bid\\s*=\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'g');
  const om = openRe.exec(html);
  if (!om) return null;
  const tagRe = /<section\b[^>]*>|<\/section\s*>/g;
  tagRe.lastIndex = om.index;
  let depth = 0;
  let tm;
  while ((tm = tagRe.exec(html)) !== null) {
    if (tm[0].startsWith('</')) {
      depth--;
      if (depth === 0) return { start: om.index, end: tm.index + tm[0].length };
    } else if (!/\/>$/.test(tm[0])) {
      depth++;
    }
  }
  return null;
}

/** 取页面区段里现有 <section> 所在列的缩进，供 --after 插入时对齐 */
function pageIndent(html) {
  const span = readRegion(html, 'PAGES');
  const body = html.slice(span.innerStart, span.innerEnd);
  const m = /\n([ \t]*)<section\b/.exec(body);
  return m ? m[1] : PAGES_INDENT;
}

// ────────────────────────────────────────────────────────────────
// Token 文件的读取与校验（取值的唯一来源）
// ────────────────────────────────────────────────────────────────

/** 把 CSS 注释替换成等长空白：用于定位与括号扫描，避免注释里的字面量干扰 */
const maskComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));

/**
 * 取出 Token 声明所在的范围：有 :root{} 就只取它内部（真实设计规范都把 Token 放这里，
 * 文件里其他规则与我们无关）；没有 :root{} 就视为裸声明片段。
 */
function tokenScope(text) {
  const masked = maskComments(text);
  const m = /:root\s*\{/.exec(masked);
  if (!m) return text;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < masked.length; i++) {
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}') depth--;
    if (depth === 0) break;
  }
  if (depth !== 0) throw new Fail('Token 文件的 :root{} 括号不配平。');
  return text.slice(start, i);
}

/**
 * 读 Token 文件并抽取 --name: value 声明。
 * 抽取规则：优先取 :root{} 内；非 Token 声明（如 :root 里的 font-family）一律忽略——
 * 技能只接管 Token，不接管页面样式。同名重复定义直接报错（取值必须是唯一的）。
 *
 * 只抽不判：取值好不好不在这里判断，那是 verify L1-9 的职责。
 * 但两道守卫在这里把关——命名契约（能否被 verify 识别）与覆盖率（模板用到的变量是否齐备）。
 */
function loadTokens(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Fail(`Token 文件不存在：${file}`);
  let text = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
  if (/<\/style/i.test(text)) throw new Fail(`Token 文件含 </style>，拒绝写入：${file}`);

  const decls = [];
  const names = new Set();
  for (const piece of maskComments(tokenScope(text)).split(';')) {
    const dm = /^\s*--([a-zA-Z0-9-]+)\s*:\s*(\S[\s\S]*)$/.exec(piece);
    if (!dm) continue;
    const name = dm[1];
    const value = dm[2].trim();
    if (names.has(name)) throw new Fail(`Token 文件里 --${name} 重复定义（同一层级只应定义一次，取值必须唯一）。`);
    names.add(name);
    decls.push({ name, value });
  }
  if (!decls.length) throw new Fail(`Token 文件里没有任何 --name: value 声明：${file}`);

  const body = decls.map((d) => `--${d.name}: ${d.value};`).join('\n');
  return { file: abs, body, decls };
}

/** 把 Token 片段逐行加缩进：它落在 :root{} 内，需与闭合标记对齐 */
function indentBlock(text, indent) {
  return text.split('\n').map((l) => (l.trim() ? indent + l : '')).join('\n');
}

/**
 * 命名契约守卫。取值可以整套替换，但必须仍能被 verify 按名识别出文本色/背景色——
 * 否则 L1-9 会「全绿」，而那是空转的绿。宁可在这里失败。
 */
function assertTokenContract(tokens) {
  const text = tokens.decls.filter((d) => CONTRACT_TEXT.test(d.name));
  const bg = tokens.decls.filter((d) => CONTRACT_BG.test(d.name));
  if (!text.length) {
    throw new Fail(`${shortPath(tokens.file)} 里没有任何文本色 Token（须匹配 ${CONTRACT_TEXT}，如 --text-primary）。
  缺了它，verify L1-9 的对比度校验会空转通过——这是假绿，必须补齐命名。`);
  }
  if (!bg.length) {
    throw new Fail(`${shortPath(tokens.file)} 里没有任何背景色 Token（须匹配 ${CONTRACT_BG}，如 --bg-page）。`);
  }
}

/**
 * 覆盖率守卫。模板里每个 var(--x) 都必须在 Token 文件里有定义——
 * 缺一个就是一处静默失效的样式（浏览器不报错，只是那条规则作废）。
 * 这在「需求方给的规范只写了一半」时最容易发生，所以宁可在这里失败并列出缺口。
 */
function assertTokensCoverage(html, tokens) {
  const defined = new Set(tokens.decls.map((d) => d.name));
  const used = [...new Set([...html.matchAll(/var\(\s*--([a-zA-Z0-9-]+)\s*\)/g)].map((m) => m[1]))];
  const missing = used.filter((u) => !defined.has(u));
  if (missing.length) {
    throw new Fail(`Token 文件缺少原型要用到的 ${missing.length} 个变量：\n    ${missing.map((m) => `--${m}`).join('\n    ')}\n`
      + `  这些变量被模板或页面引用，但 ${shortPath(tokens.file)} 没有定义——浏览器不会报错，只会让对应样式静默失效。\n`
      + '  请把它们补进 Token 文件；若确实不需要，请一并删掉引用。');
  }
}

/** 交付物里不该出现本机绝对路径：能相对就相对，出了工作目录就只留文件名 */
function shortPath(abs) {
  const rel = path.relative(process.cwd(), abs);
  return rel && !rel.startsWith('..') ? rel : path.basename(abs);
}

/** 输出里标注取值来源：用户指定的文件，还是技能兜底基线 */
function tokenSourceLabel(tokens, custom) {
  return custom ? shortPath(tokens.file) : `技能兜底基线（${shortPath(tokens.file)}）`;
}

/** 写进原型 @TOKENS 区的内容：顶部一行标注取值来源，方便交接时追溯 */
function tokenRegionText(tokens, custom) {
  return `/* 设计 Token · 取值来源：${tokenSourceLabel(tokens, custom)}（references/05 §14.2） */\n${tokens.body}`;
}

// ────────────────────────────────────────────────────────────────
// 命令：init
// ────────────────────────────────────────────────────────────────

function parsePages(spec) {
  if (!spec) return [];
  return String(spec).split(',').map((s) => s.trim()).filter(Boolean).map((item) => {
    const [id, title, icon] = item.split(':').map((x) => (x || '').trim());
    if (!id || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
      throw new UsageError(`页面 id 非法：${id || item}（须以字母开头，只含字母数字下划线连字符）`);
    }
    return { id, title: title || id, icon: icon || DEFAULT_ICON, nav: true };
  });
}

function cmdInit(opts) {
  const out = opts.out;
  if (!out) throw new UsageError('init 需要 --out=<原型.html>');
  const title = opts.title || '产品原型';
  const app = opts.app || title;
  let pages = parsePages(opts.pages);
  if (!pages.length) pages = [{ id: 'workbench', title: '工作台', icon: 'i-dashboard', nav: true }];
  const seen = new Set();
  for (const p of pages) {
    if (seen.has(p.id)) throw new UsageError(`--pages 中 id 重复：${p.id}`);
    seen.add(p.id);
    if (!ICON_SET[p.icon]) throw new UsageError(`未知内置图标：${p.icon}（可用：node scripts/scaffold.mjs icons）`);
  }

  if (fs.existsSync(out) && !opts.force) {
    throw new Fail(`目标文件已存在：${out}（如需覆盖请加 --force）`);
  }

  // 取值来自 Token 文件：--tokens 指定则用指定的，否则用技能兜底基线
  const tokens = loadTokens(opts.tokens || DEFAULT_TOKENS_FILE);
  assertTokenContract(tokens);

  let html = buildTemplate({ title, app });
  html = replaceRegion(html, 'TOKENS', indentBlock(tokenRegionText(tokens, opts.tokens), TOKEN_INDENT));
  assertTokensCoverage(html, tokens);

  // 用真实页面列表替换占位的 nav / pages 区（片段自带缩进，不再二次叠加）
  const navBlock = pages.filter((p) => p.nav).map((p) => navItemMarkup(p.id, p.title, p.icon, NAV_INDENT)).join('\n');
  const pageBlock = pages.map((p) => pageMarkup(p.id, p.title, PAGES_INDENT)).join('\n');
  html = replaceRegion(html, 'NAV', navBlock);
  html = replaceRegion(html, 'PAGES', pageBlock);

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');

  report(`已生成 ${out}`, [
    `${pages.length} 个页面：${pages.map((p) => p.id).join(', ')}`,
    `${Object.keys(ICON_SET).length} 个内置图标 symbol`,
    `设计 Token ${tokens.decls.length} 项 ← ${tokenSourceLabel(tokens, opts.tokens)}`,
    `4 个区域标记：${REGIONS.map((r) => `@${r}`).join(' / ')}`,
  ], out);
  return 0;
}

// ────────────────────────────────────────────────────────────────
// 命令：add-page
// ────────────────────────────────────────────────────────────────

function cmdAddPage(opts, args) {
  const [file, id] = args;
  if (!file || !id) throw new UsageError('用法：add-page <原型.html> <page-id> --title=<名称>');
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
    throw new UsageError(`页面 id 非法：${id}（须以字母开头，只含字母数字下划线连字符）`);
  }
  const title = opts.title || id;
  const icon = opts.icon || DEFAULT_ICON;
  if (!ICON_SET[icon]) throw new UsageError(`未知内置图标：${icon}（可用：node scripts/scaffold.mjs icons）`);

  let html = readFileOrFail(file);
  if (existingPageIds(html).includes(id)) throw new Fail(`页面已存在：${id}（不做覆盖，请先改名或删除原页）`);

  // 1) 页面容器
  if (opts.after) {
    const target = findSection(html, opts.after);
    if (!target) throw new Fail(`--after 指定的页面不存在：${opts.after}`);
    const block = pageMarkup(id, title, pageIndent(html));
    html = html.slice(0, target.end) + '\n' + block + html.slice(target.end);
  } else {
    html = insertIntoRegion(html, 'PAGES', pageMarkup(id, title, PAGES_INDENT));
  }

  // 2) 导航项（除非 --no-nav）
  const navAdded = !opts.noNav;
  if (navAdded) {
    html = insertIntoRegion(html, 'NAV', navItemMarkup(id, title, icon, NAV_INDENT));
  }

  fs.writeFileSync(file, html, 'utf8');

  report(`已新增页面 ${id}`, [
    `页面容器：<section id="${id}" class="page">`,
    navAdded ? `导航项：data-goto="${id}"（图标 ${icon}）` : '导航项：未添加（--no-nav）',
    opts.after ? `位置：紧随 ${opts.after} 之后` : '位置：页面区末尾',
  ], file);
  return 0;
}

// ────────────────────────────────────────────────────────────────
// 命令：add-icon
// ────────────────────────────────────────────────────────────────

function cmdAddIcon(opts, args) {
  const [file, id] = args;
  if (!file || !id) throw new UsageError('用法：add-icon <原型.html> <icon-id> (--builtin=<name> | --path="<SVG 子元素>")');
  if (!/^i-[a-z0-9-]+$/.test(id)) throw new UsageError(`图标 id 须形如 i-xxx（小写字母数字连字符）：${id}`);

  let body;
  if (opts.path) body = opts.path;
  else if (opts.builtin) {
    // --builtin 可用内置名（可带 i- 前缀）
    const key = opts.builtin.startsWith('i-') ? opts.builtin : `i-${opts.builtin}`;
    if (!ICON_SET[key]) throw new UsageError(`未知内置图标：${opts.builtin}（可用：node scripts/scaffold.mjs icons）`);
    body = ICON_SET[key].body;
  } else {
    throw new UsageError('需要 --builtin=<name> 或 --path="<SVG 子元素>" 之一');
  }
  if (/<\s*(?:script|foreignObject)\b/i.test(body)) throw new UsageError('图标内容不得包含 script / foreignObject');

  let html = readFileOrFail(file);
  const icons = regionText(html, 'ICONS');
  if (new RegExp(`<symbol\\b[^>]*\\bid\\s*=\\s*"${id}"`).test(icons)) {
    throw new Fail(`图标已存在：${id}（不做覆盖）`);
  }

  const viewBox = opts.viewBox || '0 0 24 24';
  html = insertIntoRegion(html, 'ICONS', symbolMarkup(id, body, viewBox));
  fs.writeFileSync(file, html, 'utf8');

  report(`已新增图标 ${id}`, [`viewBox：${viewBox}`, `引用方式：<use href="#${id}"/>`], file);
  return 0;
}

// ────────────────────────────────────────────────────────────────
// 命令：set-tokens
// ────────────────────────────────────────────────────────────────

/**
 * 替换已有原型的设计 Token 区。典型场景：需求方在中途提供了公司设计规范，
 * 或原型当初用了兜底基线、现在要统一到规范上。
 * 只动 @TOKENS 区，页面主体与图标一律不碰。
 */
function cmdSetTokens(opts, args) {
  const [file] = args;
  if (!file) throw new UsageError('用法：set-tokens <原型.html> [--tokens=<token文件.css>]');
  const html = readFileOrFail(file);
  const tokens = loadTokens(opts.tokens || DEFAULT_TOKENS_FILE);
  assertTokenContract(tokens);

  const out = replaceRegion(html, 'TOKENS', indentBlock(tokenRegionText(tokens, opts.tokens), TOKEN_INDENT));
  assertTokensCoverage(out, tokens);
  fs.writeFileSync(file, out, 'utf8');

  report(`已替换 ${file} 的设计 Token 区`, [
    `${tokens.decls.length} 项 ← ${tokenSourceLabel(tokens, opts.tokens)}`,
    '仅替换 @TOKENS 区，页面主体与图标未改动',
  ], file);
  return 0;
}

// ────────────────────────────────────────────────────────────────
// 命令：list
// ────────────────────────────────────────────────────────────────

function relLum(c) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrast(a, b) {
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function parseColor(raw) {
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (h) {
    let s = h[1];
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
  }
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(raw);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3] };
}

function cmdList(args) {
  const [file] = args;
  if (!file) throw new UsageError('用法：list <原型.html>');
  const html = readFileOrFail(file);

  const pages = [];
  const re = /<section\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = /\bid\s*=\s*"([^"]+)"/.exec(m[1]);
    const dt = /\bdata-title\s*=\s*"([^"]*)"/.exec(m[1]);
    pages.push({ id: id ? id[1] : '(无 id)', title: dt ? dt[1] : '' });
  }
  const navs = [...html.matchAll(/data-goto\s*=\s*"([^"]+)"/g)].map((x) => x[1]);
  const defined = [...html.matchAll(/<symbol\b[^>]*\bid\s*=\s*"([^"]+)"/g)].map((x) => x[1]);
  const used = [...new Set([...html.matchAll(/<use\b[^>]*\bhref\s*=\s*"#([^"]+)"/g)].map((x) => x[1]))];

  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((x) => x[1]).join('\n');
  const tokenRe = /--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g;
  const tokens = [];
  let tm;
  while ((tm = tokenRe.exec(css)) !== null) tokens.push({ name: tm[1], raw: tm[2] });
  const isText = (n) => CONTRACT_TEXT.test(n);

  const out = [];
  out.push(`文件：${file}`);
  out.push('');
  out.push(`页面（${pages.length}）`);
  for (const p of pages) {
    const nav = navs.includes(p.id) ? '导航可达' : '无导航入口';
    out.push(`  ${p.id}${p.title ? `  「${p.title}」` : ''}  ${nav}`);
  }
  const deadNav = [...new Set(navs)].filter((n) => !pages.some((p) => p.id === n));
  if (deadNav.length) out.push(`  ⚠ 断链的导航目标：${deadNav.join(', ')}`);

  out.push('');
  out.push(`图标（定义 ${defined.length} / 引用 ${used.length}）`);
  const dangling = used.filter((u) => !defined.includes(u));
  if (dangling.length) out.push(`  ⚠ 悬空引用：${dangling.join(', ')}`);
  const unused = defined.filter((d) => !used.includes(d));
  if (unused.length) out.push(`  未被引用：${unused.join(', ')}`);

  out.push('');
  out.push('文本 Token 对白底对比度（references/05 §14.3 要求 ≥4.5:1）');
  for (const tk of tokens.filter((t) => isText(t.name))) {
    const c = parseColor(tk.raw);
    if (!c) continue;
    const r = contrast(c, { r: 255, g: 255, b: 255 });
    out.push(`  ${r + 1e-9 >= 4.5 ? '✓' : '✗'} --${tk.name}: ${tk.raw} → ${r.toFixed(2)}:1`);
  }

  out.push('');
  out.push(`区域标记：${REGIONS.map((r) => `@${r}`).join(' / ')}`);
  out.push(`下一步：node scripts/verify.mjs ${file} --layer=1`);
  process.stdout.write(out.join('\n') + '\n');
  return 0;
}

// ────────────────────────────────────────────────────────────────
// 命令：icons
// ────────────────────────────────────────────────────────────────

function cmdIcons() {
  const lines = ['内置线性图标（24×24 / 2px 描边 / fill 由 .icon 控制）', ''];
  for (const [id, meta] of Object.entries(ICON_SET)) {
    lines.push(`  ${id.padEnd(18)} ${meta.note}`);
  }
  lines.push('');
  lines.push('用法：node scripts/scaffold.mjs add-icon <原型.html> i-xxx --builtin=<上表任一 id>');
  process.stdout.write(lines.join('\n') + '\n');
  return 0;
}

// ────────────────────────────────────────────────────────────────
// 输出
// ────────────────────────────────────────────────────────────────

function report(headline, bullets, file) {
  const lines = [`✓ ${headline}`, ''];
  for (const b of bullets) lines.push(`  · ${b}`);
  lines.push('');
  lines.push('下一步');
  lines.push(`  1) 静态基线：node scripts/verify.mjs ${file} --layer=1`);
  lines.push(`  2) 页面主体填完后跑全三层：node scripts/verify.mjs ${file} --flow=<黄金流.json> --strict`);
  process.stdout.write(lines.join('\n') + '\n');
}

// ────────────────────────────────────────────────────────────────
// 入口
// ────────────────────────────────────────────────────────────────

const USAGE = `
用法：node scripts/scaffold.mjs <命令> [选项]

  init      生成原型骨架
            --out=<原型.html>（必需） --title=<浏览器标题> --app=<顶栏应用名>
            --pages=<id:名称[:内置图标 id],…>   默认 workbench:工作台
                                      图标须是内置 id（用 icons 子命令看列表）；
                                      要自定义图标先 init 再用 add-icon 追加
            --tokens=<token文件.css>     设计 Token 取值来源；不传则用技能兜底基线
            --force    覆盖已存在的文件

  add-page  追加页面（同步写入导航项，并做 id 唯一性守卫）
            add-page <原型.html> <page-id> --title=<名称> [--icon=i-list]
                      [--no-nav] [--after=<已有页面 id>]

  add-icon  追加图标 symbol
            add-icon <原型.html> <icon-id> (--builtin=<内置名> | --path="<SVG 子元素>")
                      [--view-box="0 0 24 24"]

  set-tokens  替换原型的设计 Token 区（需求方提供了设计规范时用）
            set-tokens <原型.html> [--tokens=<token文件.css>]   不传则重置为兜底基线

  list      打印页面 / 导航 / 图标 / Token 对比度 / 区域标记
  icons     打印内置图标集

退出码：0 成功 · 1 操作失败（锚点缺失 / id 重复 / 文件不存在） · 2 用法或环境错误

说明：脚手架只生成骨架——App Shell、设计 Token、图标 symbol、页面容器、路由、导航。
设计 Token 的取值不写在本脚本里，取自 Token 文件（默认 assets/default-tokens.css）：
需求方给了设计系统就用 --tokens=<规范.css> 覆盖；命名契约与 4.5:1 阈值见 references/05 §14.1。
页面主体（信息层级、状态覆盖、交互）一律留白给设计者，模板不替业务做决定。
生成后请立刻跑 verify.mjs 拿静态基线；页面主体填完再跑全三层。
`.trim();

function main(argv) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  const cmd = argv[0];
  if (cmd === 'icons') return cmdIcons();

  const opts = {};
  const args = [];
  for (const a of argv.slice(1)) {
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(a);
    if (m) {
      const [, k, v] = m;
      opts[k] = v === undefined ? true : v;
    } else {
      args.push(a);
    }
  }
  switch (cmd) {
    case 'init': return cmdInit({
      out: opts.out, title: opts.title, app: opts.app, pages: opts.pages,
      tokens: opts.tokens, force: !!opts.force,
    });
    case 'add-page': return cmdAddPage({
      title: opts.title, icon: opts.icon, noNav: !!opts['no-nav'], after: opts.after,
    }, args);
    case 'add-icon': return cmdAddIcon({
      builtin: opts.builtin, path: opts.path, viewBox: opts['view-box'],
    }, args);
    case 'set-tokens': return cmdSetTokens({ tokens: opts.tokens }, args);
    case 'list': return cmdList(args);
    default:
      throw new UsageError(`无法识别的命令：${cmd}（可用：init / add-page / add-icon / set-tokens / list / icons）`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  if (err instanceof UsageError) {
    process.stderr.write(`用法错误：${err.message}\n\n${USAGE}\n`);
    process.exitCode = 2;
  } else if (err instanceof Fail) {
    process.stderr.write(`操作失败：${err.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`意外错误：${err && err.stack ? err.stack : err}\n`);
    process.exitCode = 2;
  }
}
