/**
 * draft-create：按任务 kind 创建 `.polaris/<segment>/draft-*` 目录。
 * coding / requirement / prototype → tasks；testcase → testcases。
 * 同根多 kind 时仅将「同 kind 的 draft」计为 existing。
 */
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { parse as parseYaml } from 'yaml';

import { getTaskKindDir, getTaskKindRootDir } from '../assets/polaris-paths.js';
import { getTaskKindLayout } from '../config/task-kind-layout.js';
import { fileExists } from '../../utils/file-system.js';
import type { WorkflowTaskKind } from '../config/workflow-state.js';

export type DraftCreateResult =
  | { exitCode: 0; draft_name: string; draft_dir: string }
  | { exitCode: 1; existing: string[] }
  | { exitCode: 2; error: string };

/**
 * 从 draft 目录的 state.yaml 读取 kind；缺省或无法解析视为 coding。
 */
async function readDraftKind(draftDir: string): Promise<WorkflowTaskKind> {
  const statePath = path.join(draftDir, 'state.yaml');
  if (!(await fileExists(statePath))) {
    return 'coding';
  }
  try {
    const raw = parseYaml(await readFile(statePath, 'utf-8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const kind = (raw as Record<string, unknown>).kind;
      if (
        kind === 'requirement' ||
        kind === 'testcase' ||
        kind === 'coding' ||
        kind === 'prototype' ||
        kind === 'debug'
      ) {
        return kind;
      }
    }
  } catch {
    // 解析失败按 coding 处理
  }
  return 'coding';
}

/**
 * 扫描并创建指定 kind 的 draft 目录。
 * 不支持 usesDraft=false 的 kind（如 requirement / prototype）。
 */
export async function runDraftCreate(
  repoRoot: string,
  kind: WorkflowTaskKind,
): Promise<DraftCreateResult> {
  if (!repoRoot) {
    return { exitCode: 2, error: 'usage: draft-create <repo_root> --kind <kind>' };
  }
  const layout = getTaskKindLayout(kind);
  if (!layout.usesDraft) {
    return {
      exitCode: 2,
      error: `kind=${kind} 不使用 draft 目录；请用 task-init --kind ${kind} --task-id <id>`,
    };
  }
  const root = path.resolve(repoRoot);
  if (!(await fileExists(root))) {
    return { exitCode: 2, error: `repo_root 不存在: ${root}` };
  }

  const kindRoot = getTaskKindRootDir(root, kind);
  await mkdir(kindRoot, { recursive: true });

  const entries = await readdir(kindRoot, { withFileTypes: true });
  const draftDirs = entries.filter((e) => e.isDirectory() && e.name.startsWith('draft-'));

  const existing: string[] = [];
  for (const e of draftDirs) {
    const draftKind = await readDraftKind(path.join(kindRoot, e.name));
    if (draftKind === kind) {
      existing.push(e.name);
    }
  }
  existing.sort();

  if (existing.length > 0) {
    return { exitCode: 1, existing };
  }

  let suffix = String(Math.floor(Date.now() / 1000)).slice(-6);
  let draftName = `draft-${suffix}`;
  let draftDir = getTaskKindDir(root, kind, draftName);
  if (await fileExists(draftDir)) {
    suffix = `${suffix}${randomBytes(1).toString('hex')}`;
    draftName = `draft-${suffix}`;
    draftDir = getTaskKindDir(root, kind, draftName);
  }

  await mkdir(draftDir, { recursive: true });
  // 写入最小 state，供同根多 kind 的 existing 扫描识别；task-init 随后覆盖完整 state
  await writeFile(path.join(draftDir, 'state.yaml'), `kind: ${kind}\n`, 'utf-8');
  return { exitCode: 0, draft_name: draftName, draft_dir: draftDir };
}
