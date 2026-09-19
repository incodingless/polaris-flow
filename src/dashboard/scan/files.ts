/**
 * 任务文件树与 `tasks.md` 复选框解析。
 *
 * 文件来源两处（都存在就都收，**不按 kind 分支** —— 分支会在族演进时变成维护负担）：
 *   1. `.polaris/<segment>/<taskId>/`（运行态：state.yaml、各阶段过程档案）
 *   2. `openspec/changes/<taskId>/`（叙事与规格：四件套、intention、reviews）
 *
 * 文件条目的 `path` 是**相对项目根的 posix 路径**，与产物表（`task-kind-layout.ts`
 * 的 `relPaths`）同形 —— 前端据此把文件归到阶段 Tab，两侧无需再对齐一次。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { getTaskKindDir } from '../../core/assets/polaris-paths.js';
import { getKindArtifacts } from '../../core/config/task-kind-layout.js';
import type { WorkflowTaskKind } from '../../core/config/workflow-state.js';

export type TaskFile = {
  /** 相对项目根的 posix 路径，如 `.polaris/tasks/x/state.yaml` */
  path: string;
  /** 展示用名（取路径末段） */
  name: string;
  /** 文件内容；读失败时为空串 */
  content: string;
};

export type TaskProgress = {
  total: number;
  done: number;
};

/** 只看这两类文本文件；二进制/大文件不入面板 */
const TEXT_EXTENSIONS = ['.md', '.yaml'];

/** 递归收集文本文件（相对项目根的 posix 路径） */
function walkFiles(projectRoot: string, absDir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    // 目录不存在或不可读：跳过，不影响另一来源
    return;
  }
  for (const entry of entries) {
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(projectRoot, abs, out);
      continue;
    }
    if (!TEXT_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      continue;
    }
    out.push(path.relative(projectRoot, abs).split(path.sep).join('/'));
  }
}

/** 读文本；失败返回空串 */
function readTextSafe(absPath: string): string {
  try {
    return readFileSync(absPath, 'utf-8');
  } catch {
    return '';
  }
}

/** 列出任务相关文件（任务目录 + openspec 变更目录） */
export function listTaskFiles(
  projectRoot: string,
  kind: WorkflowTaskKind,
  taskId: string,
): TaskFile[] {
  const collected: string[] = [];
  walkFiles(projectRoot, getTaskKindDir(projectRoot, kind, taskId), collected);
  walkFiles(projectRoot, path.join(projectRoot, 'openspec', 'changes', taskId), collected);

  return [...new Set(collected)]
    .sort((a, b) => a.localeCompare(b))
    .map((rel) => ({
      path: rel,
      name: path.posix.basename(rel),
      content: readTextSafe(path.join(projectRoot, rel)),
    }));
}

/** 解析 markdown 复选框 → { total, done }；无复选框返回 null */
export function parseCheckboxes(content: string): TaskProgress | null {
  let total = 0;
  let done = 0;
  for (const line of content.split('\n')) {
    const matched = line.match(/^\s*- \[(.)\] /);
    if (matched) {
      total += 1;
      if (matched[1] !== ' ') {
        done += 1;
      }
    }
  }
  return total > 0 ? { total, done } : null;
}

/**
 * 读该 kind 声明的复选框产物（产物表里 `checkboxes: true` 的那条）→ 进度。
 * 未声明或无文件时返回 null（UI 不渲染该行）。
 */
export function readTaskCheckboxes(
  projectRoot: string,
  kind: WorkflowTaskKind,
  taskId: string,
): TaskProgress | null {
  const targets = getKindArtifacts(kind).filter((a) => a.checkboxes);
  for (const artifact of targets) {
    for (const rel of artifact.relPaths) {
      const abs = path.join(projectRoot, rel.replace('<id>', taskId));
      if (!existsSync(abs)) {
        continue;
      }
      const progress = parseCheckboxes(readTextSafe(abs));
      if (progress) {
        return progress;
      }
    }
  }
  return null;
}
