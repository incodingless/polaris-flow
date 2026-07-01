/**
 * Gemini 适配器 — 与 Claude 相同的子目录风格。
 * 输出：{skillsDir}/commands/{prefix}/{id}.md
 */

import path from 'path';

import type { CommandAdapter, CommandContent } from './types.js';
import type { InstallScope } from '../types.js';

export const geminiAdapter: CommandAdapter = {
  platformIds: ['gemini'],

  getCommandPath(
    commandId: string,
    prefix: string,
    baseDir: string,
    skillsDir: string,
    _scope: InstallScope,
  ): string {
    return path.join(baseDir, skillsDir, 'commands', prefix, `${commandId}.md`);
  },

  formatCommand(content: CommandContent): string {
    const frontmatter = [
      '---',
      `name: ${content.name}`,
      `command_prefix: ${content.prefix}`,
      `triggers: ["/${content.prefix}:${content.id}"]`,
      `description: ${content.description}`,
      '---',
    ].join('\n');

    return `${frontmatter}\n\n${content.body}`;
  },
};
