#!/usr/bin/env node
// detect-test-command.mjs — 探测项目的构建 / 测试命令（build / unit / contract / integration / smoke 五槽）
//
// 形态：**自包含 node（.mjs）**，不做 `_polaris-cli.mjs` 薄包装（有意例外，理由见下）。
//   探测逻辑无法预先知道用户项目的技术栈；且脚本随技能资产分发，须在任意项目里独立
//   可跑。若走薄包装，逻辑会落到 `src/core/`，用户项目必须先升级全局 CLI 才能用上
//   新脚本 —— 版本耦合不可接受。故本脚本对齐 `../scorers/` 的自包含形态。
//   等价于被替换的 detect-test-command.sh，逐字节保持 stdout 契约与退出码。
//
// 槽位 ↔ verify 步骤（一一对应；改一处须核另一处）：
//   build       → Step 3  编译 / 构建闸门（**模式无关**，不过即停）
//   unit        → Step 6  单元测试（**总是跑**）
//   contract    → Step 10 契约测试（静态校验，有契约源才跑）
//   integration → Step 11 集成测试（跨模块边界才跑）
//   smoke       → Step 12 主干功能 / E2E（`verify_mode=full` 才跑）
//   build + unit 由 **Step 2** 一次性探测（模式无关）；
//   contract / integration / smoke 由 **Step 9** 按 `verify_mode` 决定探哪些。
//
// 用法：
//   node detect-test-command.mjs --repo-root <path> [--slot build|unit|contract|integration|smoke]
//
// stdout（机器可解析的 key: value 行）：
//   framework:  <框架名>
//   command:    <建议执行的命令>
//   evidence:   <判定依据，含 文件:行>
//   confidence: high|medium|low
//   excluded:   <本档明确排除、不得执行者>
//   reason:     <仅退出码 1 / 2 出现：为什么探测不到 / 为什么不可执行>
//
// 退出码：
//   0 = 探测到可用命令
//   1 = 探测不到（项目本来就没有这一层验证）→ `No-Verification` 合法触发
//   2 = 探测到了但不可执行（不在 PATH / 非可执行）→ Step 6 二级分叉第 2 级
//       （入参错误同用 2，属「外部命令不可用」同族）
//
// ⚠️ 0 / 1 / 2 **不得合并** —— 1 是「项目属性」，2 是「环境 / 基础设施问题」。
//    合并会把「项目没测试」与「环境坏了」混为一谈（Docker 没起被误判成代码缺陷），
//    正是 verify 三级分叉要防的那个坑。
//
// 目标边界：本脚本只解决「怎么找到命令」。
//   **unit 槽只返回单测命令**，不返回 `mvn verify` / `gradlew check` 等含集成的命令；
//   **build 槽只返回编译 / 打包命令**，不返回会连带跑测试的 `gradlew build`。
//
// 探测优先级（逐段降级）：
//   1. 项目显式声明 —— 项目根说明文件（README / CONTRIBUTING / CLAUDE.md）的
//      `## Testing` / `## 测试` / `## Building` / `## 构建` 章节（**权威来源**：作者写下来的）
//   2. Makefile 显式 target（同属「声明」，故排在「推断」之前）
//   3. 清单文件检测（pom.xml / package.json / go.mod / …）—— 属「推断」
//   4. 无 → 退出码 1
//
// 注 1：config 的历史确认值**不在本脚本职责内** —— verify 入口先行读取，
//      本脚本输出仅用于「与之冲突」的比对；运行时以 config 已确认值为准。
//
// 注 2：`## Testing` 章节的代码块里常**同时列多条**命令，如
//         npx vitest run test/ts/cli.test.ts   # 先跑这一个文件
//         npx vitest run                       # 全量
//       「单测命令」的本意是**跑全量单测**，故取**未限定范围**的那条（无测试文件路径 /
//       `-Dtest=` / `--grep` 等过滤参数）。全部都被限定时才退回第一条。
//
// 注 3：`build` / `contract` 两槽**只认显式入口**（说明文件章节 / Makefile target /
//       package.json script / Python 的 tests/contract 目录），**不做工具依赖推断** ——
//       有工具依赖但无脚本入口时宁返回 1（走 `No-Verification`），不替项目臆造命令。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ============================== 参数解析 ==============================

