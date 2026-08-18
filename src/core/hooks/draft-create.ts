/**
 * draft-create：创建 `.polaris/tasks/draft-*` 目录。
 */
import { mkdir, readdir } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';

import { getTaskDir, getTasksDir } from '../assets/polaris-paths.js';
import { fileExists } from '../../utils/file-system.js';

export type DraftCreateResult =
  | { exitCode: 0; draft_name: string; draft_dir: string }
  | { exitCode: 1; existing: string[] }
  | { exitCode: 2; error: string };

/**
 * 扫描并创建 draft 目录；语义对齐 draft-create.sh。
 */
export async function runDraftCreate(repoRoot: string): Promise<DraftCreateResult> {
  if (!repoRoot) {
    return { exitCode: 2, error: 'usage: draft-create <repo_root>' };
  }
  const root = path.resolve(repoRoot);
  if (!(await fileExists(root))) {
    return { exitCode: 2, error: `repo_root 不存在: ${root}` };
  }

  const tasksDir = getTasksDir(root);
  await mkdir(tasksDir, { recursive: true });

  const entries = await readdir(tasksDir, { withFileTypes: true });
  const existing = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('draft-'))
    .map((e) => e.name)
    .sort();

  if (existing.length > 0) {
    return { exitCode: 1, existing };
  }

  let suffix = String(Math.floor(Date.now() / 1000)).slice(-6);
  let draftName = `draft-${suffix}`;
  let draftDir = getTaskDir(root, draftName);
  if (await fileExists(draftDir)) {
    suffix = `${suffix}${randomBytes(1).toString('hex')}`;
    draftName = `draft-${suffix}`;
    draftDir = getTaskDir(root, draftName);
  }

  await mkdir(draftDir, { recursive: true });
  return { exitCode: 0, draft_name: draftName, draft_dir: draftDir };
}