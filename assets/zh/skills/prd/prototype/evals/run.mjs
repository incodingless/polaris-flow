#!/usr/bin/env node
/**
 * generate-prototype 评测器（零外部依赖，Node >= 18）
 *
 * 评的是「技能能不能按需求正确交付原型」，所以判定尽量压在**可执行**的东西上：
 * verify 的退出码、产物里必须出现 / 不允许出现的标记、守卫是否按预期失败。
 * 需要审美与业务判断的断言单列为 manual，只提示、不影响退出码。
 *
 * 用法：
 *   node evals/run.mjs --list
 *   node evals/run.mjs --case=e1 --artifact=<模型产出的原型.html>
 *   node evals/run.mjs --case=e2                      # 自带夹具，不需要模型产出
 *   node evals/run.mjs --selftest                     # 自证：reference 必须 PASS、反例必须 FAIL
 *
 * 退出码：0 全部符合预期 · 1 有用例不符合预期 · 2 用法错误
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(EVAL_DIR, '..');
const WORK = path.join(EVAL_DIR, '.work');
const NODE = process.execPath;

const abs = (rel) => (path.isAbsolute(rel) ? rel : path.join(ROOT, rel));
const rel = (p) => path.relative(ROOT, p) || p;

const USAGE = `
评测器 · generate-prototype

  --list                     列出用例与断言的构成
  --case=<id>[,<id>…]        跑指定用例（默认全部）
  --artifact=<原型.html>     被测产物；e1 / e3 需要，e2 自带夹具不需要
  --flow=<黄金流.json>       覆盖用例里的黄金流定义（每个原型的流程不同，不覆盖会绑死在样例上）
  --selftest                 自证模式：对 reference 跑（应全过）与 counterexample 跑（应失败）
  --quiet                    只输出每例结论
  --help

退出码：0 符合预期 · 1 不符合预期 · 2 用法错误
`;

const C = { ok: '✓', bad: '✗', skip: '·', note: '⋯' };
let caseSeq = 0;
const tmpFile = (tag) => path.join(WORK, `${tag}-${process.pid}-${(caseSeq += 1)}.json`);

/** 清理是副作用，不是判据：删不掉也不要让评测崩掉（某些环境给 fs 删除加了守卫） */
function tryRemove(target) {
  try { fs.rmSync(target, { force: true }); return true; } catch (e) { return false; }
}

