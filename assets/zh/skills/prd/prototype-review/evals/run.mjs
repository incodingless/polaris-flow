#!/usr/bin/env node
/**
 * prd:prototype-review 评测器（零外部依赖，Node >= 18）
 *
 * 评的是「评审报告是否合规、可核查」，**不评「评审结论对不对」**——后者归人工按 ref07 §33 判。
 * 断言全部压在可判定的东西上，不掺主观：
 *   结论字段取值合法 / 三层验证有记录 / 五维都走过 / 每条问题都带等级 / 每条问题都带定位证据 /
 *   证据不足独立成节 / 评审对象 sha256 与实测一致（证明评审期间没动原型）/ 无「我顺手改了」类声称。
 *
 * 用法：
 *   node evals/run.mjs --list
 *   node evals/run.mjs --selftest                          # 参照物必须 PASS、反例必须 FAIL
 *   node evals/run.mjs --report=<报告.md> [--artifact=<原型.html>]
 *
 * 退出码：0 全部符合预期 · 1 有用例不符合预期 · 2 用法错误
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(EVAL_DIR, 'fixtures');
const REPORT_GOOD = path.join(FIX, 'reports', 'report-good.md');
const REPORT_THIN = path.join(FIX, 'reports', 'report-thin.md');
const ARTIFACT = path.join(FIX, 'artifacts', 'sample.html');

const VERDICTS = ['可交付', '修复后可交付', '不得交付'];
// 定位证据的合格形态（SKILL.md §三 Step 5）：判据出处 / 工具检查项 / 页面容器 / 具体分辨率
const EVIDENCE_RE = /§\d|verify L\d|L\d-\d+|section id=|1366×768|1440×900|1920×1080/;
// 「评审者声称改过原型」——评审最不该做的事
const CLAIM_EDITED_RE = /(顺手|已经?|我已)(修改|修复|改动|更新)|原型已(更新|改|修改)/;
const ID_RE = /\b[A-Z]{2,4}-\d{2,4}\b/g;

const USAGE = `
评测器 · prd:prototype-review

  --list                     列出用例与断言构成
  --selftest                 自证：参照物应 PASS、反例应 FAIL
  --report=<报告.md>         拿着自己的评审报告跑 r1 + r2
  --artifact=<原型.html>     被测原型（r2 用它验 sha256；不给则 r2 的哈希项跳过）
  --quiet                    只输出结论
  --help
`;

const readText = (p) => fs.readFileSync(p, 'utf8');
const has = (t, re) => re.test(t);
const linesWith = (t, token) => t.split('\n').filter((l) => l.includes(token));
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/** 逐行附上所在小节标题：等级可以由节标题承载（如「### P3 待确认」），定位证据不行。 */
function linesWithContext(text) {
  const out = [];
  let heading = '';
  for (const line of text.split('\n')) {
    if (/^#{2,6}\s/.test(line.trim())) heading = line.trim();
    out.push({ line, heading });
  }
  return out;
}

/** 每条已记录的问题都必须「在某处带等级」——行内或所在小节标题皆可 */
function everyIdHasGrade(text) {
  const ctx = linesWithContext(text);
  const ids = [...new Set(text.match(ID_RE) || [])];
  const missing = ids.filter(
    (id) => !ctx.some((c) => c.line.includes(id) && /P[0-3]/.test(`${c.heading}\n${c.line}`)),
  );
  return { ids, missing };
}

/** 每条已记录的问题都必须「在该行带定位证据」——不接受靠节标题蒙混（标题是维度名，不是证据） */
function everyIdHasEvidence(text) {
  const ids = [...new Set(text.match(ID_RE) || [])];
  const missing = ids.filter((id) => !linesWith(text, id).some((l) => EVIDENCE_RE.test(l)));
  return { ids, missing };
}

/** r1：报告结构与取证合规 */
function formChecks(text) {
  const ids = [...new Set(text.match(ID_RE) || [])];
  const idGrade = everyIdHasGrade(text);
  const idEvid = everyIdHasEvidence(text);
  const layerMiss = ['L1', 'L2', 'L3'].filter(
    (l) => !linesWith(text, l).some((line) => /PASS|FAIL|未执行/.test(line)),
  );
  return [
    {
      id: 'F1',
      label: '结论字段存在且取值合法',
      ok: has(text, /结论/) && VERDICTS.some((v) => text.includes(v)),
      detail: '需含「结论」且取值为 可交付 / 修复后可交付 / 不得交付',
    },
    {
      id: 'F2',
      label: '三层验证都有记录（PASS / FAIL / 未执行）',
      ok: layerMiss.length === 0,
      detail: layerMiss.length ? `缺记录或缺结论的层：${layerMiss.join(' / ')}` : 'L1 / L2 / L3 均已记录',
    },
    {
      id: 'F3',
      label: '五个维度都走过（业务 / 结构 / 交互 / 视觉 / 研发）',
      ok: ['业务', '结构', '交互', '视觉', '研发'].every((d) => text.includes(d)),
      detail: '查过的维度可以写「无」，但不得静默略过',
    },
    {
      id: 'F4',
      label: '每条问题都带等级',
      ok: idGrade.missing.length === 0,
      detail: idGrade.ids.length
        ? `已记录 ${idGrade.ids.length} 条问题；缺等级的：${idGrade.missing.join(' / ') || '无'}`
        : '报告未记录任何问题 ID（若确无问题，须在各维度标注「无」）',
    },
    {
      id: 'F5',
      label: '每条问题都带定位证据',
      ok: idEvid.missing.length === 0,
      detail: idEvid.ids.length
        ? `缺定位的：${idEvid.missing.join(' / ') || '无'}`
        : '报告未记录任何问题 ID',
    },
    {
      id: 'F6',
      label: '「证据不足与未执行项」独立成节',
      ok: has(text, /证据不足/),
      detail: '给不出结论的部分必须显式列出，不得混进问题清单，也不得当作通过',
    },
  ];
}

/** r2：只评不改 */
function panelChecks(text, artifactPath) {
  const recorded = (text.match(/\b[0-9a-f]{64}\b/) || [])[0] || null;
  let shaOk = false;
  let shaDetail = '报告未记录 sha256（评审对象指纹缺失）';
  if (recorded) {
    if (!artifactPath) {
      shaOk = true;
      shaDetail = `报告记录了 sha256，但未提供 --artifact，一致性未校验：${recorded.slice(0, 12)}…`;
    } else {
      const actual = sha256(artifactPath);
      shaOk = actual === recorded;
      shaDetail = shaOk
        ? `与实测一致：${actual.slice(0, 12)}…`
        : `报告记录 ${recorded.slice(0, 12)}… ≠ 实测 ${actual.slice(0, 12)}…（评审期间原型被改动？）`;
    }
  }
  return [
    {
      id: 'P1',
      label: '记录评审对象 sha256',
      ok: Boolean(recorded),
      detail: recorded ? recorded.slice(0, 12) + '…' : '报告里找不到 64 位十六进制指纹',
    },
    { id: 'P2', label: 'sha256 与实测一致（评审期间未改动原型）', ok: shaOk, detail: shaDetail },
    {
      id: 'P3',
      label: '没有「我顺手改了」类声称',
      ok: !CLAIM_EDITED_RE.test(text),
      detail: (text.match(CLAIM_EDITED_RE) || ['未命中'])[0],
    },
    {
      id: 'P4',
      label: '有「只评不改」声明',
      ok: has(text, /只评不改/),
      detail: '缺声明 → 评审模式可能顺手改原型',
    },
  ];
}

const CASES = {
  r1: {
    label: 'r1 报告结构与取证合规',
    run: (text) => formChecks(text),
    reference: { name: '参照物 report-good.md', text: () => readText(REPORT_GOOD) },
    counterexamples: [
      { name: '反例 report-thin.md（只给结论与总评）', text: () => readText(REPORT_THIN) },
    ],
  },
  r2: {
    label: 'r2 只评不改（指纹一致 + 无改动声称）',
    run: (text, artifact) => panelChecks(text, artifact),
    reference: { name: '参照物 report-good.md + sample.html', text: () => readText(REPORT_GOOD) },
    counterexamples: [
      {
        name: '派生反例：评审期间原型被改动（记录的 sha256 与实测不符）',
        text: () => readText(REPORT_GOOD).replace(/\b[0-9a-f]{64}\b/, 'f'.repeat(64)),
      },
      {
        name: '派生反例：报告声称顺手修复过原型',
        text: () =>
          readText(REPORT_GOOD) + '\n> 说明：评审期间顺手修复了 3 处 Token 对比度问题，原型已更新。\n',
      },
    ],
  },
};

function evaluate(text, artifactPath) {
  return {
    r1: { checks: formChecks(text), pass: formChecks(text).every((c) => c.ok) },
    r2: { checks: panelChecks(text, artifactPath), pass: panelChecks(text, artifactPath).every((c) => c.ok) },
  };
}

function printChecks(res, quiet) {
  if (quiet) return;
  for (const c of res.checks) {
    console.log(`   ${c.ok ? '✓' : '✗'} ${c.id} ${c.label}`);
    if (!c.ok) console.log(`       ${c.detail}`);
  }
}

function selftest(quiet) {
  const artifact = fs.existsSync(ARTIFACT) ? ARTIFACT : null;
  let bad = 0;
  for (const [key, c] of Object.entries(CASES)) {
    console.log(`\n${c.label}`);
    const ref = evaluate(c.reference.text(), artifact)[key];
    const expectRef = 'PASS';
    const gotRef = ref.pass ? 'PASS' : 'FAIL';
    const refOk = gotRef === expectRef;
    if (!refOk) bad += 1;
    console.log(`  ${refOk ? '✓' : '✗'} ${c.reference.name} 判定 = ${gotRef}（期望 ${expectRef}）`);
    printChecks(ref, quiet);

    for (const ce of c.counterexamples) {
      const r = evaluate(ce.text(), artifact)[key];
      const got = r.pass ? 'PASS' : 'FAIL';
      const ok = got === 'FAIL';
      if (!ok) bad += 1;
      console.log(`  ${ok ? '✓' : '✗'} ${ce.name} 判定 = ${got}（期望 FAIL）`);
      printChecks(r, quiet);
    }
  }
  console.log(
    bad === 0
      ? '\n✓ 自证通过：参照物全过、反例全被拦下（断言有牙齿）'
      : `\n✗ 自证失败：${bad} 处不符合预期——断言写松了或写歪了，先修断言再信它`,
  );
  return bad === 0 ? 0 : 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log(USAGE);
    return args.length === 0 ? 2 : 0;
  }
  const quiet = args.includes('--quiet');
  if (args.includes('--list')) {
    for (const [key, c] of Object.entries(CASES)) {
      console.log(`\n${c.label}`);
      const probe = c.run(c.reference.text(), fs.existsSync(ARTIFACT) ? ARTIFACT : null);
      for (const x of probe) console.log(`  ${x.id} ${x.label}`);
      console.log(`  参照物：${c.reference.name}`);
      for (const ce of c.counterexamples) console.log(`  反例：${ce.name}`);
    }
    return 0;
  }
  if (args.includes('--selftest')) return selftest(quiet);

  const reportArg = args.find((a) => a.startsWith('--report='));
  if (!reportArg) {
    console.error('用法错误：需要 --report=<报告.md>（或用 --selftest / --list）');
    return 2;
  }
  const reportPath = reportArg.slice('--report='.length);
  const artifactArg = args.find((a) => a.startsWith('--artifact='));
  const artifactPath = artifactArg ? artifactArg.slice('--artifact='.length) : null;
  if (!fs.existsSync(reportPath)) {
    console.error(`用法错误：报告不存在 ${reportPath}`);
    return 2;
  }
  if (artifactPath && !fs.existsSync(artifactPath)) {
    console.error(`用法错误：原型不存在 ${artifactPath}`);
    return 2;
  }
  const text = readText(reportPath);
  let fail = 0;
  for (const [key, c] of Object.entries(CASES)) {
    const res = c.run(text, artifactPath);
    const pass = res.every((x) => x.ok);
    if (!pass) fail += 1;
    console.log(`\n${c.label} → ${pass ? 'PASS' : 'FAIL'}`);
    printChecks({ checks: res }, quiet);
  }
  return fail === 0 ? 0 : 1;
}

process.exit(main());
