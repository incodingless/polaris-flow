/**
 * 平台 slash command 安装：经 command-adapters 写入各宿主命令路径。
 * 亦提供 installSource（给 Superpowers 等外部源复用）；Pi 走 TS extension。
 */
import path from 'path';
import fs from 'fs/promises';

import { copyDirContents, copyFile, ensureDir, fileExists } from '../../utils/file-system.js';
import { getCommandAdapter } from './command-adapters/index.js';
import type { SkillSource } from '../assets/sources.js';
import { POLARIS_COMMAND_PREFIX } from '../assets/sources.js';
import { getPlatformSkillsDir, type Platform } from '../platform/platforms.js';
import type { InstallScope, Language } from '../types.js';
import { runCopyJobs, type CopyJob } from './copy-jobs.js';
import { getLanguageContentRoots } from '../assets/manifest.js';
import { getManifestSkills } from './manifest-reader.js';
import { readJsonObjectOrEmpty, writeJsonPretty } from './hooks/json-io.js';

const PI_COMMAND_EXTENSION_FILE = 'polaris-commands.ts';

/** 将 assets 内语言路径 zh/ → en/（与 getLanguageContentRoots 策略一致） */
function resolveLangPath(assetPath: string, lang: Language): string {
  if (lang === 'zh') return assetPath;
  return assetPath.replace(/^zh\//, 'en/').replace(/^skills-zh\//, 'skills/');
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

/**
 * 从 GitHub clone 或 bundled 仓库复制 skills 到平台目录。
 */
export async function installSource(
  source: SkillSource,
  repoPath: string,
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  lang?: Language,
): Promise<void> {
  const skillsDir = getPlatformSkillsDir(platform, scope);
  const platformSkillsRoot = path.join(baseDir, skillsDir, 'skills');
  await ensureDir(platformSkillsRoot);

  const l = lang ?? 'zh';

  if (source.skillsPath) {
    const resolvedPath = resolveLangPath(source.skillsPath, l);
    const srcSkills = path.join(repoPath, resolvedPath);
    const destSkills = path.join(platformSkillsRoot, source.targetDir ?? '');
    await copyDirContents(srcSkills, destSkills);
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
        await copyDirContents(srcActual, destPath);
      } else {
        await copyFile(srcActual, destPath);
      }
    }
  }
}

/**
 * 经平台 adapter 安装 bundled 命令文件。
 * Pi 平台由 installPolarisCommands 内的 TS extension 处理，此处跳过。
 */
export async function installCommands(
  source: SkillSource,
  commandsDir: string,
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  overwrite: boolean,
  _lang?: Language,
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

/** 安装 Polaris bundled 命令（读取 assets 内 commands/；Pi 写 extension） */
export async function installPolarisCommands(
  assetsDir: string,
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  lang: Language,
  overwrite: boolean,
  source: SkillSource,
): Promise<{ copied: number; skipped: number }> {
  if (platform.id === 'pi') {
    const skillMdPaths = (await getManifestSkills(lang)).filter(
      (p) => p.startsWith('skills/') && (p.endsWith('/SKILL.md') || p.endsWith('SKILL.md')),
    );
    const manifestSkills = skillMdPaths.map((p) => p.slice('skills/'.length));
    return createPiCommandExtension(baseDir, platform, manifestSkills, overwrite, scope);
  }

  const commandsDir = await resolveCommandsDir(assetsDir, lang);
  if (!commandsDir) {
    return { copied: 0, skipped: 0 };
  }

  return installCommands(source, commandsDir, baseDir, platform, scope, overwrite, lang);
}

/** 从 `skillName/SKILL.md` 路径取出顶层 skill 名 */
function getTopLevelSkillNames(skillPaths: string[]): string[] {
  return skillPaths.flatMap((skillPath) => {
    const parts = skillPath.split('/');
    return parts.length === 2 && parts[1] === 'SKILL.md' ? [parts[0]] : [];
  });
}

/** 渲染 Pi 平台的命令 extension 源码 */
function renderPiCommandExtension(skillNames: string[]): string {
  return `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const commands = ${JSON.stringify(skillNames, null, 2)} as const;

export default function registerPolarisCommands(pi: ExtensionAPI) {
  for (const name of commands) {
    pi.registerCommand(name, {
      description: \`Polaris: /\${name}\`,
      handler: async (args) => {
        pi.sendUserMessage(args ? \`/skill:\${name} \${args}\` : \`/skill:\${name}\`);
      },
    });
  }
}
`;
}

/**
 * 为 Pi 平台写入 polaris-commands extension，并开启 enableSkillCommands。
 */
async function createPiCommandExtension(
  baseDir: string,
  platform: Platform,
  skillPaths: string[],
  overwrite: boolean,
  scope: InstallScope,
): Promise<{ copied: number; skipped: number }> {
  const platformBase = path.join(baseDir, getPlatformSkillsDir(platform, scope));
  const settingsPath = path.join(platformBase, 'settings.json');
  const extensionPath = path.join(platformBase, 'extensions', PI_COMMAND_EXTENSION_FILE);

  let copied = 0;
  let skipped = 0;

  let settings: Record<string, unknown>;
  if (await fileExists(settingsPath)) {
    try {
      const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('expected a JSON object');
      }
      settings = parsed as Record<string, unknown>;
    } catch (err) {
      throw new Error(`Invalid Pi settings at ${settingsPath}: ${(err as Error).message}`, {
        cause: err,
      });
    }
  } else {
    settings = await readJsonObjectOrEmpty(settingsPath);
  }

  if (settings.enableSkillCommands !== true) {
    settings.enableSkillCommands = true;
    await writeJsonPretty(settingsPath, settings);
    copied++;
  }

  if (!overwrite && (await fileExists(extensionPath))) {
    skipped++;
    return { copied, skipped };
  }

  await ensureDir(path.dirname(extensionPath));
  await fs.writeFile(
    extensionPath,
    renderPiCommandExtension(getTopLevelSkillNames(skillPaths)),
    'utf-8',
  );
  copied++;

  return { copied, skipped };
}
