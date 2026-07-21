/**
 * Polaris hooks 安装：按平台 hookFormat 把 hook 脚本写入宿主 settings。
 * 命令路径规范化复用 platform/layout.hookScriptPluginRel。
 */
import path from 'path';

import { updateJsonFile } from '../../utils/json-io.js';
import { hookScriptPluginRel } from '../platform/layout.js';
import { getPlatformSkillsDir, type Platform } from '../platform/platforms.js';
import { readManifest, type HookConfig } from '../assets/manifest.js';
import type { InstallScope } from '../config/polaris-config.js';

/** 根据 manifest 相对路径与 skillsDir 生成 hook 可执行命令 */
export function buildHookCommand(skillsDir: string, scriptRelPath: string): string {
  const hookRel = hookScriptPluginRel(scriptRelPath);
  return `bash ${skillsDir}/skills/polaris-flow/${hookRel}`;
}

/** 判断 settings 中的 command 是否为本 manifest 管理的 Polaris hook */
export function isManagedHookCommand(command: unknown, scriptRelPaths: string[]): boolean {
  if (typeof command !== 'string') return false;

  const commandPath = command
    .trim()
    .match(/^bash\s+["']?([^"'\s]+)["']?(?:\s|$)/)?.[1]
    ?.replace(/\\/g, '/');
  if (!commandPath) return false;

  return scriptRelPaths.some((scriptRelPath) => {
    const hookRel = hookScriptPluginRel(scriptRelPath);
    const normalized = scriptRelPath.replace(/\\/g, '/');
    return (
      commandPath.endsWith(`/skills/polaris-flow/${hookRel}`) ||
      // 兼容旧路径 skills/hooks/...
      commandPath.endsWith(`/skills/${normalized}`)
    );
  });
}

/** 合并 hooks 分组：先剔除本 manifest 已管条目，再追加新组 */
function mergeHookGroups<T extends { command: string }>(
  existingGroups: Array<Record<string, unknown>>,
  newGroups: Array<{ matcher: string; hooks: T[] }>,
  scriptRelPaths: string[],
): Array<Record<string, unknown>> {
  const mergedGroups = existingGroups.flatMap((group) => {
    if (!Array.isArray(group.hooks)) return [group];

    const hooks = group.hooks.filter(
      (hook) => !isManagedHookCommand((hook as Record<string, unknown>).command, scriptRelPaths),
    );
    if (hooks.length === 0 && group.hooks.length > 0) return [];

    return [{ ...group, hooks }];
  });

  for (const newGroup of newGroups) {
    const existingGroup = mergedGroups.find(
      (group) => group.matcher === newGroup.matcher && Array.isArray(group.hooks),
    );
    if (existingGroup) {
      existingGroup.hooks = [...(existingGroup.hooks as unknown[]), ...newGroup.hooks];
    } else {
      mergedGroups.push(newGroup);
    }
  }

  return mergedGroups;
}

/** 将解析出的 hooks 分组规范为数组。非数组一律视为空以免下游抛错 */
function asHookGroup(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

/** 按平台 hookFormat 安装 Polaris hooks；不支持时返回 reason */
export async function installPolarisHooksForPlatform(
  baseDir: string,
  platform: Platform,
  scope: InstallScope = 'project',
): Promise<{ installed: boolean; reason?: string }> {
  if (!platform.supportsHooks || !platform.hookFormat) {
    return { installed: false, reason: 'platform does not support hooks' };
  }

  const manifest = await readManifest();
  const hooksConfig = manifest.hooks;
  if (!hooksConfig || Object.keys(hooksConfig).length === 0) {
    return { installed: false, reason: 'no hooks defined in manifest' };
  }

  const skillsDir = getPlatformSkillsDir(platform, scope);
  const platformBase = path.join(baseDir, skillsDir);

  try {
    if (platform.hookFormat === 'claude-code') {
      return installClaudeCodeHooks(platformBase, skillsDir, hooksConfig);
    }
    return { installed: false, reason: `unsupported hook format: ${platform.hookFormat}` };
  } catch (err) {
    return { installed: false, reason: (err as Error).message };
  }
}

/** Claude Code：写入 settings.local.json 的 PreToolUse */
async function installClaudeCodeHooks(
  platformBase: string,
  skillsDir: string,
  hooksConfig: Record<string, HookConfig>,
): Promise<{ installed: boolean; reason?: string }> {
  const settingsPath = path.join(platformBase, 'settings.local.json');

  const matcherGroups: Record<string, Array<{ type: string; command: string }>> = {};
  for (const [scriptRelPath, config] of Object.entries(hooksConfig)) {
    const command = buildHookCommand(skillsDir, scriptRelPath);
    if (!matcherGroups[config.matcher]) {
      matcherGroups[config.matcher] = [];
    }
    matcherGroups[config.matcher].push({ type: 'command', command });
  }

  const newEntries = Object.entries(matcherGroups).map(([matcher, hooks]) => ({ matcher, hooks }));

  await updateJsonFile(settingsPath, (settings) => {
    const existingHooks = (settings.hooks as Record<string, unknown>) ?? {};
    const existingPreToolUse = asHookGroup(existingHooks.PreToolUse);
    const merged = mergeHookGroups(existingPreToolUse, newEntries, Object.keys(hooksConfig));
    settings.hooks = { ...existingHooks, PreToolUse: merged };
  });
  return { installed: true };
}
