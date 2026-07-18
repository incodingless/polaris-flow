/**
 * 平台命令适配器：将命令 .md 解析后内容按平台目录约定与 frontmatter 格式落盘。
 * 每 adapter 声明 platformIds + getCommandPath + formatCommand。
 */
import path from 'path';
import os from 'os';

import type { InstallScope } from '../../types.js';

/** 从 assets 命令 .md 解析后的中间结构 */
export interface CommandContent {
  /** 命令 ID（文件名不含扩展名），如 design */
  id: string;
  /** frontmatter 中的展示名 */
  name: string;
  /** 命令前缀，如 polaris */
  prefix: string;
  /** frontmatter 描述 */
  description: string;
  /** frontmatter 之后的正文 */
  body: string;
}

/** 各平台命令路径与格式适配器 */
export interface CommandAdapter {
  /** 此 adapter 负责的平台 ID */
  platformIds: string[];
  getCommandPath(
    commandId: string,
    prefix: string,
    baseDir: string,
    skillsDir: string,
    scope: InstallScope,
  ): string;
  formatCommand(content: CommandContent): string;
}

/** 把 body 里的 `/<prefix>:` 触发符改写为 `/<prefix>-`（适配不识别冒号语法的平台） */
function rewriteColonTrigger(body: string, prefix: string): string {
  return body.replace(new RegExp(`/${prefix}:`, 'g'), `/${prefix}-`);
}

/** 拼接 frontmatter 字段为 YAML 头 */
function joinFrontmatter(lines: string[]): string {
  return ['---', ...lines, '---'].join('\n');
}

/** 默认（扁平）适配器 — 大多数平台使用 */
export const defaultAdapter: CommandAdapter = {
  platformIds: [
    'cursor',
    'opencode',
    'bob',
    'cline',
    'roocode',
    'continue',
    'costrict',
    'crush',
    'factory',
    'iflow',
    'junie',
    'kilocode',
    'kiro',
    'qoder',
    'qwen',
    'amazon-q',
    'auggie',
    'antigravity',
    'lingma',
    'forgecode',
    'trae',
    'github-copilot',
    'kimicode',
  ],

  getCommandPath(commandId, prefix, baseDir, skillsDir, _scope): string {
    return path.join(baseDir, skillsDir, 'commands', `${prefix}-${commandId}.md`);
  },

  formatCommand(content): string {
    const body = rewriteColonTrigger(content.body, content.prefix);
    const frontmatter = joinFrontmatter([`description: ${content.description}`]);
    return `${frontmatter}\n\n${body}`;
  },
};

/** Claude / CodeBuddy / Gemini：commands/{prefix}/{id}.md，保留冒号触发符 */
export const claudeAdapter: CommandAdapter = {
  platformIds: ['claude', 'codebuddy', 'gemini'],

  getCommandPath(commandId, prefix, baseDir, skillsDir, _scope): string {
    return path.join(baseDir, skillsDir, 'commands', prefix, `${commandId}.md`);
  },

  formatCommand(content): string {
    const frontmatter = joinFrontmatter([
      `name: ${content.name}`,
      `command_prefix: ${content.prefix}`,
      `triggers: ["/${content.prefix}:${content.id}"]`,
      `description: ${content.description}`,
    ]);
    return `${frontmatter}\n\n${content.body}`;
  },
};

/** Codex：~/.codex/prompts/{prefix}-{id}.md（始终全局，与 scope 无关） */
export const codexAdapter: CommandAdapter = {
  platformIds: ['codex'],

  getCommandPath(commandId, prefix, _baseDir, _skillsDir, _scope): string {
    return path.join(getCodexHome(), 'prompts', `${prefix}-${commandId}.md`);
  },

  formatCommand(content): string {
    const body = rewriteColonTrigger(content.body, content.prefix);
    const frontmatter = joinFrontmatter([
      `description: ${content.description}`,
      'argument-hint: command arguments',
    ]);
    return `${frontmatter}\n\n${body}`;
  },
};

/** Pi：{skillsDir}/prompts/{prefix}-{id}.md（init 默认跳过，另走 TS extension） */
export const piAdapter: CommandAdapter = {
  platformIds: ['pi'],

  getCommandPath(commandId, prefix, baseDir, skillsDir, _scope): string {
    return path.join(baseDir, skillsDir, 'prompts', `${prefix}-${commandId}.md`);
  },

  formatCommand(content): string {
    const body = rewriteColonTrigger(content.body, content.prefix);
    const frontmatter = joinFrontmatter([`description: ${content.description}`]);
    return `${frontmatter}\n\n${body}`;
  },
};

/** Windsurf：{skillsDir}/workflows/{prefix}-{id}.md */
export const windsurfAdapter: CommandAdapter = {
  platformIds: ['windsurf'],

  getCommandPath(commandId, prefix, baseDir, skillsDir, _scope): string {
    return path.join(baseDir, skillsDir, 'workflows', `${prefix}-${commandId}.md`);
  },

  formatCommand(content): string {
    const body = rewriteColonTrigger(content.body, content.prefix);
    const frontmatter = joinFrontmatter([
      `name: ${content.prefix}-${content.id}`,
      `description: ${content.description}`,
      'category: polaris',
      `tags: [${content.prefix}, workflow]`,
    ]);
    return `${frontmatter}\n\n${body}`;
  },
};

function getCodexHome(): string {
  const envHome = process.env.CODEX_HOME?.trim();
  return envHome ? path.resolve(envHome) : path.join(os.homedir(), '.codex');
}

const ALL_ADAPTERS: CommandAdapter[] = [
  claudeAdapter,
  codexAdapter,
  windsurfAdapter,
  piAdapter,
  defaultAdapter,
];

const adapterMap = new Map<string, CommandAdapter>();
for (const adapter of ALL_ADAPTERS) {
  for (const id of adapter.platformIds) {
    adapterMap.set(id, adapter);
  }
}

/** 获取平台命令适配器；未命中时回退 defaultAdapter */
export function getCommandAdapter(platformId: string): CommandAdapter {
  return adapterMap.get(platformId) ?? defaultAdapter;
}
