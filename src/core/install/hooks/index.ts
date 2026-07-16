/**
 * Polaris hooks 安装入口：按平台 hookFormat 写入宿主 settings。
 */
import path from 'path';

import { getPlatformSkillsDir, type Platform } from '../../platform/platforms.js';
import { readManifest } from '../manifest-reader.js';
import type { InstallScope } from '../../types.js';
import {
  installClaudeCodeHooks,
  installCopilotHooks,
  installGeminiHooks,
  installKiroHooks,
  installQwenStyleHooks,
  installWindsurfHooks,
} from './formats/index.js';

export { buildHookCommand, isManagedHookCommand } from './command.js';

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
