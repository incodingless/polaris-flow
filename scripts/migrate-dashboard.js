#!/usr/bin/env node

/**
 * Dashboard 合并迁移脚本（一次性）。
 *
 * 把 `polaris-web`（前端）与 `polaris-cli`（Dashboard API）中需要保留的文件**复制**到本仓：
 *   - polaris-web  → 本仓仓库根 `dashboard/`
 *   - polaris-cli  → 本仓 `src/dashboard/`
 *
 * 硬约束：
 *   - **只复制，从不移动/删除/改写源仓库**。源仓在迁移期间保持原样可查。
 *   - 白名单驱动（不是黑名单）：只搬清单里的条目，其余一律不带。
 *   - 只做机械复制，不做任何内容改写。复制后的适配（改 import、裁路由等）由 M1 手工完成，
 *     清单见脚本末尾输出的 follow-ups。
 *
 * 用法：
 *   node scripts/migrate-dashboard.js                       # 预演，只列清单不写盘
 *   node scripts/migrate-dashboard.js --write               # 实际复制，遇既有目标文件则中止
 *   node scripts/migrate-dashboard.js --write --force       # 允许覆盖已存在的目标文件
 *   node scripts/migrate-dashboard.js --web ../polaris-web --cli ../polaris-cli
 *
 * 设计依据：docs/specs/2026-09-18-dashboard-integration-design.md §4.4 迁入清单
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

//---------------------------------
//         命令行参数
//---------------------------------

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const flagValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const WRITE = hasFlag('--write');
const FORCE = hasFlag('--force');
const WEB_ROOT = path.resolve(REPO_ROOT, flagValue('--web', '../polaris-web'));
const CLI_ROOT = path.resolve(REPO_ROOT, flagValue('--cli', '../polaris-cli'));

/** 任何层级都不搬的噪声文件 */
const NOISE = new Set(['.DS_Store', 'Thumbs.db']);

//---------------------------------
//         迁入清单（白名单）
//---------------------------------

/**
 * polaris-web 的根级散件。依据 §4.4：product 代码全搬；
 * `scripts/dev.sh`、`CLAUDE.md` 是旧三仓形态的产物，不搬。
 */
const WEB_ROOT_FILES = ['index.html', 'vite.config.js', 'package.json', 'package-lock.json'];

/** polaris-web 中整目录搬运的路径（递归） */
const WEB_DIRS = ['public', 'src', path.join('docs', 'uxe'), path.join('docs', 'superpowers')];

/**
 * polaris-web 中属于**前端**的文档。
 * 刻意排除 agent-guide.md / development.md / quickstart.md / troubleshooting.md
 * —— 这四份描述的是即将退役的 polaris-cli 后端，搬进来会变成误导性文档。
 */
const WEB_DOC_FILES = [
  'README.md',
  'Polaris Dashboard 全局布局框架定义.md',
  'Polaris Dashboard 页面布局及交互规范.md',
  'dashboard需求.md',
  'api-elegant-comet.md',
  'resources-configuration-guide.md',
];

/** polaris-web 侧不搬的文件（相对 polaris-web 的路径） */
const WEB_EXCLUDES = new Set([path.join('src', 'composables', 'useTasksMock.js')]); // 无引用的死代码

/** polaris-cli 中 Dashboard API 的源目录（相对 polaris-cli） */
const CLI_API_DIR = path.join('src', 'core', 'dashboard');

/**
 * polaris-cli 侧要搬的文件（相对 CLI_API_DIR）。刻意排除三个（§5.1 / §5.2 已判定删除）：
 *   - api/change-operations.ts   「继续/调度智能体」依赖外部 openspec CLI + POLARIS_CONTINUE_CMD，本设计不做
 *   - api/change-validate.ts     同为 openspec CLI 调用
 *   - api/compose.ts             对应 POST /api/compose 与 GET /api/schemas，一并删除
 * 排除后不再需要连带搬 polaris-cli 的 utils/spawnAsync.ts，复制结果可直接编译。
 */