function usageText() {
  return (
    '用法: detect-test-command.mjs --repo-root <path> [--slot build|unit|contract|integration|smoke]\n' +
    '\n' +
    '  --repo-root <path>   项目根目录（必填）\n' +
    '  --slot <name>        槽位：unit（默认）| build | contract | integration | smoke\n' +
    '\n' +
    '退出码: 0=探测到可用命令 · 1=项目无此层验证 · 2=探测到但不可执行 / 入参错误\n'
  );
}

function argerr(msg) {
  process.stderr.write(`detect-test-command: ${msg}\n`);
  process.stderr.write(usageText());
  process.exit(2);
}

let repoRoot = '';
let SLOT = 'unit';

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--repo-root') {
    if (i + 1 >= argv.length) argerr('--repo-root 缺少取值');
    repoRoot = argv[++i];
  } else if (a.startsWith('--repo-root=')) {
    repoRoot = a.slice('--repo-root='.length);
  } else if (a === '--slot') {
    if (i + 1 >= argv.length) argerr('--slot 缺少取值');
    SLOT = argv[++i];
  } else if (a.startsWith('--slot=')) {
    SLOT = a.slice('--slot='.length);
  } else if (a === '-h' || a === '--help') {
    process.stdout.write(usageText());
    process.exit(0);
  } else {
    argerr(`未知参数: ${a}`);
  }
}

const SLOTS = ['build', 'unit', 'contract', 'integration', 'smoke'];
if (!SLOTS.includes(SLOT)) {
  argerr(`--slot 取值非法: ${SLOT}（须为 build | unit | contract | integration | smoke）`);
}
if (repoRoot === '') argerr('--repo-root 必填');

let repoStat;
try {
  repoStat = fs.statSync(repoRoot);
} catch {
  argerr(`--repo-root 不是目录: ${repoRoot}`);
}
if (!repoStat.isDirectory()) argerr(`--repo-root 不是目录: ${repoRoot}`);
repoRoot = path.resolve(repoRoot);

// ============================== 输出 ==============================

function emit(framework, command, evidence, confidence, excluded) {
  process.stdout.write(
    `framework: ${framework}\n` +
      `command: ${command}\n` +
      `evidence: ${evidence}\n` +
      `confidence: ${confidence}\n` +
      `excluded: ${excluded}\n`,
  );
}

function emitAbsent(reason) {
  process.stdout.write(
    `framework: —\n` +
      `command: —\n` +
      `evidence: —\n` +
      `confidence: —\n` +
      `excluded: —\n` +
      `reason: ${reason}\n`,
  );
  process.exit(1);
}

function emitUnavailable(framework, command, evidence, confidence, excluded, reason) {
  emit(framework, command, evidence, confidence, excluded);
  process.stdout.write(`reason: ${reason}\n`);
  process.exit(2);
}

// ============================== 工具 ==============================

