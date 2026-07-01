/**
 * Pi 适配器 — prompts 目录（项目本地）。
 * 输出：{skillsDir}/prompts/{prefix}-{id}.md
 *
 * 注：Polaris 对 Pi 另有 TS extension 注册逻辑（skills.ts），init 默认跳过此 adapter。
 */

import path from 'path';

import type { CommandAdapter, CommandContent } from './types.js';
import type { InstallScope } from '../types.js';

export const piAdapter: CommandAdapter = {
  platformIds: ['pi'],

  getCommandPath(
    commandId: string,
    prefix: string,
    baseDir: string,
    skillsDir: string,
    _scope: InstallScope,
  ): string {
    return path.join(baseDir, skillsDir, 'prompts', `${prefix}-${commandId}.md`);
  },

  formatCommand(content: CommandContent): string {
    const body = content.body.replace(
      new RegExp(`/${content.prefix}:`, 'g'),
      `/${content.prefix}-`,
    );

    const frontmatter = ['---', `description: ${content.description}`, '---'].join('\n');

    return `${frontmatter}\n\n${body}`;
  },
};
