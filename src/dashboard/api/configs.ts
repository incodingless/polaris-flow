/**
 * 配置查看 API（`GET /api/configs`、`GET /api/configs/:path`），只读。
 *
 * 数据源换成 polaris-flow 的现行配置：`.polaris/*.yaml`（`config.yaml` / `workflow.yaml` 等）。
 * 旧实现扫的是 `openspec/polaris.yaml` 与 `openspec/schemas/**`，那是 openspec 时代的配置布局。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { getPolarisDir } from '../../core/assets/polaris-paths.js';

export type ConfigEntry = { path: string; name: string; mtime: string };

/** 列出 `.polaris/` 顶层的 yaml 配置（不递归：任务运行态由任务端点负责） */
export function listConfigs(projectRoot: string): ConfigEntry[] {
  const polarisDir = getPolarisDir(projectRoot);
  if (!existsSync(polarisDir)) {
    return [];
  }

  const results: ConfigEntry[] = [];
  let entries;
  try {
    entries = readdirSync(polarisDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) {
      continue;
    }
    const relPath = path.posix.join('.polaris', entry.name);
    try {
      results.push({
        path: relPath,
        name: entry.name,
        mtime: statSync(path.join(polarisDir, entry.name)).mtime.toISOString(),
      });
    } catch {
      // 单个文件取不到 stat 时跳过，不影响其余
    }
  }

  return results.sort((a, b) => a.path.localeCompare(b.path));
}

/** 读单个配置文件；越出项目根一律拒绝 */
export function getConfig(
  projectRoot: string,
  configPath: string,
): { path: string; content: string; syntax: 'yaml' | 'markdown' } | { error: string } {
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, configPath);
  // 越界防护：`../` 与绝对路径都不允许
  if (target !== root && !target.startsWith(root + path.sep)) {
    return { error: 'Invalid path' };
  }
  if (!existsSync(target)) {
    return { error: 'File not found' };
  }

  const isYaml = /\.ya?ml$/.test(configPath);
  return {
    path: configPath,
    content: readFileSync(target, 'utf8'),
    syntax: isYaml ? 'yaml' : 'markdown',
  };
}

// saveConfig 刻意不提供：它是绕过 .polaris/.locks/ 的直写（设计文档 §5.1）。
// 面板在 M1/M2 为只读；配置编辑由编辑器承担。