/** 文件系统辅助（相对 repoRoot） */
function fileExists(rel) {
  try {
    return fs.statSync(path.join(repoRoot, rel)).isFile();
  } catch {
    return false;
  }
}
function dirExists(rel) {
  try {
    return fs.statSync(path.join(repoRoot, rel)).isDirectory();
  } catch {
    return false;
  }
}
function isExecutable(rel) {
  try {
    fs.accessSync(path.resolve(repoRoot, rel), fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** 在单个目录里找可执行文件（Windows 依次试 .cmd/.exe/无后缀；POSIX 只试无后缀） */
function findExecutableInDir(dir, name) {
  const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const suffix of suffixes) {
    const candidate = path.join(dir, name + suffix);
    try {
      if (fs.statSync(candidate).isFile()) return true;
    } catch {
      // 不存在
    }
  }
  return false;
}

/** 等价 `command -v <name>`：遍历 PATH 找可执行文件 */
function commandAvailable(name) {
  const sep = process.platform === 'win32' ? ';' : ':';
  const dirs = (process.env.PATH || '').split(sep).filter(Boolean);
  for (const dir of dirs) {
    if (findExecutableInDir(dir, name)) return true;
  }
  return false;
}

/** 剥掉 `VAR=value` 前缀（如 CI=true npm test） */
function stripEnv(s) {
  const tokens = s.trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (const t of tokens) {
    if (out.length === 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue;
    out.push(t);
  }
  return out.join(' ');
}

/** 命令首词 */
function headOf(s) {
  const m = stripEnv(s).match(/^\S+/);
  return m ? m[0] : '';
}

/** 命令首词是否可执行（复用 detect.ts 的 commandAvailable 语义） */
function executableOk(cmd) {
  const head = headOf(cmd);
  if (head === '') return false;
  if (head.startsWith('./') || head.startsWith('/')) {
    return isExecutable(head);
  }
  return commandAvailable(head);
}

/** 命令 → 框架名（先认显式测试运行器，再退回包管理器脚本） */
const FRAMEWORK_RULES = [
  [/mvn/, 'Maven (Surefire)'],
  [/gradlew|gradle/, 'Gradle'],
  [/buf/, 'buf'],
  [/pact/, 'Pact'],
  [/schemathesis/, 'Schemathesis'],
  [/spectral/, 'Spectral'],
  [/dredd/, 'Dredd'],
  [/vitest/, 'Vitest'],
  [/jest/, 'Jest'],
  [/mocha/, 'Mocha'],
  [/pytest/, 'pytest'],
  [/tsc/, 'TypeScript (tsc)'],
  [/go test/, 'go test'],
  [/go build/, 'go build'],
  [/cargo build/, 'cargo build'],
  [/cargo/, 'cargo test'],
  [/rspec/, 'RSpec'],
  [/phpunit/, 'PHPUnit'],
  [/dotnet build/, '.NET'],
  [/dotnet test/, '.NET'],
  [/make/, 'Makefile'],
  [/pnpm/, 'Node (pnpm)'],
  [/yarn/, 'Node (yarn)'],
  [/bun/, 'Node (bun)'],
  [/npm/, 'Node (npm)'],
  [/npx/, 'Node (npx)'],
];
function frameworkOf(cmd) {
  for (const [re, name] of FRAMEWORK_RULES) {
    if (re.test(cmd)) return name;
  }
  return '—';
}

/** 本档「明确排除项」——对应设计文档清单表的右列 */
const EXCLUDED_RULES = [
  [/mvn/, 'mvn verify（Failsafe *IT.java = 集成）'],
  [/gradle/, 'check（含集成 / 静态分析）'],
  [/vitest|jest|mocha/, 'e2e / integration 套件（--project / *.e2e.*）'],
  [/pnpm|yarn|bun|npm/, 'e2e 脚本（test:e2e）'],
  [/pytest/, 'tox / nox 的集成环境'],
  [/go test/, '-tags integration'],
  [/cargo/, '--features integration'],
  [/rspec/, 'spec/features（Capybara 系统测试）'],
  [/phpunit/, '--testsuite integration'],
];
function excludedForCmd(cmd) {
  for (const [re, text] of EXCLUDED_RULES) {
    if (re.test(cmd)) return text;
  }
  return '—';
}

/** 读文件首 N 行（1-based 返回行号用），按行匹配辅助 */
function readLines(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf-8').split('\n');
}
function findLineMatching(rel, re) {
  const lines = readLines(rel);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return 0;
}
function findLineContaining(rel, substr) {
  const lines = readLines(rel);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(substr)) return i + 1;
  }
  return 0;
}

/** 包管理器判定（npm 默认 → pnpm → yarn → bun 依次覆盖） */
function detectPm() {
  let pm = 'npm';
  if (fileExists('pnpm-lock.yaml')) pm = 'pnpm';
  if (fileExists('yarn.lock')) pm = 'yarn';
  if (fileExists('bun.lockb') || fileExists('bun.lock')) pm = 'bun';
  return pm;
}

/** find . -maxdepth 1 \( -name '*.sln' -o -name '*.csproj' \) | 第一条 */
function findSlnOrCsproj() {
  try {
    const entries = fs.readdirSync(repoRoot);
    for (const e of entries) {
      if (/\.sln$/.test(e) || /\.csproj$/.test(e)) return `./${e}`;
    }
  } catch {
    // 目录不可读
  }
  return '';
}

/** find . -maxdepth 4 -name '*IT.java' -not -path './target/*' | 第一条（相对路径，带 ./） */
function findItJava() {
  const hits = [];
  (function walk(dir, depth) {
    if (depth > 4 || hits.length > 0) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length > 0) return;
      if (e.name === 'target' && dir === repoRoot) continue; // 排除 ./target
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
      } else if (e.name.endsWith('IT.java')) {
        hits.push(full);
      }
    }
  })(repoRoot, 1);
  return hits.length > 0 ? `./${path.relative(repoRoot, hits[0])}` : '';
}

