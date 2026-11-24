#!/usr/bin/env node
/**
 * 附带技能（`devops/vendor/bundled-skills/`）的版本检查与升级。
 *
 * 为什么是 .mjs 而不是 .sh：要做的事是「解析 TS 里的钉值 → 改 TS → 重写技能目录 →
 * 改 PROVENANCE 表格行」，全靠文本处理。用 bash + awk 实现又长又脆，
 * 而 node 本来就是本仓硬依赖（`>= 20`），与其拼命令不如直接写。
 *
 * 钉值唯一来源是 `src/core/deps/registry.ts` 的 DEPENDENCIES 中 method.kind === 'github-copy'
 * 的条目；脚本从 TS 文本解析，不 import，以便未构建（无 dist）时也能跑。
 *
 * 用法：
 *   node devops/sync-bundled-skills.mjs            只检查：钉值 vs 上游最新，不打任何文件
 *   node devops/sync-bundled-skills.mjs --update   升级：改写钉值 + 重拉 vendor + 更新 PROVENANCE
 *   node devops/sync-bundled-skills.mjs --help
 *
 * 退出码：0 = 都最新 / 已升级；1 = 有新版（检查模式）；2 = 出错。
 *
 * 边界：
 * - 检查模式只读，连临时目录都不建。
 * - 升级模式先拉到临时目录，成功后才替换 vendor 里的旧目录；失败不留半成品。
 * - 不碰 `assets/`、不碰用户项目里的 `.claude/skills/`、不碰 `~/.polaris/components/`。
 *   `~/.polaris/components` 会在下次 polaris init 时因版本标记不一致自动重拉。
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_FILE = path.join(ROOT, 'src/core/deps/registry.ts');
const VENDOR_DIR = path.join(ROOT, 'devops/vendor/bundled-skills');
const REF_MARKER = '.polaris-bundled-ref';

const args = new Set(process.argv.slice(2));
if (args.has('--help') || args.has('-h')) {
  console.log(
    [
      '用法: node devops/sync-bundled-skills.mjs [--update]',
      '',
      '  无参数     只检查上游是否有新版（只读，不改文件）',
      '  --update   升级到上游最新：改钉值 + 重拉 devops/vendor/bundled-skills + 更新 PROVENANCE',
      '',
      '钉值唯一来源: src/core/deps/registry.ts 的 DEPENDENCIES（method.kind: github-copy）',
    ].join('\n'),
  );
  process.exit(0);
}
const DO_UPDATE = args.has('--update');

//---------------------------------
//         1. 解析当前钉值
//---------------------------------

/**
 * 从 registry.ts 解析 DEPENDENCIES 中 method.kind === 'github-copy' 的条目。
 * 按顶层 `{ ... },` 块切分，避免把 probe / method 的嵌套对象误当成条目。
 * 用文本正则而非 import：脚本要在未构建（无 dist）时也能跑。
 */
function readSpecs() {
  const source = fs.readFileSync(SPEC_FILE, 'utf-8');
  const start = source.indexOf('export const DEPENDENCIES');
  if (start === -1) {
    throw new Error('找不到 DEPENDENCIES，registry.ts 结构已变，请先更新本脚本');
  }
  const block = source.slice(start);
  const entryRe = /^  \{\r?\n([\s\S]*?)^  \},?\r?$/gm;
  const specs = [];
  let match;
  while ((match = entryRe.exec(block)) !== null) {
    const chunk = match[1];
    if (!/kind:\s*'github-copy'/.test(chunk)) continue;
    const pick = (re) => chunk.match(re)?.[1];
    const id = pick(/^\s*id:\s*'([^']+)'/m);
    const name = pick(/targetDirName:\s*'([^']+)'/) ?? id;
    const repo = pick(/repo:\s*'([^']+)'/);
    const version = pick(/pin:\s*\{\s*version:\s*'([^']+)'\s*\}/);
    const commit = pick(/pin:\s*\{\s*commit:\s*'([^']+)'\s*\}/);
    const subdir = pick(/subdir:\s*'([^']+)'/);
    if (!id || !repo) {
      throw new Error(`条目 ${id ?? '?'} 缺 id 或 repo，registry.ts 结构已变`);
    }
    specs.push({ id, name, repo, version, commit, subdir });
  }
  if (specs.length === 0) {
    throw new Error('未解析到任何 github-copy 条目，registry.ts 结构已变');
  }
  return specs;
}

//---------------------------------
//         2. 查询上游
//---------------------------------

// 超时阈值：对齐 src/core/deps/github.ts（ls-remote 60s，clone/fetch 180s）
const LS_REMOTE_TIMEOUT_MS = 60_000;
const CLONE_TIMEOUT_MS = 180_000;

