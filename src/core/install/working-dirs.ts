/**
 * 创建 init 所需的工作目录（不含 config.yaml，由 polaris-config 模块写入）。
 */
import path from 'path';

import { ensureDir } from '../../utils/file-system.js';

/** 创建 docs/superpowers 与 .polaris 工作目录 */
export async function createWorkingDirs(projectPath: string): Promise<void> {
  const dirs = [
    path.join(projectPath, 'docs', 'superpowers', 'specs'),
    path.join(projectPath, 'docs', 'superpowers', 'plans'),
    path.join(projectPath, '.polaris'),
  ];

  for (const dir of dirs) {
    await ensureDir(dir);
  }
}