const CLI_FILES = [
  'change-scanner.ts',
  'markdown.ts',
  'router.ts',
  'server.ts', // 会覆盖本仓现有的启动器 src/dashboard/server.ts（预期行为，见 follow-ups 第 1 条）
  path.join('api', 'changes.ts'),
  path.join('api', 'check.ts'),
  path.join('api', 'configs.ts'),
  path.join('api', 'filesystem.ts'),
  path.join('api', 'projects.ts'),
  path.join('api', 'workflow.ts'),
];

//---------------------------------
//         清单展开
//---------------------------------

/**
 * 递归列出目录下所有待搬文件。
 * @param {string} absDir 绝对目录
 * @param {string} relDir 相对源根的路径
 * @param {Set<string>} excludes 排除清单（相对源根）
 * @returns {string[]} 相对源根的文件路径
 */
function walkDir(absDir, relDir, excludes) {
  const out = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (NOISE.has(entry.name)) continue;
    const childRel = path.join(relDir, entry.name);
    if (excludes.has(childRel)) continue;
    if (entry.isDirectory()) {
      out.push(...walkDir(path.join(absDir, entry.name), childRel, excludes));
    } else if (entry.isFile()) {
      out.push(childRel);
    }
  }
  return out;
}

/**
 * 按清单收集待搬条目，并记录源仓缺失项。
 * @param {string} sourceRoot 源仓根
 * @param {string} targetRoot 目标根
 * @param {{rootFiles?: string[], dirs?: string[], excludes?: Set<string>, stripPrefix?: string}} plan 清单
 *   stripPrefix：源相对路径要先剥掉的前导目录段（polaris-cli 的 src/core/dashboard → src/dashboard 靠它）
 * @returns {{files: Array<{src: string, dest: string}>, missing: string[]}}
 */
function collect(sourceRoot, targetRoot, plan) {
  const { rootFiles = [], dirs = [], excludes = new Set(), stripPrefix } = plan;
  const files = [];
  const missing = [];

  const add = (relPath) => {
    const src = path.join(sourceRoot, relPath);
    if (!fs.existsSync(src)) {
      missing.push(relPath);
      return;
    }
    const relToTarget = stripPrefix ? path.relative(stripPrefix, relPath) : relPath;
    files.push({ src, dest: path.join(targetRoot, relToTarget) });
  };

  for (const relPath of rootFiles) {
    if (stripPrefix && !relPath.startsWith(stripPrefix + path.sep)) {
      missing.push(relPath);
      continue;
    }
    add(relPath);
  }
  for (const dir of dirs) {
    if (!fs.existsSync(path.join(sourceRoot, dir))) {
      missing.push(dir + path.sep);
      continue;
    }
    for (const relPath of walkDir(path.join(sourceRoot, dir), dir, excludes)) add(relPath);
  }

  return { files, missing };
}

const web = collect(WEB_ROOT, path.join(REPO_ROOT, 'dashboard'), {
  rootFiles: [...WEB_ROOT_FILES, ...WEB_DOC_FILES.map((f) => path.join('docs', f))],
  dirs: WEB_DIRS,
  excludes: WEB_EXCLUDES,
});

const cli = collect(CLI_ROOT, path.join(REPO_ROOT, 'src', 'dashboard'), {
  rootFiles: CLI_FILES.map((f) => path.join(CLI_API_DIR, f)),
  stripPrefix: CLI_API_DIR,
});

const allFiles = [...web.files, ...cli.files];
const allMissing = [...web.missing, ...cli.missing];

//---------------------------------
//         前置校验
//---------------------------------

const fatal = [];
if (!fs.existsSync(path.join(WEB_ROOT, 'package.json'))) {
  fatal.push(`未找到 polaris-web：${WEB_ROOT}（可用 --web 指定）`);
}
if (!fs.existsSync(path.join(CLI_ROOT, CLI_API_DIR))) {
  fatal.push(`未找到 polaris-cli 的 Dashboard API：${path.join(CLI_ROOT, CLI_API_DIR)}（可用 --cli 指定）`);
}
if (fatal.length) {
  for (const msg of fatal) console.error(`[migrate] 错误：${msg}`);
  process.exit(1);
}

if (allMissing.length) {
  console.error('[migrate] 错误：源仓缺少下列清单条目，源仓版本可能与设计假定不一致：');
  for (const m of allMissing) console.error(`  - ${m}`);
  console.error('  请人工确认后再运行（刻意不静默跳过，避免产出残缺迁移）。');
  process.exit(1);
}