/** 从 git 参数里抽出子命令（跳过 `-C <dir>` 与其余 flag） */
function gitSubcommand(gitArgs) {
  for (let i = 0; i < gitArgs.length; i++) {
    const arg = gitArgs[i];
    if (arg === '-C') {
      i += 1; // 跳过 `-C` 后的目录参数
      continue;
    }
    if (!arg.startsWith('-')) return arg;
  }
  return gitArgs[0];
}

/** 跑一条 git 命令，返回 stdout；失败抛错（含 stderr 摘要）。 */
function git(gitArgs, { allowFail = false } = {}) {
  const timeout = gitSubcommand(gitArgs) === 'ls-remote' ? LS_REMOTE_TIMEOUT_MS : CLONE_TIMEOUT_MS;
  try {
    return execFileSync('git', gitArgs, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }).trim();
  } catch (error) {
    if (allowFail) return '';
    const msg = error.message || '';
    const timedOut =
      error.code === 'ETIMEDOUT' ||
      error.killed === true ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('timed out');
    if (timedOut) {
      throw new Error(
        `git ${gitArgs.join(' ')} 超时（${Math.round(timeout / 1000)} 秒无响应，网络可能很慢）`,
      );
    }
    const stderr = (error.stderr || '').toString().trim();
    throw new Error(`git ${gitArgs.join(' ')} 失败: ${stderr || error.message}`);
  }
}

/** 识别网络类故障：这类错误换 tag 命名形式重试只是白等一次超时 */
function isNetworkError(message) {
  return /timed?\s*out|timeout|ETIMEDOUT|Couldn't connect|Failed to connect|Empty reply|Recv failure|Connection refused|network is unreachable|超时/i.test(
    message || '',
  );
}

/**
 * 按镜像改写 GitHub URL（镜像来源：环境变量 POLARIS_GITHUB_MIRROR）。
 * ⚠️ 与 src/core/deps/github.ts 的 rewriteGithubRepoUrl 保持一致——改逻辑须同步两处。
 * 本脚本刻意自包含（不 import TS），故内联此等价实现。
 * 镜像含 github.com 时替换主机前缀；否则把原 URL 接到镜像基址后面。
 */
function rewriteGithubRepoUrl(repo, mirror = process.env.POLARIS_GITHUB_MIRROR) {
  const m = (mirror ?? '').trim();
  if (!m) return repo;
  const base = m.replace(/\/$/, '');
  if (!repo.startsWith('https://github.com')) return repo;
  if (base.includes('github.com')) return repo.replace('https://github.com', base);
  return `${base}/${repo}`;
}

/** 简易 semver 比较（只处理 x.y.z 与可选前缀 v） */
function compareSemver(a, b) {
  const norm = (v) =>
    v
      .replace(/^v/, '')
      .split(/[.+-]/)
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * 查上游最新：有 tag 的技能取最大 tag，钉 SHA 的技能取默认分支 HEAD。
 * 返回 `{ ref, refType }`，`refType` 为 `tag` 或 `commit`。
 */
function resolveUpstream(spec, repoUrl) {
  if (spec.commit) {
    const out = git(['ls-remote', repoUrl, 'HEAD']);
    const sha = out.split(/\s+/)[0];
    if (!sha) throw new Error(`${spec.name}: 取不到上游 HEAD`);
    return { ref: sha, refType: 'commit' };
  }
  const out = git(['ls-remote', '--tags', '--refs', repoUrl]);
  const tags = out
    .split('\n')
    .map((line) => line.split(/\s+/)[1] || '')
    .filter((ref) => ref.startsWith('refs/tags/'))
    .map((ref) => ref.replace('refs/tags/', ''))
    // 排除 prerelease 与无数字 tag，避免把 `nightly` 之类当成新版
    .filter((tag) => /^v?\d/.test(tag) && !/-(alpha|beta|rc)/i.test(tag));
  if (tags.length === 0) {
    throw new Error(`${spec.name}: 上游没有任何版本 tag（若已改为钉 SHA，请更新 SPECS）`);
  }
  // 去掉 `v` 前缀：TS 里钉的是 `3.2.0` 这种裸版本号，运行时 fetchRepo 自己会补 `v`
  const latest = tags.sort(compareSemver).pop().replace(/^v/, '');
  return { ref: latest, refType: 'tag' };
}

//---------------------------------
//         3. 升级动作
//---------------------------------

/** 拉上游到临时目录：tag 用 clone --branch，SHA 用 init+fetch（clone 不认 SHA） */
function fetchToTemp(spec, upstream, repoUrl) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `polaris-sync-${spec.name}-`));
  if (upstream.refType === 'tag') {
    const candidates = [`v${upstream.ref.replace(/^v/, '')}`, upstream.ref];
    let lastError;
    for (const ref of candidates) {
      try {
        git(['clone', '--depth', '1', '--branch', ref, repoUrl, tmp]);
        return tmp;
      } catch (error) {
        lastError = error;
        // 网络故障下换命名形式再试只会白等一次超时，直接失败并保留真实原因
        if (isNetworkError(error.message)) break;
      }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(
      `${spec.name}: clone tag ${upstream.ref} 失败（${repoUrl}）: ${(lastError?.message || '未知错误').trim()}`,
    );
  } else {
    try {
      git(['-C', tmp, 'init', '-q']);
      git(['-C', tmp, 'remote', 'add', 'origin', repoUrl]);
      git(['-C', tmp, 'fetch', '--depth', '1', 'origin', upstream.ref]);
      git(['-C', tmp, 'checkout', '-q', 'FETCH_HEAD']);
    } catch (error) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw error;
    }
  }
  return tmp;
}

