import path from 'path';
import fs from 'fs/promises';
import { writeFile } from 'fs/promises';

import { fileExists, ensureDir } from '../utils/file-system.js';
import { getCommandAdapter } from './command-adapters/index.js';
import type { SkillSource } from './sources.js';
import { POLARIS_COMMAND_PREFIX } from './sources.js';
import { getPlatformSkillsDir, type Platform } from './platforms.js';
import type { InstallScope, SkillLanguage } from './types.js';

export interface LockSourceEntry {
  id: string;
  version: string;
}

export interface LockFile {
  version: number;
  lang: string;
  scope: string;
  platforms: string[];
  sources: LockSourceEntry[];
  installedAt: string;
}

/** 写入 `.polaris/skills-lock.json`，供 update/doctor 读取 */
export async function writeLockFile(
  projectPath: string,
  lang: string,
  scope: InstallScope,
  platformIds: string[],
  sourceEntries: LockSourceEntry[],
): Promise<void> {
  const lock: LockFile = {
    version: 1,
    lang,
    scope,
    platforms: platformIds,
    sources: sourceEntries,
    installedAt: new Date().toISOString(),
  };

  const lockDir = path.join(projectPath, '.polaris');
  await ensureDir(lockDir);
  const lockPath = path.join(lockDir, 'skills-lock.json');
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
}

/** 将 assets 内语言路径 zh/ → en/ */
function resolveLangPath(assetPath: string, lang: SkillLanguage): string {
  if (lang === 'zh') return assetPath;
  return assetPath.replace(/^zh\//, 'en/').replace(/^skills-zh\//, 'skills/');
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  let items: import('fs').Dirent[];
  try {
    items = await fs.readdir(src, { withFileTypes: true });
  } catch {
    return;
  }

  for (const item of items) {
    const srcPath = path.join(src, item.name);
    const destPath = path.join(dest, item.name);

    if (item.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      const content = await fs.readFile(srcPath);
      await fs.writeFile(destPath, content);
    }
  }
}

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
  lang: SkillLanguage,
): Promise<string | null> {
  const candidates =
    lang === 'zh' ? ['zh/commands', 'skills-zh/commands'] : ['en/commands', 'skills/commands'];

  for (const rel of candidates) {
    const full = path.join(assetsDir, rel);
    if (await fileExists(full)) {
      return full;
    }
  }

  return null;
}

/**
 * 从 GitHub clone 或 bundled 仓库复制 skills 到平台目录。
 */
export async function installSource(
  source: SkillSource,
  repoPath: string,
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  lang?: SkillLanguage,
): Promise<void> {
  const skillsDir = getPlatformSkillsDir(platform, scope);
  const platformSkillsRoot = path.join(baseDir, skillsDir, 'skills');
  await fs.mkdir(platformSkillsRoot, { recursive: true });

  const l = lang ?? 'zh';

  if (source.skillsPath) {
    const resolvedPath = resolveLangPath(source.skillsPath, l);
    const srcSkills = path.join(repoPath, resolvedPath);
    const destSkills = path.join(platformSkillsRoot, source.targetDir ?? '');
    await copyDirRecursive(srcSkills, destSkills);
  }

  if (source.extraPaths) {
    for (const ep of source.extraPaths) {
      const langEp = resolveLangPath(ep, l);
      const srcExtra = path.join(repoPath, langEp);
      let srcActual = srcExtra;
      let stat = await fs.stat(srcExtra).catch(() => null);

      if (!stat && langEp !== ep) {
        srcActual = path.join(repoPath, ep);
        stat = await fs.stat(srcActual).catch(() => null);
      }

      if (!stat) continue;

      const destRel = ep.replace(/^assets\/(zh|en|shared)\//, '').replace(/^zh\//, '');
      const destPath = path.join(platformSkillsRoot, source.targetDir ?? '', destRel);

      if (stat.isDirectory()) {
        await copyDirRecursive(srcActual, destPath);
      } else {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, await fs.readFile(srcActual));
      }
    }
  }
}

/**
 * 经平台 adapter 安装 bundled 命令文件。
 * Pi 平台由 skills.ts 的 TS extension 处理，此处跳过。
 */
export async function installCommands(
  source: SkillSource,
  commandsDir: string,
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  overwrite: boolean,
  _lang?: SkillLanguage,
): Promise<{ copied: number; skipped: number }> {
  if (!source.commandsPath || platform.id === 'pi') {
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

  let copied = 0;
  let skipped = 0;

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith('.md')) continue;

    const commandId = file.name.replace(/\.md$/, '');
    const rawContent = await fs.readFile(path.join(commandsDir, file.name), 'utf-8');
    const { meta, body } = parseFrontmatter(rawContent);

    const destPath = adapter.getCommandPath(commandId, prefix, baseDir, skillsDir, scope);

    if (!overwrite && (await fileExists(destPath))) {
      skipped++;
      continue;
    }

    const formatted = adapter.formatCommand({
      id: commandId,
      name: meta['name'] ?? commandId,
      prefix,
      description: meta['description'] ?? '',
      body,
    });

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, formatted, 'utf-8');
    copied++;
  }

  return { copied, skipped };
}

/** 安装 Polaris bundled 命令（读取 assets 内 commands/） */
export async function installPolarisCommands(
  assetsDir: string,
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  lang: SkillLanguage,
  overwrite: boolean,
  source: SkillSource,
): Promise<{ copied: number; skipped: number }> {
  const commandsDir = await resolveCommandsDir(assetsDir, lang);
  if (!commandsDir) {
    return { copied: 0, skipped: 0 };
  }

  return installCommands(source, commandsDir, baseDir, platform, scope, overwrite, lang);
}