const relToRoot = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');
const relToWeb = (p) => path.relative(WEB_ROOT, p).split(path.sep).join('/');
const relToCli = (p) => path.relative(CLI_ROOT, p).split(path.sep).join('/');

const conflicts = allFiles.filter((f) => fs.existsSync(f.dest));

if (WRITE && conflicts.length && !FORCE) {
  console.error(`[migrate] 错误：${conflicts.length} 个目标文件已存在。加 --force 覆盖，或先清理：`);
  for (const c of conflicts) console.error(`  - ${relToRoot(c.dest)}`);
  process.exit(1);
}

//---------------------------------
//         执行
//---------------------------------

let copied = 0;
let bytes = 0;

for (const f of allFiles) {
  bytes += fs.statSync(f.src).size;
  if (!WRITE) continue;
  fs.mkdirSync(path.dirname(f.dest), { recursive: true });
  fs.copyFileSync(f.src, f.dest);
  copied++;
}

//---------------------------------
//         报告
//---------------------------------

console.log(`[migrate] 模式：${WRITE ? (FORCE ? '写入（允许覆盖）' : '写入') : '预演（未写盘）'}`);
console.log(`[migrate] polaris-web  ${WEB_ROOT}  →  dashboard/`);
console.log(`[migrate] polaris-cli  ${CLI_ROOT}  →  src/dashboard/`);
console.log('');

console.log(`── dashboard/  ${web.files.length} 个文件`);
for (const f of web.files) console.log(`   ${relToWeb(f.src)}  →  ${relToRoot(f.dest)}`);

console.log('');
console.log(`── src/dashboard/  ${cli.files.length} 个文件`);
for (const f of cli.files) console.log(`   ${relToCli(f.src)}  →  ${relToRoot(f.dest)}`);

console.log('');
console.log(`[migrate] 合计 ${allFiles.length} 个文件，${(bytes / 1024).toFixed(1)} KB`);
if (WRITE) console.log(`[migrate] 已复制 ${copied} 个文件；源仓未做任何改动`);
if (conflicts.length) {
  console.log(`[migrate] ${WRITE ? '覆盖' : '将覆盖（未加 --force 时不执行）'} ${conflicts.length} 个既有文件：`);
  for (const c of conflicts) console.log(`   - ${relToRoot(c.dest)}`);
}

console.log('');
console.log('[migrate] 复制之后的必做适配（本脚本只搬运，不改写内容）：');
console.log('  1. src/dashboard/server.ts   已被 polaris-cli 版本覆盖 → 按 M1 步骤 2 改为单进程静态托管');
console.log('                               （新增 static.ts，产物根 dist/web，listening 后开浏览器）。');
console.log('  2. src/dashboard/router.ts   删掉指向未搬迁文件的引用与路由：executeStepOperation、');
console.log('                               validateChange、createChange/listSchemas，以及 PUT /api/configs/:path。');
console.log('  3. src/dashboard/api/*.ts    先原样保留旧数据源（仍读 openspec/changes/），M2 再改为读');
console.log('                               .polaris/workflow.yaml 与 state.yaml。');
console.log('  4. dashboard/vite.config.js  base 改为可静态托管；proxy 只留 /api，删 /static。');
console.log('  5. dashboard/package.json    去掉 private；name 改名以免与 polaris-flow 混淆。');
console.log('  6. dashboard/docs/README.md  索引里指向 agent-guide / development / quickstart /');
console.log('                               troubleshooting 的链接已成死链（这四份刻意未搬），需清理。');
console.log('  7. dashboard/docs/superpowers/  整目录搬入，其中 init-wizard 等条目并非前端内容，');
console.log('                               可留待后续单独清理。');
console.log("  8. eslint.config.js          清理过时的 'src/dashboard/web/' ignore；");
console.log('                               prepublish-check.js 的 TEXT_EXTENSIONS 补 .vue。');

if (!WRITE) {
  console.log('');
  console.log('[migrate] 这是预演。确认清单无误后执行：node scripts/migrate-dashboard.js --write');
}
