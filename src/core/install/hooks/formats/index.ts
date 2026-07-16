/**
 * 各宿主 hook 配置写入实现（claude-code / qwen / gemini / windsurf / copilot / kiro）。
 */
import path from 'path';

import { ensureDir } from '../../../../utils/file-system.js';
import type { HookConfig } from '../../../assets/manifest.js';
import {
  asHookGroup,
  buildHookCommand,
  isManagedHookCommand,
  mergeHookGroups,
} from '../command.js';
import { updateJsonFile, writeJsonPretty } from '../json-io.js';

/** Claude Code / Codex：写入 settings.local.json 的 PreToolUse */
export async function installClaudeCodeHooks(
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

/** Qwen / Qoder：写入 settings.json 的 PreToolUse */
export async function installQwenStyleHooks(
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

/** Gemini CLI：写入 settings.json 的 BeforeTool */
export async function installGeminiHooks(
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

/** Windsurf：写入 hooks.json 的 pre_write_code */
export async function installWindsurfHooks(
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

/** GitHub Copilot：写入 hooks/polaris-guard.json */
export async function installCopilotHooks(
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
export async function installKiroHooks(
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
