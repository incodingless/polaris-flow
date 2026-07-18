/**
 * 平台 slash command 安装：经 command-adapters 写入各宿主命令路径。
 * installSource（外部源复用）在 source-installer.ts。
 */
import path from 'path';
import fs from 'fs/promises';

import { ensureDir, fileExists } from '../../utils/file-system.js';
import { getCommandAdapter } from './command-adapters.js';
import type { SkillSource } from '../assets/sources.js';
import { POLARIS_COMMAND_PREFIX } from '../assets/sources.js';
import { getPlatformSkillsDir, type Platform } from '../platform/platforms.js';
import type { InstallScope, Language } from '../types.js';
import { runCopyJobs, type CopyJob } from './copy-jobs.js';
import { getLanguageContentRoots } from '../assets/manifest.js';

/** 解析命令 markdown frontmatter */
export function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content };
  }

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      meta[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
    }
  }

  return { meta, body: match[2].trim() };
}

/** 解析 bundled 命令源目录（assets 根下） */
export async function resolveCommandsDir(
  assetsDir: string,
  lang: Language,
): Promise<string | null> {
  const roots = getLanguageContentRoots(lang);
  for (const root of roots) {
    const full = path.join(assetsDir, root, 'commands');
    if (await fileExists(full)) {
      return full;
    }
  }
  return null;
}

/** 经平台 adapter 安装 bundled 命令文件 */
export async function installCommands(
  source: SkillSource,
  commandsDir: string,
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  overwrite: boolean,
  _lang?: Language,
): Promise<{ copied: number; skipped: number }> {
  if (!source.commandsPath) {
    return { copied: 0, skipped: 0 };
  }

  let files: import('fs').Dirent[];
  try {
    files = await fs.readdir(commandsDir, { withFileTypes: true });
  } catch {
    return { copied: 0, skipped: 0 };
  }

  const adapter = getCommandAdapter(platform.id);
  const skillsDir = getPlatformSkillsDir(platform, scope);
  const prefix = source.commandsDirName ?? source.targetDir ?? POLARIS_COMMAND_PREFIX;

  const jobs: CopyJob[] = [];
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith('.md')) continue;

    const commandId = file.name.replace(/\.md$/, '');
    const destPath = adapter.getCommandPath(commandId, prefix, baseDir, skillsDir, scope);
    jobs.push({
      label: file.name,
      dest: destPath,
      write: async () => {
        const rawContent = await fs.readFile(path.join(commandsDir, file.name), 'utf-8');
        const { meta, body } = parseFrontmatter(rawContent);
        const formatted = adapter.formatCommand({
          id: commandId,
          name: meta['name'] ?? commandId,
          prefix,
          description: meta['description'] ?? '',
          body,
        });
        await ensureDir(path.dirname(destPath));
        await fs.writeFile(destPath, formatted, 'utf-8');
      },
    });
  }

  return runCopyJobs(jobs, overwrite);
}

/** 安装 Polaris bundled 命令（读取 assets 内 commands/） */
export async function installPolarisCommands(
  assetsDir: string,
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  lang: Language,
  overwrite: boolean,
  source: SkillSource,
): Promise<{ copied: number; skipped: number }> {
  const commandsDir = await resolveCommandsDir(assetsDir, lang);
  if (!commandsDir) {
    return { copied: 0, skipped: 0 };
  }

  return installCommands(source, commandsDir, baseDir, platform, scope, overwrite, lang);
}
