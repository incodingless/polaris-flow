/**
 * 平台探测与组件是否已安装判定（openspec / superpowers / polaris）。
 * 含 init 用的 hasSkills，以及 session-start 用的 global→project 详细探测（原 plugin-presence）。
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

import { fileExists, readDir } from '../../utils/file-system.js';
import { PLATFORMS, type Platform } from '../domain/platforms.js';
import type { InstallScope } from '../config/polaris-project-config.js';
import { getPlatformContextDir } from '../domain/platforms.js';
import { POLARIS_FLOW_PLUGIN_NAME, POLARIS_PLUGIN_PREFIX } from '../config/polaris-constants.js';

/** superpowers 特征 skill（命中任一即视为已装） */
const SUPERPOWERS_MARKERS = [
  'brainstorming',
  'using-superpowers',
  'writing-plans',
  'test-driven-development',
  'subagent-driven-development',
  'request-code-review',
] as const;

export type PluginName = 'superpowers' | 'openspec';

export type PluginFindResult = {
  scope: 'global' | 'project';
  kind: 'plugin' | 'plugin-cache' | 'skills' | 'cli';
  path: string;
  variant?: string;
  version?: string;
  /** openspec-cn 等需别名提示时为 true */
  warn?: boolean;
};

export type PluginPresenceResult = {
  ok: boolean;
  /** 找到但有告警（如仅 openspec-cn）时 ok 仍为 false，与 shell 退出语义一致 */
  found: boolean;
  result?: PluginFindResult;
};

export type PluginPresenceOptions = {
  /** 可注入 HOME，便于单测隔离本机全局插件 */
  homeDir?: string;
  /** 可注入 which 探测，便于单测隔离本机 PATH 上的 CLI */
  isCommandAvailable?: (command: string) => boolean;
};

/** 返回安装目标根目录：project 用项目路径，global 用用户主目录 */
function getBaseDir(scope: InstallScope, projectPath: string): string {
  return scope === 'global' ? os.homedir() : projectPath;
}

/** 根据 detectionPaths / skillsDir 是否存在，探测项目可能使用的平台集合 */
async function detectPlatforms(projectPath: string): Promise<Set<string>> {
  const detectedPlatforms = new Set<string>();

  for (const platform of PLATFORMS) {
    if (platform.detectionPaths && platform.detectionPaths.length > 0) {
      for (const p of platform.detectionPaths) {
        if (await fileExists(path.join(projectPath, p))) {
          detectedPlatforms.add(platform.id);
          break;
        }
      }
    } else {
      // getPlatformContextDir 已含 projectPath，勿再 join（Node path.join 不丢弃绝对段）
      const skillsDir = getPlatformContextDir(platform, 'project', projectPath);
      if (await fileExists(skillsDir)) {
        detectedPlatforms.add(platform.id);
      }
    }
  }

  return detectedPlatforms;
}

/**
 * 检查指定 scope 的 baseDir 下，某平台组件是否已安装。
 * 只检查当前安装目标目录（project 或 global），不跨 scope 查主目录，避免误报。
 */
async function hasSkills(
  skillsDir: string,
  component: 'openspec' | 'superpowers' | 'polaris' | 'codegraph',
): Promise<boolean> {
  const entries = (await fileExists(skillsDir)) ? await readDir(skillsDir) : [];

  switch (component) {
    case 'openspec':
      if (entries.some((e) => e.startsWith('openspec-'))) return true;
      break;
    case 'superpowers':
      if (SUPERPOWERS_MARKERS.some((name) => entries.includes(name))) return true;
      break;
    case 'codegraph':
      if (entries.some((e) => e.startsWith('codegraph-'))) return true;
      break;
    case 'polaris':
      // polaris-flow（嵌套包根）或 polaris-flow-*（Trae 扁平子 skill）或旧版 polaris*
      if (
        entries.some(
          (e) =>
            e === POLARIS_FLOW_PLUGIN_NAME ||
            e.startsWith(`${POLARIS_FLOW_PLUGIN_NAME}-`) ||
            e.startsWith(POLARIS_PLUGIN_PREFIX),
        )
      ) {
        return true;
      }
      break;
  }

  return false;
}

/**
 * 在 skills 目录中查找 superpowers marker skill，命中则返回路径。
 */
async function findSuperpowersSkillsInDir(skillsDir: string): Promise<string | null> {
  if (!(await fileExists(skillsDir))) {
    return null;
  }
  for (const marker of SUPERPOWERS_MARKERS) {
    const markerPath = path.join(skillsDir, marker);
    const skillMd = path.join(markerPath, 'SKILL.md');
    if ((await fileExists(markerPath)) || (await fileExists(skillMd))) {
      return markerPath;
    }
  }
  return null;
}

/**
 * 在 skills 目录中查找 openspec-* 条目，命中则返回路径。
 */
async function findOpenspecSkillsInDir(skillsDir: string): Promise<string | null> {
  if (!(await fileExists(skillsDir))) {
    return null;
  }
  const entries = await readDir(skillsDir);
  const hit = entries.find((e) => e.startsWith('openspec-'));
  return hit ? path.join(skillsDir, hit) : null;
}

