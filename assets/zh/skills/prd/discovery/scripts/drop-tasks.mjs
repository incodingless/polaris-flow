#!/usr/bin/env node
/**
 * PRD discovery 专用：任务目录删除器。
 *
 * 把 SKILL.md 里的「rm -rf + delete-active」bash 片段收进脚本：
 * 清点（dry-run 默认）、二次确认（--confirm）、路径边界与 task_id 合法性
 * 全部在脚本内强制，调用方无法跳过。
 *
 * 用法：
 *   node drop-tasks.mjs --repo-root <R> --task-id <id> [--task-id <id2>…] [--confirm]
 *                       [--kind requirement] [--skill discovery]
 *
 * 退出码：0 成功（含 dry-run）；2 参数 / task_id / 路径非法；3 删除执行失败；4 游标注销失败。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
/** task_id 仅允许 kebab-case（与 discovery Step 2.4 的命名约束一致） */
const TASK_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 校验单个 task_id；非法返回原因，合法返回 null */
export function validateTaskId(id) {
  if (!id || id === '.' || id === '..') return 'task_id 不能为空 / . / ..';
  if (!TASK_ID_RE.test(id)) return `task_id 不是 kebab-case：${id}`;
  return null;
}

/** 解析任务目录，并确保其严格落在 `<repoRoot>/.polaris/tasks/<id>` 内 */
export function resolveTaskDir(repoRoot, id) {
  const tasksRoot = path.resolve(repoRoot, '.polaris', 'tasks');
  const dir = path.resolve(tasksRoot, id);
  if (dir !== tasksRoot && !dir.startsWith(tasksRoot + path.sep)) {
    throw new Error(`路径越界：${dir}`);
  }
  return dir;
}

/** 统计目录内文件数与字节数（清点回显用） */
export function statTree(dir) {
  let fileCount = 0;
  let bytes = 0;
  const walk = (cur) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        fileCount += 1;
        bytes += fs.statSync(full).size;
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return { fileCount, bytes };
}

/** 清点：dry-run 的全部产出，不产生任何副作用 */
export function collectPreview(repoRoot, ids) {
  return ids.map((id) => {
    const dir = resolveTaskDir(repoRoot, id);
    const exists = fs.existsSync(dir);
    const stats = exists ? statTree(dir) : { fileCount: 0, bytes: 0 };
    return { taskId: id, dir, exists, ...stats };
  });
}

/**
 * 解析共享脚本目录（游标注销要调 workflow-entry.mjs）。
 * 依次尝试：安装态（<pluginRoot>/scripts）→ 仓内态（assets/shared/scripts）。
 * 都找不到返回 null，由调用方决定降级。
 */
export function findSharedScript(name) {
  const candidates = [
    path.resolve(SCRIPT_DIR, '../../../scripts', name),
    path.resolve(SCRIPT_DIR, '../../../../../shared/scripts', name),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * 执行删除 + 注销游标。
 * @param {{repoRoot: string, ids: string[], kind?: string, skill?: string}} opts
 * @param {{removeDir?: Function, runCursor?: Function}} [io] 测试注入点
 */
export function applyDrop(opts, io = {}) {
  const removeDir = io.removeDir ?? ((dir) => fs.rmSync(dir, { recursive: true, force: false }));
  const runCursor =
    io.runCursor ??
    ((id) => {
      const entry = findSharedScript('workflow-entry.mjs');
      if (!entry) {
        return { ok: false, reason: '未找到 workflow-entry.mjs，请手动执行 delete-active' };
      }
      const res = spawnSync(
        process.execPath,
        [
          entry,
          'delete-active',
          '--kind',
          opts.kind ?? 'requirement',
          '--skill',
          opts.skill ?? 'discovery',
          '--repo-root',
          opts.repoRoot,
          '--where-task-id',
          id,
        ],
        { encoding: 'utf8' },
      );
      return res.status === 0
        ? { ok: true }
        : { ok: false, reason: (res.stderr || res.stdout || '').trim() };
    });

  const results = [];
  for (const id of opts.ids) {
    const invalid = validateTaskId(id);
    if (invalid) throw new Error(invalid);
    const dir = resolveTaskDir(opts.repoRoot, id);
    let removed = false;
    let removeError = null;
    try {
      removeDir(dir);
      removed = true;
    } catch (err) {
      removeError = err instanceof Error ? err.message : String(err);
    }
    // 目录已删才注销游标；删除失败时不注销，保留现场
    const cursor = removed ? runCursor(id) : { ok: false, reason: '目录删除失败，跳过' };
    results.push({ taskId: id, dir, removed, removeError, cursorRemoved: cursor.ok, cursorError: cursor.reason ?? null });
  }
  return results;
}

function main(argv) {
  const args = { ids: [], confirm: false, repoRoot: '', kind: 'requirement', skill: 'discovery' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--confirm') args.confirm = true;
    else if (a === '--repo-root') args.repoRoot = argv[++i] ?? '';
    else if (a === '--task-id') args.ids.push(argv[++i] ?? '');
    else if (a === '--kind') args.kind = argv[++i] ?? 'requirement';
    else if (a === '--skill') args.skill = argv[++i] ?? 'discovery';
    else {
      console.error(`未知参数：${a}`);
      process.exitCode = 2;
      return;
    }
  }
  if (!args.repoRoot || args.ids.length === 0) {
    console.error('缺少 --repo-root 或 --task-id');
    process.exitCode = 2;
    return;
  }
  for (const id of args.ids) {
    const invalid = validateTaskId(id);
    if (invalid) {
      console.error(invalid);
      process.exitCode = 2;
      return;
    }
  }

  if (!args.confirm) {
    const preview = collectPreview(args.repoRoot, args.ids);
    const total = preview.reduce((n, p) => n + p.fileCount, 0);
    console.log(
      JSON.stringify({ action: 'preview', tasks: preview, totalFiles: total, hint: '确认无误后加 --confirm 重新执行' }, null, 2),
    );
    return;
  }

  const results = applyDrop(args);
  const allRemoved = results.every((r) => r.removed);
  const cursorFailed = results.filter((r) => r.removed && !r.cursorRemoved);
  console.log(JSON.stringify({ action: 'drop', results }, null, 2));
  if (!allRemoved) process.exitCode = 3;
  else if (cursorFailed.length > 0) process.exitCode = 4;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
