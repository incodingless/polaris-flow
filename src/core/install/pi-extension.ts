/**
 * Pi 平台命令 extension 生成。
 * Pi 不走 markdown 命令安装，而是写入 TS extension + 开启 settings.enableSkillCommands。
 */
import path from 'path';
import fs from 'fs/promises';

import { ensureDir, fileExists } from '../../utils/file-system.js';
import { readJsonObjectOrEmpty, writeJsonPretty } from '../../utils/json-io.js';
import { getPlatformSkillsDir, type Platform } from '../platform/platforms.js';
import type { InstallScope } from '../types.js';

const PI_COMMAND_EXTENSION_FILE = 'polaris-commands.ts';

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
export async function createPiCommandExtension(
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
