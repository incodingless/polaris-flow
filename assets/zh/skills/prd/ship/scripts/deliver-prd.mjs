#!/usr/bin/env node
/**
 * PRD ship 专用：终稿迁移到文档库。
 *
 * 把 SKILL.md 里「读 workflow.mode → 定源文件与交付名 → 冲突检查 → mkdir + cp」
 * 的 bash 片段收进脚本。缺省 dry-run 只输出迁移计划；--apply 才真正拷贝。
 * 不写 state.yaml——交付信息仍由技能经 task-state-entry 落盘（单一写入口）。
 *
 * 用法：
 *   node deliver-prd.mjs --repo-root <R> --task-id <T> [--doc-dir <D>] [--apply]
 *
 * 退出码：0 成功（含 dry-run）；2 参数 / 源缺失 / 命名字段缺失；3 目标已存在（不覆盖）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 各档位的源文件与交付名后缀（与 ship Step 1.1 的分档表一致） */
export const MODE_TABLE = {
  tweak: { src: 'prd-draft.md', docSuffix: '需求说明', missingHint: 'draft' },
  normal: { src: 'prd-final-v1.0.md', docSuffix: '需求终稿', missingHint: 'refine' },
  strict: { src: 'prd-final-v1.0.md', docSuffix: '需求终稿', missingHint: 'refine' },
};

/**
 * 计算交付计划（纯函数，便于测试）。
 * @returns {{mode:string, src:string, dst:string, docSuffix:string, missingHint:string}}
 */
export function planDelivery({ repoRoot, taskId, mode, prefix, nameCn, docDir }) {
  const row = MODE_TABLE[mode];
  if (!row) {
    throw new Error(`未知 workflow.mode：${mode}（应为 tweak / normal / strict）`);
  }
  if (!prefix || !nameCn) {
    throw new Error('req_prefix / req_name_cn 缺失，请先经 set-identity 补齐命名');
  }
  const src = path.join(repoRoot, '.polaris', 'tasks', taskId, row.src);
  const dst = path.join(
    docDir,
    `${prefix}-${nameCn}-${row.docSuffix}-v1.0.md`,
  );
  return { mode, src, dst, docSuffix: row.docSuffix, missingHint: row.missingHint };
}

/**
 * 从 state.yaml 读取标量字段（经 task-state-entry，保持与技能同一读取口径）。
 * 抽出回调便于测试打桩。
 */
export function makeStateFieldReader({ repoRoot, taskId }) {
  const entry = findSharedScript('task-state-entry.mjs');
  if (!entry) throw new Error('未找到 task-state-entry.mjs（共享脚本缺失）');
  return (field) => {
    const res = spawnSync(
      process.execPath,
      [entry, 'get', '--repo-root', repoRoot, '--task-id', taskId, '--path', field],
      { encoding: 'utf8' },
    );
    if (res.status !== 0) {
      throw new Error(`读取 ${field} 失败：${(res.stderr || res.stdout || '').trim()}`);
    }
    return res.stdout.trim();
  };
}

/** 解析共享脚本目录（安装态优先，仓内态兜底），找不到返回 null */
export function findSharedScript(name) {
  const candidates = [
    path.resolve(SCRIPT_DIR, '../../../scripts', name),
    path.resolve(SCRIPT_DIR, '../../../../../shared/scripts', name),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function main(argv) {
  const args = { repoRoot: '', taskId: '', docDir: '', apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--repo-root') args.repoRoot = argv[++i] ?? '';
    else if (a === '--task-id') args.taskId = argv[++i] ?? '';
    else if (a === '--doc-dir') args.docDir = argv[++i] ?? '';
    else {
      console.error(`未知参数：${a}`);
      process.exitCode = 2;
      return;
    }
  }
  if (!args.repoRoot || !args.taskId) {
    console.error('缺少 --repo-root 或 --task-id');
    process.exitCode = 2;
    return;
  }

  let mode;
  let prefix;
  let nameCn;
  try {
    const read = makeStateFieldReader(args);
    mode = read('workflow.mode');
    prefix = read('req_prefix');
    nameCn = read('req_name_cn');
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
    return;
  }

  const docDir = args.docDir || path.join(args.repoRoot, 'docs', 'prd');
  let plan;
  try {
    plan = planDelivery({ repoRoot: args.repoRoot, taskId: args.taskId, mode, prefix, nameCn, docDir });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
    return;
  }

  if (!fs.existsSync(plan.src)) {
    console.error(
      JSON.stringify({ error: '交付源缺失', src: plan.src, hint: `请先执行 ${plan.missingHint}` }),
    );
    process.exitCode = 2;
    return;
  }

  if (!args.apply) {
    console.log(JSON.stringify({ action: 'preview', ...plan, docDir }, null, 2));
    return;
  }

  if (fs.existsSync(plan.dst)) {
    console.error(
      JSON.stringify({ error: '目标已存在，不覆盖', dst: plan.dst, hint: '按 SKILL 询问 A 覆盖 / B 另存 v1.1 / C 取消' }),
    );
    process.exitCode = 3;
    return;
  }

  fs.mkdirSync(docDir, { recursive: true });
  fs.copyFileSync(plan.src, plan.dst);
  console.log(JSON.stringify({ action: 'deliver', ...plan, docDir, applied: true }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
