/**
 * Codex 适配器 — 全局 prompts 目录。
 * 输出：~/.codex/prompts/{prefix}-{id}.md（始终全局，与 scope 无关）
 */

import path from 'path';
import os from 'os';

import type { CommandAdapter, CommandContent } from './types.js';
import type { InstallScope } from '../../types.js';

function getCodexHome(): string {
  const envHome = process.env.CODEX_HOME?.trim();
  return envHome ? path.resolve(envHome) : path.join(os.homedir(), '.codex');
}

/** Codex：~/.codex/prompts/{prefix}-{id}.md（始终全局） */
export const codexAdapter: CommandAdapter = {
  platformIds: ['codex'],

  getCommandPath(
    commandId: string,
    prefix: string,
    _baseDir: string,
    _skillsDir: string,
    _scope: InstallScope,
  ): string {
    return path.join(getCodexHome(), 'prompts', `${prefix}-${commandId}.md`);
  },

  formatCommand(content: CommandContent): string {
    const body = content.body.replace(
      new RegExp(`/${content.prefix}:`, 'g'),
      `/${content.prefix}-`,
    );

    const frontmatter = [
      '---',
      `description: ${content.description}`,
      'argument-hint: command arguments',
      '---',
    ].join('\n');

    return `${frontmatter}\n\n${body}`;
  },
};