function runNode(script, args) {
  const r = spawnSync(NODE, [script, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status === null ? -1 : r.status, out: r.stdout || '', err: r.stderr || '' };
}

function resolveTarget(spec, ctx) {
  if (!spec) return null;
  if (spec === 'reference') return ctx.reference ? abs(ctx.reference) : null;
  if (spec === 'artifact') return ctx.artifact ? abs(ctx.artifact) : null;
  if (spec === 'scaffoldOut') return ctx.scaffoldOut || null;
  return abs(spec);
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
}

/* ── 各类型断言的实现 ─────────────────────────────────────────── */

function checkVerify(c, ctx) {
  const target = resolveTarget(c.target, ctx);
  if (!target) return { ok: false, evidence: ['缺少被测产物：请用 --artifact=<原型.html> 指定'] };
  if (!fs.existsSync(target)) return { ok: false, evidence: [`产物不存在：${rel(target)}`] };

  const json = tmpFile('verify');
  const args = [target];
  if (c.layers) args.push(`--layer=${c.layers}`);
  // --flow 可用命令行覆盖：每个原型的黄金流不同，用例里写死 example 的流程会让断言绑死在样例上
  const flow = ctx.flow || c.flow;
  if (flow) args.push(`--flow=${abs(flow)}`);
  if (c.strict) args.push('--strict');
  args.push(`--json=${json}`);
  const r = runNode(abs('scripts/verify.mjs'), args);

  let report = null;
  try { report = JSON.parse(fs.readFileSync(json, 'utf8')); } catch (e) { /* 保留下面报错 */ }
  if (fs.existsSync(json)) tryRemove(json);
  if (!report) {
    return { ok: false, evidence: [`verify 未产出可读报告（退出码 ${r.code}）`, ...r.err.split('\n').filter(Boolean).slice(0, 3)] };
  }

  const hard = report.hard || 0;
  const warn = report.warn || 0;
  const problems = [];
  if (typeof c.expectExit === 'number' && r.code !== c.expectExit) problems.push(`退出码 ${r.code}，期望 ${c.expectExit}`);
  if (typeof c.maxHard === 'number' && hard > c.maxHard) problems.push(`HARD ${hard} 超过上限 ${c.maxHard}`);
  if (typeof c.maxWarn === 'number' && warn > c.maxWarn) problems.push(`WARN ${warn} 超过上限 ${c.maxWarn}`);
  if (typeof c.minHard === 'number' && hard < c.minHard) problems.push(`HARD ${hard} 少于下限 ${c.minHard}`);

  const evidence = [`退出码 ${r.code} · HARD ${hard} · WARN ${warn}`];
  for (const f of (report.findings || []).slice(0, 4)) {
    evidence.push(`[${f.severity}] ${f.id} ${f.title}`);
  }
  return { ok: problems.length === 0, evidence: [...problems, ...evidence] };
}

function checkScaffold(c, ctx) {
  fs.mkdirSync(WORK, { recursive: true });
  const out = abs(c.out);
  if (fs.existsSync(out)) tryRemove(out); // 先清掉，验证「失败路径不落盘」才成立
  const args = [
    'init',
    `--out=${out}`,
    '--title=评测原型',
    '--app=评测台',
    `--pages=${c.pages || 'workbench:工作台:i-dashboard,order-list:订单列表:i-list'}`,
    `--tokens=${abs(c.tokens)}`,
    '--force',
  ];
  const r = runNode(abs('scripts/scaffold.mjs'), args);
  ctx.scaffoldOut = out;
  const problems = [];
  if (typeof c.expectExit === 'number' && r.code !== c.expectExit) problems.push(`退出码 ${r.code}，期望 ${c.expectExit}`);
  const firstLine = `${r.out}\n${r.err}`.split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
  return { ok: problems.length === 0, evidence: [...problems, `退出码 ${r.code}｜${firstLine}`] };
}

function checkContains(c, ctx) {
  const target = resolveTarget(c.target, ctx);
  const text = target ? readText(target) : null;
  if (text === null) return { ok: false, evidence: [`读不到文件：${target ? rel(target) : '(未指定)'}`] };
  const missing = (c.values || []).filter((v) => !text.includes(v));
  return { ok: missing.length === 0, evidence: missing.length ? [`缺少：${missing.join('、')}`] : [`${(c.values || []).length} 项全部命中`] };
}

function checkAbsent(c, ctx) {
  const target = resolveTarget(c.target, ctx);
  const text = target ? readText(target) : null;
  if (text === null) return { ok: false, evidence: [`读不到文件：${target ? rel(target) : '(未指定)'}`] };
  const found = (c.values || []).filter((v) => text.includes(v));
  return { ok: found.length === 0, evidence: found.length ? [`不该出现却出现了：${found.join('、')}`] : ['未出现任何禁止项'] };
}

function checkRegex(c, ctx, wantMatch) {
  const target = resolveTarget(c.target, ctx);
  const text = target ? readText(target) : null;
  if (text === null) return { ok: false, evidence: [`读不到文件：${target ? rel(target) : '(未指定)'}`] };
  const bad = [];
  for (const p of (c.patterns || [])) {
    let re;
    try { re = new RegExp(p, 'u'); } catch (e) { bad.push(`${p}（正则非法）`); continue; }
    const hit = re.test(text);
    if (wantMatch && !hit) bad.push(`未匹配：${p}`);
    if (!wantMatch && hit) bad.push(`命中禁止模式：${p}`);
  }
  return {
    ok: bad.length === 0,
    evidence: bad.length ? bad : [wantMatch ? `${(c.patterns || []).length} 组模式均已匹配` : '未命中任何禁止模式'],
  };
}

function checkNotExists(c, ctx) {
  const target = resolveTarget(c.target, ctx);
  if (!target) return { ok: false, evidence: ['未指定路径'] };
  return { ok: !fs.existsSync(target), evidence: [fs.existsSync(target) ? `文件被写出来了：${rel(target)}` : `确认未落盘：${rel(target)}`] };
}

function checkManual(c) {
  return { ok: true, manual: true, evidence: c.items || [] };
}

function runCheck(c, ctx) {
  switch (c.type) {
    case 'verify': return checkVerify(c, ctx);
    case 'scaffold': return checkScaffold(c, ctx);
    case 'contains': return checkContains(c, ctx);
    case 'absent': return checkAbsent(c, ctx);
    case 'regexPresent': return checkRegex(c, ctx, true);
    case 'regexAbsent': return checkRegex(c, ctx, false);
    case 'notExists': return checkNotExists(c, ctx);
    case 'manual': return checkManual(c);
    default: return { ok: false, evidence: [`未知断言类型 ${c.type}`] };
  }
}

/* ── 用例执行 ─────────────────────────────────────────────────── */

function runCase(testCase, opts) {
  const ctx = {
    artifact: opts.artifact,
    reference: testCase.referenceArtifact,
    scaffoldOut: null,
    flow: opts.flow || null,
  };
  if (!testCase.selfContained && !ctx.artifact) {
    return { id: testCase.id, name: testCase.name, errored: `缺少 --artifact（本用例需要模型产出的原型）` };
  }
  fs.mkdirSync(WORK, { recursive: true });

  const results = [];
  for (const c of testCase.checks) {
    const r = runCheck(c, ctx);
    results.push({ check: c, ...r });
    if (!r.ok && c.optional) { results[results.length - 1].ok = true; results[results.length - 1].soft = true; }
  }
  const failed = results.filter((r) => !r.ok);
  return { id: testCase.id, name: testCase.name, results, failed: failed.length, passed: failed.length === 0 };
}

function printCase(res, quiet) {
  if (res.errored) {
    console.log(`\n${C.bad} ${res.id} ${res.name}`);
    console.log(`   ${res.errored}`);
    return;
  }
  const head = res.passed ? `${C.ok} PASS` : `${C.bad} FAIL`;
  console.log(`\n${head}  ${res.id} · ${res.name}`);
  for (const r of res.results) {
    if (quiet && r.ok && !r.manual && !r.soft) continue;
    const mark = r.manual ? C.note : (r.ok ? (r.soft ? C.note : C.ok) : C.bad);
    const suffix = r.manual ? '  （需人工 / 评审判定）' : (r.soft ? '  （软性，不判失败）' : '');
    console.log(`   ${mark} ${r.check.label || r.check.type}${suffix}`);
    if (!quiet || !r.ok || r.manual) {
      for (const e of (r.evidence || []).slice(0, r.manual ? 8 : 5)) console.log(`       ${e}`);
    }
  }
}

/* ── 主流程 ───────────────────────────────────────────────────── */

function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  if (argv.includes('--help') || argv.length === 0) { console.log(USAGE); process.exit(argv.length === 0 ? 2 : 0); }

  const casesFile = path.join(EVAL_DIR, 'cases.json');
  const spec = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
  const all = spec.cases || [];

  if (argv.includes('--list')) {
    for (const c of all) {
      console.log(`\n${c.id} · ${c.name}`);
      console.log(`   目标：${c.goal}`);
      console.log(`   输入：${c.input}`);
      console.log(`   断言：${c.checks.length} 项（${c.checks.map((x) => x.type).join(' / ')}）`);
      if (c.referenceArtifact) console.log(`   参照产物：${c.referenceArtifact}`);
      if (c.counterexample) console.log(`   反例：${c.counterexample}`);
    }
    console.log('');
    process.exit(0);
  }

  const quiet = argv.includes('--quiet');
  const pick = arg('case');
  const selected = pick ? all.filter((c) => pick.split(',').includes(c.id)) : all;
  if (!selected.length) { console.error(`没有匹配的用例：${pick}`); process.exit(2); }

  /* 自证模式：reference 必须全过，counterexample 必须失败 */
  if (argv.includes('--selftest')) {
    let bad = 0;
    console.log('自证模式：reference 应 PASS，反例应 FAIL');
    for (const c of all) {
      const refTarget = c.selfContained ? null : (c.referenceArtifact ? { artifact: c.referenceArtifact } : null);
      if (c.selfContained || c.referenceArtifact) {
        const res = runCase(c, refTarget || {});
        printCase(res, quiet);
        const expectPass = res.passed === true;
        console.log(`   ${expectPass ? C.ok : C.bad} 参照物判定 = ${res.passed ? 'PASS' : 'FAIL'}（期望 PASS）`);
        if (!expectPass) bad += 1;
      }
      if (c.counterexample) {
        const res = runCase(c, { artifact: c.counterexample });
        printCase(res, quiet);
        const expectFail = res.passed === false;
        console.log(`   ${expectFail ? C.ok : C.bad} 反例判定 = ${res.passed ? 'PASS' : 'FAIL'}（期望 FAIL，证明断言有牙齿）`);
        if (!expectFail) bad += 1;
      }
    }
    console.log(`\n${bad === 0 ? C.ok + ' 自证通过' : C.bad + ' 自证失败'}：${bad} 处不符合预期\n`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const artifact = arg('artifact');
  const flow = arg('flow');
  let failed = 0;
  for (const c of selected) {
    const res = runCase(c, { artifact, flow });
    printCase(res, quiet);
    if (res.errored || !res.passed) failed += 1;
  }
  const total = selected.length;
  console.log(`\n${failed === 0 ? C.ok + ' 全部符合预期' : C.bad + ` ${failed} / ${total} 个用例不符合预期`}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