/**
 * 返回首个存在的目录。pattern 中至多一个星号，表示展开该层子目录。
 */
function firstExistingDir(patterns: string[]): string | null {
  for (const pattern of patterns) {
    const star = pattern.indexOf('*');
    if (star < 0) {
      if (fs.existsSync(pattern) && fs.statSync(pattern).isDirectory()) {
        return pattern;
      }
      continue;
    }
    const before = pattern.slice(0, star);
    const after = pattern.slice(star + 1).replace(/^\//, '');
    const globParent =
      before.endsWith('/') || before.endsWith(path.sep) ? before.slice(0, -1) : before;
    if (!fs.existsSync(globParent)) {
      continue;
    }
    try {
      for (const mid of fs.readdirSync(globParent)) {
        const full = path.join(globParent, mid, after);
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
          return full;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 在 Claude plugin cache 中查找 superpowers skills。
 */
async function findSuperpowersInPluginCache(cacheRoot: string): Promise<string | null> {
  if (!(await fileExists(cacheRoot))) {
    return null;
  }
  const marketplaces = await readDir(cacheRoot);
  for (const marketplace of marketplaces) {
    const superpowersDir = path.join(cacheRoot, marketplace, 'superpowers');
    if (!(await fileExists(superpowersDir))) {
      continue;
    }
    const versions = await readDir(superpowersDir);
    for (const version of versions) {
      const skillsDir = path.join(superpowersDir, version, 'skills');
      const hit = await findSuperpowersSkillsInDir(skillsDir);
      if (hit) {
        return hit;
      }
    }
  }
  return null;
}

/** which 探测命令是否在 PATH 中 */
function commandAvailable(command: string): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [command], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** 解析命令绝对路径 */
function resolveCommandPath(command: string): string {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(checker, [command], {
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return out.split(/\r?\n/)[0]?.trim() || command;
  } catch {
    return command;
  }
}

/** 读取 CLI --version 首行 */
function readCliVersion(command: string): string {
  try {
    const out = execFileSync(command, ['--version'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split(/\r?\n/)[0]?.trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function findSuperpowersGlobal(
  platform: Platform,
  home: string,
): Promise<PluginFindResult | null> {
  if (platform.id === 'claude') {
    const claudeConfig =
      home === os.homedir()
        ? process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude')
        : path.join(home, '.claude');
    const pluginPath = firstExistingDir([
      path.join(claudeConfig, 'plugins', 'superpowers'),
      path.join(home, '.claude', 'plugins', 'superpowers'),
    ]);
    if (pluginPath) {
      return { scope: 'global', kind: 'plugin', path: pluginPath };
    }
    const cacheHit = await findSuperpowersInPluginCache(
      path.join(claudeConfig, 'plugins', 'cache'),
    );
    if (cacheHit) {
      return { scope: 'global', kind: 'plugin-cache', path: cacheHit };
    }
  }

  if (platform.id === 'codebuddy') {
    const pluginPath = firstExistingDir([
      path.join(
        home,
        '.codebuddy',
        'plugins',
        'marketplaces',
        '*',
        'external_plugins',
        'superpowers',
      ),
    ]);
    if (pluginPath) {
      return { scope: 'global', kind: 'plugin', path: pluginPath };
    }
  }

  const configDir = platform.contextDir;
  const skillsHit = await findSuperpowersSkillsInDir(path.join(home, configDir, 'skills'));
  if (skillsHit) {
    return { scope: 'global', kind: 'skills', path: skillsHit };
  }
  return null;
}

async function findSuperpowersProject(
  platform: Platform,
  repoRoot: string,
): Promise<PluginFindResult | null> {
  const configDir = platform.contextDir;
  const skillsHit = await findSuperpowersSkillsInDir(path.join(repoRoot, configDir, 'skills'));
  if (skillsHit) {
    return { scope: 'project', kind: 'skills', path: skillsHit };
  }
  return null;
}

async function findOpenspecGlobal(
  platform: Platform,
  home: string,
  isCmdAvailable: (command: string) => boolean = commandAvailable,
): Promise<PluginFindResult | null> {
  if (isCmdAvailable('openspec')) {
    const cmdPath = resolveCommandPath('openspec');
    return {
      scope: 'global',
      kind: 'cli',
      path: cmdPath,
      variant: 'openspec',
      version: readCliVersion('openspec'),
    };
  }
  if (isCmdAvailable('openspec-cn')) {
    const cmdPath = resolveCommandPath('openspec-cn');
    return {
      scope: 'global',
      kind: 'cli',
      path: cmdPath,
      variant: 'openspec-cn',
      version: readCliVersion('openspec-cn'),
      warn: true,
    };
  }

  const configDir = platform.contextDir;
  const skillsHit = await findOpenspecSkillsInDir(path.join(home, configDir, 'skills'));
  if (skillsHit) {
    return { scope: 'global', kind: 'skills', path: skillsHit };
  }
  return null;
}

async function findOpenspecProject(
  platform: Platform,
  repoRoot: string,
): Promise<PluginFindResult | null> {
  const localOpenspec = path.join(repoRoot, 'node_modules', '.bin', 'openspec');
  if (await fileExists(localOpenspec)) {
    return {
      scope: 'project',
      kind: 'cli',
      path: localOpenspec,
      variant: 'openspec',
      version: readCliVersion(localOpenspec),
    };
  }
  const localCn = path.join(repoRoot, 'node_modules', '.bin', 'openspec-cn');
  if (await fileExists(localCn)) {
    return {
      scope: 'project',
      kind: 'cli',
      path: localCn,
      variant: 'openspec-cn',
      version: readCliVersion(localCn),
      warn: true,
    };
  }

  const configDir = platform.contextDir;
  const skillsHit = await findOpenspecSkillsInDir(path.join(repoRoot, configDir, 'skills'));
  if (skillsHit) {
    return { scope: 'project', kind: 'skills', path: skillsHit };
  }
  return null;
}

/**
 * 查找指定平台下的 plugin（global → project）。
 */
export async function findPlugin(
  platform: Platform,
  pluginName: PluginName,
  repoRoot: string,
  options: PluginPresenceOptions = {},
): Promise<PluginFindResult | null> {
  const homeDir = options.homeDir ?? os.homedir();
  const isCmd = options.isCommandAvailable ?? commandAvailable;
  if (pluginName === 'superpowers') {
    return (
      (await findSuperpowersGlobal(platform, homeDir)) ?? findSuperpowersProject(platform, repoRoot)
    );
  }
  return (
    (await findOpenspecGlobal(platform, homeDir, isCmd)) ?? findOpenspecProject(platform, repoRoot)
  );
}

/**
 * 检测 plugin 是否就绪；openspec-cn 仅找到时 found=true 但 ok=false（需别名告警）。
 */
export async function checkPluginPresence(
  platform: Platform,
  pluginName: PluginName,
  repoRoot: string,
  options: PluginPresenceOptions = {},
): Promise<PluginPresenceResult> {
  const result = await findPlugin(platform, pluginName, repoRoot, options);
  if (!result) {
    return { ok: false, found: false };
  }
  if (result.warn) {
    return { ok: false, found: true, result };
  }
  return { ok: true, found: true, result };
}

/**
 * 返回缺失时的安装提示行（不含前缀）。
 */
export function getInstallHints(platformId: string, pluginName: PluginName): string[] {
  if (pluginName === 'superpowers') {
    const hints: string[] = [];
    switch (platformId) {
      case 'claude':
        hints.push('  - Claude Code：Plugin 设置 → Add plugin → superpowers（要求 >= 4.0.0）');
        hints.push('  - 或：npx skills add obra/superpowers -a claude-code');
        break;
      case 'codebuddy':
        hints.push('  - CodeBuddy：Plugin Marketplace → 搜索 superpowers → Install');
        hints.push('  - 或：npx skills add obra/superpowers -a codebuddy');
        break;
      case 'trae':
        hints.push('  - Trae：npx skills add obra/superpowers -a trae');
        hints.push('  - 全局：写入 ~/.trae/skills/；项目级：在项目根执行');
        break;
      case 'qoder':
        hints.push('  - Qoder：npx skills add obra/superpowers -a qoder');
        hints.push('  - 全局：写入 ~/.qoder/skills/；项目级：在项目根执行');
        break;
      default:
        hints.push('  - Trae：执行 polaris install 选择 superpowers 插件');
        hints.push('  - CodeBuddy：打开 Plugin Marketplace → 搜索 superpowers → Install');
        hints.push('  - Claude Code：打开 plugin 设置 → Add plugin → superpowers');
        break;
    }
    hints.push('  - 详情：https://github.com/obra/superpowers');
    hints.push('（缺失不阻断会话，但 build/lock 等阶段的 subagent 派发将不可用）');
    return hints;
  }

  return [
    '接受以下任一上游（任一存在即视为通过）：',
    "  - 官方版：@fission-ai/openspec   → 二进制 'openspec'",
    "  - 社区版：@studyzy/openspec-cn   → 二进制 'openspec-cn'（中文/镜像）",
    '要求 Node.js >= 20.19.0',
    '安装方式（任选其一）：',
    '  - 官方全局：     npm install -g @fission-ai/openspec@latest',
    '  - 社区全局：     npm install -g @studyzy/openspec-cn',
    '  - pnpm 全局：    pnpm add -g @fission-ai/openspec   # 或 @studyzy/openspec-cn',
    '  - 临时使用：     npx -y @fission-ai/openspec <subcommand>',
    "安装后用 'openspec --version' 或 'openspec-cn --version' 验证",
    '详情：https://github.com/Fission-AI/OpenSpec  /  https://www.npmjs.com/package/@studyzy/openspec-cn',
    '（缺失不阻断会话，但 openspec 相关阶段会失败）',
  ];
}

export { detectPlatforms, hasSkills, getBaseDir };