/** find tests -maxdepth 2 -name '*.py' | 是否存在 */
function hasPyUnderTests() {
  const testsDir = path.join(repoRoot, 'tests');
  try {
    if (!fs.statSync(testsDir).isDirectory()) return false;
  } catch {
    return false;
  }
  return (function walk(dir, remaining) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (remaining > 1 && walk(path.join(dir, e.name), remaining - 1)) return true;
      } else if (e.name.endsWith('.py')) {
        return true;
      }
    }
    return false;
  })(testsDir, 2);
}

// ============ 第 1 序：项目显式声明（`## Testing` 章节） ============

/** 行尾 ` # 说明` 不是命令的一部分 → 截掉再输出 */
function stripComment(s) {
  const i = s.indexOf(' #');
  if (i > 0) s = s.slice(0, i);
  return s.replace(/\s+$/, '');
}

/** 该命令是否把范围限到子集（指定测试文件 / 过滤参数） */
function scoped(s) {
  const a = s.split(/\s+/).filter(Boolean);
  for (let i = 1; i < a.length; i++) {
    const t = a[i];
    if (/\.(test|spec)\.[A-Za-z0-9]+$/.test(t)) return true;
    if (/^(tests?|specs?)\//.test(t)) return true;
    if (t === '-t' || t === '-run' || /^-Dtest=/.test(t)) return true;
    if (/^--(grep|testNamePattern|filter|testsuite|project)=/.test(t)) return true;
  }
  return false;
}

/** 该行是否是合法候选命令（两道闸：含语义词 + 首词像命令） */
function okLine(line, slot) {
  const low = line.toLowerCase();
  if (/(install|uninstall|--save)/.test(low)) return false;
  let h = low.replace(/\s.*$/, '');
  // 允许 `VAR=value` 前缀（如 CI=true npm test）
  if (/^[a-z_][a-z0-9_]*=$/.test(h)) {
    const rest = low.replace(/^\S+\s+/, '').replace(/\s.*$/, '');
    h = rest;
  }
  const known = /^(npm|pnpm|yarn|bun|npx|mvn|gradle|gradlew|pytest|python|python3|tox|nox|poetry|pdm|uv|go|cargo|bundle|rake|rspec|phpunit|php|dotnet|make|mix|swift|dart|ctest|cmake|jest|vitest|mocha|ava|bash|sh|zsh|buf)$/.test(h);
  const pathlike = /^\.\//.test(h) || /\/bin\//.test(h) || /\.sh$/.test(h);
  if (!known && !pathlike) return false;
  if (slot === 'build') {
    if (!/(build|compile|assemble|package|tsc|dist)/.test(low)) return false;
  } else if (slot === 'unit') {
    if (!/(test|spec|pytest|junit|phpunit|rspec|check)/.test(low)) return false;
    if (/(e2e|end-to-end|integration|smoke|acceptance|contract|pact|verify)/.test(low)) return false;
  } else if (slot === 'contract') {
    if (!/(contract|pact|openapi|swagger|proto|schema|spectral|buf)/.test(low)) return false;
  } else if (slot === 'integration') {
    if (!/(integration|verify|failsafe)/.test(low)) return false;
  } else if (slot === 'smoke') {
    if (!/(e2e|end-to-end|smoke)/.test(low)) return false;
  }
  return true;
}

/** stdin = 章节正文；$1 = slot → 输出单行候选命令（可能为空） */
function pickCmd(section, slot) {
  let fence = false;
  let block = '';
  let unscoped = '';
  let inline = '';
  for (const raw of section.split('\n')) {
    let line = raw;
    if (/^\s*```/.test(line)) {
      fence = !fence;
      continue;
    }
    line = line.replace(/^\s+/, '').replace(/\s+$/, '');
    if (line === '') continue;
    if (/^#/.test(line)) continue;
    line = line.replace(/^[$>]\s*/, '');
    if (fence) {
      if (okLine(line, slot)) {
        const cand = stripComment(line);
        if (block === '') block = cand;
        if (unscoped === '' && !scoped(cand)) unscoped = cand;
      }
    } else if (inline === '' && line.includes('`')) {
      const parts = line.split('`');
      for (let i = 1; i < parts.length; i += 2) {
        const c = parts[i].replace(/^\s+/, '').replace(/\s+$/, '');
        if (okLine(c, slot)) {
          inline = c;
          break;
        }
      }
    }
  }
  if (unscoped !== '') return unscoped;
  if (block !== '') return block;
  if (inline !== '') return inline;
  return '';
}

// 标题正则（二级含 Test(s)/Build 单复数；三级只认 Testing —— 防线：CHANGELOG `### Tests` 不算）
const H2_RE = /^##\s+(Testing|Tests|Test|How to [Rr]un [Tt]ests|Running [Tt]ests|Building|Build|How to [Bb]uild|测试|运行测试|如何测试|构建|编译|如何构建)(\s|$)/;
const H3_RE = /^###\s+(Testing|How to [Rr]un [Tt]ests|Running [Tt]ests|Building|How to [Bb]uild|测试|运行测试|如何测试|构建|编译|如何构建)(\s|$)/;

const DECLARED_FILES = [
  'README.md',
  'README.MD',
  'readme.md',
  'CONTRIBUTING.md',
  'CLAUDE.md',
  'AGENTS.md',
  '.github/CONTRIBUTING.md',
  'docs/CONTRIBUTING.md',
  'docs/README.md',
];

/** 提取从 start 行（1-based）到下一个 `#` / `##` 标题前的正文 */
function sectionBody(lines, start) {
  const out = [];
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** 成功返回 { cmd, ev }（ev = file:line）；无候选返回 null */
function declaredCmd(slot) {
  for (const f of DECLARED_FILES) {
    if (!fileExists(f)) continue;
    const lines = readLines(f);
    const headings = [];
    for (let i = 0; i < lines.length; i++) {
      if (H2_RE.test(lines[i]) || H3_RE.test(lines[i])) headings.push(i + 1);
    }
    for (const start of headings) {
      const cmd = pickCmd(sectionBody(lines, start), slot);
      if (cmd !== '') return { cmd, ev: `${f}:${start}` };
    }
  }
  return null;
}

// ============ 第 2 序：Makefile 显式 target ============

const MAKEFILE_PATTERNS = {
  build: /^(build|compile|all|dist|package):/,
  unit: /^(test|tests|unit):/,
  contract: /^(contract|contracts|contract-test|test-contract|api-contract):/,
  integration: /^(test-integration|integration|integration-test|it):/,
  smoke: /^(test-e2e|e2e|smoke|acceptance|functional|test-functional):/,
};

function makefileHit(slot) {
  let f = 'Makefile';
  if (!fileExists('Makefile')) {
    if (fileExists('makefile')) f = 'makefile';
    else return null;
  }
  const lines = readLines(f);
  const pat = MAKEFILE_PATTERNS[slot];
  let ln = 0;
  for (let i = 0; i < lines.length; i++) {
    if (pat.test(lines[i])) {
      ln = i + 1;
      break;
    }
  }
  if (ln === 0) return null;
  const target = lines[ln - 1].replace(/:.*/, '');
  return { target, ev: `${f}:${ln}` };
}

// ============ build 槽：编译 / 构建入口 ============
// 「只编译、不跑测试」。设计理由：编译闸门（verify Step 3）在单测之前，
// 用 `gradlew build` / `npm test` 会把测试提前拉进闸门，闸门就不再是闸门。

function probeBuild() {
  if (fileExists('pom.xml')) {
    const bin = isExecutable('./mvnw') ? './mvnw' : 'mvn';
    emit('Maven', `${bin} -B package -DskipTests`, 'pom.xml:1 为 Maven 工程（package 生命周期）', 'high', 'test 生命周期（编译闸门不跑测试）');
    return true;
  }
  if (fileExists('build.gradle') || fileExists('build.gradle.kts')) {
    const f = fileExists('build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle';
    const bin = isExecutable('./gradlew') ? './gradlew' : 'gradle';
    emit('Gradle', `${bin} assemble`, `${f}:1 为 Gradle 工程（assemble 只编译打包）`, 'high', 'build / check（会连带跑测试，不属编译闸门）');
    return true;
  }
  if (fileExists('package.json')) {
    const pm = detectPm();
    const ln = findLineMatching('package.json', /"build"\s*:/);
    if (ln > 0) {
      emit(`Node (${pm})`, `${pm} run build`, `package.json:${ln} 命中 scripts.build`, 'high', 'test 脚本（编译闸门不跑测试）');
      return true;
    }
    if (fileExists('tsconfig.json')) {
      emit('TypeScript (tsc)', 'npx tsc --noEmit', 'tsconfig.json 存在（无 build 脚本，退化为类型检查）', 'medium', 'test 脚本');
      return true;
    }
    return false;
  }
  if (fileExists('go.mod')) {
    emit('go build', 'go build ./...', 'go.mod 为 Go module', 'high', 'go test');
    return true;
  }
  if (fileExists('Cargo.toml')) {
    emit('cargo build', 'cargo build', 'Cargo.toml 为 Rust 工程', 'high', 'cargo test');
    return true;
  }
  const sln = findSlnOrCsproj();
  if (sln !== '') {
    emit('.NET', 'dotnet build', `${sln} 为 .NET 工程`, 'high', 'dotnet test');
    return true;
  }
  // Python / Ruby / PHP 无编译步骤 → 调用方记 `No-Verification`（不阻断）
  return false;
}

// ============ contract 槽：契约测试入口 ============
// 见文件头「注 3」：**只认显式入口**，不做工具依赖推断。有契约工具依赖但无脚本
// 入口时返回 1 走 `No-Verification` —— 替项目臆造 `npx <tool>` 会引入下载与版本风险。

function probeContract() {
  if (fileExists('package.json')) {
    const pm = detectPm();
    for (const key of ['test:contract', 'test:contracts', 'test:pact', 'contract', 'pact']) {
      const ln = findLineContaining('package.json', `"${key}"`);
      if (ln > 0) {
        emit(`Node (${pm})`, `${pm} run ${key}`, `package.json:${ln} 命中 scripts.${key}`, 'high', 'unit / integration 档（本档只跑契约测试）');
        return true;
      }
    }
  }
  let d = '';
  if (dirExists('tests/contract')) d = 'tests/contract';
  if (dirExists('tests/contracts')) d = 'tests/contracts';
  if (d !== '') {
    emit('pytest', `pytest ${d}`, `${d}/ 目录存在（契约测试目录约定）`, 'medium', 'unit / integration 档（本档只跑契约测试）');
    return true;
  }
  return false;
}

// ============ 第 3 序：清单文件检测 ============

function probeManifest(slot) {
  // build / contract 两槽各有独立探测（见上），不走下方的语言清单链
  if (slot === 'build') return probeBuild();
  if (slot === 'contract') return probeContract();

  // ---------- JVM: Maven ----------
  if (fileExists('pom.xml')) {
    const bin = isExecutable('./mvnw') ? './mvnw' : 'mvn';
    if (slot === 'unit') {
      const ln = findLineMatching('pom.xml', /maven-surefire-plugin/);
      if (ln > 0) {
        emit('Maven (Surefire)', `${bin} -B test`, `pom.xml:${ln} 命中 maven-surefire-plugin`, 'high', excludedForCmd(bin));
      } else {
        emit('Maven (Surefire)', `${bin} -B test`, 'pom.xml:1 为 Maven 工程（未显式声明 surefire，走默认 test 生命周期）', 'high', excludedForCmd(bin));
      }
      return true;
    }
    if (slot === 'integration') {
      const ln = findLineMatching('pom.xml', /maven-failsafe-plugin/);
      if (ln > 0) {
        emit('Maven (Failsafe)', `${bin} -B verify`, `pom.xml:${ln} 命中 maven-failsafe-plugin`, 'high', 'mvn -B test（只跑单测，不含 *IT.java）');
        return true;
      }
      const itf = findItJava();
      if (itf !== '') {
        emit('Maven (Failsafe)', `${bin} -B verify`, `${itf} 存在（Failsafe *IT.java 约定）`, 'medium', 'mvn -B test（只跑单测）');
        return true;
      }
      return false;
    }
    return false;
  }

  // ---------- JVM: Gradle ----------
  if (fileExists('build.gradle') || fileExists('build.gradle.kts')) {
    const f = fileExists('build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle';
    const bin = isExecutable('./gradlew') ? './gradlew' : 'gradle';
    if (slot === 'unit') {
      emit('Gradle', `${bin} test`, `${f}:1 为 Gradle 工程（走 test task）`, 'high', excludedForCmd(bin));
      return true;
    }
    if (slot === 'integration') {
      const ln = findLineMatching(f, /integrationTest/);
      if (ln === 0) return false;
      emit('Gradle (integrationTest)', `${bin} integrationTest`, `${f}:${ln} 声明 integrationTest task`, 'high', 'unit 档（单测，不在本档执行）');
      return true;
    }
    return false;
  }

  // ---------- Node ----------
  if (fileExists('package.json')) {
    const pm = detectPm();
    if (slot === 'unit') {
      const ln = findLineMatching('package.json', /"test"\s*:/);
      if (ln > 0) {
        emit(`Node (${pm})`, `${pm} test`, `package.json:${ln} 命中 scripts.test`, 'high', excludedForCmd(pm));
        return true;
      }
      return false;
    }
    if (slot === 'integration') {
      for (const key of ['test:integration', 'test:it', 'test:int']) {
        const ln = findLineContaining('package.json', `"${key}"`);
        if (ln > 0) {
          emit(`Node (${pm})`, `${pm} run ${key}`, `package.json:${ln} 命中 scripts.${key}`, 'high', 'unit 档（单测，不在本档执行）');
          return true;
        }
      }
      return false;
    }
    if (slot === 'smoke') {
      for (const key of ['test:e2e', 'e2e', 'test:smoke', 'smoke']) {
        const ln = findLineContaining('package.json', `"${key}"`);
        if (ln > 0) {
          emit(`Node (${pm})`, `${pm} run ${key}`, `package.json:${ln} 命中 scripts.${key}`, 'high', 'unit 档（单测，不在本档执行）');
          return true;
        }
      }
      return false;
    }
    return false;
  }

  // ---------- Python ----------
  if (
    fileExists('pytest.ini') ||
    fileExists('pyproject.toml') ||
    fileExists('setup.py') ||
    fileExists('setup.cfg') ||
    fileExists('tox.ini') ||
    fileExists('requirements.txt') ||
    fileExists('conftest.py') ||
    hasPyUnderTests()
  ) {
    if (slot === 'smoke') return false;
    if (slot === 'integration') {
      if (dirExists('tests/integration')) {
        emit('pytest', 'pytest tests/integration', 'tests/integration/ 存在', 'medium', 'pytest（单测全集）');
        return true;
      }
      return false;
    }
    let sig = '';
    for (const c of ['pytest.ini', 'pyproject.toml', 'tox.ini', 'setup.cfg', 'setup.py', 'requirements.txt', 'conftest.py']) {
      if (fileExists(c)) {
        sig = c;
        break;
      }
    }
    if (sig === '') sig = 'tests/';
    emit('pytest', 'pytest', `${sig} 为 Python 工程测试信号`, 'medium', excludedForCmd('pytest'));
    return true;
  }

  // ---------- Go ----------
  if (fileExists('go.mod')) {
    if (slot === 'unit') {
      emit('go test', 'go test ./...', 'go.mod 为 Go module', 'high', excludedForCmd('go test'));
      return true;
    }
    return false;
  }

  // ---------- Rust ----------
  if (fileExists('Cargo.toml')) {
    if (slot === 'unit') {
      emit('cargo test', 'cargo test', 'Cargo.toml 为 Rust 工程', 'high', excludedForCmd('cargo'));
      return true;
    }
    return false;
  }

  // ---------- Ruby ----------
  if (fileExists('Gemfile')) {
    if (slot === 'unit') {
      emit('RSpec', 'bundle exec rspec', 'Gemfile 为 Ruby 工程', 'medium', excludedForCmd('rspec'));
      return true;
    }
    return false;
  }

  // ---------- PHP ----------
  if (fileExists('composer.json')) {
    if (slot === 'unit') {
      emit('PHPUnit', 'vendor/bin/phpunit', 'composer.json 为 PHP 工程', 'medium', excludedForCmd('phpunit'));
      return true;
    }
    return false;
  }

  // ---------- .NET ----------
  const sln = findSlnOrCsproj();
  if (sln !== '') {
    if (slot === 'unit') {
      emit('.NET', 'dotnet test', `${sln} 为 .NET 工程`, 'high', '—');
      return true;
    }
    return false;
  }

  return false;
}

// ============================== 主流程 ==============================

// 第 1 序：项目显式声明
const decl = declaredCmd(SLOT);
if (decl) {
  if (executableOk(decl.cmd)) {
    emit(frameworkOf(decl.cmd), decl.cmd, `${decl.ev} 命中 Testing 章节（权威来源）`, 'high', excludedForCmd(decl.cmd));
    process.exit(0);
  }
  emitUnavailable(
    frameworkOf(decl.cmd),
    decl.cmd,
    `${decl.ev} 命中 Testing 章节（权威来源）`,
    'high',
    excludedForCmd(decl.cmd),
    `命令首词不可执行（不在 PATH 或非可执行文件）: ${headOf(decl.cmd)}`,
  );
}

// 第 2 序：Makefile 显式 target
const mf = makefileHit(SLOT);
if (mf) {
  const cmd = `make ${mf.target}`;
  if (executableOk(cmd)) {
    emit('Makefile', cmd, `${mf.ev} 命中 ${mf.target} target（项目显式声明）`, 'high', '—');
    process.exit(0);
  }
  emitUnavailable('Makefile', cmd, `${mf.ev} 命中 ${mf.target} target（项目显式声明）`, 'high', '—', 'make 不在 PATH');
}

// 第 3 序：清单文件检测
if (probeManifest(SLOT)) {
  process.exit(0);
}

// 无候选
if (SLOT === 'build') {
  emitAbsent('未探测到构建入口（项目无编译 / 构建步骤，如纯脚本 / 文档项目）');
} else if (SLOT === 'contract') {
  emitAbsent('未探测到契约测试入口（项目无接口契约源，或未声明契约测试命令）');
} else {
  emitAbsent(`未探测到 ${SLOT} 档测试入口（项目无此层验证）`);
}
