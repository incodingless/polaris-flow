/**
 * Windsurf 适配器 — workflows 目录。
 * 输出：{skillsDir}/workflows/{prefix}-{id}.md
 */

import path from 'path';

import type { CommandAdapter, CommandContent } from './types.js';
import type { InstallScope } from '../../types.js';

/** Windsurf：{skillsDir}/workflows/{prefix}-{id}.md */
export const windsurfAdapter: CommandAdapter = {
  platformIds: ['windsurf'],

  getCommandPath(
    commandId: string,
    prefix: string,
    baseDir: string,
    skillsDir: string,
    _scope: InstallScope,
  ): string {
    return path.join(baseDir, skillsDir, 'workflows', `${prefix}-${commandId}.md`);
  },

  formatCommand(content: CommandContent): string {
    const body = content.body.replace(
      new RegExp(`/${content.prefix}:`, 'g'),
      `/${content.prefix}-`,
    );

    const frontmatter = [
      '---',
      `name: ${content.prefix}-${content.id}`,
      `description: ${content.description}`,
      'category: polaris',
      `tags: [${content.prefix}, workflow]`,
      '---',
    ].join('\n');

    return `${frontmatter}\n\n${body}`;
  },
};
