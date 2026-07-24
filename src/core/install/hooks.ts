/**
 * Polaris hooks 安装：按平台 hookFormat 把 hook 脚本写入宿主 settings。
 * 命令路径规范化复用 platform/layout.hookScriptPluginRel。
 */
import path from 'path';

import {
  readJsonFile,
  readJsonObjectOrEmpty,
  updateJsonFile,
  writeJsonPretty,
} from '../../utils/json-io.js';
import { hookScriptPluginRel } from '../assets/layout.js';
import { getPlatformContextDir, type Platform } from '../platforms.js';
import { readManifest, type HookConfig, Asset } from '../assets/manifest.js';
import type { InstallScope } from '../config/polaris-config.js';

/** 按平台 hookFormat 安装 Polaris hooks；不支持时返回 reason */
export async function installPolarisHooksForPlatform(
  baseDir: string,
  platform: Platform,
  scope: InstallScope = 'project',
  asset: Asset,
): Promise<{ installed: boolean; reason?: string }> {
  if (!platform.supportsHooks || !platform.hookFormat) {
    return { installed: false, reason: 'platform does not support hooks' };
  }

  const hookFiles = asset.langContentPaths.filter(
    (p) => p.startsWith('hooks/') && p.endsWith('.json'),
  );
  try {
    const hooksConfig = await adaptHooksConfig(hookFiles);
    await writeJsonPretty(path.join(baseDir, platform.hooksConfigFile), hooksConfig);
    return { installed: true };
  } catch (err) {
    return { installed: false, reason: (err as Error).message };
  }
}

export async function adaptHooksConfig(hookFiles: string[]): Promise<Record<string, HookConfig>> {
  const hooksConfig: Record<string, HookConfig> = {};
  for (const hookFile of hookFiles) {
    const hookConfig = await readJsonObjectOrEmpty(path.join(baseDir, hookFile));
    hooksConfig[hookFile] = hookConfig;
  }
  return hooksConfig;
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
