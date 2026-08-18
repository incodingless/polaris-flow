/**
 * 将 agent 定义安装到平台 agents 目录；按平台映射 tools，并写入 config 解析出的 model。
 */
import path from 'path';
import { readFile, writeFile } from 'fs/promises';

import { ensureDir, fileExists } from '../../utils/file-system.js';
import { Assets } from '../assets/manifest.js';
import { type Platform } from '../domain/platforms.js';
import { loadPolarisConfig, resolveAgentModel } from '../config/polaris-project-config.js';

/** 资产相对路径中的 agent 分组 → 平台 agents 目录下的文件名 */
function parseAgentAssetPath(shortPath: string): { group: string; fileName: string } | null {
  const normalized = shortPath.replace(/\\/g, '/');
  if (!normalized.endsWith('.md')) {
    return null;
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return { group: 'review', fileName: parts[0] };
  }
  return { group: parts[0], fileName: parts[parts.length - 1] };
}

/**
 * 拷贝 assets/<lang>/agents 下的 md 到 .<platform>/agents/，并按平台改写 tools / model。
 * 分组目录（如 review/）仅用于解析 model 槽位；落盘文件名为 basename。
 */
export async function copyPolarisAgents(
  projectPath: string,
  agentsDir: string,
  overwrite: boolean,
  asset: Assets,
  platform: Platform,
): Promise<{ copied: number; skipped: number }> {
  const agentAssetDirs = asset.langDirAssets.filter((a) => a.dir === 'agents');

  let copied = 0;
  let skipped = 0;
  const config = await loadPolarisConfig(projectPath);
  await ensureDir(agentsDir);

  for (const agentDir of agentAssetDirs) {
    for (const file of agentDir.files) {
      const parsed = parseAgentAssetPath(file.shortPath);
      if (!parsed) continue;

      const model = resolveAgentModel(config, parsed.group);
      const dest = path.join(agentsDir, parsed.fileName);
      if ((await fileExists(dest)) && !overwrite) {
        skipped += 1;
        continue;
      }

      const raw = await readFile(file.fullPath, 'utf-8');
      const toolsCsv = mapAgentTools(platform, extractToolsCsv(raw));
      const rewritten = rewriteAgentFrontmatter(raw, toolsCsv, model);
      await ensureDir(path.dirname(dest));
      await writeFile(dest, rewritten, 'utf-8');
      copied += 1;
    }
  }

  return { copied, skipped };
}

/**
 * 从 agent 源文本提取 frontmatter 中的 tools CSV；缺失则返回空串。
 */
function extractToolsCsv(raw: string): string {
  const match = raw.match(/^tools:\s*(.*)$/m);
  return match?.[1]?.trim() ?? '';
}

/**
 * 将资产 frontmatter 中的规范工具 CSV 映射为平台实际工具名（保序去重）。
 */
export function mapAgentTools(platform: Platform, toolsCsv: string): string {
  const tools = new Set<string>();
  for (const part of toolsCsv.split(',')) {
    const name = part.trim();
    if (!name) continue;
    const resolved = platform.agentToolMap[name];
    if (resolved === undefined) continue;
    tools.add(resolved);
  }
  return Array.from(tools).sort().join(', ');
}

/**
 * 改写 agent markdown frontmatter 的 tools / model 行（不触碰正文）。
 */
export function rewriteAgentFrontmatter(raw: string, toolsCsv?: string, model?: string): string {
  let updated = raw;
  if (toolsCsv !== undefined) {
    updated = updated.replace(/^tools:.*$/m, `tools: ${toolsCsv}`);
  }
  if (model !== undefined) {
    updated = updated.replace(/^model:.*$/m, `model: ${model}`);
  }
  return updated;
}
