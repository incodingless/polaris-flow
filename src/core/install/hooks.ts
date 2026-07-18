/**
 * Polaris hooks 安装：按平台 hookFormat 把 hook 脚本写入宿主 settings。
 * 命令路径规范化复用 platform/layout.hookScriptPluginRel。
 */
import path from 'path';

import { ensureDir } from '../../utils/file-system.js';
import { updateJsonFile, writeJsonPretty } from '../../utils/json-io.js';
import { hookScriptPluginRel } from '../platform/layout.js';
import { getPlatformSkillsDir, type Platform } from '../platform/platforms.js';
import { readManifest, type HookConfig } from '../assets/manifest.js';
import type { InstallScope } from '../types.js';

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

  const hookFormat = platform.hookFormat;
  const skillsDir = getPlatformSkillsDir(platform, scope);
  const platformBase = path.join(baseDir, skillsDir);

  try {
    switch (hookFormat) {
      case 'claude-code':
        return installClaudeCodeHooks(platformBase, skillsDir, hooksConfig);
      case 'qwen':
      case 'qoder':
        return installQwenStyleHooks(platformBase, skillsDir, hooksConfig, hookFormat);
      case 'gemini':
        return installGeminiHooks(platformBase, skillsDir, hooksConfig);
      case 'windsurf':
        return installWindsurfHooks(platformBase, skillsDir, hooksConfig);
      case 'copilot':
        return installCopilotHooks(platformBase, skillsDir, hooksConfig);
      case 'kiro':
        return installKiroHooks(platformBase, skillsDir, hooksConfig);
      default:
        return { installed: false, reason: `unsupported hook format: ${hookFormat}` };
    }
  } catch (err) {
    return { installed: false, reason: (err as Error).message };
  }
}

/** Claude Code / Codex：写入 settings.local.json 的 PreToolUse */
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

/** Qwen / Qoder：写入 settings.json 的 PreToolUse（含 description） */
async function installQwenStyleHooks(
  platformBase: string,
  skillsDir: string,
  hooksConfig: Record<string, HookConfig>,
  _hookFormat: string,
): Promise<{ installed: boolean; reason?: string }> {
  const settingsPath = path.join(platformBase, 'settings.json');

  const matcherGroups: Record<
    string,
    Array<{ type: string; command: string; description: string }>
  > = {};
  for (const [scriptRelPath, config] of Object.entries(hooksConfig)) {
    if (!matcherGroups[config.matcher]) {
      matcherGroups[config.matcher] = [];
    }
    matcherGroups[config.matcher].push({
      type: 'command',
      command: buildHookCommand(skillsDir, scriptRelPath),
      description: config.description,
    });
  }

  const preToolUseEntries = Object.entries(matcherGroups).map(([matcher, hooks]) => ({
    matcher,
    hooks,
  }));

  await updateJsonFile(settingsPath, (settings) => {
    const existingHooks = (settings.hooks as Record<string, unknown>) ?? {};
    const existingPreToolUse = asHookGroup(existingHooks.PreToolUse);
    const merged = mergeHookGroups(existingPreToolUse, preToolUseEntries, Object.keys(hooksConfig));
    settings.hooks = { ...existingHooks, PreToolUse: merged };
  });
  return { installed: true };
}

/** Gemini CLI：写入 settings.json 的 BeforeTool，matcher 转写 */
async function installGeminiHooks(
  platformBase: string,
  skillsDir: string,
  hooksConfig: Record<string, HookConfig>,
): Promise<{ installed: boolean; reason?: string }> {
  const settingsPath = path.join(platformBase, 'settings.json');

  const entries: Array<{
    matcher: string;
    hooks: Array<{ type: string; command: string; name: string }>;
  }> = [];
  for (const [scriptRelPath, config] of Object.entries(hooksConfig)) {
    entries.push({
      matcher: config.matcher === 'Write|Edit' ? 'write_file|edit_file' : config.matcher,
      hooks: [
        {
          type: 'command',
          command: buildHookCommand(skillsDir, scriptRelPath),
          name: config.description,
        },
      ],
    });
  }

  await updateJsonFile(settingsPath, (settings) => {
    const existingHooks = (settings.hooks as Record<string, unknown>) ?? {};
    const existingBeforeTool = asHookGroup(existingHooks.BeforeTool);
    const merged = mergeHookGroups(existingBeforeTool, entries, Object.keys(hooksConfig));
    settings.hooks = { ...existingHooks, BeforeTool: merged };
  });
  return { installed: true };
}

/** Windsurf：写入 hooks.json 的 pre_write_code（扁平结构，不分组） */
async function installWindsurfHooks(
  platformBase: string,
  skillsDir: string,
  hooksConfig: Record<string, HookConfig>,
): Promise<{ installed: boolean; reason?: string }> {
  const hooksPath = path.join(platformBase, 'hooks.json');

  const entries: Array<{ command: string; show_output: boolean }> = [];
  for (const [scriptRelPath] of Object.entries(hooksConfig)) {
    entries.push({
      command: buildHookCommand(skillsDir, scriptRelPath),
      show_output: true,
    });
  }

  await updateJsonFile(hooksPath, (hooksFile) => {
    const existingHooks = (hooksFile.hooks as Record<string, unknown>) ?? {};
    const existingPreWrite = asHookGroup(existingHooks.pre_write_code);
    const merged = existingPreWrite.filter(
      (entry) => !isManagedHookCommand(entry.command, Object.keys(hooksConfig)),
    );
    merged.push(...entries);
    hooksFile.hooks = { ...existingHooks, pre_write_code: merged };
  });
  return { installed: true };
}

/** GitHub Copilot：写入 hooks/polaris-guard.json（bash + powershell 双命令） */
async function installCopilotHooks(
  platformBase: string,
  skillsDir: string,
  hooksConfig: Record<string, HookConfig>,
): Promise<{ installed: boolean; reason?: string }> {
  const hooksDir = path.join(platformBase, 'hooks');
  const hookFilePath = path.join(hooksDir, 'polaris-guard.json');

  const scriptEntries: Array<{ bash: string; powershell: string }> = [];
  for (const [scriptRelPath] of Object.entries(hooksConfig)) {
    const cmd = buildHookCommand(skillsDir, scriptRelPath);
    scriptEntries.push({ bash: cmd, powershell: `bash -c '${cmd}'` });
  }

  await writeJsonPretty(hookFilePath, {
    version: 1,
    hooks: { preToolUse: scriptEntries },
  });
  return { installed: true };
}

/** Kiro：为每个脚本写入 hooks/*.kiro.hook */
async function installKiroHooks(
  platformBase: string,
  skillsDir: string,
  hooksConfig: Record<string, HookConfig>,
): Promise<{ installed: boolean; reason?: string }> {
  const hooksDir = path.join(platformBase, 'hooks');
  await ensureDir(hooksDir);

  for (const [scriptRelPath, config] of Object.entries(hooksConfig)) {
    const hookFileName = path.basename(scriptRelPath).replace(/\.sh$/, '.kiro.hook');
    const hookFilePath = path.join(hooksDir, hookFileName);
    const toolName = config.matcher === 'Write|Edit' ? 'write' : '*';

    await writeJsonPretty(hookFilePath, {
      enabled: true,
      name: config.description,
      description: config.description,
      version: '1',
      when: { type: 'preToolUse', toolName },
      then: {
        type: 'runCommand',
        command: buildHookCommand(skillsDir, scriptRelPath),
      },
    });
  }

  return { installed: true };
}