/** 覆盖 vendor 里的技能目录：先拷到临时目标，成功后再换掉旧目录 */
function replaceVendorSkill(spec, tmpRepo, upstream) {
  const src = spec.subdir ? path.join(tmpRepo, spec.subdir) : tmpRepo;
  if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
    throw new Error(`${spec.name}: 上游 ${spec.subdir ?? '.'}/SKILL.md 不存在`);
  }
  const staging = `${path.join(VENDOR_DIR, spec.name)}.new`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(src, staging, { recursive: true });

  // 与运行时的裁剪规则保持一致（DEPENDENCIES 中 github-copy 条目的 exclude）
  if (spec.name === 'archify') {
    const examples = path.join(staging, 'examples');
    if (fs.existsSync(examples)) {
      for (const file of fs.readdirSync(examples)) {
        if (file.endsWith('.html')) fs.rmSync(path.join(examples, file), { force: true });
      }
    }
  }

  fs.writeFileSync(path.join(staging, REF_MARKER), `${upstream.ref}\n`, 'utf-8');

  const target = path.join(VENDOR_DIR, spec.name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(staging, target);
}

/** 改写 registry.ts 里的钉值（只动对应 github-copy 条目内的 pin 行） */
function rewriteSpec(source, spec, upstream) {
  const start = source.indexOf('export const DEPENDENCIES');
  if (start === -1) throw new Error('找不到 DEPENDENCIES，registry.ts 结构已变');
  const head = source.slice(0, start);
  const block = source.slice(start);
  const entryRe = /^  \{\r?\n([\s\S]*?)^  \},?\r?$/gm;
  let match;
  let target = null;
  while ((match = entryRe.exec(block)) !== null) {
    if (new RegExp(`^\\s*id:\\s*'${spec.id}'`, 'm').test(match[1])) {
      target = match;
      break;
    }
  }
  if (!target) throw new Error(`${spec.id}: registry.ts 里找不到该条目`);

  const chunk = target[0];
  const field = spec.commit ? 'commit' : 'version';
  const pattern = new RegExp(`(pin:\\s*\\{\\s*${field}:\\s*')[^']*('\\s*\\})`);
  if (!pattern.test(chunk)) {
    throw new Error(`${spec.id}: 条目里找不到 pin.${field} 字段`);
  }
  const nextChunk = chunk.replace(pattern, `$1${upstream.ref}$2`);
  if (nextChunk === chunk && (spec.commit ?? spec.version ?? '') !== upstream.ref) {
    throw new Error(`${spec.id}: 改写 pin.${field} 失败`);
  }
  return {
    source:
      head + block.slice(0, target.index) + nextChunk + block.slice(target.index + chunk.length),
    changed: nextChunk !== chunk,
  };
}

/** 更新 PROVENANCE 里的 commit 与日期行 */
function updateProvenance(spec, upstream) {
  const file = path.join(VENDOR_DIR, spec.name, 'PROVENANCE.md');
  if (!fs.existsSync(file)) return false;
  const today = new Date().toISOString().slice(0, 10);
  const original = fs.readFileSync(file, 'utf-8');
  const next = original
    .replace(/(\|\s*上游 commit\s*\|\s*`)[^`]*(`)/, `$1${upstream.ref}$2`)
    .replace(/(\|\s*拷入日期\s*\|\s*)[^|]*(\|)/, `$1${today} $2`);
  if (next !== original) {
    fs.writeFileSync(file, next, 'utf-8');
    return true;
  }
  return false;
}

//---------------------------------
//         4. 主流程
//---------------------------------

/**
 * 即时写 stdout：git 查询用 execFileSync 阻塞事件循环，console.log 在 pipe 下会排队到
 * 阻塞结束才出现。writeSync 保证「正在查询谁」在等待期间就可见，不被误认为卡死。
 */
function progress(message) {
  fs.writeSync(1, `${message}\n`);
}

const specs = readSpecs();
const rows = [];

const label = (row) => {
  if (row.error) return '查询失败';
  if (row.currentType === 'commit') return row.outdated ? '有新版' : '已最新';
  return row.outdated ? '有新版' : '已最新';
};

/** 单个技能查完就打印，不等所有查询结束 */
function printRow(row) {
  const cur = row.currentType === 'commit' ? row.current.slice(0, 7) : row.current;
  const up = row.upstream
    ? row.upstream.refType === 'commit'
      ? row.upstream.ref.slice(0, 7)
      : row.upstream.ref
    : '—';
  progress(
    `${row.spec.name.padEnd(16)} ${row.currentType.padEnd(7)} 本地 ${String(cur).padEnd(10)} 上游 ${String(up).padEnd(10)} ${label(row)}`,
  );
  if (row.error) progress(`  ↳ ${row.error}`);
}

progress(`附带技能版本对照（共 ${specs.length} 项，网络查询可能耗时）...`);
progress('─'.repeat(78));

for (const spec of specs) {
  progress(`→ 查询 ${spec.name} (${spec.repo}) ...`);
  const repoUrl = rewriteGithubRepoUrl(`https://github.com/${spec.repo}`);
  const current = spec.commit ?? spec.version ?? '';
  const currentType = spec.commit ? 'commit' : 'tag';
  let upstream;
  try {
    upstream = resolveUpstream(spec, repoUrl);
  } catch (error) {
    const row = { spec, current, currentType, upstream: null, error: error.message };
    rows.push(row);
    printRow(row);
    continue;
  }
  const outdated =
    currentType === 'commit' ? current !== upstream.ref : compareSemver(current, upstream.ref) < 0;
  const row = { spec, current, currentType, upstream, outdated, error: null };
  rows.push(row);
  printRow(row);
}
progress('─'.repeat(78));

const failures = rows.filter((row) => row.error);
const outdated = rows.filter((row) => row.outdated && !row.error);

if (failures.length > 0) {
  console.error(`\n${failures.length} 个技能查询失败；网络或仓库状态有问题，未做任何修改。`);
  process.exit(2);
}

if (outdated.length === 0) {
  console.log('\n所有附带技能已是上游最新。');
  process.exit(0);
}

if (!DO_UPDATE) {
  console.log(
    `\n${outdated.length} 个技能有新版。执行升级：node devops/sync-bundled-skills.mjs --update`,
  );
  process.exit(1);
}

// ---- 升级 ----
let tsSource = fs.readFileSync(SPEC_FILE, 'utf-8');
let tsChanged = false;

for (const row of outdated) {
  progress(`\n▶ 升级 ${row.spec.name} → ${row.upstream.ref}（拉取上游，可能耗时）`);
  const repoUrl = rewriteGithubRepoUrl(`https://github.com/${row.spec.repo}`);
  let tmp;
  try {
    tmp = fetchToTemp(row.spec, row.upstream, repoUrl);
  } catch (error) {
    console.error(`\n✗ 升级 ${row.spec.name} 失败：${error.message}`);
    console.error('  内网环境请设置 POLARIS_GITHUB_MIRROR 指向可达的 GitHub 镜像后重试；');
    console.error('  网络抖动重跑即可，钉值文件在全部技能升级成功前不会写入。');
    process.exit(2);
  }
  try {
    replaceVendorSkill(row.spec, tmp, row.upstream);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const rewritten = rewriteSpec(tsSource, row.spec, row.upstream);
  tsSource = rewritten.source;
  tsChanged = tsChanged || rewritten.changed;
  const provenanceUpdated = updateProvenance(row.spec, row.upstream);
  console.log(`  vendor 已替换${provenanceUpdated ? '，PROVENANCE 已更新' : ''}`);
}

if (tsChanged) {
  fs.writeFileSync(SPEC_FILE, tsSource, 'utf-8');
  console.log(`\n钉值已写入 ${path.relative(ROOT, SPEC_FILE)}`);
} else {
  console.log('\n钉值无变化（已是最新），无需改写源文件');
}

console.log('\n下一步：');
console.log('  1. pnpm build && npx prettier --check src devops   # 粗检');
console.log('  2. npx vitest run test/ts/skills-install.test.ts   # 回归');
console.log('  3. 实际验证一次生成（技能内容变了就可能是行为变了）');
console.log('  4. 提交：devops/vendor 与 PROVENANCE 不入 git，需要提交的只有 .ts 里的钉值');
